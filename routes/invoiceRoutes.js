const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createInvoice,
  getInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  addPaymentToInvoice,
  getInvoicePayments,
  generateInvoicePDFController,
  viewInvoicePDFController,
} = require('../controllers/invoiceController');
const Client = require('../models/Client');
const jwt = require('jsonwebtoken');

// Get all clients (for invoice creation)
router.get('/clients', protect, async (req, res) => {
  try {
    const clients = await Client.find().select('name _id');
    res.json(clients);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch clients', error: error.message });
  }
});

// Get all invoices
router.get('/', protect, getInvoices);

// Create a new invoice
router.post('/', protect, createInvoice);

// Get a single invoice by ID
router.get('/:id', protect, getInvoiceById);

// Update an invoice
router.put('/:id', protect, updateInvoice);

// Delete an invoice
router.delete('/:id', protect, deleteInvoice);

// Add a payment to an invoice
router.post('/:id/payments', protect, addPaymentToInvoice);

// Get all payments for a specific invoice
router.get('/:id/payments', protect, getInvoicePayments);

// Generate and download an invoice PDF
router.post('/:invoiceId/generate-pdf', protect, generateInvoicePDFController);

// Route to generate and download PDF for an invoice
router.get('/:id/pdf', generateInvoicePDFController);

// Route to view PDF directly in browser (no download)
// This route accepts token in query parameter for iframe compatibility
router.get('/:id/view-pdf', async (req, res, next) => {
  try {
    // Check for token in query parameters (for iframe compatibility)
    const token = req.query.token;
    
    if (token) {
      try {
        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
      } catch (error) {
        return res.status(401).json({ message: 'Invalid token' });
      }
    } else {
      // If no token in query, use the regular auth middleware
      protect(req, res, next);
    }
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized' });
  }
}, viewInvoicePDFController);

module.exports = router;
