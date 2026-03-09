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
        enum: ['Active', 'Inactive', 'Pending'],
        default: 'Pending'
    },
    claimed: {
        type: Boolean,
        default: false
    },
    verified: {
        type: Boolean,
        default: false
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
    }
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
