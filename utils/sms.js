/**
 * Simulated SMS and WhatsApp Service (Twilio/Meta Utility)
 */
const sendSMS = async (phoneNumber, message) => {
    try {
        // In a real implementation:
        // const client = require('twilio')(sid, auth);
        // await client.messages.create({ body: message, from: '+12345', to: phoneNumber });

        console.log(`[SMS SIMULATOR] To: ${phoneNumber} | Message: ${message}`);
        return { success: true, sid: `mock-sms-${Date.now()}` };
    } catch (err) {
        console.error('[SMS ERROR]', err.message);
        return { success: false, error: err.message };
    }
};

const sendWhatsApp = async (phoneNumber, message, mediaUrl = null) => {
    try {
        // In a real implementation:
        // WhatsApp Business API request

        console.log(`[WHATSAPP SIMULATOR] To: ${phoneNumber} | Message: ${message} | Media: ${mediaUrl || 'None'}`);
        return { success: true, messageId: `mock-wa-${Date.now()}` };
    } catch (err) {
        console.error('[WHATSAPP ERROR]', err.message);
        return { success: false, error: err.message };
    }
};

module.exports = { sendSMS, sendWhatsApp };
