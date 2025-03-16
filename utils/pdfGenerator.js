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

const generateInvoicePDF = async (invoice) => {
  let browser = null;
  
  try {
    console.log('Starting PDF generation process for invoice:', invoice?._id);

    if (!invoice || typeof invoice !== 'object') {
      throw new Error('Invalid invoice data: ' + JSON.stringify(invoice));
    }

    if (!invoice.invoiceNumber) {
      throw new Error('Missing invoiceNumber in invoice data');
    }

    console.log('Processing invoice items:', JSON.stringify(invoice.items));

    // Calculate total amount from items
    const totalAmount = Array.isArray(invoice.items) 
      ? invoice.items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.rate || 0)), 0)
      : 0;

    console.log('Calculated total amount:', totalAmount);

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
        console.error('Error formatting date:', err);
        return dateString || 'N/A';
      }
    };

    const templatePath = path.join(__dirname, 'invoiceTemplate.html');
    console.log('Template path:', templatePath);
    
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

    console.log('Data prepared for PDF generation');

    const compiledHtml = template(data);

    console.log('HTML template compiled, launching Puppeteer');

    // Configure Puppeteer for cloud environment
    const puppeteerConfig = {
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
      ],
      timeout: 60000 // 60 second timeout for browser operations
    };

    // Only set executablePath if it's defined in environment
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      console.log('Using custom Puppeteer executable path:', process.env.PUPPETEER_EXECUTABLE_PATH);
    }

    // Create a promise that will reject after a timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('PDF generation timed out after 60 seconds')), 60000);
    });

    // Race the browser launch against the timeout
    browser = await Promise.race([
      puppeteer.launch(puppeteerConfig),
      timeoutPromise
    ]);
    
    console.log('Puppeteer browser launched');
    
    const page = await browser.newPage();
    console.log('New page created');
    
    // Set a timeout for page operations
    await page.setDefaultNavigationTimeout(30000);
    await page.setDefaultTimeout(30000);
    
    // Set the content with a timeout
    await Promise.race([
      page.setContent(compiledHtml, { waitUntil: 'networkidle0' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Setting page content timed out')), 30000))
    ]);
    
    console.log('Content set on page');

    const sanitizeFilename = (filename) => {
      if (!filename || typeof filename !== 'string') {
        console.error('Invalid filename:', filename);
        return 'Invoice_Unknown_' + Date.now();
      }
      return filename.replace(/[\/\\?%*:|"<>]/g, '-');
    };

    const invoicesDir = path.join(__dirname, '..', 'invoices');
    console.log('Ensuring invoices directory exists:', invoicesDir);
    
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
      console.log('Created invoices directory');
    }

    const pdfFilename = `Invoice_${sanitizeFilename(invoice.invoiceNumber)}.pdf`;
    const pdfPath = path.join(invoicesDir, pdfFilename);
    console.log('PDF will be saved to:', pdfPath);

    // Generate PDF with a timeout
    await Promise.race([
      page.pdf({ 
        path: pdfPath, 
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('PDF generation operation timed out')), 30000))
    ]);
    
    console.log('PDF generated successfully');

    await browser.close();
    browser = null;
    console.log('Browser closed');
    
    return pdfPath;
  } catch (err) {
    console.error('Error generating PDF:', err.message);
    console.error('Error stack:', err.stack);
    
    // Clean up browser if it's still open
    if (browser) {
      try {
        await browser.close();
        console.log('Browser closed after error');
      } catch (closeErr) {
        console.error('Error closing browser:', closeErr.message);
      }
    }
    
    throw err;
  }
};

module.exports = generateInvoicePDF;
