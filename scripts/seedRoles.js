const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const RBACRole = require('../models/RBACRole');

const seedRoles = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/business_listing');
        console.log('Connected to MongoDB for role seeding...');

        const roles = Object.keys(RBACRole.defaultPermissions);

        for (const roleName of roles) {
            const existingRole = await RBACRole.findOne({ name: roleName });
            const permissions = RBACRole.defaultPermissions[roleName];

            if (existingRole) {
                console.log(`Updating existing role: ${roleName}`);
                existingRole.permissions = permissions;
                await existingRole.save();
            } else {
                console.log(`Creating new role: ${roleName}`);
                await RBACRole.create({
                    name: roleName,
                    permissions,
                    isBuiltIn: true,
                    description: `Standard ${roleName} role with predefined access levels.`
                });
            }
        }

        console.log('Role seeding completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Error seeding roles:', err);
        process.exit(1);
    }
};

seedRoles();
