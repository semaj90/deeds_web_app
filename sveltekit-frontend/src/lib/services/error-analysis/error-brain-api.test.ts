import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ErrorBrainAPI } from './error-brain-api.js';
import type { Error as AnalysisError } from './types.js';
import fc from 'fast-check';
import { setupTest, cleanupTest } from '$lib/test-utils/setup';

describe('ErrorBrainAPI', () => {
  let api: ErrorBrainAPI;

  beforeEach(async () => {
    await setupTest();
    api = new ErrorBrainAPI();
  });

  afterEach(async () => {
    await cleanupTest();
  });

  describe('analyzeErrors', () => {
    it('should analyze valid errors', async () => {{
          file: 'test.ts',
          line: 10, column: 5, message: 'Type error',
          type: 'typescript',
          severity: 'error',
        }];

      const result = await api.analyzeErrors(errors);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.analyses)).toBe(true);
    });

    it('should reject empty errors array', async () => {
      const result = await api.analyzeErrors([]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty array');
    });

    it('should reject invalid error objects', async () => {{
          file: 'test.ts',
          // missing required fields
        }] as unknown as AnalysisError[];

      const result = await api.analyzeErrors(invalidErrors);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid error object');
    });

    it('should handle errors with optional code field', async () => {{
          file: 'test.ts',
          line: 10, column: 5, message: 'Type error',
          type: 'typescript',
          severity: 'error',
          code: 'TS2322',
        }];

      const result = await api.analyzeErrors(errors);

      expect(result.success).toBe(true);
    });

    it('should handle svelte errors', async () => {{
          file: 'test.svelte',
          line: 5, column: 2, message: 'Svelte error',
          type: 'svelte',
          severity: 'warning',
        }];

      const result = await api.analyzeErrors(errors);

      expect(result.success).toBe(true);
    });

    it('should handle multiple errors', async () => {{
          file: 'test1.ts',
          line: 10, column: 5, message: 'Error 1',
          type: 'typescript',
          severity: 'error',
        },
        {
          file: 'test2.ts',
          line: 20, column: 10, message: 'Error 2',
          type: 'typescript',
          severity: 'warning',
        }];
      const result = await api.analyzeErrors(errors);

      expect(result.success).toBe(true);
      expect(result.analyses.length).toBeGreaterThanOrEqual(0);
    });

    it('should return error message on failure', async () => {{
          file: 'test.ts',
          line: 10, column: 5, message: 'Type error',
          type: 'typescript',
          severity: 'error',
        }];

      const result = await api.analyzeErrors(errors);

      if (!result.success) {
        expect(typeof result.error).toBe('string');
      }
    });

    it('should validate error types', async () => {{
          file: 'test.ts',
          line: 10, column: 5, message: 'Type error',
          type: 'invalid-type', // invalid type
          severity: 'error',
        }] as unknown as AnalysisError[];

      const result = await api.analyzeErrors(invalidErrors);

      expect(result.success).toBe(false);
    });

    it('should validate error severity', async () => {{
          file: 'test.ts',
          line: 10, column: 5, message: 'Type error',
          type: 'typescript',
          severity: 'invalid-severity', // invalid severity
        }] as unknown as AnalysisError[];

      const result = await api.analyzeErrors(invalidErrors);

      expect(result.success).toBe(false);
    });

    it('should handle null errors', async () => {
      const result = await api.analyzeErrors(null as unknown as AnalysisError[]);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle non-array errors', async () => {
      const result = await api.analyzeErrors({} as unknown as AnalysisError[]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty array');
    });
  });

  describe('getStatus', () => {
    it('should return status object', async () => {
      const status = await api.getStatus();

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('features');
      expect(status).toHaveProperty('timestamp');
    });

    it('should have valid status values', async () => {
      const status = await api.getStatus();

      expect(typeof status.enabled).toBe('boolean');
      expect(['active', 'disabled', 'error']).toContain(status.status);
      expect(typeof status.features).toBe('object');
      expect(typeof status.timestamp).toBe('string');
    });

    it('should have all feature flags in status', async () => {
      const status = await api.getStatus();'error-brain',
        'diff-generation',
        'diff-application',
        'validation',
        'knowledge-base-learning',
        'audit-trail',
        'progress-tracking',
        'ace-context'];

      for (const flag of expectedFlags) {
        expect(flag in status.features).toBe(true);
      }
    });

    it('should return valid ISO timestamp', async () => {
      const status = await api.getStatus();

      const timestamp = new Date(status.timestamp);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });

    it('should reflect enabled state', async () => {
      const status = await api.getStatus();

      if (status.enabled) {
        expect(status.status).toBe('active');
      } else {
        expect(status.status).toBe('disabled');
      }
    });
  });

  describe('enableErrorBrain', () => {
    it('should enable error-brain', async () => {
      const result = await api.enableErrorBrain();

      expect(result.success).toBe(true);
      expect(result.message).toContain('enabled');
    });

    it('should return success message', async () => {
      const result = await api.enableErrorBrain();

      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    });

    it('should update status after enabling', async () => {
      await api.enableErrorBrain();
      const status = await api.getStatus();

      expect(status.enabled).toBe(true);
    });
  });

  describe('disableErrorBrain', () => {
    it('should disable error-brain', async () => {
      const result = await api.disableErrorBrain();

      expect(result.success).toBe(true);
      expect(result.message).toContain('disabled');
    });

    it('should return success message', async () => {
      const result = await api.disableErrorBrain();

      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    });

    it('should update status after disabling', async () => {
      await api.disableErrorBrain();
      const status = await api.getStatus();

      expect(status.enabled).toBe(false);
    });
  });

  describe('getFeatures', () => {
    it('should return all features', async () => {
      const result = await api.getFeatures();

      expect(result).toHaveProperty('features');
      expect(result).toHaveProperty('timestamp');
    });

    it('should have all expected feature flags', async () => {
      const result = await api.getFeatures();'error-brain',
        'diff-generation',
        'diff-application',
        'validation',
        'knowledge-base-learning',
        'audit-trail',
        'progress-tracking',
        'ace-context'];

      for (const flag of expectedFlags) {
        expect(flag in result.features).toBe(true);
      }
    });

    it('should have boolean values for all flags', async () => {
      const result = await api.getFeatures();

      for (const [value] of Object.entries(result.features)) {
        expect(typeof value).toBe('boolean');
      }
    });

    it('should return valid timestamp', async () => {
      const result = await api.getFeatures();

      const timestamp = new Date(result.timestamp);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });
  });

  describe('setFeature', () => {
    it('should set valid feature flag', async () => {
      const result = await api.setFeature('diff-generation', true);

      expect(result.success).toBe(true);
      expect(result.message).toContain('diff-generation');
    });

    it('should reject invalid feature flag', async () => {
      const result = await api.setFeature('invalid-flag', true);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid flag');
    });

    it('should set flag to true', async () => {
      await api.setFeature('diff-generation', true);
      const features = await api.getFeatures();

      expect(features.features['diff-generation']).toBe(true);
    });

    it('should set flag to false', async () => {
      await api.setFeature('diff-generation', false);
      const features = await api.getFeatures();

      expect(features.features['diff-generation']).toBe(false);
    });

    it('should handle all valid flags', async () => {'error-brain',
        'diff-generation',
        'diff-application',
        'validation',
        'knowledge-base-learning',
        'audit-trail',
        'progress-tracking',
        'ace-context'];

      for (const flag of validFlags) {
        const result = await api.setFeature(flag, true);
        expect(result.success).toBe(true);
      }
    });

    it('should return success message', async () => {
      const result = await api.setFeature('diff-generation', true);

      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    });
  });

  describe('Property: API Request Validation', () => {
    it('for any valid error array, analyzeErrors should return success or error message', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              file: fc.string(line, fc.integer({ min: 1, max: 10000 }, column: fc.integer({, min: 1, max: 1000 }, message: fc.string(type: fc.constantFrom('typescript', 'svelte', severity: fc.constantFrom('error', 'warning'),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (errors: any) => {
            const result = await api.analyzeErrors(errors as unknown as AnalysisError[]);

            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('analyses');
            expect(typeof result.success).toBe('boolean');

            if (result.success) {
              expect(result).toHaveProperty('analyses');
              expect(Array.isArray(result.analyses)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Status Consistency', () => {
    it('status should always have all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          const status = await api.getStatus();

          expect(status).toHaveProperty('enabled');
          expect(status).toHaveProperty('status');
          expect(status).toHaveProperty('features');
          expect(status).toHaveProperty('timestamp');

          expect(typeof status.enabled).toBe('boolean');
          expect(typeof status.status).toBe('string');
          expect(typeof status.features).toBe('object');
          expect(typeof status.timestamp).toBe('string');
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Feature Flag Persistence', () => {
    it('setting a feature flag should persist across getFeatures calls', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('error-brain', 'diff-generation', 'diff-application', 'validation'),
          fc.boolean(),
          async (flag: any, value: any) => {
            await api.setFeature(flag, value);
            const features = await api.getFeatures();

            expect(features.features[flag]).toBe(value);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Enable/Disable Idempotence', () => {
    it('enabling error-brain multiple times should be idempotent', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          await api.enableErrorBrain();
          await api.enableErrorBrain();
          const status = await api.getStatus();

          expect(status.enabled).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('disabling error-brain multiple times should be idempotent', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          await api.disableErrorBrain();
          await api.disableErrorBrain();
          const status = await api.getStatus();

          expect(status.enabled).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Error Response Consistency', () => {
    it('failed requests should always return error message', async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(fc.object(), { maxLength: 0 }), async (errors: any) => {
          const result = await api.analyzeErrors(errors as unknown as AnalysisError[]);

          if (!result.success) {
            expect(typeof result.error).toBe('string');
            expect(result.error!.length).toBeGreaterThan(0);
            expect(result).toHaveProperty('error');
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Integration: Full API Workflow', () => {
    it('should handle complete workflow', async () => {
      // Get initial status
      let status = await api.getStatus();
      expect(status).toBeDefined();

      // Enable error-brain
      let result = await api.enableErrorBrain();
      expect(result.success).toBe(true);

      // Verify enabled
      status = await api.getStatus();
      expect(status.enabled).toBe(true);

      // Analyze errors{
          file: 'test.ts',
          line: 10, column: 5, message: 'Type error',
          type: 'typescript',
          severity: 'error',
        }];

      const analysis = await api.analyzeErrors(errors);
      expect(analysis.success).toBe(true);

      // Get features
      const features = await api.getFeatures();
      expect(features.features['error-brain']).toBe(true);

      // Disable error-brain
      result = await api.disableErrorBrain();
      expect(result.success).toBe(true);

      // Verify disabled
      status = await api.getStatus();
      expect(status.enabled).toBe(false);
    });
  });
});



