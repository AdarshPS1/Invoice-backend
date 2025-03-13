const Invoice = require('../models/Invoice');
const Client = require('../models/Client');

// Get dashboard statistics
const getDashboardStats = async (req, res) => {
  try {
    const totalInvoices = await Invoice.countDocuments();
    const totalRevenue = await Invoice.aggregate([
      { $match: { status: 'Paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const pendingPayments = await Invoice.countDocuments({ status: 'Pending' });
    
    // Count all clients in the database instead of just those with invoices
    const activeClients = await Client.countDocuments();

    res.status(200).json({
      totalInvoices,
      totalRevenue: totalRevenue[0]?.total || 0,
      pendingPayments,
      activeClients
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch dashboard stats', error: error.message });
  }
};

// Get monthly data
const getMonthlyData = async (req, res) => {
  try {
    const monthlyData = await Invoice.aggregate([
      { $group: {
          _id: { $month: '$createdAt' },
          revenue: { $sum: '$amount' },
          invoices: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json(monthlyData);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch monthly data', error: error.message });
  }
};

// Get payment status data
const getPaymentStatusData = async (req, res) => {
  try {
    const paymentStatusData = await Invoice.aggregate([
      { $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json(paymentStatusData);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch payment status data', error: error.message });
  }
};

module.exports = {
  getDashboardStats,
  getMonthlyData,
  getPaymentStatusData
}; 