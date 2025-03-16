#!/bin/bash

# Install dependencies
npm install

# Install Chromium for Puppeteer
echo "Installing Chromium for Puppeteer..."
node node_modules/puppeteer/install.js

# Create necessary directories
mkdir -p invoices
mkdir -p /tmp/puppeteer-cache

# Set permissions
chmod -R 777 invoices
chmod -R 777 /tmp/puppeteer-cache

echo "Build completed successfully!" 