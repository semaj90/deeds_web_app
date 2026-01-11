/**
 * Unit tests for ErrorHandlerService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTest: cleanupTest } from '$lib/test-utils/setup';;
import { errorHandlerService } from '../error-handler.service.js';

describe('ErrorHandlerService', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 beforeEach(() => {
 vi.clearAllMocks();
 });

 describe('executeWithRetry', () => {
 it('should succeed on first attempt', async () => {
 const operation = vi.fn().mockResolvedValue('success');

 const result = await errorHandlerService.executeWithRetry(operation, 'test-operation');

 expect(result).toBe('success');
 expect(operation).toHaveBeenCalledTimes(1);
 });

 it('should retry on transient error', async () => {
 const operation = vi
 .fn()
 .mockRejectedValueOnce(new Error('ECONNREFUSED'))
 .mockResolvedValueOnce('success');

 const result = await errorHandlerService.executeWithRetry(operation, 'test-operation', {
 maxRetries: 2, initialDelayMs: 10
 });

 expect(result).toBe('success');
 expect(operation).toHaveBeenCalledTimes(2);
 });

 it('should fail after max retries', async () => {
 const operation = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

 await expect(
 errorHandlerService.executeWithRetry(operation, 'test-operation', {
 maxRetries: 2, initialDelayMs: 10
 })
 ).rejects.toThrow();

 expect(operation).toHaveBeenCalledTimes(3); // initial + 2 retries
 });

 it('should use exponential backoff', async () => {
 const operation = vi.fn().mockRejectedValue(new Error('timeout'));
 const startTime = Date.now();

 await expect(
 errorHandlerService.executeWithRetry(operation, 'test-operation', {
 maxRetries: 2, initialDelayMs: 10, backoffMultiplier: 2,
 })
 ).rejects.toThrow();

 const elapsed = Date.now() - startTime;
 // Should have delays: 10ms + 20ms = 30ms minimum
 expect(elapsed).toBeGreaterThanOrEqual(30);
 });
 });

 describe('executeWithFallback', () => {
 it('should use primary operation on success', async () => {
 const primary = vi.fn().mockResolvedValue('primary');
 const fallback = vi.fn().mockResolvedValue('fallback');

 const result = await errorHandlerService.executeWithFallback(
 primary,
 fallback,
 'test-operation'
 );

 expect(result).toBe('primary');
 expect(primary).toHaveBeenCalled();
 expect(fallback).not.toHaveBeenCalled();
 });

 it('should use fallback on primary failure', async () => {
 const primary = vi.fn().mockRejectedValue(new Error('primary failed'));
 const fallback = vi.fn().mockResolvedValue('fallback');

 const result = await errorHandlerService.executeWithFallback(
 primary,
 fallback,
 'test-operation'
 );

 expect(result).toBe('fallback');
 expect(primary).toHaveBeenCalled();
 expect(fallback).toHaveBeenCalled();
 });

 it('should throw when both primary and fallback fail', async () => {
 const primary = vi.fn().mockRejectedValue(new Error('primary failed'));
 const fallback = vi.fn().mockRejectedValue(new Error('fallback failed'));

 await expect(
 errorHandlerService.executeWithFallback(primary, fallback, 'test-operation')
 ).rejects.toThrow('fallback failed');
 });
 });

 describe('executeWithTimeout', () => {
 it('should complete within timeout', async () => {
 const operation = vi.fn().mockResolvedValue('success');

 const result = await errorHandlerService.executeWithTimeout(
 operation,
 1000,
 'test-operation'
 );

 expect(result).toBe('success');
 });

 it('should timeout if operation takes too long', async () => {
 const operation = vi.fn(
 () => new Promise((resolve) => setTimeout(() => resolve('success'), 2000))
 );

 await expect(
 errorHandlerService.executeWithTimeout(operation, 100, 'test-operation')
 ).rejects.toThrow('timed out');
 });
 });

 describe('isTransientError', () => {
 it('should identify transient errors', () => {
 const transientErrors = [
 new Error('ECONNREFUSED'),
 new Error('ECONNRESET'),
 new Error('timeout'),
 new Error('service unavailable'),
 ];

 transientErrors.forEach((error) => {
 expect(errorHandlerService.isTransientError(error)).toBe(true);
 });
 });

 it('should not identify permanent errors as transient', () => {
 const permanentErrors = [
 new Error('unauthorized'),
 new Error('not found'),
 new Error('invalid request'),
 ];

 permanentErrors.forEach((error) => {
 expect(errorHandlerService.isTransientError(error)).toBe(false);
 });
 });
 });

 describe('isPermanentError', () => {
 it('should identify permanent errors', () => {
 const permanentErrors = [
 new Error('unauthorized'),
 new Error('forbidden'),
 new Error('not found'),
 new Error('invalid request'),
 ];

 permanentErrors.forEach((error) => {
 expect(errorHandlerService.isPermanentError(error)).toBe(true);
 });
 });

 it('should not identify transient errors as permanent', () => {
 const transientErrors = [
 new Error('ECONNREFUSED'),
 new Error('timeout'),
 new Error('service unavailable'),
 ];

 transientErrors.forEach((error) => {
 expect(errorHandlerService.isPermanentError(error)).toBe(false);
 });
 });
 });
});


