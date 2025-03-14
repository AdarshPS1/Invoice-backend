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

const generateInvoicePDF = async (invoice) => {
  try {
    console.log('Received invoice data:', {
      invoiceNumber: invoice?.invoiceNumber,
      client: invoice?.client?.name,
      items: invoice?.items?.length,
    });

    if (!invoice || typeof invoice !== 'object') {
      throw new Error('Invalid invoice data');
    }

    // Generate a default invoice number if not present
    if (!invoice.invoiceNumber) {
      console.warn('Missing invoiceNumber in invoice data, generating a default one');
      invoice.invoiceNumber = `INV-${Date.now()}`;
    }

    // Ensure items is an array
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    
    // Calculate total amount from items
    const totalAmount = items.reduce((sum, item) => {
      const quantity = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      return sum + (quantity * rate);
    }, 0);

    // Create the invoices directory if it doesn't exist
    const invoicesDir = path.join(__dirname, '..', 'invoices');
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }

    // Sanitize the filename
    const sanitizeFilename = (filename) => {
      if (!filename || typeof filename !== 'string') {
        console.error('Invalid filename:', filename);
        return 'Invoice_Unknown_' + Date.now();
      }
      return filename.replace(/[\/\\?%*:|"<>]/g, '-');
    };

    const pdfPath = path.join(invoicesDir, `Invoice_${sanitizeFilename(invoice.invoiceNumber)}.pdf`);
    
    // Create a new PDF document
    const doc = new PDFDocument({ margin: 50 });
    
    // Pipe the PDF to a file
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);
    
    // Add company logo/header
    doc.fontSize(20).text('Tax Invoice', { align: 'center' });
    doc.moveDown();
    
    // Company information
    doc.fontSize(12).text('InnoAI Technologies Pvt Ltd', { align: 'center' });
    doc.fontSize(10).text('VRA A 39, Kallummoodu, Anayara, Thiruvananthapuram, Kerala 695029', { align: 'center' });
    doc.fontSize(10).text('GSTIN/UIN: 123456789ABCDE | PAN: AAAPL1234C', { align: 'center' });
    doc.moveDown(2);
    
    // Invoice details
    doc.fontSize(12).text('Invoice Details', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Invoice No: ${invoice.invoiceNumber}`);
    doc.fontSize(10).text(`Date: ${invoice.date ? new Date(invoice.date).toLocaleDateString() : new Date().toLocaleDateString()}`);
    doc.fontSize(10).text(`Due Date: ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}`);
    doc.moveDown();
    
    // Client information
    doc.fontSize(12).text('Client Details', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Name: ${invoice.client?.name || 'N/A'}`);
    doc.fontSize(10).text(`Email: ${invoice.client?.email || 'N/A'}`);
    doc.fontSize(10).text(`Phone: ${invoice.client?.phone || 'N/A'}`);
    doc.moveDown(2);
    
    // Items table
    doc.fontSize(12).text('Invoice Items', { underline: true });
    doc.moveDown(0.5);
    
    // Table headers
    const tableTop = doc.y;
    const itemX = 50;
    const descriptionX = 100;
    const sacX = 280;
    const quantityX = 350;
    const rateX = 400;
    const amountX = 470;
    
    doc.fontSize(10)
      .text('No.', itemX, tableTop)
      .text('Description', descriptionX, tableTop)
      .text('SAC', sacX, tableTop)
      .text('Qty', quantityX, tableTop)
      .text('Rate', rateX, tableTop)
      .text('Amount', amountX, tableTop);
    
    doc.moveDown();
    let tableY = doc.y;
    
    // Draw a line for the header
    doc.moveTo(50, tableY - 5)
       .lineTo(550, tableY - 5)
       .stroke();
    
    // Table rows
    items.forEach((item, i) => {
      const y = tableY + (i * 20);
      
      // Check if we need a new page
      if (y > 700) {
        doc.addPage();
        tableY = 50;
        doc.fontSize(10)
          .text('No.', itemX, tableY)
          .text('Description', descriptionX, tableY)
          .text('SAC', sacX, tableY)
          .text('Qty', quantityX, tableY)
          .text('Rate', rateX, tableY)
          .text('Amount', amountX, tableY);
        
        doc.moveDown();
        tableY = doc.y;
        
        // Draw a line for the header on new page
        doc.moveTo(50, tableY - 5)
           .lineTo(550, tableY - 5)
           .stroke();
      }
      
      const rowY = y > 700 ? tableY + ((i - Math.floor(y / 700) * 35) * 20) : y;
      
      doc.fontSize(10)
        .text((i + 1).toString(), itemX, rowY)
        .text(item.description || 'No description', descriptionX, rowY)
        .text(item.sac || '998314', sacX, rowY)
        .text(item.quantity || '1', quantityX, rowY)
        .text(formatCurrency(item.rate || 0, invoice.currency), rateX, rowY)
        .text(formatCurrency((item.quantity || 0) * (item.rate || 0), invoice.currency), amountX, rowY);
    });
    
    // Draw a line after the items
    const endY = tableY + (items.length * 20);
    doc.moveTo(50, endY + 5)
       .lineTo(550, endY + 5)
       .stroke();
    
    // Total amount
    doc.moveDown(2);
    doc.fontSize(12).text(`Total Amount: ${formatCurrency(totalAmount, invoice.currency)}`, { align: 'right' });
    doc.fontSize(10).text(`Amount in words: ${convertAmountToWords(Math.round(totalAmount))}`, { align: 'right' });
    
    // Bank details
    doc.moveDown(2);
    doc.fontSize(12).text('Bank Details', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text('Beneficiary Name: InnoAI Technologies Pvt Ltd');
    doc.fontSize(10).text('Bank Name: XYZ Bank');
    doc.fontSize(10).text('Account No.: 1234567890');
    doc.fontSize(10).text('Branch: Main Branch');
    doc.fontSize(10).text('Account Type: Current');
    doc.fontSize(10).text('Swift Code: XYZ1234');
    
    // Signature
    doc.moveDown(2);
    doc.fontSize(10).text('For InnoAI Technologies Pvt Ltd', { align: 'right' });
    doc.moveDown(2);
    doc.fontSize(10).text('Authorized Signatory', { align: 'right' });
    
    // Finalize the PDF
    doc.end();
    
    // Return a promise that resolves when the PDF is written
    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        console.log('PDF generated successfully at:', pdfPath);
        resolve(pdfPath);
      });
      stream.on('error', (err) => {
        console.error('Error writing PDF:', err);
        reject(err);
      });
    });
  } catch (err) {
    console.error('Error generating PDF:', err);
    throw new Error(`PDF generation failed: ${err.message}`);
  }
};

module.exports = generateInvoicePDF; 