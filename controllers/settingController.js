const Setting = require('../models/Setting');

// Get global settings (public or used everywhere so public is fine)
exports.getSettings = async (req, res) => {
    try {
        let settings = await Setting.findOne();

        // If settings doc doesn't exist, create one with defaults
        if (!settings) {
            settings = await Setting.create({});
        }

        res.status(200).json({ success: true, data: settings });
    } catch (error) {
        console.error('Error in getSettings:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Update global settings (Super Admin only)
exports.updateSettings = async (req, res) => {
    try {
        let settings = await Setting.findOne();

        if (!settings) {
            // Should not happen normally if getSettings was called, but handled just in case
            settings = new Setting();
        }

        const {
            siteName,
            logoUrl,
            faviconUrl,
            primaryColor,
            secondaryColor,
            contactEmail,
            contactPhone,
            footerText,
            rankingWeights
        } = req.body;

        if (siteName !== undefined) settings.siteName = siteName;
        if (logoUrl !== undefined) settings.logoUrl = logoUrl;
        if (faviconUrl !== undefined) settings.faviconUrl = faviconUrl;
        if (primaryColor !== undefined) settings.primaryColor = primaryColor;
        if (secondaryColor !== undefined) settings.secondaryColor = secondaryColor;
        if (contactEmail !== undefined) settings.contactEmail = contactEmail;
        if (contactPhone !== undefined) settings.contactPhone = contactPhone;
        if (footerText !== undefined) settings.footerText = footerText;
        if (rankingWeights !== undefined) settings.rankingWeights = rankingWeights;

        await settings.save();

        res.status(200).json({ success: true, message: 'Settings updated successfully', data: settings });
    } catch (error) {
        console.error('Error in updateSettings:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
