import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(here, 'backfill-content-embedding-384.mjs');
const source = readFileSync(scriptPath, 'utf8');

test('legacy 384-D apply mode fails before connecting to Postgres', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--apply'], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /LEGACY_384_WRITE_DISABLED/);
});

test('legacy 384-D write SQL is absent from the retired backfill script', () => {
  assert.doesNotMatch(source, /UPDATE\s+codebase_chunk_index/i);
  assert.doesNotMatch(source, /content_embedding_384\s*=\s*data\.vec/i);
});
