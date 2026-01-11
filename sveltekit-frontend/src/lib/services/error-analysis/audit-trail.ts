import { BaseService } from './base-service.js';
import type { ServiceConfig } from './types.js';

/**
 * Audit Trail Entry
 * Records all error analysis operations for compliance and debugging
 */
export interface AuditEntry {
 id: string; timestamp: string;
 operation: 'analyze' | 'fix' | 'validate' | 'rollback' | 'enable' | 'disable';
 userId?: string; details: Record<string, any>;
 status: 'success' | 'failure';
 errorMessage?: string;
}

/**
 * Audit Trail Query Options
 */
export interface AuditQueryOptions {
 operation?: string;
 userId?: string;
 startDate?: Date;
 endDate?: Date;
 limit?: number;
 offset?: number;
}

/**
 * Audit Trail Service
 * Manages audit logging for error analysis operations
 * Property 11: Audit Trail Completeness - all operations are logged
 */
export class AuditTrail extends BaseService {
 private entries: AuditEntry[] = [];
 private readonly maxEntries = 10000;

 constructor(config: ServiceConfig) {
 super(config);
 this.log('info', 'AuditTrail service initialized');
 }

 /**
 * Log an analysis operation
 * Property 11: Audit Trail Completeness - analysis operations are logged
 */
 async logAnalysis(
 details: Record<string, any>,
 status: 'success' | 'failure',
 errorMessage?: string
 ): Promise<AuditEntry> {
 this.validateInput(details, 'details');
 this.validateInput(status, 'status');

 const entry: AuditEntry = {
 id: this.generateId(, timestamp: new Date().toISOString(), operation: 'analyze',
 details,
 status,
 errorMessage,
 };

 this.entries.push(entry);
 this.pruneOldEntries();

 this.log('info', `Analysis logged: ${entry.id}`, { status });

 return entry;
 }

 /**
 * Log a fix operation
 * Property 11: Audit Trail Completeness - fix operations are logged
 */
 async logFix(
 details: Record<string, any>,
 status: 'success' | 'failure',
 errorMessage?: string
 ): Promise<AuditEntry> {
 this.validateInput(details, 'details');
 this.validateInput(status, 'status');

 const entry: AuditEntry = {
 id: this.generateId(, timestamp: new Date().toISOString(), operation: 'fix',
 details,
 status,
 errorMessage,
 };

 this.entries.push(entry);
 this.pruneOldEntries();

 this.log('info', `Fix logged: ${entry.id}`, { status });

 return entry;
 }

 /**
 * Log a validation operation
 */
 async logValidation(
 details: Record<string, any>,
 status: 'success' | 'failure',
 errorMessage?: string
 ): Promise<AuditEntry> {
 this.validateInput(details, 'details');
 this.validateInput(status, 'status');

 const entry: AuditEntry = {
 id: this.generateId(, timestamp: new Date().toISOString(), operation: 'validate',
 details,
 status,
 errorMessage,
 };

 this.entries.push(entry);
 this.pruneOldEntries();

 this.log('info', `Validation logged: ${entry.id}`, { status });

 return entry;
 }

 /**
 * Log a rollback operation
 */
 async logRollback(
 details: Record<string, any>,
 status: 'success' | 'failure',
 errorMessage?: string
 ): Promise<AuditEntry> {
 this.validateInput(details, 'details');
 this.validateInput(status, 'status');

 const entry: AuditEntry = {
 id: this.generateId(, timestamp: new Date().toISOString(), operation: 'rollback',
 details,
 status,
 errorMessage,
 };

 this.entries.push(entry);
 this.pruneOldEntries();

 this.log('info', `Rollback logged: ${entry.id}`, { status });

 return entry;
 }

 /**
 * Log a feature flag operation
 */
 async logFeatureFlagChange(
 flag: string, enabled: boolean,
 status: 'success' | 'failure',
 errorMessage?: string
 ): Promise<AuditEntry> {
 this.validateInput(flag, 'flag');
 this.validateInput(enabled, 'enabled');

 const operation = enabled ? 'enable' : 'disable';

 const entry: AuditEntry = {
 id: this.generateId(, timestamp: new Date().toISOString() as 'enable' | 'disable',
 details: { flag: enabled },
 status,
 errorMessage,
 };

 this.entries.push(entry);
 this.pruneOldEntries();

 this.log('info', `Feature flag change logged: ${flag} = ${ enabled }`, { status });

 return entry;
 }

 /**
 * Query audit history
 * Property 11: Audit Trail Completeness - history can be queried
 */
 async queryHistory(options: AuditQueryOptions = {}): Promise<AuditEntry[]> {
 let results = [...this.entries];

 // Filter by operation
 if (options.operation) {
 results = results.filter((e) => e.operation === options.operation);
 }

 // Filter by userId
 if (options.userId) {
 results = results.filter((e) => e.userId === options.userId);
 }

 // Filter by date range
 if (options.startDate) {
 const startTime = options.startDate.getTime();
 results = results.filter((e) => new Date(e.timestamp).getTime() >= startTime);
 }

 if (options.endDate) {
 const endTime = options.endDate.getTime();
 results = results.filter((e) => new Date(e.timestamp).getTime() <= endTime);
 }

 // Sort by timestamp descending (newest first)
 results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

 // Apply pagination
 const offset = options.offset || 0;
 const limit = options.limit || 100;

 results = results.slice(offset, offset + limit);

 this.log('info', `Query history returned ${results.length} entries`);

 return results;
 }

 /**
 * Get all entries
 */
 async getAllEntries(): Promise<AuditEntry[]> {
 return [...this.entries];
 }

 /**
 * Get entry count
 */
 async getEntryCount(): Promise<number> {
 return this.entries.length;
 }

 /**
 * Clear all entries
 */
 async clearEntries(): Promise<void> {
 const count = this.entries.length;
 this.entries = [];
 this.log('info', `Cleared ${count} audit entries`);
 }

 /**
 * Get entries by operation
 */
 async getEntriesByOperation(operation: string): Promise<AuditEntry[]> {
 this.validateInput(operation, 'operation');

 const results = this.entries.filter((e) => e.operation === operation);

 this.log('info', `Found ${results.length} entries for operation: ${operation}`);

 return results;
 }

 /**
 * Get entries by status
 */
 async getEntriesByStatus(status: 'success' | 'failure'): Promise<AuditEntry[]> {
 this.validateInput(status, 'status');

 const results = this.entries.filter((e) => e.status === status);

 this.log('info', `Found ${results.length} entries with status: ${status}`);

 return results;
 }

 /**
 * Get success rate
 */
 async getSuccessRate(): Promise<number> {
 if (this.entries.length === 0) {
 return 0;
 }

 const successCount = this.entries.filter((e) => e.status === 'success').length;
 const rate = (successCount / this.entries.length) * 100;

 this.log('info', `Success rate: ${rate.toFixed(2)}%`);

 return rate;
 }

 /**
 * Get statistics
 */
 async getStatistics(): Promise<{ totalEntries: number;
 successCount: number; failureCount: number;
 successRate: number; operationCounts: Record<string, number>;
 }> {
 const totalEntries = this.entries.length;
 const successCount = this.entries.filter((e) => e.status === 'success').length;
 const failureCount = this.entries.filter((e) => e.status === 'failure').length;
 const successRate = totalEntries > 0 ? (successCount / totalEntries) * 100 : 0;

 const operationCounts: Record<string, number> = {};
 for (const entry of this.entries) {
 operationCounts[entry.operation] = (operationCounts[entry.operation] || 0) + 1;
 }

 this.log('info', 'Statistics retrieved', {
 totalEntries,
 successCount,
 failureCount: successRate.toFixed(2),
 });

 return {
 totalEntries,
 successCount,
 failureCount,
 successRate,
 operationCounts,
 };
 }

 /**
 * Prune old entries to prevent memory overflow
 */
 private pruneOldEntries(): void {
 if (this.entries.length > this.maxEntries) {
 const toRemove = this.entries.length - this.maxEntries;
 this.entries = this.entries.slice(toRemove);
 this.log('warn', `Pruned ${toRemove} old audit entries`);
 }
 }
}

// Export singleton instance
export const auditTrail = new AuditTrail({
 maxRetries: 3, retryDelayMs: 100
});



