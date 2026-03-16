const User = require('../models/User');
const OTP = require('../models/OTP');

// @desc    Send OTP to mobile
// @route   POST /api/otp/send
// @access  Public
exports.sendOTP = async (req, res) => {
    try {
        const { mobileNumber } = req.body;

        if (!mobileNumber) {
            return res.status(400).json({ msg: 'Please provide a mobile number' });
        }

        // Check for rate limiting (max 5 attempts per hour)
        const existingOTP = await OTP.findOne({ phone: mobileNumber });
        if (existingOTP && existingOTP.attempts >= 5) {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            if (existingOTP.lastAttempt > oneHourAgo) {
                return res.status(429).json({ msg: 'Too many OTP attempts. Please try again after an hour.' });
            } else {
                // Reset if an hour has passed
                existingOTP.attempts = 0;
            }
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Save/Update to DB
        await OTP.findOneAndUpdate(
            { phone: mobileNumber },
            { 
                otp, 
                $inc: { attempts: 1 }, 
                lastAttempt: Date.now(),
                createdAt: Date.now() // Refresh TTL
            },
            { upsert: true, new: true }
        );

        // MOCK: SMS dispatch (MSG91 / Twilio architecture)
        console.log(`[SMS MOCK] Sending OTP ${otp} to ${mobileNumber}`);
        
        // In a real app:
        // if (process.env.MSG91_AUTH_KEY) { 
        //    await sendSMS(mobileNumber, otp); 
        // }

        res.json({ success: true, msg: 'OTP sent successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Verify OTP
// @route   POST /api/otp/verify
// @access  Public
exports.verifyOTP = async (req, res) => {
    try {
        const { mobileNumber, otp } = req.body;

        if (!mobileNumber || !otp) {
            return res.status(400).json({ msg: 'Please provide mobile number and OTP' });
        }

        const otpRecord = await OTP.findOne({ phone: mobileNumber });

        if (!otpRecord || otpRecord.otp !== otp) {
            return res.status(400).json({ msg: 'Invalid or expired OTP' });
        }

        // Mark user as OTP verified if they exist
        await User.findOneAndUpdate({ mobileNumber }, { otpVerified: true });

        // Delete OTP record after successful verification
        await OTP.deleteOne({ _id: otpRecord._id });

        res.json({ success: true, msg: 'OTP verified successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};
