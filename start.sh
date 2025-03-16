#!/bin/bash

# Create necessary directories if they don't exist
mkdir -p invoices
mkdir -p /tmp/puppeteer-cache

# Set permissions
chmod -R 777 invoices
chmod -R 777 /tmp/puppeteer-cache

# Start the server
node server.js 