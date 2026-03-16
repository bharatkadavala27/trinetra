const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
    siteName: {
        type: String,
        default: 'Fuerte Developers',
    },
    logoUrl: {
        type: String,
        default: 'https://fuertedevelopers.in/logo.png',
    },
    faviconUrl: {
        type: String,
        default: 'https://fuertedevelopers.in/favicon.ico',
    },
    primaryColor: {
        type: String,
        default: '#0057FC', // Tech Blue
    },
    secondaryColor: {
        type: String,
        default: '#FFDD0F', // Brand Orange
    },
    contactEmail: {
        type: String,
        default: 'info@fuertedevelopers.in',
    },
    contactPhone: {
        type: String,
        default: '+91 91062 55483',
    },
    footerText: {
        type: String,
        default: '© 2026 Fuerte Developers - Web, App & Software Development',
    },
    rankingWeights: {
        reviews: { type: Number, default: 1.0 },
        distance: { type: Number, default: 1.0 },
        responseTime: { type: Number, default: 1.0 },
        premium: { type: Number, default: 1.5 }
    }
}, { timestamps: true });

module.exports = mongoose.model('Setting', settingSchema);
