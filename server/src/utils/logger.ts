import winston from 'winston';
import fs from 'fs';
import path from 'path';
import { resolveLogsDir } from '../lib/paths.js';

const logsDir = resolveLogsDir();
fs.mkdirSync(logsDir, { recursive: true });

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      ),
    }),
    // Size-based rotation so logs can't fill the disk on a long-running kiosk.
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5 MB per file
      maxFiles: 3,
      tailable: true,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10 MB per file
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

export { logger };
