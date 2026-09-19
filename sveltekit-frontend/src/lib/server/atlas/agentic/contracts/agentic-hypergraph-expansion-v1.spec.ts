import { describe, expect, it } from 'vitest';
import { buildAgenticHyperEdgeV1 } from './agentic-hyperedge-v1.js';
import { expandAgenticHyperEdgeV1 } from './agentic-hypergraph-expansion-v1.js';

const member = (ordinal: number, canonicalId: string | null, resolutionState: 'RESOLVED' | 'UNRESOLVED') => ({
  memberId: `member:${ordinal}`,
  memberRole: ordinal === 0 ? 'ACTION' : 'EVIDENCE',
  ordinal,
  canonicalId,
  resolutionState,
  sourceRef: canonicalId ? `src:${ordinal}` : null,
  sourceRevision: canonicalId ? 'source:v1' : null,
  evidenceRefs: canonicalId ? [`evidence:${ordinal}`] : [],
});

describe('agentic hypergraph expansion v1', () => {
  it('creates bounded star expansion from resolved members only', () => {
    const edge = buildAgenticHyperEdgeV1({
      edgeId: 'edge:1', actionId: 'HYPERGRAPH_EXPAND', workspaceRevision: 'workspace:v1', sourceRevision: 'source:v1',
      members: [member(2, 'canonical:2', 'RESOLVED'), member(0, 'canonical:0', 'RESOLVED'), member(1, null, 'UNRESOLVED')],
      producerRevision: 'test:v1',
    });
    const result = expandAgenticHyperEdgeV1(edge);
    expect(result.status).toBe('EXPANDED');
    expect(result.resolvedMemberCount).toBe(2);
    expect(result.excludedMemberCount).toBe(1);
    expect(result.expansions).toHaveLength(1);
    expect(result.expansions[0].fromCanonicalId).toBe('canonical:0');
    expect(result.expansions[0].weight).toBe(1);
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });

  it('bounds fan-out and never creates a clique', () => {
    const edge = buildAgenticHyperEdgeV1({
      edgeId: 'edge:2', actionId: null, workspaceRevision: null, sourceRevision: null,
      members: [member(0, 'a', 'RESOLVED'), member(1, 'b', 'RESOLVED'), member(2, 'c', 'RESOLVED'), member(3, 'd', 'RESOLVED')],
      producerRevision: 'test:v1',
    });
    const result = expandAgenticHyperEdgeV1(edge, { maxExpansions: 2 });
    expect(result.status).toBe('EXPANDED');
    expect(result.expansions.map((x) => x.toCanonicalId)).toEqual(['b', 'c']);
    expect(result.expansions).toHaveLength(2);
    expect(result.expansions.reduce((sum, x) => sum + x.weight, 0)).toBeCloseTo(2 / 3);
  });
});
