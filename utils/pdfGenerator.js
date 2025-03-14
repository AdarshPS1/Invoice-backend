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

    console.log('Processing invoice items:', invoice.items);

    // Ensure items is an array
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    
    // Calculate total amount from items
    const totalAmount = items.reduce((sum, item) => {
      const quantity = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      return sum + (quantity * rate);
    }, 0);

    const templatePath = path.join(__dirname, 'invoiceTemplate.html');
    
    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      console.error('Invoice template not found at:', templatePath);
      throw new Error('Invoice template not found');
    }
    
    const html = fs.readFileSync(templatePath, 'utf8');
    const template = Handlebars.compile(html);

    const data = {
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date ? new Date(invoice.date).toLocaleDateString() : new Date().toLocaleDateString(),
      dueDate: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A',
      clientName: invoice.client?.name || 'N/A',
      clientEmail: invoice.client?.email || 'N/A',
      clientPhone: invoice.client?.phone || 'N/A',
      clientAddress: invoice.client?.address || 'N/A',
      clientGSTIN: 'N/A',
      paymentTerms: 'Net 30',
      items: items.map((item) => ({
        description: item.description || 'No description',
        sac: item.sac || '998314',
        quantity: item.quantity || 1,
        rate: item.rate || 0,
        amount: (item.quantity || 0) * (item.rate || 0),
      })),
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

    console.log('Data used for PDF generation:', {
      invoiceNumber: data.invoiceNumber,
      clientName: data.clientName,
      itemsCount: data.items.length,
      totalAmount: data.totalAmount
    });

    const compiledHtml = template(data);

    // Launch puppeteer with specific args to avoid issues in cloud environments
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: 'new'
    });
    
    const page = await browser.newPage();
    await page.setContent(compiledHtml);

    const sanitizeFilename = (filename) => {
      if (!filename || typeof filename !== 'string') {
        console.error('Invalid filename:', filename);
        return 'Invoice_Unknown_' + Date.now();
      }
      return filename.replace(/[\/\\?%*:|"<>]/g, '-');
    };

    const invoicesDir = path.join(__dirname, '..', 'invoices');
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }

    const pdfPath = path.join(invoicesDir, `Invoice_${sanitizeFilename(invoice.invoiceNumber)}.pdf`);

    await page.pdf({ path: pdfPath, format: 'A4' });

    await browser.close();
    console.log('PDF generated successfully at:', pdfPath);
    return pdfPath;
  } catch (err) {
    console.error('Error generating PDF:', err);
    throw new Error(`PDF generation failed: ${err.message}`);
  }
};

module.exports = generateInvoicePDF;
