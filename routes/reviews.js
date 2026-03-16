const express = require('express');
const router = express.Router();
const { addReview, getBusinessReviews, getAllReviews, updateReviewStatus, deleteReview, getLatestReviews, getUserReviews } = require('../controllers/reviewController');
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/latest', getLatestReviews);
router.get('/:businessId', getBusinessReviews);
router.get('/user/:userId', protect, getUserReviews);
router.post('/', protect, addReview);

// Admin Routes
router.get('/', protect, admin, getAllReviews);
router.put('/:id/status', protect, admin, updateReviewStatus);
router.delete('/:id', protect, admin, deleteReview);

module.exports = router;
