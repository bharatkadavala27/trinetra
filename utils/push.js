const admin = require('firebase-admin');

// Initialize Firebase Admin gracefully if credentials are fundamentally available
try {
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            })
        });
        console.log('[FIREBASE] Admin SDK Initialized Successfully');
    } else {
        console.log('[FIREBASE] Warning: FCM missing environment variables. Running in Mock Mode.');
    }
} catch (error) {
    console.error('[FIREBASE] Init Error:', error.message);
}

/**
 * Service: FCM Utility to Dispatch Push Notifications
 */
const sendPushNotification = async (targetTokenOrTopic, title, body, data = {}) => {
    try {
        if (!admin.apps.length) {
            console.log(`[PUSH SIMULATOR] To: ${targetTokenOrTopic} | Title: ${title} | Body: ${body}`);
            return { success: true, messageId: `mock-push-${Date.now()}` };
        }

        const message = {
            notification: { title, body },
            data: { ...data, timestamp: String(Date.now()) }
        };

        // Determine if sending to topic or device token
        if (targetTokenOrTopic.startsWith('topic:')) {
            message.topic = targetTokenOrTopic.replace('topic:', '');
        } else {
            message.token = targetTokenOrTopic;
        }

        const response = await admin.messaging().send(message);
        console.log(`[PUSH DELIVERED] Successfully dispatched:`, response);
        return { success: true, messageId: response };

    } catch (err) {
        console.error('[PUSH ERROR]', err.message);
        return { success: false, error: err.message };
    }
};

/**
 * Broadcast to a specific topic
 */
const broadcastPushToTopic = async (topic, title, body, data = {}) => {
    return sendPushNotification(`topic:${topic}`, title, body, data);
};

module.exports = { sendPushNotification, broadcastPushToTopic };
