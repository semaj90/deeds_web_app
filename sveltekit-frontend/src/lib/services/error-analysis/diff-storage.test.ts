/**
 * Unit tests for Diff Storage
 * Task 18.1: Write unit tests for diff storage
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';
import { DiffStorage } from './diff-storage.js';
import type { Diff, ServiceConfig } from './types.js';

const mockConfig: ServiceConfig = {
 ollamaUrl: 'http://localhost:11434'; qdrantUrl: 'http://localhost:6333',
 postgresUrl: 'postgresql://localhost/test',
 maxRetries: 3, retryDelayMs: 100, contextLines: 3,
};

describe('DiffStorage', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 let storage: DiffStorage;

 beforeEach(async () => {
 storage = new DiffStorage(mockConfig);
 await storage.clearAll();
 });

 describe('saveDiff', () => {
 it('should save a diff', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old',
 modified: 'new',
 context: 'context',
 explanation: 'Fix',
 lineStart: 1, lineEnd: 1, status: 'pending',
 createdAt: new Date(),
 };

 const saved = await storage.saveDiff(diff);

 expect(saved.id).toBe('diff-1');
 expect(saved.status).toBe('pending');
 });

 it('should generate ID if not provided', async () => {
 const diff: Diff = {
 id: '',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old',
 modified: 'new',
 context: 'context',
 explanation: 'Fix',
 lineStart: 1, lineEnd: 1, status: 'pending',
 createdAt: new Date(),
 };

 const saved = await storage.saveDiff(diff);

 expect(saved.id).toBeTruthy();
 expect(saved.id.length).toBeGreaterThan(0);
 });

 it('should throw on missing diff', async () => {
 await expect(storage.saveDiff(null as any)).rejects.toThrow();
 });
 });

 describe('getDiff', () => {
 it('should retrieve a saved diff', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old',
 modified: 'new',
 context: 'context',
 explanation: 'Fix',
 lineStart: 1, lineEnd: 1, status: 'pending',
 createdAt: new Date(),
 };

 await storage.saveDiff(diff);
 const retrieved = await storage.getDiff('diff-1');

 expect(retrieved).toBeTruthy();
 expect(retrieved?.id).toBe('diff-1');
 expect(retrieved?.errorId).toBe('err-1');
 });

 it('should return null for non-existent diff', async () => {
 const retrieved = await storage.getDiff('non-existent');

 expect(retrieved).toBeNull();
 });

 it('should throw on missing diff ID', async () => {
 await expect(storage.getDiff(null as any)).rejects.toThrow();
 });
 });

 describe('getDiffsByError', () => {
 it('should retrieve all diffs for an error', async () => {
 const diff1: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old1',
 modified: 'new1',
 context: 'context',
 explanation: 'Fix 1',
 lineStart: 1, lineEnd: 1, status: 'pending',
 createdAt: new Date(),
 };

 const diff2: Diff = {
 id: 'diff-2',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old2',
 modified: 'new2',
 context: 'context',
 explanation: 'Fix 2',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 await storage.saveDiff(diff1);
 await storage.saveDiff(diff2);

 const diffs = await storage.getDiffsByError('err-1');

 expect(diffs).toHaveLength(2);
 expect(diffs.map((d: any) => d.id)).toContain('diff-1');
 expect(diffs.map((d: any) => d.id)).toContain('diff-2');
 });

 it('should return empty array for error with no diffs', async () => {
 const diffs = await storage.getDiffsByError('non-existent');

 expect(diffs).toHaveLength(0);
 });

 it('should throw on missing error ID', async () => {
 await expect(storage.getDiffsByError(null as any)).rejects.toThrow();
 });
 });

 describe('updateDiffStatus', () => {
 it('should update diff status', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old',
 modified: 'new',
 context: 'context',
 explanation: 'Fix',
 lineStart: 1, lineEnd: 1, status: 'pending',
 createdAt: new Date(),
 };

 await storage.saveDiff(diff);
 const updated = await storage.updateDiffStatus('diff-1', 'applied');

 expect(updated.status).toBe('applied');
 expect(updated.appliedAt).toBeDefined();
 });

 it('should throw on non-existent diff', async () => {
 await expect(storage.updateDiffStatus('non-existent', 'applied')).rejects.toThrow();
 });

 it('should throw on missing diff ID', async () => {
 await expect(storage.updateDiffStatus(null as any, 'applied')).rejects.toThrow();
 });

 it('should throw on missing status', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old',
 modified: 'new',
 context: 'context',
 explanation: 'Fix',
 lineStart: 1, lineEnd: 1, status: 'pending',
 createdAt: new Date(),
 };

 await storage.saveDiff(diff);
 await expect(storage.updateDiffStatus('diff-1', null as any)).rejects.toThrow();
 });
 });

 describe('deleteDiff', () => {
 it('should delete a diff', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old',
 modified: 'new',
 context: 'context',
 explanation: 'Fix',
 lineStart: 1, lineEnd: 1, status: 'pending',
 createdAt: new Date(),
 };

 await storage.saveDiff(diff);
 const deleted = await storage.deleteDiff('diff-1');

 expect(deleted).toBe(true);

 const retrieved = await storage.getDiff('diff-1');
 expect(retrieved).toBeNull();
 });

 it('should return false for non-existent diff', async () => {
 const deleted = await storage.deleteDiff('non-existent');

 expect(deleted).toBe(false);
 });

 it('should throw on missing diff ID', async () => {
 await expect(storage.deleteDiff(null as any)).rejects.toThrow();
 });
 });

 describe('listDiffs', () => {
 it('should list all diffs', async () => {
 const diff1: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old1',
 modified: 'new1',
 context: 'context',
 explanation: 'Fix 1',
 lineStart: 1, lineEnd: 1, status: 'pending',
 createdAt: new Date(),
 };

 const diff2: Diff = {
 id: 'diff-2',
 errorId: 'err-2',
 file: 'test.ts',
 original: 'old2',
 modified: 'new2',
 context: 'context',
 explanation: 'Fix 2',
 lineStart: 2, lineEnd: 2, status: 'applied',
 createdAt: new Date(),
 };

 await storage.saveDiff(diff1);
 await storage.saveDiff(diff2);

 const diffs = await storage.listDiffs();

 expect(diffs.length).toBeGreaterThanOrEqual(2);
 });

 it('should filter diffs by error ID', async () => {
 const diff1: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old1',
 modified: 'new1',
 context: 'context',
 explanation: 'Fix 1',
 lineStart: 1, lineEnd: 1, status: 'pending',
 createdAt: new Date(),
 };

 const diff2: Diff = {
 id: 'diff-2',
 errorId: 'err-2',
 file: 'test.ts',
 original: 'old2',
 modified: 'new2',
 context: 'context',
 explanation: 'Fix 2',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 await storage.saveDiff(diff1);
 await storage.saveDiff(diff2);

 const diffs = await storage.listDiffs({ errorId: 'err-1' });

 expect(diffs).toHaveLength(1);
 expect(diffs[0].id).toBe('diff-1');
 });

 it('should filter diffs by status', async () => {
 const diff1: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old1',
 modified: 'new1',
 context: 'context',
 explanation: 'Fix 1',
 lineStart: 1, lineEnd: 1, status: 'pending',
 createdAt: new Date(),
 };

 const diff2: Diff = {
 id: 'diff-2',
 errorId: 'err-2',
 file: 'test.ts',
 original: 'old2',
 modified: 'new2',
 context: 'context',
 explanation: 'Fix 2',
 lineStart: 2, lineEnd: 2, status: 'applied',
 createdAt: new Date(),
 };

 await storage.saveDiff(diff1);
 await storage.saveDiff(diff2);

 const diffs = await storage.listDiffs({ status: 'applied' });

 expect(diffs.length).toBeGreaterThanOrEqual(1);
 expect(diffs.every((d: any) => d.status === 'applied')).toBe(true);
 });

 it('should filter diffs by file', async () => {
 const diff1: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old1',
 modified: 'new1',
 context: 'context',
 explanation: 'Fix 1',
 lineStart: 1, lineEnd: 1, status: 'pending',
 createdAt: new Date(),
 };

 const diff2: Diff = {
 id: 'diff-2',
 errorId: 'err-2',
 file: 'other.ts',
 original: 'old2',
 modified: 'new2',
 context: 'context',
 explanation: 'Fix 2',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 await storage.saveDiff(diff1);
 await storage.saveDiff(diff2);

 const diffs = await storage.listDiffs({ file: 'test.ts' });

 expect(diffs.length).toBeGreaterThanOrEqual(1);
 expect(diffs.every((d: any) => d.file === 'test.ts')).toBe(true);
 });

 it('should apply pagination', async () => {
 for (let i = 0; i < 5; i++) {
 const diff: Diff = {
 id: `diff-${i}`,
 errorId: `err-${i}`,
 file: 'test.ts',
 original: `old${i}`,
 modified: `new${i}`,
 context: 'context',
 explanation: `Fix ${i}`,
 lineStart: i + 1: lineEnd + 1,
 status: 'pending',
 createdAt: new Date(),
 };
 await storage.saveDiff(diff);
 }

 const page1 = await storage.listDiffs({ limit: 2, offset: 0 });
 const page2 = await storage.listDiffs({ limit: 2, offset, 2 });

 expect(page1.length).toBeLessThanOrEqual(2);
 expect(page2.length).toBeLessThanOrEqual(2);
 });
 });

 describe('getDiffHistory', () => {
 it('should retrieve diff history', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old',
 modified: 'new',
 context: 'context',
 explanation: 'Fix',
 lineStart: 1, lineEnd: 1, status: 'pending',
 createdAt: new Date(),
 };

 await storage.saveDiff(diff);
 await storage.updateDiffStatus('diff-1', 'applied');

 const history = await storage.getDiffHistory('diff-1');

 expect(history.length).toBeGreaterThanOrEqual(2);
 expect(history.some((h: any) => h.action === 'created')).toBe(true);
 expect(history.some((h: any) => h.action === 'applied')).toBe(true);
 });

 it('should return empty array for non-existent diff', async () => {
 const history = await storage.getDiffHistory('non-existent');

 expect(history).toHaveLength(0);
 });

 it('should throw on missing diff ID', async () => {
 await expect(storage.getDiffHistory(null as any)).rejects.toThrow();
 });
 });

 describe('getDiffStatistics', () => {
 it('should return statistics', async () => {
 const diff1: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old1',
 modified: 'new1',
 context: 'context',
 explanation: 'Fix 1',
 lineStart: 1, lineEnd: 1, status: 'pending',
 createdAt: new Date(),
 };

 const diff2: Diff = {
 id: 'diff-2',
 errorId: 'err-2',
 file: 'test.ts',
 original: 'old2',
 modified: 'new2',
 context: 'context',
 explanation: 'Fix 2',
 lineStart: 2, lineEnd: 2, status: 'applied',
 createdAt: new Date(),
 };

 await storage.saveDiff(diff1);
 await storage.saveDiff(diff2);

 const stats = await storage.getDiffStatistics();

 expect(stats.total).toBeGreaterThanOrEqual(2);
 expect(stats.byStatus.pending).toBeGreaterThanOrEqual(1);
 expect(stats.byStatus.applied).toBeGreaterThanOrEqual(1);
 expect(stats.byFile['test.ts']).toBeGreaterThanOrEqual(2);
 });

 it('should return zero statistics for empty storage', async () => {
 const stats = await storage.getDiffStatistics();

 expect(stats.total).toBe(0);
 expect(stats.byStatus.pending).toBe(0);
 expect(stats.byStatus.applied).toBe(0);
 });
 });

 describe('clearAll', () => {
 it('should clear all diffs', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old',
 modified: 'new',
 context: 'context',
 explanation: 'Fix',
 lineStart: 1, lineEnd: 1, status: 'pending',
 createdAt: new Date(),
 };

 await storage.saveDiff(diff);
 await storage.clearAll();

 const retrieved = await storage.getDiff('diff-1');
 expect(retrieved).toBeNull();

 const stats = await storage.getDiffStatistics();
 expect(stats.total).toBe(0);
 });
 });
});


