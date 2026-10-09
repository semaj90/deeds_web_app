import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(here, 'atlas-qdrant-projection-worker.mjs');
const source = readFileSync(workerPath, 'utf8');

test('legacy 384-D Qdrant worker refuses startup before database or queue setup', () => {
  const result = spawnSync(process.execPath, [workerPath], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /LEGACY_384_QDRANT_PROJECTION_DISABLED/);
  assert.ok(source.indexOf('LEGACY_384_QDRANT_PROJECTION_DISABLED') < source.indexOf('new pg.Pool'));
  assert.ok(source.indexOf('LEGACY_384_QDRANT_PROJECTION_DISABLED') < source.indexOf('CREATE TABLE IF NOT EXISTS'));
});
