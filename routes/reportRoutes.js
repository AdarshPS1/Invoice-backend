const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { getFinancialReport  } = require('../controllers/reportController');

// Get revenue report
// Admin & Accountant: All clients' revenues
// Client: Own revenue only
router.get('/financial-report', protect, authorize('admin', 'accountant'), getFinancialReport);
    

module.exports = router;
