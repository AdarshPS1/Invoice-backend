const express = require('express');
const router = express.Router();
const { getDashboardStats, getMonthlyData, getPaymentStatusData } = require('../controllers/dashboardController');

// Route to get dashboard statistics
router.get('/stats', getDashboardStats);

// Route to get monthly data
router.get('/monthly-data', getMonthlyData);

// Route to get payment status data
router.get('/payment-status', getPaymentStatusData);

module.exports = router; 