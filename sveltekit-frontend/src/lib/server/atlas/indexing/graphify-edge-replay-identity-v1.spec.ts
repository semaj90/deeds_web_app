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
  graphRevision: 'sha256:graph1',
  producerRevision: 'p1',
  targetSourceRevisionOf: (key) => (key.includes('b.ts') ? REV_B : key.includes('a.ts') ? REV_A : null),
};

describe('graphify_edges replay identity (GSP-5 groundwork)', () => {
  it('derives a deterministic key that ignores confidence and evidenceRefs order', () => {
    const a = deriveGraphifyEdgeReplayVerdictV1(edge(), ctx);
    const b = deriveGraphifyEdgeReplayVerdictV1(edge({ confidence: 0.5, evidenceRefs: ['ref:1', 'ref:2'], referenceId: 'r9' }), ctx);
    expect(a.admission).toBe('ADMITTED');
    expect(a.edgeKey).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(b.edgeKey).toBe(a.edgeKey);
    expect(b.payloadChecksum).not.toBe(a.payloadChecksum);
  });

  it('every identity input changes the key', () => {
    const base = deriveGraphifyEdgeReplayVerdictV1(edge(), ctx).edgeKey;
    const variants: [string, GraphifyEdgeProjectionCandidateV1, GraphifyEdgeReplayContextV1][] = [
      ['predicate', edge({ predicate: 'IMPORTS' }), ctx],
      ['subject', edge({ subjectStableSymbolKey: 'sym:a.ts#other' }), ctx],
      ['object', edge({ objectStableSymbolKey: 'sym:a.ts#fnC' }), ctx],
      ['sourceRevision', edge({ sourceRevision: REV_B }), ctx],
      ['workspaceRevision', edge({ workspaceRevision: `sha256:${'d'.repeat(64)}` }), ctx],
      ['span', edge({ evidenceSpan: { startByte: 11, endByte: 20, startRow: 1, endRow: 1 } }), ctx],
      ['graphRevision', edge(), { ...ctx, graphRevision: 'sha256:graph2' }],
      ['producerRevision', edge(), { ...ctx, producerRevision: 'p2' }],
    ];
    for (const [name, e, c] of variants) expect([name, deriveGraphifyEdgeReplayVerdictV1(e, c).edgeKey]).not.toEqual([name, base]);
  });

  it('keeps unresolved and unbound edges out of the admitted set with the named codes', () => {
    expect(deriveGraphifyEdgeReplayVerdictV1(edge({ objectStableSymbolKey: null, unresolvedTarget: 'external.thing' }), ctx).admission).toBe('UNRESOLVED_TARGET');
    expect(deriveGraphifyEdgeReplayVerdictV1(edge({ sourceRevision: 'HEAD' }), ctx).admission).toBe('SOURCE_REVISION_UNBOUND');
    expect(deriveGraphifyEdgeReplayVerdictV1(edge({ objectStableSymbolKey: 'sym:zzz.ts#x' }), ctx).admission).toBe('TARGET_REVISION_UNBOUND');
    expect(deriveGraphifyEdgeReplayVerdictV1(edge(), { graphRevision: 'g', producerRevision: 'p' }).admission).toBe('TARGET_REVISION_UNBOUND');
    expect(deriveGraphifyEdgeReplayVerdictV1(edge({ subjectStableSymbolKey: ' ' }), ctx).admission).toBe('UNRESOLVED_SOURCE');
  });

  it('plans a batch deterministically regardless of input order and collapses exact duplicates', () => {
    const e1 = edge();
    const e2 = edge({ predicate: 'IMPORTS', referenceId: 'r2' });
    const e3 = edge({ objectStableSymbolKey: null, unresolvedTarget: 'ext' });
    const forward = planGraphifyEdgeReplayV1([e1, e2, e3, edge()], ctx);
    const reversed = planGraphifyEdgeReplayV1([edge(), e3, e2, e1], ctx);
    expect(forward.planChecksum).toBe(reversed.planChecksum);
    expect(forward.counts).toMatchObject({ total: 4, ADMITTED: 3, UNRESOLVED_TARGET: 1, duplicatesCollapsed: 1 });
    expect(forward.admitted.map((a) => a.edgeKey)).toEqual(reversed.admitted.map((a) => a.edgeKey));
  });

  it('surfaces a same-key different-payload pair as a conflict and admits neither', () => {
    const plan = planGraphifyEdgeReplayV1([edge({ confidence: 0.9 }), edge({ confidence: 0.4 })], ctx);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.admitted).toHaveLength(0);
  });

  it('refuses an invalid context instead of defaulting a revision', () => {
    expect(() => deriveGraphifyEdgeReplayVerdictV1(edge(), { graphRevision: '', producerRevision: 'p' })).toThrow(/CONTEXT_INVALID/);
  });
});
