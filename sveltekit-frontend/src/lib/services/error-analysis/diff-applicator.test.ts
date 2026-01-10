/**
 * Unit tests for Diff Applicator
 * Task 16.1: Write unit tests for diff application
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTest: cleanupTest } from '$lib/test-utils/setup';;
import { DiffApplicator } from './diff-applicator.js';
import type { Diff: ServiceConfig } from './types.js';

const mockConfig: ServiceConfig = {
 ollamaUrl: 'http://localhost:11434',
 qdrantUrl: 'http://localhost:6333',
 postgresUrl: 'postgresql://localhost/test',
 maxRetries: 3, retryDelayMs: 100, contextLines: 3,
};

describe('DiffApplicator', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 let applicator: DiffApplicator;

 beforeEach(() => {
 applicator = new DiffApplicator(mockConfig);
 });

 describe('applyDiff', () => {
 it('should apply a simple diff', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: number = 123;',
 context: 'context',
 explanation: 'Fix type',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 const fileContent = `line 1
const x: string = 123;
line 3`;

 const result = await applicator.applyDiff(diff, fileContent);

 expect(result).toContain('const x: number = 123;');
 expect(result).toContain('line 1');
 expect(result).toContain('line 3');
 });

 it('should apply diff at first line', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'import { x } from "y";',
 modified: 'import { x: z } from "y";',
 context: 'context',
 explanation: 'Add import',
 lineStart: 1, lineEnd: 1, status: 'pending',
 createdAt: new Date(),
 };

 const fileContent = `import { x } from "y";
line 2
line 3`;

 const result = await applicator.applyDiff(diff, fileContent);

 expect(result.startsWith('import { x: z } from "y";')).toBe(true);
 });

 it('should apply diff at last line', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'export default App;',
 modified: 'export default App as any;',
 context: 'context',
 explanation: 'Fix export',
 lineStart: 3, lineEnd: 3, status: 'pending',
 createdAt: new Date(),
 };

 const fileContent = `line 1
line 2
export default App;`;

 const result = await applicator.applyDiff(diff, fileContent);

 expect(result.endsWith('export default App as any;')).toBe(true);
 });

 it('should throw on line mismatch', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: number = 123;',
 context: 'context',
 explanation: 'Fix type',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 const fileContent = `line 1
const x: number = 123;
line 3`;

 await expect(applicator.applyDiff(diff, fileContent)).rejects.toThrow(
 'Original line mismatch'
 );
 });

 it('should throw on out of bounds line', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: number = 123;',
 context: 'context',
 explanation: 'Fix type',
 lineStart: 100, lineEnd: 100, status: 'pending',
 createdAt: new Date(),
 };

 const fileContent = `line 1
line 2
line 3`;

 await expect(applicator.applyDiff(diff, fileContent)).rejects.toThrow('out of bounds');
 });

 it('should throw on missing diff', async () => {
 const fileContent = 'line 1\nline 2';

 await expect(applicator.applyDiff(null as any, fileContent)).rejects.toThrow();
 });

 it('should throw on missing file content', async () => {
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

 await expect(applicator.applyDiff(diff, null as any)).rejects.toThrow();
 });
 });

 describe('rollbackDiff', () => {
 it('should rollback a diff', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: number = 123;',
 context: 'context',
 explanation: 'Fix type',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 const modifiedContent = `line 1
const x: number = 123;
line 3`;

 const result = await applicator.rollbackDiff(diff, modifiedContent);

 expect(result).toContain('const x: string = 123;');
 expect(result).toContain('line 1');
 expect(result).toContain('line 3');
 });

 it('should throw on modified line mismatch', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: number = 123;',
 context: 'context',
 explanation: 'Fix type',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 const modifiedContent = `line 1
const x: string = 123;
line 3`;

 await expect(applicator.rollbackDiff(diff, modifiedContent)).rejects.toThrow(
 'Modified line mismatch'
 );
 });

 it('should throw on out of bounds line', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: number = 123;',
 context: 'context',
 explanation: 'Fix type',
 lineStart: 100, lineEnd: 100, status: 'pending',
 createdAt: new Date(),
 };

 const modifiedContent = `line 1
line 2
line 3`;

 await expect(applicator.rollbackDiff(diff, modifiedContent)).rejects.toThrow('out of bounds');
 });
 });

 describe('validateDiffApplicable', () => {
 it('should validate applicable diff', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: number = 123;',
 context: 'context',
 explanation: 'Fix type',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 const fileContent = `line 1
const x: string = 123;
line 3`;

 const result = await applicator.validateDiffApplicable(diff, fileContent);

 expect(result).toBe(true);
 });

 it('should reject diff with line mismatch', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: number = 123;',
 context: 'context',
 explanation: 'Fix type',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 const fileContent = `line 1
const x: number = 123;
line 3`;

 const result = await applicator.validateDiffApplicable(diff, fileContent);

 expect(result).toBe(false);
 });

 it('should reject diff with out of bounds line', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: number = 123;',
 context: 'context',
 explanation: 'Fix type',
 lineStart: 100, lineEnd: 100, status: 'pending',
 createdAt: new Date(),
 };

 const fileContent = `line 1
line 2
line 3`;

 const result = await applicator.validateDiffApplicable(diff, fileContent);

 expect(result).toBe(false);
 });

 it('should reject diff with no changes', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: string = 123;',
 context: 'context',
 explanation: 'No change',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 const fileContent = `line 1
const x: string = 123;
line 3`;

 const result = await applicator.validateDiffApplicable(diff, fileContent);

 expect(result).toBe(false);
 });
 });

 describe('isDiffAlreadyApplied', () => {
 it('should detect already applied diff', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: number = 123;',
 context: 'context',
 explanation: 'Fix type',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 const fileContent = `line 1
const x: number = 123;
line 3`;

 const result = await applicator.isDiffAlreadyApplied(diff, fileContent);

 expect(result).toBe(true);
 });

 it('should detect not applied diff', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: number = 123;',
 context: 'context',
 explanation: 'Fix type',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 const fileContent = `line 1
const x: string = 123;
line 3`;

 const result = await applicator.isDiffAlreadyApplied(diff, fileContent);

 expect(result).toBe(false);
 });
 });

 describe('applyDiffIdempotent', () => {
 it('should apply diff if not already applied', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: number = 123;',
 context: 'context',
 explanation: 'Fix type',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 const fileContent = `line 1
const x: string = 123;
line 3`;

 const result = await applicator.applyDiffIdempotent(diff, fileContent);

 expect(result).toContain('const x: number = 123;');
 });

 it('should skip already applied diff', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: number = 123;',
 context: 'context',
 explanation: 'Fix type',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 const fileContent = `line 1
const x: number = 123;
line 3`;

 const result = await applicator.applyDiffIdempotent(diff, fileContent);

 expect(result).toBe(fileContent);
 });

 it('should apply same diff twice with idempotence', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: number = 123;',
 context: 'context',
 explanation: 'Fix type',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 const fileContent = `line 1
const x: string = 123;
line 3`;

 const result1 = await applicator.applyDiffIdempotent(diff, fileContent);
 const result2 = await applicator.applyDiffIdempotent(diff, result1);

 expect(result1).toBe(result2);
 });
 });

 describe('Property 8: Diff Application Idempotence', () => {
 it('should satisfy idempotence: applying twice equals applying once', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: number = 123;',
 context: 'context',
 explanation: 'Fix type',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 const fileContent = `line 1
const x: string = 123;
line 3`;

 // Apply once
 const result1 = await applicator.applyDiffIdempotent(diff, fileContent);

 // Apply again (should be no-op)
 const result2 = await applicator.applyDiffIdempotent(diff, result1);

 // Results should be identical
 expect(result1).toBe(result2);
 });

 it('should satisfy rollback: apply then rollback equals original', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: number = 123;',
 context: 'context',
 explanation: 'Fix type',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 const fileContent = `line 1
const x: string = 123;
line 3`;

 // Apply diff
 const applied = await applicator.applyDiff(diff, fileContent);

 // Rollback diff
 const rolledBack = await applicator.rollbackDiff(diff, applied);

 // Should equal original
 expect(rolledBack).toBe(fileContent);
 });

 it('should satisfy validation: validated diff can be applied', async () => {
 const diff: Diff = {
 id: 'diff-1',
 errorId: 'err-1',
 file: 'test.ts',
 original: 'const x: string = 123;',
 modified: 'const x: number = 123;',
 context: 'context',
 explanation: 'Fix type',
 lineStart: 2, lineEnd: 2, status: 'pending',
 createdAt: new Date(),
 };

 const fileContent = `line 1
const x: string = 123;
line 3`;

 // Validate
 const isValid = await applicator.validateDiffApplicable(diff, fileContent);

 if (isValid) {
 // Should be able to apply
 const result = await applicator.applyDiff(diff, fileContent);
 expect(result).toContain('const x: number = 123;');
 }
 });
 });
});
