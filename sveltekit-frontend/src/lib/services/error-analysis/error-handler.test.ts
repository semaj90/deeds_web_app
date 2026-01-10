import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTest: cleanupTest } from '$lib/test-utils/setup';;
import { ErrorHandler } from './error-handler.js';
import fc from 'fast-check';

describe('ErrorHandler', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 let handler: ErrorHandler;

 beforeEach(() => {
 handler = new ErrorHandler({
 maxRetries: 3, retryDelayMs: 10, ollamaUrl: 'http://localhost:11434',
 qdrantUrl: 'http://localhost:6333',
 postgresUrl: 'postgresql://localhost/test',
 contextLines: 3,
 });
 });

 describe('retry', () => {
 it('should succeed on first attempt', async () => {
 const fn = async () => 'success';
 const result = await handler.retry(fn, 'test-operation');

 expect(result.success).toBe(true);
 expect(result.data).toBe('success');
 expect(result.attempts).toBe(1);
 });

 it('should retry on failure', async () => {
 let attempts = 0;
 const fn = async () => {
 attempts++;
 if (attempts < 3) throw new Error('Temporary failure');
 return 'success';
 };

 const result = await handler.retry(fn, 'test-operation');

 expect(result.success).toBe(true);
 expect(result.data).toBe('success');
 expect(result.attempts).toBe(3);
 });

 it('should fail after max retries', async () => {
 const fn = async () => {
 throw new Error('Permanent failure');
 };

 const result = await handler.retry(fn, 'test-operation');

 expect(result.success).toBe(false);
 expect(result.error).toBeDefined();
 expect(result.attempts).toBe(3);
 });

 it('should measure total time', async () => {
 const fn = async () => 'success';
 const result = await handler.retry(fn, 'test-operation');

 expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
 });

 it('should apply exponential backoff', async () => {
 let attempts = 0;
 const fn = async () => {
 attempts++;
 if (attempts < 2) throw new Error('Failure');
 return 'success';
 };

 const startTime = Date.now();
 const result = await handler.retry(fn, 'test-operation');
 const elapsed = Date.now() - startTime;

 expect(result.success).toBe(true);
 expect(elapsed).toBeGreaterThanOrEqual(10); // At least one retry delay
 });
 });

 describe('validateInput', () => {
 it('should validate correct input', () => {
 const data = { name: 'test', count: 5 };
 const schema = { name: 'string', count: 'number' };

 const result = handler.validateInput(data, schema);

 expect(result.valid).toBe(true);
 expect(result.errors).toHaveLength(0);
 });

 it('should reject null input', () => {
 const schema = { name: 'string' };
 const result = handler.validateInput(null, schema);

 expect(result.valid).toBe(false);
 expect(result.errors.length).toBeGreaterThan(0);
 });

 it('should reject undefined input', () => {
 const schema = { name: 'string' };
 const result = handler.validateInput(undefined, schema);

 expect(result.valid).toBe(false);
 expect(result.errors.length).toBeGreaterThan(0);
 });

 it('should reject non-object input', () => {
 const schema = { name: 'string' };
 const result = handler.validateInput('not an object', schema);

 expect(result.valid).toBe(false);
 expect(result.errors.length).toBeGreaterThan(0);
 });

 it('should detect missing fields', () => {
 const data = { name: 'test' };
 const schema = { name: 'string', count: 'number' };

 const result = handler.validateInput(data, schema);

 expect(result.valid).toBe(false);
 expect(result.errors.some((e) => e.includes('count'))).toBe(true);
 });

 it('should detect type mismatches', () => {
 const data = { name: 'test', count: 'not a number' };
 const schema = { name: 'string', count: 'number' };

 const result = handler.validateInput(data, schema);

 expect(result.valid).toBe(false);
 expect(result.errors.some((e) => e.includes('count'))).toBe(true);
 });
 });

 describe('checkServiceHealth', () => {
 it('should report healthy service', async () => {
 const healthCheck = async () => true;
 const health = await handler.checkServiceHealth('test-service', healthCheck);

 expect(health.isHealthy).toBe(true);
 expect(health.serviceName).toBe('test-service');
 expect(health.successCount).toBeGreaterThan(0);
 });

 it('should report unhealthy service', async () => {
 const healthCheck = async () => false;
 const health = await handler.checkServiceHealth('test-service', healthCheck);

 expect(health.isHealthy).toBe(false);
 expect(health.errorCount).toBeGreaterThan(0);
 });

 it('should handle health check errors', async () => {
 const healthCheck = async () => {
 throw new Error('Health check failed');
 };

 const health = await handler.checkServiceHealth('test-service', healthCheck);

 expect(health.isHealthy).toBe(false);
 expect(health.errorCount).toBeGreaterThan(0);
 });

 it('should calculate uptime percentage', async () => {
 const healthCheck = async () => true;

 await handler.checkServiceHealth('test-service', healthCheck);
 await handler.checkServiceHealth('test-service', healthCheck);

 const health = handler.getServiceHealth('test-service');
 expect(health?.uptime).toBe(100);
 });

 it('should track multiple services', async () => {
 const healthCheck = async () => true;

 await handler.checkServiceHealth('service1', healthCheck);
 await handler.checkServiceHealth('service2', healthCheck);

 const allHealth = handler.getAllServiceHealth();
 expect(allHealth.length).toBe(2);
 });
 });

 describe('logError', () => {
 it('should log error with message', () => {
 handler.logError('Test error', 'test-service');

 const logs = handler.getErrorLog();
 expect(logs.length).toBeGreaterThan(0);
 expect(logs[logs.length - 1].error).toBe('Test error');
 });

 it('should log Error object', () => {
 const error = new Error('Test error');
 handler.logError(error, 'test-service');

 const logs = handler.getErrorLog();
 expect(logs[logs.length - 1].error).toBe('Test error');
 });

 it('should filter logs by service', () => {
 handler.logError('Error 1', 'service1');
 handler.logError('Error 2', 'service2');
 handler.logError('Error 3', 'service1');

 const service1Logs = handler.getErrorLog('service1');
 expect(service1Logs.length).toBe(2);
 expect(service1Logs.every((log) => log.service === 'service1')).toBe(true);
 });

 it('should respect log limit', () => {
 for (let i = 0; i < 150; i++) {
 handler.logError(`Error ${i}`, 'test-service');
 }

 const logs = handler.getErrorLog('test-service', 100);
 expect(logs.length).toBeLessThanOrEqual(100);
 });

 it('should bound error log size', () => {
 for (let i = 0; i < 1500; i++) {
 handler.logError(`Error ${i}`, 'test-service');
 }

 const stats = handler.getErrorStatistics();
 expect(stats.totalErrors).toBeLessThanOrEqual(1000);
 });
 });

 describe('getErrorStatistics', () => {
 it('should return error statistics', () => {
 handler.logError('Error 1', 'service1');
 handler.logError('Error 2', 'service2');
 handler.logError('Error 3', 'service1');

 const stats = handler.getErrorStatistics();

 expect(stats.totalErrors).toBe(3);
 expect(stats.errorsByService['service1']).toBe(2);
 expect(stats.errorsByService['service2']).toBe(1);
 expect(stats.recentErrors.length).toBeLessThanOrEqual(10);
 });

 it('should return empty statistics when no errors', () => {
 const stats = handler.getErrorStatistics();

 expect(stats.totalErrors).toBe(0);
 expect(Object.keys(stats.errorsByService).length).toBe(0);
 expect(stats.recentErrors.length).toBe(0);
 });
 });

 describe('handleServiceUnavailability', () => {
 it('should handle unavailability without fallback', async () => {
 const result = await handler.handleServiceUnavailability('test-service');

 expect(result.handled).toBe(false);
 expect(result.usedFallback).toBe(false);
 });

 it('should use fallback when provided', async () => {
 const fallback = async () => 'fallback-data';
 const result = await handler.handleServiceUnavailability('test-service', fallback);

 expect(result.handled).toBe(true);
 expect(result.usedFallback).toBe(true);
 expect(result.data).toBe('fallback-data');
 });

 it('should handle fallback errors', async () => {
 const fallback = async () => {
 throw new Error('Fallback failed');
 };

 const result = await handler.handleServiceUnavailability('test-service', fallback);

 expect(result.handled).toBe(false);
 expect(result.usedFallback).toBe(true);
 });
 });

 describe('reset', () => {
 it('should clear all state', async () => {
 const healthCheck = async () => true;
 await handler.checkServiceHealth('test-service', healthCheck);
 handler.logError('Test error', 'test-service');

 handler.reset();

 expect(handler.getAllServiceHealth().length).toBe(0);
 expect(handler.getErrorLog().length).toBe(0);
 });
 });

 describe('Property: Retry Resilience', () => {
 it('retry should eventually succeed or fail consistently', async () => {
 await fc.assert(
 fc.asyncProperty(fc.integer({ min: 0, max: 5 }), async (failureCount) => {
 let attempts = 0;
 const fn = async () => {
 attempts++;
 if (attempts <= failureCount) throw new Error('Failure');
 return 'success';
 };

 const result = await handler.retry(fn, 'test-operation');

 if (failureCount < 3) {
 expect(result.success).toBe(true);
 } else {
 expect(result.success).toBe(false);
 }
 }),
 { numRuns: 100 }
 );
 });
 });

 describe('Property: Input Validation Consistency', () => {
 it('validation should be consistent for same input', async () => {
 await fc.assert(
 fc.asyncProperty(
 fc.record({
 name: fc.string( count: fc.integer(),
 }),
 async (data) => {
 const schema = { name: 'string', count: 'number' };

 const result1 = handler.validateInput(data, schema);
 const result2 = handler.validateInput(data, schema);

 expect(result1.valid).toBe(result2.valid);
 expect(result1.errors.length).toBe(result2.errors.length);
 }
 ),
 { numRuns: 100 }
 );
 });
 });

 describe('Property: Error Logging Monotonicity', () => {
 it('error count should never decrease', async () => {
 await fc.assert(
 fc.asyncProperty(fc.array(fc.string(), { minLength: 1, maxLength: 10 }), async (errors) => {
 const initialCount = handler.getErrorStatistics().totalErrors;

 for (const error of errors) {
 handler.logError(error, 'test-service');
 }

 const finalCount = handler.getErrorStatistics().totalErrors;
 expect(finalCount).toBeGreaterThanOrEqual(initialCount);
 }),
 { numRuns: 100 }
 );
 });
 });

 describe('Property: Service Health Tracking', () => {
 it('service health should track success and error counts correctly', async () => {
 await fc.assert(
 fc.asyncProperty(
 fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
 async (healthChecks) => {
 // Create fresh handler for each run to avoid state accumulation
 const freshHandler = new ErrorHandler({
 maxRetries: 3, retryDelayMs: 10, ollamaUrl: 'http://localhost:11434',
 qdrantUrl: 'http://localhost:6333',
 postgresUrl: 'postgresql://localhost/test',
 contextLines: 3,
 });

 const serviceName = 'test-service';

 for (const isHealthy of healthChecks) {
 const healthCheck = async () => isHealthy;
 await freshHandler.checkServiceHealth(serviceName, healthCheck);
 }

 const health = freshHandler.getServiceHealth(serviceName);
 expect(health).toBeDefined();
 expect(health!.successCount + health!.errorCount).toBe(healthChecks.length);
 }
 ),
 { numRuns: 100 }
 );
 });
 });

 describe('Integration: Full Error Handling Workflow', () => {
 it('should handle complete error handling workflow', async () => {
 // Validate input
 const data = { name: 'test', count: 5 };
 const schema = { name: 'string', count: 'number' };
 const validation = handler.validateInput(data, schema);
 expect(validation.valid).toBe(true);

 // Check service health
 const healthCheck = async () => true;
 const health = await handler.checkServiceHealth('test-service', healthCheck);
 expect(health.isHealthy).toBe(true);

 // Retry operation
 const fn = async () => 'success';
 const result = await handler.retry(fn, 'test-operation');
 expect(result.success).toBe(true);

 // Log error
 handler.logError('Test error', 'test-service');

 // Get statistics
 const stats = handler.getErrorStatistics();
 expect(stats.totalErrors).toBeGreaterThan(0);

 // Get all health
 const allHealth = handler.getAllServiceHealth();
 expect(allHealth.length).toBeGreaterThan(0);
 });
 });
});
