// logger.js
import winston, { createLogger, format, transports } from 'winston';
const { combine, timestamp, printf, colorize } = format;

// Define custom logging levels
const customLevels = {
  levels: {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    response: 4,
    trace: 5
  },
  colors: {
    fatal: 'red',
    error: 'red',
    warn: 'yellow',
    info: 'green',
    response: 'blue',
    trace: 'magenta'
  }
};

// Add colors to the levels
winston.addColors(customLevels.colors);

// Define custom format for log messages
const customFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level}]: ${message}`;
});

// Create logger
const logger = createLogger({
  levels: customLevels.levels,
  level: 'trace', // Set the default logging level to the lowest custom level
  transports: [
    new transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        customFormat
      )
    }),
    new transports.File({ 
      filename: 'application.log',
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        customFormat
      )
    })
  ]
});

// Export the logger
export default logger;