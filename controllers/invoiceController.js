const Invoice = require('../models/Invoice');
const Client = require('../models/Client');
const generateInvoicePDF = require('../utils/pdfGenerator');

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
    console.log('Generating PDF for invoice ID:', req.params.id);
    
    const invoice = await Invoice.findById(req.params.id).populate('client');
    if (!invoice) {
      console.log('Invoice not found with ID:', req.params.id);
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    console.log('Found invoice:', {
      id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      client: invoice.client?.name,
      items: invoice.items?.length
    });

    const pdfPath = await generateInvoicePDF(invoice);
    console.log('PDF generated successfully at path:', pdfPath);
    
    res.download(pdfPath, `Invoice_${invoice.invoiceNumber}.pdf`, (err) => {
      if (err) {
        console.error('Error sending PDF file:', err);
        // Only send error response if headers haven't been sent yet
        if (!res.headersSent) {
          res.status(500).json({ message: 'Error sending PDF file', error: err.message });
        }
      }
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    
    // Only send error response if headers haven't been sent yet
    if (!res.headersSent) {
      res.status(500).json({ 
        message: 'Failed to generate PDF', 
        error: error.message,
        details: 'This may be due to server configuration issues with Puppeteer.'
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
};
