/**
 * Unit tests for Error-Brain Middleware
 * Task 21.1: Write unit tests for middleware
 * Property 7: Feature Flag Enforcement
 */

import { cleanupTest, setupTest } from '$lib/test-utils/setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ErrorBrainMiddleware } from './error-brain-middleware.js';
import type { ServiceConfig } from './types.js';
;

const mockConfig: ServiceConfig = {
 ollamaUrl: 'http://localhost:11434', qdrantUrl: 'http://localhost:6333',
 postgresUrl: 'postgresql://localhost/test',
 maxRetries: 3,
 retryDelayMs: 100,
 contextLines: 3,
};

describe('ErrorBrainMiddleware', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 let middleware: ErrorBrainMiddleware;

 beforeEach(() => {
 middleware = new ErrorBrainMiddleware(mockConfig);
 });

 describe('checkErrorBrainEnabled', () => {
 it('should return true when error-brain is enabled', () => {
 const result = middleware.checkErrorBrainEnabled();

 expect(result).toBe(true);
 });

 it('should return false when error-brain is disabled', () => {
 middleware.disableErrorBrain();
 const result = middleware.checkErrorBrainEnabled();

 expect(result).toBe(false);
 });

 it('should reflect changes after enable/disable', () => {
 middleware.disableErrorBrain();
 expect(middleware.checkErrorBrainEnabled()).toBe(false);

 middleware.enableErrorBrain();
 expect(middleware.checkErrorBrainEnabled()).toBe(true);
 });
 });

 describe('enforceErrorBrainNamespace', () => {
 it('should allow error-brain paths when enabled', () => {
 const result = middleware.enforceErrorBrainNamespace('/api/error-brain/analyze');

 expect(result).toBe(true);
 });

 it('should reject error-brain paths when disabled', () => {
 middleware.disableErrorBrain();
 const result = middleware.enforceErrorBrainNamespace('/api/error-brain/analyze');

 expect(result).toBe(false);
 });

 it('should allow non-error-brain paths regardless of flag', () => {
 middleware.disableErrorBrain();
 const result = middleware.enforceErrorBrainNamespace('/api/other/endpoint');

 expect(result).toBe(true);
 });

 it('should throw on missing path', () => {
 expect(() => middleware.enforceErrorBrainNamespace(null as any)).toThrow();
 });
 });

 describe('validateRequest', () => {
 it('should allow error-brain GET requests when enabled', () => {
 const result = middleware.validateRequest('/api/error-brain/status', 'GET');

 expect(result.allowed).toBe(true);
 expect(result.statusCode).toBe(200);
 });

 it('should allow error-brain POST requests when enabled', () => {
 const result = middleware.validateRequest('/api/error-brain/analyze', 'POST');

 expect(result.allowed).toBe(true);
 expect(result.statusCode).toBe(200);
 });

 it('should reject error-brain requests when disabled', () => {
 middleware.disableErrorBrain();
 const result = middleware.validateRequest('/api/error-brain/analyze', 'POST');

 expect(result.allowed).toBe(false);
 expect(result.statusCode).toBe(403);
 expect(result.message).toContain('disabled');
 });

 it('should reject invalid HTTP methods', () => {
 const result = middleware.validateRequest('/api/error-brain/analyze', 'INVALID' as any);

 expect(result.allowed).toBe(false);
 expect(result.statusCode).toBe(405);
 });

 it('should allow non-error-brain requests regardless of flag', () => {
 middleware.disableErrorBrain();
 const result = middleware.validateRequest('/api/other/endpoint', 'GET');

 expect(result.allowed).toBe(true);
 expect(result.statusCode).toBe(200);
 });

 it('should throw on missing path', () => {
 expect(() => middleware.validateRequest(null as any, 'GET')).toThrow();
 });

 it('should throw on missing method', () => {
 expect(() => middleware.validateRequest('/api/error-brain/analyze', null as any)).toThrow();
 });
 });

 describe('getStatus', () => {
 it('should return status with error-brain enabled', () => {
 const status = middleware.getStatus();

 expect(status.enabled).toBe(true);
 expect(status.namespace).toBe('/api/error-brain/');
 expect(status.flagStatus).toBeDefined();
 });

 it('should return status with error-brain disabled', () => {
 middleware.disableErrorBrain();
 const status = middleware.getStatus();

 expect(status.enabled).toBe(false);
 expect(status.namespace).toBe('/api/error-brain/');
 });

 it('should include all flag statuses', () => {
 const status = middleware.getStatus();

 expect(status.flagStatus['error-brain']).toBeDefined();
 expect(status.flagStatus['diff-generation']).toBeDefined();
 expect(status.flagStatus['validation']).toBeDefined();
 });
 });

 describe('enableErrorBrain', () => {
 it('should enable error-brain', () => {
 middleware.disableErrorBrain();
 expect(middleware.checkErrorBrainEnabled()).toBe(false);

 middleware.enableErrorBrain();
 expect(middleware.checkErrorBrainEnabled()).toBe(true);
 });

 it('should be idempotent', () => {
 middleware.enableErrorBrain();
 middleware.enableErrorBrain();

 expect(middleware.checkErrorBrainEnabled()).toBe(true);
 });
 });

 describe('disableErrorBrain', () => {
 it('should disable error-brain', () => {
 expect(middleware.checkErrorBrainEnabled()).toBe(true);

 middleware.disableErrorBrain();
 expect(middleware.checkErrorBrainEnabled()).toBe(false);
 });

 it('should be idempotent', () => {
 middleware.disableErrorBrain();
 middleware.disableErrorBrain();

 expect(middleware.checkErrorBrainEnabled()).toBe(false);
 });
 });

 describe('isErrorBrainPath', () => {
 it('should identify error-brain paths', () => {
 expect(middleware.isErrorBrainPath('/api/error-brain/analyze')).toBe(true);
 expect(middleware.isErrorBrainPath('/api/error-brain/status')).toBe(true);
 expect(middleware.isErrorBrainPath('/api/error-brain/')).toBe(true);
 });

 it('should reject non-error-brain paths', () => {
 expect(middleware.isErrorBrainPath('/api/other/endpoint')).toBe(false);
 expect(middleware.isErrorBrainPath('/api/analyze')).toBe(false);
 expect(middleware.isErrorBrainPath('/error-brain/analyze')).toBe(false);
 });

 it('should throw on missing path', () => {
 expect(() => middleware.isErrorBrainPath(null as any)).toThrow();
 });
 });

 describe('getEndpointName', () => {
 it('should extract endpoint name from error-brain path', () => {
 expect(middleware.getEndpointName('/api/error-brain/analyze')).toBe('analyze');
 expect(middleware.getEndpointName('/api/error-brain/status')).toBe('status');
 });

 it('should return null for non-error-brain paths', () => {
 expect(middleware.getEndpointName('/api/other/endpoint')).toBeNull();
 });

 it('should handle paths with trailing slashes', () => {
 const name = middleware.getEndpointName('/api/error-brain/analyze/');
 expect(name).toBe('analyze');
 });

 it('should throw on missing path', () => {
 expect(() => middleware.getEndpointName(null as any)).toThrow();
 });
 });

 describe('validateRequests', () => {
 it('should validate multiple requests', () => {
{ path: '/api/error-brain/analyze', method: 'POST' as const },
	{ path: '/api/error-brain/status', method: 'GET' as const },
	{ path: '/api/other/endpoint', method: 'GET' as const }];

 const results = middleware.validateRequests(requests);

 expect(results).toHaveLength(3);
 expect(results[0].allowed).toBe(true);
 expect(results[1].allowed).toBe(true);
 expect(results[2].allowed).toBe(true);
 });

 it('should reject error-brain requests when disabled', () => {
 middleware.disableErrorBrain();
{ path: '/api/error-brain/analyze', method: 'POST' as const },
	{ path: '/api/other/endpoint', method: 'GET' as const }];

 const results = middleware.validateRequests(requests);

 expect(results[0].allowed).toBe(false);
 expect(results[0].statusCode).toBe(403);
 expect(results[1].allowed).toBe(true);
 });
 });

 describe('Property 7: Feature Flag Enforcement', () => {
 it('should enforce error-brain flag on requests', () => {
 // When enabled
 let result = middleware.validateRequest('/api/error-brain/analyze', 'POST');
 expect(result.allowed).toBe(true);
 expect(result.statusCode).toBe(200);

 // When disabled
 middleware.disableErrorBrain();
 result = middleware.validateRequest('/api/error-brain/analyze', 'POST');
 expect(result.allowed).toBe(false);
 expect(result.statusCode).toBe(403);
 });

 it('should return 403 Forbidden when error-brain is disabled', () => {
 middleware.disableErrorBrain();
 const result = middleware.validateRequest('/api/error-brain/analyze', 'POST');

 expect(result.statusCode).toBe(403);
 expect(result.message).toContain('disabled');
 });

 it('should enforce namespace routing', () => {
 middleware.disableErrorBrain();

 // Error-brain paths should be rejected
 expect(middleware.enforceErrorBrainNamespace('/api/error-brain/analyze')).toBe(false);

 // Non-error-brain paths should be allowed
 expect(middleware.enforceErrorBrainNamespace('/api/other/endpoint')).toBe(true);
 });

 it('should update behavior when flag changes', () => {
 // Initially enabled
 expect(middleware.checkErrorBrainEnabled()).toBe(true);

 // Disable
 middleware.disableErrorBrain();
 expect(middleware.checkErrorBrainEnabled()).toBe(false);

 // Re-enable
 middleware.enableErrorBrain();
 expect(middleware.checkErrorBrainEnabled()).toBe(true);
 });
 });

 describe('Error handling', () => {
 it('should throw on null path', () => {
 expect(() => middleware.validateRequest(null as any, 'GET')).toThrow();
 });

 it('should throw on undefined path', () => {
 expect(() => middleware.validateRequest(undefined as any, 'GET')).toThrow();
 });

 it('should throw on null method', () => {
 expect(() => middleware.validateRequest('/api/error-brain/analyze', null as any)).toThrow();
 });

 it('should throw on undefined method', () => {
 expect(() =>
 middleware.validateRequest('/api/error-brain/analyze', undefined as any)
 ).toThrow();
 });

 it('should handle empty path gracefully', () => {
 expect(() => middleware.isErrorBrainPath('')).toThrow();
 });
 });

 describe('Integration scenarios', () => {
 it('should handle complete request lifecycle', () => {
 // 1. Check if error-brain is enabled
 expect(middleware.checkErrorBrainEnabled()).toBe(true);

 // 2. Validate request
 const validation = middleware.validateRequest('/api/error-brain/analyze', 'POST');
 expect(validation.allowed).toBe(true);

 // 3. Get status
 const status = middleware.getStatus();
 expect(status.enabled).toBe(true);

 // 4. Disable error-brain
 middleware.disableErrorBrain();

 // 5. Validate request again
 const validation2 = middleware.validateRequest('/api/error-brain/analyze', 'POST');
 expect(validation2.allowed).toBe(false);
 expect(validation2.statusCode).toBe(403);

 // 6. Get updated status
 const status2 = middleware.getStatus();
 expect(status2.enabled).toBe(false);
 });

 it('should handle multiple concurrent requests', () => {
 const requests = Array.from({ length: 10 },
	(_: any, i: any) => ({
 path: `/api/error-brain/endpoint${i}`,
 method: 'GET' as const,
 }));

 const results = middleware.validateRequests(requests);

 expect(results).toHaveLength(10);
 expect(results.every((r: any) => r.allowed)).toBe(true);
 });

 it('should handle rapid enable/disable cycles', () => {
 for (let i = 0; i < 5; i++) {
 middleware.disableErrorBrain();
 expect(middleware.checkErrorBrainEnabled()).toBe(false);

 middleware.enableErrorBrain();
 expect(middleware.checkErrorBrainEnabled()).toBe(true);
 }
 });
 });
});


