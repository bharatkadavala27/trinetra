require('dotenv').config();
const mongoose = require('mongoose');
const Company = require('./models/Company');

async function checkBusiness() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB Atlas');

        const testBusiness = await Company.findOne({ name: /Test Business/i });
        if (testBusiness) {
            console.log('SUCCESS: Found "Test Business" in DB:');
            console.log(JSON.stringify(testBusiness, null, 2));
        } else {
            console.log('FAILURE: "Test Business" NOT found in DB.');
            const lastThree = await Company.find().sort({ createdAt: -1 }).limit(3);
            console.log('Last 3 businesses added:');
            console.log(JSON.stringify(lastThree, null, 2));
        }
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkBusiness();
