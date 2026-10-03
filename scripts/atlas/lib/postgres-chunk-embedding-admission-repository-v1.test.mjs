import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresChunkEmbeddingAdmissionRepositoryV1 } from './postgres-chunk-embedding-admission-repository-v1.mjs';
import { admitCanonicalChunkEmbeddingV1, sealEmbeddingPlanV1, halfVectorDigestV1, EMBEDDING_PLAN_SCHEMA_V1 } from './canonical-chunk-embedding-admission-v1.mjs';
import { createHash } from 'node:crypto';

const sha = (v) => `sha256:${createHash('sha256').update(v, 'utf8').digest('hex')}`;
const H = (c) => `sha256:${c.repeat(64)}`;
const content = 'export const a = 1;';

function fakePool({ slot = null, bindingRows = 1, lineageRows = 1 } = {}) {
  const log = []; let stored = null;
  const client = {
    async query(sql, params) {
      const s = sql.replace(/\s+/g, ' ').trim(); log.push(s.startsWith('UPDATE public') ? 'WRITE' : s.split(' ').slice(0, 2).join(' '));
      if (/^BEGIN|^COMMIT|^ROLLBACK/.test(s)) return { rows: [], rowCount: 0 };
      if (s.includes('FROM public.codebase_chunk_index WHERE id = $1::uuid FOR UPDATE') && s.includes('content_embedding::text')) return { rows: [{ contentEmbedding: slot }], rowCount: 1 };
      if (s.includes('FROM public.codebase_chunk_index WHERE id = $1::uuid FOR UPDATE')) return { rows: [{ chunkRowId: 'row-a', chunkId: 'chunk-a', sourceRef: 'src/a.ts', content, summaryText: null, summaryProvenance: null }], rowCount: 1 };
      if (s.includes('atlas_workspace_source_bindings')) { assert.equal(params[0], 'deeds-web-app'); const r = { workspaceRevision: H('2'), sourceRevision: H('1'), contentDigest: '3'.repeat(64) }; return { rows: Array(bindingRows).fill(r), rowCount: bindingRows }; }
      if (s.includes('atlas_packet_chunk_lineage')) return { rows: Array(lineageRows).fill({ canonicalChunkId: 'canon-a' }), rowCount: lineageRows };
      if (s.startsWith('UPDATE public')) { assert.ok(s.includes('content_embedding IS NULL')); stored = params; return { rows: [{ id: 'row-a' }], rowCount: 1 }; }
      if (s.includes('AS v')) return { rows: [{ v: stored[1], model: stored[2], version: stored[3], dimension: 768 }], rowCount: 1 };
      throw new Error('unexpected sql ' + s);
    }, release() { log.push('RELEASE'); },
  };
  return { log, async connect() { return client; } };
}
const vec = () => { const v = new Array(768).fill(0); v[0] = 1; return v; };
const plan = () => { const vector = vec(); return sealEmbeddingPlanV1({
  schema: EMBEDDING_PLAN_SCHEMA_V1, chunkRowId: 'row-a', chunkId: 'chunk-a', canonicalChunkId: 'canon-a', sourceRef: 'src/a.ts',
  sourceRevision: H('1'), workspaceRevision: H('2'), sourceFileSha256: H('3'), inputKind: 'SOURCE_CONTENT', inputSha256: sha(content),
  inputPolicy: { formatterRevision: 'f', inputPolicyRevision: 'i', promptRevision: 'p', role: 'document', maxInputTokens: 2048 },
  executor: { modelId: 'embeddinggemma', upstreamRevision: 'r', ggufSha256: H('5'), tokenizerSha256: H('6'), runtime: 'llama.cpp', executionProfileRevision: 'e', dimensions: 768, capability: { kind: 'CANONICAL_CAPABILITY_RECEIPT', receiptChecksum: H('7') } },
  vectorDigest: halfVectorDigestV1(vector), vector }); };

test('kernel + adapter admit end to end against a fake client (text repo id, no mirror columns, readback)', async () => {
  const pool = fakePool();
  const out = await admitCanonicalChunkEmbeddingV1({ plan: plan(), repository: createPostgresChunkEmbeddingAdmissionRepositoryV1({ pool, repoId: 'deeds-web-app' }) });
  assert.equal(out.status, 'ADMITTED');
  assert.equal(pool.log[0], 'BEGIN ISOLATION'); assert.ok(pool.log.includes('COMMIT')); assert.equal(pool.log.at(-1), 'RELEASE');
});
test('occupied slot and ambiguous lineage never reach the UPDATE', async () => {
  for (const [opts, status] of [[{ slot: '[1]' }, 'ALREADY_PRESENT'], [{ lineageRows: 2 }, 'BLOCKED_LINEAGE_MISSING'], [{ bindingRows: 0 }, 'BLOCKED_LINEAGE_MISSING']]) {
    const pool = fakePool(opts);
    const out = await admitCanonicalChunkEmbeddingV1({ plan: plan(), repository: createPostgresChunkEmbeddingAdmissionRepositoryV1({ pool, repoId: 'deeds-web-app' }) });
    assert.equal(out.status, status); assert.ok(!pool.log.includes('WRITE'));
  }
});
test('requires injected pool and repo id', () => {
  assert.throws(() => createPostgresChunkEmbeddingAdmissionRepositoryV1({ repoId: 'x' }), /POOL/);
  assert.throws(() => createPostgresChunkEmbeddingAdmissionRepositoryV1({ pool: { connect() {} } }), /REPO_ID/);
});
