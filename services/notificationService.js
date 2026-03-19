const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Dispatch a notification to a user across multiple channels
 * @param {Object} options 
 * @param {string} options.recipient - User ID
 * @param {string} options.type - Notification type
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification body
 * @param {string} [options.link] - Action link
 * @param {Object} [options.metadata] - Extra data
 */
exports.sendNotification = async ({ recipient, type, title, message, link, metadata = {} }) => {
    try {
        // 1. Create In-App Notification
        const notification = await Notification.create({
            recipient,
            type,
            title,
            message,
            link,
            metadata
        });

        // 2. Fetch User for channel preferences
        const user = await User.findById(recipient).select('notificationPreferences email mobileNumber');
        if (!user) return notification;

        const prefs = user.notificationPreferences || {};

        // 3. Dispatch to other channels if enabled
        if (prefs.email && user.email) {
            // Re-use system transporter
            const nodemailer = require('nodemailer');
            const transporter = nodemailer.createTransport({
                service: process.env.EMAIL_SERVICE || 'gmail',
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD }
            });
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: user.email,
                subject: title,
                text: `${message}\n\nView details: ${process.env.FRONTEND_URL || 'http://localhost:5173'}${link || '/'}`
            }).catch(e => console.error('Email error:', e));
        }

        if (prefs.sms && user.mobileNumber) {
            // Shell for Twilio / SMS Gateway
            console.log(`[Twilio Shell] SMS to ${user.mobileNumber}: ${title} - ${message}`);
            // axios.post('https://api.twilio.com/...', { to: user.mobileNumber, body: message }, ...)
        }

        if (prefs.whatsapp && user.mobileNumber) {
            // Shell for WhatsApp Business API (WABA)
            console.log(`[WABA Shell] WhatsApp to ${user.mobileNumber}: ${title}`);
            // axios.post('https://graph.facebook.com/...', { messaging_product: 'whatsapp', to: user.mobileNumber, ... })
        }

        if (prefs.push) {
            // Shell for FCM (Firebase Cloud Messaging)
            console.log(`[FCM Shell] Push to User ${recipient}: ${title}`);
            // admin.messaging().send({ token: user.fcmToken, notification: { title, body: message } })
        }

        return notification;
    } catch (err) {
        console.error('Notification Dispatch Error:', err);
        throw err;
    }
};
