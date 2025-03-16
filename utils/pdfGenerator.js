const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const Handlebars = require('handlebars');
const os = require('os');

// Register Handlebars helpers
Handlebars.registerHelper('index', function (index) {
  return index + 1;
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

const generateInvoicePDF = async (invoice) => {
  let browser = null;
  
  try {
    console.log('Starting PDF generation process...');
    console.log('System info:', {
      platform: os.platform(),
      release: os.release(),
      type: os.type(),
      arch: os.arch(),
      memory: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + 'GB'
    });
    
    // Validate invoice data
    if (!invoice || typeof invoice !== 'object') {
      throw new Error('Invalid invoice data');
    }

    if (!invoice.invoiceNumber) {
      throw new Error('Missing invoiceNumber in invoice data');
    }

    console.log('Processing invoice:', {
      invoiceNumber: invoice.invoiceNumber,
      client: invoice.client?.name || 'Unknown',
      items: Array.isArray(invoice.items) ? invoice.items.length : 0
    });

    // Calculate total amount
    const totalAmount = Array.isArray(invoice.items) 
      ? invoice.items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.rate || 0)), 0)
      : 0;

    // Prepare template data
    const templatePath = path.join(__dirname, 'invoiceTemplate.html');
    console.log('Template path:', templatePath);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Invoice template not found at ${templatePath}`);
    }
    
    const html = fs.readFileSync(templatePath, 'utf8');
    const template = Handlebars.compile(html);

    const data = {
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date,
      dueDate: invoice.dueDate,
      clientName: invoice.client?.name || 'N/A',
      clientEmail: invoice.client?.email || 'N/A',
      clientPhone: invoice.client?.phone || 'N/A',
      items: Array.isArray(invoice.items) ? invoice.items.map((item) => ({
        description: item.description || 'No description',
        sac: item.sac || '998314',
        quantity: item.quantity || 1,
        rate: item.rate || 0,
        amount: (item.quantity || 0) * (item.rate || 0),
      })) : [],
      totalAmount: totalAmount,
      amountInWords: convertAmountToWords(totalAmount),
      currency: invoice.currency || 'USD',
    };

    // Format amounts using the selected currency
    data.items = data.items.map(item => ({
      ...item,
      rate: formatCurrency(item.rate, data.currency),
      amount: formatCurrency(item.amount, data.currency),
    }));
    data.totalAmount = formatCurrency(data.totalAmount, data.currency);

    console.log('Compiled template data successfully');

    // Generate HTML content
    const compiledHtml = template(data);

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
    
    console.log(`PDF will be saved to: ${pdfPath}`);

    // Launch Puppeteer with specific configuration for cloud environments
    console.log('Launching Puppeteer...');
    
    // Define browser launch options based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    const launchOptions = {
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
    };
    
    // In production, try to use the installed Chrome
    if (isProduction && process.env.PUPPETEER_EXECUTABLE_PATH) {
      console.log(`Using Chrome at: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    
    console.log('Browser launch options:', JSON.stringify(launchOptions, null, 2));
    
    browser = await puppeteer.launch(launchOptions);
    console.log('Browser launched successfully');
    
    const page = await browser.newPage();
    console.log('New page created');
    
    // Set content with timeout
    await page.setContent(compiledHtml, { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    console.log('Content set to page');

    // Generate PDF
    await page.pdf({ 
      path: pdfPath, 
      format: 'A4',
      printBackground: true,
      margin: {
        top: '1cm',
        right: '1cm',
        bottom: '1cm',
        left: '1cm'
      }
    });
    
    console.log('PDF generated successfully');
    
    // Close browser
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
    
    return pdfPath;
  } catch (err) {
    console.error('Error in PDF generation:', err);
    console.error('Error stack:', err.stack);
    
    // Ensure browser is closed in case of error
    if (browser) {
      try {
        await browser.close();
        console.log('Browser closed after error');
      } catch (closeErr) {
        console.error('Error closing browser:', closeErr);
      }
    }
    
    throw err;
  }
};

module.exports = generateInvoicePDF;
