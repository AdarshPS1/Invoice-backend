const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const logger = require('./logger');

// Format amount based on currency
function formatCurrency(amount, currency = 'USD') {
  const currencySymbols = {
    'USD': '$',
    'INR': '₹',
    'AUD': 'A$',
    'EUR': '€',
    'GBP': '£'
  };
  
  const symbol = currencySymbols[currency] || currency;
  
  // Format with 2 decimal places
  const formattedAmount = parseFloat(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  
  return `${symbol}${formattedAmount}`;
}

function convertAmountToWords(amount) {
  const words = [
    'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];
  
  // Function to convert a number from 1-999 to words
  function convertChunk(num) {
    let result = '';
    
    // Handle hundreds
    if (num >= 100) {
      result += words[Math.floor(num / 100)] + ' Hundred';
      num %= 100;
      if (num > 0) result += ' and ';
    }
    
    // Handle tens and ones
    if (num > 0) {
      if (num < 20) {
        result += words[num];
      } else {
        result += tens[Math.floor(num / 10)];
        if (num % 10 > 0) {
          result += '-' + words[num % 10];
        }
      }
    }
    
    return result;
  }
  
  // Handle zero
  if (amount === 0) return 'Zero';
  
  let result = '';
  let chunkIndex = 0;
  
  // Process each 3-digit chunk from right to left
  while (amount > 0) {
    if (amount % 1000 !== 0) {
      const chunkWords = convertChunk(amount % 1000);
      result = chunkWords + (chunkIndex > 0 ? ' ' + scales[chunkIndex] + ' ' : '') + result;
    }
    
    amount = Math.floor(amount / 1000);
    chunkIndex++;
  }
  
  return result.trim();
}

// Format date values
const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const generateFallbackPDF = async (invoice) => {
  try {
    logger.info(`Using fallback PDF generator for invoice: ${invoice.invoiceNumber}`);
    
    // Validate invoice data
    if (!invoice || typeof invoice !== 'object') {
      throw new Error('Invalid invoice data');
    }

    if (!invoice.invoiceNumber) {
      throw new Error('Missing invoiceNumber in invoice data');
    }

    // Calculate total amount
    const totalAmount = Array.isArray(invoice.items) 
      ? invoice.items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.rate || 0)), 0)
      : 0;

    // Create directory for invoices if it doesn't exist
    const invoicesDir = path.join(__dirname, '..', 'invoices');
    if (!fs.existsSync(invoicesDir)) {
      logger.info(`Creating invoices directory at ${invoicesDir}`);
      fs.mkdirSync(invoicesDir, { recursive: true });
    }

    // Sanitize filename
    const sanitizeFilename = (filename) => {
      if (!filename || typeof filename !== 'string') {
        return 'Invoice_Unknown_' + Date.now();
      }
      return filename.replace(/[\/\\?%*:|"<>]/g, '-');
    };

    const pdfFilename = `Invoice_${sanitizeFilename(invoice.invoiceNumber)}.pdf`;
    const pdfPath = path.join(invoicesDir, pdfFilename);
    
    logger.info(`Fallback PDF will be saved to: ${pdfPath}`);

    // Create a new PDF document
    const doc = new PDFDocument({ 
      margin: 30,
      size: 'A4'
    });
    
    // Pipe the PDF to a file
    doc.pipe(fs.createWriteStream(pdfPath));

    // Add header with border
    doc.rect(30, 30, doc.page.width - 60, 40).stroke();
    doc.fontSize(18).text('TAX INVOICE', { align: 'center' });
    doc.moveDown();

    // Add company header section
    const headerY = doc.y;
    
    // Logo section (left)
    doc.rect(30, headerY, 150, 80).stroke();
    doc.fontSize(14).text('InnoAI', 60, headerY + 20, { align: 'center', width: 90 });
    doc.fontSize(10).text('Technologies', 60, headerY + 40, { align: 'center', width: 90 });
    
    // Invoice details section (right)
    doc.rect(180, headerY, doc.page.width - 210, 80).stroke();
    
    // Create a grid for invoice details
    const detailsX = 190;
    const detailsWidth = (doc.page.width - 210) / 2;
    
    // First row
    doc.rect(180, headerY, detailsWidth, 40).stroke();
    doc.rect(180 + detailsWidth, headerY, detailsWidth, 40).stroke();
    doc.fontSize(10).text('Invoice No.', detailsX, headerY + 5);
    doc.fontSize(10).text(invoice.invoiceNumber, detailsX, headerY + 20);
    doc.fontSize(10).text('Dated', detailsX + detailsWidth + 10, headerY + 5);
    doc.fontSize(10).text(formatDate(invoice.date || new Date()), detailsX + detailsWidth + 10, headerY + 20);
    
    // Second row
    doc.rect(180, headerY + 40, detailsWidth, 40).stroke();
    doc.rect(180 + detailsWidth, headerY + 40, detailsWidth, 40).stroke();
    doc.fontSize(10).text('Due Date', detailsX, headerY + 45);
    doc.fontSize(10).text(formatDate(invoice.dueDate), detailsX, headerY + 60);
    doc.fontSize(10).text('Currency', detailsX + detailsWidth + 10, headerY + 45);
    doc.fontSize(10).text(invoice.currency || 'USD', detailsX + detailsWidth + 10, headerY + 60);
    
    // Move down after the header section
    doc.y = headerY + 90;

    // Add company info box
    doc.rect(30, doc.y, doc.page.width - 60, 80).stroke();
    doc.fontSize(12).text('InnoAI Technologies Pvt Ltd', 40, doc.y + 10);
    doc.fontSize(10).text('VRA A 39, Kallummoodu, Anayara,', 40, doc.y + 25);
    doc.text('Thiruvananthapuram, Kerala 695029', 40, doc.y + 40);
    doc.text('GSTIN/UIN: 32AABCI1234A1Z5', 40, doc.y + 55);
    doc.text('Contact: +91 9876543210 | Email: info@innoai.com', 40, doc.y + 70);
    
    // Move down after the company info
    doc.y += 90;

    // Add client information
    doc.rect(30, doc.y, doc.page.width - 60, 60).stroke();
    doc.fontSize(12).text('Buyer:', 40, doc.y + 10);
    doc.fontSize(10).text(`Name: ${invoice.client?.name || 'N/A'}`, 40, doc.y + 25);
    doc.text(`Email: ${invoice.client?.email || 'N/A'}`, 40, doc.y + 40);
    doc.text(`Phone: ${invoice.client?.phone || 'N/A'}`, 300, doc.y + 40);
    
    // Move down after client info
    doc.y += 70;

    // Add invoice items table
    // Table headers
    const tableTop = doc.y;
    const tableWidth = doc.page.width - 60;
    
    // Column widths as percentages of table width
    const colWidths = {
      no: 0.05,
      desc: 0.40,
      sac: 0.10,
      qty: 0.10,
      rate: 0.15,
      amount: 0.20
    };
    
    // Calculate column positions
    const colPos = {
      no: 30,
      desc: 30 + tableWidth * colWidths.no,
      sac: 30 + tableWidth * (colWidths.no + colWidths.desc),
      qty: 30 + tableWidth * (colWidths.no + colWidths.desc + colWidths.sac),
      rate: 30 + tableWidth * (colWidths.no + colWidths.desc + colWidths.sac + colWidths.qty),
      amount: 30 + tableWidth * (colWidths.no + colWidths.desc + colWidths.sac + colWidths.qty + colWidths.rate)
    };
    
    // Draw table header
    doc.rect(30, tableTop, tableWidth, 20).fill('#f2f2f2').stroke();
    doc.fillColor('black');
    doc.fontSize(10);
    doc.text('Sl No.', colPos.no + 2, tableTop + 5, { width: tableWidth * colWidths.no - 4 });
    doc.text('Description of Services', colPos.desc + 2, tableTop + 5, { width: tableWidth * colWidths.desc - 4 });
    doc.text('SAC', colPos.sac + 2, tableTop + 5, { width: tableWidth * colWidths.sac - 4 });
    doc.text('Qty', colPos.qty + 2, tableTop + 5, { width: tableWidth * colWidths.qty - 4 });
    doc.text('Rate', colPos.rate + 2, tableTop + 5, { width: tableWidth * colWidths.rate - 4 });
    doc.text('Amount', colPos.amount + 2, tableTop + 5, { width: tableWidth * colWidths.amount - 4 });

    // Table rows
    let tableRow = tableTop + 20;
    
    if (Array.isArray(invoice.items)) {
      invoice.items.forEach((item, i) => {
        // Check if we need a new page
        if (tableRow > 700) {
          doc.addPage();
          tableRow = 50;
        }
        
        // Draw row background and borders
        doc.rect(30, tableRow, tableWidth, 25).stroke();
        
        // Draw column separators
        doc.moveTo(colPos.desc, tableRow).lineTo(colPos.desc, tableRow + 25).stroke();
        doc.moveTo(colPos.sac, tableRow).lineTo(colPos.sac, tableRow + 25).stroke();
        doc.moveTo(colPos.qty, tableRow).lineTo(colPos.qty, tableRow + 25).stroke();
        doc.moveTo(colPos.rate, tableRow).lineTo(colPos.rate, tableRow + 25).stroke();
        doc.moveTo(colPos.amount, tableRow).lineTo(colPos.amount, tableRow + 25).stroke();
        
        // Add row content
        doc.text(i + 1, colPos.no + 2, tableRow + 8, { width: tableWidth * colWidths.no - 4 });
        doc.text(item.description || 'No description', colPos.desc + 2, tableRow + 8, { width: tableWidth * colWidths.desc - 4 });
        doc.text(item.sac || 'N/A', colPos.sac + 2, tableRow + 8, { width: tableWidth * colWidths.sac - 4 });
        doc.text(item.quantity || 1, colPos.qty + 2, tableRow + 8, { width: tableWidth * colWidths.qty - 4 });
        doc.text(formatCurrency(item.rate || 0, invoice.currency), colPos.rate + 2, tableRow + 8, { width: tableWidth * colWidths.rate - 4 });
        doc.text(formatCurrency((item.quantity || 0) * (item.rate || 0), invoice.currency), colPos.amount + 2, tableRow + 8, { width: tableWidth * colWidths.amount - 4 });
        
        tableRow += 25;
      });
    }

    // Add total row
    doc.rect(30, tableRow, tableWidth, 25).stroke();
    doc.rect(colPos.amount, tableRow, tableWidth * colWidths.amount, 25).fill('#f2f2f2').stroke();
    doc.fillColor('black');
    doc.fontSize(10).text('Total', colPos.rate + 2, tableRow + 8, { width: tableWidth * colWidths.rate - 4 });
    doc.fontSize(10).text(formatCurrency(totalAmount, invoice.currency), colPos.amount + 2, tableRow + 8, { width: tableWidth * colWidths.amount - 4 });
    
    // Move down after the table
    tableRow += 35;
    
    // Add amount in words section
    doc.rect(30, tableRow, tableWidth * 0.7, 30).stroke();
    doc.rect(30 + tableWidth * 0.7, tableRow, tableWidth * 0.3, 30).stroke();
    doc.fontSize(10).text('Amount Chargeable (in words):', 40, tableRow + 10);
    doc.text(`${convertAmountToWords(Math.round(totalAmount))} only`, 40, tableRow + 20);
    doc.text('E. & O.E', 30 + tableWidth * 0.7 + 10, tableRow + 10);
    
    // Move down after amount in words
    tableRow += 40;
    
    // Add declaration and bank details
    const declarationY = tableRow;
    const declarationWidth = tableWidth * 0.6;
    const signatureWidth = tableWidth * 0.4;
    
    // Declaration section
    doc.rect(30, declarationY, declarationWidth, 150).stroke();
    doc.fontSize(10).text('Declaration:', 40, declarationY + 10);
    doc.fontSize(9).text('We declare that this invoice shows the actual price of the services described and that all particulars are true and correct.', 40, declarationY + 25, { width: declarationWidth - 20 });
    
    // Bank details
    doc.fontSize(10).text('Company\'s Bank Details:', 40, declarationY + 50);
    
    // Bank details table
    const bankY = declarationY + 65;
    doc.fontSize(9);
    doc.text('Beneficiary Name:', 40, bankY);
    doc.text('InnoAI Technologies Pvt Ltd', 140, bankY);
    doc.text('Bank Name:', 40, bankY + 15);
    doc.text('HDFC Bank', 140, bankY + 15);
    doc.text('A/c No.:', 40, bankY + 30);
    doc.text('50100123456789', 140, bankY + 30);
    doc.text('IFSC Code:', 40, bankY + 45);
    doc.text('HDFC0001234', 140, bankY + 45);
    doc.text('Branch:', 40, bankY + 60);
    doc.text('Thiruvananthapuram', 140, bankY + 60);
    
    // Signature section
    doc.rect(30 + declarationWidth, declarationY, signatureWidth, 150).stroke();
    
    // Add signature line
    const signatureLineY = declarationY + 100;
    const signatureLineX = 30 + declarationWidth + 20;
    const signatureLineWidth = signatureWidth - 40;
    
    doc.moveTo(signatureLineX, signatureLineY)
       .lineTo(signatureLineX + signatureLineWidth, signatureLineY)
       .stroke();
    
    doc.fontSize(10).text('Authorized Signatory', signatureLineX, signatureLineY + 5, { width: signatureLineWidth, align: 'center' });
    doc.text('For InnoAI Technologies Pvt Ltd', signatureLineX, signatureLineY + 20, { width: signatureLineWidth, align: 'center' });
    
    // Add footer
    doc.fontSize(8).text('This is a computer-generated invoice and does not require a physical signature.', 30, doc.page.height - 50, { align: 'center', width: doc.page.width - 60 });
    
    // Finalize the PDF
    doc.end();
    
    logger.info('Fallback PDF generated successfully');
    return pdfPath;
  } catch (err) {
    logger.error(`Error in fallback PDF generation: ${err.message}`);
    logger.error(`Error stack: ${err.stack || 'No stack trace available'}`);
    throw err;
  }
};

module.exports = generateFallbackPDF; 