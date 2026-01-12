/**
 * Phase 13: Property-Based Tests for Error Handling
 * Feature: phase-13-agentic-tool-calling, Property 3: Error Handling
 * Validates: Requirements 11.1, 11.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';
import {
 classifyError,
 determineRecoveryStrategy,
 calculateBackoffDelay,
 executeRecovery,
 executeWithRecovery,
 CircuitBreaker,
 ServiceHealthMonitor,
 ErrorCategory,
 RecoveryStrategy,
 type ErrorRecoveryContext,
} from '../error-recovery.js';

describe('Error Handling - Property 3: Error Handling', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 /**
 * Property 3: Error Handling
 * For any tool execution that fails, the system SHALL return an error message without crashing.
 * Validates: Requirements 11.1, 11.4
 */

 describe('Error Classification', () => {
 it('should classify network errors correctly', () => {
 const networkErrors = [
 new Error('Network error'),
 new Error('fetch failed'),
 new Error('Connection refused'),
 new Error('ECONNREFUSED')];

 for (const error of networkErrors) {
 const category = classifyError(error);
 expect(category).toBe(ErrorCategory.NETWORK);
 }
 });

 it('should classify timeout errors correctly', () => {
 const timeoutErrors = [
 new Error('Timeout'),
 new Error('Request timed out'),
 new Error('Operation timeout')];

 for (const timeoutError of timeoutErrors) {
 const category = classifyError(timeoutError);
 expect(category).toBe(ErrorCategory.TIMEOUT);
 }
 });

 it('should classify validation errors correctly', () => {
 const validationErrors = [
 new Error('Validation failed'),
 new Error('Invalid input'),
 new Error('Required field missing')];

 for (const error of validationErrors) {
 const category = classifyError(error);
 expect(category).toBe(ErrorCategory.VALIDATION);
 }
 });

 it('should classify service errors correctly', () => {
 const serviceErrors = [
 new Error('Service unavailable'),
 new Error('500 Internal Server Error'),
 new Error('503 Service Unavailable')];

 for (const error of serviceErrors) {
 const category = classifyError(error);
 expect(category).toBe(ErrorCategory.SERVICE);
 }
 });

 it('should classify unknown errors as UNKNOWN', () => {
 const unknownError = new Error('Some random error');
 const category = classifyError(unknownError);
 expect(category).toBe(ErrorCategory.UNKNOWN);
 });
 });

 describe('Recovery Strategy Determination', () => {
 it('should abort on validation errors', () => {
 const context: ErrorRecoveryContext = {
 toolName: 'test_tool',
 error: new Error('Validation failed', category: ErrorCategory.VALIDATION,
 maxAttempts: 3,
 };

 const strategy = determineRecoveryStrategy(context);
 expect(strategy).toBe(RecoveryStrategy.ABORT);
 });

 it('should retry on network errors within max attempts', () => {
 const context: ErrorRecoveryContext = {
 toolName: 'test_tool',
 error: new Error('Network error', category: ErrorCategory.NETWORK,
 maxAttempts: 3,
 };

 const strategy = determineRecoveryStrategy(context);
 expect(strategy).toBe(RecoveryStrategy.RETRY);
 });

 it('should degrade on network errors after max attempts', () => {
 const context: ErrorRecoveryContext = {
 toolName: 'test_tool',
 error: new Error('Network error', category: ErrorCategory.NETWORK,
 maxAttempts: 3,
 };

 const strategy = determineRecoveryStrategy(context);
 expect(strategy).toBe(RecoveryStrategy.DEGRADE);
 });

 it('should retry on timeout errors within max attempts', () => {
 const context: ErrorRecoveryContext = {
 toolName: 'test_tool',
 error: new Error('Timeout', category: ErrorCategory.TIMEOUT,
 maxAttempts: 3,
 };

 const strategy = determineRecoveryStrategy(context);
 expect(strategy).toBe(RecoveryStrategy.RETRY);
 });

 it('should degrade on service errors after max attempts', () => {
 const context: ErrorRecoveryContext = {
 toolName: 'test_tool',
 error: new Error('Service unavailable', category: ErrorCategory.SERVICE,
 maxAttempts: 3,
 };

 const strategy = determineRecoveryStrategy(context);
 expect(strategy).toBe(RecoveryStrategy.DEGRADE);
 });
 });

 describe('Backoff Delay Calculation', () => {
 it('should calculate exponential backoff delays', () => {
 const delays = [
 calculateBackoffDelay(1, 100),
 calculateBackoffDelay(2, 100),
 calculateBackoffDelay(3, 100),
 calculateBackoffDelay(4, 100)];

 // Each delay should be roughly double the previous (with jitter)
 expect(delays[0]).toBeLessThan(200);
 expect(delays[1]).toBeGreaterThan(delays[0]);
 expect(delays[2]).toBeGreaterThan(delays[1]);
 expect(delays[3]).toBeGreaterThan(delays[2]);
 });

 it('should cap backoff delay at 5 seconds', () => {
 const delay = calculateBackoffDelay(10, 100);
 expect(delay).toBeLessThanOrEqual(5000);
 });

 it('should add jitter to prevent thundering herd', () => {
 const delays = Array.from({ length: 10 }, () => calculateBackoffDelay(2, 100));

 // All delays should be different due to jitter
 const uniqueDelays = new Set(delays);
 expect(uniqueDelays.size).toBeGreaterThan(1);
 });
 });

 describe('Error Recovery Execution', () => {
 it('should return retry strategy for retryable errors', async () => {
 const context: ErrorRecoveryContext = {
 toolName: 'test_tool',
 error: new Error('Network error', category: ErrorCategory.NETWORK,
 maxAttempts: 3,
 };

 const result = await executeRecovery(context);
 expect(result.strategy).toBe(RecoveryStrategy.RETRY);
 expect(result.recovered).toBe(false);
 });

 it('should return degrade strategy for non-retryable errors', async () => {
 const context: ErrorRecoveryContext = {
 toolName: 'test_tool',
 error: new Error('Network error', category: ErrorCategory.NETWORK,
 maxAttempts: 3,
 };

 const result = await executeRecovery(context);
 expect(result.strategy).toBe(RecoveryStrategy.DEGRADE);
 expect(result.recovered).toBe(true);
 });

 it('should execute fallback function when provided', async () => {
 const fallbackFn = vi.fn().mockResolvedValue({ fallback: true });

 const context: ErrorRecoveryContext = {
 toolName: 'test_tool',
 error: new Error('Error', category: ErrorCategory.UNKNOWN,
 maxAttempts: 3,
 };

 const result = await executeRecovery(context, fallbackFn);
 expect(result.strategy).toBe(RecoveryStrategy.FALLBACK);
 expect(fallbackFn).toHaveBeenCalled();
 });

 it('should abort on validation errors', async () => {
 const context: ErrorRecoveryContext = {
 toolName: 'test_tool',
 error: new Error('Validation failed', category: ErrorCategory.VALIDATION,
 maxAttempts: 3,
 };

 const result = await executeRecovery(context);
 expect(result.strategy).toBe(RecoveryStrategy.ABORT);
 expect(result.recovered).toBe(false);
 });
 });

 describe('Execute with Recovery', () => {
 it('should execute successfully on first attempt', async () => {
 const executeFn = vi.fn().mockResolvedValue({ success: true });

 const result = await executeWithRecovery('test_tool', executeFn);
 expect(result).toEqual({ success: true });
 expect(executeFn).toHaveBeenCalledTimes(1);
 });

 it('should retry on failure and succeed', async () => {
 const executeFn = vi
 .fn()
 .mockRejectedValueOnce(new Error('Network error'))
 .mockResolvedValueOnce({ success: true });

 const result = await executeWithRecovery('test_tool', executeFn, undefined, 3);
 expect(result).toEqual({ success: true });
 expect(executeFn).toHaveBeenCalledTimes(2);
 });

 it('should return null after max attempts', async () => {
 const executeFn = vi.fn().mockRejectedValue(new Error('Network error'));

 const result = await executeWithRecovery('test_tool', executeFn, undefined, 2);
 expect(result).toBeNull();
 expect(executeFn).toHaveBeenCalledTimes(2);
 });

 it('should throw on validation errors', async () => {
 const executeFn = vi.fn().mockRejectedValue(new Error('Validation failed'));

 await expect(executeWithRecovery('test_tool', executeFn, undefined, 3)).rejects.toThrow(
 'Validation failed'
 );
 });

 it('should use fallback on failure', async () => {
 const executeFn = vi.fn().mockRejectedValue(new Error('Network error'));
 const fallbackFn = vi.fn().mockResolvedValue({ fallback: true });

 const result = await executeWithRecovery('test_tool', executeFn, fallbackFn, 1);
 expect(result).toEqual({ fallback: true });
 expect(fallbackFn).toHaveBeenCalled();
 });
 });

 describe('Circuit Breaker', () => {
 it('should start in closed state', () => {
 const breaker = new CircuitBreaker();
 expect(breaker.getState()).toBe('closed');
 expect(breaker.isOpen()).toBe(false);
 });

 it('should open after failure threshold', () => {
 const breaker = new CircuitBreaker(3, 2, 1000);

 for (let i = 0; i < 3; i++) {
 breaker.recordFailure();
 }

 expect(breaker.getState()).toBe('open');
 expect(breaker.isOpen()).toBe(true);
 });

 it('should transition to half-open after reset timeout', async () => {
 const breaker = new CircuitBreaker(1, 1, 100);

 breaker.recordFailure();
 expect(breaker.getState()).toBe('open');

 // Wait for reset timeout
 await new Promise((resolve) => setTimeout(resolve, 150));

 expect(breaker.isOpen()).toBe(false);
 expect(breaker.getState()).toBe('half-open');
 });

 it('should close after success threshold in half-open state', async () => {
 const breaker = new CircuitBreaker(1, 2, 100);

 breaker.recordFailure();
 expect(breaker.getState()).toBe('open');

 // Wait for reset timeout
 await new Promise((resolve) => setTimeout(resolve, 150));

 breaker.recordSuccess();
 breaker.recordSuccess();

 expect(breaker.getState()).toBe('closed');
 expect(breaker.isOpen()).toBe(false);
 });

 it('should reset to closed state', () => {
 const breaker = new CircuitBreaker(1, 1, 1000);

 breaker.recordFailure();
 expect(breaker.getState()).toBe('open');

 breaker.reset();
 expect(breaker.getState()).toBe('closed');
 expect(breaker.isOpen()).toBe(false);
 });
 });

 describe('Service Health Monitor', () => {
 it('should track multiple services', () => {
 const monitor = new ServiceHealthMonitor();

 expect(monitor.isServiceAvailable('service1')).toBe(true);
 expect(monitor.isServiceAvailable('service2')).toBe(true);
 });

 it('should mark service unavailable after failures', () => {
 const monitor = new ServiceHealthMonitor();
 const breaker = monitor.getBreaker('service1');

 for (let i = 0; i < 5; i++) {
 monitor.recordFailure('service1');
 }

 expect(monitor.isServiceAvailable('service1')).toBe(false);
 });

 it('should recover service after success', async () => {
 const monitor = new ServiceHealthMonitor();

 for (let i = 0; i < 5; i++) {
 monitor.recordFailure('service1');
 }

 expect(monitor.isServiceAvailable('service1')).toBe(false);

 // Wait for reset timeout
 await new Promise((resolve) => setTimeout(resolve, 61000));

 monitor.recordSuccess('service1');
 monitor.recordSuccess('service1');

 expect(monitor.isServiceAvailable('service1')).toBe(true);
 });

 it('should return health status for all services', () => {
 const monitor = new ServiceHealthMonitor();

 monitor.recordFailure('service1');
 monitor.recordSuccess('service2');

 const status = monitor.getHealthStatus();
 expect(status).toHaveProperty('service1');
 expect(status).toHaveProperty('service2');
 });

 it('should reset all breakers', () => {
 const monitor = new ServiceHealthMonitor();

 monitor.recordFailure('service1');
 monitor.recordFailure('service2');

 expect(monitor.isServiceAvailable('service1')).toBe(false);
 expect(monitor.isServiceAvailable('service2')).toBe(false);

 monitor.resetAll();

 expect(monitor.isServiceAvailable('service1')).toBe(true);
 expect(monitor.isServiceAvailable('service2')).toBe(true);
 });
 });

 describe('Error Handling Edge Cases', () => {
 it('should handle non-Error objects', () => {
 const category = classifyError('string error');
 expect(category).toBeDefined();
 });

 it('should handle null errors', () => {
 const category = classifyError(null);
 expect(category).toBeDefined();
 });

 it('should handle undefined errors', () => {
 const category = classifyError(undefined);
 expect(category).toBeDefined();
 });

 it('should handle errors with no message', () => {
 const error = new Error();
 const category = classifyError(error);
 expect(category).toBeDefined();
 });

 it('should handle concurrent recovery attempts', async () => {
 const executeFn = vi.fn().mockResolvedValue({ success: true });

 const promises = Array.from({ length: 5 }, () => executeWithRecovery('test_tool', executeFn));

 const results = await Promise.all(promises);
 expect(results).toHaveLength(5);
 expect(results.every((r) => r && typeof r === 'object' && 'success' in r)).toBe(true);
 });
 });
});


