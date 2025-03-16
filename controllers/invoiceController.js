const Invoice = require('../models/Invoice');
const Client = require('../models/Client');
const generateInvoicePDF = require('../utils/pdfGenerator');
const generateSimplePDF = require('../utils/simplePdfGenerator');
const fs = require('fs');

// Get all invoices
const getInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find().populate('client');
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch invoices', error: error.message });
  }
};

// Get a single invoice by ID
const getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('client');
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch invoice', error: error.message });
  }
};

// Create a new invoice
const createInvoice = async (req, res) => {
  try {
    const { client, amount, dueDate, items, currency } = req.body;

    console.log('Received data:', { client, amount, dueDate, currency });

    // Check if client ID is valid and exists
    const existingClient = await Client.findById(client);
    console.log('Fetched client:', existingClient);

    if (!existingClient) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const newInvoice = new Invoice({
      client: client,
      amount,
      dueDate,
      status: 'Pending',
      items: items || [],
      currency: currency || 'USD',
    });

    console.log('Invoice to be saved:', newInvoice); // Log before saving

    await newInvoice.save();

    console.log('Invoice saved:', newInvoice); // Log after saving

    res.status(201).json(newInvoice);
  } catch (error) {
    console.error('Error creating invoice:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update an invoice
const updateInvoice = async (req, res) => {
  const { totalAmount, currency } = req.body;

  console.log('Update request data:', { totalAmount, currency });

  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const paidAmount = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (totalAmount < paidAmount) {
      return res.status(400).json({ message: 'Invoice amount cannot be less than paid amount' });
    }

    invoice.totalAmount = totalAmount;
    invoice.currency = currency || invoice.currency;
    if (invoice.status === 'Paid' && totalAmount > paidAmount) {
      invoice.status = 'Pending';
    }

    console.log('Invoice to be updated:', invoice); // Log before saving

    await invoice.save();

    console.log('Invoice updated:', invoice); // Log after saving

    res.json(invoice);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update invoice', error: error.message });
  }
};

// Delete an invoice
const deleteInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete invoice', error: error.message });
  }
};

// Add a payment to an invoice
const addPaymentToInvoice = async (req, res) => {
  const { referenceNumber, amount, date, remark } = req.body;

  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Calculate total paid including the new payment
    const totalPaid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0) + parseFloat(amount);
    
    // Get the invoice amount (using amount property instead of totalAmount)
    const invoiceAmount = invoice.amount || invoice.totalAmount;

    console.log('Payment calculation:', {
      existingPayments: invoice.payments.reduce((sum, payment) => sum + payment.amount, 0),
      newPayment: parseFloat(amount),
      totalPaid,
      invoiceAmount
    });

    // Check if payment exceeds invoice amount
    if (totalPaid > invoiceAmount) {
      return res.status(400).json({ message: 'Payment exceeds invoice amount' });
    }

    // Add the new payment to the invoice
    invoice.payments.push({ referenceNumber, amount: parseFloat(amount), date, remark });
    
    // Update status if paid in full (using >= to avoid floating point issues)
    if (totalPaid >= invoiceAmount || Math.abs(totalPaid - invoiceAmount) < 0.01) {
      console.log('Invoice fully paid, updating status to Paid');
      invoice.status = 'Paid';
    } else {
      console.log('Invoice partially paid, status remains Pending');
      // Ensure status is 'Pending' if not fully paid
      invoice.status = 'Pending';
    }

    await invoice.save();
    res.json(invoice);
  } catch (error) {
    console.error('Error adding payment:', error);
    res.status(500).json({ message: 'Failed to add payment', error: error.message });
  }
};

// Get all payments for a specific invoice
const getInvoicePayments = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('payments');
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json(invoice.payments);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch payments', error: error.message });
  }
};

// Generate invoice PDF
const generateInvoicePDFController = async (req, res) => {
  try {
    console.log(`Generating PDF for invoice ID: ${req.params.id}`);
    
    // Find the invoice
    const invoice = await Invoice.findById(req.params.id).populate('client');
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    // Validate invoice data
    if (!invoice.items || !Array.isArray(invoice.items) || invoice.items.length === 0) {
      return res.status(400).json({ message: 'Invoice has no items' });
    }
    
    if (!invoice.client) {
      return res.status(400).json({ message: 'Invoice has no client information' });
    }
    
    // Generate the PDF
    let pdfPath;
    try {
      // Try to generate PDF with Puppeteer first
      console.log('Attempting to generate PDF with Puppeteer...');
      pdfPath = await generateInvoicePDF(invoice);
      console.log('Puppeteer PDF generation successful');
    } catch (puppeteerError) {
      console.error('Puppeteer PDF generation failed:', puppeteerError);
      
      // If Puppeteer fails, try the simple PDF generator
      console.log('Falling back to simple PDF generator...');
      try {
        pdfPath = await generateSimplePDF(invoice);
        console.log('Simple PDF generation successful');
      } catch (simplePdfError) {
        console.error('Simple PDF generation also failed:', simplePdfError);
        return res.status(500).json({ 
          message: 'Failed to generate PDF with both methods', 
          error: simplePdfError.message 
        });
      }
    }
    
    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      return res.status(500).json({ message: 'PDF file was not created' });
    }
    
    // Get file stats
    const stats = fs.statSync(pdfPath);
    if (stats.size === 0) {
      return res.status(500).json({ message: 'PDF file is empty' });
    }
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `inline; filename="Invoice_${invoice.invoiceNumber}.pdf"`);
    
    // Send the file
    const fileStream = fs.createReadStream(pdfPath);
    
    // Handle stream errors
    fileStream.on('error', (error) => {
      console.error('Error streaming PDF:', error);
      if (!res.headersSent) {
        return res.status(500).json({ message: 'Error streaming PDF file' });
      }
    });
    
    // Pipe the file to the response
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Controller error:', error);
    return res.status(500).json({ 
      message: 'Server error processing PDF request', 
      error: error.message 
    });
  }
};

module.exports = {
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  addPaymentToInvoice,
  getInvoicePayments,
  generateInvoicePDFController,
};
