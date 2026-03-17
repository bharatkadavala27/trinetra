const Review = require('../models/Review');
const Company = require('../models/Company');

// Helper to recalculate and update company rating
const recalculateCompanyRating = async (businessId) => {
    const reviews = await Review.find({ businessId, status: 'Approved', isDeleted: { $ne: true } });
    const company = await Company.findById(businessId);
    
    if (company) {
        if (reviews.length > 0) {
            const reviewCount = reviews.length;
            const avgRating = reviews.reduce((acc, item) => item.rating + acc, 0) / reviewCount;
            company.rating = parseFloat(avgRating.toFixed(1));
            company.reviewCount = reviewCount;
        } else {
            company.rating = 0;
            company.reviewCount = 0;
        }
        await company.save();
    }
};

// @desc    Add a review
// @route   POST /api/reviews
// @access  Private
exports.addReview = async (req, res) => {
    try {
        const { businessId, rating, comment, images } = req.body;

        // Check if company exists
        const company = await Company.findById(businessId);
        if (!company) {
            return res.status(404).json({ msg: 'Company not found' });
        }

        const review = new Review({
            businessId,
            userId: req.user.id,
            rating,
            comment,
            images,
            aspects: req.body.aspects || { quality: 0, service: 0, value: 0 }
        });

        // Fraud & Spam Detection
        const FraudAlert = require('../models/FraudAlert');
        const { realTimeFraudCheck } = require('./fraudController');
        
        const metadata = {
            ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        };

        const fraudResult = await realTimeFraudCheck('review', { businessId, comment }, req.user.id, metadata);

        if (fraudResult.isSuspicious) {
            review.status = 'Pending'; // Force moderation
            if (fraudResult.severity === 'high') {
                review.status = 'Suspended'; // Hide immediately if high risk
            }
        }

        // Attach metadata to review for historical tracking
        review.metadata = {
            ...review.metadata,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent
        };

        await review.save();

        if (fraudResult.isSuspicious) {
            // Create the fraud alert linked to the new review
            await FraudAlert.create({
                ...fraudResult.alertData,
                targetId: review._id,
                targetModel: 'Review',
                status: 'pending'
            });
        }

        // Update company rating average
        if (review.status === 'Approved') {
            await recalculateCompanyRating(businessId);
        }

        res.status(201).json(review);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get reviews for a business
// @route   GET /api/reviews/:businessId
// @access  Public
exports.getBusinessReviews = async (req, res) => {
    try {
        const reviews = await Review.find({ 
            businessId: req.params.businessId,
            status: 'Approved' 
        })
        .populate('userId', 'name')
        .sort({ createdAt: -1 });

        res.json(reviews);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get all reviews (Admin)
// @route   GET /api/reviews
// @access  Private/Admin
exports.getAllReviews = async (req, res) => {
    try {
        const reviews = await Review.find()
            .populate('userId', 'name email')
            .populate('businessId', 'name')
            .sort({ createdAt: -1 });

        res.json(reviews);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Update review status (Admin)
// @route   PUT /api/reviews/:id/status
// @access  Private/Admin
exports.updateReviewStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const review = await Review.findById(req.params.id);

        if (!review) {
            return res.status(404).json({ msg: 'Review not found' });
        }

        const oldStatus = review.status;
        review.status = status;

        if (req.body.merchantReply) {
            review.ownerReply = {
                text: req.body.merchantReply,
                date: new Date()
            };
        }

        await review.save();

        // Recalculate company rating if status changed to/from 'Approved'
        if (oldStatus === 'Approved' || status === 'Approved') {
            await recalculateCompanyRating(review.businessId);
        }

        res.json(review);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Delete review (Admin)
// @route   DELETE /api/reviews/:id
// @access  Private/Admin
exports.deleteReview = async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);

        if (!review) {
            return res.status(404).json({ msg: 'Review not found' });
        }

        const businessId = review.businessId;
        const wasApproved = review.status === 'Approved';
        
        await Review.deleteOne({ _id: req.params.id });

        // Recalculate company rating if deleted review was approved
        if (wasApproved) {
            await recalculateCompanyRating(businessId);
        }

        res.json({ msg: 'Review removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get latest reviews
// @route   GET /api/reviews/latest
// @access  Public
exports.getLatestReviews = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const reviews = await Review.find({ status: 'Approved' })
            .populate('userId', 'name')
            .populate('businessId', 'name slug image rating')
            .sort({ createdAt: -1 })
            .limit(limit);

        res.json(reviews);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get reviews for a user
// @route   GET /api/reviews/user/:userId
// @access  Private
exports.getUserReviews = async (req, res) => {
    try {
        const reviews = await Review.find({ userId: req.params.userId })
            .populate('businessId', 'name slug image rating')
            .sort({ createdAt: -1 });

        res.json(reviews);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};
