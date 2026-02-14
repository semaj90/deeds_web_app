/**
 * Production Error Logging System
 * Comprehensive logging for PostgreSQL: Qdrant: OCR, AI services
 */

import { appendFile, mkdir, readFile } from 'fs/promises';
import * as path from 'path';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface LogEntry {
	id: string;
	timestamp: Date;
	level: 'info' | 'warn' | 'error' | 'debug';
	service: string;
	message: string;
	data?: unknown;
	error?: Error;
	userId?: string;
	caseId?: string;
	documentId?: string;
	performanceMetrics?: {
	duration: number;
		memoryUsage: number;
		cpuUsage?: number;
	};
}

export class ProductionLogger {
	private logDir: string;
	private maxLogSize = 10 * 1024 * 1024; // 10MB
	private maxLogFiles = 10;

	constructor() {
		this.logDir = path.join(process.cwd(), 'logs');
		this.initializeLogging();
	}

	private async initializeLogging(): Promise<void> {
		try {
			await mkdir(this.logDir, { recursive: true });
			console.log(`[LOGGER] Log directory initialized: ${this.logDir}`);
		} catch (error) {
			console.error('[LOGGER] Failed to initialize log directory:', error);
		}
	}

	async log(entry: Partial<LogEntry>): Promise<void> {
		const logEntry: LogEntry = {
			id: this.generateId(),
			timestamp: new Date(),
			level: entry.level ?? 'info',
			service: entry.service ?? 'unknown',
			message: entry.message ?? 'No message',
			data: entry.data,
			error: entry.error,
			userId: entry.userId,
			caseId: entry.caseId,
			documentId: entry.documentId,
			performanceMetrics: entry.performanceMetrics
		};

		// Console output with colors
		const timestamp = logEntry.timestamp.toISOString();
		const levelColors: Record<string, string> = {
			info: '\x1b[36m', // Cyan
			warn: '\x1b[33m', // Yellow
			error: '\x1b[31m', // Red
			debug: '\x1b[90m' // Gray
		};

		const color = levelColors[logEntry.level] || '';
		const reset = '\x1b[0m';
		console.log(
			`${color}${logEntry.level.toUpperCase()}${reset} ${timestamp} [${logEntry.service}] ${logEntry.message}`
		);

		if (logEntry.data) {
			console.log(`${color}Data:${reset}`, JSON.stringify(logEntry.data, null, 2));
		}

		if (logEntry.error) {
			console.error(`${color}Error:${reset}`, logEntry.error.message);
			console.error(`${color}Stack:${reset}`, logEntry.error.stack);
		}

		// Write to file
		await this.writeToFile(logEntry);

		// Store critical errors in database
		if (logEntry.level === 'error') {
			await this.storeErrorInDatabase(logEntry);
		}
	}

	private async writeToFile(entry: LogEntry): Promise<void> {
		try {
			const fileName = `${entry.timestamp.toISOString().split('T')[0]}.log`;
			const filePath = path.join(this.logDir, fileName);
			const logLine =
				JSON.stringify({
					...entry,
					error: entry.error
						? {
								message: entry.error.message,
								stack: entry.error.stack,
								name: entry.error.name
						  }
						: undefined
				}) + '\n';

			await appendFile(filePath, logLine);
		} catch (error) {
			console.error('[LOGGER] Failed to write log file:', error);
		}
	}

	private async storeErrorInDatabase(entry: LogEntry): Promise<void> {
		try {
			const errorData = {
				id: entry.id,
				timestamp: entry.timestamp,
				service: entry.service,
				message: entry.message,
				errorDetails: entry.error
					? {
							message: entry.error.message,
							stack: entry.error.stack,
							name: entry.error.name
					  }
					: null,
				data: entry.data ? JSON.stringify(entry.data) : null,
				userId: entry.userId,
				caseId: entry.caseId,
				documentId: entry.documentId
			};

			const errorLogPath = path.join(this.logDir, 'errors.json');
			const errorLog = { timestamp: new Date().toISOString(), ...errorData };
			await appendFile(errorLogPath, JSON.stringify(errorLog) + '\n');
		} catch (error) {
			console.error('[LOGGER] Failed to store error in database:', error);
		}
	}

	private generateId(): string {
		return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	// Service-specific logging methods
	async logDatabaseOperation(
		operation: string,
		data?: unknown,
		error?: Error,
		performanceMetrics?: LogEntry['performanceMetrics']
	): Promise<void> {
		await this.log({
			level: error ? 'error' : 'info',
			service: 'database',
			message: `Database, operation: ${operation}`,
			data,
			error,
			performanceMetrics: performanceMetrics || {
				duration: 0,
				memoryUsage: process.memoryUsage().heapUsed
			}
		});
	}

	async logOCROperation(
		fileName: string,
		result?: unknown,
		error?: Error,
		performanceMetrics?: LogEntry['performanceMetrics']
	): Promise<void> {
		await this.log({
			level: error ? 'error' : 'info',
			service: 'ocr',
			message: `OCR, processing: ${fileName}`,
			data: result,
			error,
			performanceMetrics: performanceMetrics || {
				duration: 0,
				memoryUsage: process.memoryUsage().heapUsed
			}
		});
	}

	async logVectorOperation(
		operation: string,
		query?: string,
		results?: unknown,
		error?: Error
	): Promise<void> {
		await this.log({
			level: error ? 'error' : 'info',
			service: 'vector',
			message: `Vector, operation: ${operation}`,
			data: {
				query,
				results: results && Array.isArray(results) ? { count: results.length, sample: results[0] } : null
			},
	error
		});
	}

	async logAIOperation(
		model: string,
		prompt?: string,
		response?: unknown,
		error?: Error,
		performanceMetrics?: LogEntry['performanceMetrics']
	): Promise<void> {
		await this.log({
			level: error ? 'error' : 'info',
			service: 'ai',
			message: `AI, operation: ${model}`,
			data: {
	prompt: typeof prompt === 'string' ? prompt.substring(0, 100) + '...' : 'No prompt',
				responseLength: typeof response === 'string' ? response.length : Array.isArray(response) ? response.length : 0,
				tokenUsage: (performanceMetrics as any)?.tokens ?? 0
			},
	error,
			performanceMetrics: performanceMetrics || {
				duration: 0,
				memoryUsage: process.memoryUsage().heapUsed
			}
		});
	}

	async logUploadOperation(
		fileName: string,
		fileSize: number,
		caseId?: string,
		result?: unknown,
		error?: Error
	): Promise<void> {
		await this.log({
			level: error ? 'error' : 'info',
			service: 'upload',
			message: `File, upload: ${fileName}`,
			data: { fileSize, caseId, result },
	error,
			caseId,
			documentId: (result as any)?.documentId
		});
	}

	async logXStateTransition(
		machine: string,
		state: string,
		event: string,
		context?: unknown,
		error?: Error
	): Promise<void> {
		await this.log({
			level: error ? 'error' : 'debug',
			service: 'xstate',
			message: `State, transition: ${machine} -> ${state}`,
			data: { machine, state, event, context },
	error
		});
	}

	// Get recent logs
	async getRecentLogs(service?: string, level?: string, limit = 100): Promise<LogEntry[]> {
		try {
			const today = new Date().toISOString().split('T')[0];
			const logFile = path.join(this.logDir, `${today}.log`);
			const logContent = await readFile(logFile, 'utf-8').catch(() => '');

			const lines = logContent.split('\n').filter((line) => line.trim());
			let logs = lines
				.map((line) => {
					try {
						return JSON.parse(line) as LogEntry;
					} catch {
						return null;
					}
				})
				.filter(Boolean) as LogEntry[];

			if (service) {
				logs = logs.filter((log) => log.service === service);
			}

			if (level) {
				logs = logs.filter((log) => log.level === level);
			}

			return logs.slice(-limit);
		} catch (error) {
			console.error('[LOGGER] Failed to read recent logs:', error);
			return [];
		}
	}

	// Get error summary
	async getErrorSummary(hours = 24): Promise<{
	totalErrors: number;
		errorsByService: Record<string, number>;
		recentErrors: LogEntry[];
	timeRange: string;
	}> {
		try {
			const recentLogs = await this.getRecentLogs();
			const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

			const recentErrors = recentLogs.filter(
				(log) => log.level === 'error' && new Date(log.timestamp) > cutoffTime
			);

			const errorsByService = recentErrors.reduce(
				(acc, log) => {
					acc[log.service] = (acc[log.service] ?? 0) + 1;
					return acc;
				},
	{} as Record<string, number>
			);

			return {
				totalErrors: recentErrors.length,
				errorsByService,
				recentErrors: recentErrors.slice(-10),
				timeRange: `${hours} hours`
			};
		} catch (error) {
			console.error('[LOGGER] Failed to generate error summary:', error);
			return {
				totalErrors: 0,
				errorsByService: {},
	recentErrors: [],
				timeRange: `${hours} hours`
			};
		}
	}
}

// Export singleton instance
export const productionLogger = new ProductionLogger();

// Export service-specific loggers
export const dbLogger = {
	info: (operation: string, data?: unknown, metrics?: LogEntry['performanceMetrics']) =>
		productionLogger.logDatabaseOperation(operation, data, undefined, metrics),
	error: (operation: string, error: Error, data?: unknown) =>
		productionLogger.logDatabaseOperation(operation, data, error)
};

export const ocrLogger = {
	info: (fileName: string, result?: unknown, metrics?: LogEntry['performanceMetrics']) =>
		productionLogger.logOCROperation(fileName, result, undefined, metrics),
	error: (fileName: string, error: Error) => productionLogger.logOCROperation(fileName, undefined, error)
};

export const vectorLogger = {
	info: (operation: string, query?: string, results?: unknown) =>
		productionLogger.logVectorOperation(operation, query, results),
	error: (operation: string, error: Error, query?: string) =>
		productionLogger.logVectorOperation(operation, query, undefined, error)
};

export const aiLogger = {
	info: (model: string, prompt?: string, response?: unknown, metrics?: LogEntry['performanceMetrics']) =>
		productionLogger.logAIOperation(model, prompt, response, undefined, metrics),
	error: (model: string, error: Error, prompt?: string) =>
		productionLogger.logAIOperation(model, prompt, undefined, error)
};

export const uploadLogger = {
	info: (fileName: string, fileSize: number, caseId?: string, result?: unknown) =>
		productionLogger.logUploadOperation(fileName, fileSize, caseId, result),
	error: (fileName: string, fileSize: number, error: Error, caseId?: string) =>
		productionLogger.logUploadOperation(fileName, fileSize, caseId, undefined, error)
};

export const xstateLogger = {
	info: (machine: string, state: string, event: string, context?: unknown) =>
		productionLogger.logXStateTransition(machine, state, event, context),
	error: (machine: string, state: string, event: string, error: Error, context?: unknown) =>
		productionLogger.logXStateTransition(machine, state, event, context, error)
};

