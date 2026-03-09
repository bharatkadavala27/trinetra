const express = require('express');
const router = express.Router();
const { getAllCompanies, createCompany, updateCompany, deleteCompany, getCompanyBySlug, claimCompany } = require('../controllers/companyController');
const { protect, attachOwnedBrands } = require('../middleware/authMiddleware');

// @route   GET /api/companies
router.get('/', (req, res, next) => {
    const { protect, attachOwnedBrands } = require('../middleware/authMiddleware');
    if (req.headers.authorization) {
        return protect(req, res, (err) => {
            if (err) return next(); // Ignore auth errors for public route
            attachOwnedBrands(req, res, next);
        });
    }
    next();
}, getAllCompanies);

// @route   GET /api/companies/slug/:slug
router.get('/slug/:slug', getCompanyBySlug);

// @route   POST /api/companies
router.post('/', (req, res, next) => {
    // Optional protect: if token exists, attach user, but don't block if not
    const { protect } = require('../middleware/authMiddleware');
    if (req.headers.authorization) {
        return protect(req, res, next);
    }
    next();
}, createCompany);

// @route   PUT /api/companies/:id
router.put('/:id', protect, attachOwnedBrands, updateCompany);

// @route   DELETE /api/companies/:id
router.delete('/:id', protect, attachOwnedBrands, deleteCompany);

// @route   POST /api/companies/:id/claim
router.post('/:id/claim', protect, claimCompany);

module.exports = router;
