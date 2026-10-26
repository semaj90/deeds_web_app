import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { filterBoundedTocSources, buildTocSkipReceipt } from './document-governance-source-bounds-v1.mjs';

test('TOC source bounds skip oversized artifacts and retain bounded sources', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-toc-bounds-'));
  try {
    const boundedPath = join(root, 'small.md');
    const oversizedPath = join(root, 'large.md');
    writeFileSync(boundedPath, 'ok');
    writeFileSync(oversizedPath, '123456789');

    const result = filterBoundedTocSources([boundedPath, oversizedPath], root, 8);
    assert.deepEqual(result.included, [boundedPath]);
    assert.deepEqual(result.skipped, [{
      path: 'large.md',
      sizeBytes: 9,
      maxBytes: 8,
      reason: 'EXCEEDS_MAX_TOC_SOURCE_BYTES',
    }]);

    const receipt = buildTocSkipReceipt(result.skipped, 2, 8);
    assert.equal(receipt.schema, 'atlas.toc-oversized-source-skips.v1');
    assert.equal(receipt.configuredMaxBytes, 8);
    assert.equal(receipt.summary.totalCandidates, 2);
    assert.equal(receipt.summary.includedCount, 1);
    assert.equal(receipt.summary.skippedCount, 1);
    assert.equal(receipt.skips.length, 1);
    assert.equal(receipt.skips[0].sourcePath, 'large.md');
    assert.equal(receipt.skips[0].byteSize, 9);
    assert.equal(receipt.skips[0].reason, 'EXCEEDS_MAX_TOC_SOURCE_BYTES');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
