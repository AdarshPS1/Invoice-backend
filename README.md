# Invoice Management System Backend

This is the backend API for the Invoice Management System, built with Node.js, Express, and MongoDB.

## Features

- User authentication and authorization
- Invoice creation, management, and PDF generation
- Client management
- Dashboard statistics
- Payment tracking
- Reporting

## Deployment on Render

This application is configured for deployment on Render with special considerations for PDF generation using Puppeteer.

### Prerequisites

- A Render account
- MongoDB Atlas database or other MongoDB provider
- Environment variables configured in Render dashboard

### Environment Variables

The following environment variables need to be set in your Render dashboard:

```
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
EMAIL_USER=your_email_for_notifications
EMAIL_PASS=your_email_password
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_phone
FRONTEND_URL=your_frontend_url
```

### Deployment Steps

1. Fork or clone this repository
2. Connect your GitHub repository to Render
3. Create a new Web Service in Render
4. Use the following settings:
   - Build Command: `bash ./render-build.sh`
   - Start Command: `npm start`
   - Environment: Node
   - Plan: Free (or choose according to your needs)
5. Add all required environment variables
6. Deploy the service

### PDF Generation

This application uses Puppeteer for PDF generation. The deployment is configured to work on Render with the following:

- A custom build script (`render-build.sh`) that installs necessary dependencies
- Environment variables to configure Puppeteer
- Chrome browser configuration for headless operation

## Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Create a `.env` file with the required environment variables
4. Start the development server: `npm run dev`

## API Documentation

The API includes endpoints for:

- Authentication: `/api/auth`
- Invoices: `/api/invoices`
- Clients: `/api/clients`
- Dashboard: `/api/dashboard`
- Reports: `/api/reports`
- Notifications: `/api/notifications`

A health check endpoint is available at `/api/health`

## Troubleshooting PDF Generation

If you encounter issues with PDF generation:

1. Check the server logs for detailed error messages
2. Verify that all Puppeteer dependencies are installed
3. Ensure the Chrome executable path is correctly set
4. Try adjusting the Puppeteer launch options in `utils/pdfGenerator.js` 