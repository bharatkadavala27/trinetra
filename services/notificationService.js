const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendPushNotification } = require('../utils/push');
const { sendSMS, sendWhatsApp } = require('../utils/sms');

/**
 * Dispatch a notification to a user across multiple channels
 */
exports.sendNotification = async ({ recipient, sender, type, title, message, link, metadata = {} }) => {
    try {
        // 1. Create In-App Notification record
        const notification = await Notification.create({
            recipient,
            sender,
            type,
            title,
            message,
            link,
            metadata
        });

        // 2. Fetch User for channel preferences and tokens
        const user = await User.findById(recipient).select('notificationPreferences email mobileNumber fcmToken name');
        if (!user) return notification;

        const prefs = user.notificationPreferences || {};

        // 3. Dispatch to other channels if enabled
        
        // --- EMAIL CHANNEL ---
        if (prefs.email && user.email) {
            const sendEmail = require('../utils/email');
            await sendEmail({
                email: user.email,
                subject: title,
                message: `${message}\n\nView details: ${process.env.FRONTEND_URL || 'http://localhost:5173'}${link || '/'}`
            }).catch(e => console.error('[NotificationService] Email error:', e));
        }

        // --- SMS CHANNEL ---
        if (prefs.sms && user.mobileNumber) {
            await sendSMS(user.mobileNumber, `${title}: ${message}`)
                .catch(e => console.error('[NotificationService] SMS error:', e));
        }

        // --- WHATSAPP CHANNEL ---
        if (prefs.whatsapp && user.mobileNumber) {
            await sendWhatsApp(user.mobileNumber, `${title}: ${message}`)
                .catch(e => console.error('[NotificationService] WhatsApp error:', e));
        }

        // --- PUSH (FCM) CHANNEL ---
        if (prefs.push && user.fcmToken) {
            await sendPushNotification(user.fcmToken, title, message, { link: link || '', ...metadata })
                .catch(e => console.error('[NotificationService] Push error:', e));
        }

        return notification;
    } catch (err) {
        console.error('Notification Dispatch Error:', err);
        throw err;
    }
};
