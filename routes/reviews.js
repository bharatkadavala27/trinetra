const express = require('express');
const router = express.Router();
const { 
    addReview, 
    getBusinessReviews, 
    getAllReviews, 
    updateReviewStatus, 
    deleteReview, 
    getLatestReviews, 
    getUserReviews,
    voteReview,
    reportReview
} = require('../controllers/reviewController');
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/latest', getLatestReviews);
router.get('/:businessId', getBusinessReviews);
router.get('/user/:userId', protect, getUserReviews);
router.post('/', protect, addReview);
router.post('/:id/vote', protect, voteReview);
router.post('/:id/report', protect, reportReview);

// Admin Routes
router.get('/', protect, admin, getAllReviews);
router.put('/:id/status', protect, admin, updateReviewStatus);
router.delete('/:id', protect, admin, deleteReview);

module.exports = router;
