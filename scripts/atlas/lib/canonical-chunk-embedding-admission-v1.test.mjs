import test from 'node:test';
import assert from 'node:assert/strict';
import {
  admitCanonicalChunkEmbeddingV1, sealEmbeddingPlanV1, halfVectorDigestV1, halfBits, EMBEDDING_PLAN_SCHEMA_V1,
} from './canonical-chunk-embedding-admission-v1.mjs';

const H = (c) => `sha256:${c.repeat(64)}`;
const unit = () => { const v = new Array(768).fill(0); v[0] = 1; return v; };

const cur = {
  chunkRowId: 'row-a', chunkId: 'chunk-a', canonicalChunkId: 'canon-a', sourceRef: 'src/a.ts',
  sourceRevision: H('1'), workspaceRevision: H('2'), sourceFileSha256: H('3'), contentSha256: H('4'),
  revisionStatus: 'PROVEN', bindingStatus: 'PROVEN', bindingMatchCount: 1, lineageMatchCount: 1,
  summaryText: null, summaryProvenance: null, summaryDigestRecomputed: null,
};
const executor = {
  modelId: 'embeddinggemma', upstreamRevision: 'rev-1', ggufSha256: H('5'), tokenizerSha256: H('6'),
  runtime: 'llama.cpp', executionProfileRevision: 'p1', dimensions: 768,
  capability: { kind: 'CANONICAL_CAPABILITY_RECEIPT', receiptChecksum: H('7') },
};
const plan = (over = {}) => {
  const vector = unit();
  return sealEmbeddingPlanV1({
    schema: EMBEDDING_PLAN_SCHEMA_V1, chunkRowId: 'row-a', chunkId: 'chunk-a', canonicalChunkId: 'canon-a', sourceRef: 'src/a.ts',
    sourceRevision: H('1'), workspaceRevision: H('2'), sourceFileSha256: H('3'),
    inputKind: 'SOURCE_CONTENT', inputSha256: H('4'),
    inputPolicy: { formatterRevision: 'f1', inputPolicyRevision: 'i1', promptRevision: 'p1', role: 'document', maxInputTokens: 2048 },
    executor, vectorDigest: halfVectorDigestV1(vector), vector, ...over,
  });
};

function repo({ current = cur, target = { contentEmbedding: null }, rowCount = 1, tamper = null } = {}) {
  const events = [];
  let stored = null;
  return {
    events,
    async transaction(run) {
      events.push('BEGIN');
      try {
        const out = await run({
          async getAdmissionEvidence() { events.push('EVIDENCE'); return current; },
          async readTarget() { events.push('TARGET'); return target; },
          async setEmbeddingIfEmpty(i) { events.push('WRITE'); stored = i; return { rowCount }; },
          async readBackEmbedding() { events.push('READBACK'); const b = { vector: stored.vector, model: stored.model, version: stored.version, dimension: 768 }; return tamper ? tamper(b) : b; },
        });
        events.push('COMMIT'); return out;
      } catch (e) { events.push('ROLLBACK'); throw e; }
    },
  };
}

test('half rounding is deterministic and detects a changed value', () => {
  assert.equal(halfBits(1), 0x3c00);
  assert.equal(halfBits(-2), 0xc000);
  const a = unit(); const b = unit(); b[1] = 0.01;
  assert.notEqual(halfVectorDigestV1(a), halfVectorDigestV1(b));
});

test('admits exact-lineage plan: ordered evidence, empty-slot write, readback, commit', async () => {
  const r = repo();
  const out = await admitCanonicalChunkEmbeddingV1({ plan: plan(), repository: r });
  assert.equal(out.status, 'ADMITTED');
  assert.deepEqual(r.events, ['BEGIN', 'EVIDENCE', 'TARGET', 'WRITE', 'READBACK', 'COMMIT']);
});

test('idempotent: a second run finds the slot occupied and writes nothing', async () => {
  const r = repo({ target: { contentEmbedding: [1] } });
  const out = await admitCanonicalChunkEmbeddingV1({ plan: plan(), repository: r });
  assert.equal(out.status, 'ALREADY_PRESENT');
  assert.ok(!r.events.includes('WRITE'));
});

test('gate 02: identity change, ambiguous lineage, and stale file digest block before any write', async () => {
  for (const [c, status] of [
    [{ ...cur, sourceRevision: H('9') }, 'BLOCKED_IDENTITY_CHANGED'],
    [{ ...cur, lineageMatchCount: 2 }, 'BLOCKED_LINEAGE_MISSING'],
    [{ ...cur, bindingStatus: 'MISSING' }, 'BLOCKED_LINEAGE_MISSING'],
    [{ ...cur, sourceFileSha256: H('9') }, 'BLOCKED_STALE_DIGEST'],
  ]) {
    const r = repo({ current: c });
    assert.equal((await admitCanonicalChunkEmbeddingV1({ plan: plan(), repository: r })).status, status);
    assert.ok(!r.events.includes('WRITE'));
  }
});

test('gate 03: stale input, legacy summary, unadmitted summary, and unbound policy are blocked', async () => {
  assert.equal((await admitCanonicalChunkEmbeddingV1({ plan: plan(), repository: repo({ current: { ...cur, contentSha256: H('9') } }) })).status, 'BLOCKED_STALE_DIGEST');
  assert.equal((await admitCanonicalChunkEmbeddingV1({ plan: plan({ inputKind: 'LEGACY_SUMMARY' }), repository: repo() })).status, 'BLOCKED_INPUT_KIND');
  assert.equal((await admitCanonicalChunkEmbeddingV1({ plan: plan({ inputKind: 'ADMITTED_SUMMARY', summaryDigest: H('a') }), repository: repo({ current: { ...cur, summaryText: 'legacy', summaryProvenance: null } }) })).status, 'BLOCKED_NO_ADMITTED_SUMMARY');
  assert.equal((await admitCanonicalChunkEmbeddingV1({ plan: plan({ inputPolicy: { formatterRevision: 'f1' } }), repository: repo() })).status, 'BLOCKED_INPUT_POLICY_UNBOUND');
  const ok = { ...cur, summaryText: 's', summaryDigestRecomputed: H('a'), summaryProvenance: { admission: { status: 'ADMITTED' }, sourceRevision: cur.sourceRevision, workspaceRevision: cur.workspaceRevision, summaryDigest: H('a') } };
  assert.equal((await admitCanonicalChunkEmbeddingV1({ plan: plan({ inputKind: 'ADMITTED_SUMMARY', summaryDigest: H('a') }), repository: repo({ current: { ...ok, summaryInputSha256: H('b') } }) })).status, 'BLOCKED_STALE_DIGEST'); // input digest is content digest, not the formatted summary
  assert.equal((await admitCanonicalChunkEmbeddingV1({ plan: plan({ inputKind: 'ADMITTED_SUMMARY', summaryDigest: H('a'), inputSha256: H('b') }), repository: repo({ current: { ...ok, summaryInputSha256: H('b') } }) })).status, 'ADMITTED');
});

test('gate 04: missing immutable identity, :latest tag, or missing receipt blocks', async () => {
  for (const e of [
    { ...executor, upstreamRevision: '' },
    { ...executor, ggufSha256: 'x' },
    { ...executor, modelId: 'embeddinggemma:latest', ggufSha256: undefined },
    { ...executor, capability: undefined },
    { ...executor, capability: { kind: 'MEASURED_PARITY_RECEIPT', receiptChecksum: H('7'), minCosine: 0.9 } },
  ]) {
    const out = await admitCanonicalChunkEmbeddingV1({ plan: plan({ executor: e }), repository: repo() });
    assert.equal(out.status, 'BLOCKED_EXECUTOR_IDENTITY');
  }
  const parity = { ...executor, capability: { kind: 'MEASURED_PARITY_RECEIPT', receiptChecksum: H('7'), minCosine: 0.9995 } };
  assert.equal((await admitCanonicalChunkEmbeddingV1({ plan: plan({ executor: parity }), repository: repo() })).status, 'ADMITTED');
});

test('tampered plan, wrong-shape vector, and vector digest mismatch are blocked', async () => {
  const p = plan(); p.chunkRowId = 'row-z';
  assert.equal((await admitCanonicalChunkEmbeddingV1({ plan: p, repository: repo() })).status, 'BLOCKED_STALE_DIGEST');
  assert.equal((await admitCanonicalChunkEmbeddingV1({ plan: plan({ vector: [1, 0] }), repository: repo() })).status, 'BLOCKED_VECTOR');
  const q = plan(); q.vector = unit(); q.vector[1] = 0.001;
  assert.equal((await admitCanonicalChunkEmbeddingV1({ plan: q, repository: repo() })).status, 'BLOCKED_STALE_DIGEST');
});

test('concurrent writer wins the slot: conditional update matches 0 rows, nothing committed as admitted', async () => {
  const out = await admitCanonicalChunkEmbeddingV1({ plan: plan(), repository: repo({ rowCount: 0 }) });
  assert.equal(out.status, 'WRITE_RACE_OR_STALE_TARGET');
});

test('readback mismatch throws and rolls back the transaction', async () => {
  for (const tamper of [
    (b) => ({ ...b, vector: b.vector.map((v, i) => (i === 5 ? 0.5 : v)) }),
    (b) => ({ ...b, model: 'other' }),
    (b) => ({ ...b, version: 'sha256:x' }),
    () => null,
  ]) {
    const r = repo({ tamper });
    await assert.rejects(admitCanonicalChunkEmbeddingV1({ plan: plan(), repository: r }), /EMBEDDING_READBACK_VERIFICATION_FAILED/);
    assert.equal(r.events.at(-1), 'ROLLBACK');
  }
});
