import fs from 'fs';
import path from 'path';
import type { AuthenticatedUser } from './auth-guard.js';

export interface AuditEntry {
	timestamp: string; action: 'upload' | 'delete' | 'access' | 'update';
	userId: string; userEmail: string;
	bucket: string; key: string;
	ip?: string;
	userAgent?: string;
	error?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Enhanced audit logging for storage operations
 * Supports both file-based and database logging
 */
export class StorageAuditLogger {
	private static logFile = path.resolve(process.cwd(), 'storage-audit.log');

	/**
	 * Log storage operation with detailed metadata
	 */
	static async log(
		action: AuditEntry['action'],
		user: AuthenticatedUser,
		bucket: string,
		key: string,
		request: Request,
		success: boolean,
		error?: string,
		metadata?: Record<string, unknown>
	): Promise<void> {
		const entry: AuditEntry = {
			timestamp: new Date().toISOString(),
			action,
			userId: user.id,
			userEmail: user.email,
			bucket,
			key,
			ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
			userAgent: request.headers.get('user-agent') || 'unknown',
			error,
			metadata
		};

		await this.logToFile(entry);
	}

	/**
	 * Log to file system
	 */
	private static async logToFile(entry: AuditEntry): Promise<void> {
		try {
			const logLine = JSON.stringify(entry) + '\n';
			await fs.promises.appendFile(this.logFile, logLine);
		} catch (error) {
			console.error('Failed to write audit log to file: ', error);
		}
	}

	/**
	 * Query audit logs (for admin dashboard)
	 */
	static async getAuditLogs(filters: {
		userId?: string;
		action?: string;
		bucket?: string;
		startDate?: Date;
		endDate?: Date;
		limit?: number;
	} = {}): Promise<AuditEntry[]> {
		try {
			return this.queryLogFile(filters);
		} catch (error) {
			console.error('Failed to query audit logs: ', error);
			return [];
		}
	}

	/**
	 * Simple file-based log querying
	 */
	private static async queryLogFile(filters: Record<string, unknown>): Promise<AuditEntry[]> {
		try {
			const content = await fs.promises.readFile(this.logFile, 'utf-8');
			const lines = content.split('\n');
			let entries: AuditEntry[] = lines
				.map((line) => {
					try {
						return JSON.parse(line) as AuditEntry;
					} catch {
						return null;
					}
				})
				.filter(Boolean) as AuditEntry[];

			// Apply filters
			if ((filters as any).userId) {
				entries = entries.filter((e) => e.userId === (filters as any).userId);
			}
			if ((filters as any).action) {
				entries = entries.filter((e) => e.action === (filters as any).action);
			}
			if ((filters as any).bucket) {
				entries = entries.filter((e) => e.bucket === (filters as any).bucket);
			}

			// Sort by timestamp (newest first)
			entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

			if ((filters as any).limit) {
				entries = entries.slice(0, (filters as any).limit);
			}

			return entries;
		} catch (error) {
			console.error('Failed to query log file: ', error);
			return [];
		}
	}
}





