const Lead = require('../models/Lead');
const Company = require('../models/Company');
const User = require('../models/User');
const sendEmail = require('../utils/email');

// Create a new lead (enquiry)
exports.createLead = async (req, res) => {
    try {
        const { name, phone, category, type, businessId, agreedToPrivacy, source } = req.body;
        if (!name || !phone) {
            return res.status(400).json({ success: false, message: 'Name and phone are required.' });
        }

        // Duplicate Check (Same phone + category in last 12 hours)
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
        const duplicate = await Lead.findOne({
            phone,
            category,
            createdAt: { $gt: twelveHoursAgo }
        });

        if (duplicate) {
            return res.status(400).json({ 
                success: false, 
                message: 'You have already submitted an enquiry for this category recently. Our team will contact you soon.' 
            });
        }

        const lead = new Lead({
            name,
            phone,
            category,
            type,
            business: businessId || null,
            agreedToPrivacy: !!agreedToPrivacy,
            source: source || 'Web Results'
        });

        // Simple Auto Distribution Logic
        if (category) {
            // Find a merchant with companies in this category who has the best performance score
            const merchant = await User.findOne({ 
                role: 'Merchant', 
                status: 'Active' 
            }).sort({ performanceScore: -1 });

            if (merchant) {
                lead.assignedTo = merchant._id;
                lead.assignedToName = merchant.name;
                lead.assignmentHistory.push({
                    assignedTo: merchant.name,
                    assignedBy: 'System Auto-Distribute'
                });
                
                // Update merchant stats (using findByIdAndUpdate to avoid password validation issues)
                await User.findByIdAndUpdate(merchant._id, {
                    $inc: { 'leadStats.totalAssigned': 1 }
                });

                // Send Notification
                await sendEmail({
                    email: merchant.email,
                    subject: 'New Lead Auto-Assigned!',
                    message: `Hello ${merchant.name}, a new lead for ${category} has been automatically assigned to you. Log in to your dashboard to view details.`,
                    html: `<h3>New Lead Assigned</h3><p>Hello ${merchant.name},</p><p>A new lead for <b>${category}</b> has been automatically assigned to you based on your performance score.</p><p>Please <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/brand/leads">login here</a> to view details.</p>`
                });
            }
        }

        await lead.save();
        res.status(201).json({ success: true, lead });
    } catch (err) {
        console.error('Create Lead Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get all leads (admin)
exports.getLeads = async (req, res) => {
    try {
        const { userId } = req.query;
        let query = {};
        if (userId) query.userId = userId;
        
        const leads = await Lead.find(query)
            .sort({ createdAt: -1 })
            .populate('business')
            .populate('assignedTo', 'name email');
        res.json({ success: true, leads });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Update lead status/priority/followUp (admin)
exports.updateLeadStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, priority, followUpDate } = req.body;
        
        const lead = await Lead.findById(id);
        if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

        // Response Time Tracking Logic
        if (status && lead.status === 'New' && status !== 'New') {
            lead.firstContactAt = new Date();
            const diffMs = lead.firstContactAt - lead.createdAt;
            lead.responseTime = Math.round(diffMs / 60000); // Minutes

            // Update Merchant Performance
            if (lead.assignedTo) {
                const user = await User.findById(lead.assignedTo);
                if (user) {
                    const totalL = user.leadStats.totalAssigned || 1;
                    const prevAvg = user.leadStats.avgResponseTime || 0;
                    await User.findByIdAndUpdate(user._id, {
                        'leadStats.avgResponseTime': Math.round((prevAvg * (totalL - 1) + lead.responseTime) / totalL),
                        $inc: { performanceScore: lead.responseTime < 60 ? 5 : lead.responseTime > 300 ? -2 : 0 }
                    });
                }
            }
        }

        // Conversion Tracking
        if (status === 'Converted' && lead.status !== 'Converted' && lead.assignedTo) {
            await User.findByIdAndUpdate(lead.assignedTo, {
                $inc: { 'leadStats.totalConverted': 1, performanceScore: 50 }
            });
        }

        if (status) lead.status = status;
        if (priority) lead.priority = priority;
        if (followUpDate) lead.followUpDate = followUpDate;
        
        if (req.body.merchantReply) {
            lead.merchantReply = {
                text: req.body.merchantReply,
                date: new Date()
            };
        }

        await lead.save();
        res.json({ success: true, lead });
    } catch (err) {
        console.error('Update Lead Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Add note to lead (admin)
exports.addNote = async (req, res) => {
    try {
        const { id } = req.params;
        const { text } = req.body;
        
        if (!text) return res.status(400).json({ success: false, message: 'Note text is required' });

        const lead = await Lead.findById(id);
        if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

        lead.notes.push({
            text,
            addedBy: req.user ? req.user.name : 'Admin'
        });

        await lead.save();
        res.json({ success: true, lead });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Assign lead (admin)
exports.assignLead = async (req, res) => {
    try {
        const { id } = req.params;
        const { assignedTo, assignedToName } = req.body;

        const lead = await Lead.findById(id);
        if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

        lead.assignedTo = assignedTo; // ObjectId
        lead.assignedToName = assignedToName;
        lead.assignmentHistory.push({
            assignedTo: assignedToName,
            assignedBy: req.user ? req.user.name : 'Admin'
        });

        if (assignedTo) {
            const user = await User.findByIdAndUpdate(assignedTo, {
                $inc: { 'leadStats.totalAssigned': 1 }
            });

            if (user) {
                await sendEmail({
                    email: user.email,
                    subject: 'New Lead Assigned to You',
                    message: `Hello ${user.name}, a new lead (${lead.name}) has been assigned to you by an admin.`,
                    html: `<h3>Lead Assigned</h3><p>Hello ${user.name},</p><p>An admin has assigned a new lead <b>${lead.name}</b> (${lead.category}) specifically to you.</p><p><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/brand/leads">View Dashboard</a></p>`
                });
            }
        }

        await lead.save();
        res.json({ success: true, lead });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get Lead Stats (admin)
exports.getLeadStats = async (req, res) => {
    try {
        const total = await Lead.countDocuments();
        const statusCounts = await Lead.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        const priorityCounts = await Lead.aggregate([
            { $group: { _id: '$priority', count: { $sum: 1 } } }
        ]);
        const categoryCounts = await Lead.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        // Merchant Ranking
        const topPerformers = await User.find({ role: 'Merchant' })
            .sort({ performanceScore: -1 })
            .limit(5)
            .select('name performanceScore leadStats');

        res.json({
            success: true,
            stats: {
                total,
                statusDistribution: statusCounts,
                priorityDistribution: priorityCounts,
                topCategories: categoryCounts,
                topPerformers
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
