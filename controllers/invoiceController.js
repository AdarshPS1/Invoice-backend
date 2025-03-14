const Invoice = require('../models/invoiceModel');
const Item = require('../models/itemModel');
const Client = require('../models/clientModel');
const fs = require('fs');
const path = require('path');
const { generateInvoicePDF } = require('../utils/pdfGenerator');

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
    const invoiceId = req.params.id;
    console.log('Generating PDF for invoice ID:', invoiceId);

    // Find the invoice
    const invoice = await Invoice.findById(invoiceId)
      .populate('client')
      .populate('items.item');

    if (!invoice) {
      console.error('Invoice not found:', invoiceId);
      return res.status(404).json({ message: 'Invoice not found' });
    }

    console.log('Invoice found, preparing data for PDF generation');
    
    // Prepare data for PDF generation
    const invoiceData = {
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date,
      dueDate: invoice.dueDate,
      clientName: invoice.client.name,
      clientEmail: invoice.client.email,
      clientPhone: invoice.client.phone,
      clientAddress: invoice.client.address,
      currency: invoice.currency || 'INR',
      paymentTerms: invoice.paymentTerms || 'Net 30',
      items: invoice.items.map(item => ({
        description: item.description,
        sac: item.sac || '998314',
        quantity: item.quantity,
        rate: item.rate,
        amount: (item.quantity * item.rate).toFixed(2)
      })),
      totalAmount: invoice.totalAmount.toFixed(2),
      amountInWords: convertNumberToWords(invoice.totalAmount)
    };

    console.log('Calling PDF generator');
    
    // Generate PDF
    const result = await generateInvoicePDF(invoiceData);
    
    console.log('PDF generation result:', result);
    
    // Check if we have a PDF or HTML fallback
    if (result.pdfPath && fs.existsSync(result.pdfPath)) {
      console.log('Sending PDF file');
      
      // Set headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Invoice_${invoice.invoiceNumber}.pdf"`);
      
      // Send the file
      const fileStream = fs.createReadStream(result.pdfPath);
      fileStream.pipe(res);
      
      // Handle errors in the stream
      fileStream.on('error', (err) => {
        console.error('Error streaming PDF file:', err);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Error streaming PDF file' });
        }
      });
    } 
    else if (result.htmlPath && fs.existsSync(result.htmlPath)) {
      console.log('Sending HTML fallback');
      
      // Set headers for HTML
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `inline; filename="Invoice_${invoice.invoiceNumber}.html"`);
      
      // Send the HTML file
      const fileStream = fs.createReadStream(result.htmlPath);
      fileStream.pipe(res);
      
      // Handle errors in the stream
      fileStream.on('error', (err) => {
        console.error('Error streaming HTML file:', err);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Error streaming HTML file' });
        }
      });
    } 
    else {
      console.log('Generating simple HTML response');
      
      // Generate a simple HTML response
      const htmlContent = generateSimpleInvoiceHtml(invoiceData);
      
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
    }
  } catch (error) {
    console.error('Error in generateInvoicePDFController:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Error generating invoice document', error: error.message });
    }
  }
};

// Helper function to generate a simple HTML invoice
function generateSimpleInvoiceHtml(invoice) {
  // Calculate total
  let total = 0;
  const itemsHtml = invoice.items.map((item, index) => {
    const amount = parseFloat(item.amount) || 0;
    total += amount;
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${item.description}</td>
        <td>${item.quantity}</td>
        <td>${item.rate}</td>
        <td>${amount.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Invoice ${invoice.invoiceNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
        .total { font-weight: bold; text-align: right; }
        .header, .client-info { margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>INVOICE #${invoice.invoiceNumber}</h1>
        <p>Date: ${invoice.date}</p>
        <p>Due Date: ${invoice.dueDate}</p>
      </div>
      
      <div class="client-info">
        <h2>Bill To:</h2>
        <p>${invoice.clientName}</p>
        <p>Email: ${invoice.clientEmail}</p>
        <p>Phone: ${invoice.clientPhone}</p>
        <p>Address: ${invoice.clientAddress}</p>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Description</th>
            <th>Quantity</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4" class="total">Total:</td>
            <td>${total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      
      <p>Amount in words: ${invoice.amountInWords}</p>
      <p>Thank you for your business!</p>
    </body>
    </html>
  `;
}

// Helper function to convert number to words
function convertNumberToWords(number) {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  
  const numString = number.toString();
  
  if (number < 0) return 'minus ' + convertNumberToWords(Math.abs(number));
  if (number === 0) return 'zero';
  
  // Handle decimal part
  if (numString.includes('.')) {
    const parts = numString.split('.');
    return convertNumberToWords(parseInt(parts[0])) + ' point ' + 
           (parts[1] ? convertNumberToWords(parseInt(parts[1])) : 'zero');
  }
  
  if (number < 20) return ones[number];
  
  if (number < 100) {
    return tens[Math.floor(number / 10)] + (number % 10 ? ' ' + ones[number % 10] : '');
  }
  
  if (number < 1000) {
    return ones[Math.floor(number / 100)] + ' hundred' + (number % 100 ? ' and ' + convertNumberToWords(number % 100) : '');
  }
  
  if (number < 100000) {
    return convertNumberToWords(Math.floor(number / 1000)) + ' thousand' + (number % 1000 ? ' ' + convertNumberToWords(number % 1000) : '');
  }
  
  if (number < 10000000) {
    return convertNumberToWords(Math.floor(number / 100000)) + ' lakh' + (number % 100000 ? ' ' + convertNumberToWords(number % 100000) : '');
  }
  
  return convertNumberToWords(Math.floor(number / 10000000)) + ' crore' + (number % 10000000 ? ' ' + convertNumberToWords(number % 10000000) : '');
}

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
