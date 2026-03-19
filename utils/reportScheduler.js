const cron = require('node-cron');
const User = require('../models/User');
const Company = require('../models/Company');
const Transaction = require('../models/Transaction');
const Lead = require('../models/Lead');
const sendEmail = require('./email');

/**
 * Initialize Scheduled Reports
 * Runs every day at 00:00 (Midnight)
 */
const initReportScheduler = () => {
    // 0 0 * * * -> Midnight every day
    // For testing/initialization, we can use a more frequent interval if needed
    cron.schedule('0 0 * * *', async () => {
        console.log('[CRON] Running Midnight Platform Health Report...');
        await generateAndSendDailySummary();
    });
};

const generateAndSendDailySummary = async () => {
    try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(23, 59, 59, 999);

        // Aggregations
        const newUsers = await User.countDocuments({ createdAt: { $gte: yesterday, $lte: today } });
        const newListings = await Company.countDocuments({ createdAt: { $gte: yesterday, $lte: today } });
        const newLeads = await Lead.countDocuments({ createdAt: { $gte: yesterday, $lte: today } });
        
        const revenueData = await Transaction.aggregate([
            { $match: { createdAt: { $gte: yesterday, $lte: today }, status: 'Success' } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const dailyRevenue = revenueData.length > 0 ? revenueData[0].total : 0;

        // Fetch target emails (Super Admins)
        const admins = await User.find({ role: 'Super Admin' }).select('email');
        const adminEmails = admins.map(a => a.email);

        if (adminEmails.length === 0) return;

        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #4f46e5; text-align: center;">Daily Platform Summary</h2>
                <p style="text-align: center; color: #666;">Generated for ${yesterday.toLocaleDateString()}</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div style="background: #f9fafb; padding: 15px; border-radius: 8px;">
                        <h4 style="margin: 0; color: #666;">New Users</h4>
                        <p style="font-size: 24px; font-weight: bold; margin: 5px 0;">${newUsers}</p>
                    </div>
                    <div style="background: #f9fafb; padding: 15px; border-radius: 8px;">
                        <h4 style="margin: 0; color: #666;">New Listings</h4>
                        <p style="font-size: 24px; font-weight: bold; margin: 5px 0;">${newListings}</p>
                    </div>
                    <div style="background: #f9fafb; padding: 15px; border-radius: 8px;">
                        <h4 style="margin: 0; color: #666;">Total Leads</h4>
                        <p style="font-size: 24px; font-weight: bold; margin: 5px 0;">${newLeads}</p>
                    </div>
                    <div style="background: #f9fafb; padding: 15px; border-radius: 8px;">
                        <h4 style="margin: 0; color: #666;">Daily Revenue</h4>
                        <p style="font-size: 24px; font-weight: bold; margin: 5px 0; color: #10b981;">₹${dailyRevenue}</p>
                    </div>
                </div>
                <div style="margin-top: 20px; text-align: center;">
                    <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/reports" style="background: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">View Full Reports</a>
                </div>
                <p style="font-size: 12px; color: #999; text-align: center; margin-top: 30px;">
                    This is an automated system report. You can configure notification settings in the Admin Panel.
                </p>
            </div>
        `;

        for (const email of adminEmails) {
            await sendEmail({
                email,
                subject: `Daily Platform Report - ${yesterday.toLocaleDateString()}`,
                html: emailHtml
            });
        }

        console.log(`[CRON] Daily report sent to ${adminEmails.length} admins.`);
    } catch (err) {
        console.error('[CRON ERROR] Failed to generate daily report:', err.message);
    }
};

module.exports = { initReportScheduler, generateAndSendDailySummary };
