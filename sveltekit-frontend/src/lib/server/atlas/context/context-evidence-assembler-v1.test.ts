import { describe, expect, it } from 'vitest';
import { assembleContextEvidenceV1, type EvidenceCandidate } from './context-evidence-assembler-v1.js';

const SHA = 'sha256:' + 'a'.repeat(64);
const WS = 'sha256:' + 'b'.repeat(64);

const qualified = (over: Partial<EvidenceCandidate> = {}): EvidenceCandidate => ({
  evidenceId: 'e1',
  sourceRef: 'src/a.ts',
  sourceRevision: SHA,
  workspaceRevision: WS,
  canonicalFeatureId: 'concept.chat',
  encoderId: 'embeddinggemma:latest',
  kind: 'source',
  text: 'chat handler',
  ...over,
});

describe('ContextEvidenceAssemblerV1', () => {
  it('accepts fully qualified evidence', () => {
    const r = assembleContextEvidenceV1([qualified()]);
    expect(r.accepted).toHaveLength(1);
    expect(r.rejected).toHaveLength(0);
    expect(r.writesPerformed).toBe(0);
    expect(r.canonicalAuthority).toBe(false);
  });

  it('rejects each missing or malformed provenance field with a typed reason', () => {
    const r = assembleContextEvidenceV1([
      qualified({ evidenceId: 'no-src', sourceRef: null }),
      qualified({ evidenceId: 'no-rev', sourceRevision: null }),
      qualified({ evidenceId: 'bad-rev', sourceRevision: 'abc' }),
      qualified({ evidenceId: 'no-ws', workspaceRevision: '' }),
      qualified({ evidenceId: 'no-concept', canonicalFeatureId: null }),
      qualified({ evidenceId: 'no-encoder', encoderId: null }),
    ]);
    expect(r.accepted).toHaveLength(0);
    const byId = Object.fromEntries(r.rejected.map((x) => [x.evidenceId, x.reasons]));
    expect(byId['no-src']).toEqual(['MISSING_SOURCE_REF']);
    expect(byId['no-rev']).toEqual(['MISSING_SOURCE_REVISION']);
    expect(byId['bad-rev']).toEqual(['MALFORMED_SOURCE_REVISION']);
    expect(byId['no-ws']).toEqual(['MISSING_WORKSPACE_REVISION']);
    expect(byId['no-concept']).toEqual(['MISSING_CANONICAL_CONCEPT']);
    expect(byId['no-encoder']).toEqual(['MISSING_ENCODER_IDENTITY']);
  });

  it('never defaults a missing revision', () => {
    const r = assembleContextEvidenceV1([qualified({ sourceRevision: undefined })]);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0].reasons).toContain('MISSING_SOURCE_REVISION');
  });

  it('rejects placeholder and malformed workspace revisions', () => {
    for (const value of ['0', 'null', 'UNKNOWN', 'current', 'sha256:abc']) {
      const result = assembleContextEvidenceV1([qualified({ workspaceRevision: value })]);
      expect(result.accepted).toHaveLength(0);
      expect(result.rejected[0].reasons.some(reason => reason.endsWith('WORKSPACE_REVISION'))).toBe(true);
    }
  });

  it('deduplicates identical evidence and rejects conflicting identity independently of order', () => {
    const one = qualified();
    expect(assembleContextEvidenceV1([one, { ...one }]).accepted).toHaveLength(1);
    const conflicting = qualified({ text: 'different source claim' });
    const forward = assembleContextEvidenceV1([one, conflicting]);
    const backward = assembleContextEvidenceV1([conflicting, one]);
    expect(forward.accepted).toHaveLength(0);
    expect(forward.rejected).toEqual([{ evidenceId: 'e1', reasons: ['CONFLICTING_EVIDENCE_ID'] }]);
    expect(forward).toEqual(backward);
  });

  it('rejects empty evidence and placeholder encoder identities', () => {
    const result = assembleContextEvidenceV1([qualified({ evidenceId: '', text: '', encoderId: 'unknown' })]);
    expect(result.rejected[0].reasons).toEqual(['MISSING_EVIDENCE_ID', 'MISSING_TEXT', 'MISSING_ENCODER_IDENTITY']);
  });

  it('is deterministic regardless of input order, and the checksum is stable', () => {
    const a = qualified({ evidenceId: 'x', sourceRef: 'b.ts' });
    const b = qualified({ evidenceId: 'y', sourceRef: 'a.ts' });
    const one = assembleContextEvidenceV1([a, b]);
    const two = assembleContextEvidenceV1([b, a]);
    expect(one.accepted.map((e) => e.sourceRef)).toEqual(['a.ts', 'b.ts']);
    expect(one.checksum).toBe(two.checksum);
  });
});

describe('ContextEvidenceAssemblerV1 — ENR-03 kind identity, stale joins, taxonomy', () => {
  it('rejects a missing evidence kind instead of defaulting it', () => {
    const r = assembleContextEvidenceV1([qualified({ kind: null })]);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0].reasons).toContain('MISSING_EVIDENCE_KIND');
  });

  it('requires producer revision and a valid byte span for AST evidence', () => {
    const noSpan = assembleContextEvidenceV1([qualified({ kind: 'ast', producerRevision: 'tree-sitter@0.25' })]);
    expect(noSpan.rejected[0].reasons).toContain('MISSING_BYTE_SPAN');
    const badSpan = assembleContextEvidenceV1([qualified({ kind: 'ast', producerRevision: 'tree-sitter@0.25', byteSpan: [20, 10] })]);
    expect(badSpan.rejected[0].reasons).toContain('MALFORMED_BYTE_SPAN');
    const noProducer = assembleContextEvidenceV1([qualified({ kind: 'ast', byteSpan: [10, 20] })]);
    expect(noProducer.rejected[0].reasons).toContain('MISSING_PRODUCER_REVISION');
    const ok = assembleContextEvidenceV1([qualified({ kind: 'ast', producerRevision: 'tree-sitter@0.25', byteSpan: [10, 20] })]);
    expect(ok.accepted[0]).toMatchObject({ kind: 'ast', byteSpan: [10, 20], producerRevision: 'tree-sitter@0.25' });
  });

  it('rejects a join whose source revision disagrees with the validated snapshot (stale join)', () => {
    const stale = 'sha256:' + 'c'.repeat(64);
    const r = assembleContextEvidenceV1([qualified({ sourceRevision: stale })], { snapshot: { 'src/a.ts': SHA } });
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0].reasons).toContain('STALE_SOURCE_REVISION');
  });

  it('accepts a join that matches the snapshot even when other files advanced', () => {
    const r = assembleContextEvidenceV1(
      [qualified(), qualified({ evidenceId: 'e2', sourceRef: 'src/b.ts', sourceRevision: 'sha256:' + 'd'.repeat(64) })],
      { snapshot: { 'src/a.ts': SHA, 'src/b.ts': 'sha256:' + 'd'.repeat(64) } }
    );
    expect(r.accepted.map((x) => x.evidenceId).sort()).toEqual(['e1', 'e2']);
  });

  it('keeps an unresolved taxonomy proposal unresolved, never accepted', () => {
    const r = assembleContextEvidenceV1([qualified({ evidenceId: 't1', kind: 'taxonomy', taxonomyStatus: 'UNRESOLVED' })]);
    expect(r.accepted).toHaveLength(0);
    expect(r.unresolved).toEqual([{ evidenceId: 't1', kind: 'taxonomy' }]);
  });

  it('admits a resolved taxonomy proposal', () => {
    const r = assembleContextEvidenceV1([qualified({ evidenceId: 't2', kind: 'taxonomy', taxonomyStatus: 'RESOLVED' })]);
    expect(r.accepted.map((x) => x.evidenceId)).toEqual(['t2']);
    expect(r.unresolved).toHaveLength(0);
  });

  it('reports no writes and no canonical authority', () => {
    const r = assembleContextEvidenceV1([qualified()]);
    expect(r.writesPerformed).toBe(0);
    expect(r.canonicalAuthority).toBe(false);
  });

  it('is order-independent: reordered rows give the same checksum', () => {
    const rows = [qualified(), qualified({ evidenceId: 'e2', sourceRef: 'src/b.ts' }), qualified({ evidenceId: 'e3', sourceRef: 'src/c.ts' })];
    expect(assembleContextEvidenceV1(rows).checksum).toBe(assembleContextEvidenceV1([...rows].reverse()).checksum);
  });
});
