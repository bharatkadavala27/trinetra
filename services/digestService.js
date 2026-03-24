const User = require('../models/User');
const Notification = require('../models/Notification');
const sendEmail = require('../utils/email');

/**
 * Generate and send Weekly/Daily Email Digest to all eligible users
 */
exports.processDigests = async (frequency) => {
    try {
        console.log(`[Digest Service] Starting ${frequency} digest processing...`);
        
        // Find users who have this frequency enabled and are due for a digest
        const users = await User.find({
            'notificationPreferences.digestFrequency': frequency,
            'notificationPreferences.email': true,
            status: 'Active'
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
        const timeframe = frequency === 'Daily' ? 1 : (frequency === 'Monthly' ? 30 : 7);
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - timeframe);

        const unreadNotifications = await Notification.find({
            recipient: user._id,
            isRead: false,
            createdAt: { $gte: sinceDate }
        }).sort({ createdAt: -1 }).limit(10); // Show top 10

        if (unreadNotifications.length === 0) return;

        // Build HTML
        const notificationsHtml = unreadNotifications.map(n => `
            <div style="padding: 15px; border-bottom: 1px solid #f1f5f9; background: white; margin-bottom: 8px; border-radius: 8px;">
                <h4 style="margin: 0; color: #1e293b; font-size: 15px;">${n.title}</h4>
                <p style="margin: 5px 0; color: #64748b; font-size: 13px; line-height: 1.5;">${n.message}</p>
                <small style="color: #94a3b8; font-size: 11px;">${new Date(n.createdAt).toLocaleString()}</small>
            </div>
        `).join('');

        const html = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; padding: 40px 20px; background-color: #f8fafc;">
                <div style="background: white; padding: 32px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                    <h2 style="color: #4f46e5; margin-top: 0; font-size: 24px; font-weight: 800;">Your ${frequency} Digest</h2>
                    <p style="color: #475569; font-size: 16px;">Hello <strong>${user.name}</strong>, you have <strong>${unreadNotifications.length}</strong> unread updates from the last ${timeframe} day(s) on Engitech Expo.</p>
                    
                    <div style="margin-top: 24px;">
                        ${notificationsHtml}
                    </div>

                    <div style="margin-top: 32px; text-align: center;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile/notifications" 
                           style="display: inline-block; background: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 14px;">
                            View All Notifications
                        </a>
                    </div>
                    
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
                    
                    <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-bottom: 0;">
                        You are receiving this because you enabled ${frequency} digests in your <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile/notifications" style="color: #4f46e5; text-decoration: none;">Notification Settings</a>.
                    </p>
                </div>
            </div>
        `;

        await sendEmail({
            email: user.email,
            subject: `🔔 Your ${frequency} Update - Engitech Expo`,
            message: `Hello ${user.name}, you have ${unreadNotifications.length} new notifications.`,
            html
        });

        // Update last sent date
        await User.findByIdAndUpdate(user._id, { 
            'notificationPreferences.lastDigestSent': new Date() 
        });

        console.log(`[Digest Service] Sent ${frequency} digest to ${user.email}`);
    } catch (err) {
        console.error(`Error sending digest to ${user.email}:`, err);
    }
};
