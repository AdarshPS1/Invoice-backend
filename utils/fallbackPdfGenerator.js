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
    const doc = new PDFDocument({ margin: 50 });
    
    // Pipe the PDF to a file
    doc.pipe(fs.createWriteStream(pdfPath));

    // Add company logo or header
    doc.fontSize(20).text('INVOICE', { align: 'center' });
    doc.moveDown();

    // Add invoice details
    doc.fontSize(12);
    doc.text(`Invoice Number: ${invoice.invoiceNumber}`);
    doc.text(`Date: ${invoice.date || new Date().toISOString().split('T')[0]}`);
    doc.text(`Due Date: ${invoice.dueDate || 'N/A'}`);
    doc.moveDown();

    // Add client information
    doc.fontSize(14).text('Client Information');
    doc.fontSize(12);
    doc.text(`Name: ${invoice.client?.name || 'N/A'}`);
    doc.text(`Email: ${invoice.client?.email || 'N/A'}`);
    doc.text(`Phone: ${invoice.client?.phone || 'N/A'}`);
    doc.moveDown();

    // Add invoice items table
    doc.fontSize(14).text('Invoice Items');
    doc.moveDown();

    // Table headers
    const tableTop = doc.y;
    const itemX = 50;
    const descriptionX = 100;
    const quantityX = 300;
    const rateX = 350;
    const amountX = 450;

    doc.fontSize(10);
    doc.text('No.', itemX, tableTop);
    doc.text('Description', descriptionX, tableTop);
    doc.text('Qty', quantityX, tableTop);
    doc.text('Rate', rateX, tableTop);
    doc.text('Amount', amountX, tableTop);

    // Draw a line
    doc.moveTo(50, tableTop + 15)
       .lineTo(550, tableTop + 15)
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
        doc.text(item.quantity || 1, quantityX, tableRow);
        doc.text(formatCurrency(item.rate || 0, invoice.currency), rateX, tableRow);
        doc.text(formatCurrency((item.quantity || 0) * (item.rate || 0), invoice.currency), amountX, tableRow);
        
        tableRow += 20;
      });
    }

    // Draw a line
    doc.moveTo(50, tableRow)
       .lineTo(550, tableRow)
       .stroke();
    
    // Add total
    tableRow += 20;
    doc.fontSize(12);
    doc.text('Total:', 350, tableRow);
    doc.text(formatCurrency(totalAmount, invoice.currency), amountX, tableRow);
    
    // Add amount in words
    tableRow += 30;
    doc.fontSize(10);
    doc.text(`Amount in words: ${convertAmountToWords(totalAmount)} only`, 50, tableRow);
    
    // Add footer
    doc.fontSize(10);
    const bottomOfPage = doc.page.height - 50;
    doc.text('Thank you for your business!', 50, bottomOfPage, { align: 'center' });

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