const express = require('express');
const { 
    register, 
    login, 
    getMe, 
    verifyEmail, 
    forgotPassword, 
    resetPassword,
    deleteAccount,
    deactivateAccount,
    getSessions,
    revokeAllSessions,
    googleLogin,
    facebookLogin
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.get('/verify/:token', verifyEmail);
router.post('/forgotpassword', forgotPassword);
router.put('/resetpassword/:token', resetPassword);

// OAuth
router.post('/google', googleLogin);
router.post('/facebook', facebookLogin);

// Account & Session Management
router.delete('/account', protect, deleteAccount);
router.put('/deactivate', protect, deactivateAccount);
router.get('/sessions', protect, getSessions);
router.delete('/sessions', protect, revokeAllSessions);

module.exports = router;
