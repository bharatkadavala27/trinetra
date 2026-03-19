const mongoose = require('mongoose');
const slugify = require('slugify');

const companySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        unique: true
    },
    category: {
        type: String, // Legacy support
        required: true
    },
    category_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        default: null
    },
    country_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Country',
        default: null
    },
    state_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'State',
        default: null
    },
    city_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'City',
        default: null
    },
    area_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Area',
        default: null
    },
    address: {
        type: String,
        trim: true
    },
    latitude: {
        type: Number,
        default: null
    },
    longitude: {
        type: Number,
        default: null
    },
    description: {
        type: String,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'Active', 'Inactive', 'Flagged', 'Suspended'],
        default: 'Pending'
    },
    // Approval workflow
    approvalStatus: {
        stage: {
            type: String,
            enum: ['AwaitingReview', 'UnderReview', 'MoreInfoRequested', 'Approved', 'Rejected'],
            default: 'AwaitingReview'
        },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reviewedAt: Date,
        rejectionReason: String,
        moreInfoRequestedAt: Date,
        moreInfoMessage: String
    },
    // Flagging & Spam Detection
    flags: [{
        reason: { type: String, enum: ['Spam', 'Inappropriate', 'Duplicate', 'Fake', 'Other'], required: true },
        description: String,
        flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        flaggedAt: { type: Date, default: Date.now }
    }],
    isFlagged: {
        type: Boolean,
        default: false
    },
    // Suspension details
    suspensionDetails: {
        reason: String,
        suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        suspendedAt: Date,
        notificationSent: Boolean
    },
    // Duplicate detection
    possibleDuplicates: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Company' }],
    mergedWith: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
    // Claim verification
    claimVerification: {
        status: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' },
        documents: [String], // Cloudinary URLs
        uploadedAt: Date,
        verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        verifiedAt: Date
    },
    // Subscription plan
    plan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Plan',
        default: null
    },
    // Business badge (blue tick)
    businessBadgeVerified: {
        type: Boolean,
        default: false
    },
    badgeVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    badgeVerifiedAt: Date,
    verified: {
        type: Boolean,
        default: false
    },
    verificationStatus: {
        type: String,
        enum: ['Verified', 'Not Verified', 'Pending Review'],
        default: 'Not Verified'
    },
    image: {
        type: String,
        default: null
    },
    isClaimPending: {
        type: Boolean,
        default: false
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    rating: {
        type: Number,
        default: 0
    },
    reviewCount: {
        type: Number,
        default: 0
    },
    responseTime: {
        type: Number, // in minutes
        default: 30
    },
    manualRank: {
        type: Number,
        default: 0
    },
    businessHours: {
        monday: { open: String, close: String, closed: Boolean },
        tuesday: { open: String, close: String, closed: Boolean },
        wednesday: { open: String, close: String, closed: Boolean },
        thursday: { open: String, close: String, closed: Boolean },
        friday: { open: String, close: String, closed: Boolean },
        saturday: { open: String, close: String, closed: Boolean },
        sunday: { open: String, close: String, closed: Boolean }
    },
    priceRange: {
        type: String,
        enum: ['$', '$$', '$$$', '$$$$'],
        default: '$$'
    },
    tags: [String],
    photos: [String],
    changeHistory: [
        {
            field: String,
            oldValue: mongoose.Schema.Types.Mixed,
            newValue: mongoose.Schema.Types.Mixed,
            changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            date: { type: Date, default: Date.now }
        }
    ]
}, { timestamps: true });

// Create slug from name before saving and ensure claimed status consistency
companySchema.pre('save', function (next) {
    if (this.isModified('name')) {
        this.slug = slugify(this.name, { lower: true, strict: true });
    }
    
    // If owner is removed or explicitly unset, mark as unclaimed
    if (!this.owner) {
        this.claimed = false;
    } else {
        // If owner is present, it MUST be claimed
        this.claimed = true;
    }
    
    next();
});

module.exports = mongoose.model('Company', companySchema);
