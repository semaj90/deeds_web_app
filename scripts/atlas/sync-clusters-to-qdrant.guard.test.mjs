import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../sync-clusters-to-qdrant.mts', import.meta.url), 'utf8');

test('legacy 384-D cluster sync is disabled before its writer is invoked', () => {
  assert.match(source, /LEGACY_ERROR_CLUSTER_QDRANT_SYNC_DISABLED/);
  assert.match(source, /process\.exitCode\s*=\s*78/);
  assert.doesNotMatch(source, /\bsync\(\)\.catch\s*\(/);
});
