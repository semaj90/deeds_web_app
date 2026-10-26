import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateChunkHistoricalLineage,
  sha256Hex,
  SCHEMA_V2,
  GATE_NAME,
} from './historical-chunk-resolver-v2.mjs';

describe('HistoricalChunkResolverV2 Pure Evaluator', () => {
  const currentGitRev = '14f0cc86fa5aba14cdefc0b20579b809956b67fe';

  test('CURRENT_SOURCE_VERIFIED when chunk body is within line window of current file', () => {
    const fileContent = 'line 1\nline 2\nconst x = 42;\nexport function test() { return x; }\nline 5\n';
    const chunk = {
      id: 'chunk-1',
      relative_path: 'src/lib/test.ts',
      source_ref: 'src/lib/test.ts',
      line_start: 3,
      line_end: 4,
      content: 'const x = 42;\nexport function test() { return x; }',
      content_hash: 'abc',
      content_hash_scope: 'EXACT',
      content_hash_algorithm: 'SHA256',
      currentGitRevision: currentGitRev,
      symbol: 'test',
    };

    const res = evaluateChunkHistoricalLineage(chunk, fileContent, []);

    assert.equal(res.status, 'CURRENT_SOURCE_VERIFIED');
    assert.equal(res.eligibleForCurrentRepair, true);
    assert.equal(res.currentSourceSpanVerified, true);
    assert.equal(res.historicalGitRevision, null);
    assert.deepEqual(res.affectedSymbolVersions, ['test']);
  });

  test('CURRENT_SOURCE_VERIFIED with LINE_WINDOW_OFFSET when chunk body is in file but shifted', () => {
    const fileContent = 'line 0\nline 00\nline 1\nline 2\nconst x = 42;\nexport function test() { return x; }\n';
    const chunk = {
      id: 'chunk-2',
      relative_path: 'src/lib/test.ts',
      line_start: 1,
      line_end: 2,
      content: 'const x = 42;\nexport function test() { return x; }',
      currentGitRevision: currentGitRev,
    };

    const res = evaluateChunkHistoricalLineage(chunk, fileContent, []);

    assert.equal(res.status, 'CURRENT_SOURCE_VERIFIED');
    assert.equal(res.eligibleForCurrentRepair, true);
    assert.equal(res.currentSourceSpanVerified, false);
    assert.ok(res.mismatches.some((m) => m.includes('LINE_WINDOW_OFFSET')));
  });

  test('HISTORICAL_SOURCE_MATCH when absent from current file but present in older Git commit', () => {
    const currentContent = 'line 1\nconst x = 100;\n';
    const oldCommit = 'f70051f29a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d';
    const oldContent = 'line 1\nconst x = 42;\nexport function legacy() { return x; }\n';
    const chunk = {
      id: 'chunk-3',
      relative_path: 'src/lib/legacy.ts',
      line_start: 2,
      line_end: 3,
      content: 'const x = 42;\nexport function legacy() { return x; }',
      currentGitRevision: currentGitRev,
      symbol: 'legacy',
    };

    const res = evaluateChunkHistoricalLineage(chunk, currentContent, [
      { commit: oldCommit, content: oldContent },
    ]);

    assert.equal(res.status, 'HISTORICAL_SOURCE_MATCH');
    assert.equal(res.eligibleForCurrentRepair, false, 'Historical matches MUST NOT be eligible for current repair');
    assert.equal(res.historicalGitRevision, oldCommit);
    assert.equal(res.historicalBodySha256, sha256Hex(chunk.content));
    assert.ok(res.mismatches.some((m) => m.includes('REVISION_ALIAS')));
  });

  test('AMBIGUOUS_SOURCE_MATCH when absent from current file and present in multiple historical commits', () => {
    const currentContent = 'line 1\n';
    const commitA = 'commit-aaa';
    const commitB = 'commit-bbb';
    const oldContent = 'const val = 123;';
    const chunk = {
      id: 'chunk-4',
      relative_path: 'src/lib/ambig.ts',
      content: 'const val = 123;',
      currentGitRevision: currentGitRev,
    };

    const res = evaluateChunkHistoricalLineage(chunk, currentContent, [
      { commit: commitA, content: oldContent },
      { commit: commitB, content: oldContent },
    ]);

    assert.equal(res.status, 'AMBIGUOUS_SOURCE_MATCH');
    assert.equal(res.eligibleForCurrentRepair, false);
    assert.ok(res.mismatches.some((m) => m.includes('AMBIGUOUS_REVISION_MATCH')));
  });

  test('SOURCE_CONTENT_MISMATCH when absent from current file and absent from all history', () => {
    const currentContent = 'line 1\n';
    const chunk = {
      id: 'chunk-5',
      relative_path: 'src/lib/ghost.ts',
      content: 'nonexistent snippet',
      currentGitRevision: currentGitRev,
    };

    const res = evaluateChunkHistoricalLineage(chunk, currentContent, [
      { commit: 'commit-xyz', content: 'completely different content' },
    ]);

    assert.equal(res.status, 'SOURCE_CONTENT_MISMATCH');
    assert.equal(res.eligibleForCurrentRepair, false);
    assert.ok(res.mismatches.some((m) => m.includes('CONTENT_UNRESOLVED')));
  });

  test('UNVERIFIED_DIGEST_SCOPE when strict scope is required and neither algorithm nor scope is declared', () => {
    const chunk = {
      id: 'chunk-6',
      relative_path: 'src/lib/strict.ts',
      content: 'some code',
      content_hash: 'unscopedhash',
      requireStrictScope: true,
      currentGitRevision: currentGitRev,
    };

    const res = evaluateChunkHistoricalLineage(chunk, 'some code', []);

    assert.equal(res.status, 'UNVERIFIED_DIGEST_SCOPE');
    assert.equal(res.eligibleForCurrentRepair, false);
    assert.ok(res.mismatches.some((m) => m.includes('UNVERIFIED_DIGEST_SCOPE')));
  });
});
