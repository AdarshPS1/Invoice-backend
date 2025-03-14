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
    console.log('Generating PDF for invoice ID:', req.params.id);
    
    const invoice = await Invoice.findById(req.params.id).populate('client');
    if (!invoice) {
      console.error('Invoice not found:', req.params.id);
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    console.log('Found invoice:', {
      id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      client: invoice.client ? invoice.client.name : 'Unknown',
      items: invoice.items ? invoice.items.length : 0
    });
    
    try {
      const pdfPath = await generateInvoicePDF(invoice);
      console.log('PDF generated successfully at:', pdfPath);
      
      // Set appropriate headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Invoice_${invoice.invoiceNumber}.pdf"`);
      
      // Send the file
      res.download(pdfPath, `Invoice_${invoice.invoiceNumber}.pdf`, (err) => {
        if (err) {
          console.error('Error sending PDF file:', err);
          // Don't send another response if headers are already sent
          if (!res.headersSent) {
            res.status(500).json({ message: 'Error sending PDF file', error: err.message });
          }
        }
      });
    } catch (pdfError) {
      console.error('Error generating PDF:', pdfError);
      res.status(500).json({ message: 'Failed to generate PDF', error: pdfError.message });
    }
  } catch (error) {
    console.error('Error in PDF controller:', error);
    res.status(500).json({ message: 'Failed to generate PDF', error: error.message });
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
