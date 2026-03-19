const Enquiry = require('../models/Enquiry');
const User = require('../models/User');
const Company = require('../models/Company');
const nodemailer = require('nodemailer');
const { sendNotification } = require('../services/notificationService');

// Configure nodemailer
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// Track enquiry sent timestamps for rate limiting
const enquirySentTime = {};

// ==================== SEND ENQUIRY ====================

// @desc    Create new enquiry
// @route   POST /api/enquiries
// @body    { businessIds, name, phone, message, email }
exports.createEnquiry = async (req, res) => {
    try {
        const { businessIds, name, phone, message, email } = req.body;

        // Validate required fields
        if (!businessIds || !Array.isArray(businessIds) || businessIds.length === 0) {
            return res.status(400).json({ success: false, msg: 'At least one business is required' });
        }
        if (!name || !phone || !message) {
            return res.status(400).json({ success: false, msg: 'Name, phone, and message are required' });
        }

        // Rate limiting - max 5 enquiries per hour per user/IP
        const identifier = req.user ? req.user._id : req.ip;
        const key = `enquiry_${identifier}`;
        
        if (!enquirySentTime[key]) {
            enquirySentTime[key] = [];
        }

        // Clean up timestamps older than 1 hour
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        enquirySentTime[key] = enquirySentTime[key].filter(time => time > oneHourAgo);

        if (enquirySentTime[key].length >= 5) {
            return res.status(429).json({
                success: false,
                msg: 'Too many enquiries. Maximum 5 per hour allowed.'
            });
        }

        // Record this enquiry
        enquirySentTime[key].push(Date.now());

        // Validate businesses exist
        const businesses = await Company.find({ _id: { $in: businessIds } });
        if (businesses.length === 0) {
            return res.status(404).json({ success: false, msg: 'No valid businesses found' });
        }

        // Create enquiry
        const enquiry = new Enquiry({
            userId: req.user ? req.user._id : null,
            businessIds,
            name,
            phone,
            email: email || (req.user ? req.user.email : null),
            message,
            source: req.body.source || 'Direct',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'Sent'
        });

        await enquiry.save();

        // Populate for response
        await enquiry.populate('businessIds', 'name email phone');

        // Send auto-reply to user
        if (enquiry.email) {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: enquiry.email,
                subject: 'We Received Your Enquiry',
                html: `<h2>Enquiry Confirmation</h2><p>Thank you for your enquiry. We have received your message and will respond shortly.</p><p><strong>Reference ID:</strong> ${enquiry._id}</p>`
            };
            transporter.sendMail(mailOptions, (err) => {
                if (err) console.error('Email send error:', err);
            });
        }

        // Send In-app & Multi-channel notifications to Managers of these businesses
        for (const business of businesses) {
            if (business.owner) {
                await sendNotification({
                    recipientId: business.owner,
                    senderId: req.user ? req.user._id : null,
                    type: 'SYSTEM',
                    title: 'New Enquiry Received',
                    message: `${name} sent a new enquiry for ${business.name}`,
                    link: `/merchant/leads/${enquiry._id}`,
                    metadata: { enquiryId: enquiry._id, businessId: business._id }
                });
            }
        }

        // Send to merchant inbox (would integrate with lead system)
        // For now, just mark status as available for merchant to see

        res.status(201).json({
            success: true,
            msg: 'Enquiry sent successfully',
            enquiry
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== ENQUIRY HISTORY ====================

// @desc    Get user's enquiries
// @route   GET /api/enquiries/my-enquiries
exports.getUserEnquiries = async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;

        let query = { userId: req.user._id, isDeleted: false };
        if (status) query.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const enquiries = await Enquiry.find(query)
            .populate('businessIds', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Enquiry.countDocuments(query);

        res.json({
            success: true,
            enquiries,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== ENQUIRY DETAIL & TRACKING ====================

// @desc    Get single enquiry with responses
// @route   GET /api/enquiries/:id
exports.getEnquiryDetail = async (req, res) => {
    try {
        const enquiry = await Enquiry.findById(req.params.id)
            .populate('businessIds', 'name email phone')
            .populate('responses.businessId', 'name email phone')
            .populate('responses.respondedBy', 'name');

        if (!enquiry) {
            return res.status(404).json({ success: false, msg: 'Enquiry not found' });
        }

        // Check authorization - only creator or merchant can view
        if (enquiry.userId.toString() !== req.user._id.toString() && 
            !enquiry.businessIds.some(bid => bid._id === req.user._id)) {
            return res.status(403).json({ success: false, msg: 'Unauthorized' });
        }

        res.json({ success: true, enquiry });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Delete enquiry (soft delete)
// @route   DELETE /api/enquiries/:id
exports.deleteEnquiry = async (req, res) => {
    try {
        const enquiry = await Enquiry.findById(req.params.id);
        if (!enquiry) {
            return res.status(404).json({ success: false, msg: 'Enquiry not found' });
        }

        // Only creator can delete
        if (enquiry.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, msg: 'Unauthorized' });
        }

        enquiry.isDeleted = true;
        enquiry.deletedAt = new Date();
        await enquiry.save();

        res.json({ success: true, msg: 'Enquiry deleted' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Mark enquiry as resolved
// @route   PUT /api/enquiries/:id/resolve
exports.resolveEnquiry = async (req, res) => {
    try {
        const enquiry = await Enquiry.findById(req.params.id);
        if (!enquiry) {
            return res.status(404).json({ success: false, msg: 'Enquiry not found' });
        }

        // Only creator can mark as resolved
        if (enquiry.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, msg: 'Unauthorized' });
        }

        enquiry.status = 'Resolved';
        enquiry.resolvedAt = new Date();
        enquiry.resolvedBy = 'User';
        await enquiry.save();

        // Notify Merchants that the enquiry is resolved
        for (const businessId of enquiry.businessIds) {
            const business = await Company.findById(businessId);
            if (business && business.owner) {
                await sendNotification({
                    recipientId: business.owner,
                    senderId: req.user._id,
                    type: 'SYSTEM',
                    title: 'Enquiry Resolved',
                    message: `Enquiry #${enquiry._id.toString().slice(-6)} has been marked as resolved by the user.`,
                    link: `/merchant/leads/${enquiry._id}`,
                    metadata: { enquiryId: enquiry._id }
                });
            }
        }

        res.json({ success: true, msg: 'Enquiry marked as resolved', enquiry });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== MERCHANT INBOX ====================

// @desc    Get merchant's enquiry inbox
// @route   GET /api/enquiries/merchant/inbox
exports.getMerchantInbox = async (req, res) => {
    try {
        const { page = 1, limit = 20, status, sortBy = '-createdAt' } = req.query;

        // Get all businesses owned by merchant
        const businesses = await Company.find({ owner: req.user._id });
        const businessIds = businesses.map(b => b._id);

        if (businessIds.length === 0) {
            return res.json({ success: true, enquiries: [], pagination: { total: 0 } });
        }

        let query = {
            businessIds: { $in: businessIds },
            isDeleted: false
        };

        if (status) query.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const sortObj = {};
        if (sortBy.startsWith('-')) {
            sortObj[sortBy.substring(1)] = -1;
        } else {
            sortObj[sortBy] = 1;
        }

        const enquiries = await Enquiry.find(query)
            .populate('userId', 'name email phone')
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Enquiry.countDocuments(query);

        // Count unread
        const unreadCount = await Enquiry.countDocuments({
            ...query,
            status: 'Sent'
        });

        res.json({
            success: true,
            enquiries,
            unreadCount,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== MERCHANT RESPONSES ====================

// @desc    Reply to enquiry
// @route   POST /api/enquiries/:id/reply
exports.replyToEnquiry = async (req, res) => {
    try {
        const { businessId, message, respondedBy } = req.body;

        const enquiry = await Enquiry.findById(req.params.id);
        if (!enquiry) {
            return res.status(404).json({ success: false, msg: 'Enquiry not found' });
        }

        // Check if merchant owns the business
        const business = await Company.findById(businessId);
        if (!business || business.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, msg: 'Unauthorized' });
        }

        // Add response
        enquiry.responses.push({
            businessId,
            message,
            respondedAt: new Date(),
            respondedBy: req.user._id
        });

        // Update status
        enquiry.status = 'Responded';

        await enquiry.save();
        await enquiry.populate('responses.businessId', 'name');

        // Notify User about the reply
        if (enquiry.userId) {
            await sendNotification({
                recipientId: enquiry.userId,
                senderId: req.user._id,
                type: 'SYSTEM',
                title: 'New Reply to Your Enquiry',
                message: `${business.name} has responded to your enquiry.`,
                link: `/profile/enquiries`, // Link to user's enquiry history
                metadata: { enquiryId: enquiry._id, businessId: business._id }
            });
        }

        res.json({ success: true, msg: 'Reply sent', enquiry });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Mark enquiry as spam
// @route   PUT /api/enquiries/:id/mark-spam
exports.markEnquiryAsSpam = async (req, res) => {
    try {
        const enquiry = await Enquiry.findById(req.params.id);
        if (!enquiry) {
            return res.status(404).json({ success: false, msg: 'Enquiry not found' });
        }

        // Check authorization
        const businesses = await Company.find({ owner: req.user._id });
        const businessIds = businesses.map(b => b._id.toString());
        
        const isOwner = enquiry.businessIds.some(bid => businessIds.includes(bid.toString()));
        if (!isOwner) {
            return res.status(403).json({ success: false, msg: 'Unauthorized' });
        }

        enquiry.isDeleted = true;
        enquiry.deletedAt = new Date();
        await enquiry.save();

        res.json({ success: true, msg: 'Enquiry marked as spam' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// All functions exported via exports.functionName pattern above
