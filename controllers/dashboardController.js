const User = require('../models/User');
const Company = require('../models/Company');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Service = require('../models/Service');
const BrandLocation = require('../models/BrandLocation');

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

        if (isBrandOwner) {
            // Get brand IDs first (should be in req.ownedBrandIds from middleware)
            const brandIds = req.ownedBrandIds || [];
            companyQuery = { owner: req.user._id };
            productQuery = { listingId: { $in: brandIds } };
            serviceQuery = { listingId: { $in: brandIds } };
            locationQuery = { brandId: { $in: brandIds } };
            categoryQuery = { ...categoryQuery, brandId: { $in: brandIds } };
        }

        const [totalUsers, totalCompanies, activeCategories, pendingClaims, totalProducts, totalServices, totalBrandLocations] = await Promise.all([
            User.countDocuments(),
            Company.countDocuments(companyQuery),
            Category.countDocuments(categoryQuery),
            Company.countDocuments({ ...companyQuery, verified: false }),
            Product.countDocuments(productQuery),
            Service.countDocuments(serviceQuery),
            BrandLocation.countDocuments(locationQuery)
        ]);

        res.json({
            totalUsers: isBrandOwner ? null : totalUsers, // Hide user count from brand owners
            totalCompanies,
            activeCategories,
            pendingClaims,
            totalProducts,
            totalServices,
            totalBrandLocations
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

module.exports = { getDashboardStats };
