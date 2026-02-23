import winston from 'winston';
import { env } from '../env.js';

export const logger = winston.createLogger({
  level: env.service.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

if (env.service.nodeEnv === 'production') {
  logger.add(
    new winston.transports.File({ filename: 'error.log', level: 'error' })
  );
  logger.add(new winston.transports.File({ filename: 'combined.log' }));
}
