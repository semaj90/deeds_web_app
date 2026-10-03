import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'train-autoencoder-768-64.mjs');

test('retired AE entrypoint reports the current candidate without service access', () => {
  const result = spawnSync(process.execPath, [script, '--dry-run'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.encoderDimensions, [768, 512, 256, 128]);
  assert.equal(report.outputs.latent_128.origin, 'LEARNED_BOTTLENECK');
  assert.equal(report.outputs.latent_64.origin, 'RENORMALIZED_PREFIX_OF_LATENT_128');
  assert.equal(report.storageContract.postgres.canonicalInput, 'codebase_chunk_index.content_embedding_768 vector(768)');
  assert.equal(report.storageContract.qdrant.upsert, 'BLOCKED_UNTIL_INPUT_LINEAGE_TRAINING_RECEIPT_AND_POSTGRES_READBACK_PASS');
  assert.equal(report.networkAccess, false);
  assert.equal(report.writes.qdrant, false);
});

test('retired AE entrypoint refuses training without reaching historical code', () => {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(result.status, 78);
  const report = JSON.parse(result.stderr);
  assert.equal(report.status, 'TRAINING_BLOCKED');
  assert.equal(report.databaseRead, false);
  assert.equal(report.networkAccess, false);
});
