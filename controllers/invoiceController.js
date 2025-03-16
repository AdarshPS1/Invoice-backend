const Invoice = require('../models/Invoice');
const Client = require('../models/Client');
const generateInvoicePDF = require('../utils/pdfGenerator');
const generateFallbackPDF = require('../utils/fallbackPdfGenerator');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

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
  const { client, amount, dueDate, items, currency } = req.body;

  console.log('Update request data:', req.body);

  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Check if client exists if client ID is provided
    if (client) {
      const existingClient = await Client.findById(client);
      if (!existingClient) {
        return res.status(404).json({ message: 'Client not found' });
      }
      invoice.client = client;
    }

    // Calculate total paid amount
    const paidAmount = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
    
    // Validate that new amount is not less than paid amount
    if (amount !== undefined && amount < paidAmount) {
      return res.status(400).json({ message: 'Invoice amount cannot be less than paid amount' });
    }

    // Update invoice fields if provided
    if (amount !== undefined) invoice.amount = amount;
    if (dueDate) invoice.dueDate = dueDate;
    if (currency) invoice.currency = currency;
    if (items) invoice.items = items;

    // Update status if needed
    if (invoice.status === 'Paid' && amount > paidAmount) {
      invoice.status = 'Pending';
    }

    console.log('Invoice to be updated:', invoice); // Log before saving

    await invoice.save();

    console.log('Invoice updated:', invoice); // Log after saving

    res.json(invoice);
  } catch (error) {
    console.error('Error updating invoice:', error);
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
    const logger = require('../utils/logger');
    logger.info(`Generating PDF for invoice ID: ${req.params.id}`);
    
    const invoice = await Invoice.findById(req.params.id).populate('client');
    if (!invoice) {
      logger.warn(`Invoice not found with ID: ${req.params.id}`);
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    logger.info(`Found invoice: ${invoice._id}, number: ${invoice.invoiceNumber}, client: ${invoice.client?.name}`);

    // Check if PDF already exists in cache
    const invoicesDir = path.join(__dirname, '..', 'invoices');
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }
    
    const sanitizeFilename = (filename) => {
      if (!filename || typeof filename !== 'string') {
        return 'Invoice_Unknown_' + Date.now();
      }
      return filename.replace(/[\/\\?%*:|"<>]/g, '-');
    };
    
    const pdfFilename = `Invoice_${sanitizeFilename(invoice.invoiceNumber)}.pdf`;
    const pdfPath = path.join(invoicesDir, pdfFilename);
    
    // Check if we need to regenerate the PDF
    const shouldRegeneratePdf = !fs.existsSync(pdfPath) || req.query.refresh === 'true';
    
    if (shouldRegeneratePdf) {
      logger.info('Generating new PDF...');
      try {
        // Always try Puppeteer first for consistent appearance
        logger.info('Attempting to generate PDF with Puppeteer...');
        const generatedPath = await generateInvoicePDF(invoice);
        logger.info(`PDF generated successfully with Puppeteer at path: ${generatedPath}`);
      } catch (puppeteerError) {
        logger.error(`Puppeteer PDF generation failed: ${puppeteerError.message}`);
        logger.info('Falling back to PDFKit generator...');
        
        // If Puppeteer fails, use the fallback generator
        try {
          const fallbackPath = await generateFallbackPDF(invoice);
          logger.info(`Fallback PDF generated successfully at path: ${fallbackPath}`);
        } catch (fallbackError) {
          logger.error(`Fallback PDF generation also failed: ${fallbackError.message}`);
          throw new Error('Both PDF generation methods failed');
        }
      }
    } else {
      logger.info(`Using cached PDF from: ${pdfPath}`);
    }
    
    // Send the PDF file
    res.download(pdfPath, `Invoice_${invoice.invoiceNumber}.pdf`, (err) => {
      if (err) {
        logger.error(`Error sending PDF file: ${err.message}`);
        // Only send error response if headers haven't been sent yet
        if (!res.headersSent) {
          res.status(500).json({ message: 'Error sending PDF file', error: err.message });
        }
      }
    });
  } catch (error) {
    const logger = require('../utils/logger');
    logger.error(`Error generating PDF: ${error.message}`);
    logger.error(`Stack trace: ${error.stack || 'No stack trace available'}`);
    
    // Only send error response if headers haven't been sent yet
    if (!res.headersSent) {
      res.status(500).json({ 
        message: 'Failed to generate PDF', 
        error: error.message,
        details: 'This may be due to server configuration issues with PDF generation.'
      });
    }
  }
};

// View invoice PDF directly in browser
const viewInvoicePDFController = async (req, res) => {
  try {
    const logger = require('../utils/logger');
    logger.info(`Viewing PDF for invoice ID: ${req.params.id}`);
    
    // Verify token if provided
    if (req.query.token) {
      try {
        jwt.verify(req.query.token, process.env.JWT_SECRET);
        logger.info('Token verification successful');
      } catch (tokenError) {
        logger.error(`Token verification failed: ${tokenError.message}`);
        return res.status(401).json({ message: 'Invalid or expired token' });
      }
    } else {
      // If no token, check if user is authenticated through session
      if (!req.user) {
        logger.warn('Unauthorized access attempt to view PDF');
        return res.status(401).json({ message: 'Authentication required' });
      }
    }
    
    const invoice = await Invoice.findById(req.params.id).populate('client');
    if (!invoice) {
      logger.warn(`Invoice not found with ID: ${req.params.id}`);
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    // Check if PDF already exists in cache
    const invoicesDir = path.join(__dirname, '..', 'invoices');
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }
    
    const sanitizeFilename = (filename) => {
      if (!filename || typeof filename !== 'string') {
        return 'Invoice_Unknown_' + Date.now();
      }
      return filename.replace(/[\/\\?%*:|"<>]/g, '-');
    };
    
    const pdfFilename = `Invoice_${sanitizeFilename(invoice.invoiceNumber)}.pdf`;
    const pdfPath = path.join(invoicesDir, pdfFilename);
    
    // Check if we need to regenerate the PDF
    const shouldRegeneratePdf = !fs.existsSync(pdfPath) || req.query.refresh === 'true';
    
    if (shouldRegeneratePdf) {
      logger.info('Generating new PDF for viewing...');
      try {
        // Always try Puppeteer first for consistent appearance
        logger.info('Attempting to generate PDF with Puppeteer for viewing...');
        const generatedPath = await generateInvoicePDF(invoice);
        logger.info(`PDF generated successfully with Puppeteer at path: ${generatedPath}`);
      } catch (puppeteerError) {
        logger.error(`Puppeteer PDF generation failed: ${puppeteerError.message}`);
        logger.info('Falling back to PDFKit generator...');
        
        // If Puppeteer fails, use the fallback generator
        try {
          const fallbackPath = await generateFallbackPDF(invoice);
          logger.info(`Fallback PDF generated successfully at path: ${fallbackPath}`);
        } catch (fallbackError) {
          logger.error(`Fallback PDF generation also failed: ${fallbackError.message}`);
          throw new Error('Both PDF generation methods failed');
        }
      }
    } else {
      logger.info(`Using cached PDF for viewing from: ${pdfPath}`);
    }
    
    // Check if file exists before streaming
    if (!fs.existsSync(pdfPath)) {
      logger.error(`PDF file not found at path: ${pdfPath}`);
      return res.status(404).json({ message: 'PDF file not found' });
    }
    
    // Set headers for PDF viewing in browser
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Invoice_${invoice.invoiceNumber}.pdf"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);
    
    // Handle errors in the stream
    fileStream.on('error', (err) => {
      logger.error(`Error streaming PDF: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error streaming PDF', error: err.message });
      }
    });
  } catch (error) {
    const logger = require('../utils/logger');
    logger.error(`Error viewing PDF: ${error.message}`);
    logger.error(`Stack trace: ${error.stack || 'No stack trace available'}`);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        message: 'Failed to view PDF', 
        error: error.message,
        details: 'This may be due to server configuration issues with PDF generation.'
      });
    }
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
  viewInvoicePDFController,
};
