import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { compileSummaryRoutingPayloadV1, projectSummaryEmbeddingJobV1, type SummaryRoutingCompileInputV1, type SummaryRoutingPayloadV1 } from './summary-routing-payload-v1.js';
import { processSummaryEmbeddingJobV1, type EmbeddingRuntimeResultV1, type SummaryEmbeddingConsumerDepsV1 } from './summary-embedding-consumer-v1.js';
import { SummaryEmbeddingReceiptV1Schema, vectorDigestV1 } from './summary-embedding-receipt-v1.js';

const sha = (t: string) => `sha256:${createHash('sha256').update(t, 'utf8').digest('hex')}`;
const TEXT = 'Validates the session token and returns the authenticated user record.';
const identity = { chunkRowId: '11111111-1111-4111-8111-111111111111', canonicalChunkId: 'canon:1', packetKey: 'packet:1', sourceRef: 'src/a.ts', sourceRevision: 'sha256:aa', workspaceRevision: 'sha256:ws', bindingChecksum: 'bind:1', candidateOrdinal: null };
const goodProv = (over = {}) => ({ sourceRevision: 'sha256:aa', workspaceRevision: 'sha256:ws', summaryDigest: sha(TEXT), modelId: 'ornith', admission: { status: 'ADMITTED' }, ...over });
const input = (over: Partial<SummaryRoutingCompileInputV1> = {}, idOver = {}): SummaryRoutingCompileInputV1 => ({
  identity: { ...identity, ...idOver }, summaryText: TEXT, summaryProvenance: goodProv(), legacyChunkSummary: null, packetSummary: null, layerSummary: null,
  summaryEmbeddingPresent: false, summaryEmbeddingMeta: null, summaryEmbedding384Present: false, routing: {}, ...over,
});
const payload = (over: Partial<SummaryRoutingCompileInputV1> = {}, idOver = {}) => compileSummaryRoutingPayloadV1(input(over, idOver));
const job = () => projectSummaryEmbeddingJobV1(payload(), 'producer:r1')!;

function unit(dim = 768): Float32Array { const v = new Float32Array(dim); v.fill(1 / Math.sqrt(dim)); return v; }
const runtime = (over: Partial<EmbeddingRuntimeResultV1> = {}): EmbeddingRuntimeResultV1 => ({
  executorId: 'OLLAMA', representationId: 'semantic_768', representationRevision: 'rep-1', modelRevision: 'model-1', tokenizerRevision: 'tok-1', promptRevision: null,
  dimension: 768, normalized: true, vector: unit(), outputChecksum: sha('out'), ...over,
});

function harness(o: { current?: () => SummaryRoutingPayloadV1; text?: string; embed?: () => Promise<EmbeddingRuntimeResultV1>; writeStatus?: 'WRITTEN' | 'LOST_RACE'; readback?: 'faithful' | 'wrong' | 'absent' | 'race-same'; repoDown?: boolean } = {}) {
  const calls = { embed: 0, write: 0, reread: 0 };
  let stored: { vectorDigest: string; summaryDigest: string; representationRevision: string } | null = null;
  const deps: SummaryEmbeddingConsumerDepsV1 = {
    repository: {
      async rereadRoutingPayload() {
        calls.reread++; if (o.repoDown) throw new Error('down');
        const base = (o.current ?? (() => payload()))();
        // once our fake write is stored, a re-read reflects the bound vector (idempotency)
        const p = stored ? compileSummaryRoutingPayloadV1(input({ summaryEmbeddingPresent: true, summaryEmbeddingMeta: { representationId: 'semantic_768', representationRevision: stored.representationRevision, summaryInputDigest: stored.summaryDigest, vectorDigest: stored.vectorDigest } })) : base;
        return { payload: p, summaryText: o.text ?? TEXT };
      },
      async writeEmbedding(w) { calls.write++; stored = { vectorDigest: w.vectorDigest, summaryDigest: w.summaryDigest, representationRevision: w.representationRevision }; if (o.writeStatus === 'LOST_RACE') stored = o.readback === 'race-same' ? stored : null; return { status: o.writeStatus ?? 'WRITTEN', committed: false }; },
      async readBackEmbedding() {
        if (o.readback === 'absent') return null;
        if (o.readback === 'wrong') return { summaryDigest: stored!.summaryDigest, representationRevision: stored!.representationRevision, vectorDigest: sha('other') };
        return stored;
      },
    },
    embedder: { async embed() { calls.embed++; return o.embed ? o.embed() : runtime(); } },
  };
  return { deps, calls };
}
const run = (h: ReturnType<typeof harness>, j: unknown = job(), opts = {}) => processSummaryEmbeddingJobV1(j, h.deps, opts);

describe('SummaryEmbeddingConsumerV1 state machine', () => {
  it('1 CURRENT+ADMITTED+missing vector -> PROCESSED with a verifying receipt; fake write is not a real write', async () => {
    const h = harness(); const r = await run(h);
    expect(r.outcome).toBe('PROCESSED'); expect(r.disposition).toBe('ACK');
    expect(SummaryEmbeddingReceiptV1Schema.parse(r.receipt)).toBeTruthy();
    expect(r.receipt).toMatchObject({ writeStatus: 'WRITTEN', readbackStatus: 'MATCH', writesPerformed: false, canonicalAuthority: false, dimension: 768, normalized: true, vectorDigest: vectorDigestV1(unit()) });
  });
  it('2 same delivery twice -> ALREADY_MATERIALIZED, embedder and writer called once total', async () => {
    const h = harness(); await run(h); const r2 = await run(h);
    expect(r2.outcome).toBe('ALREADY_MATERIALIZED'); expect(h.calls.embed).toBe(1); expect(h.calls.write).toBe(1);
  });
  it('3-5 source/workspace/summary drift', async () => {
    expect((await run(harness({ current: () => payload({ summaryProvenance: goodProv({ sourceRevision: 'sha256:bb' }) }, { sourceRevision: 'sha256:bb' }) }))).outcome).toBe('BLOCKED_SOURCE_REVISION_CHANGED');
    expect((await run(harness({ current: () => payload({ summaryProvenance: goodProv({ workspaceRevision: 'sha256:w2' }) }, { workspaceRevision: 'sha256:w2' }) }))).outcome).toBe('BLOCKED_WORKSPACE_REVISION_CHANGED');
    const T2 = 'A different summary text now.';
    const h = harness({ current: () => payload({ summaryText: T2, summaryProvenance: goodProv({ summaryDigest: sha(T2) }) }), text: T2 });
    expect((await run(h)).outcome).toBe('BLOCKED_SUMMARY_CHANGED'); expect(h.calls.embed).toBe(0);
    expect((await run(harness({ text: 'bytes differ from digest' }))).outcome).toBe('BLOCKED_SUMMARY_CHANGED');
  });
  it('6-8 not current / not admitted / canonical chunk changed; never embeds', async () => {
    const hint = harness({ current: () => payload({ summaryText: null, summaryProvenance: null, legacyChunkSummary: 'legacy' }) });
    expect((await run(hint)).outcome).toBe('BLOCKED_SUMMARY_NOT_CURRENT'); expect(hint.calls.embed).toBe(0);
    expect((await run(harness({ current: () => payload({ summaryProvenance: goodProv({ admission: { status: 'BLOCKED_CONTAMINATION' } }) }) }))).outcome).toBe('BLOCKED_SUMMARY_NOT_ADMITTED');
    expect((await run(harness({ current: () => payload({}, { canonicalChunkId: 'canon:other' }) }))).outcome).toBe('BLOCKED_CANONICAL_CHUNK_CHANGED');
  });
  it('9-13 embedder contract violations are blocked before any write', async () => {
    const cases: [() => Promise<EmbeddingRuntimeResultV1>, string][] = [
      [async () => runtime({ dimension: 767, vector: unit(767) }), 'BLOCKED_EMBEDDER_DIMENSION'], [async () => runtime({ dimension: 769, vector: unit(769) }), 'BLOCKED_EMBEDDER_DIMENSION'],
      [async () => { const v = unit(); v[5] = NaN; return runtime({ vector: v }); }, 'BLOCKED_EMBEDDER_NONFINITE'], [async () => { const v = unit(); v[0] = Infinity; return runtime({ vector: v }); }, 'BLOCKED_EMBEDDER_NONFINITE'],
      [async () => runtime({ vector: unit().map((x) => x * 2) as Float32Array }), 'BLOCKED_EMBEDDER_NOT_NORMALIZED'],
      [async () => runtime({ representationId: 'semantic_512' }), 'BLOCKED_REPRESENTATION_MISMATCH'], [async () => runtime({ modelRevision: '' }), 'BLOCKED_MODEL_REVISION_MISSING'],
    ];
    for (const [embed, expected] of cases) { const h = harness({ embed }); expect((await run(h)).outcome).toBe(expected); expect(h.calls.write).toBe(0); }
  });
  it('14 write loses the race: same stored vector -> ALREADY_MATERIALIZED, different state -> BLOCKED_WRITE_RACE', async () => {
    expect((await run(harness({ writeStatus: 'LOST_RACE', readback: 'race-same' }))).outcome).toBe('ALREADY_MATERIALIZED');
    expect((await run(harness({ writeStatus: 'LOST_RACE', readback: 'absent' }))).outcome).toBe('BLOCKED_WRITE_RACE');
  });
  it('15 readback digest differs / absent -> BLOCKED_READBACK_MISMATCH', async () => {
    expect((await run(harness({ readback: 'wrong' }))).outcome).toBe('BLOCKED_READBACK_MISMATCH');
    expect((await run(harness({ readback: 'absent' }))).receipt!.readbackStatus).toBe('ABSENT');
  });
  it('16 transient failures retry until maxAttempts then DLQ; permanent blocks ACK', async () => {
    const down = harness({ embed: async () => { throw new Error('503'); } });
    expect((await run(down, job(), { attempt: 1, maxAttempts: 3 }))).toMatchObject({ outcome: 'RETRYABLE_EMBEDDER_UNAVAILABLE', disposition: 'RETRY' });
    expect((await run(down, job(), { attempt: 3, maxAttempts: 3 })).disposition).toBe('DLQ');
    expect((await run(harness({ repoDown: true }))).outcome).toBe('RETRYABLE_REPOSITORY_UNAVAILABLE');
    expect((await run(harness({ current: () => payload({}, { canonicalChunkId: 'x' }) }))).disposition).toBe('ACK');
  });
  it('17 receipt checksum is deterministic; bad job schema / payload drift are blocked', async () => {
    expect((await run(harness())).receipt!.checksum).toBe((await run(harness())).receipt!.checksum);
    expect(await run(harness(), { schema: 'nope' })).toMatchObject({ outcome: 'BLOCKED_JOB_SCHEMA', receipt: null, disposition: 'ACK' });
    expect((await run(harness({ current: () => payload({}, { packetKey: 'packet:other' }) }))).outcome).toBe('BLOCKED_JOB_PAYLOAD_DRIFT');
    const tampered = { ...SummaryEmbeddingReceiptV1Schema.parse((await run(harness())).receipt), outcome: 'BLOCKED_WRITE_RACE' };
    expect(() => SummaryEmbeddingReceiptV1Schema.parse(tampered)).toThrow();
  });
});
