const Invoice = require('../models/Invoice');

/**
 * Calculate GST (18% standard for SaaS in India)
 * @param {number} amount - Base amount
 * @returns {object} { taxAmount, totalAmount }
 */
const calculateGST = (amount) => {
    const taxRate = 0.18;
    const taxAmount = Math.round(amount * taxRate * 100) / 100;
    const totalAmount = amount + taxAmount;
    return { taxAmount, totalAmount };
};

/**
 * Generate a unique invoice number
 */
const generateInvoiceNumber = () => {
    const prefix = 'INV';
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${timestamp}-${random}`;
};

/**
 * Create a new invoice record
 */
const createInvoice = async (data) => {
    const { businessId, transactionId, amount, billingDetails } = data;
    const { taxAmount, totalAmount } = calculateGST(amount);
    const invoiceNumber = generateInvoiceNumber();

    const invoice = new Invoice({
        businessId,
        transactionId,
        invoiceNumber,
        amount,
        taxAmount,
        totalAmount,
        billingDetails,
        status: 'paid'
    });

    await invoice.save();
    return invoice;
};

module.exports = {
    calculateGST,
    generateInvoiceNumber,
    createInvoice
};
