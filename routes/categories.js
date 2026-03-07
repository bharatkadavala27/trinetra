const express = require('express');
const router = express.Router();
const { getAllCategories, createCategory, updateCategory, deleteCategory, getCategoryBySlug } = require('../controllers/categoryController');
const { protect, authorize, attachOwnedBrands } = require('../middleware/authMiddleware');

// Public routes
router.get('/', protect, attachOwnedBrands, getAllCategories);
router.get('/slug/:slug', getCategoryBySlug);

// Protected routes (Admin / Brand Owner)
router.post('/', protect, authorize('Super Admin', 'Brand Owner', 'Company Owner'), attachOwnedBrands, createCategory);
router.put('/:id', protect, authorize('Super Admin', 'Brand Owner', 'Company Owner'), attachOwnedBrands, updateCategory);
router.delete('/:id', protect, authorize('Super Admin', 'Brand Owner', 'Company Owner'), attachOwnedBrands, deleteCategory);

module.exports = router;
