const express = require('express');
const router = express.Router();
const { getBusinessSubscription, mockCheckout, adminAssignSubscription } = require('../controllers/subscriptionController');
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/business/:businessId', protect, getBusinessSubscription);
router.post('/mock-checkout', protect, mockCheckout);
router.post('/admin-assign', protect, admin, adminAssignSubscription);

module.exports = router;
