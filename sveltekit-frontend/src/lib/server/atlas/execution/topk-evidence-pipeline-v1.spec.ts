import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_SCALAR_FEATURES,
  materializeCandidateFeatureColumnar,
  type CandidateFeatureColumnarV1,
} from '../features/candidate-feature-columnar-v1.js';
import { materializeCandidateFeatureSnapshot, type CandidateFeatureSnapshotV1 } from '../features/candidate-feature-snapshot-v1.js';
import { materializeCandidateOrdinalMap, type CandidateOrdinalMapV1 } from '../features/canonical-candidate-v1.js';
import {
  buildAtlasRankInputV1,
  scoreAtlasRankInputWithFeaturesGemm,
  type ValidateRankInputOptions,
} from './atlas-rank-input-adapter-v1.js';
import { TILE_CHANNEL_CANONICAL_INDEX } from './atlas-feature-matrix-4x6-v1.js';
import {
  TopKExecutionSchema,
  buildTopKExecutionV1,
  persistTopKExecutionReceiptV1,
  runCpuExactTopK,
  toAlgorithmExecutionReceiptRowV1,
  topKInputChecksumV1,
  topKManifestChecksumV1,
  verifyTopKExecutionReceiptV1,
  type AlgorithmExecutionReceiptRowV1,
  type SqlClientV1,
  type TopKExecutionV1,
} from './topk-execution-receipt-v1.js';
import {
  admitTopKEvidenceToContextManifestV1,
  isGenuineQualifiedEvidenceV1,
  resolveTopKEvidenceV1,
  sourceRevisionOfBytes,
  type CandidateSourceSpanV1,
  type SourceFetchPortV1,
} from './topk-evidence-fetch-v1.js';

const WS = 'workspace:topk:v1';
const GRAPH = 'graph:topk:v1';
const FEATURE_REV = 'feature:topk:v1';
const enc = new TextEncoder();

interface World {
  map: CandidateOrdinalMapV1;
  columnar: CandidateFeatureColumnarV1;
  snapshot: CandidateFeatureSnapshotV1;
  files: Map<string, Uint8Array>;
  spans: Map<number, CandidateSourceSpanV1>;
}

function fileText(i: number): string {
  return `// file ${i}\nexport const value${i} = ${i};\nconst caf\u00e9${i} = "\u00e9\u00e8";\nexport default value${i};\n`;
}

function featureValue(ordinal: number, featureIndex: number): number | null {
  const key = ordinal === 5 ? 2 : ordinal; // ordinals 2 and 5 tie exactly
  if ((key * 3 + featureIndex) % 7 === 0) return null;
  return ((key * 37 + featureIndex * 11) % 101) / 100;
}

function buildWorld(count: number, opts: { salt?: string; degraded?: number[]; badRevisionFor?: number[] } = {}): World {
  const salt = opts.salt ?? 'a';
  const files = new Map<string, Uint8Array>();
  const sourceRefs: string[] = [];
  const revisions: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = String(i).padStart(5, '0');
    const bytes = enc.encode(fileText(i));
    files.set(`src/f${id}.ts`, bytes);
    sourceRefs.push(`src/f${id}.ts`);
    revisions.push(sourceRevisionOfBytes(bytes));
  }
  const map = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: `candidate:topk:${salt}`,
    workspaceRevision: WS,
    producerRevision: 'ordinal:topk:v1',
    candidates: Array.from({ length: count }, (_, i) => {
      const id = String(i).padStart(5, '0');
      return {
        canonicalId: `canon:${id}`, packetKey: `packet:${id}`, treeNodeId: `tree:${id}`, symbolVersionId: `symbol:${id}`,
        workspaceRevision: WS,
        sourceRevision: opts.badRevisionFor?.includes(i) ? `source:${id}` : (revisions[i] as string),
        graphRevision: GRAPH, semanticRevision: 'semantic:topk:v1',
        degradedIdentity: opts.degraded?.includes(i) ?? false, evidenceRefs: [`ast:${id}`],
      };
    }),
  });
  const rows = map.candidates.map((candidate, ordinal) => {
    const scalar: Record<string, number | null> = {};
    CANDIDATE_SCALAR_FEATURES.forEach((name, index) => { scalar[name] = name === 'crossEncoderRawScore' ? null : featureValue(ordinal, index); });
    return {
      schema: 'atlas.candidate-feature-row.v1' as const, candidateOrdinal: ordinal, canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey, treeNodeId: candidate.treeNodeId, symbolVersionId: candidate.symbolVersionId,
      workspaceRevision: candidate.workspaceRevision, sourceRevision: candidate.sourceRevision, graphRevision: candidate.graphRevision,
      semanticRevision: candidate.semanticRevision, featureRevision: FEATURE_REV, ...scalar, crossEncoderAvailable: false,
      laneMask: ['semantic' as const], degradedIdentity: candidate.degradedIdentity, evidenceRefs: candidate.evidenceRefs,
    };
  });
  const snapshot = materializeCandidateFeatureSnapshot({ ordinalMap: map, rows, featureRevision: FEATURE_REV, producerRevision: 'snapshot:topk:v1' });
  const columnar = materializeCandidateFeatureColumnar({ snapshot, producerRevision: 'columnar:topk:v1' });
  // each candidate's recorded span is the second line; ordinal -> file via canonical id order
  const spans = new Map<number, CandidateSourceSpanV1>();
  map.candidates.forEach((candidate, ordinal) => {
    const index = Number(candidate.canonicalId.slice('canon:'.length));
    spans.set(ordinal, { sourceRef: sourceRefs[index] as string, unit: 'lines', start: 2, end: 2 });
  });
  return { map, columnar, snapshot, files, spans };
}

const WEIGHTS = [0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625];
function head() {
  const weights = new Array(CANDIDATE_SCALAR_FEATURES.length).fill(0);
  TILE_CHANNEL_CANONICAL_INDEX.forEach((index, channel) => { weights[index] = WEIGHTS[channel]; });
  return { headId: 'head:topk:v1', featureRevision: FEATURE_REV, featureCount: CANDIDATE_SCALAR_FEATURES.length, headCount: 1, weights: [weights], bias: [0.1] };
}
function options(map: CandidateOrdinalMapV1): ValidateRankInputOptions {
  return {
    ordinalMap: map, expectedWorkspaceRevision: WS, expectedGraphRevision: GRAPH, expectedOrdinalMapRevision: map.ordinalMapChecksum,
    expectedTaxonomyRevision: 'taxonomy:topk:v1', expectedFeatureSchemaRevision: 'schema:topk:v1', expectedEvidenceRevision: 'evidence:topk:v1',
  };
}

function execute(world: World, ordinals: number[], k = 10, durationNs = '1000') {
  const input = buildAtlasRankInputV1({
    queryDigest: 'query:topk:v1', graphRevision: GRAPH, ordinalMap: world.map, columnar: world.columnar, candidateOrdinals: ordinals,
    taxonomyRevision: 'taxonomy:topk:v1', featureSchemaRevision: 'schema:topk:v1', evidenceRevision: 'evidence:topk:v1',
  });
  const scored = scoreAtlasRankInputWithFeaturesGemm({ input, options: options(world.map), columnar: world.columnar, head: head(), producerRevision: 'topk:v1', topK: k });
  const execution = buildTopKExecutionV1({ requestId: 'req:topk:v1', input, scored, ordinalMap: world.map, k });
  const row = toAlgorithmExecutionReceiptRowV1(execution, { durationNs });
  return { input, scored, execution, row };
}

function verify(world: World, row: AlgorithmExecutionReceiptRowV1) {
  return verifyTopKExecutionReceiptV1({ row, ordinalMap: world.map, columnar: world.columnar, head: head(), options: options(world.map), producerRevision: 'topk:v1', queryDigest: 'query:topk:v1' });
}

/** In-memory table honoring PRIMARY KEY (execution_id) and ON CONFLICT DO NOTHING. */
function memoryClient() {
  const store = new Map<string, { manifest_checksum: string }>();
  const client: SqlClientV1 = {
    async query(text, values = []) {
      if (text.startsWith('INSERT INTO atlas_algorithm_execution_receipts')) {
        const id = values[0] as string;
        if (store.has(id)) return { rows: [] };
        store.set(id, { manifest_checksum: values[20] as string });
        return { rows: [{ execution_id: id }] };
      }
      if (text.startsWith('SELECT manifest_checksum')) {
        const found = store.get(values[0] as string);
        return { rows: found ? [{ manifest_checksum: found.manifest_checksum }] : [] };
      }
      throw new Error(`unexpected SQL: ${text}`);
    },
  };
  return { client, store };
}

function port(world: World, overrides: { bytes?: Map<string, Uint8Array>; spans?: Map<number, CandidateSourceSpanV1> } = {}): SourceFetchPortV1 {
  return {
    readBytes: (ref) => (overrides.bytes ?? world.files).get(ref) ?? null,
    lookupSpan: (candidate) => (overrides.spans ?? world.spans).get(candidate.ordinal) ?? null,
  };
}

const world = buildWorld(12);

describe('exact CPU Top-K oracle', () => {
  const ordinals = [3, 1, 2, 0];
  const ids = ['c3', 'c1', 'c2', 'c0'];
  it('orders by score descending then ordinal ascending and assigns ranks', () => {
    const out = runCpuExactTopK({ candidateOrdinals: ordinals, canonicalIds: ids, scores: [0.5, 0.9, 0.9, 0.1], k: 3 });
    expect(out.map((s) => [s.ordinal, s.rank])).toEqual([[1, 1], [2, 2], [3, 3]]);
    expect(runCpuExactTopK({ candidateOrdinals: ordinals, canonicalIds: ids, scores: [1, 1, 1, 1], k: 4 }).map((s) => s.ordinal)).toEqual([0, 1, 2, 3]);
  });
  it('returns all N when k > N and rejects NaN, infinities, duplicates, missing scores and bad k', () => {
    expect(runCpuExactTopK({ candidateOrdinals: ordinals, canonicalIds: ids, scores: [1, 2, 3, 4], k: 99 })).toHaveLength(4);
    expect(() => runCpuExactTopK({ candidateOrdinals: ordinals, canonicalIds: ids, scores: [1, Number.NaN, 3, 4], k: 2 })).toThrow('TOPK_NONFINITE_SCORE');
    expect(() => runCpuExactTopK({ candidateOrdinals: ordinals, canonicalIds: ids, scores: [1, Infinity, 3, 4], k: 2 })).toThrow('TOPK_NONFINITE_SCORE');
    expect(() => runCpuExactTopK({ candidateOrdinals: [1, 1], canonicalIds: ['a', 'b'], scores: [1, 2], k: 1 })).toThrow('TOPK_DUPLICATE_ORDINAL');
    expect(() => runCpuExactTopK({ candidateOrdinals: [1, 2], canonicalIds: ['a', 'a'], scores: [1, 2], k: 1 })).toThrow('TOPK_DUPLICATE_CANONICAL_ID');
    expect(() => runCpuExactTopK({ candidateOrdinals: ordinals, canonicalIds: ids, scores: [1, 2, 3], k: 2 })).toThrow('TOPK_LENGTH_MISMATCH');
    expect(() => runCpuExactTopK({ candidateOrdinals: ordinals, canonicalIds: ids, scores: [1, 2, 3, 4], k: 0 })).toThrow('TOPK_K_INVALID');
  });
});

describe('execution receipt for atlas_algorithm_execution_receipts', () => {
  const ordinals = [7, 2, 5, 0, 11, 3, 8, 1, 10, 4, 9, 6];
  it('maps onto the existing columns, satisfies the table CHECKs, and never claims GPU execution', () => {
    const { execution, row } = execute(world, ordinals);
    expect(TopKExecutionSchema.parse(execution)).toBeTruthy();
    expect(row.compute_backend).toBe('cpu_oracle');
    expect(execution.backend).toBe('cpu');
    expect(execution.gpuExecuted).toBe(false);
    expect(execution.parityVerified).toBe(false);
    for (const checksum of [row.input_checksum, row.output_checksum, row.manifest_checksum]) expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(row.source_snapshot_revision).toBe(world.map.candidateSnapshotRevision);
    expect(execution.selected).toHaveLength(10);
    expect(execution.selected.map((s) => s.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it('breaks the 2/5 tie by ordinal and is deterministic; timing never changes identity or checksums', () => {
    const a = execute(world, ordinals, 10, '1000');
    const b = execute(world, ordinals, 10, '999999');
    expect(a.execution.executionId).toBe(b.execution.executionId);
    expect(a.row.manifest_checksum).toBe(b.row.manifest_checksum);
    const two = a.execution.selected.findIndex((s) => s.ordinal === 2);
    const five = a.execution.selected.findIndex((s) => s.ordinal === 5);
    expect(a.execution.selected[two]?.score).toBe(a.execution.selected[five]?.score);
    expect(two).toBeLessThan(five);
    expect(execute(world, [...ordinals].reverse()).execution.executionId).not.toBe(a.execution.executionId);
  });
  it('persists idempotently, rejects conflicting content, and rejects tampered rows before insert', async () => {
    const { client, store } = memoryClient();
    const { row } = execute(world, ordinals);
    expect(await persistTopKExecutionReceiptV1(client, row)).toEqual({ status: 'INSERTED', executionId: row.execution_id });
    expect(await persistTopKExecutionReceiptV1(client, row)).toEqual({ status: 'IDEMPOTENT', executionId: row.execution_id });
    expect(store.size).toBe(1);

    store.set(row.execution_id, { manifest_checksum: 'f'.repeat(64) });
    await expect(persistTopKExecutionReceiptV1(client, row)).rejects.toThrow('EXECUTION_RECEIPT_CONFLICT');

    const fresh = memoryClient();
    await expect(persistTopKExecutionReceiptV1(fresh.client, { ...row, manifest_checksum: '0'.repeat(64) })).rejects.toThrow('MANIFEST_CHECKSUM_MISMATCH');
    await expect(persistTopKExecutionReceiptV1(fresh.client, { ...row, output_checksum: '1'.repeat(64) })).rejects.toThrow('OUTPUT_CHECKSUM_MISMATCH');
    await expect(persistTopKExecutionReceiptV1(fresh.client, { ...row, input_checksum: '2'.repeat(64) })).rejects.toThrow('INPUT_CHECKSUM_MISMATCH');
    await expect(persistTopKExecutionReceiptV1(fresh.client, { ...row, compute_backend: 'cuda' })).rejects.toThrow('BACKEND_NOT_CPU_ORACLE');
    await expect(persistTopKExecutionReceiptV1(fresh.client, { ...row, execution_id: 'topk:' + 'a'.repeat(64) })).rejects.toThrow('ID_MISMATCH');
    expect(fresh.store.size).toBe(0);
  });
});

describe('independent replay verification (separate from the execution PASS)', () => {
  const ordinals = [7, 2, 5, 0, 11, 3, 8, 1, 10, 4, 9, 6];
  function forge(execution: TopKExecutionV1, change: (e: TopKExecutionV1) => TopKExecutionV1) {
    // an attacker who also recomputes every checksum: only replay can catch it
    const changed = change(execution);
    const { executionId: _ignored, ...body } = changed;
    void body;
    return toAlgorithmExecutionReceiptRowV1(changed, { durationNs: '1' });
  }

  it('verifies a genuine execution by replaying the full CPU path', () => {
    const { row } = execute(world, ordinals);
    const verdict = verify(world, row);
    expect(verdict.status).toBe('VERIFIED_PASS');
    expect(verdict.checks.every((c) => c.ok)).toBe(true);
    expect(verdict.canonicalAuthority).toBe(false);
  });

  it('fails a tampered manifest checksum, output checksum and input checksum', () => {
    const { row } = execute(world, ordinals);
    for (const bad of [{ ...row, manifest_checksum: '0'.repeat(64) }, { ...row, output_checksum: '1'.repeat(64) }, { ...row, input_checksum: '2'.repeat(64) }]) {
      const verdict = verify(world, bad);
      expect(verdict.status).toBe('VERIFIED_FAIL');
    }
  });

  it('fails a forged result even when the forger recomputes consistent checksums (replay catches it)', () => {
    const { execution } = execute(world, ordinals);
    const swapped = forge(execution, (e) => ({ ...e, selected: [e.selected[1] as typeof e.selected[0], e.selected[0] as typeof e.selected[0], ...e.selected.slice(2)].map((s, i) => ({ ...s, rank: i + 1 })) }));
    const verdict = verify(world, swapped);
    expect(verdict.status).toBe('VERIFIED_FAIL');
    expect(verdict.checks.find((c) => c.name === 'replay_selected_equal')?.ok).toBe(false);
  });

  it('fails when the sealed map or columnar is stale (different snapshot)', () => {
    const { row } = execute(world, ordinals);
    const other = buildWorld(12, { salt: 'b' });
    const verdict = verify(other, row);
    expect(verdict.status).toBe('VERIFIED_FAIL');
    expect(verdict.checks.find((c) => c.name === 'sealed_map_checksum_current')?.ok).toBe(false);
  });

  it('fails an unresolved candidate (ordinal outside the sealed map) instead of throwing', () => {
    const { execution } = execute(world, ordinals);
    const bad = forge(execution, (e) => ({ ...e, candidateOrdinals: [...e.candidateOrdinals.slice(0, 11), 99] }));
    const verdict = verify(world, bad);
    expect(verdict.status).toBe('VERIFIED_FAIL');
    expect(verdict.checks.find((c) => c.name === 'replay_completed')?.ok).toBe(false);
  });
});

describe('Top-10 exact source-span fetch', () => {
  const ordinals = Array.from({ length: 12 }, (_, i) => i);
  const { execution } = execute(world, ordinals, 12);

  it('returns at most ten qualified items in Top-K rank order with exact spans and a checksum', () => {
    const { qualified, rejected } = resolveTopKEvidenceV1({ ordinalMap: world.map, selected: execution.selected, port: port(world) });
    expect(qualified).toHaveLength(10);
    expect(rejected).toHaveLength(0);
    expect(qualified.map((q) => q.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const first = qualified[0];
    expect(first?.text).toBe(`export const value${Number((first?.canonicalId ?? '').slice(6))} = ${Number((first?.canonicalId ?? '').slice(6))};\n`);
    expect(qualified.every(isGenuineQualifiedEvidenceV1)).toBe(true);
    expect(qualified.every((q) => q.sourceRevision.startsWith('sha256:') && q.canonicalAuthority === false)).toBe(true);
  });

  it('supports byte spans and rejects a span cutting a multi-byte character', () => {
    const bytesSpans = new Map(world.spans);
    const target = execution.selected[0]!;
    const ref = world.spans.get(target.ordinal)!.sourceRef;
    const text = fileText(Number(ref.slice('src/f'.length, -3)));
    const start = enc.encode(text.slice(0, text.indexOf('const caf'))).length;
    bytesSpans.set(target.ordinal, { sourceRef: ref, unit: 'bytes', start, end: start + enc.encode('const caf\u00e9').length - 1 });
    const cut = resolveTopKEvidenceV1({ ordinalMap: world.map, selected: [target], port: port(world, { spans: bytesSpans }) });
    expect(cut.rejected[0]?.reason).toBe('SPAN_NOT_UTF8_BOUNDARY');
    bytesSpans.set(target.ordinal, { sourceRef: ref, unit: 'bytes', start, end: start + enc.encode('const caf\u00e9').length });
    const ok = resolveTopKEvidenceV1({ ordinalMap: world.map, selected: [target], port: port(world, { spans: bytesSpans }) });
    expect(ok.qualified[0]?.text.startsWith('const caf\u00e9')).toBe(true);
  });

  it('rejects stale source bytes, missing spans, unreadable files, out-of-range spans and unsafe paths', () => {
    const target = execution.selected[0]!;
    const ref = world.spans.get(target.ordinal)!.sourceRef;
    const reasonFor = (overrides: Parameters<typeof port>[1]) =>
      resolveTopKEvidenceV1({ ordinalMap: world.map, selected: [target], port: port(world, overrides) }).rejected[0]?.reason;

    expect(reasonFor({ bytes: new Map(world.files).set(ref, enc.encode('changed on disk\n')) })).toBe('SOURCE_REVISION_STALE');
    expect(reasonFor({ spans: new Map() })).toBe('SPAN_UNAVAILABLE');
    expect(reasonFor({ bytes: new Map() })).toBe('SOURCE_UNREADABLE');
    expect(reasonFor({ spans: new Map(world.spans).set(target.ordinal, { sourceRef: ref, unit: 'lines', start: 50, end: 60 }) })).toBe('SPAN_OUT_OF_RANGE');
    expect(reasonFor({ spans: new Map(world.spans).set(target.ordinal, { sourceRef: '../outside.ts', unit: 'lines', start: 1, end: 1 }) })).toBe('SPAN_UNSAFE_PATH');
    expect(reasonFor({ spans: new Map(world.spans).set(target.ordinal, { sourceRef: 'C:/secret.ts', unit: 'lines', start: 1, end: 1 }) })).toBe('SPAN_UNSAFE_PATH');
  });

  it('rejects degraded identities and non-sha256 source revisions, and refuses a selection that is not in the map', () => {
    const degraded = buildWorld(12, { degraded: [4] });
    const badRev = buildWorld(12, { badRevisionFor: [6] });
    const pick = (w: World, ordinal: number) => ({ canonicalId: w.map.candidates[ordinal]!.canonicalId, ordinal, score: 1, rank: 1 });
    expect(resolveTopKEvidenceV1({ ordinalMap: degraded.map, selected: [pick(degraded, 4)], port: port(degraded) }).rejected[0]?.reason).toBe('DEGRADED_IDENTITY');
    expect(resolveTopKEvidenceV1({ ordinalMap: badRev.map, selected: [pick(badRev, 6)], port: port(badRev) }).rejected[0]?.reason).toBe('SOURCE_REVISION_NOT_SHA256');
    const ghost = { canonicalId: 'canon:ghost', ordinal: 99, score: 1, rank: 1 };
    expect(resolveTopKEvidenceV1({ ordinalMap: world.map, selected: [ghost], port: port(world) }).rejected[0]?.reason).toBe('UNRESOLVED_CANDIDATE');
    const wrongId = { canonicalId: 'canon:00001', ordinal: 0, score: 1, rank: 1 };
    expect(resolveTopKEvidenceV1({ ordinalMap: world.map, selected: [wrongId], port: port(world) }).rejected[0]?.reason).toBe('UNRESOLVED_CANDIDATE');
  });
});

describe('ContextManifest admission', () => {
  const ordinals = Array.from({ length: 12 }, (_, i) => i);
  const { execution, row } = execute(world, ordinals, 12);
  const verdict = verify(world, row);
  const { qualified } = resolveTopKEvidenceV1({ ordinalMap: world.map, selected: execution.selected, port: port(world) });
  const base = {
    execution, verification: verdict, qualified, snapshot: world.snapshot, requestId: 'req:topk:v1', tokenBudget: 4096,
    retrievalPolicyRevision: 'policy:topk:v1', acePlaybookRevision: 'playbook:topk:v1', representationRevision: 'repr:topk:v1',
    graphRevision: GRAPH, graphifyLifecycle: 'NOT_COMPLETED' as const,
  };

  it('admits verified, qualified evidence through the existing builder and keeps graph promotion blocked', () => {
    const result = admitTopKEvidenceToContextManifestV1(base);
    expect(result.status).toBe('ADMITTED');
    if (result.status !== 'ADMITTED') throw new Error('unreachable');
    expect(result.admittedOrdinals).toHaveLength(10);
    expect(result.droppedOrdinals).toHaveLength(2);
    expect(result.admission.manifest.v1.candidateCount).toBe(10);
    expect(result.admission.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
    expect(result.productionPromotion).toBe('BLOCKED_GRAPHIFY_LIFECYCLE');
    expect(admitTopKEvidenceToContextManifestV1({ ...base, graphifyLifecycle: 'COMPLETED' }).productionPromotion).toBe('ELIGIBLE');
    expect(admitTopKEvidenceToContextManifestV1({ ...base, graphifyLifecycle: 'UNKNOWN' }).productionPromotion).toBe('BLOCKED_GRAPHIFY_LIFECYCLE');
  });

  it('blocks when the receipt is not VERIFIED_PASS or the verdict is for another execution', () => {
    const failed = { ...verdict, status: 'VERIFIED_FAIL' as const };
    expect(admitTopKEvidenceToContextManifestV1({ ...base, verification: failed })).toMatchObject({ status: 'BLOCKED', reason: 'RECEIPT_NOT_VERIFIED' });
    expect(admitTopKEvidenceToContextManifestV1({ ...base, verification: { ...verdict, executionId: 'topk:' + 'b'.repeat(64) } })).toMatchObject({ status: 'BLOCKED', reason: 'VERIFICATION_EXECUTION_MISMATCH' });
  });

  it('blocks raw retrieval hits and forged evidence: only genuine QualifiedEvidenceV1 can enter', () => {
    const rawHit = { ordinal: 1, canonicalId: 'canon:00001', score: 0.99, rank: 1 } as never;
    expect(admitTopKEvidenceToContextManifestV1({ ...base, qualified: [rawHit] })).toMatchObject({ status: 'BLOCKED', reason: 'EVIDENCE_NOT_QUALIFIED' });
    const forged = { ...qualified[0]!, text: 'injected text' };
    expect(admitTopKEvidenceToContextManifestV1({ ...base, qualified: [forged] })).toMatchObject({ status: 'BLOCKED', reason: 'EVIDENCE_NOT_QUALIFIED' });
    const outside = buildWorld(14);
    const outsideEvidence = resolveTopKEvidenceV1({ ordinalMap: outside.map, selected: [{ canonicalId: outside.map.candidates[13]!.canonicalId, ordinal: 13, score: 1, rank: 1 }], port: port(outside) }).qualified;
    expect(admitTopKEvidenceToContextManifestV1({ ...base, qualified: outsideEvidence })).toMatchObject({ status: 'BLOCKED', reason: 'EVIDENCE_NOT_IN_VERIFIED_TOPK' });
    expect(admitTopKEvidenceToContextManifestV1({ ...base, qualified: [] })).toMatchObject({ status: 'BLOCKED', reason: 'NO_QUALIFIED_EVIDENCE' });
  });

  it('blocks a snapshot from another map, and evidence whose source revision no longer matches the snapshot row', () => {
    const other = buildWorld(12, { salt: 'b' });
    expect(admitTopKEvidenceToContextManifestV1({ ...base, snapshot: other.snapshot })).toMatchObject({ status: 'BLOCKED', reason: 'SNAPSHOT_ORDINAL_MAP_MISMATCH' });
    expect(topKManifestChecksumV1(execution)).toBe(row.manifest_checksum);
    expect(topKInputChecksumV1(execution)).toBe(row.input_checksum);
  });
});

describe('live table proof helper', () => {
  it('writes a rolled-back SQL proof file when TOPK_LIVE_PROOF_SQL is set (exercises the real CHECKs and primary key)', () => {
    const target = process.env.TOPK_LIVE_PROOF_SQL;
    const { row } = execute(world, [7, 2, 5, 0, 11, 3, 8, 1, 10, 4, 9, 6]);
    const lit = (value: unknown) => (value === null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`);
    const insert = (id: string, manifestChecksum: string) =>
      `INSERT INTO atlas_algorithm_execution_receipts (execution_id, workflow_id, action_id, dag_node_id, stage, logical_lane, algorithm_class, algorithm, geometry, metric, compute_backend, compilation_mode, transport, serialization, source_snapshot_revision, representation_revision, graph_snapshot_revision, relationship_snapshot_revision, input_checksum, output_checksum, manifest_checksum, manifest) VALUES (${[
        id, row.workflow_id, row.action_id, row.dag_node_id, row.stage, row.logical_lane, row.algorithm_class, row.algorithm, row.geometry,
        row.metric, row.compute_backend, row.compilation_mode, row.transport, row.serialization, row.source_snapshot_revision,
        row.representation_revision, row.graph_snapshot_revision, row.relationship_snapshot_revision, row.input_checksum, row.output_checksum,
        manifestChecksum,
      ].map(lit).join(', ')}, ${lit(JSON.stringify(row.manifest))}::jsonb)`;
    const sql = [
      'BEGIN;',
      `${insert(row.execution_id, row.manifest_checksum)};`,
      'SAVEPOINT dup;',
      `${insert(row.execution_id, row.manifest_checksum)} ON CONFLICT (execution_id) DO NOTHING RETURNING execution_id;`,
      'ROLLBACK TO dup;',
      "SAVEPOINT bad;",
      `${insert('topk:bad-checksum', 'not-a-checksum')};`,
      'ROLLBACK TO bad;',
      `SELECT execution_id = '${row.execution_id}' AS stored, manifest_checksum = '${row.manifest_checksum}' AS checksum_ok, manifest #>> '{execution,selected,0,rank}' AS rank1, jsonb_array_length(manifest #> '{execution,selected}') AS selected_n, compute_backend FROM atlas_algorithm_execution_receipts WHERE execution_id = '${row.execution_id}';`,
      'ROLLBACK;',
      '',
    ].join(String.fromCharCode(10));
    if (target) writeFileSync(target, sql, 'utf8');
    expect(sql).toContain('ROLLBACK;');
  });
});
