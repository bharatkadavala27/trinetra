const User = require('../models/User');
const Notification = require('../models/Notification');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

/**
 * Generate and send Weekly/Daily Email Digest to all eligible users
 */
exports.processDigests = async (frequency) => {
    try {
        console.log(`[Digest Service] Starting ${frequency} digest processing...`);
        
        // Find users who have this frequency enabled and are due for a digest
        const users = await User.find({
            'notificationPreferences.digestFrequency': frequency,
            'notificationPreferences.email': true
        });

        for (const user of users) {
            await sendUserDigest(user, frequency);
        }

        console.log(`[Digest Service] Finished ${frequency} digest processing.`);
    } catch (err) {
        console.error('Digest Processing Error:', err);
    }
};

/**
 * Aggregate unread notifications and send email to a single user
 */
const sendUserDigest = async (user, frequency) => {
    try {
        // Find unread notifications for this user since last digest or last 7 days
        const timeframe = frequency === 'Daily' ? 1 : 7;
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - timeframe);

        const unreadNotifications = await Notification.find({
            recipient: user._id,
            isRead: false,
            createdAt: { $gte: sinceDate }
        }).sort({ createdAt: -1 }).limit(10); // Show top 10

        if (unreadNotifications.length === 0) return;

        // Build HTML
        const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #f97316;">Your ${frequency} Digest</h2>
                <p>Hello ${user.name}, you have ${unreadNotifications.length} unread updates from the last ${timeframe} day(s).</p>
                
                <div style="margin-top: 20px;">
                    ${unreadNotifications.map(n => `
                        <div style="padding: 15px; border-bottom: 1px solid #f1f5f9;">
                            <h4 style="margin: 0; color: #1e293b;">${n.title}</h4>
                            <p style="margin: 5px 0; color: #64748b; font-size: 14px;">${n.message}</p>
                            <small style="color: #94a3b8;">${new Date(n.createdAt).toLocaleDateString()}</small>
                        </div>
                    `).join('')}
                </div>

                <div style="margin-top: 30px; text-align: center;">
                    <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile/notifications" 
                       style="background: #f97316; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                        View All Notifications
                    </a>
                </div>
                
                <p style="margin-top: 40px; font-size: 12px; color: #94a3b8; text-align: center;">
                    You are receiving this because you enabled ${frequency} digests in your account settings.
                </p>
            </div>
        `;

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: `Your ${frequency} Updates - Fuerte Business Platform`,
            html
        });

        // Update last sent date
        user.notificationPreferences.lastDigestSent = new Date();
        await user.save();

        console.log(`[Digest Service] Sent ${frequency} digest to ${user.email}`);
    } catch (err) {
        console.error(`Error sending digest to ${user.email}:`, err);
    }
};
