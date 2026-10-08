import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.join(here, 'create-qdrant-codebase-384.mjs');
const restorePath = path.join(here, 'restore-qdrant-384-from-postgres.mjs');

test('retired 384-D Qdrant collection creation exits before contacting Qdrant', () => {
  const source = readFileSync(collectionPath, 'utf8');
  const result = spawnSync(process.execPath, [collectionPath], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /LEGACY_384_QDRANT_COLLECTION_DISABLED/);
  assert.ok(source.indexOf('LEGACY_384_QDRANT_COLLECTION_DISABLED') < source.indexOf('fetch('));
  assert.match(source, /canonical persisted retrieval uses semantic_768/i);
});

test('retired 384-D restore apply exits before opening Postgres or contacting Qdrant', () => {
  const source = readFileSync(restorePath, 'utf8');
  const result = spawnSync(process.execPath, [restorePath, '--apply'], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /LEGACY_384_QDRANT_RESTORE_DISABLED/);
  assert.ok(source.indexOf('LEGACY_384_QDRANT_RESTORE_DISABLED') < source.indexOf('new pg.Pool'));
  assert.ok(source.indexOf('LEGACY_384_QDRANT_RESTORE_DISABLED') < source.indexOf('fetch('));
});
