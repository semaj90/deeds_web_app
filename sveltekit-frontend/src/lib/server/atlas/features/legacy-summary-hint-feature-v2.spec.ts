// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  HINT_VECTOR_DIM,
  buildLegacySummaryCosineMaxProducerArtifactV2,
  buildLegacySummaryHintFeatureV2,
  vectorDigestV2,
  type FeatureCandidateV2,
  type HintVectorV2,
} from './legacy-summary-hint-feature-v2.js';
import {
  buildRepairFeatureProducerArtifactV1,
  buildRepairFeatureProducerSetV1,
  verifyRepairFeatureProducerArtifactV1,
} from '../../retrieval/repair-feature-producer-v1.js';
import { buildRepairFeaturePresenceEvidenceV1 } from '../../retrieval/repair-feature-presence-evidence-v1.js';
import { buildRepairCandidateFeatureBundleV1 } from '../../retrieval/repair-candidate-feature-bundle-v1.js';
import { buildCandidateFeatureMatrix } from '../../retrieval/retrieval-candidate-feature-matrix-v1.js';
import {
  resolveHistoricalEvidenceToCandidates,
  type CurrentCandidateIndexV2,
} from './historical-evidence-current-candidate-overlay-v2.js';

const SNAP = 'sha256:' + 'a'.repeat(64);
const MAP = 'b'.repeat(64);
const unit = (angleAxis: number, mix = 0): Float32Array => {
  // unit vector: cos(mix) on axis 0, sin(mix) on axis angleAxis
  const v = new Float32Array(HINT_VECTOR_DIM);
  v[0] = Math.cos(mix);
  v[angleAxis] = Math.sin(mix);
  return v;
};
const query = unit(1, 0); // e0
const qd = vectorDigestV2(query);

// matrixRowIndex deliberately != candidateOrdinal
const candidates: FeatureCandidateV2[] = [
  { candidateOrdinal: 0, matrixRowIndex: 7, packetId: 'p0', packetKey: 'packet:0', sourceRef: 'a.ts', sourceRevision: 'r0', workspaceRevision: 'w' },
  { candidateOrdinal: 1, matrixRowIndex: 3, packetId: 'p1', packetKey: 'packet:1', sourceRef: 'b.ts', sourceRevision: 'r1', workspaceRevision: 'w' },
  { candidateOrdinal: 2, matrixRowIndex: 0, packetId: 'p2', packetKey: 'packet:2', sourceRef: 'c.ts', sourceRevision: 'r2', workspaceRevision: 'w' },
];
const index: CurrentCandidateIndexV2 = {
  candidateSnapshotRevision: SNAP, ordinalMapChecksum: MAP,
  candidates: candidates.map((c) => ({ candidateOrdinal: c.candidateOrdinal, packetKey: c.packetKey, sourceRef: c.sourceRef, sourceRevision: c.sourceRevision })),
  memberships: [
    { candidateOrdinal: 0, chunkRowId: 'c-a', canonicalChunkId: 'chunk:a' },
    { candidateOrdinal: 0, chunkRowId: 'c-b', canonicalChunkId: 'chunk:b' },
    { candidateOrdinal: 2, chunkRowId: 'c-c', canonicalChunkId: 'chunk:c' },
  ],
};
const overlay = (chunkRowId: string, canonicalChunkId: string, ordinalSource: number) => {
  const c = candidates[ordinalSource]!;
  return resolveHistoricalEvidenceToCandidates({
    evidenceId: `h:${chunkRowId}`, evidenceKind: 'LEGACY_SUMMARY_HINT', evidenceGranularity: 'CHUNK',
    historicalArtifactRevision: 'sha256:art', historicalEvidenceDigest: 'sha256:ev',
    sourceRef: c.sourceRef, sourceRevision: c.sourceRevision, chunk: { chunkRowId, canonicalChunkId, packetKey: c.packetKey },
  }, index);
};
const hv = (chunkRowId: string, canonicalChunkId: string, summaryDigest: string, vector: Float32Array): [string, HintVectorV2] =>
  [chunkRowId, { chunkRowId, canonicalChunkId, summaryDigest, vector }];

const args = () => ({
  candidateSnapshotRevision: SNAP, ordinalMapChecksum: MAP, candidates,
  overlays: [overlay('c-a', 'chunk:a', 0), overlay('c-b', 'chunk:b', 0), overlay('c-c', 'chunk:c', 2)],
  hintVectors: new Map([
    hv('c-a', 'chunk:a', 'sha256:s1', unit(1, 0.9)),  // cos = cos(0.9)
    hv('c-b', 'chunk:b', 'sha256:s2', unit(1, 0.2)),  // cos = cos(0.2)  <- winner for ordinal 0
    hv('c-c', 'chunk:c', 'sha256:s3', unit(1, Math.PI)), // cos = -1
  ]),
  queryVector: query, queryEmbeddingDigest: qd,
});

describe('legacy summary hint feature v2 (standalone)', () => {
  it('max-by-candidate: winner really has the max cosine; score01 transform correct', () => {
    const r = buildLegacySummaryHintFeatureV2(args());
    const row0 = r.rows.find((x) => x.candidateOrdinal === 0)!;
    expect(row0.state).toBe('DERIVED');
    expect(row0.winningChunkRowId).toBe('c-b');
    expect(row0.matchedHintCount).toBe(2);
    expect(row0.rawCosine!).toBeCloseTo(Math.cos(0.2), 5);
    expect(row0.score01!).toBeCloseTo((Math.cos(0.2) + 1) / 2, 5);
    const all = r.chunkScores.filter((s) => s.candidateOrdinal === 0).map((s) => s.rawCosine);
    expect(row0.rawCosine).toBe(Math.max(...all));
    expect(row0.winningSummaryVectorDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('UNAVAILABLE candidates carry null, never numeric zero; every candidate has exactly one state', () => {
    const r = buildLegacySummaryHintFeatureV2(args());
    expect(r.rows).toHaveLength(3);
    const un = r.rows.find((x) => x.candidateOrdinal === 1)!;
    expect(un.state).toBe('UNAVAILABLE');
    expect(un.rawCosine).toBeNull();
    expect(un.score01).toBeNull();
    expect(un.unavailableReason).toBe('NO_QUALIFIED_LEGACY_SUMMARY_HINT');
    expect(r.derivedCount + r.unavailableCount).toBe(3);
    expect(new Set(r.rows.map((x) => x.candidateOrdinal)).size).toBe(3);
  });

  it('a -1 cosine is a real DERIVED value (score01 = 0), distinct from UNAVAILABLE', () => {
    const r = buildLegacySummaryHintFeatureV2(args());
    const row2 = r.rows.find((x) => x.candidateOrdinal === 2)!;
    expect(row2.state).toBe('DERIVED');
    expect(row2.score01!).toBeCloseTo(0, 5);
  });

  it('never conflates candidateOrdinal with matrixRowIndex', () => {
    const r = buildLegacySummaryHintFeatureV2(args());
    for (const row of r.rows) {
      const c = candidates.find((x) => x.candidateOrdinal === row.candidateOrdinal)!;
      expect(row.matrixRowIndex).toBe(c.matrixRowIndex);
      expect(row.packetId).toBe(c.packetId);
    }
    // the fixture is only meaningful because the two orders differ
    expect(candidates.some((c) => c.candidateOrdinal !== c.matrixRowIndex)).toBe(true);
    // ordinal 0's value must come from ordinal 0's chunks, not from matrix row 0 (= ordinal 2, cosine -1)
    expect(r.rows.find((x) => x.candidateOrdinal === 0)!.score01!).toBeGreaterThan(0.9);
  });

  it('tie resolution is deterministic: rawCosine DESC, summaryDigest ASC, chunkRowId ASC', () => {
    const same = unit(1, 0.5);
    const a = args();
    a.hintVectors = new Map([
      hv('c-a', 'chunk:a', 'sha256:zz', same), hv('c-b', 'chunk:b', 'sha256:aa', same), hv('c-c', 'chunk:c', 'sha256:s3', unit(1, 1)),
    ]);
    expect(buildLegacySummaryHintFeatureV2(a).rows[0]!.winningChunkRowId).toBe('c-b');
    a.hintVectors = new Map([hv('c-a', 'chunk:a', 'sha256:same', same), hv('c-b', 'chunk:b', 'sha256:same', same), hv('c-c', 'chunk:c', 'sha256:s3', unit(1, 1))]);
    expect(buildLegacySummaryHintFeatureV2(a).rows[0]!.winningChunkRowId).toBe('c-a');
    a.overlays = [...a.overlays].reverse();
    expect(buildLegacySummaryHintFeatureV2(a).rows[0]!.winningChunkRowId).toBe('c-a');
  });

  it('rejects non-768 / non-unit / non-finite query and summary vectors', () => {
    const a = args();
    const short = new Float32Array(10);
    expect(() => buildLegacySummaryHintFeatureV2({ ...a, queryVector: short, queryEmbeddingDigest: vectorDigestV2(short) })).toThrow('QUERY_VECTOR_DIMENSION');
    const big = new Float32Array(HINT_VECTOR_DIM).fill(1);
    expect(() => buildLegacySummaryHintFeatureV2({ ...a, queryVector: big, queryEmbeddingDigest: vectorDigestV2(big) })).toThrow('NOT_UNIT_NORM');
    const b = args();
    b.hintVectors = new Map([...b.hintVectors]); b.hintVectors.set('c-a', { ...b.hintVectors.get('c-a')!, vector: big });
    expect(() => buildLegacySummaryHintFeatureV2(b)).toThrow('SUMMARY_VECTOR_NOT_UNIT_NORM');
  });

  it('rejects a query vector whose digest does not match (tampered vector digest)', () => {
    expect(() => buildLegacySummaryHintFeatureV2({ ...args(), queryEmbeddingDigest: 'sha256:' + '0'.repeat(64) })).toThrow('QUERY_DIGEST_MISMATCH');
  });

  it('rejects tampered overlay, wrong snapshot, wrong ordinal checksum', () => {
    const t = args();
    const bad = JSON.parse(JSON.stringify(t.overlays[0]));
    bad.resolution.memberships[0].chunkRowId = 'evil';
    expect(() => buildLegacySummaryHintFeatureV2({ ...t, overlays: [bad] })).toThrow();
    expect(() => buildLegacySummaryHintFeatureV2({ ...args(), candidateSnapshotRevision: 'sha256:' + 'c'.repeat(64) })).toThrow('HIST_OVERLAY_SNAPSHOT_MISMATCH');
    expect(() => buildLegacySummaryHintFeatureV2({ ...args(), ordinalMapChecksum: 'd'.repeat(64) })).toThrow('HIST_OVERLAY_ORDINAL_MAP_MISMATCH');
  });

  it('non-exact / non-legacy overlays never enter scoring (no silent skip)', () => {
    const chunkSet = resolveHistoricalEvidenceToCandidates({
      evidenceId: 'mr', evidenceKind: 'MAPREDUCE_RECORD', evidenceGranularity: 'FILE', historicalArtifactRevision: 'sha256:x', historicalEvidenceDigest: 'sha256:y',
      sourceRef: 'a.ts', sourceRevision: 'r0',
    }, index);
    expect(() => buildLegacySummaryHintFeatureV2({ ...args(), overlays: [chunkSet] })).toThrow('NOT_EXACT_LEGACY_HINT');
    const unresolved = resolveHistoricalEvidenceToCandidates({
      evidenceId: 'u', evidenceKind: 'LEGACY_SUMMARY_HINT', evidenceGranularity: 'CHUNK', historicalArtifactRevision: 'sha256:x', historicalEvidenceDigest: 'sha256:y',
      sourceRef: 'nope.ts', sourceRevision: 'r0', chunk: { chunkRowId: 'z', canonicalChunkId: 'z' },
    }, index);
    expect(() => buildLegacySummaryHintFeatureV2({ ...args(), overlays: [unresolved] })).toThrow('NOT_EXACT_LEGACY_HINT');
  });

  it('rejects a missing hint vector and a duplicate candidate', () => {
    const a = args(); a.hintVectors = new Map([...a.hintVectors].filter(([k]) => k !== 'c-a'));
    expect(() => buildLegacySummaryHintFeatureV2(a)).toThrow('VECTOR_MISSING');
    expect(() => buildLegacySummaryHintFeatureV2({ ...args(), candidates: [...candidates, candidates[0]!] })).toThrow('DUPLICATE_CANDIDATE');
  });
});

describe('RF-04 wrapper: legacy_summary_cosine_max producer artifact', () => {
  const VEC = 'sha256:' + 'e'.repeat(64);
  const wrap = (rows = buildLegacySummaryHintFeatureV2(args()).rows) => buildLegacySummaryCosineMaxProducerArtifactV2({
    rows, producerRevision: 'sha256:' + '1'.repeat(64), inputChecksum: 'sha256:' + '2'.repeat(64), hintVectorArtifactChecksum: VEC,
  });

  it('is PARTIAL with rows only for DERIVED candidates and raw cosine as value', () => {
    const a = wrap();
    expect(a.featureName).toBe('legacy_summary_cosine_max');
    expect(a.state).toBe('PARTIAL');
    expect(a.candidateRowCount).toBe(3);
    expect(a.rows.map((r) => r.candidateOrdinal)).toEqual([0, 2]);
    expect(a.rows.find((r) => r.candidateOrdinal === 2)!.value).toBeCloseTo(-1, 5); // raw cosine; score01 is diagnostic-only
    expect(a.derivation).toBe('LEGACY_SUMMARY_HINT_MAX_COSINE');
    expect(a.representationId).toBe('semantic_768');
    expect(a.sourceRepresentationId).toBe('semantic_768');
    expect(a.sourceRepresentationRevision).toBe(args().queryEmbeddingDigest);
    expect(a.canonicalAuthority).toBe(false);
    expect(a.retrievalVote).toBe(false);
    expect(() => verifyRepairFeatureProducerArtifactV1(a)).not.toThrow();
  });

  it('producer set marks only this feature PARTIAL; every other overlay feature stays UNAVAILABLE', () => {
    const a = wrap();
    const set = buildRepairFeatureProducerSetV1({ candidateSnapshotRevision: SNAP, ordinalMapChecksum: MAP, candidateRowCount: 3, artifacts: [a] });
    const states = Object.entries(set.overlayFeatureStates).filter(([, v]) => v !== 'UNAVAILABLE');
    expect(states).toEqual([['legacy_summary_cosine_max', 'PARTIAL']]);
    expect(set.overlayRows.map((r) => r.candidateOrdinal)).toEqual([0, 2]);
  });

  it('RF-05 presence bridge exposes PARTIAL for this feature and changes nothing else', () => {
    const set = buildRepairFeatureProducerSetV1({ candidateSnapshotRevision: SNAP, ordinalMapChecksum: MAP, candidateRowCount: 3, artifacts: [wrap()] });
    const without = buildRepairFeaturePresenceEvidenceV1({ candidateSnapshotRevision: SNAP, ordinalMapChecksum: MAP, candidateRowCount: 3 });
    const withSet = buildRepairFeaturePresenceEvidenceV1({ candidateSnapshotRevision: SNAP, ordinalMapChecksum: MAP, candidateRowCount: 3, repairProducerSet: set });
    expect(without.featurePresence.legacySummaryCosineMax).toBe('UNAVAILABLE');
    expect(withSet.featurePresence.legacySummaryCosineMax).toBe('PARTIAL');
    const { legacySummaryCosineMax: _a, ...restWithout } = without.featurePresence;
    const { legacySummaryCosineMax: _b, ...restWith } = withSet.featurePresence;
    expect(restWith).toEqual(restWithout);
  });

  it('rejects a tampered artifact value, wrong derivation, wrong representation, and missing revision', () => {
    const a = wrap();
    const tampered = JSON.parse(JSON.stringify(a));
    tampered.rows[0].value = 0.99;
    expect(() => verifyRepairFeatureProducerArtifactV1(tampered)).toThrow();
    const bad = (over: Record<string, unknown>) => () => {
      // rebuild through the public builder path with an invalid derivation metadata field
      return buildLegacySummaryCosineMaxProducerArtifactV2({ rows: buildLegacySummaryHintFeatureV2(args()).rows, producerRevision: 'x', inputChecksum: 'sha256:' + '2'.repeat(64), hintVectorArtifactChecksum: VEC, ...over } as never);
    };
    expect(bad({ inputChecksum: 'not-a-digest' })).toThrow();
    expect(() => wrap([])).toThrow('NO_CANDIDATES');
    const noDerived = buildLegacySummaryHintFeatureV2(args()).rows.map((r) => ({ ...r, state: 'UNAVAILABLE' as const, rawCosine: null, score01: null }));
    expect(() => wrap(noDerived)).toThrow('NO_DERIVED_ROWS');
  });

  it('wrong snapshot / ordinal checksum between artifact and set are rejected', () => {
    const a = wrap();
    expect(() => buildRepairFeatureProducerSetV1({ candidateSnapshotRevision: 'sha256:' + 'f'.repeat(64), ordinalMapChecksum: MAP, candidateRowCount: 3, artifacts: [a] })).toThrow('CANDIDATE_SNAPSHOT_MISMATCH');
    expect(() => buildRepairFeatureProducerSetV1({ candidateSnapshotRevision: SNAP, ordinalMapChecksum: '9'.repeat(64), candidateRowCount: 3, artifacts: [a] })).toThrow('ORDINAL_MAP_MISMATCH');
  });
});

describe('RF-04 conformance pins', () => {
  const VEC = 'sha256:' + 'e'.repeat(64);
  const good = () => buildLegacySummaryHintFeatureV2(args()).rows;
  const wrap = (rows = good()) => buildLegacySummaryCosineMaxProducerArtifactV2({ rows, producerRevision: 'sha256:' + '1'.repeat(64), inputChecksum: 'sha256:' + '2'.repeat(64), hintVectorArtifactChecksum: VEC });
  const rawInput = (over: Record<string, unknown> = {}) => ({
    featureName: 'legacy_summary_cosine_max' as const, state: 'PARTIAL' as const,
    candidateSnapshotRevision: SNAP, ordinalMapChecksum: MAP, candidateRowCount: 3,
    producerId: 'p', producerRevision: 'r', derivation: 'LEGACY_SUMMARY_HINT_MAX_COSINE' as const,
    inputChecksum: 'sha256:' + '2'.repeat(64), representationId: 'semantic_768', representationRevision: 'rep-rev',
    sourceRepresentationId: 'semantic_768', sourceRepresentationRevision: 'src-rev',
    rows: [{ candidateOrdinal: 0, value: 0.5 }], ...over,
  });

  it('accepts a partial row set as PARTIAL; rejects it as DERIVED; rejects a full row set as PARTIAL', () => {
    expect(() => buildRepairFeatureProducerArtifactV1(rawInput())).not.toThrow();
    expect(() => buildRepairFeatureProducerArtifactV1(rawInput({ state: 'DERIVED' }))).toThrow('COMPLETE_STATE_INCOMPLETE');
    const full = [0, 1, 2].map((o) => ({ candidateOrdinal: o, value: 0.1 }));
    expect(() => buildRepairFeatureProducerArtifactV1(rawInput({ rows: full }))).toThrow('PARTIAL_STATE_NOT_PARTIAL');
  });

  it('rejects wrong derivation, wrong representation, missing revisions, and the derivation on another feature', () => {
    expect(() => buildRepairFeatureProducerArtifactV1(rawInput({ derivation: 'OTHER_DERIVED' }))).toThrow('LEGACY_SUMMARY_DERIVATION_INVALID');
    expect(() => buildRepairFeatureProducerArtifactV1(rawInput({ representationId: 'latent_256' }))).toThrow('LEGACY_SUMMARY_REPRESENTATION_INVALID');
    expect(() => buildRepairFeatureProducerArtifactV1(rawInput({ sourceRepresentationId: null }))).toThrow('LEGACY_SUMMARY_REPRESENTATION_INVALID');
    expect(() => buildRepairFeatureProducerArtifactV1(rawInput({ representationRevision: '' }))).toThrow('LEGACY_SUMMARY_REVISION_REQUIRED');
    expect(() => buildRepairFeatureProducerArtifactV1(rawInput({ sourceRepresentationRevision: '  ' }))).toThrow('LEGACY_SUMMARY_REVISION_REQUIRED');
    expect(() => buildRepairFeatureProducerArtifactV1(rawInput({ featureName: 'postgres_fts_score' }))).toThrow('DERIVATION_WRONG_FEATURE');
  });

  it('every winning-row input checksum binds its evidence: changing any bound field changes it; tampering invalidates the artifact', () => {
    const rows = good();
    const base = wrap(rows);
    const derivedRows = rows.filter((r) => r.state === 'DERIVED');
    for (const mutate of [
      (r: any) => ({ ...r, matrixRowIndex: r.matrixRowIndex + 1 }),
      (r: any) => ({ ...r, winningChunkRowId: 'other' }),
      (r: any) => ({ ...r, winningCanonicalChunkId: 'other' }),
      (r: any) => ({ ...r, winningSummaryDigest: 'sha256:x' }),
      (r: any) => ({ ...r, winningSummaryVectorDigest: 'sha256:y' }),
      (r: any) => ({ ...r, matchedHintCount: r.matchedHintCount + 1 }),
    ]) {
      const changed = wrap(rows.map((r) => (r.candidateOrdinal === derivedRows[0]!.candidateOrdinal ? mutate(r) : r)));
      const a = base.rows.find((r) => r.candidateOrdinal === derivedRows[0]!.candidateOrdinal)!.inputRowChecksum;
      const b = changed.rows.find((r) => r.candidateOrdinal === derivedRows[0]!.candidateOrdinal)!.inputRowChecksum;
      expect(b).not.toBe(a);
    }
    const t = JSON.parse(JSON.stringify(base)); t.rows[0].inputRowChecksum = '0'.repeat(64);
    expect(() => verifyRepairFeatureProducerArtifactV1(t)).toThrow('CHECKSUM_MISMATCH');
  });

  it('producer-set rebuild preserves exactly the produced rows; matrix coverage is present/missing with presenceMask 0 for absent rows', () => {
    const a = wrap();
    const set = buildRepairFeatureProducerSetV1({ candidateSnapshotRevision: SNAP, ordinalMapChecksum: MAP, candidateRowCount: 3, artifacts: [a] });
    expect(set.overlayRows).toHaveLength(a.rows.length);
    const ordered = [...candidates].sort((x, y) => x.candidateOrdinal - y.candidateOrdinal);
    const baseMatrix = buildCandidateFeatureMatrix(ordered.map((c) => ({ packet_key: c.packetKey })));
    const bundle = buildRepairCandidateFeatureBundleV1({
      matrixInput: {
        baseMatrix, baseMatrixManifestChecksum: 'sha256:' + '3'.repeat(64), candidateSnapshotRevision: SNAP, ordinalMapChecksum: MAP, producerRevision: 'p',
        identities: ordered.map((c) => ({ candidateOrdinal: c.candidateOrdinal, packetKey: c.packetKey, sourceRef: c.sourceRef })),
      },
      producerSet: set,
    });
    const cov = bundle.matrix.overlayCoverage.legacy_summary_cosine_max;
    expect(cov).toEqual({ state: 'PARTIAL', presentRows: 2, missingRows: 1 });
    const col = bundle.matrix.baseFeatureCount + bundle.matrix.repairFeatureNames.indexOf('legacy_summary_cosine_max');
    // ordinal 1 has no HINT: masked, and the physical zero is a storage value, not a feature value
    expect(bundle.matrix.presenceMask[1 * bundle.matrix.featureCount + col]).toBe(0);
    expect(bundle.matrix.presenceMask[0 * bundle.matrix.featureCount + col]).toBe(1);
  });
});
