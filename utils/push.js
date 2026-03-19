/**
 * Simulated Push Notification Service (FCM Utility)
 */
const sendPushNotification = async (targetTokenOrTopic, title, body, data = {}) => {
    try {
        // In a real implementation:
        // const admin = require('firebase-admin');
        // await admin.messaging().send({ token: targetTokenOrTopic, notification: { title, body }, data });

        console.log(`[PUSH SIMULATOR] To: ${targetTokenOrTopic} | Title: ${title} | Body: ${body}`);
        
        // Mocking successful delivery
        return { success: true, messageId: `mock-push-${Date.now()}` };
    } catch (err) {
        console.error('[PUSH ERROR]', err.message);
        return { success: false, error: err.message };
    }
};

/**
 * Broadcast to a specific topic (e.g., 'all_users')
 */
const broadcastPushToTopic = async (topic, title, body, data = {}) => {
    return sendPushNotification(topic, title, body, data);
};

module.exports = { sendPushNotification, broadcastPushToTopic };
