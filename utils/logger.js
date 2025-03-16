const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log file paths
const logFilePath = path.join(logsDir, 'app.log');
const errorLogFilePath = path.join(logsDir, 'error.log');

// Simple logger implementation
const logger = {
  info: (message) => {
    const logEntry = `[INFO] [${new Date().toISOString()}] ${message}\n`;
    console.log(logEntry.trim());
    try {
      fs.appendFileSync(logFilePath, logEntry);
    } catch (err) {
      console.error(`Failed to write to log file: ${err.message}`);
    }
  },
  
  error: (message) => {
    const logEntry = `[ERROR] [${new Date().toISOString()}] ${message}\n`;
    console.error(logEntry.trim());
    try {
      fs.appendFileSync(errorLogFilePath, logEntry);
      fs.appendFileSync(logFilePath, logEntry);
    } catch (err) {
      console.error(`Failed to write to error log file: ${err.message}`);
    }
  },
  
  warn: (message) => {
    const logEntry = `[WARN] [${new Date().toISOString()}] ${message}\n`;
    console.warn(logEntry.trim());
    try {
      fs.appendFileSync(logFilePath, logEntry);
    } catch (err) {
      console.error(`Failed to write to log file: ${err.message}`);
    }
  },
  
  debug: (message) => {
    if (process.env.NODE_ENV !== 'production') {
      const logEntry = `[DEBUG] [${new Date().toISOString()}] ${message}\n`;
      console.debug(logEntry.trim());
      try {
        fs.appendFileSync(logFilePath, logEntry);
      } catch (err) {
        console.error(`Failed to write to log file: ${err.message}`);
      }
    }
  }
};

module.exports = logger; 