const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { sendInvoiceEmail } = require('../controllers/notificationController');

router.post('/send-invoice-email', sendInvoiceEmail);


module.exports = router;
