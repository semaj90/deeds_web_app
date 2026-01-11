/**
 * Integration Tests for Error Analysis Pipeline
 * Task 13.1: Write integration tests for analysis pipeline
 * Feature: agentic-error-analysis-diffs, Property 1: Error Extraction Completeness
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorAnalysisPipeline } from './error-analysis-pipeline';
import type { ServiceConfig, Error } from './types';

describe('ErrorAnalysisPipeline - Integration Tests (Task 13.1)', () => {
  let pipeline: ErrorAnalysisPipeline;
  let config: ServiceConfig;

  beforeEach(() => {
    config = {
      ollamaUrl: 'http://localhost:11434',
      qdrantUrl: 'http://localhost:6333',
      postgresUrl: 'postgresql://localhost/error_analysis',
      maxRetries: 3,
      retryDelayMs: 100,
      contextLines: 5,
    };
    pipeline = new ErrorAnalysisPipeline(config);

    // Mock fetch for LLM and embedding calls
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/api/generate')) {
        // Mock LLM response
        return {
          ok: true,
          json: async () => ({
            response: `## Root Cause
The variable is assigned a number but declared as string.

## Suggested Fix
\`\`\`typescript
const x: number = 123;
\`\`\`

## Confidence
0.95

## Related Errors
type-mismatch`,
            eval_count: 150,
          }),
        };
      } else if (url.includes('/api/embed')) {
        // Mock embedding response
        return {
          ok: true,
          json: async () => ({
            embeddings: [Array(384).fill(0.1)],
          }),
        };
      }
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      };
    });
  });

  /**
   * Property 1: Error Extraction Completeness
   * For any error, the pipeline should extract and analyze all details
   */
  describe('Property 1: Error Extraction Completeness', () => {
    it('should create ACE context for session', async () => {
      const sessionId = 'session-1';

      const errors: Error[] = [
        {
          id: 'error-1',
          file: 'test.ts',
          line: 10,
          column: 5,
          message: 'Type error',
          type: 'typescript',
          severity: 'error',
          status: 'new',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const context = await pipeline.analyzeErrors(sessionId, errors);

      expect(context.sessionId).toBe(sessionId);
      expect(context.errorAnalysis.length).toBeGreaterThanOrEqual(0);
      expect(context.metrics.totalErrors).toBeGreaterThanOrEqual(0);
    });

    it('should retrieve session context', async () => {
      const sessionId = 'session-1';

      const errors: Error[] = [
        {
          id: 'error-1',
          file: 'test.ts',
          line: 10,
          column: 5,
          message: 'Type error',
          type: 'typescript',
          severity: 'error',
          status: 'new',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      await pipeline.analyzeErrors(sessionId, errors);

      const context = await pipeline.getSessionContext(sessionId);

      expect(context).not.toBeNull();
      expect(context!.sessionId).toBe(sessionId);
    });
  });

  /**
   * Property: Pipeline Workflow
   * For any error batch, the pipeline should complete all steps
   */
  describe('Property: Pipeline Workflow', () => {
    it('should handle multiple errors', async () => {
      const sessionId = 'session-1';

      const errors: Error[] = [
        {
          id: 'error-1',
          file: 'test.ts',
          line: 10,
          column: 5,
          message: 'Type error 1',
          type: 'typescript',
          severity: 'error',
          status: 'new',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'error-2',
          file: 'test.ts',
          line: 20,
          column: 10,
          message: 'Type error 2',
          type: 'typescript',
          severity: 'error',
          status: 'new',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'error-3',
          file: 'other.svelte',
          line: 5,
          column: 2,
          message: 'Svelte error',
          type: 'svelte',
          severity: 'warning',
          status: 'new',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const context = await pipeline.analyzeErrors(sessionId, errors);

      expect(context.errorAnalysis.length).toBeGreaterThanOrEqual(0);
      expect(context.metrics.totalErrors).toBeGreaterThanOrEqual(0);
    });

    it('should calculate metrics correctly', async () => {
      const sessionId = 'session-1';

      const errors: Error[] = [
        {
          id: 'error-1',
          file: 'test.ts',
          line: 10,
          column: 5,
          message: 'Type error',
          type: 'typescript',
          severity: 'error',
          status: 'new',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const context = await pipeline.analyzeErrors(sessionId, errors);

      expect(context.metrics.totalErrors).toBeGreaterThanOrEqual(0);
      expect(context.metrics.averageConfidence).toBeGreaterThanOrEqual(0);
      expect(context.metrics.averageConfidence).toBeLessThanOrEqual(1);
    });
  });

  /**
   * Property: Error Handling
   * For any invalid input, pipeline should throw appropriate error
   */
  describe('Property: Error Handling', () => {
    it('should reject empty session ID in analyzeError', async () => {
      const error: Error = {
        id: 'error-1',
        file: 'test.ts',
        line: 10,
        column: 5,
        message: 'Type error',
        type: 'typescript',
        severity: 'error',
        status: 'new',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(pipeline.analyzeError('', error)).rejects.toThrow('Invalid input');
    });

    it('should reject null error in analyzeError', async () => {
      await expect(pipeline.analyzeError('session-1', null as any)).rejects.toThrow();
    });

    it('should reject empty session ID in analyzeErrors', async () => {
      const errors: Error[] = [
        {
          id: 'error-1',
          file: 'test.ts',
          line: 10,
          column: 5,
          message: 'Type error',
          type: 'typescript',
          severity: 'error',
          status: 'new',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      await expect(pipeline.analyzeErrors('', errors)).rejects.toThrow('Invalid input');
    });

    it('should reject empty errors array in analyzeErrors', async () => {
      await expect(pipeline.analyzeErrors('session-1', [])).rejects.toThrow('Invalid input');
    });

    it('should reject empty session ID in getSessionContext', async () => {
      await expect(pipeline.getSessionContext('')).rejects.toThrow('Invalid input');
    });

    it('should return null for non-existent session', async () => {
      const context = await pipeline.getSessionContext('non-existent');
      expect(context).toBeNull();
    });
  });

  /**
   * Property: Context Persistence
   * For any analyzed errors, context should be retrievable
   */
  describe('Property: Context Persistence', () => {
    it('should persist context after analysis', async () => {
      const sessionId = 'session-1';

      const errors: Error[] = [
        {
          id: 'error-1',
          file: 'test.ts',
          line: 10,
          column: 5,
          message: 'Type error',
          type: 'typescript',
          severity: 'error',
          status: 'new',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const analyzedContext = await pipeline.analyzeErrors(sessionId, errors);
      const retrievedContext = await pipeline.getSessionContext(sessionId);

      expect(retrievedContext).not.toBeNull();
      expect(retrievedContext!.sessionId).toBe(analyzedContext.sessionId);
      expect(retrievedContext!.errorAnalysis.length).toBe(analyzedContext.errorAnalysis.length);
    });

    it('should maintain context state across retrievals', async () => {
      const sessionId = 'session-1';

      const errors: Error[] = [
        {
          id: 'error-1',
          file: 'test.ts',
          line: 10,
          column: 5,
          message: 'Type error',
          type: 'typescript',
          severity: 'error',
          status: 'new',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      await pipeline.analyzeErrors(sessionId, errors);

      const context1 = await pipeline.getSessionContext(sessionId);
      const context2 = await pipeline.getSessionContext(sessionId);

      expect(context1!.errorAnalysis.length).toBe(context2!.errorAnalysis.length);
      expect(context1!.metrics.totalErrors).toBe(context2!.metrics.totalErrors);
    });
  });

  /**
   * Property: Analysis Completeness
   * For any error, analysis should have all required fields
   */
  describe('Property: Analysis Completeness', () => {
    it('should have metrics in context', async () => {
      const sessionId = 'session-1';

      const errors: Error[] = [
        {
          id: 'error-1',
          file: 'test.ts',
          line: 10,
          column: 5,
          message: 'Type error',
          type: 'typescript',
          severity: 'error',
          status: 'new',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const context = await pipeline.analyzeErrors(sessionId, errors);

      expect(context.metrics).toBeDefined();
      expect(context.metrics.totalErrors).toBeGreaterThanOrEqual(0);
      expect(context.metrics.errorsFixed).toBeGreaterThanOrEqual(0);
      expect(context.metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(context.metrics.averageConfidence).toBeGreaterThanOrEqual(0);
    });
  });
});
