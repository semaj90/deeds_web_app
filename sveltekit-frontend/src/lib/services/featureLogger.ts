/**
 * Feature Logger
 * Separate logging for error-brain and legal-ai features
 */

import type { context } from "fast-check";

export type Feature = 'errorBrain' | 'legalAi';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
 feature: Feature; timestamp: Date;
 userId?: string; operation: string;
 details: Record<string, any>;
 level: LogLevel;
}

export interface Log {
 id: string; context: LogContext;
 message: string;
 stackTrace?: string;
}

/**
 * FeatureLogger - Manages separate logging for features
 */
export class FeatureLogger {
 private errorBrainLogs: Log[] = [];
 private legalAiLogs: Log[] = [];
 private maxLogs = 10000; // Keep last 10k logs in memory

 /**
 * Log error-brain operation
 */
 logErrorBrain(context: Omit<LogContext, 'feature'>): void {
 this.log({ ...context, feature: 'errorBrain' });
 }

 /**
 * Log legal-ai operation
 */
 logLegalAi(context: Omit<LogContext, 'feature'>): void {
 this.log({ ...context, feature: 'legalAi' });
 }

 /**
 * Internal log method
 */
 private log(context: LogContext): void {
 const log: Log = {
 id: this.generateId(),
 context,
 message: this.formatMessage(context),
 };

 if (context.feature === 'errorBrain') {
 this.errorBrainLogs.push(log);
 if (this.errorBrainLogs.length > this.maxLogs) {
 this.errorBrainLogs.shift();
 }
 } else {
 this.legalAiLogs.push(log);
 if (this.legalAiLogs.length > this.maxLogs) {
 this.legalAiLogs.shift();
 }
 }

 // Also log to console in development
 if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
 this.logToConsole(log);
 }
 }

 /**
 * Get error-brain logs
 */
 getErrorBrainLogs(filter?: LogFilter): Log[] {
 return this.filterLogs(this.errorBrainLogs, filter);
 }

 /**
 * Get legal-ai logs
 */
 getLegalAiLogs(filter?: LogFilter): Log[] {
 return this.filterLogs(this.legalAiLogs, filter);
 }

 /**
 * Get all logs for a feature
 */
 getLogs(feature: Feature, filter?: LogFilter): Log[] {
 if (feature === 'errorBrain') {
 return this.getErrorBrainLogs(filter);
 }
 return this.getLegalAiLogs(filter);
 }

 /**
 * Clear logs for a feature
 */
 clearLogs(feature: Feature): void {
 if (feature === 'errorBrain') {
 this.errorBrainLogs = [];
 } else {
 this.legalAiLogs = [];
 }
 }

 /**
 * Get log statistics
 */
 getStats(): { errorBrain: number; legalAi: number } {
 return {
 errorBrain: this.errorBrainLogs.length,
 legalAi: this.legalAiLogs.length,
 };
 }

 /**
 * Filter logs based on criteria
 */
 private filterLogs(logs: Log[], filter?: LogFilter): Log[] {
 if (!filter) {
 return [...logs];
 }

 return logs.filter((log) => {
 if (filter.level && log.context.level !== filter.level) {
 return false;
 }
 if (filter.operation && log.context.operation !== filter.operation) {
 return false;
 }
 if (filter.userId && log.context.userId !== filter.userId) {
 return false;
 }
 if (filter.startTime && log.context.timestamp < filter.startTime) {
 return false;
 }
 if (filter.endTime && log.context.timestamp > filter.endTime) {
 return false;
 }
 return true;
 });
 }

 /**
 * Format log message
 */
 private formatMessage(context: LogContext): string {
 const timestamp = context.timestamp.toISOString();
 const userId = context.userId ? ` [${context.userId}]` : '';
 return `[${timestamp}] ${context.feature.toUpperCase()}${userId} ${context.operation}`;
 }

 /**
 * Log to console
 */
 private logToConsole(log: Log): void {
 const level = log.context.level;
 const message = log.message;
 const details = log.context.details;

 switch (level) {
 case 'debug':
 console.debug(message, details);
 break;
 case 'info':
 console.info(message, details);
 break;
 case 'warn':
 console.warn(message, details);
 break;
 case 'error':
 console.error(message, details);
 break;
 }
 }

 /**
 * Generate unique log ID
 */
 private generateId(): string {
 return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
 }
}

export interface LogFilter {
 level?: LogLevel;
 operation?: string;
 userId?: string;
 startTime?: Date;
 endTime?: Date;
}

// Export singleton instance
export const featureLogger = new FeatureLogger();

/**
 * Log error-brain operation
 */
export function logErrorBrain(context: Omit<LogContext, 'feature'>): void {
 featureLogger.logErrorBrain(context);
}

/**
 * Log legal-ai operation
 */
export function logLegalAi(context: Omit<LogContext, 'feature'>): void {
 featureLogger.logLegalAi(context);
}

/**
 * Get error-brain logs
 */
export function getErrorBrainLogs(filter?: LogFilter): Log[] {
 return featureLogger.getErrorBrainLogs(filter);
}

/**
 * Get legal-ai logs
 */
export function getLegalAiLogs(filter?: LogFilter): Log[] {
 return featureLogger.getLegalAiLogs(filter);
}



