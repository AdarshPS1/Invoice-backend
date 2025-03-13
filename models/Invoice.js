const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  referenceNumber: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  remark: {
    type: String,
  },
});

const ItemSchema = new mongoose.Schema({
  description: {
    type: String,
    required: true,
  },
  sac: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  rate: {
    type: Number,
    required: true,
  },
});

const InvoiceSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Paid', 'Overdue'],
      default: 'Pending',
    },
    invoiceNumber: {
      type: String,
      unique: true,
    },
    payments: [PaymentSchema], // Array of payments
    items: [ItemSchema],
    currency: {
      type: String,
      enum: ['USD', 'INR', 'AUD'],
      default: 'USD',
    },
  },
  {
    timestamps: true,
  }
);

// Generate unique invoice number like 01/AI/24-25
InvoiceSchema.pre('save', async function (next) {
  if (!this.invoiceNumber) {
    try {
      // Get company code and financial year
      const companyCode = 'AI'; // Company name abbreviation
      const financialYear = '24-25'; // Financial year
      
      // Find the highest invoice number currently in use
      const highestInvoice = await mongoose.model('Invoice')
        .findOne({}, { invoiceNumber: 1 })
        .sort({ invoiceNumber: -1 }) // Sort in descending order
        .lean();
      
      let nextIndex = 1; // Default start with 1
      
      if (highestInvoice && highestInvoice.invoiceNumber) {
        // Extract the numeric part from the highest invoice number
        // Format is like "01/AI/24-25", we want to extract "01"
        const match = highestInvoice.invoiceNumber.match(/^(\d+)\//);
        if (match && match[1]) {
          // Convert to number and increment
          nextIndex = parseInt(match[1], 10) + 1;
        }
      }
      
      // Format the index with leading zeros
      const index = String(nextIndex).padStart(2, '0');
      
      // Create the new invoice number
      this.invoiceNumber = `${index}/${companyCode}/${financialYear}`;
      
      console.log(`Generated new invoice number: ${this.invoiceNumber} (based on highest: ${highestInvoice?.invoiceNumber})`);
    } catch (err) {
      console.error('Error generating invoice number:', err);
      return next(err);
    }
  }
  next();
});

module.exports = mongoose.model('Invoice', InvoiceSchema);
