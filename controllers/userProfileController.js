const User = require('../models/User');
const Company = require('../models/Company');

// @desc    Get current user profile
// @route   GET /api/me/profile
// @access  Private
exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        res.json({ success: true, data: user });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Update user profile
// @route   PUT /api/me/profile
// @access  Private
exports.updateProfile = async (req, res) => {
    try {
        const { name, profilePhoto, location, notificationPreferences, privacySettings } = req.body;
        
        const fieldsToUpdate = {};
        if (name) fieldsToUpdate.name = name;
        if (profilePhoto) fieldsToUpdate.profilePhoto = profilePhoto;
        if (location) fieldsToUpdate.location = location;
        if (notificationPreferences) fieldsToUpdate.notificationPreferences = notificationPreferences;
        if (privacySettings) fieldsToUpdate.privacySettings = privacySettings;

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: fieldsToUpdate },
            { new: true, runValidators: true }
        );

        res.json({ success: true, data: user });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get saved listings
// @route   GET /api/me/saved
// @access  Private
exports.getSavedListings = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('savedListings');
        res.json({ success: true, data: user.savedListings });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Toggle saved listing
// @route   POST /api/me/saved/toggle
// @access  Private
exports.toggleSaveListing = async (req, res) => {
    try {
        const { businessId } = req.body;
        const user = await User.findById(req.user.id);
        
        const index = user.savedListings.indexOf(businessId);
        if (index > -1) {
            user.savedListings.splice(index, 1);
            await user.save();
            return res.json({ success: true, msg: 'Removed from saved', saved: false });
        } else {
            user.savedListings.push(businessId);
            await user.save();
            return res.json({ success: true, msg: 'Saved successfully', saved: true });
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Manage address book
// @route   POST /api/me/addresses
// @access  Private
exports.manageAddressBook = async (req, res) => {
    try {
        const { action, addressId, label, address, isDefault } = req.body;
        const user = await User.findById(req.user.id);

        if (action === 'add') {
            if (isDefault) user.addressBook.forEach(a => a.isDefault = false);
            user.addressBook.push({ label, address, isDefault });
        } else if (action === 'remove') {
            user.addressBook = user.addressBook.filter(a => a._id.toString() !== addressId);
        } else if (action === 'update') {
            const addr = user.addressBook.id(addressId);
            if (addr) {
                if (isDefault) user.addressBook.forEach(a => a.isDefault = false);
                addr.label = label || addr.label;
                addr.address = address || addr.address;
                addr.isDefault = isDefault !== undefined ? isDefault : addr.isDefault;
            }
        }

        await user.save();
        res.json({ success: true, data: user.addressBook });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};
