const axios = require('axios');

/**
 * Service: SMS Gateway Utility (MSG91 / Twilio JSON API style)
 */
const sendSMS = async (phoneNumber, message) => {
    try {
        if (!process.env.SMS_API_KEY) {
            console.log(`[SMS SIMULATOR] To: ${phoneNumber} | Message: ${message}`);
            return { success: true, sid: `mock-sms-${Date.now()}` };
        }

        // Example for MSG91 / Generic JSON Gateway
        const response = await axios.post('https://api.msg91.com/api/v5/flow/', {
            template_id: process.env.SMS_TEMPLATE_ID,
            short_url: "1",
            recipients: [{ mobiles: phoneNumber, message: message }]
        }, {
            headers: { 'authkey': process.env.SMS_API_KEY, 'content-type': 'application/json' }
        });

        console.log(`[SMS DELIVERED] Response:`, response.data);
        return { success: true, response: response.data };

    } catch (err) {
        console.error('[SMS ERROR]', err.response?.data || err.message);
        return { success: false, error: err.message };
    }
};

/**
 * Service: WhatsApp Business API (Meta Cloud API)
 */
const sendWhatsApp = async (phoneNumber, message, mediaUrl = null) => {
    try {
        if (!process.env.WABA_TOKEN || !process.env.WABA_PHONE_ID) {
            console.log(`[WHATSAPP SIMULATOR] To: ${phoneNumber} | Message: ${message} | Media: ${mediaUrl || 'None'}`);
            return { success: true, messageId: `mock-wa-${Date.now()}` };
        }

        const url = `https://graph.facebook.com/v19.0/${process.env.WABA_PHONE_ID}/messages`;
        
        const payload = {
            messaging_product: "whatsapp",
            to: phoneNumber,
            type: "text",
            text: { body: message }
        };

        if (mediaUrl) {
            payload.type = "image";
            payload.image = { link: mediaUrl, caption: message };
            delete payload.text;
        }

        const response = await axios.post(url, payload, {
            headers: { 'Authorization': `Bearer ${process.env.WABA_TOKEN}`, 'Content-Type': 'application/json' }
        });

        console.log(`[WHATSAPP DELIVERED] Success:`, response.data);
        return { success: true, messageId: response.data.messages?.[0]?.id };

    } catch (err) {
        console.error('[WHATSAPP ERROR]', err.response?.data || err.message);
        return { success: false, error: err.message };
    }
};

module.exports = { sendSMS, sendWhatsApp };
