const mongoose = require('mongoose');
const User = require('./models/User');
const Company = require('./models/Company');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/justdial';

async function check() {
    try {
        await mongoose.connect(MONGO_URI);
        const user = await User.findOne({ email: 'test@gmail.comm' });
        if (!user) {
            console.log('User not found');
            process.exit(1);
        }
        console.log('User ID:', user._id);
        
        const companies = await Company.find({ owner: user._id });
        console.log('Owned Company IDs:', companies.map(c => c._id.toString()));
        console.log('Owned Company Names:', companies.map(c => c.name));
        
        const allCompanies = await Company.find();
        console.log('All Company Names & Owners:');
        allCompanies.forEach(c => {
            console.log(`- ${c.name} (Owner ID: ${c.owner})`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
