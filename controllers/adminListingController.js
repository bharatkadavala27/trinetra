const Company = require('../models/Company');
const AdminAuditLog = require('../models/AdminAuditLog');
const User = require('../models/User');
const nodemailer = require('nodemailer');

// Configure nodemailer
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// ==================== LISTING LIST & FILTERS ====================

// @desc    Get all listings with filters and sorting
// @route   GET /api/admin/listings
exports.getAllListingsAdmin = async (req, res) => {
    try {
        const { 
            search, 
            status, 
            category, 
            city, 
            plan,
            sortBy = '-createdAt', 
            page = 1, 
            limit = 20
        } = req.query;

        let query = {};

        // Search by business name, phone, or owner email
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // Filter by status
        if (status) {
            // Handle special filter for pending approval
            if (status === 'PendingApproval') {
                query.status = 'Pending';
            } else {
                query.status = status;
            }
        }

        // Filter by category
        if (category) {
            query.category_id = category;
        }

        // Filter by city
        if (city) {
            query.city_id = city;
        }

        // Filter by plan
        if (plan) {
            query.plan = plan;
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build sort
        const sortObj = {};
        if (sortBy.startsWith('-')) {
            sortObj[sortBy.substring(1)] = -1;
        } else {
            sortObj[sortBy] = 1;
        }

        // For pending approval, sort by oldest first
        if (status === 'PendingApproval') {
            sortObj.createdAt = 1;
        }

        const listings = await Company.find(query)
            .populate('owner', 'name email')
            .populate('category_id', 'name')
            .populate('city_id', 'name')
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Company.countDocuments(query);

        res.json({
            success: true,
            listings,
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

// ==================== LISTING DETAIL & APPROVAL ====================

// @desc    Get listing detail for approval/review
// @route   GET /api/admin/listings/:id
exports.getListingDetailAdmin = async (req, res) => {
    try {
        const listing = await Company.findById(req.params.id)
            .populate('owner', 'name email phone')
            .populate('category_id', 'name')
            .populate('city_id', 'name')
            .populate('changeHistory.changedBy', 'name email');

        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        // Get reviews for this listing
        const Review = require('../models/Review');
        const reviews = await Review.find({ businessId: listing._id })
            .populate('userId', 'name')
            .select('rating comment status createdAt')
            .limit(20);

        res.json({
            success: true,
            listing,
            reviews,
            reviewStats: {
                totalReviews: reviews.length,
                averageRating: listing.rating,
                pendingReviews: reviews.filter(r => r.status === 'Pending').length
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== LISTING APPROVAL WORKFLOW ====================

// @desc    Approve listing
// @route   PUT /api/admin/listings/:id/approve
exports.approveListing = async (req, res) => {
    try {
        const listing = await Company.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        const oldStatus = listing.status;
        listing.status = 'Approved';
        listing.approvalStatus.stage = 'Approved';
        listing.approvalStatus.reviewedBy = req.user._id;
        listing.approvalStatus.reviewedAt = new Date();
        await listing.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'LISTING_APPROVED',
            targetType: 'Listing',
            targetId: listing._id,
            changes: {
                before: { status: oldStatus },
                after: { status: 'Approved' }
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        // Send email to owner
        if (listing.email) {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: listing.email,
                subject: 'Your Listing Has Been Approved',
                html: `<h2>Listing Approved</h2><p>Your business listing "${listing.name}" has been approved and is now live on our platform.</p>`
            };
            transporter.sendMail(mailOptions, (err) => {
                if (err) console.error('Email send error:', err);
            });
        }

        res.json({ success: true, msg: 'Listing approved successfully', listing });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Reject listing
// @route   PUT /api/admin/listings/:id/reject
exports.rejectListing = async (req, res) => {
    try {
        const { reason } = req.body;

        if (!reason) {
            return res.status(400).json({ success: false, msg: 'Rejection reason is required' });
        }

        const listing = await Company.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        const oldStatus = listing.status;
        listing.status = 'Rejected';
        listing.approvalStatus.stage = 'Rejected';
        listing.approvalStatus.reviewedBy = req.user._id;
        listing.approvalStatus.reviewedAt = new Date();
        listing.approvalStatus.rejectionReason = reason;
        await listing.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'LISTING_REJECTED',
            targetType: 'Listing',
            targetId: listing._id,
            changes: {
                before: { status: oldStatus },
                after: { status: 'Rejected', reason }
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        // Send email notification
        if (listing.email) {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: listing.email,
                subject: 'Your Listing Was Not Approved',
                html: `<h2>Listing Not Approved</h2><p>Your business listing application was not approved.</p><p><strong>Reason:</strong> ${reason}</p>`
            };
            transporter.sendMail(mailOptions, (err) => {
                if (err) console.error('Email send error:', err);
            });
        }

        res.json({ success: true, msg: 'Listing rejected successfully', listing });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Request more info from merchant
// @route   PUT /api/admin/listings/:id/request-info
exports.requestMoreInfo = async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, msg: 'Message is required' });
        }

        const listing = await Company.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        listing.approvalStatus.stage = 'MoreInfoRequested';
        listing.approvalStatus.moreInfoRequestedAt = new Date();
        listing.approvalStatus.moreInfoMessage = message;
        await listing.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'LISTING_INFO_REQUESTED',
            targetType: 'Listing',
            targetId: listing._id,
            notes: message,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, msg: 'Info request sent to merchant', listing });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== LISTING ACTIONS ====================

// @desc    Verify business badge (blue tick)
// @route   PUT /api/admin/listings/:id/verify-badge
exports.verifyBusinessBadge = async (req, res) => {
    try {
        const listing = await Company.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        listing.businessBadgeVerified = true;
        listing.badgeVerifiedBy = req.user._id;
        listing.badgeVerifiedAt = new Date();
        await listing.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'LISTING_EDITED',
            targetType: 'Listing',
            targetId: listing._id,
            notes: 'Business badge verified',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, msg: 'Business badge verified', listing });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Flag listing as spam/inappropriate
// @route   PUT /api/admin/listings/:id/flag
exports.flagListing = async (req, res) => {
    try {
        const { reason, description } = req.body;

        if (!reason) {
            return res.status(400).json({ success: false, msg: 'Flag reason is required' });
        }

        const listing = await Company.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        listing.flags.push({
            reason,
            description,
            flaggedBy: req.user._id,
            flaggedAt: new Date()
        });
        listing.isFlagged = true;
        listing.status = 'Flagged';
        await listing.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'LISTING_FLAGGED',
            targetType: 'Listing',
            targetId: listing._id,
            notes: `${reason}: ${description || ''}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, msg: 'Listing flagged successfully', listing });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Suspend listing (hidden from public)
// @route   PUT /api/admin/listings/:id/suspend
exports.suspendListing = async (req, res) => {
    try {
        const { reason } = req.body;

        const listing = await Company.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        listing.status = 'Suspended';
        listing.suspensionDetails = {
            reason,
            suspendedBy: req.user._id,
            suspendedAt: new Date(),
            notificationSent: false
        };
        await listing.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'LISTING_SUSPENDED',
            targetType: 'Listing',
            targetId: listing._id,
            notes: reason,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, msg: 'Listing suspended successfully', listing });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Delete listing permanently
// @route   DELETE /api/admin/listings/:id
exports.deleteListing = async (req, res) => {
    try {
        const listing = await Company.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        await Company.findByIdAndDelete(req.params.id);

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'LISTING_DELETED',
            targetType: 'Listing',
            targetId: req.params.id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, msg: 'Listing deleted permanently' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Check for duplicate listings
// @route   GET /api/admin/listings/:id/check-duplicates
exports.checkDuplicates = async (req, res) => {
    try {
        const listing = await Company.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        // Find listings with same phone or email
        const duplicates = await Company.find({
            _id: { $ne: listing._id },
            $or: [
                { phone: listing.phone },
                { email: listing.email },
                { name: { $regex: listing.name, $options: 'i' } }
            ]
        }).select('name phone email city_id');

        res.json({
            success: true,
            duplicates,
            hasPossibleDuplicates: duplicates.length > 0
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};
