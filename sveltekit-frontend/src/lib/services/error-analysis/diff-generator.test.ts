/**
 * Property-based tests for Diff Generator
 * Property 4: Diff Context Preservation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTest: cleanupTest } from '$lib/test-utils/setup';;
import fc from 'fast-check';
import { DiffGenerator } from './diff-generator.js';
import type { Diff, Error, ServiceConfig } from './types.js';
import type { line } from "drizzle-orm/pg-core";

const mockConfig: ServiceConfig = {
 ollamaUrl: 'http://localhost:11434',
 qdrantUrl: 'http://localhost:6333',
 postgresUrl: 'postgresql://localhost/test',
 maxRetries: 3, retryDelayMs: 100, contextLines: 3,
};

describe('DiffGenerator', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 let generator: DiffGenerator;

 beforeEach(() => {
 generator = new DiffGenerator(mockConfig);
 });

 describe('Property 4: Diff Context Preservation', () => {
 it('should preserve 3-5 lines of context before and after change', async () => {
 const error: Error = {
 id: 'err-1',
 file: 'test.ts',
 line: 5, column: 10, message: 'Type error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const originalCode = `line 1
line 2
line 3
line 4
line 5 - ERROR
line 6
line 7
line 8
line 9`;

 const fix = 'line 5 - FIXED';

 const diff = await generator.generateDiff(error, fix, originalCode);

 // Verify context includes surrounding lines
 expect(diff.context).toBeDefined();
 expect(diff.context.length).toBeGreaterThan(0);

 // Verify line boundaries
 expect(diff.lineStart).toBeLessThanOrEqual(error.line);
 expect(diff.lineEnd).toBeGreaterThanOrEqual(error.line);

 // Verify context contains original and modified
 expect(diff.original).toBe('line 5 - ERROR');
 expect(diff.modified).toBe('line 5 - FIXED');
 });

 it('should handle errors at file boundaries', async () => {
 const error: Error = {
 id: 'err-1',
 file: 'test.ts',
 line: 1, column: 0, message: 'First line error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const originalCode = `line 1 - ERROR
line 2
line 3`;

 const fix = 'line 1 - FIXED';

 const diff = await generator.generateDiff(error, fix, originalCode);

 expect(diff.lineStart).toBeGreaterThanOrEqual(1);
 expect(diff.lineEnd).toBeLessThanOrEqual(3);
 expect(diff.original).toBe('line 1 - ERROR');
 expect(diff.modified).toBe('line 1 - FIXED');
 });

 it('should handle errors at end of file', async () => {
 const error: Error = {
 id: 'err-1',
 file: 'test.ts',
 line: 3, column: 0, message: 'Last line error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const originalCode = `line 1
line 2
line 3 - ERROR`;

 const fix = 'line 3 - FIXED';

 const diff = await generator.generateDiff(error, fix, originalCode);

 expect(diff.lineStart).toBeGreaterThanOrEqual(1);
 expect(diff.lineEnd).toBeLessThanOrEqual(3);
 expect(diff.original).toBe('line 3 - ERROR');
 expect(diff.modified).toBe('line 3 - FIXED');
 });

 it('should include explanation in diff', async () => {
 const error: Error = {
 id: 'err-1',
 file: 'test.ts',
 line: 5, column: 10, message: 'Type mismatch',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const originalCode = `line 1
line 2
line 3
line 4
line 5 - ERROR
line 6
line 7`;

 const fix = 'line 5 - FIXED';

 const diff = await generator.generateDiff(error, fix, originalCode);

 expect(diff.explanation).toContain('Fixed error');
 expect(diff.explanation).toContain('line 5');
 expect(diff.explanation).toContain('Type mismatch');
 });

 it('should set correct diff status', async () => {
 const error: Error = {
 id: 'err-1',
 file: 'test.ts',
 line: 5, column: 10, message: 'Error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const originalCode = `line 1
line 2
line 3
line 4
line 5 - ERROR
line 6
line 7`;

 const fix = 'line 5 - FIXED';

 const diff = await generator.generateDiff(error, fix, originalCode);

 expect(diff.status).toBe('pending');
 expect(diff.createdAt).toBeDefined();
 expect(diff.appliedAt).toBeUndefined();
 });
 });

 describe('addContext', () => {
 it('should add context to diff', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old line',
 modified: 'new line',
 context: '',
 explanation: 'Test fix',
 lineStart: 5, lineEnd: 5, status: 'pending',
 createdAt: new Date(),
 };

 const result = await generator.addContext(diff, 3);

 expect(result.context).toBeDefined();
 expect(result.context.length).toBeGreaterThan(0);
 });

 it('should validate context lines parameter', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old line',
 modified: 'new line',
 context: '',
 explanation: 'Test fix',
 lineStart: 5, lineEnd: 5, status: 'pending',
 createdAt: new Date(),
 };

 await expect(generator.addContext(diff, 0)).rejects.toThrow();
 await expect(generator.addContext(diff, 6)).rejects.toThrow();
 });

 it('should not re-add context if already sufficient', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old line',
 modified: 'new line',
 context: 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7',
 explanation: 'Test fix',
 lineStart: 5, lineEnd: 5, status: 'pending',
 createdAt: new Date(),
 };

 const result = await generator.addContext(diff, 3);

 expect(result.context).toBe(diff.context);
 });
 });

 describe('formatDiff', () => {
 it('should format diff as readable string', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const, x: string = 123;',
 modified: 'const, x: number = 123;',
 context: 'const, x: string = 123;',
 explanation: 'Fixed type annotation',
 lineStart: 5, lineEnd: 5, status: 'pending',
 createdAt: new Date(),
 };

 const formatted = await generator.formatDiff(diff);

 expect(formatted).toContain('test.ts');
 expect(formatted).toContain('const x: string = 123;');
 expect(formatted).toContain('const x: number = 123;');
 expect(formatted).toContain('Fixed type annotation');
 expect(formatted).toContain('pending');
 });

 it('should include diff markers', async () => {
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

 const formatted = await generator.formatDiff(diff);

 expect(formatted).toContain('---');
 expect(formatted).toContain('+++');
 expect(formatted).toContain('@@');
 expect(formatted).toContain('-');
 expect(formatted).toContain('+');
 });
 });

 describe('splitLargeDiff', () => {
 it('should not split small diffs', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old',
 modified: 'new',
 context: 'line 1\nline 2\nline 3',
 explanation: 'Fix',
 lineStart: 1, lineEnd: 3, status: 'pending',
 createdAt: new Date(),
 };

 const result = await generator.splitLargeDiff(diff, 50);

 expect(result).toHaveLength(1);
 expect(result[0].id).toBe(diff.id);
 });

 it('should split large diffs', async () => {
 const largeContext = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');

 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old',
 modified: 'new',
 context: largeContext,
 explanation: 'Fix',
 lineStart: 1, lineEnd: 100, status: 'pending',
 createdAt: new Date(),
 };

 const result = await generator.splitLargeDiff(diff, 30);

 expect(result.length).toBeGreaterThan(1);
 expect(result.every((d) => d.errorId === diff.errorId)).toBe(true);
 expect(result.every((d) => d.file === diff.file)).toBe(true);
 });

 it('should preserve diff information when splitting', async () => {
 const largeContext = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');

 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old',
 modified: 'new',
 context: largeContext,
 explanation: 'Fix',
 lineStart: 1, lineEnd: 100, status: 'pending',
 createdAt: new Date(),
 };

 const result = await generator.splitLargeDiff(diff, 30);

 result.forEach((d) => {
 expect(d.errorId).toBe(diff.errorId);
 expect(d.file).toBe(diff.file);
 expect(d.original).toBe(diff.original);
 expect(d.modified).toBe(diff.modified);
 expect(d.status).toBe('pending');
 });
 });

 it('should validate max lines parameter', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'old',
 modified: 'new',
 context: 'line 1\nline 2',
 explanation: 'Fix',
 lineStart: 1, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 await expect(generator.splitLargeDiff(diff, 5)).rejects.toThrow();
 });
 });

 describe('Error handling', () => {
 it('should throw on invalid error line', async () => {
 const error: Error = {
 id: 'err-1',
 file: 'test.ts',
 line: 100, column: 0, message: 'Error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const originalCode = 'line 1\nline 2\nline 3';

 await expect(generator.generateDiff(error, 'fix', originalCode)).rejects.toThrow();
 });

 it('should throw on missing error', async () => {
 const originalCode = 'line 1\nline 2';

 await expect(generator.generateDiff(null as any, 'fix', originalCode)).rejects.toThrow();
 });

 it('should throw on missing fix', async () => {
 const error: Error = {
 id: 'err-1',
 file: 'test.ts',
 line: 1, column: 0, message: 'Error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const originalCode = 'line 1\nline 2';

 await expect(generator.generateDiff(error, null as any, originalCode)).rejects.toThrow();
 });

 it('should throw on missing original code', async () => {
 const error: Error = {
 id: 'err-1',
 file: 'test.ts',
 line: 1, column: 0, message: 'Error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 await expect(generator.generateDiff(error, 'fix', null as any)).rejects.toThrow();
 });
 });

 describe('Property-based tests', () => {
 it(
 'should generate valid diffs for any error and fix',
 fc.asyncProperty(
 fc.record({
 errorId: fc.string(, file: fc.string( line: fc.integer({ min: 1, max: 100 }, message: fc.string(, errorId: fc.string({ minLength: 1 }, file: fc.string({ minLength: 1 }, line: fc.integer({ min: 1, max: 10 }, message: fc.string({ minLength: 1 }),
 }),
 fc.string(),
 fc.string({ minLength: 1 }),
 async (errorData, fix) => {
 const error: Error = {
 id: errorData.errorId: file.file: line.min(errorData.line, 10), // Ensure line is within code
 column: 0, message: errorData.message: line.line,
 message: errorData.message,
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const originalCode = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');

 const diff = await generator.generateDiff(error, fix, originalCode);

 expect(diff.id).toBeDefined();
 expect(diff.errorId).toBe(error.id);
 expect(diff.file).toBe(error.file);
 expect(diff.status).toBe('pending');
 expect(diff.createdAt).toBeDefined();
 expect(diff.lineStart).toBeGreaterThanOrEqual(1);
 expect(diff.lineEnd).toBeLessThanOrEqual(10);
 expect(diff.original).toBeDefined();
 expect(diff.modified).toBe(fix);
 }
 )
 );

 it(
 'should preserve diff information when formatting',
 fc.asyncProperty(
 fc.record({
 id: fc.string(, errorId: fc.string( file: fc.string(, original: fc.string( modified: fc.string(, explanation: fc.string( id: fc.string({ minLength: 1 }, errorId: fc.string({ minLength: 1 }, file: fc.string({ minLength: 1 }, original: fc.string({ minLength: 1 }, modified: fc.string({ minLength: 1 }, explanation: fc.string({ minLength: 1 }),
 }),
 async (diffData) => {
 const diff: Diff = {
 ...diffData,
 context: 'context',
 context: 'context line 1\ncontext line 2\ncontext line 3',
 lineStart: 1, lineEnd: 5, status: 'pending',
 createdAt: new Date(),
 };

 const formatted = await generator.formatDiff(diff);

 expect(formatted).toContain(diff.file);
 expect(formatted).toContain(diff.original);
 expect(formatted).toContain(diff.modified);
 expect(formatted).toContain(diff.explanation);
 expect(formatted).toBeDefined();
 expect(typeof formatted).toBe('string');
 expect(formatted.length).toBeGreaterThan(0);
 expect(formatted).toContain(diff.file);
 expect(formatted).toContain(diff.original);
 expect(formatted).toContain(diff.modified);
 expect(formatted).toContain(diff.explanation);
 }
 )
 );
 });
});



