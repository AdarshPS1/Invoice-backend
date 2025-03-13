const Invoice = require('../models/Invoice');
const User = require('../models/User');

// @desc    Get revenue report
// @route   GET /api/reports/revenue
// @access  Admin, Accountant (all clients), Client (own revenue only)


const getFinancialReport = async (req, res) => {
  try {
    let query = {};

    // Filter by start and end dates if provided
    const { startDate, endDate } = req.query;
    if (startDate && endDate) {
      query.dueDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const invoices = await Invoice.find(query);

    // Financial report calculations
    const totalRevenue = invoices.reduce((sum, invoice) => {
      const paidAmount = invoice.payments.reduce((paymentSum, payment) => paymentSum + payment.amount, 0);
      return sum + paidAmount;
    }, 0);

    const totalInvoices = invoices.length;
    const paidInvoices = invoices.filter((invoice) => invoice.status === 'Paid').length;
    const unpaidInvoices = invoices.filter((invoice) => invoice.status !== 'Paid').length;

    // Revenue Summary by month
    const revenueSummary = invoices.reduce((acc, invoice) => {
      const month = new Date(invoice.createdAt).toLocaleString('default', { month: 'long' });
      const paidAmount = invoice.payments.reduce((paymentSum, payment) => paymentSum + payment.amount, 0);
      acc[month] = (acc[month] || 0) + paidAmount;
      return acc;
    }, {});

    // Tax Calculation (18% GST)
    const taxRate = 0.18;
    const totalTax = totalRevenue * taxRate;

    res.status(200).json({
      totalRevenue,
      totalInvoices,
      paidInvoices,
      unpaidInvoices,
      revenueSummary,
      totalTax,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch financial report', error: error.message });
  }
};

module.exports = {
  getFinancialReport,
};

