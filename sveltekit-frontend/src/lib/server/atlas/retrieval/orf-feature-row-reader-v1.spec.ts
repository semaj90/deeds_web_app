// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildRouterRowsForAcceptedV1, readOrfRowsForCandidatesV1, type OrfCandidateV1, type OrfDbRowV1 } from './orf-feature-row-reader-v1.js';

const WS = 'sha256:' + 'e'.repeat(64);
const REV = 'feature-rev:v1';
const mask = (i: number) => Array.from({ length: 32 }, (_, k) => (k === i ? 1 : 0));
const cand = (n: number): OrfCandidateV1 => ({ candidateOrdinal: n, canonicalId: `ace:packet:${n}`, packetKey: `ace:packet:${n}`, sourceRef: `src/f${n}.ts`, workspaceRevision: WS });
const row = (n: number, over: Partial<OrfDbRowV1> = {}): OrfDbRowV1 => ({
  packet_key: `ace:packet:${n}`, feature_revision: REV, source_ref: `src/f${n}.ts`, source_version_receipt_id: null,
  workspace_revision: WS, representation_id: 'semantic_768', representation_revision: 'repr:r1', tree_node_id: null,
  ontology_classes: [], ast_observation_kinds: ['FUNCTION'], langextract_classes: [], flattened_tags: ['ast=function'],
  ontology_mask: mask(0), ast_pattern_mask: mask(1), structural_flags: { hasFunction: true }, evidence_refs: ['e:1'],
  producer_revision: 'prod:r1', input_digest: 'a'.repeat(64), ...over,
});

describe('ACE-FSO-03 exact-gate ORF reader', () => {
  it('accepts only exact matches and never synthesizes a row', () => {
    const r = readOrfRowsForCandidatesV1({ candidates: [cand(0), cand(1)], rows: [row(0)], expectedFeatureRevision: REV, expectedRepresentationRevision: 'repr:r1' });
    expect(r.accepted.map((a) => a.candidateOrdinal)).toEqual([0]);
    expect(r.rejected).toEqual([{ candidateOrdinal: 1, packetKey: 'ace:packet:1', reason: 'NO_ORF_ROW' }]);
    expect(r.synthesizedRows).toBe(0);
    expect(r.writesPerformed).toBe(false);
  });

  it('rejects each mismatch class with its own reason', () => {
    const cases: Array<[Partial<OrfDbRowV1>, string]> = [
      [{ workspace_revision: null }, 'ORF_WORKSPACE_REVISION_NULL'],
      [{ workspace_revision: 'sha256:' + 'f'.repeat(64) }, 'ORF_WORKSPACE_REVISION_MISMATCH'],
      [{ representation_revision: null }, 'ORF_REPRESENTATION_REVISION_NULL'],
      [{ representation_revision: 'repr:other' }, 'ORF_REPRESENTATION_REVISION_MISMATCH'],
      [{ source_ref: 'src/other.ts' }, 'SOURCE_REF_MISMATCH'],
      [{ feature_revision: 'old-rev' }, 'FEATURE_REVISION_MISMATCH'],
      [{ input_digest: 'short' }, 'PROJECTION_INVALID'],
      [{ ontology_mask: [1, 0] }, 'PROJECTION_INVALID'],
    ];
    for (const [over, reason] of cases) {
      const r = readOrfRowsForCandidatesV1({ candidates: [cand(0)], rows: [row(0, over)], expectedFeatureRevision: REV, expectedRepresentationRevision: 'repr:r1' });
      expect(r.accepted).toHaveLength(0);
      expect(r.rejected[0].reason, JSON.stringify(over)).toBe(reason);
    }
  });

  it('rejects duplicate rows for one packet at the expected revision', () => {
    const r = readOrfRowsForCandidatesV1({ candidates: [cand(0)], rows: [row(0), row(0, { producer_revision: 'prod:r2' })], expectedFeatureRevision: REV, expectedRepresentationRevision: 'repr:r1' });
    expect(r.rejected[0].reason).toBe('MULTIPLE_ORF_ROWS');
  });

  it('reproduces the live shape: null workspace on every stored row -> zero accepted', () => {
    const rows = [0, 1, 2].map((n) => row(n, { workspace_revision: null, representation_revision: null }));
    const r = readOrfRowsForCandidatesV1({ candidates: [0, 1, 2].map(cand), rows, expectedFeatureRevision: REV, expectedRepresentationRevision: 'repr:r1' });
    expect(r.accepted).toHaveLength(0);
    expect(r.rejectionCounts).toEqual({ ORF_WORKSPACE_REVISION_NULL: 3 });
  });

  it('builds router rows through the existing builder; missing query-time input is reported, not defaulted', () => {
    const r = readOrfRowsForCandidatesV1({ candidates: [cand(0), cand(1)], rows: [row(0), row(1)], expectedFeatureRevision: REV, expectedRepresentationRevision: 'repr:r1' });
    const built = buildRouterRowsForAcceptedV1({
      accepted: r.accepted,
      queryTime: (o) => (o === 0 ? { semantic: { representationId: 'semantic_768', representationRevision: 'repr:r1', dimension: 768, cosine: 0.42 } } : null),
    });
    expect(built.rows).toHaveLength(1);
    expect(built.rows[0].semantic.cosine).toBe(0.42);
    expect(built.rows[0].workspaceRevision).toBe(WS);
    expect(built.rows[0].structure.hasFunction).toBe(true);
    expect(built.missingQueryTimeOrdinals).toEqual([1]);
  });
  it('is permutation-invariant: shuffled candidates and rows give identical output', () => {
    const cands = [0, 1, 2, 3].map(cand); const rows = [0, 1, 3].map((n) => row(n));
    const a = readOrfRowsForCandidatesV1({ candidates: cands, rows, expectedFeatureRevision: REV, expectedRepresentationRevision: 'repr:r1' });
    const b = readOrfRowsForCandidatesV1({ candidates: [...cands].reverse(), rows: [...rows].reverse(), expectedFeatureRevision: REV, expectedRepresentationRevision: 'repr:r1' });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a.accepted.map((x) => x.candidateOrdinal)).toEqual([0, 1, 3]);
    expect(a.rejected.map((x) => x.reason)).toEqual(['NO_ORF_ROW']);
  });
});
