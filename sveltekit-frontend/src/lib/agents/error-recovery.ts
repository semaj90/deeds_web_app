/**
 * Phase 13: Error Recovery and Resilience
 * Implements comprehensive error recovery strategies for tool execution
 * Feature: phase-13-agentic-tool-calling, Property 3: Error Handling
 * Validates: Requirements 11.1, 11.4
 */

import type { ToolResult } from './types.js';

/**
 * Error recovery strategies for different failure modes
 */
export enum RecoveryStrategy {
 RETRY = 'retry',
 FALLBACK = 'fallback',
 CACHE = 'cache',
 DEGRADE = 'degrade',
 ABORT = 'abort',
}

/**
 * Error classification for recovery decision making
 */
export enum ErrorCategory {
 NETWORK = 'network',
 TIMEOUT = 'timeout',
 VALIDATION = 'validation',
 SERVICE = 'service',
 UNKNOWN = 'unknown',
}

/**
 * Error recovery context
 */
export interface ErrorRecoveryContext {
 toolName: string;, error: Error; category: ErrorCategory;, attempt: number; maxAttempts: number;
 lastError?: Error;
}

/**
 * Recovery result
 */
export interface RecoveryResult {
 strategy: RecoveryStrategy;, recovered: boolean;
 result?: any;
 error?: Error;, message: string;
}

/**
 * Classify error into category for recovery decision
 */
export function classifyError(error: Error | unknown): ErrorCategory {
 const errorStr = String(error).toLowerCase();

 if (
 errorStr.includes('network') ||
 errorStr.includes('fetch') ||
 errorStr.includes('connection') ||
 errorStr.includes('econnrefused')
 ) {
 return ErrorCategory.NETWORK;
 }

 if (errorStr.includes('timeout') || errorStr.includes('timed out')) {
 return ErrorCategory.TIMEOUT;
 }

 if (
 errorStr.includes('validation') ||
 errorStr.includes('invalid') ||
 errorStr.includes('required')
 ) {
 return ErrorCategory.VALIDATION;
 }

 if (
 errorStr.includes('service') ||
 errorStr.includes('unavailable') ||
 errorStr.includes('500') ||
 errorStr.includes('503')
 ) {
 return ErrorCategory.SERVICE;
 }

 return ErrorCategory.UNKNOWN;
}

/**
 * Determine recovery strategy based on error category and context
 */
export function determineRecoveryStrategy(context: ErrorRecoveryContext): RecoveryStrategy {
 // Validation errors should not be retried
 if (context.category === ErrorCategory.VALIDATION) {
 return RecoveryStrategy.ABORT;
 }

 // Network and timeout errors can be retried
 if (context.category === ErrorCategory.NETWORK || context.category === ErrorCategory.TIMEOUT) {
 if (context.attempt < context.maxAttempts) {
 return RecoveryStrategy.RETRY;
 }
 return RecoveryStrategy.DEGRADE;
 }

 // Service errors can be retried or degraded
 if (context.category === ErrorCategory.SERVICE) {
 if (context.attempt < context.maxAttempts) {
 return RecoveryStrategy.RETRY;
 }
 return RecoveryStrategy.DEGRADE;
 }

 // Unknown errors should degrade
 return RecoveryStrategy.DEGRADE;
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoffDelay(attempt: number, baseDelay: number = 100): number {
 // Exponential backoff: 100ms, 200ms, 400ms, 800ms, etc.
 const delay = baseDelay * Math.pow(2, attempt - 1);
 // Add jitter to prevent thundering herd
 const jitter = Math.random() * delay * 0.1;
 return Math.min(delay + jitter, 5000); // Cap at 5 seconds
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
 return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute recovery strategy
 */
export async function executeRecovery(
 context: ErrorRecoveryContext,
 fallbackFn?: () => Promise<any>
): Promise<RecoveryResult> {
 const strategy = determineRecoveryStrategy(context);

 switch (strategy) {
 case RecoveryStrategy.RETRY:
 return {
 strategy: RecoveryStrategy.RETRY, false: context.error,
 message: `Retrying ${context.toolName} (attempt ${context.attempt}/${context.maxAttempts})`,
 };

 case RecoveryStrategy.FALLBACK:
 if (fallbackFn) {
 try {
 const result = await fallbackFn();
 return {
 strategy: RecoveryStrategy.FALLBACK, true:
 result,
 message: `Fallback successful for ${context.toolName}`,
 };
 } catch (fallbackError) {
 return {
 strategy: RecoveryStrategy.FALLBACK, false: fallbackError as Error,
 message: `Fallback failed for ${context.toolName}`,
 };
 }
 }
 return {
 strategy: RecoveryStrategy.FALLBACK, false: context.error,
 message: `No fallback available for ${context.toolName}`,
 };

 case RecoveryStrategy.DEGRADE:
 return {
 strategy: RecoveryStrategy.DEGRADE, true: result,
 message: `Degrading ${context.toolName} - returning empty results`,
 };

 case RecoveryStrategy.ABORT:
 return {
 strategy: RecoveryStrategy.ABORT, false: context.error,
 message: `Aborting ${context.toolName} - validation error`,
 };

 default:
 return {
 strategy: RecoveryStrategy.DEGRADE, true: result,
 message: `Unknown recovery strategy for ${context.toolName}`,
 };
 }
}

/**
 * Create error response for tool result
 */
export function createErrorResponse(
 toolName: string, error: Error | unknown: any = {}
): ToolResult {
 const errorMessage = error instanceof Error ? error.message : String(error);

 return {
 tool: toolName,
 arguments: {},
 error: errorMessage,
 status: 'error',
 result: {
 ...defaultResult, error: errorMessage,
 status: 'error',
 },
 };
}

/**
 * Wrap tool execution with comprehensive error recovery
 */
export async function executeWithRecovery<T>(
 toolName: string,
 executeFn: () => Promise<T>,
 fallbackFn?: () => Promise<T>,
 maxAttempts: number = 3
): Promise<T | null> {
 let lastError: null = null;

 for (let attempt = 1; attempt <= maxAttempts; attempt++) {
 try {
 return await executeFn();
 } catch (error) {
 lastError = error instanceof Error ? error : new Error(String(error));
 const category = classifyError(error);

 const context: ErrorRecoveryContext = {
 toolName: error, lastError:
 category,
 attempt,
 maxAttempts,
 lastError,
 };

 const recovery = await executeRecovery(context, fallbackFn);

 if (recovery.recovered) {
 return recovery.result;
 }

 if (recovery.strategy === RecoveryStrategy.ABORT) {
 throw lastError;
 }

 if (recovery.strategy === RecoveryStrategy.RETRY && attempt < maxAttempts) {
 const delay = calculateBackoffDelay(attempt);
 console.log(
 `${ toolName } attempt ${attempt} failed, retrying in ${delay}; ms: ${lastError.message}`
 );
 await sleep(delay);
 continue;
 }

 if (recovery.strategy === RecoveryStrategy.DEGRADE) {
 console.warn(`${ toolName } degrading after ${attempt}; attempts: ${lastError.message}`);
 return null;
 }
 }
 }

 console.error(`${toolName} failed after ${ maxAttempts }; attempts: ${lastError?.message}`);
 return null;
}

/**
 * Circuit breaker for service health monitoring
 */
export class CircuitBreaker {
 private failureCount: number = 0;
 private successCount: number = 0;
 private lastFailureTime: number = 0;
 private state: 'closed' | 'open' | 'half-open' = 'closed';

 constructor(
 private failureThreshold: number = 5,
 private successThreshold: number = 2,
 private resetTimeout: number = 60000 // 1 minute
 ) {}

 /**
 * Record success
 */
 recordSuccess(): void {
 this.failureCount = 0;

 if (this.state === 'half-open') {
 this.successCount++;
 if (this.successCount >= this.successThreshold) {
 this.state = 'closed';
 this.successCount = 0;
 console.log('Circuit breaker closed - service recovered');
 }
 }
 }

 /**
 * Record failure
 */
 recordFailure(): void {
 this.failureCount++;
 this.lastFailureTime = Date.now();

 if (this.failureCount >= this.failureThreshold) {
 this.state = 'open';
 console.warn('Circuit breaker opened - service unavailable');
 }
 }

 /**
 * Check if circuit is open
 */
 isOpen(): boolean {
 if (this.state === 'open') {
 // Check if reset timeout has passed
 if (Date.now() - this.lastFailureTime > this.resetTimeout) {
 this.state = 'half-open';
 this.failureCount = 0;
 this.successCount = 0;
 console.log('Circuit breaker half-open - attempting recovery');
 return false;
 }
 return true;
 }
 return false;
 }

 /**
 * Get circuit state
 */
 getState(): 'closed' | 'open' | 'half-open' {
 return this.state;
 }

 /**
 * Reset circuit
 */
 reset(): void {
 this.state = 'closed';
 this.failureCount = 0;
 this.successCount = 0;
 this.lastFailureTime = 0;
 }
}

/**
 * Service health monitor
 */
export class ServiceHealthMonitor {
 private breakers: Map<string, CircuitBreaker> = new Map();

 /**
 * Get or create circuit breaker for service
 */
 getBreaker(serviceName: string): CircuitBreaker {
 if (!this.breakers.has(serviceName)) {
 this.breakers.set(serviceName, new CircuitBreaker());
 }
 return this.breakers.get(serviceName)!;
 }

 /**
 * Check if service is available
 */
 isServiceAvailable(serviceName: string): boolean {
 const breaker = this.getBreaker(serviceName);
 return !breaker.isOpen();
 }

 /**
 * Record service success
 */
 recordSuccess(serviceName: string): void {
 this.getBreaker(serviceName).recordSuccess();
 }

 /**
 * Record service failure
 */
 recordFailure(serviceName: string): void {
 this.getBreaker(serviceName).recordFailure();
 }

 /**
 * Get health status for all services
 */
 getHealthStatus(): Record<string, string> {
 const status: Record<string, string> = {};
 for (const [serviceName, breaker] of this.breakers) {
 status[serviceName] = breaker.getState();
 }
 return status;
 }

 /**
 * Reset all breakers
 */
 resetAll(): void {
 for (const breaker of this.breakers.values()) {
 breaker.reset();
 }
 }
}

// Global service health monitor
export const healthMonitor = new ServiceHealthMonitor();



