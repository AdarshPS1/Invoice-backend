const twilio = require('twilio');
const Invoice = require('../models/Invoice');
const nodemailer = require('nodemailer');
const generateInvoicePDF = require('../utils/pdfGenerator');
const path = require('path');



const sendInvoiceEmail = async (req, res) => {
  const { invoiceId } = req.body;

  if (!invoiceId) {
    return res.status(400).json({ message: 'Missing invoice ID' });
  }

  try {
    // Re-fetch full invoice from DB
    const invoice = await Invoice.findById(invoiceId).populate('client').exec();

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    console.log('Invoice data:', invoice); // Debugging

    // Generate PDF
    const pdfPath = await generateInvoicePDF(invoice);

    // Configure Nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'adhuadzz89@gmail.com',
        pass: 'euxz fgdg lrcj qqox',
      }
    });

    // Email options
    const mailOptions = {
      from: 'adhuadzz89@gmail.com',
      to: invoice.client.email,
      subject: `Invoice ${invoice.invoiceNumber}`,
      text: `Dear ${invoice.client.name},\n\nPlease find attached your invoice (${invoice.invoiceNumber}).\n\nRegards,\nInnoAI`,
      attachments: [{ filename: path.basename(pdfPath), path: pdfPath }],
    };

    console.log('Attempting to send email to:', invoice.client.email); // Log email attempt
    console.log('PDF path:', pdfPath); // Log PDF path
    console.log('Mail options:', mailOptions); // Log mail options

    // Send email
    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: `Invoice sent to ${invoice.client.email} successfully!` });
  } catch (error) {
    console.error('Error sending invoice email:', error); // Existing error log
    console.error('Error details:', error.response || error.message); // Log detailed error
    res.status(500).json({ message: 'Failed to send invoice email' });
  }
};


module.exports = {
  sendInvoiceEmail
  // Export this for use in invoiceController.js
};
