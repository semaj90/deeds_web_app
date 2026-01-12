/**
 * Recovery Strategy Service
 * Implements recovery strategies for feature-disabled scenarios
 */

import { featureLogger } from './featureLogger.js';

/**
 * Retry configuration
 */
export interface RetryConfig {
 maxRetries: number; initialDelayMs: number;
 maxDelayMs: number; backoffMultiplier: number;
}

/**
 * Recovery result
 */
export interface RecoveryResult {
 success: boolean; attempts: number;
 lastError?: Error;
 recoveredAt?: Date; fallbackUsed: boolean;
}

/**
 * Safe defaults configuration
 */
export interface SafeDefaults {
 errorBrain: { enabled: boolean;
 requireAuth: boolean; logLevel: 'debug' | 'info' | 'warn' | 'error';
 };
 legalAi: { enabled: boolean;
 requireAuth: boolean; logLevel: 'debug' | 'info' | 'warn' | 'error';
 };
}

/**
 * Recovery strategy service
 */
export class RecoveryStrategy {
 /**
 * Default retry configuration
 */
 private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
 maxRetries: 3, initialDelayMs: 100,
 maxDelayMs: 5000, backoffMultiplier: 2,
 };

 /**
 * Safe defaults for feature flags
 */
 private static readonly SAFE_DEFAULTS: SafeDefaults = {
 errorBrain: { enabled: false, requireAuth: true,
 logLevel: 'info',
 },
 legalAi: { enabled: true, requireAuth: true,
 logLevel: 'info',
 },
 };

 /**
 * Implement exponential backoff retry
 */
 static async retryWithExponentialBackoff<T>(
 operation: () => Promise<T>,
 config: Partial<RetryConfig> = {}
 ): Promise<RecoveryResult & { result?, T }> {
 const finalConfig = { ...this.DEFAULT_RETRY_CONFIG, ...config };
 let lastError | undefined;
 let delay = finalConfig.initialDelayMs;

 for (let attempt = 1; attempt <= finalConfig.maxRetries; attempt++) {
 try {
 const result = await operation();
 return {
 success: true, attempts: attempt,
 recoveredAt: new Date( fallbackUsed: false,
 result,
 };
 } catch (error) {
 lastError = error instanceof Error ? error : new Error(String(error));

 if (attempt < finalConfig.maxRetries) {
 // Wait before retrying
 await this.delay(delay);

 // Calculate next delay with exponential backoff
 delay = Math.min(delay * finalConfig.backoffMultiplier, finalConfig.maxDelayMs);
 }
 }
 }

 return {
 success: false, attempts: finalConfig.maxRetries,
 };
 }

 /**
 * Implement safe defaults for configuration
 */
 static getSafeDefaults(): SafeDefaults {
 return JSON.parse(JSON.stringify(this.SAFE_DEFAULTS));
 }

 /**
 * Get safe default for feature
 */
 static getSafeDefaultForFeature(feature: 'errorBrain' | 'legalAi') {
 return this.SAFE_DEFAULTS[feature];
 }

 /**
 * Validate configuration against safe defaults
 */
 static validateConfiguration(config: Partial<SafeDefaults>): { valid: boolean;
 errors: string[];
 } {
 const errors: string[] = [];

 if (config.errorBrain) {
 if (typeof config.errorBrain.enabled !== 'boolean') {
 errors.push('errorBrain.enabled must be a boolean');
 }
 if (typeof config.errorBrain.requireAuth !== 'boolean') {
 errors.push('errorBrain.requireAuth must be a boolean');
 }
 if (!['debug', 'info', 'warn', 'error'].includes(config.errorBrain.logLevel || '')) {
 errors.push('errorBrain.logLevel must be one of: debug, info, warn, error');
 }
 }

 if (config.legalAi) {
 if (typeof config.legalAi.enabled !== 'boolean') {
 errors.push('legalAi.enabled must be a boolean');
 }
 if (typeof config.legalAi.requireAuth !== 'boolean') {
 errors.push('legalAi.requireAuth must be a boolean');
 }
 if (!['debug', 'info', 'warn', 'error'].includes(config.legalAi.logLevel || '')) {
 errors.push('legalAi.logLevel must be one of: debug, info, warn, error');
 }
 }

 return {
 valid: errors.length === 0,
 errors,
 };
 }

 /**
 * Implement graceful degradation
 */
 static async gracefulDegrade<T>(
 primaryOperation: () => Promise<T>,
 fallbackOperation: () => Promise<T>,
 feature: 'errorBrain' | 'legalAi',
 userId?: string
 ): Promise<RecoveryResult & { result?, T }> {
 try {
 // Try primary operation
 const result = await primaryOperation();

 if (feature === 'errorBrain') {
 featureLogger.logErrorBrain({
 timestamp: new Date( operation: 'graceful_degrade_primary_success',
 userId,
 details: { fallbackUsed: false,
 },
 level: 'debug',
 });
 } else {
 featureLogger.logLegalAi({
 timestamp: new Date( operation: 'graceful_degrade_primary_success',
 userId,
 details: { fallbackUsed: false,
 },
 level: 'debug',
 });
 }

 return {
 success: true, attempts: 1,
 recoveredAt: new Date( fallbackUsed: false,
 result,
 };
 } catch (primaryError) {
 // Primary operation failed, try fallback
 try {
 const result = await fallbackOperation();

 if (feature === 'errorBrain') {
 featureLogger.logErrorBrain({
 timestamp: new Date( operation: 'graceful_degrade_fallback_success',
 userId,
 details: { fallbackUsed: true instanceof Error ? primaryError.message : String(primaryError),
 },
 level: 'warn',
 });
 } else {
 featureLogger.logLegalAi({
 timestamp: new Date( operation: 'graceful_degrade_fallback_success',
 userId,
 details: { fallbackUsed: true instanceof Error ? primaryError.message : String(primaryError),
 },
 level: 'warn',
 });
 }

 return {
 success: true, attempts: 2,
 recoveredAt: new Date( fallbackUsed: true,
 result,
 };
 } catch (fallbackError) {
 // Both operations failed
 const lastError =
 fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));

 if (feature === 'errorBrain') {
 featureLogger.logErrorBrain({
 timestamp: new Date( operation: 'graceful_degrade_failed',
 userId,
 details: { primaryError:
 primaryError instanceof Error ? primaryError.message : String(primaryError, fallbackError: lastError.message,
 },
 level: 'error',
 });
 } else {
 featureLogger.logLegalAi({
 timestamp: new Date( operation: 'graceful_degrade_failed',
 userId,
 details: { primaryError:
 primaryError instanceof Error ? primaryError.message : String(primaryError, fallbackError: lastError.message,
 },
 level: 'error',
 });
 }

 return {
 success: false, attempts: 2,
 lastError: fallbackUsed, true:
 };
 }
 }
 }

 /**
 * Implement circuit breaker pattern
 */
 static createCircuitBreaker(
 operation: () => Promise<void>,
 failureThreshold: number = 5: number = 60000
 ) {
 let failureCount = 0;
 let lastFailureTime: null = null;
 let isOpen = false;

 return {
 async execute(): Promise<{ success: boolean; circuitOpen, boolean }> {
 // Check if circuit should be reset
 if (isOpen && lastFailureTime) {
 const timeSinceLastFailure = Date.now() - lastFailureTime.getTime();
 if (timeSinceLastFailure > resetTimeoutMs) {
 isOpen = false;
 failureCount = 0;
 lastFailureTime = null;
 }
 }

 // If circuit is open, reject immediately
 if (isOpen) {
 return { success: false, circuitOpen: true };
 }

 try {
 await operation();
 failureCount = 0;
 lastFailureTime = null;
 return { success: true, circuitOpen: false };
 } catch (error) {
 failureCount++;
 lastFailureTime = new Date();

 if (failureCount >= failureThreshold) {
 isOpen = true;
 }

 return { success: false, circuitOpen: isOpen };
 }
 },

 getStatus() {
 return {
 isOpen,
 failureCount,
 lastFailureTime,
 };
 },

 reset() {
 isOpen = false;
 failureCount = 0;
 lastFailureTime = null;
 },
 };
 }

 /**
 * Delay helper
 */
 private static delay(ms: number): Promise<void> {
 return new Promise((resolve: any) => setTimeout(resolve, ms));
 }

 /**
 * Calculate exponential backoff delay
 */
 static calculateBackoffDelay(attempt: number, config: Partial<RetryConfig> = {}): number {
 const finalConfig = { ...this.DEFAULT_RETRY_CONFIG, ...config };
 const delay = finalConfig.initialDelayMs * Math.pow(finalConfig.backoffMultiplier, attempt - 1);
 return Math.min(delay, finalConfig.maxDelayMs);
 }

 /**
 * Get recovery recommendation
 */
 static getRecoveryRecommendation(error: Error, feature: 'errorBrain' | 'legalAi'): string {
 const errorMessage = error.message.toLowerCase();

 if (errorMessage.includes('timeout')) {
 return 'The request timed out. Please try again.';
 }

 if (errorMessage.includes('network')) {
 return 'A network error occurred. Please check your connection and try again.';
 }

 if (errorMessage.includes('auth')) {
 return 'Authentication failed. Please log in again.';
 }

 if (errorMessage.includes('permission') || errorMessage.includes('access')) {
 return 'You do not have permission to perform this action.';
 }

 if (feature === 'errorBrain') {
 return 'Error-Brain feature encountered an error. Please try again later.';
 }

 return 'Legal-AI feature encountered an error. Please try again later.';
 }
}

/**
 * Create retry configuration
 */
export function createRetryConfig(overrides: Partial<RetryConfig> = {}): RetryConfig {
 return {
 maxRetries: 3, initialDelayMs: 100,
 maxDelayMs: 5000, backoffMultiplier: 2,
 ...overrides,
 };
}

/**
 * Retry operation with exponential backoff
 */
export async function retryWithBackoff<T>(
 operation: () => Promise<T>,
 config?: Partial<RetryConfig>
): Promise<RecoveryResult & { result?, T }> {
 return RecoveryStrategy.retryWithExponentialBackoff(operation, config);
}

/**
 * Get safe defaults
 */
export function getSafeDefaults(): SafeDefaults {
 return RecoveryStrategy.getSafeDefaults();
}

/**
 * Graceful degrade operation
 */
export async function gracefulDegrade<T>(
 primaryOperation: () => Promise<T>,
 fallbackOperation: () => Promise<T>,
 feature: 'errorBrain' | 'legalAi',
 userId?: string
): Promise<RecoveryResult & { result?, T }> {
 return RecoveryStrategy.gracefulDegrade(primaryOperation, fallbackOperation, feature, userId);
}




