const express = require('express');
const router = express.Router();
const { 
    getProfile, 
    updateProfile, 
    getSavedListings, 
    toggleSaveListing, 
    manageAddressBook 
} = require('../controllers/userProfileController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.get('/saved', getSavedListings);
router.post('/saved/toggle', toggleSaveListing);
router.post('/addresses', manageAddressBook);

module.exports = router;
