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
            limit = 20,
            dateStart,
            dateEnd
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

        // Filter by date range
        if (dateStart || dateEnd) {
            query.createdAt = {};
            if (dateStart) query.createdAt.$gte = new Date(dateStart);
            if (dateEnd) {
                const end = new Date(dateEnd);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
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

// @desc    Bulk listing actions (approve, reject, delete)
// @route   POST /api/admin/listings/bulk-action
exports.bulkListingAction = async (req, res) => {
    try {
        const { ids, action, reason } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, msg: 'No listing IDs provided' });
        }

        const validActions = ['approve', 'reject', 'delete'];
        if (!validActions.includes(action)) {
            return res.status(400).json({ success: false, msg: 'Invalid bulk action' });
        }

        let result;
        if (action === 'delete') {
            result = await Company.deleteMany({ _id: { $in: ids } });
            
            // Log audit for deletion
            await AdminAuditLog.create({
                adminId: req.user._id,
                action: 'LISTING_BULK_DELETED',
                targetType: 'Listing',
                notes: `Deleted ${ids.length} listings`,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        } else {
            const statusMap = {
                approve: 'Approved',
                reject: 'Rejected'
            };
            
            const stageMap = {
                approve: 'Approved',
                reject: 'Rejected'
            };

            const updateData = {
                status: statusMap[action],
                'approvalStatus.stage': stageMap[action],
                'approvalStatus.reviewedBy': req.user._id,
                'approvalStatus.reviewedAt': new Date()
            };

            if (action === 'reject' && reason) {
                updateData['approvalStatus.rejectionReason'] = reason;
            }

            result = await Company.updateMany(
                { _id: { $in: ids } },
                { $set: updateData }
            );

            // Log audit
            await AdminAuditLog.create({
                adminId: req.user._id,
                action: action === 'approve' ? 'LISTING_BULK_APPROVED' : 'LISTING_BULK_REJECTED',
                targetType: 'Listing',
                notes: `${action === 'approve' ? 'Approved' : 'Rejected'} ${ids.length} listings`,
                changes: { after: { status: statusMap[action], reason } },
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }

        res.json({
            success: true,
            msg: `Bulk ${action} successful`,
            affectedCount: result.modifiedCount || result.deletedCount || 0
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Export listings to CSV
// @route   GET /api/admin/listings/export/csv
exports.exportListingsCsv = async (req, res) => {
    try {
        const { search, status, category, city, plan, dateStart, dateEnd } = req.query;

        let query = {};
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        if (status) query.status = status === 'PendingApproval' ? 'Pending' : status;
        if (category) query.category_id = category;
        if (city) query.city_id = city;
        if (plan) query.plan = plan;
        if (dateStart || dateEnd) {
            query.createdAt = {};
            if (dateStart) query.createdAt.$gte = new Date(dateStart);
            if (dateEnd) {
                const end = new Date(dateEnd);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }

        const listings = await Company.find(query)
            .populate('owner', 'name email')
            .populate('category_id', 'name')
            .populate('city_id', 'name')
            .sort('-createdAt');

        // Generate CSV content
        const headers = ['Business Name', 'Owner', 'Email', 'Phone', 'Category', 'City', 'Plan', 'Status', 'Verified', 'Created At'];
        const rows = listings.map(l => [
            l.name,
            l.owner?.name || 'N/A',
            l.email || l.owner?.email || 'N/A',
            l.phone || 'N/A',
            l.category_id?.name || l.category || 'N/A',
            l.city_id?.name || 'N/A',
            l.plan?.name || 'Free',
            l.status,
            l.verified ? 'Yes' : 'No',
            new Date(l.createdAt).toLocaleDateString()
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=listings_export_${new Date().getTime()}.csv`);
        res.status(200).send(csvContent);

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Get change history (audit trail) for a listing
// @route   GET /api/admin/listings/:id/audit
exports.getListingAuditTrail = async (req, res) => {
    try {
        const listing = await Company.findById(req.params.id)
            .populate('changeHistory.changedBy', 'name email')
            .select('name changeHistory');

        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        res.json({
            success: true,
            listingName: listing.name,
            auditTrail: listing.changeHistory.sort((a, b) => b.date - a.date)
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};
