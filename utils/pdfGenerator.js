const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const handlebars = require('handlebars');

// Register a helper to increment index for table rows
handlebars.registerHelper('index', function(value) {
  return Number(value) + 1;
});

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

async function generateInvoicePDF(invoice) {
  console.log('Generating PDF for invoice:', JSON.stringify(invoice, null, 2));
  
  // Validate invoice data
  if (!invoice || typeof invoice !== 'object') {
    console.error('Invalid invoice data:', invoice);
    throw new Error('Invalid invoice data provided');
  }

  // Ensure invoice number exists
  if (!invoice.invoiceNumber) {
    console.warn('Invoice number missing, generating default');
    invoice.invoiceNumber = `INV-${Date.now()}`;
  }

  // Ensure items is an array
  if (!Array.isArray(invoice.items)) {
    console.warn('Invoice items not an array, defaulting to empty array');
    invoice.items = [];
  }

  // Calculate total amount if not provided
  if (!invoice.totalAmount) {
    console.log('Calculating total amount from items');
    invoice.totalAmount = invoice.items.reduce((sum, item) => {
      const amount = parseFloat(item.amount) || 0;
      return sum + amount;
    }, 0).toFixed(2);
  }

  // Format dates if they exist
  if (invoice.date) {
    const date = new Date(invoice.date);
    if (!isNaN(date)) {
      invoice.date = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  }

  if (invoice.dueDate) {
    const dueDate = new Date(invoice.dueDate);
    if (!isNaN(dueDate)) {
      invoice.dueDate = dueDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  }

  // Set default currency if not provided
  if (!invoice.currency) {
    invoice.currency = 'INR';
  }

  // Ensure the invoices directory exists
  const invoicesDir = path.join(__dirname, '..', 'invoices');
  if (!fs.existsSync(invoicesDir)) {
    console.log('Creating invoices directory');
    fs.mkdirSync(invoicesDir, { recursive: true });
  }

  // Sanitize filename to prevent issues with special characters
  const sanitizeFilename = (name) => {
    return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  };

  const outputPath = path.join(invoicesDir, `invoice_${sanitizeFilename(invoice.invoiceNumber)}.pdf`);
  const htmlPath = path.join(invoicesDir, `invoice_${sanitizeFilename(invoice.invoiceNumber)}.html`);

  try {
    // Read the HTML template
    const templatePath = path.join(__dirname, 'invoiceTemplate.html');
    
    if (!fs.existsSync(templatePath)) {
      console.error('Invoice template not found at:', templatePath);
      throw new Error('Invoice template not found');
    }
    
    const templateHtml = fs.readFileSync(templatePath, 'utf8');
    
    // Compile the template
    const template = handlebars.compile(templateHtml);
    const html = template(invoice);
    
    // Save the HTML version for fallback
    fs.writeFileSync(htmlPath, html);
    console.log('HTML invoice saved to:', htmlPath);

    // Launch a headless browser with specific args for cloud environments
    console.log('Launching Puppeteer browser');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });

    // Create a new page
    const page = await browser.newPage();
    
    // Set the page content
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Generate PDF
    console.log('Generating PDF file');
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });
    
    // Close the browser
    await browser.close();
    
    console.log('PDF generated successfully at:', outputPath);
    return { pdfPath: outputPath, htmlPath: htmlPath };
  } catch (error) {
    console.error('Error generating PDF:', error);
    // Return the HTML path as fallback
    if (fs.existsSync(htmlPath)) {
      console.log('Returning HTML path as fallback');
      return { error: error.message, htmlPath };
    }
    throw error;
  }
}

module.exports = { generateInvoicePDF };
