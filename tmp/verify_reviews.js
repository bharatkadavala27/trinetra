const mongoose = require('mongoose');
const Company = require('../models/Company');
const Review = require('../models/Review');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/trinetra';

// Mock the controller's helper logic since we are running as a standalone script
const recalculateCompanyRating = async (businessId) => {
    const reviews = await Review.find({ businessId, status: 'Approved' });
    const company = await Company.findById(businessId);
    
    if (company) {
        if (reviews.length > 0) {
            const reviewCount = reviews.length;
            const avgRating = reviews.reduce((acc, item) => item.rating + acc, 0) / reviewCount;
            company.rating = parseFloat(avgRating.toFixed(1));
            company.reviewCount = reviewCount;
        } else {
            company.rating = 0;
            company.reviewCount = 0;
        }
        await company.save();
        console.log(`Updated Company: ${company.name} | Rating: ${company.rating} | Count: ${company.reviewCount}`);
    }
};

async function runTest() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to DB');

        // 1. Find a test business
        const business = await Company.findOne({ slug: 'transformers-solutions-rajkot' });
        if (!business) {
            console.error('Test business not found');
            process.exit(1);
        }
        console.log(`Testing with: ${business.name} (Current Rating: ${business.rating})`);

        // Use a dummy user ID
        const dummyUserId = new mongoose.Types.ObjectId();

        // 2. Clear existing reviews for this business to start fresh
        await Review.deleteMany({ businessId: business._id });
        await recalculateCompanyRating(business._id);

        // 3. Add a 5-star review
        console.log('Adding 5-star review...');
        const r1 = new Review({
            businessId: business._id,
            userId: dummyUserId,
            rating: 5,
            comment: 'Excellent service!',
            status: 'Approved'
        });
        await r1.save();
        await recalculateCompanyRating(business._id);

        // 4. Add a 1-star review
        console.log('Adding 1-star review...');
        const r2 = new Review({
            businessId: business._id,
            userId: dummyUserId,
            rating: 1,
            comment: 'Not good.',
            status: 'Approved'
        });
        await r2.save();
        await recalculateCompanyRating(business._id);

        // 5. Verify average (should be 3.0)
        const updatedBiz = await Company.findById(business._id);
        if (updatedBiz.rating === 3.0 && updatedBiz.reviewCount === 2) {
            console.log('✅ Success: Rating calculation is correct (3.0)');
        } else {
            console.error(`❌ Failure: Expected 3.0, got ${updatedBiz.rating}`);
        }

        // 6. Test deletion
        console.log('Deleting 1-star review...');
        await Review.deleteOne({ _id: r2._id });
        await recalculateCompanyRating(business._id);

        const finalBiz = await Company.findById(business._id);
        if (finalBiz.rating === 5.0 && finalBiz.reviewCount === 1) {
            console.log('✅ Success: Recalculation after deletion is correct (5.0)');
        } else {
            console.error(`❌ Failure after deletion: Expected 5.0, got ${finalBiz.rating}`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

runTest();
