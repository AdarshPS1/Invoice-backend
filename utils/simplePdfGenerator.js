const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

/**
 * A simple fallback PDF generator that uses PDFKit instead of Puppeteer
 * This is used when Puppeteer fails to generate a PDF
 */
const generateSimplePDF = async (invoice, htmlContent) => {
  try {
    console.log('Using simple PDF generator fallback for invoice:', invoice?._id);

    // Create invoices directory if it doesn't exist
    const invoicesDir = path.join(__dirname, '..', 'invoices');
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }

    // Sanitize filename
    const sanitizeFilename = (filename) => {
      if (!filename || typeof filename !== 'string') {
        return 'Invoice_Unknown_' + Date.now();
      }
      return filename.replace(/[\/\\?%*:|"<>]/g, '-');
    };

    const pdfFilename = `Invoice_${sanitizeFilename(invoice.invoiceNumber)}_simple.pdf`;
    const pdfPath = path.join(invoicesDir, pdfFilename);

    // Create a PDF document
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(pdfPath);

    // Pipe the PDF to the file
    doc.pipe(stream);

    // Add content to the PDF
    doc.fontSize(20).text('Tax Invoice', { align: 'center' });
    doc.moveDown();
    
    // Company info
    doc.fontSize(12).text('InnoAI Technologies Pvt Ltd', { align: 'center' });
    doc.fontSize(10).text('VRA A 39, Kallummoodu, Anayara, Thiruvananthapuram, Kerala 695029', { align: 'center' });
    doc.moveDown();

    // Invoice details
    doc.fontSize(12).text(`Invoice Number: ${invoice.invoiceNumber}`);
    doc.fontSize(10).text(`Date: ${new Date(invoice.date).toLocaleDateString()}`);
    doc.fontSize(10).text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`);
    doc.moveDown();

    // Client details
    doc.fontSize(12).text('Client Details:');
    doc.fontSize(10).text(`Name: ${invoice.client?.name || 'N/A'}`);
    doc.fontSize(10).text(`Email: ${invoice.client?.email || 'N/A'}`);
    doc.fontSize(10).text(`Phone: ${invoice.client?.phone || 'N/A'}`);
    doc.moveDown();

    // Items table
    doc.fontSize(12).text('Invoice Items:');
    doc.moveDown(0.5);

    // Table headers
    const tableTop = doc.y;
    const itemX = 50;
    const descriptionX = 100;
    const quantityX = 300;
    const rateX = 350;
    const amountX = 450;

    doc.fontSize(10)
      .text('No.', itemX, tableTop)
      .text('Description', descriptionX, tableTop)
      .text('Qty', quantityX, tableTop)
      .text('Rate', rateX, tableTop)
      .text('Amount', amountX, tableTop);

    // Draw a line
    doc.moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke();

    // Table rows
    let tableRow = tableTop + 25;

    // Format currency
    const formatCurrency = (amount, currency = 'USD') => {
      const currencySymbols = {
        'USD': '$',
        'INR': '₹',
        'AUD': 'A$'
      };
      
      const symbol = currencySymbols[currency] || currencySymbols['USD'];
      const formattedAmount = amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      
      return `${symbol}${formattedAmount}`;
    };

    // Add items
    if (Array.isArray(invoice.items)) {
      invoice.items.forEach((item, i) => {
        doc.fontSize(10)
          .text((i + 1).toString(), itemX, tableRow)
          .text(item.description || 'No description', descriptionX, tableRow, { width: 180 })
          .text(item.quantity?.toString() || '1', quantityX, tableRow)
          .text(formatCurrency(item.rate || 0, invoice.currency), rateX, tableRow)
          .text(formatCurrency((item.quantity || 0) * (item.rate || 0), invoice.currency), amountX, tableRow);
        
        tableRow += 20;
        
        // Add a new page if we're at the bottom
        if (tableRow > 700) {
          doc.addPage();
          tableRow = 50;
        }
      });
    }

    // Draw a line
    doc.moveTo(50, tableRow)
      .lineTo(550, tableRow)
      .stroke();

    // Total
    const totalAmount = Array.isArray(invoice.items) 
      ? invoice.items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.rate || 0)), 0)
      : 0;

    tableRow += 15;
    doc.fontSize(10)
      .text('Total:', 350, tableRow)
      .text(formatCurrency(totalAmount, invoice.currency), amountX, tableRow);

    // Finalize the PDF
    doc.end();

    // Wait for the stream to finish
    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        console.log('Simple PDF generated successfully at:', pdfPath);
        resolve(pdfPath);
      });
      
      stream.on('error', (err) => {
        console.error('Error generating simple PDF:', err);
        reject(err);
      });
    });
  } catch (err) {
    console.error('Error in simple PDF generator:', err);
    throw err;
  }
};

module.exports = generateSimplePDF; 