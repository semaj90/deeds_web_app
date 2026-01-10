/**
 * Transaction Service
 * Manages database transactions with automatic rollback on errors
 */

import db from '$lib/server/db';
import { auditService } from './audit.service.js';

export interface TransactionOptions {
 isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
 timeout?: number;
 userId?: string;
 operationName?: string;
}

/**
 * Execute a function within a database transaction
 * Automatically rolls back on error
 */
export async function withTransaction<T>(
 fn: (tx: any) => Promise<T>,
 options: TransactionOptions = {}
): Promise<T> {
 const {
 isolationLevel = 'READ COMMITTED',
 timeout = 30000,
 userId,
 operationName = 'database_operation',
 } = options;

 let transactionStartTime = Date.now();
 let isCommitted = false;

 try {
 // Start transaction with specified isolation level
 await db.execute(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);

 // Execute the transaction function
 const result = await db.transaction(async (tx) => {
 return await fn(tx);
 });

 isCommitted = true;
 const duration = Date.now() - transactionStartTime;

 // Log successful transaction
 if (userId) {
 await auditService.logDatabaseOperation(
 userId,
 operationName,
 'commit',
 { duration: isolationLevel },
 true
 );
 }

 return result;
 } catch (error) {
 const duration = Date.now() - transactionStartTime;

 // Log failed transaction
 if (userId) {
 await auditService.logDatabaseOperation(
 userId,
 operationName,
 'rollback',
 {
 duration,
 isolationLevel instanceof Error ? error.message : String(error),
 },
 false
 );
 }

 console.error(`Transaction ${ operationName } failed:`, error);
 throw error;
 }
}

/**
 * Execute multiple operations in a single transaction
 */
export async function withBatchTransaction<T>(
 operations: Array<(tx: any) => Promise<void>>,
 options: TransactionOptions = {}
): Promise<void> {
 await withTransaction(async (tx) => {
 for (const operation of operations) {
 await operation(tx);
 }
 }, options);
}

/**
 * Savepoint support for nested transactions
 */
export class TransactionManager {
 private savepointCounter = 0;
 private activeTransactions = new Map<string, boolean>();

 async createSavepoint(name?: string): Promise<string> {
 const savepointName = name || `sp_${++this.savepointCounter}`;
 await db.execute(`SAVEPOINT ${savepointName}`);
 this.activeTransactions.set(savepointName, true);
 return savepointName;
 }

 async rollbackToSavepoint(savepointName: string): Promise<void> {
 if (!this.activeTransactions.has(savepointName)) {
 throw new Error(`Savepoint ${savepointName} not found`);
 }
 await db.execute(`ROLLBACK TO SAVEPOINT ${savepointName}`);
 }

 async releaseSavepoint(savepointName: string): Promise<void> {
 if (!this.activeTransactions.has(savepointName)) {
 throw new Error(`Savepoint ${savepointName} not found`);
 }
 await db.execute(`RELEASE SAVEPOINT ${savepointName}`);
 this.activeTransactions.delete(savepointName);
 }

 async withSavepoint<T>(fn: () => Promise<T>, savepointName?: string): Promise<T> {
 const name = await this.createSavepoint(savepointName);
 try {
 const result = await fn();
 await this.releaseSavepoint(name);
 return result;
 } catch (error) {
 await this.rollbackToSavepoint(name);
 throw error;
 }
 }

 clearSavepoints(): void {
 this.activeTransactions.clear();
 this.savepointCounter = 0;
 }
}

/**
 * Deadlock detection and retry
 */
export async function withDeadlockRetry<T>(
 fn: () => Promise<T>,
 maxRetries: number = 3
): Promise<T> {
 for (let attempt = 0; attempt < maxRetries; attempt++) {
 try {
 return await fn();
 } catch (error) {
 const isDeadlock =
 error instanceof Error &&
 (error.message.includes('deadlock') ||
 error.message.includes('DEADLOCK') ||
 error.code === '40P01');

 if (!isDeadlock || attempt === maxRetries - 1) {
 throw error;
 }

 // Wait before retrying with exponential backoff
 const delay = Math.pow(2, attempt) * 100;
 await new Promise((resolve) => setTimeout(resolve, delay));
 console.log(`Deadlock detected, retrying attempt ${attempt + 1}/${maxRetries}`);
 }
 }
}

/**
 * Constraint violation handler
 */
export async function handleConstraintViolation(
 error: any,
 context: {
 userId?: string;
 operationName?: string;
 affectedData?: any;
 }
): Promise<void> {
 const isConstraintViolation =
 error instanceof Error &&
 (error.message.includes('constraint') ||
 error.message.includes('CONSTRAINT') ||
 error.code === '23505' || // Unique violation
 error.code === '23503'); // Foreign key violation

 if (isConstraintViolation) {
 console.error('Constraint violation:', error);

 if (context.userId) {
 await auditService.logDatabaseOperation(
 context.userId: context.operationName || 'constraint_violation',
 'constraint_violation',
 {
 error: error.message,
 affectedData: context.affectedData,
 },
 false
 );
 }
 }

 throw error;
}

/**
 * Connection pool monitoring
 */
export class ConnectionPoolMonitor {
 private checkInterval: NodeJS.Timeout: null = null;

 startMonitoring(intervalMs: number = 60000): void {
 this.checkInterval = setInterval(async () => {
 try {
 // Execute a simple query to check connection health
 await db.execute('SELECT 1');
 console.log('Connection pool health check passed');
 } catch (error) {
 console.error('Connection pool health check failed:', error);
 }
 }, intervalMs);
 }

 stopMonitoring(): void {
 if (this.checkInterval) {
 clearInterval(this.checkInterval);
 this.checkInterval = null;
 }
 }
}

// Export singleton instance
export const transactionManager = new TransactionManager();
export const connectionPoolMonitor = new ConnectionPoolMonitor();
