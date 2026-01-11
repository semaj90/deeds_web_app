/**
 * Property-Based Tests for ACE Context Manager Service
 * Task 12.1: Write property tests for ACE context
 * Feature: agentic-error-analysis-diffs, Property 6: ACE Context State Consistency
 * Validates: Requirements 6.1, 6.2
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AceContextManager } from './ace-context-manager';
import type { ServiceConfig, Analysis, Diff } from './types';

describe('AceContextManager - Property-Based Tests (Task 12.1)', () => {
  let manager: AceContextManager;
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
    manager = new AceContextManager(config);
  });

  /**
   * Property 6: ACE Context State Consistency
   * For any context created, it should be retrievable with same state
   */
  describe('Property 6: ACE Context State Consistency', () => {
    it('should create and retrieve context', async () => {
      const sessionId = 'session-1';

      const created = await manager.createContext(sessionId);
      const retrieved = await manager.loadContext(sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.sessionId).toBe(sessionId);
      expect(retrieved!.errorAnalysis).toEqual([]);
      expect(retrieved!.fixesApplied).toEqual([]);
    });

    it('should preserve context state after save', async () => {
      const sessionId = 'session-1';

      const created = await manager.createContext(sessionId);
      const saved = await manager.saveContext(created);
      const retrieved = await manager.loadContext(sessionId);

      expect(retrieved!.sessionId).toBe(saved.sessionId);
      expect(retrieved!.errorAnalysis).toEqual(saved.errorAnalysis);
      expect(retrieved!.fixesApplied).toEqual(saved.fixesApplied);
    });

    it('should maintain context consistency with multiple operations', async () => {
      const sessionId = 'session-1';

      const context = await manager.createContext(sessionId);

      const analysis: Analysis = {
        errorId: 'error-1',
        rootCause: 'Type mismatch',
        suggestedFix: 'const x: number = 123;',
        confidence: 0.95,
        relatedErrors: [],
        context: 'Error context',
        createdAt: new Date(),
      };

      const updated1 = await manager.addAnalysis(sessionId, analysis);
      expect(updated1.errorAnalysis.length).toBe(1);

      const retrieved = await manager.loadContext(sessionId);
      expect(retrieved!.errorAnalysis.length).toBe(1);
      expect(retrieved!.errorAnalysis[0].errorId).toBe('error-1');
    });

    it('should return null for non-existent context', async () => {
      const retrieved = await manager.loadContext('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  /**
   * Property: Context Analysis Management
   * For any analysis added, it should be retrievable
   */
  describe('Property: Context Analysis Management', () => {
    it('should add analysis to context', async () => {
      const sessionId = 'session-1';
      await manager.createContext(sessionId);

      const analysis: Analysis = {
        errorId: 'error-1',
        rootCause: 'Type mismatch',
        suggestedFix: 'const x: number = 123;',
        confidence: 0.95,
        relatedErrors: ['error-2'],
        context: 'Error context',
        createdAt: new Date(),
      };

      const updated = await manager.addAnalysis(sessionId, analysis);

      expect(updated.errorAnalysis.length).toBe(1);
      expect(updated.errorAnalysis[0].errorId).toBe('error-1');
      expect(updated.errorAnalysis[0].confidence).toBe(0.95);
    });

    it('should add multiple analyses', async () => {
      const sessionId = 'session-1';
      await manager.createContext(sessionId);

      for (let i = 0; i < 3; i++) {
        const analysis: Analysis = {
          errorId: `error-${i}`,
          rootCause: `Root cause ${i}`,
          suggestedFix: `Fix ${i}`,
          confidence: 0.8 + i * 0.05,
          relatedErrors: [],
          context: `Context ${i}`,
          createdAt: new Date(),
        };

        await manager.addAnalysis(sessionId, analysis);
      }

      const context = await manager.loadContext(sessionId);
      expect(context!.errorAnalysis.length).toBe(3);
    });

    it('should preserve analysis order', async () => {
      const sessionId = 'session-1';
      await manager.createContext(sessionId);

      const analyses = [];
      for (let i = 0; i < 3; i++) {
        const analysis: Analysis = {
          errorId: `error-${i}`,
          rootCause: `Root cause ${i}`,
          suggestedFix: `Fix ${i}`,
          confidence: 0.9,
          relatedErrors: [],
          context: `Context ${i}`,
          createdAt: new Date(),
        };

        const result = await manager.addAnalysis(sessionId, analysis);
        analyses.push(result);
      }

      const context = await manager.loadContext(sessionId);
      expect(context!.errorAnalysis[0].errorId).toBe('error-0');
      expect(context!.errorAnalysis[1].errorId).toBe('error-1');
      expect(context!.errorAnalysis[2].errorId).toBe('error-2');
    });
  });

  /**
   * Property: Context Fix Management
   * For any fix added, it should be retrievable
   */
  describe('Property: Context Fix Management', () => {
    it('should add fix to context', async () => {
      const sessionId = 'session-1';
      await manager.createContext(sessionId);

      const diff: Diff = {
        id: 'diff-1',
        errorId: 'error-1',
        file: 'test.ts',
        original: 'const x: string = 123;',
        modified: 'const x: number = 123;',
        context: 'Type mismatch fix',
        explanation: 'Changed type from string to number',
        lineStart: 10,
        lineEnd: 10,
        status: 'applied',
        createdAt: new Date(),
      };

      const updated = await manager.addFix(sessionId, diff);

      expect(updated.fixesApplied.length).toBe(1);
      expect(updated.fixesApplied[0].id).toBe('diff-1');
    });

    it('should add multiple fixes', async () => {
      const sessionId = 'session-1';
      await manager.createContext(sessionId);

      for (let i = 0; i < 3; i++) {
        const diff: Diff = {
          id: `diff-${i}`,
          errorId: `error-${i}`,
          file: `file-${i}.ts`,
          original: `original ${i}`,
          modified: `modified ${i}`,
          context: `Context ${i}`,
          explanation: `Explanation ${i}`,
          lineStart: 10 + i,
          lineEnd: 10 + i,
          status: 'applied',
          createdAt: new Date(),
        };

        await manager.addFix(sessionId, diff);
      }

      const context = await manager.loadContext(sessionId);
      expect(context!.fixesApplied.length).toBe(3);
    });
  });

  /**
   * Property: Metrics Management
   * For any metrics update, they should be retrievable
   */
  describe('Property: Metrics Management', () => {
    it('should update metrics', async () => {
      const sessionId = 'session-1';
      await manager.createContext(sessionId);

      const updated = await manager.updateMetrics(sessionId, {
        totalErrors: 10,
        errorsFixed: 5,
        successRate: 0.5,
        averageConfidence: 0.85,
      });

      expect(updated.metrics.totalErrors).toBe(10);
      expect(updated.metrics.errorsFixed).toBe(5);
      expect(updated.metrics.successRate).toBe(0.5);
      expect(updated.metrics.averageConfidence).toBe(0.85);
    });

    it('should calculate stats correctly', async () => {
      const sessionId = 'session-1';
      await manager.createContext(sessionId);

      // Add 3 analyses
      for (let i = 0; i < 3; i++) {
        const analysis: Analysis = {
          errorId: `error-${i}`,
          rootCause: `Root cause ${i}`,
          suggestedFix: `Fix ${i}`,
          confidence: 0.9,
          relatedErrors: [],
          context: `Context ${i}`,
          createdAt: new Date(),
        };

        await manager.addAnalysis(sessionId, analysis);
      }

      // Add 2 applied fixes
      for (let i = 0; i < 2; i++) {
        const diff: Diff = {
          id: `diff-${i}`,
          errorId: `error-${i}`,
          file: `file-${i}.ts`,
          original: `original ${i}`,
          modified: `modified ${i}`,
          context: `Context ${i}`,
          explanation: `Explanation ${i}`,
          lineStart: 10 + i,
          lineEnd: 10 + i,
          status: 'applied',
          createdAt: new Date(),
        };

        await manager.addFix(sessionId, diff);
      }

      const stats = await manager.getContextStats(sessionId);

      expect(stats.totalErrors).toBe(3);
      expect(stats.errorsFixed).toBe(2);
      expect(stats.successRate).toBeCloseTo(2 / 3, 2);
      expect(stats.averageConfidence).toBe(0.9);
    });

    it('should handle empty context stats', async () => {
      const sessionId = 'session-1';
      await manager.createContext(sessionId);

      const stats = await manager.getContextStats(sessionId);

      expect(stats.totalErrors).toBe(0);
      expect(stats.errorsFixed).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.averageConfidence).toBe(0);
    });
  });

  /**
   * Property: Context Deletion
   * For any context deleted, it should not be retrievable
   */
  describe('Property: Context Deletion', () => {
    it('should delete context', async () => {
      const sessionId = 'session-1';
      await manager.createContext(sessionId);

      await manager.deleteContext(sessionId);

      const retrieved = await manager.loadContext(sessionId);
      expect(retrieved).toBeNull();
    });

    it('should throw error when deleting non-existent context', async () => {
      await expect(manager.deleteContext('non-existent')).rejects.toThrow('not found');
    });
  });

  /**
   * Property: Context Listing
   * For any contexts created, they should be listable with pagination
   */
  describe('Property: Context Listing', () => {
    it('should list contexts', async () => {
      for (let i = 0; i < 5; i++) {
        await manager.createContext(`session-${i}`);
      }

      const contexts = await manager.listContexts(10, 0);

      expect(contexts.length).toBe(5);
    });

    it('should apply limit to listing', async () => {
      for (let i = 0; i < 10; i++) {
        await manager.createContext(`session-${i}`);
      }

      const contexts = await manager.listContexts(5, 0);

      expect(contexts.length).toBe(5);
    });

    it('should apply offset to listing', async () => {
      for (let i = 0; i < 10; i++) {
        await manager.createContext(`session-${i}`);
      }

      const page1 = await manager.listContexts(5, 0);
      const page2 = await manager.listContexts(5, 5);

      expect(page1.length).toBe(5);
      expect(page2.length).toBe(5);

      // Ensure no overlap
      const page1Ids = page1.map((c) => c.sessionId);
      const page2Ids = page2.map((c) => c.sessionId);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));

      expect(overlap).toEqual([]);
    });

    it('should sort contexts by timestamp descending', async () => {
      const contexts = [];

      for (let i = 0; i < 3; i++) {
        const c = await manager.createContext(`session-${i}`);
        contexts.push(c);

        // Small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      const listed = await manager.listContexts(10, 0);

      // Should be in reverse order (newest first)
      expect(listed[0].sessionId).toBe('session-2');
      expect(listed[1].sessionId).toBe('session-1');
      expect(listed[2].sessionId).toBe('session-0');
    });

    it('should reject invalid limit', async () => {
      await expect(manager.listContexts(0, 0)).rejects.toThrow('Invalid input');
    });

    it('should reject negative offset', async () => {
      await expect(manager.listContexts(10, -1)).rejects.toThrow('Invalid input');
    });
  });

  /**
   * Property: Error Handling
   * For any invalid input, service should throw appropriate error
   */
  describe('Property: Error Handling', () => {
    it('should reject empty session ID in createContext', async () => {
      await expect(manager.createContext('')).rejects.toThrow('Invalid input');
    });

    it('should reject empty session ID in loadContext', async () => {
      await expect(manager.loadContext('')).rejects.toThrow('Invalid input');
    });

    it('should reject empty session ID in updateMetrics', async () => {
      await expect(manager.updateMetrics('', { totalErrors: 1 })).rejects.toThrow('Invalid input');
    });

    it('should reject empty session ID in addAnalysis', async () => {
      const analysis: Analysis = {
        errorId: 'error-1',
        rootCause: 'Root cause',
        suggestedFix: 'Fix',
        confidence: 0.9,
        relatedErrors: [],
        context: 'Context',
        createdAt: new Date(),
      };

      await expect(manager.addAnalysis('', analysis)).rejects.toThrow('Invalid input');
    });

    it('should reject empty session ID in addFix', async () => {
      const diff: Diff = {
        id: 'diff-1',
        errorId: 'error-1',
        file: 'test.ts',
        original: 'original',
        modified: 'modified',
        context: 'Context',
        explanation: 'Explanation',
        lineStart: 10,
        lineEnd: 10,
        status: 'applied',
        createdAt: new Date(),
      };

      await expect(manager.addFix('', diff)).rejects.toThrow('Invalid input');
    });

    it('should reject non-existent context in updateMetrics', async () => {
      await expect(manager.updateMetrics('non-existent', { totalErrors: 1 })).rejects.toThrow(
        'not found'
      );
    });

    it('should reject non-existent context in addAnalysis', async () => {
      const analysis: Analysis = {
        errorId: 'error-1',
        rootCause: 'Root cause',
        suggestedFix: 'Fix',
        confidence: 0.9,
        relatedErrors: [],
        context: 'Context',
        createdAt: new Date(),
      };

      await expect(manager.addAnalysis('non-existent', analysis)).rejects.toThrow('not found');
    });

    it('should reject non-existent context in addFix', async () => {
      const diff: Diff = {
        id: 'diff-1',
        errorId: 'error-1',
        file: 'test.ts',
        original: 'original',
        modified: 'modified',
        context: 'Context',
        explanation: 'Explanation',
        lineStart: 10,
        lineEnd: 10,
        status: 'applied',
        createdAt: new Date(),
      };

      await expect(manager.addFix('non-existent', diff)).rejects.toThrow('not found');
    });

    it('should reject non-existent context in getContextStats', async () => {
      await expect(manager.getContextStats('non-existent')).rejects.toThrow('not found');
    });
  });
});
