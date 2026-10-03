import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  compileSummaryRoutingPayloadV1, projectSummaryEmbeddingJobV1, SummaryRoutingPayloadV1Schema, SummaryEmbeddingJobV1Schema,
  type SummaryRoutingCompileInputV1,
} from './summary-routing-payload-v1.js';

const sha = (t: string) => `sha256:${createHash('sha256').update(t, 'utf8').digest('hex')}`;
const TEXT = 'Validates the session token and returns the authenticated user record.';
const identity = { chunkRowId: '11111111-1111-4111-8111-111111111111', canonicalChunkId: 'canon:1', packetKey: 'packet:1', sourceRef: 'src/a.ts', sourceRevision: 'sha256:aa', workspaceRevision: 'sha256:ws', bindingChecksum: 'bind:1', candidateOrdinal: 4 };
const goodProv = () => ({ schema: 'atlas.summary-provenance.v1', sourceRevision: 'sha256:aa', workspaceRevision: 'sha256:ws', summaryDigest: sha(TEXT), modelId: 'ornith-1.5-9b', modelRevision: null, promptTemplateRevision: 'p1', admission: { status: 'ADMITTED' } });
const base = (over: Partial<SummaryRoutingCompileInputV1> = {}): SummaryRoutingCompileInputV1 => ({
  identity, summaryText: TEXT, summaryProvenance: goodProv(), legacyChunkSummary: null, packetSummary: null, layerSummary: null,
  summaryEmbeddingPresent: false, summaryEmbeddingMeta: null, summaryEmbedding384Present: false, routing: { domainClass: 'backend', clusterId: 3, somCell: [7, 14] }, evidenceRefs: ['e2', 'e1'], ...over,
});

describe('SummaryRoutingPayloadV1', () => {
  it('CURRENT only when ADMITTED with exact revisions and digest; deterministic checksum', () => {
    const a = compileSummaryRoutingPayloadV1(base());
    const b = compileSummaryRoutingPayloadV1(base());
    expect(a.summary.state).toBe('CURRENT');
    expect(a.summary.source).toBe('CANONICAL_SUMMARY_TEXT');
    expect(a.payloadChecksum).toBe(b.payloadChecksum);
    expect(a.evidenceRefs).toEqual(['e1', 'e2']);
    expect(a.canonicalAuthority).toBe(false);
    expect(SummaryRoutingPayloadV1Schema.parse(JSON.parse(JSON.stringify(a))).payloadChecksum).toBe(a.payloadChecksum);
  });
  it('BLOCKED on any revision/digest/admission mismatch, never CURRENT', () => {
    for (const [mut, reason] of [
      [{ sourceRevision: 'sha256:bb' }, 'SOURCE_REVISION_MISMATCH'], [{ workspaceRevision: 'sha256:other' }, 'WORKSPACE_REVISION_MISMATCH'],
      [{ summaryDigest: sha('other') }, 'SUMMARY_DIGEST_MISMATCH'], [{ admission: { status: 'BLOCKED_CONTAMINATION' } }, 'NOT_ADMITTED'],
    ] as const) {
      const p = compileSummaryRoutingPayloadV1(base({ summaryProvenance: { ...goodProv(), ...mut } }));
      expect(p.summary.state).toBe('BLOCKED');
      expect(p.summary.blockReasons).toContain(reason);
    }
    expect(compileSummaryRoutingPayloadV1(base({ summaryProvenance: null })).summary.blockReasons).toContain('PROVENANCE_MISSING');
  });
  it('LEGACY_CARRIED with exact revisions/digest is a persisted HINT, never CURRENT, never job-eligible', () => {
    const p = compileSummaryRoutingPayloadV1(base({ summaryProvenance: { ...goodProv(), admission: { status: 'LEGACY_CARRIED' } } }));
    expect(p.summary).toMatchObject({ state: 'HINT', source: 'CANONICAL_SUMMARY_TEXT', admissionStatus: 'LEGACY_CARRIED', blockReasons: [] });
    expect(projectSummaryEmbeddingJobV1(p, 'p')).toBeNull();
    const stale = compileSummaryRoutingPayloadV1(base({ summaryProvenance: { ...goodProv(), sourceRevision: 'sha256:zz', admission: { status: 'LEGACY_CARRIED' } } }));
    expect(stale.summary.state).toBe('BLOCKED');
  });
  it('legacy chunk summary: quarantine overrides a clean detector; contaminated blocks; clean is a lineage-bound HINT with unknown generation input', () => {
    const noText = { summaryText: null, summaryProvenance: null, legacyChunkSummary: 'A clean legacy summary of the chunk.' };
    const q = (clean: boolean, quarantined: boolean) => ({ clean, quarantined, detectorRevision: 'summary-quality-v1' });
    const quar = compileSummaryRoutingPayloadV1(base({ ...noText, legacyQuality: q(true, true) }));
    expect(quar.summary).toMatchObject({ state: 'BLOCKED', source: 'LEGACY_CHUNK_SUMMARY', blockReasons: ['LEGACY_QUARANTINED'] });
    expect(compileSummaryRoutingPayloadV1(base({ ...noText, legacyQuality: q(false, false) })).summary.blockReasons).toEqual(['LEGACY_CONTAMINATED']);
    const ok = compileSummaryRoutingPayloadV1(base({ ...noText, legacyQuality: q(true, false) }));
    expect(ok.summary).toMatchObject({ state: 'HINT', hintClass: 'LEGACY_HINT_LINEAGE_BOUND', sourceAlignment: { status: 'CURRENT_LINEAGE_EXACT', sourceRevision: 'sha256:aa' }, generationAlignment: { status: 'UNKNOWN', inputDigest: null } });
    expect(ok.summary.textDigest).toBe(sha(noText.legacyChunkSummary));
    expect(projectSummaryEmbeddingJobV1(ok, 'p')).toBeNull();
    expect(compileSummaryRoutingPayloadV1(base({ ...noText })).summary.quality).toEqual({ clean: null, quarantined: null, detectorRevision: null });
  });
  it('legacy texts are HINT with fixed priority; nothing becomes CURRENT; none -> MISSING', () => {
    const noText = { summaryText: null, summaryProvenance: null };
    expect(compileSummaryRoutingPayloadV1(base({ ...noText, legacyChunkSummary: 'legacy', packetSummary: 'pkt', layerSummary: 'lay' })).summary).toMatchObject({ state: 'HINT', source: 'LEGACY_CHUNK_SUMMARY' });
    expect(compileSummaryRoutingPayloadV1(base({ ...noText, packetSummary: 'pkt', layerSummary: 'lay' })).summary).toMatchObject({ state: 'HINT', source: 'PACKET_SUMMARY' });
    expect(compileSummaryRoutingPayloadV1(base({ ...noText, layerSummary: 'lay' })).summary).toMatchObject({ state: 'HINT', source: 'SUMMARY_LAYER' });
    expect(compileSummaryRoutingPayloadV1(base(noText)).summary).toMatchObject({ state: 'MISSING', source: 'NONE', textDigest: null });
  });
  it('a legacy vector without matching provenance is never available; bound vector is', () => {
    const legacy = compileSummaryRoutingPayloadV1(base({ summaryEmbeddingPresent: true, summaryEmbedding384Present: true }));
    expect(legacy.semantic).toMatchObject({ summaryEmbeddingAvailable: false, legacyUnboundVectorPresent: true, legacy384Present: true, vectorDigest: null });
    const meta = { representationId: 'semantic_768', representationRevision: 'rep-1', summaryInputDigest: sha(TEXT), vectorDigest: sha('vec') };
    const bound = compileSummaryRoutingPayloadV1(base({ summaryEmbeddingPresent: true, summaryEmbeddingMeta: meta }));
    expect(bound.semantic).toMatchObject({ summaryEmbeddingAvailable: true, representationRevision: 'rep-1', legacyUnboundVectorPresent: false });
    const wrongInput = compileSummaryRoutingPayloadV1(base({ summaryEmbeddingPresent: true, summaryEmbeddingMeta: { ...meta, summaryInputDigest: sha('other') } }));
    expect(wrongInput.semantic.summaryEmbeddingAvailable).toBe(false);
  });
  it('schema rejects a tampered body and an inconsistent CURRENT', () => {
    const p = JSON.parse(JSON.stringify(compileSummaryRoutingPayloadV1(base())));
    p.routing.domainClass = 'tampered';
    expect(() => SummaryRoutingPayloadV1Schema.parse(p)).toThrow();
    const q = JSON.parse(JSON.stringify(compileSummaryRoutingPayloadV1(base())));
    q.canonicalAuthority = true;
    expect(() => SummaryRoutingPayloadV1Schema.parse(q)).toThrow();
  });
});

describe('SummaryEmbeddingJobV1 projection', () => {
  it('projects an identity-only job for CURRENT + no bound vector; deterministic jobId; no text', () => {
    const p = compileSummaryRoutingPayloadV1(base());
    const j = projectSummaryEmbeddingJobV1(p, 'producer:r1')!;
    expect(SummaryEmbeddingJobV1Schema.parse(j)).toBeTruthy();
    expect(j.jobId).toBe(projectSummaryEmbeddingJobV1(p, 'producer:r1')!.jobId);
    expect(JSON.stringify(j)).not.toContain(TEXT);
    expect(j.summaryDigest).toBe(sha(TEXT));
    expect(j.routingPayloadChecksum).toBe(p.payloadChecksum);
  });
  it('no job for HINT, BLOCKED, MISSING, or an already-bound vector; jobId changes with the summary', () => {
    expect(projectSummaryEmbeddingJobV1(compileSummaryRoutingPayloadV1(base({ summaryText: null, summaryProvenance: null, legacyChunkSummary: 'x' })), 'p')).toBeNull();
    expect(projectSummaryEmbeddingJobV1(compileSummaryRoutingPayloadV1(base({ summaryProvenance: { ...goodProv(), sourceRevision: 'sha256:zz' } })), 'p')).toBeNull();
    expect(projectSummaryEmbeddingJobV1(compileSummaryRoutingPayloadV1(base({ summaryText: null, summaryProvenance: null })), 'p')).toBeNull();
    const meta = { representationId: 'semantic_768', representationRevision: 'rep-1', summaryInputDigest: sha(TEXT), vectorDigest: sha('vec') };
    expect(projectSummaryEmbeddingJobV1(compileSummaryRoutingPayloadV1(base({ summaryEmbeddingPresent: true, summaryEmbeddingMeta: meta })), 'p')).toBeNull();
    const T2 = 'A different admitted summary of the same chunk text.';
    const p2 = compileSummaryRoutingPayloadV1(base({ summaryText: T2, summaryProvenance: { ...goodProv(), summaryDigest: sha(T2) } }));
    expect(projectSummaryEmbeddingJobV1(p2, 'p')!.jobId).not.toBe(projectSummaryEmbeddingJobV1(compileSummaryRoutingPayloadV1(base()), 'p')!.jobId);
  });
});
