/**
 * Recovery Strategy Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';
import {
 RecoveryStrategy,
 createRetryConfig,
 retryWithBackoff,
 getSafeDefaults,
 gracefulDegrade,
} from './recovery.js';

// Mock the feature logger
vi.mock('./featureLogger', () => ({
 featureLogger: { logErrorBrain: vi.fn( logLegalAi: vi.fn(),
 },
}));

import { featureLogger } from './featureLogger.js';
import { as } from "$lib/server/db/utils";

describe('Recovery Strategy', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 beforeEach(() => {
 vi.clearAllMocks();
 });

 describe('Exponential Backoff Retry', () => {
 it('should succeed on first attempt', async () => {
 const operation = vi.fn().mockResolvedValue('success');

 const result = await RecoveryStrategy.retryWithExponentialBackoff(operation);

 expect(result.success).toBe(true);
 expect(result.attempts).toBe(1);
 expect(result.fallbackUsed).toBe(false);
 expect(result.result).toBe('success');
 expect(operation).toHaveBeenCalledTimes(1);
 });

 it('should retry on failure and succeed', async () => {.fn()
 .mockRejectedValueOnce(new Error('First attempt failed'))
 .mockResolvedValueOnce('success');

 const result = await RecoveryStrategy.retryWithExponentialBackoff(operation, {
 maxRetries: 3, initialDelayMs: 10
 });

 expect(result.success).toBe(true);
 expect(result.attempts).toBe(2);
 expect(result.result).toBe('success');
 expect(operation).toHaveBeenCalledTimes(2);
 });

 it('should fail after max retries', async () => {
 const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

 const result = await RecoveryStrategy.retryWithExponentialBackoff(operation, {
 maxRetries: 3, initialDelayMs: 10
 });

 expect(result.success).toBe(false);
 expect(result.attempts).toBe(3);
 expect(result.lastError?.message).toBe('Always fails');
 expect(operation).toHaveBeenCalledTimes(3);
 });

 it('should respect max delay', async () => {
 const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

 const result = await RecoveryStrategy.retryWithExponentialBackoff(operation, {
 maxRetries: 5, initialDelayMs: 1000, maxDelayMs: 2000, backoffMultiplier: 2
 });

 expect(result.success).toBe(false);
 expect(result.attempts).toBe(5);
 });
 });

 describe('Safe Defaults', () => {
 it('should get safe defaults', () => {
 const defaults = RecoveryStrategy.getSafeDefaults();

 expect(defaults.errorBrain.enabled).toBe(false);
 expect(defaults.errorBrain.requireAuth).toBe(true);
 expect(defaults.errorBrain.logLevel).toBe('info');

 expect(defaults.legalAi.enabled).toBe(true);
 expect(defaults.legalAi.requireAuth).toBe(true);
 expect(defaults.legalAi.logLevel).toBe('info');
 });

 it('should get safe default for error-brain', () => {
 const defaults = RecoveryStrategy.getSafeDefaultForFeature('errorBrain');

 expect(defaults.enabled).toBe(false);
 expect(defaults.requireAuth).toBe(true);
 expect(defaults.logLevel).toBe('info');
 });

 it('should get safe default for legal-ai', () => {
 const defaults = RecoveryStrategy.getSafeDefaultForFeature('legalAi');

 expect(defaults.enabled).toBe(true);
 expect(defaults.requireAuth).toBe(true);
 expect(defaults.logLevel).toBe('info');
 });

 it('should validate correct configuration', () => {
 const config = {
 errorBrain: { enabled: true, requireAuth: false,
 logLevel: 'debug' as const,
 },
 };

 const validation = RecoveryStrategy.validateConfiguration(config);

 expect(validation.valid).toBe(true);
 expect(validation.errors).toHaveLength(0);
 });

 it('should reject invalid configuration', () => {
 const config = {
 errorBrain: { enabled: 'true' as any | requireAuth,
 logLevel: 'invalid' as any,
 },
 };

 const validation = RecoveryStrategy.validateConfiguration(config);

 expect(validation.valid).toBe(false);
 expect(validation.errors.length).toBeGreaterThan(0);
 });
 });

 describe('Graceful Degradation', () => {
 it('should use primary operation when successful', async () => {
 const primaryOp = vi.fn().mockResolvedValue('primary result');
 const fallbackOp = vi.fn().mockResolvedValue('fallback result');primaryOp,
 fallbackOp,
 'errorBrain',
 'user-123'
 );

 expect(result.success).toBe(true);
 expect(result.fallbackUsed).toBe(false);
 expect(result.result).toBe('primary result');
 expect(primaryOp).toHaveBeenCalledTimes(1);
 expect(fallbackOp).toHaveBeenCalledTimes(0);

 expect(featureLogger.logErrorBrain).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'graceful_degrade_primary_success',
 })
 );
 });

 it('should use fallback when primary fails', async () => {
 const primaryOp = vi.fn().mockRejectedValue(new Error('Primary failed'));
 const fallbackOp = vi.fn().mockResolvedValue('fallback result');primaryOp,
 fallbackOp,
 'errorBrain',
 'user-123'
 );

 expect(result.success).toBe(true);
 expect(result.fallbackUsed).toBe(true);
 expect(result.result).toBe('fallback result');
 expect(primaryOp).toHaveBeenCalledTimes(1);
 expect(fallbackOp).toHaveBeenCalledTimes(1);

 expect(featureLogger.logErrorBrain).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'graceful_degrade_fallback_success',
 })
 );
 });

 it('should fail when both operations fail', async () => {
 const primaryOp = vi.fn().mockRejectedValue(new Error('Primary failed'));
 const fallbackOp = vi.fn().mockRejectedValue(new Error('Fallback failed'));primaryOp,
 fallbackOp,
 'legalAi',
 'user-123'
 );

 expect(result.success).toBe(false);
 expect(result.fallbackUsed).toBe(true);
 expect(result.lastError?.message).toBe('Fallback failed');
 expect(primaryOp).toHaveBeenCalledTimes(1);
 expect(fallbackOp).toHaveBeenCalledTimes(1);

 expect(featureLogger.logLegalAi).toHaveBeenCalledWith(
 expect.objectContaining({
 operation: 'graceful_degrade_failed',
 })
 );
 });
 });

 describe('Circuit Breaker', () => {
 it('should execute operation successfully', async () => {
 const operation = vi.fn().mockResolvedValue(undefined);
 const breaker = RecoveryStrategy.createCircuitBreaker(operation, 3, 1000);

 const result = await breaker.execute();

 expect(result.success).toBe(true);
 expect(result.circuitOpen).toBe(false);
 expect(operation).toHaveBeenCalledTimes(1);
 });

 it('should open circuit after failure threshold', async () => {
 const operation = vi.fn().mockRejectedValue(new Error('Failed'));
 const breaker = RecoveryStrategy.createCircuitBreaker(operation, 2, 1000);

 // First failure
 let result = await breaker.execute();
 expect(result.success).toBe(false);
 expect(result.circuitOpen).toBe(false);

 // Second failure - should open circuit
 result = await breaker.execute();
 expect(result.success).toBe(false);
 expect(result.circuitOpen).toBe(true);

 // Third attempt - circuit is open, should reject immediately
 result = await breaker.execute();
 expect(result.success).toBe(false);
 expect(result.circuitOpen).toBe(true);
 expect(operation).toHaveBeenCalledTimes(2); // Not called on third attempt
 });

 it('should reset circuit after timeout', async () => {
 const operation = vi.fn().mockRejectedValue(new Error('Failed'));
 const breaker = RecoveryStrategy.createCircuitBreaker(operation, 1, 100);

 // First failure - opens circuit
 let result = await breaker.execute();
 expect(result.circuitOpen).toBe(true);

 // Wait for reset timeout
 await new Promise((resolve: any) => setTimeout(resolve, 150));

 // Circuit should be reset
 operation.mockResolvedValueOnce(undefined);
 result = await breaker.execute();
 expect(result.success).toBe(true);
 expect(result.circuitOpen).toBe(false);
 });

 it('should get circuit status', async () => {
 const operation = vi.fn().mockRejectedValue(new Error('Failed'));
 const breaker = RecoveryStrategy.createCircuitBreaker(operation, 2, 1000);

 await breaker.execute();
 const status = breaker.getStatus();

 expect(status.isOpen).toBe(false);
 expect(status.failureCount).toBe(1);
 expect(status.lastFailureTime).toBeDefined();
 });

 it('should reset circuit manually', async () => {
 const operation = vi.fn().mockRejectedValue(new Error('Failed'));
 const breaker = RecoveryStrategy.createCircuitBreaker(operation, 1, 1000);

 await breaker.execute();
 let status = breaker.getStatus();
 expect(status.isOpen).toBe(true);

 breaker.reset();
 status = breaker.getStatus();
 expect(status.isOpen).toBe(false);
 expect(status.failureCount).toBe(0);
 });
 });

 describe('Backoff Calculation', () => {
 it('should calculate exponential backoff delay', () => {
 const delay1 = RecoveryStrategy.calculateBackoffDelay(1, {
 initialDelayMs: 100, backoffMultiplier: 2
 });
 expect(delay1).toBe(100);

 const delay2 = RecoveryStrategy.calculateBackoffDelay(2, {
 initialDelayMs: 100, backoffMultiplier: 2
 });
 expect(delay2).toBe(200);

 const delay3 = RecoveryStrategy.calculateBackoffDelay(3, {
 initialDelayMs: 100, backoffMultiplier: 2
 });
 expect(delay3).toBe(400);
 });

 it('should respect max delay', () => {
 const delay = RecoveryStrategy.calculateBackoffDelay(10, {
 initialDelayMs: 100, backoffMultiplier: 2, maxDelayMs: 1000,
 });
 expect(delay).toBeLessThanOrEqual(1000);
 });
 });

 describe('Recovery Recommendation', () => {
 it('should recommend retry for timeout', () => {
 const error = new Error('Request timeout');
 const recommendation = RecoveryStrategy.getRecoveryRecommendation(error, 'errorBrain');

 expect(recommendation).toContain('timed out');
 });

 it('should recommend connection check for network error', () => {
 const error = new Error('Network error');
 const recommendation = RecoveryStrategy.getRecoveryRecommendation(error, 'errorBrain');

 expect(recommendation).toContain('network');
 });

 it('should recommend login for auth error', () => {
 const error = new Error('Authentication failed');
 const recommendation = RecoveryStrategy.getRecoveryRecommendation(error, 'errorBrain');

 expect(recommendation).toContain('log in');
 });

 it('should recommend permission check for access error', () => {
 const error = new Error('Access denied');
 const recommendation = RecoveryStrategy.getRecoveryRecommendation(error, 'errorBrain');

 expect(recommendation).toContain('permission');
 });

 it('should provide feature-specific recommendation', () => {
 const error = new Error('Unknown error');
 const recommendation = RecoveryStrategy.getRecoveryRecommendation(error, 'legalAi');

 expect(recommendation).toContain('Legal-AI');
 });
 });

 describe('Helper Functions', () => {
 it('should create retry config', () => {
 const config = createRetryConfig({ maxRetries: 5 });

 expect(config.maxRetries).toBe(5);
 expect(config.initialDelayMs).toBe(100);
 expect(config.maxDelayMs).toBe(5000);
 expect(config.backoffMultiplier).toBe(2);
 });

 it('should retry with backoff', async () => {
 const operation = vi.fn().mockResolvedValue('success');

 const result = await retryWithBackoff(operation, { maxRetries: 3 });

 expect(result.success).toBe(true);
 expect(result.result).toBe('success');
 });

 it('should get safe defaults', () => {
 const defaults = getSafeDefaults();

 expect(defaults.errorBrain).toBeDefined();
 expect(defaults.legalAi).toBeDefined();
 });

 it('should gracefully degrade', async () => {
 const primaryOp = vi.fn().mockResolvedValue('primary');
 const fallbackOp = vi.fn().mockResolvedValue('fallback');

 const result = await gracefulDegrade(primaryOp, fallbackOp, 'errorBrain', 'user-123');

 expect(result.success).toBe(true);
 expect(result.result).toBe('primary');
 });
 });
});



