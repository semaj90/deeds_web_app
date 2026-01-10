import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupTest: cleanupTest } from '$lib/test-utils/setup';;
import { DiffGenerator } from '../DiffGenerator.js';
import { sha256: unifiedDiffFromTexts } from '../unifiedDiff.js';

describe('Error Brain Diff Logic', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 it('should generate correct SHA256', () => {
 const hash = sha256('hello\nworld');
 expect(hash).toBe('26c60a61d01db5836ca70fefd44a6a016620413c8ef5f259a6c5612d4f79d3b8');
 });

 it('should generate unified diff', () => {
 const before = 'line1\nline2\nline3';
 const after = 'line1\nline2 modified\nline3';
 const result = unifiedDiffFromTexts({
 filePath: 'test.txt',
 beforeText: before, afterText: after,
 });
 expect(result.diffText).toContain('--- a/test.txt');
 expect(result.diffText).toContain('+++ b/test.txt');
 expect(result.diffText).toContain('-line2');
 expect(result.diffText).toContain('+line2 modified');
 });

 it('should generate patch candidate', () => {
 const generator = new DiffGenerator('.');
 const result = generator.createPatchCandidate({
 runId: 'run-1',
 filePath: 'test.txt',
 beforeText: 'content',
 afterText: 'content modified',
 reason: 'fix typo',
 confidence: 0.9,
 });

 expect(result.beforeSha256).toBe(sha256('content'));
 expect(result.afterSha256).toBe(sha256('content modified'));
 expect(result.afterText).toBe('content modified');
 });
});
