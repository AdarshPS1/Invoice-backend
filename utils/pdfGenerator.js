const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const Handlebars = require('handlebars');

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

// Install Puppeteer browser if needed
async function ensureBrowser() {
  try {
    // Try to install Chrome if it's not already installed
    const { execSync } = require('child_process');
    console.log('Attempting to install Chrome...');
    execSync('node node_modules/puppeteer/install.js', { stdio: 'inherit' });
    console.log('Chrome installation completed');
  } catch (err) {
    console.log('Chrome installation failed, will try to use bundled Chromium:', err.message);
  }
}

const generateInvoicePDF = async (invoice) => {
  let browser = null;
  
  try {
    console.log('Starting PDF generation process for invoice:', invoice?._id);

    // Validate invoice data
    if (!invoice || typeof invoice !== 'object') {
      throw new Error('Invalid invoice data');
    }

    if (!invoice.invoiceNumber) {
      throw new Error('Missing invoiceNumber in invoice data');
    }

    // Calculate total amount from items
    const totalAmount = Array.isArray(invoice.items) 
      ? invoice.items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.rate || 0)), 0)
      : 0;

    // Format dates properly
    const formatDate = (dateString) => {
      try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      } catch (err) {
        return dateString || 'N/A';
      }
    };

    // Prepare template data
    const templatePath = path.join(__dirname, 'invoiceTemplate.html');
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Invoice template not found at: ${templatePath}`);
    }
    
    const html = fs.readFileSync(templatePath, 'utf8');
    const template = Handlebars.compile(html);

    const data = {
      invoiceNumber: invoice.invoiceNumber,
      date: formatDate(invoice.date),
      dueDate: formatDate(invoice.dueDate),
      clientName: invoice.client?.name || 'N/A',
      clientEmail: invoice.client?.email || 'N/A',
      clientPhone: invoice.client?.phone || 'N/A',
      paymentTerms: 'Net 30',
      items: Array.isArray(invoice.items) ? invoice.items.map((item) => ({
        description: item.description || 'No description',
        sac: item.sac || '998314',
        quantity: item.quantity || 1,
        rate: item.rate || 0,
        amount: (item.quantity || 0) * (item.rate || 0),
      })) : [],
      totalAmount: totalAmount,
      amountInWords: convertAmountToWords(Math.round(totalAmount)),
      currency: invoice.currency || 'USD',
    };

    // Format amounts using the selected currency
    data.items = data.items.map(item => ({
      ...item,
      rate: formatCurrency(item.rate, data.currency),
      amount: formatCurrency(item.amount, data.currency),
    }));
    data.totalAmount = formatCurrency(data.totalAmount, data.currency);

    // Compile HTML template
    const compiledHtml = template(data);

    // Ensure invoices directory exists
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

    const pdfFilename = `Invoice_${sanitizeFilename(invoice.invoiceNumber)}.pdf`;
    const pdfPath = path.join(invoicesDir, pdfFilename);

    // Ensure browser is installed
    await ensureBrowser();

    // Launch browser with minimal configuration for Render
    const puppeteerArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--font-render-hinting=none'
    ];

    // Launch browser with a timeout
    try {
      console.log('Launching browser...');
      browser = await puppeteer.launch({
        headless: true,
        args: puppeteerArgs,
        ignoreHTTPSErrors: true,
        product: 'chrome',
        // Use bundled Chromium instead of system Chrome
        executablePath: undefined
      });
      console.log('Browser launched successfully');

      // Create a new page
      const page = await browser.newPage();
      console.log('New page created');
      
      // Set content with minimal wait
      console.log('Setting page content...');
      await page.setContent(compiledHtml, { 
        waitUntil: 'domcontentloaded'
      });
      console.log('Page content set');

      // Generate PDF with simple settings
      console.log('Generating PDF...');
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        }
      });
      console.log('PDF generated successfully at:', pdfPath);

      // Close browser
      await browser.close();
      browser = null;
      console.log('Browser closed');

      return pdfPath;
    } catch (puppeteerError) {
      console.error('Puppeteer error:', puppeteerError);
      
      // If Puppeteer fails, try to close the browser
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error('Error closing browser:', closeError);
        }
        browser = null;
      }
      
      throw new Error(`PDF generation failed: ${puppeteerError.message}`);
    }
  } catch (err) {
    console.error('Error in generateInvoicePDF:', err);
    
    // Clean up browser if it's still open
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.error('Error closing browser:', closeErr);
      }
    }
    
    throw err;
  }
};

module.exports = generateInvoicePDF;
