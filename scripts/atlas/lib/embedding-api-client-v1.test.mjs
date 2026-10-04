import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertEmbeddingApiConfiguredForApplyV1,
  requestEmbeddingV1,
  resolveEmbeddingApiBaseUrlV1,
} from './embedding-api-client-v1.mjs';

test('resolves only configured application URLs for canonical embedding', () => {
  assert.equal(resolveEmbeddingApiBaseUrlV1({ SELF_URL: 'https://app.example.test/base' }), 'https://app.example.test');
  assert.equal(resolveEmbeddingApiBaseUrlV1({}), null);
  assert.throws(() => resolveEmbeddingApiBaseUrlV1({ EMBEDDING_API_URL: 'file:///tmp/app' }), {
    message: 'INVALID_EMBEDDING_API_BASE_URL',
  });
});

test('requires the embedding API before mutating Qdrant-backed apply runs', () => {
  assert.throws(() => assertEmbeddingApiConfiguredForApplyV1({ apply: true, noQdrant: false, baseUrl: null }), {
    message: 'EMBEDDING_API_BASE_URL_REQUIRED_FOR_QDRANT_APPLY',
  });
  assert.doesNotThrow(() => assertEmbeddingApiConfiguredForApplyV1({ apply: false, noQdrant: false, baseUrl: null }));
  assert.doesNotThrow(() => assertEmbeddingApiConfiguredForApplyV1({ apply: true, noQdrant: true, baseUrl: null }));
});

test('manifest builder uses the canonical API before database mutation', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../build-mcp-tool-manifest-packets.mjs'), 'utf8');
  assert.doesNotMatch(source, /\/api\/embeddings/);
  assert.match(source, /mode: 'unprompted_legacy'/);
  assert.match(source, /embedding_input_recipe: embedded\.inputRecipe/);
  assert.ok(source.indexOf('assertEmbeddingApiConfiguredForApplyV1({') < source.indexOf('new pg.Pool('));
});

const vector = Array.from({ length: 768 }, () => 0.25);

test('posts explicit legacy mode to the canonical API and returns the recipe receipt', async () => {
  let request;
  const result = await requestEmbeddingV1({
    baseUrl: 'https://app.example.test/base',
    text: 'raw corpus text',
    fetchImpl: async (url, init) => {
      request = { url: String(url), init };
      return Response.json({
        embedding: vector,
        inputRecipe: {
          mode: 'unprompted_legacy',
          promptRevision: 'unprompted-v0',
          sourceTextDigest: 'a'.repeat(64),
          formattedInputChecksum: 'b'.repeat(64),
        },
      });
    },
  });

  assert.equal(request.url, 'https://app.example.test/api/embed');
  assert.deepEqual(JSON.parse(request.init.body), { text: 'raw corpus text', taskMode: 'unprompted_legacy' });
  assert.equal(result.embedding.length, 768);
  assert.equal(result.inputRecipe.promptRevision, 'unprompted-v0');
});

test('rejects mismatched recipe receipts and malformed vectors', async () => {
  const fetchImpl = async () => Response.json({
    embedding: [0, 1],
    inputRecipe: { mode: 'retrieval_query', promptRevision: 'wrong' },
  });
  await assert.rejects(requestEmbeddingV1({ baseUrl: 'https://app.example.test', text: 'x', fetchImpl }), {
    message: 'EMBEDDING_API_RECIPE_RECEIPT_MISMATCH',
  });

  const vectorFetch = async () => Response.json({
    embedding: [0, 1],
    inputRecipe: { mode: 'unprompted_legacy', promptRevision: 'unprompted-v0' },
  });
  await assert.rejects(requestEmbeddingV1({ baseUrl: 'https://app.example.test', text: 'x', fetchImpl: vectorFetch }), {
    message: 'EMBEDDING_API_VECTOR_INVALID',
  });
});
