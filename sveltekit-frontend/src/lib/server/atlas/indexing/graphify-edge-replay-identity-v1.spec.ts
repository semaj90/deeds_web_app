// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { graphifyEdgeProjectionCandidateV1Schema, type GraphifyEdgeProjectionCandidateV1 } from './graphify-symbol-projection-v1.js';
import { deriveGraphifyEdgeReplayVerdictV1, planGraphifyEdgeReplayV1, type GraphifyEdgeReplayContextV1 } from './graphify-edge-replay-identity-v1.js';

const REV_A = `sha256:${'a'.repeat(64)}`;
const REV_B = `sha256:${'b'.repeat(64)}`;
const WS = `sha256:${'e'.repeat(64)}`;

const edge = (over: Record<string, unknown> = {}): GraphifyEdgeProjectionCandidateV1 => graphifyEdgeProjectionCandidateV1Schema.parse({
  schema: 'atlas.graphify-edge-projection-candidate.v1',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  workspaceRevision: WS,
  sourceRef: 'src/a.ts',
  sourceRevision: REV_A,
  subjectStableSymbolKey: 'sym:a.ts#fnA',
  predicate: 'CALLS',
  objectStableSymbolKey: 'sym:b.ts#fnB',
  unresolvedTarget: null,
  evidenceKind: 'AST_REFERENCE',
  evidenceSpan: { startByte: 10, endByte: 20, startRow: 1, endRow: 1 },
  confidence: 0.9,
  evidenceRefs: ['ref:2', 'ref:1'],
  referenceId: 'r1',
  ...over,
});
const ctx: GraphifyEdgeReplayContextV1 = {
  workspaceRevisionKey: WS,
  graphRevision: 'sha256:graph1',
  producerRevision: 'p1',
  targetSourceRevisionOf: (key) => (key.includes('b.ts') ? REV_B : key.includes('a.ts') ? REV_A : null),
};

describe('graphify_edges replay identity (GSP-5 groundwork)', () => {
  it('edge identity is independent of evidence: span, confidence, refs and referenceId do not change the key', () => {
    const a = deriveGraphifyEdgeReplayVerdictV1(edge(), ctx);
    const b = deriveGraphifyEdgeReplayVerdictV1(edge({
      confidence: 0.5, evidenceRefs: ['ref:9'], referenceId: 'r9', evidenceKind: 'OTHER',
      evidenceSpan: { startByte: 99, endByte: 120, startRow: 4, endRow: 4 },
    }), ctx);
    expect(a.admission).toBe('ADMITTED');
    expect(a.edgeKey).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(b.edgeKey).toBe(a.edgeKey);
  });

  it('every identity input changes the key', () => {
    const base = deriveGraphifyEdgeReplayVerdictV1(edge(), ctx).edgeKey;
    const variants: [string, GraphifyEdgeProjectionCandidateV1, GraphifyEdgeReplayContextV1][] = [
      ['predicate', edge({ predicate: 'IMPORTS' }), ctx],
      ['subject', edge({ subjectStableSymbolKey: 'sym:a.ts#other' }), ctx],
      ['object', edge({ objectStableSymbolKey: 'sym:a.ts#fnC' }), ctx],
      ['sourceRevision', edge({ sourceRevision: REV_B }), ctx],
      ['targetSourceRevision', edge(), { ...ctx, targetSourceRevisionOf: () => REV_A }],
      ['graphRevision', edge(), { ...ctx, graphRevision: 'sha256:graph2' }],
      ['producerRevision', edge(), { ...ctx, producerRevision: 'p2' }],
    ];
    for (const [name, e, c] of variants) expect([name, deriveGraphifyEdgeReplayVerdictV1(e, c).edgeKey]).not.toEqual([name, base]);
  });

  it('keeps every unresolved, unbound or mismatched edge out of the admitted set with a named code', () => {
    const code = (e: GraphifyEdgeProjectionCandidateV1, c: GraphifyEdgeReplayContextV1 = ctx) => deriveGraphifyEdgeReplayVerdictV1(e, c).admission;
    expect(code(edge({ objectStableSymbolKey: null, unresolvedTarget: 'external.thing' }))).toBe('UNRESOLVED_TARGET');
    expect(code(edge({ subjectStableSymbolKey: ' ' }))).toBe('UNRESOLVED_SOURCE');
    expect(code(edge({ sourceRevision: 'HEAD' }))).toBe('SOURCE_REVISION_UNBOUND');
    expect(code(edge({ objectStableSymbolKey: 'sym:zzz.ts#x' }))).toBe('TARGET_REVISION_UNBOUND');
    expect(code(edge(), { workspaceRevisionKey: WS, graphRevision: 'g', producerRevision: 'p' })).toBe('TARGET_REVISION_UNBOUND');
    expect(code(edge({ workspaceRevision: `sha256:${'d'.repeat(64)}` }))).toBe('WORKSPACE_REVISION_MISMATCH');
    expect(code(edge({ evidenceRefs: [], evidenceSpan: { startByte: 5, endByte: 5, startRow: 1, endRow: 1 } }))).toBe('EVIDENCE_UNBOUND');
  });

  it('several call sites of one fact become ONE logical edge with several evidence entries', () => {
    const site2 = edge({ evidenceSpan: { startByte: 40, endByte: 55, startRow: 3, endRow: 3 }, referenceId: 'r2', confidence: 0.7 });
    const plan = planGraphifyEdgeReplayV1([edge(), site2, edge()], ctx);
    expect(plan.admitted).toHaveLength(1);
    expect(plan.admitted[0].evidence).toHaveLength(2);
    expect(plan.counts).toMatchObject({ total: 3, ADMITTED: 3, mergedEvidenceEntries: 2, collisions: 0 });
    expect(plan.collisions).toEqual([]);
  });

  it('plans a batch deterministically regardless of input order', () => {
    const e1 = edge();
    const e2 = edge({ predicate: 'IMPORTS', referenceId: 'r2' });
    const e3 = edge({ objectStableSymbolKey: null, unresolvedTarget: 'ext' });
    const site2 = edge({ evidenceSpan: { startByte: 40, endByte: 55, startRow: 3, endRow: 3 }, referenceId: 'r5' });
    const forward = planGraphifyEdgeReplayV1([e1, e2, e3, site2], ctx);
    const reversed = planGraphifyEdgeReplayV1([site2, e3, e2, e1], ctx);
    expect(forward.planChecksum).toBe(reversed.planChecksum);
    expect(forward.admitted.map((a) => [a.edgeKey, a.evidenceChecksum])).toEqual(reversed.admitted.map((a) => [a.edgeKey, a.evidenceChecksum]));
    expect(forward.counts).toMatchObject({ total: 4, ADMITTED: 3, UNRESOLVED_TARGET: 1 });
  });

  it('changing the evidence changes the evidence checksum and the plan checksum, not the edge key', () => {
    const before = planGraphifyEdgeReplayV1([edge()], ctx);
    const after = planGraphifyEdgeReplayV1([edge({ confidence: 0.2 })], ctx);
    expect(after.admitted[0].edgeKey).toBe(before.admitted[0].edgeKey);
    expect(after.admitted[0].evidenceChecksum).not.toBe(before.admitted[0].evidenceChecksum);
    expect(after.planChecksum).not.toBe(before.planChecksum);
  });

  it('refuses an invalid context instead of defaulting a revision', () => {
    expect(() => deriveGraphifyEdgeReplayVerdictV1(edge(), { ...ctx, graphRevision: '' })).toThrow(/CONTEXT_INVALID/);
    expect(() => deriveGraphifyEdgeReplayVerdictV1(edge(), { ...ctx, workspaceRevisionKey: '' })).toThrow(/CONTEXT_INVALID/);
  });
});
