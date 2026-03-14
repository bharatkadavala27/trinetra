const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    // Note: User needs to update these with real SMTP credentials in .env
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
        port: process.env.SMTP_PORT || 2525,
        auth: {
            user: process.env.SMTP_USER || 'mock_user',
            pass: process.env.SMTP_PASS || 'mock_pass'
        }
    });

    const message = {
        from: `${process.env.FROM_NAME || 'Lead Intelligence'} <${process.env.FROM_EMAIL || 'no-reply@businesslisting.com'}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
        html: options.html
    };

    try {
        const info = await transporter.sendMail(message);
        console.log(`[EMAIL] Sent to ${options.email}: ${info.messageId}`);
    } catch (err) {
        console.error(`[EMAIL ERROR] Failed to send to ${options.email}:`, err.message);
    }
};

module.exports = sendEmail;
