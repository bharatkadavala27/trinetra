const express = require('express');
const router = express.Router();
const { getBusinessSubscription, mockCheckout } = require('../controllers/subscriptionController');
const { protect } = require('../middleware/authMiddleware');

router.get('/business/:businessId', protect, getBusinessSubscription);
router.post('/mock-checkout', protect, mockCheckout);

module.exports = router;
