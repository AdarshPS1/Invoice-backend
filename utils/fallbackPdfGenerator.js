const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// Format amount based on currency
function formatCurrency(amount, currency = 'USD') {
  const currencySymbols = {
    'USD': '$',
    'INR': '₹',
    'AUD': 'A$'
  };
  
  const symbol = currencySymbols[currency] || currencySymbols['USD'];
  
  // Format with 2 decimal places
  const formattedAmount = amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  
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
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const generateFallbackPDF = async (invoice) => {
  try {
    console.log('Using fallback PDF generator for invoice:', invoice.invoiceNumber);
    
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
      console.log(`Creating invoices directory at ${invoicesDir}`);
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
    
    console.log(`Fallback PDF will be saved to: ${pdfPath}`);

    // Create a new PDF document
    const doc = new PDFDocument({ 
      margin: 40,
      size: 'A4'
    });
    
    // Pipe the PDF to a file
    doc.pipe(fs.createWriteStream(pdfPath));

    // Add header
    doc.fontSize(16).text('TAX INVOICE', { align: 'center' });
    doc.moveDown();

    // Add company info box
    doc.rect(40, doc.y, doc.page.width - 80, 80).stroke();
    doc.fontSize(12).text('InnoAI Technologies Pvt Ltd', 50, doc.y + 10);
    doc.fontSize(10).text('VRA A 39, Kallummoodu, Anayara,', 50, doc.y + 5);
    doc.text('Thiruvananthapuram, Kerala 695029', 50, doc.y + 5);
    doc.text('GSTIN/UIN: 32AABCI1234A1Z5', 50, doc.y + 5);
    doc.text('Contact: +91 9876543210 | Email: info@innoai.com', 50, doc.y + 5);
    
    // Move down after the box
    doc.moveDown(4);

    // Add invoice details in a grid
    const startY = doc.y;
    
    // Left column
    doc.fontSize(10).text('Invoice Number:', 50, startY);
    doc.text(invoice.invoiceNumber, 150, startY);
    
    doc.text('Date:', 50, startY + 20);
    doc.text(formatDate(invoice.date || new Date()), 150, startY + 20);
    
    doc.text('Due Date:', 50, startY + 40);
    doc.text(formatDate(invoice.dueDate), 150, startY + 40);
    
    // Right column
    doc.text('Currency:', 300, startY);
    doc.text(invoice.currency || 'USD', 400, startY);
    
    doc.text('Status:', 300, startY + 20);
    doc.text(invoice.status || 'Pending', 400, startY + 20);
    
    // Move down after the details
    doc.moveDown(4);

    // Add client information
    doc.fontSize(12).text('Client Information', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Name: ${invoice.client?.name || 'N/A'}`);
    doc.text(`Email: ${invoice.client?.email || 'N/A'}`);
    doc.text(`Phone: ${invoice.client?.phone || 'N/A'}`);
    doc.moveDown();

    // Add invoice items table
    doc.fontSize(12).text('Invoice Items', { underline: true });
    doc.moveDown(0.5);

    // Table headers
    const tableTop = doc.y;
    const itemX = 50;
    const descriptionX = 80;
    const sacX = 280;
    const quantityX = 340;
    const rateX = 400;
    const amountX = 470;

    doc.fontSize(10);
    doc.text('No.', itemX, tableTop);
    doc.text('Description', descriptionX, tableTop);
    doc.text('SAC', sacX, tableTop);
    doc.text('Qty', quantityX, tableTop);
    doc.text('Rate', rateX, tableTop);
    doc.text('Amount', amountX, tableTop);

    // Draw a line
    doc.moveTo(40, tableTop + 15)
       .lineTo(doc.page.width - 40, tableTop + 15)
       .stroke();

    // Table rows
    let tableRow = tableTop + 25;
    
    if (Array.isArray(invoice.items)) {
      invoice.items.forEach((item, i) => {
        // Check if we need a new page
        if (tableRow > 700) {
          doc.addPage();
          tableRow = 50;
        }
        
        doc.text(i + 1, itemX, tableRow);
        doc.text(item.description || 'No description', descriptionX, tableRow, { width: 180 });
        doc.text(item.sac || '', sacX, tableRow);
        doc.text(item.quantity || 1, quantityX, tableRow);
        doc.text(formatCurrency(item.rate || 0, invoice.currency), rateX, tableRow);
        doc.text(formatCurrency((item.quantity || 0) * (item.rate || 0), invoice.currency), amountX, tableRow);
        
        tableRow += 20;
      });
    }

    // Draw a line
    doc.moveTo(40, tableRow)
       .lineTo(doc.page.width - 40, tableRow)
       .stroke();
    
    // Add total
    tableRow += 20;
    doc.fontSize(10);
    doc.text('Total:', 400, tableRow);
    doc.text(formatCurrency(totalAmount, invoice.currency), amountX, tableRow);
    
    // Add amount in words
    tableRow += 30;
    doc.fontSize(10);
    doc.text(`Amount in words: ${convertAmountToWords(Math.round(totalAmount))} only`, 50, tableRow);
    
    // Add bank details
    tableRow += 40;
    doc.fontSize(12).text('Bank Details', 50, tableRow, { underline: true });
    tableRow += 20;
    doc.fontSize(10);
    doc.text('Beneficiary Name: InnoAI Technologies Pvt Ltd', 50, tableRow);
    doc.text('Bank Name: HDFC Bank', 50, tableRow + 15);
    doc.text('A/c No.: 50100123456789', 50, tableRow + 30);
    doc.text('IFSC Code: HDFC0001234', 50, tableRow + 45);
    doc.text('Branch: Thiruvananthapuram', 50, tableRow + 60);
    
    // Add signature
    doc.text('For InnoAI Technologies Pvt Ltd', 400, tableRow + 60);
    doc.text('Authorized Signatory', 400, tableRow + 90);
    
    // Add footer
    const bottomOfPage = doc.page.height - 50;
    doc.fontSize(8);
    doc.text('This is a computer-generated invoice and does not require a physical signature.', 50, bottomOfPage, { align: 'center' });

    // Finalize the PDF
    doc.end();
    
    console.log('Fallback PDF generated successfully');
    return pdfPath;
  } catch (err) {
    console.error('Error in fallback PDF generation:', err);
    throw err;
  }
};

module.exports = generateFallbackPDF; 