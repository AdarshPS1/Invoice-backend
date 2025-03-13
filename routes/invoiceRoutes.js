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
} = require('../controllers/invoiceController');
const Client = require('../models/Client');

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

// Route to generate PDF for an invoice
router.get('/:id/pdf', generateInvoicePDFController);

module.exports = router;
