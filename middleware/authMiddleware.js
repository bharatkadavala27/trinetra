const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Company = require('../models/Company');

// Protect routes
exports.protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ msg: 'Not authorized to access this route' });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        
        // Find user and attach to request
            console.log('Decoded Token:', decoded);
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ msg: 'User no longer exists' });
        }
        
        // Check if token version matches (for force logout)
        if (typeof decoded.tokenVersion !== 'undefined' && decoded.tokenVersion !== user.tokenVersion) {
            return res.status(401).json({ msg: 'Session invalidated. Please login again.' });
        }
        
        req.user = user;
            console.log('User attached to request:', user);
        next();
    } catch (err) {
        return res.status(401).json({ msg: 'Not authorized to access this route' });
    }
};

// Middleware to find and attach all brands (companies) owned by the current user
exports.attachOwnedBrands = async (req, res, next) => {
    if (!req.user) return next();

    // Super Admin sees everything anyway, but for Brand Owners we need specific IDs
    // Find all companies where this user is the owner
    const companies = await Company.find({ owner: req.user._id });
    req.ownedBrandIds = companies.map(c => c._id);
    next();
};

// Grant access to specific roles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || typeof req.user.role === 'undefined') {
            console.error('authorize middleware: req.user or req.user.role is undefined', req.user);
            return res.status(401).json({
                msg: 'User not authenticated or role missing.'
            });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                msg: `User role ${req.user.role} is not authorized to access this route`
            });
        }
        next();
    };
};

// Admin middleware - shorthand for authorize('Super Admin')
exports.admin = exports.authorize('Super Admin');
