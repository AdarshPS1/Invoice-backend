require('dotenv').config(); 

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const reportRoutes = require('./routes/reportRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const clientRoute = require('./routes/clientRoute');
const dashboardRoutes = require('./routes/dashboardRoutes');
// Load environment variables
dotenv.config({ path: './.env' });

// Check for critical environment variables
if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined.');
  process.exit(1);
}

// Connect to the database
connectDB();

// Initialize Express app
const app = express();

// Middleware
app.use(cors({
  origin: true, // Allow requests from any origin
  credentials: true,
}));
app.use(express.json()); // Parse JSON request bodies



// Test route
app.get('/', (req, res) => {
  res.send('API is running...');
});



// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Routes
app.use('/api/auth', authRoutes);      // Authentication routes (login, register)
    // User-related routes (get users, update roles)
app.use('/api/invoices', invoiceRoutes); // Invoice management routes
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/clients', clientRoute);
app.use('/api/dashboard', dashboardRoutes);