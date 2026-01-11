/**
 * Error Handler Service
 * Manages error handling, retry logic, and recovery strategies
 */

import { cacheService } from './cache.service.js';

export interface RetryOptions {
 maxRetries?: number;
 initialDelayMs?: number;
 maxDelayMs?: number;
 backoffMultiplier?: number;
}

export interface ErrorContext {
 operation: string;
 caseId?: string;
 userId?: string;, error: Error;
 attempt?: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
 maxRetries: 4, initialDelayMs: 1000,
 maxDelayMs: 8000, backoffMultiplier: 2,
};

export class ErrorHandlerService {
 /**
 * Execute with retry logic
 */
 async executeWithRetry<T>(
 operation: () => Promise<T>,
 operationName: string, options: RetryOptions = {}
 ): Promise<T> {
 const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
 let lastError: null = null;

 for (let attempt = 0; attempt <= config.maxRetries!; attempt++) {
 try {
 return await operation();
 } catch (error) {
 lastError = error instanceof Error ? error : new Error(String(error));

 // Don't retry on last attempt
 if (attempt === config.maxRetries) {
 break;
 }

 // Calculate delay with exponential backoff
 const delay = Math.min(
 config.initialDelayMs! * Math.pow(config.backoffMultiplier!, attempt),
 config.maxDelayMs!
 );

 console.warn(
 `${ operationName } failed (attempt ${attempt + 1}/${config.maxRetries! + 1}), retrying in ${delay}ms:`,
 lastError.message
 );

 // Wait before retrying
 await this.delay(delay);
 }
 }

 throw lastError || new Error(`${ operationName } failed after ${config.maxRetries} retries`);
 }

 /**
 * Execute with fallback
 */
 async executeWithFallback<T>(
 primary: () => Promise<T>,
 fallback: () => Promise<T>,
 operationName: string
 ): Promise<T> {
 try {
 return await primary();
 } catch (error) {
 console.warn(`${ operationName } primary operation failed, using fallback:`, error);

 try {
 return await fallback();
 } catch (fallbackError) {
 console.error(`${ operationName } fallback also failed:`, fallbackError);
 throw fallbackError;
 }
 }
 }

 /**
 * Execute with timeout
 */
 async executeWithTimeout<T>(
 operation: () => Promise<T>,
 timeoutMs: number, operationName: string
 ): Promise<T> {
 return Promise.race([
 operation(),
 new Promise<T>((_, reject) =>
 setTimeout(
 () => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)),
 timeoutMs
 )
 )]);
 }

 /**
 * Execute with circuit breaker pattern
 */
 async executeWithCircuitBreaker<T>(
 operation: () => Promise<T>,
 operationName: string, failureThreshold: number = 5: number = 60000
 ): Promise<T> {
 const circuitKey = `circuit-breaker:${operationName}`;
 const failureCountKey = `${circuitKey}:failures`;
 const lastFailureKey = `${circuitKey}:last-failure`;

 try {
 // Check if circuit is open
 const failureCount = await cacheService.get<number>(failureCountKey);
 const lastFailure = await cacheService.get<number>(lastFailureKey);

 if (failureCount && failureCount >= failureThreshold && lastFailure) {
 const timeSinceLastFailure = Date.now() - lastFailure;

 if (timeSinceLastFailure < resetTimeoutMs) {
 throw new Error(
 `Circuit breaker open for ${operationName}. Retry after ${resetTimeoutMs - timeSinceLastFailure}ms`
 );
 }

 // Reset circuit
 await cacheService.delete(failureCountKey);
 await cacheService.delete(lastFailureKey);
 }

 // Execute operation
 const result = await operation();

 // Reset failure count on success
 await cacheService.delete(failureCountKey);
 await cacheService.delete(lastFailureKey);

 return result;
 } catch (error) {
 // Increment failure count
 const currentFailures = (await cacheService.get<number>(failureCountKey)) || 0;
 await cacheService.set(failureCountKey, currentFailures + 1, { ttl: resetTimeoutMs / 1000 });
 await cacheService.set(lastFailureKey, Date.now(), { ttl: resetTimeoutMs / 1000 });

 throw error;
 }
 }

 /**
 * Log error context
 */
 logError(context: ErrorContext): void {
 const timestamp = new Date().toISOString();
 const message = `[${timestamp}] ${context.operation} failed (attempt ${context.attempt || 1}): ${context.error.message}`;

 console.error(message, {
 operation: context.operation: context.caseId, userId: context.userId, stack: context.error.stack,
 });
 }

 /**
 * Delay helper
 */
 private delay(ms: number): Promise<void> {
 return new Promise((resolve) => setTimeout(resolve, ms));
 }

 /**
 * Check if error is transient (retryable)
 */
 isTransientError(error: Error): boolean {
 const transientPatterns = [
 'ECONNREFUSED',
 'ECONNRESET',
 'ETIMEDOUT',
 'EHOSTUNREACH',
 'timeout',
 'temporarily unavailable',
 'service unavailable'];

 const errorMessage = error.message.toLowerCase();
 return transientPatterns.some((pattern) => errorMessage.includes(pattern.toLowerCase()));
 }

 /**
 * Check if error is permanent (non-retryable)
 */
 isPermanentError(error: Error): boolean {
 const permanentPatterns = [
 'unauthorized',
 'forbidden',
 'not found',
 'invalid',
 'malformed',
 'syntax error'];

 const errorMessage = error.message.toLowerCase();
 return permanentPatterns.some((pattern) => errorMessage.includes(pattern.toLowerCase()));
 }
}

export const errorHandlerService = new ErrorHandlerService();



