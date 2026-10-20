import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEmbedServerConfig } from './embed-server-config.mjs';

test('defaults to CPU and matches the physical batch to context', () => {
  assert.deepEqual(resolveEmbedServerConfig({}), {
    context: 2048,
    batch: 2048,
    microBatch: 2048,
    gpuLayers: 0,
  });
});

test('preserves an explicitly selected GPU layer count', () => {
  assert.equal(resolveEmbedServerConfig({ EMBED_SERVER_NGL: '12' }).gpuLayers, 12);
});

test('rejects mismatched logical and physical batches', () => {
  assert.throws(
    () => resolveEmbedServerConfig({ EMBED_BATCH_SIZE: '512', EMBED_UBATCH_SIZE: '64' }),
    /EMBED_BATCH_SIZE_MUST_MATCH_EMBED_UBATCH_SIZE/,
  );
});

test('rejects batch sizes that undercut the advertised context', () => {
  assert.throws(
    () => resolveEmbedServerConfig({ EMBED_SERVER_CTX: '1024', EMBED_BATCH_SIZE: '512', EMBED_UBATCH_SIZE: '512' }),
    /EMBED_BATCH_SIZE_MUST_COVER_EMBED_SERVER_CTX/,
  );
});

test('rejects invalid configuration values', () => {
  assert.throws(
    () => resolveEmbedServerConfig({ EMBED_SERVER_NGL: '-1' }),
    /EMBED_SERVER_CONFIG_VALUES_OUT_OF_RANGE/,
  );
  assert.throws(
    () => resolveEmbedServerConfig({ EMBED_BATCH_SIZE: '512tokens' }),
    /EMBED_SERVER_CONFIG_VALUES_MUST_BE_INTEGERS/,
  );
});
