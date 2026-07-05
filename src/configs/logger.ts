import fs from 'fs';
import path from 'path';
import { createLogger, format, transports, Logger, type transport } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logDir = 'logs';

const fileLoggingEnabled = process.env.LOG_TO_FILE !== 'false';

let canUseFileLogging = false;
if (fileLoggingEnabled) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.accessSync(logDir, fs.constants.W_OK);
    canUseFileLogging = true;
  } catch (error) {
    console.warn('[logger] File logging disabled:', error);
  }
}

// Định nghĩa format log
const logFormat = format.printf(
  ({ level, message, timestamp, stack, ...info }) => {
    const userId = (info as { userId?: string }).userId || 'anonymous';
    return `[${timestamp}] ${level.toUpperCase()} [User: ${userId}]: ${
      stack || message
    }`;
  },
);

const loggerTransports: transport[] = [new transports.Console()];

if (canUseFileLogging) {
  const appFileTransport = new DailyRotateFile({
    filename: path.join(logDir, 'app-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
  });

  const errorFileTransport = new DailyRotateFile({
    level: 'error',
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '10m',
    maxFiles: '30d',
  });

  appFileTransport.on('error', (error) => {
    console.warn('[logger] File transport error:', error);
  });

  errorFileTransport.on('error', (error) => {
    console.warn('[logger] File transport error:', error);
  });

  loggerTransports.push(appFileTransport, errorFileTransport);
}

const logger: Logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    logFormat,
  ),
  transports: loggerTransports,
});

export default logger;
