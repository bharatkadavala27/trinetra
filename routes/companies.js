const express = require('express');
const router = express.Router();
const { getAllCompanies, createCompany, updateCompany, deleteCompany } = require('../controllers/companyController');
const { protect, attachOwnedBrands } = require('../middleware/authMiddleware');

// @route   GET /api/companies
router.get('/', protect, attachOwnedBrands, getAllCompanies);

// @route   POST /api/companies
router.post('/', protect, attachOwnedBrands, createCompany);

// @route   PUT /api/companies/:id
router.put('/:id', protect, attachOwnedBrands, updateCompany);

// @route   DELETE /api/companies/:id
router.delete('/:id', protect, attachOwnedBrands, deleteCompany);

module.exports = router;
