const User = require('../models/User');
const Company = require('../models/Company');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Service = require('../models/Service');
const BrandLocation = require('../models/BrandLocation');
const Lead = require('../models/Lead');
const ClaimRequest = require('../models/ClaimRequest');

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
const getDashboardStats = async (req, res) => {
    try {
        const isBrandOwner = req.user && (req.user.role === 'Brand Owner' || req.user.role === 'Company Owner');
        let companyQuery = {};
        let productQuery = {};
        let serviceQuery = {};
        let locationQuery = {};
        let categoryQuery = { status: 'Active' };
        let leadQuery = {};

        if (isBrandOwner) {
            const brandIds = req.ownedBrandIds || [];
            companyQuery = { owner: req.user._id };
            productQuery = { listingId: { $in: brandIds } };
            serviceQuery = { listingId: { $in: brandIds } };
            locationQuery = { brandId: { $in: brandIds } };
            categoryQuery = { ...categoryQuery, brandId: { $in: brandIds } };
            leadQuery = { assignedTo: req.user._id };
        }

        const [
            totalUsers, 
            totalCompanies, 
            activeCategories, 
            pendingClaims, 
            totalProducts, 
            totalServices, 
            totalBrandLocations,
            leadStats,
            merchantStats,
            categoryStats,
            recentActivity
        ] = await Promise.all([
            User.countDocuments(),
            Company.countDocuments(companyQuery),
            Category.countDocuments(categoryQuery),
            ClaimRequest.countDocuments({ status: 'Pending' }),
            Product.countDocuments(productQuery),
            Service.countDocuments(serviceQuery),
            BrandLocation.countDocuments(locationQuery),
            
            // Lead Status Distribution
            Lead.aggregate([
                { $match: leadQuery },
                { $group: { _id: "$status", count: { $sum: 1 } } }
            ]),

            // Merchant Status Distribution (Admin only)
            !isBrandOwner ? User.aggregate([
                { $match: { role: 'Merchant' } },
                { $group: { _id: "$status", count: { $sum: 1 } } }
            ]) : Promise.resolve([]),

            // Top Categories by Listing Count
            Company.aggregate([
                { $match: companyQuery },
                { $group: { _id: "$category", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ]),

            // Recent Activity (derived from multiple collections)
            Promise.all([
                Lead.find(leadQuery).sort({ createdAt: -1 }).limit(3).select('name category source createdAt'),
                ClaimRequest.find().sort({ createdAt: -1 }).limit(2).select('fullName businessEmail status createdAt'),
                User.find().sort({ createdAt: -1 }).limit(2).select('name role createdAt')
            ]).then(([leads, claims, users]) => {
                const activities = [
                    ...leads.map(l => ({ type: 'lead', title: `New Lead: ${l.name}`, detail: l.category, time: l.createdAt })),
                    ...claims.map(c => ({ type: 'claim', title: `Claim: ${c.fullName}`, detail: c.status, time: c.createdAt })),
                    ...users.map(u => ({ type: 'user', title: `Joined: ${u.name}`, detail: u.role, time: u.createdAt }))
                ];
                return activities.sort((a, b) => b.time - a.time).slice(0, 5);
            })
        ]);

        res.json({
            totalUsers: isBrandOwner ? null : totalUsers,
            totalCompanies,
            activeCategories,
            pendingClaims,
            totalProducts,
            totalServices,
            totalBrandLocations,
            leadPipeline: leadStats,
            merchantHealth: merchantStats,
            topCategories: categoryStats,
            recentActivity
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

module.exports = { getDashboardStats };
