const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const Transaction = require('../models/Transaction');
const Invoice = require('../models/Invoice');

// @desc    Get current subscription for a business
// @route   GET /api/subscriptions/business/:businessId
// @access  Private
exports.getBusinessSubscription = async (req, res) => {
    try {
        const subscription = await Subscription.findOne({ 
            businessId: req.params.businessId,
            status: { $in: ['active', 'grace_period'] }
        }).populate('planId');
        
        if (!subscription) {
            return res.status(404).json({ msg: 'No active subscription found for this business' });
        }
        
        res.json(subscription);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Mock Checkout and Subscribe
// @route   POST /api/subscriptions/mock-checkout
// @access  Private
exports.mockCheckout = async (req, res) => {
    try {
        const { businessId, planId, billingCycle, amount } = req.body;

        const plan = await Plan.findById(planId);
        if (!plan) return res.status(404).json({ msg: 'Plan not found' });

        // 1. Create Transaction
        const transaction = new Transaction({
            businessId,
            amount,
            status: 'success',
            gateway: 'manual', // Mocking success
            metadata: { planId, billingCycle }
        });
        await transaction.save();

        // 2. Calculate End Date
        const startDate = new Date();
        const endDate = new Date();
        if (billingCycle === 'annual') {
            endDate.setFullYear(endDate.getFullYear() + 1);
        } else {
            endDate.setMonth(endDate.getMonth() + 1);
        }

        // 3. Create or Update Subscription
        let subscription = await Subscription.findOne({ businessId });
        
        if (subscription) {
            subscription.planId = planId;
            subscription.status = 'active';
            subscription.billingCycle = billingCycle;
            subscription.startDate = startDate;
            subscription.endDate = endDate;
            subscription.priceAtPurchase = amount;
            subscription.lastTransactionId = transaction._id;
        } else {
            subscription = new Subscription({
                businessId,
                planId,
                billingCycle,
                startDate,
                endDate,
                priceAtPurchase: amount,
                lastTransactionId: transaction._id
            });
        }
        await subscription.save();

        // 4. Create Invoice
        const invoiceNumber = `INV-${Date.now()}`;
        const invoice = new Invoice({
            businessId,
            transactionId: transaction._id,
            invoiceNumber,
            amount: amount,
            totalAmount: amount, // Simplified for mock
            status: 'paid'
        });
        await invoice.save();

        transaction.subscriptionId = subscription._id;
        await transaction.save();

        res.json({
            success: true,
            subscription,
            invoice
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
