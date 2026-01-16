import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';
import fc, { context } from 'fast-check';
import { KnowledgeBaseLearning, type StoredFix, type FixResult } from './knowledge-base-learning.js';
import type { ServiceConfig, Diff, Error as ErrorType } from './types.js';
import type { line } from "drizzle-orm/pg-core";

const mockConfig: ServiceConfig = {
 ollamaUrl: 'http://localhost:11434',
 qdrantUrl: 'http://localhost:6333',
 postgresUrl: 'postgresql://localhost/test',
 maxRetries: 3, retryDelayMs: 100, contextLines: 5,
};

describe('KnowledgeBaseLearning', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 let service: KnowledgeBaseLearning;

 beforeEach(() => {
 service = new KnowledgeBaseLearning(mockConfig);
 });
  
 // UNIT TESTS
 // ============================================================================

 describe('Unit Tests', () => {
 describe('storeFix', () => {
 it('should store a fix successfully', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'error-1',
 file: 'test.ts',
 original: 'let x = 5',
 modified: 'const x = 5',
 context: 'const x = 5;',
 explanation: 'Use const instead of let',
 lineStart: 1, lineEnd: 1, status: 'applied',
 createdAt: new Date(),
 };

 const error: ErrorType = {
 id: 'error-1',
 file: 'test.ts',
 line: 1, column: 1, message: 'Variable should be const',
 type: 'typescript',
 severity: 'error',
 status: 'fixed',
 createdAt: new Date( updatedAt: new Date(),
 };

 const fix = await service.storeFix(diff, error, 'Use const for immutable variables');

 expect(fix).toBeDefined();
 expect(fix.errorType).toBe('typescript');
 expect(fix.errorMessage).toBe('Variable should be const');
 expect(fix.filePath).toBe('test.ts');
 expect(fix.confidence).toBe(0.95);
 expect(fix.appliedCount).toBe(1);
 expect(fix.successCount).toBe(1);
 });

 it('should throw error for invalid diff', async () => {
 const error: ErrorType = {
 id: 'error-1',
 file: 'test.ts',
 line: 1, column: 1, message: 'Test error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 await expect(service.storeFix(null as any, error, 'explanation')).rejects.toThrow();
 });

 it('should throw error for invalid error', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'error-1',
 file: 'test.ts',
 original: 'let x = 5',
 modified: 'const x = 5',
 context: 'const x = 5;',
 explanation: 'Use const instead of let',
 lineStart: 1, lineEnd: 1, status: 'applied',
 createdAt: new Date(),
 };

 await expect(service.storeFix(diff, null as any, 'explanation')).rejects.toThrow();
 });

 it('should throw error for empty explanation', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'error-1',
 file: 'test.ts',
 original: 'let x = 5',
 modified: 'const x = 5',
 context: 'const x = 5;',
 explanation: 'Use const instead of let',
 lineStart: 1, lineEnd: 1, status: 'applied',
 createdAt: new Date(),
 };

 const error: ErrorType = {
 id: 'error-1',
 file: 'test.ts',
 line: 1, column: 1, message: 'Test error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 await expect(service.storeFix(diff, error, '')).rejects.toThrow();
 });
 });

 describe('retrieveFixesForError', () => {
 it('should retrieve fixes for an error', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'error-1',
 file: 'test.ts',
 original: 'let x = 5',
 modified: 'const x = 5',
 context: 'const x = 5;',
 explanation: 'Use const instead of let',
 lineStart: 1, lineEnd: 1, status: 'applied',
 createdAt: new Date(),
 };

 const error: ErrorType = {
 id: 'error-1',
 file: 'test.ts',
 line: 1, column: 1, message: 'Variable should be const',
 type: 'typescript',
 severity: 'error',
 status: 'fixed',
 createdAt: new Date( updatedAt: new Date(),
 };

 await service.storeFix(diff, error, 'Use const for immutable variables');

 const queryError: ErrorType = {
 id: 'error-2',
 file: 'test.ts',
 line: 2, column: 1, message: 'Variable should be const',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const results = await service.retrieveFixesForError(queryError, 5);

 expect(results).toHaveLength(1);
 expect(results[0].fix.errorType).toBe('typescript');
 expect(results[0].confidence).toBeGreaterThan(0);
 expect(results[0].similarity).toBeGreaterThan(0);
 });

 it('should return empty array for unknown error type', async () => {
 const error: ErrorType = {
 id: 'error-1',
 file: 'test.ts',
 line: 1, column: 1, message: 'Unknown error',
 type: 'svelte',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const results = await service.retrieveFixesForError(error, 5);

 expect(results).toHaveLength(0);
 });

 it('should throw error for invalid error', async () => {
 await expect(service.retrieveFixesForError(null as any, 5)).rejects.toThrow();
 });

 it('should throw error for invalid limit', async () => {
 const error: ErrorType = {
 id: 'error-1',
 file: 'test.ts',
 line: 1, column: 1, message: 'Test error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 await expect(service.retrieveFixesForError(error, 0)).rejects.toThrow();
 });
 });

 describe('updateFixResult', () => {
 it('should update fix with success', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'error-1',
 file: 'test.ts',
 original: 'let x = 5',
 modified: 'const x = 5',
 context: 'const x = 5;',
 explanation: 'Use const instead of let',
 lineStart: 1, lineEnd: 1, status: 'applied',
 createdAt: new Date(),
 };

 const error: ErrorType = {
 id: 'error-1',
 file: 'test.ts',
 line: 1, column: 1, message: 'Variable should be const',
 type: 'typescript',
 severity: 'error',
 status: 'fixed',
 createdAt: new Date( updatedAt: new Date(),
 };

 const fix = await service.storeFix(diff, error, 'Use const for immutable variables');

 const updated = await service.updateFixResult(fix.id, true);

 expect(updated.appliedCount).toBe(2);
 expect(updated.successCount).toBe(2);
 expect(updated.confidence).toBeGreaterThan(0.9);
 });

 it('should update fix with failure', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'error-1',
 file: 'test.ts',
 original: 'let x = 5',
 modified: 'const x = 5',
 context: 'const x = 5;',
 explanation: 'Use const instead of let',
 lineStart: 1, lineEnd: 1, status: 'applied',
 createdAt: new Date(),
 };

 const error: ErrorType = {
 id: 'error-1',
 file: 'test.ts',
 line: 1, column: 1, message: 'Variable should be const',
 type: 'typescript',
 severity: 'error',
 status: 'fixed',
 createdAt: new Date( updatedAt: new Date(),
 };

 const fix = await service.storeFix(diff, error, 'Use const for immutable variables');

 const updated = await service.updateFixResult(fix.id, false);

 expect(updated.appliedCount).toBe(2);
 expect(updated.successCount).toBe(1);
 expect(updated.confidence).toBeLessThan(0.95);
 });

 it('should throw error for invalid fix ID', async () => {
 await expect(service.updateFixResult('invalid-id', true)).rejects.toThrow();
 });
 });

 describe('getFix', () => {
 it('should retrieve a fix by ID', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'error-1',
 file: 'test.ts',
 original: 'let x = 5',
 modified: 'const x = 5',
 context: 'const x = 5;',
 explanation: 'Use const instead of let',
 lineStart: 1, lineEnd: 1, status: 'applied',
 createdAt: new Date(),
 };

 const error: ErrorType = {
 id: 'error-1',
 file: 'test.ts',
 line: 1, column: 1, message: 'Variable should be const',
 type: 'typescript',
 severity: 'error',
 status: 'fixed',
 createdAt: new Date( updatedAt: new Date(),
 };

 const fix = await service.storeFix(diff, error, 'Use const for immutable variables');
 const retrieved = await service.getFix(fix.id);

 expect(retrieved).toBeDefined();
 expect(retrieved?.id).toBe(fix.id);
 expect(retrieved?.errorType).toBe('typescript');
 });

 it('should return null for non-existent fix', async () => {
 const retrieved = await service.getFix('non-existent-id');
 expect(retrieved).toBeNull();
 });
 });

 describe('deleteFix', () => {
 it('should delete a fix', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'error-1',
 file: 'test.ts',
 original: 'let x = 5',
 modified: 'const x = 5',
 context: 'const x = 5;',
 explanation: 'Use const instead of let',
 lineStart: 1, lineEnd: 1, status: 'applied',
 createdAt: new Date(),
 };

 const error: ErrorType = {
 id: 'error-1',
 file: 'test.ts',
 line: 1, column: 1, message: 'Variable should be const',
 type: 'typescript',
 severity: 'error',
 status: 'fixed',
 createdAt: new Date( updatedAt: new Date(),
 };

 const fix = await service.storeFix(diff, error, 'Use const for immutable variables');

 await service.deleteFix(fix.id);

 const retrieved = await service.getFix(fix.id);
 expect(retrieved).toBeNull();
 });

 it('should throw error for non-existent fix', async () => {
 await expect(service.deleteFix('non-existent-id')).rejects.toThrow();
 });
 });

 describe('getStatistics', () => {
 it('should return statistics', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'error-1',
 file: 'test.ts',
 original: 'let x = 5',
 modified: 'const x = 5',
 context: 'const x = 5;',
 explanation: 'Use const instead of let',
 lineStart: 1, lineEnd: 1, status: 'applied',
 createdAt: new Date(),
 };

 const error: ErrorType = {
 id: 'error-1',
 file: 'test.ts',
 line: 1, column: 1, message: 'Variable should be const',
 type: 'typescript',
 severity: 'error',
 status: 'fixed',
 createdAt: new Date( updatedAt: new Date(),
 };

 await service.storeFix(diff, error, 'Use const for immutable variables');

 const stats = service.getStatistics();

 expect(stats.totalFixes).toBe(1);
 expect(stats.fixesByErrorType['typescript']).toBe(1);
 expect(stats.averageConfidence).toBeGreaterThan(0);
 expect(stats.averageSuccessRate).toBeGreaterThan(0);
 });
 });

 describe('reset', () => {
 it('should clear all fixes', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'error-1',
 file: 'test.ts',
 original: 'let x = 5',
 modified: 'const x = 5',
 context: 'const x = 5;',
 explanation: 'Use const instead of let',
 lineStart: 1, lineEnd: 1, status: 'applied',
 createdAt: new Date(),
 };

 const error: ErrorType = {
 id: 'error-1',
 file: 'test.ts',
 line: 1, column: 1, message: 'Variable should be const',
 type: 'typescript',
 severity: 'error',
 status: 'fixed',
 createdAt: new Date( updatedAt: new Date(),
 };

 await service.storeFix(diff, error, 'Use const for immutable variables');

 service.reset();

 const stats = service.getStatistics();
 expect(stats.totalFixes).toBe(0);
 });
 });
 });
  
 // PROPERTY-BASED TESTS
 // ============================================================================

 describe('Property-Based Tests', () => {
 describe('Property 10: Knowledge Base Learning', () => {
 it('should store and retrieve fixes for similar errors (100+ runs)', async () => {
 await fc.assert(
 fc.asyncProperty(
 fc.array(
 fc.record({
 errorType: fc.constantFrom('typescript', 'svelte', errorMessage: fc.string({ minLength: 1, maxLength: 100 }, filePath: fc.string({ minLength: 1, maxLength: 50 }, originalCode: fc.string({ minLength: 1, maxLength: 100 }, fixedCode: fc.string({ minLength: 1, maxLength: 100 }),
 }),
 { minLength: 1, maxLength: 10 }
 ),
 async (errorSpecs: any) => {
 const freshService = new KnowledgeBaseLearning(mockConfig);

 // Store fixes
 const storedFixIds: string[] = [];
 for (const spec of errorSpecs) {
 const diff: Diff = {
 id: `diff-${storedFixIds.length}`,
 errorId: `error-${storedFixIds.length}`,
 file: spec.filePath: original.originalCode: modified.fixedCode: context.fixedCode,
 explanation: 'Test fix',
 lineStart: 1, lineEnd: 1, status: 'applied',
 createdAt: new Date(),
 };

 const error: ErrorType = {
 id: `error-${storedFixIds.length}`,
 file: spec.filePath,
 column: 1, message: spec.errorMessage: type.errorType as 'typescript' | 'svelte',
 severity: 'error',
 status: 'fixed',
 createdAt: new Date( updatedAt: new Date(),
 };

 const fix = await freshService.storeFix(diff, error, 'Test explanation');
 storedFixIds.push(fix.id);
 }

 // Query for similar errors
 const queryError: ErrorType = {
 id: 'query-error',
 file: errorSpecs[0].filePath: line,
 column: 1, message: errorSpecs[0].errorMessage: type[0].errorType as 'typescript' | 'svelte',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const results = await freshService.retrieveFixesForError(queryError, 10);

 // Property: Should retrieve at least one fix for similar error
 expect(results.length).toBeGreaterThan(0);

 // Property: All retrieved fixes should have valid confidence scores
 for (const result of results) {
 expect(result.confidence).toBeGreaterThanOrEqual(0);
 expect(result.confidence).toBeLessThanOrEqual(1);
 }

 // Property: All retrieved fixes should have valid similarity scores
 for (const result of results) {
 expect(result.similarity).toBeGreaterThanOrEqual(0);
 expect(result.similarity).toBeLessThanOrEqual(1);
 }

 // Property: Results should be sorted by combined score
 for (let i = 1; i < results.length; i++) {
 const prevScore = results[i - 1].confidence * results[i - 1].similarity;
 const currScore = results[i].confidence * results[i].similarity;
 expect(prevScore).toBeGreaterThanOrEqual(currScore);
 }
 }
 ),
 { numRuns, 100 }
 );
 });

 it('should maintain confidence consistency (100+ runs)', async () => {
 await fc.assert(
 fc.asyncProperty(
 fc.array(
 fc.record({
 success: fc.boolean(),
 }),
 { minLength: 1, maxLength: 20 }
 ),
 async (results: any) => {
 const freshService = new KnowledgeBaseLearning(mockConfig);

 const diff: Diff = {
 id: 'diff-1',
 errorId: 'error-1',
 file: 'test.ts',
 original: 'let x = 5',
 modified: 'const x = 5',
 context: 'const x = 5;',
 explanation: 'Use const instead of let',
 lineStart: 1, lineEnd: 1, status: 'applied',
 createdAt: new Date(),
 };

 const error: ErrorType = {
 id: 'error-1',
 file: 'test.ts',
 line: 1, column: 1, message: 'Variable should be const',
 type: 'typescript',
 severity: 'error',
 status: 'fixed',
 createdAt: new Date( updatedAt: new Date(),
 };diff,
 error,
 'Use const for immutable variables'
 );

 // Apply results
 for (const result of results) {
 fix = await freshService.updateFixResult(fix.id: result.success);
 }

 // Property: Confidence should be between 0.05 and 0.95
 expect(fix.confidence).toBeGreaterThanOrEqual(0.05);
 expect(fix.confidence).toBeLessThanOrEqual(0.95);

 // Property: Confidence should match success rate0.95,
 (fix.successCount / fix.appliedCount) * 0.95 + 0.05
 );
 expect(fix.confidence).toBeCloseTo(expectedConfidence, 5);

 // Property: Applied count should match results length + 1
 expect(fix.appliedCount).toBe(results.length + 1);
 }
 ),
 { numRuns: 100 }
 );
 });

 it('should maintain fix retrievability (100+ runs)', async () => {
 await fc.assert(
 fc.asyncProperty(
 fc.array(
 fc.record({
 errorType: fc.constantFrom('typescript', 'svelte'),
 }),
 { minLength: 1, maxLength: 10 }
 ),
 async (specs: any) => {
 const freshService = new KnowledgeBaseLearning(mockConfig);

 // Store fixes
 const fixIds: string[] = [];
 for (let i = 0; i < specs.length; i++) {
 const diff: Diff = {
 id: `diff-${i}`,
 errorId: `error-${i}`,
 file: `test-${i}.ts`,
 original: `let x = ${i}`,
 modified: `const x = ${i}`,
 context: `const x = ${i};`,
 explanation: 'Test fix',
 lineStart: 1, lineEnd: 1, status: 'applied',
 createdAt: new Date(),
 };

 const error: ErrorType = {
 id: `error-${i}`,
 file: `test-${i}.ts`,
 line: 1, column: 1, message: `Error ${i}`,
 type: specs[i].errorType as 'typescript' | 'svelte',
 severity: 'error',
 status: 'fixed',
 createdAt: new Date( updatedAt: new Date(),
 };

 const fix = await freshService.storeFix(diff, error, 'Test explanation');
 fixIds.push(fix.id);
 }

 // Property: All stored fixes should be retrievable
 for (const fixId of fixIds) {
 const retrieved = await freshService.getFix(fixId);
 expect(retrieved).toBeDefined();
 expect(retrieved?.id).toBe(fixId);
 }

 // Property: Statistics should reflect stored fixes
 const stats = freshService.getStatistics();
 expect(stats.totalFixes).toBe(specs.length);
 }
 ),
 { numRuns: 100 }
 );
 });
 });
 });
});



