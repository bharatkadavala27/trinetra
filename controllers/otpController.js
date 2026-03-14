const OTP = require('../models/OTP');

// Send OTP (Mock)
exports.sendOTP = async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required' });

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Clear existing OTPs for this phone
        await OTP.deleteMany({ phone });

        // Save new OTP
        await OTP.create({ phone, otp });

        // MOCK: Log to console instead of sending SMS
        console.log(`\n---------------------------------`);
        console.log(`[VERIFICATION] OTP for ${phone}: ${otp}`);
        console.log(`---------------------------------\n`);

        res.json({ success: true, message: 'OTP sent successfully (Check console)' });
    } catch (err) {
        console.error('Send OTP Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {
    try {
        const { phone, otp } = req.body;
        if (!phone || !otp) return res.status(400).json({ success: false, message: 'Phone and OTP are required' });

        const record = await OTP.findOne({ phone, otp });
        if (!record) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        // OTP is valid, delete it
        await OTP.deleteOne({ _id: record._id });

        res.json({ success: true, message: 'OTP verified' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
