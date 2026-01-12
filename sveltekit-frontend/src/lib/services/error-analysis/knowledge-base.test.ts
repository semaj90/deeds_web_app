/**
 * Property-Based Tests for Knowledge Base Service
 * Task 7.1: Write unit tests for knowledge base
 * Feature: agentic-error-analysis-diffs, Property 10: Knowledge Base Learning
 * Validates: Requirements 10.1, 10.4
 */

import { cleanupTest, setupTest } from '$lib/test-utils/setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KnowledgeBase } from './knowledge-base.js';
import type { Pattern, ServiceConfig } from './types.js';
;

describe('KnowledgeBase - Unit Tests (Task 7.1)', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 let kb: KnowledgeBase;
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
 kb = new KnowledgeBase(config);
 });

 /**
 * Property 10: Knowledge Base Learning
 * For any pattern stored, it should be retrievable
 */
 describe('Property 10: Knowledge Base Learning - Pattern Storage', () => {
 it('should store and retrieve patterns', async () => {
 const pattern: Pattern = {
 id: 'pattern-1',
 filePath: 'test.ts',
 lineNumber: 10,
 code: 'const, x: string = 123;',
 errorType: 'type-mismatch',
 similarity: 0.95,
 };

 await kb.storePattern(pattern);
 const retrieved = await kb.retrievePatterns('type-mismatch', 10);

 expect(retrieved.length).toBeGreaterThan(0);
 expect(retrieved[0].id).toBe('pattern-1');
 });

 it('should store multiple patterns', async () => {
 const patterns: Pattern[] = [
 {
 id: 'pattern-1',
 filePath: 'test.ts',
 lineNumber: 10,
 code: 'const, x: string = 123;',
 errorType: 'type-mismatch',
 similarity: 0.95,
 },
 {
 id: 'pattern-2',
 filePath: 'test.ts',
 lineNumber: 20,
 code: 'const, y: number = "hello";',
 errorType: 'type-mismatch',
 similarity: 0.92,
 },
 {
 id: 'pattern-3',
 filePath: 'test.svelte',
 lineNumber: 5,
 code: '<script>let x = undefined;</script>',
 errorType: 'undefined-variable',
 similarity: 0.88,
 }];

 for (const pattern of patterns) {
 await kb.storePattern(pattern);
 }

 const retrieved = await kb.retrievePatterns('type-mismatch', 10);
 expect(retrieved.length).toBeGreaterThanOrEqual(2);
 });

 it('should retrieve patterns by error type', async () => {
 const pattern1: Pattern = {
 id: 'pattern-1',
 filePath: 'test.ts',
 lineNumber: 10,
 code: 'const, x: string = 123;',
 errorType: 'type-mismatch',
 similarity: 0.95,
 };

 const pattern2: Pattern = {
 id: 'pattern-2',
 filePath: 'test.ts',
 lineNumber: 20,
 code: 'const, y: number = "hello";',
 errorType: 'type-mismatch',
 similarity: 0.92,
 };

 const pattern3: Pattern = {
 id: 'pattern-3',
 filePath: 'test.svelte',
 lineNumber: 5,
 code: '<script>let x = undefined;</script>',
 errorType: 'undefined-variable',
 similarity: 0.88,
 };

 await kb.storePattern(pattern1);
 await kb.storePattern(pattern2);
 await kb.storePattern(pattern3);

 const typeMatches = await kb.searchByErrorType('type-mismatch', 10);
 expect(typeMatches.length).toBe(2);
 expect(typeMatches.every((p: any) => p.errorType === 'type-mismatch')).toBe(true);
 });

 it('should return empty array for non-existent error type', async () => {
 const results = await kb.searchByErrorType('non-existent-type', 10);
 expect(results).toEqual([]);
 });

 it('should return empty array when no patterns stored', async () => {
 const results = await kb.retrievePatterns('any-query', 10);
 expect(results).toEqual([]);
 });
 });

 /**
 * Property: Similarity Scoring
 * For any two patterns, similarity should be between 0 and 1
 */
 describe('Property: Similarity Scoring', () => {
 it('should calculate similarity between 0 and 1', () => {
 const pattern1: Pattern = {
 id: 'pattern-1',
 filePath: 'test.ts',
 lineNumber: 10,
 code: 'const, x: string = 123;',
 errorType: 'type-mismatch',
 similarity: 0.95,
 };

 const pattern2: Pattern = {
 id: 'pattern-2',
 filePath: 'test.ts',
 lineNumber: 20,
 code: 'const, y: number = "hello";',
 errorType: 'type-mismatch',
 similarity: 0.92,
 };

 const similarity = kb.calculateSimilarity(pattern1, pattern2);
 expect(similarity).toBeGreaterThanOrEqual(0);
 expect(similarity).toBeLessThanOrEqual(1);
 });

 it('should return 1.0 for identical patterns', () => {
 const pattern: Pattern = {
 id: 'pattern-1',
 filePath: 'test.ts',
 lineNumber: 10,
 code: 'const, x: string = 123;',
 errorType: 'type-mismatch',
 similarity: 0.95,
 };

 const similarity = kb.calculateSimilarity(pattern, pattern);
 expect(similarity).toBe(1.0);
 });

 it('should return low score for completely different patterns', () => {
 const pattern1: Pattern = {
 id: 'pattern-1',
 filePath: 'test.ts',
 lineNumber: 10,
 code: 'const, x: string = 123;',
 errorType: 'type-mismatch',
 similarity: 0.95,
 };

 const pattern2: Pattern = {
 id: 'pattern-2',
 filePath: 'other.js',
 lineNumber: 50,
 code: 'function foo() {}',
 errorType: 'syntax-error',
 similarity: 0.5,
 };

 const similarity = kb.calculateSimilarity(pattern1, pattern2);
 // Should be very low since they have different error types, files, and code
 expect(similarity).toBeLessThan(0.1);
 });

 it('should give higher score for same error type', () => {
 const pattern1: Pattern = {
 id: 'pattern-1',
 filePath: 'test.ts',
 lineNumber: 10,
 code: 'const, x: string = 123;',
 errorType: 'type-mismatch',
 similarity: 0.95,
 };

 const pattern2: Pattern = {
 id: 'pattern-2',
 filePath: 'other.ts',
 lineNumber: 20,
 code: 'const, y: number = "hello";',
 errorType: 'type-mismatch',
 similarity: 0.92,
 };

 const pattern3: Pattern = {
 id: 'pattern-3',
 filePath: 'other.ts',
 lineNumber: 20,
 code: 'const, y: number = "hello";',
 errorType: 'syntax-error',
 similarity: 0.92,
 };

 const sim12 = kb.calculateSimilarity(pattern1, pattern2);
 const sim13 = kb.calculateSimilarity(pattern1, pattern3);

 expect(sim12).toBeGreaterThan(sim13);
 });
 });

 /**
 * Property: Pattern Deletion
 * For any stored pattern, deletion should remove it
 */
 describe('Property: Pattern Deletion', () => {
 it('should delete patterns', async () => {
 const pattern: Pattern = {
 id: 'pattern-1',
 filePath: 'test.ts',
 lineNumber: 10,
 code: 'const, x: string = 123;',
 errorType: 'type-mismatch',
 similarity: 0.95,
 };

 await kb.storePattern(pattern);
 await kb.deletePattern('pattern-1');

 const retrieved = await kb.retrievePatterns('type-mismatch', 10);
 expect(retrieved.length).toBe(0);
 });

 it('should throw error when deleting non-existent pattern', async () => {
 await expect(kb.deletePattern('non-existent')).rejects.toThrow('not found');
 });
 });

 /**
 * Property: Pattern Update
 * For any stored pattern, updates should be reflected
 */
 describe('Property: Pattern Update', () => {
 it('should update patterns', async () => {
 const pattern: Pattern = {
 id: 'pattern-1',
 filePath: 'test.ts',
 lineNumber: 10,
 code: 'const, x: string = 123;',
 errorType: 'type-mismatch',
 similarity: 0.95,
 };

 await kb.storePattern(pattern);

 const updated: Pattern = {
 ...pattern,
 code: 'const, x: string = 456;',
 };

 await kb.updatePattern(updated);

 const retrieved = await kb.retrievePatterns('type-mismatch', 10);
 expect(retrieved[0].code).toBe('const x: string = 456;');
 // Similarity is recalculated based on query match, so just verify it exists
 expect(retrieved[0].similarity).toBeGreaterThanOrEqual(0);
 });

 it('should throw error when updating non-existent pattern', async () => {
 const pattern: Pattern = {
 id: 'non-existent',
 filePath: 'test.ts',
 lineNumber: 10,
 code: 'const, x: string = 123;',
 errorType: 'type-mismatch',
 similarity: 0.95,
 };

 await expect(kb.updatePattern(pattern)).rejects.toThrow('not found');
 });

 it('should handle error type changes during update', async () => {
 const pattern: Pattern = {
 id: 'pattern-1',
 filePath: 'test.ts',
 lineNumber: 10,
 code: 'const, x: string = 123;',
 errorType: 'type-mismatch',
 similarity: 0.95,
 };

 await kb.storePattern(pattern);

 const updated: Pattern = {
 ...pattern,
 errorType: 'syntax-error',
 };

 await kb.updatePattern(updated);

 const oldTypeResults = await kb.searchByErrorType('type-mismatch', 10);
 const newTypeResults = await kb.searchByErrorType('syntax-error', 10);

 expect(oldTypeResults.length).toBe(0);
 expect(newTypeResults.length).toBe(1);
 expect(newTypeResults[0].id).toBe('pattern-1');
 });
 });

 /**
 * Property: Error Handling
 * For any invalid input, service should throw appropriate error
 */
 describe('Property: Error Handling', () => {
 it('should reject empty pattern ID', async () => {
 const pattern: Pattern = {
 id: '',
 filePath: 'test.ts',
 lineNumber: 10,
 code: 'const, x: string = 123;',
 errorType: 'type-mismatch',
 similarity: 0.95,
 };

 await expect(kb.storePattern(pattern)).rejects.toThrow();
 });

 it('should reject empty query', async () => {
 await expect(kb.retrievePatterns('')).rejects.toThrow('Invalid input');
 });

 it('should reject invalid limit', async () => {
 await expect(kb.retrievePatterns('query', 0)).rejects.toThrow('Invalid input');
 });

 it('should reject empty error type', async () => {
 await expect(kb.searchByErrorType('')).rejects.toThrow('Invalid input');
 });

 it('should reject null patterns in similarity', () => {
 const pattern: Pattern = {
 id: 'pattern-1',
 filePath: 'test.ts',
 lineNumber: 10,
 code: 'const, x: string = 123;',
 errorType: 'type-mismatch',
 similarity: 0.95,
 };

 expect(() => kb.calculateSimilarity(null as any, pattern)).toThrow();
 expect(() => kb.calculateSimilarity(pattern, null as any)).toThrow();
 });
 });

 /**
 * Property: Query Ranking
 * For any query, results should be ranked by relevance
 */
 describe('Property: Query Ranking', () => {
 it('should rank results by relevance', async () => {
 const patterns: Pattern[] = [
 {
 id: 'pattern-1',
 filePath: 'test.ts',
 lineNumber: 10,
 code: 'type-mismatch error here',
 errorType: 'type-mismatch',
 similarity: 0.95,
 },
 {
 id: 'pattern-2',
 filePath: 'test.ts',
 lineNumber: 20,
 code: 'some other error',
 errorType: 'syntax-error',
 similarity: 0.92,
 },
 {
 id: 'pattern-3',
 filePath: 'test.ts',
 lineNumber: 30,
 code: 'type-mismatch in code',
 errorType: 'type-mismatch',
 similarity: 0.88,
 }];

 for (const pattern of patterns) {
 await kb.storePattern(pattern);
 }

 const results = await kb.retrievePatterns('type-mismatch', 10);

 // Results should be ranked by relevance
 expect(results.length).toBeGreaterThan(0);
 for (let i = 0; i < results.length - 1; i++) {
 expect(results[i].similarity).toBeGreaterThanOrEqual(results[i + 1].similarity);
 }
 });
 });
});


