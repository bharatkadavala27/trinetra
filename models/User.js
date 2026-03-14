const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        select: false // Ensure password isn't returned by default
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    verificationToken: String,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    role: {
        type: String,
        enum: ['Super Admin', 'Company Owner', 'Brand Owner', 'Merchant', 'User'],
        default: 'User'
    },
    status: {
        type: String,
        enum: ['Active', 'Suspended'],
        default: 'Active'
    },
    companiesOwned: {
        type: Number,
        default: 0
    },
    performanceScore: {
        type: Number,
        default: 100
    },
    leadStats: {
        totalAssigned: { type: Number, default: 0 },
        totalConverted: { type: Number, default: 0 },
        avgResponseTime: { type: Number, default: 0 }
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
