import { describe, expect, it } from 'vitest';
import { buildAgenticHyperEdgeV1 } from './agentic-hyperedge-v1.js';

const member = {
  memberId: 'label:retrieval',
  memberRole: 'TARGET',
  ordinal: 0,
  canonicalId: null,
  resolutionState: 'UNRESOLVED' as const,
  sourceRef: 'query:user',
  sourceRevision: 'source:unqualified',
  evidenceRefs: [],
};

describe('AgenticHyperEdgeV1', () => {
  it('represents unresolved members without inventing canonical identity', () => {
    const edge = buildAgenticHyperEdgeV1({
      edgeId: 'edge:1',
      actionId: 'action:hypergraph-expand',
      workspaceRevision: null,
      sourceRevision: null,
      members: [member],
      producerRevision: 'agentic-hyperedge:test:v1',
    });
    expect(edge.members[0]?.canonicalId).toBeNull();
    expect(edge.members[0]?.resolutionState).toBe('UNRESOLVED');
    expect(edge.canonicalAuthority).toBe(false);
    expect(edge.writesPerformed).toBe(false);
  });

  it('requires a canonical ID only after member resolution succeeds', () => {
    expect(() => buildAgenticHyperEdgeV1({
      edgeId: 'edge:bad', actionId: null, workspaceRevision: null, sourceRevision: null,
      members: [{ ...member, resolutionState: 'RESOLVED' }], producerRevision: 'test',
    })).toThrow('RESOLVED_MEMBER_REQUIRES_CANONICAL_ID');
    expect(() => buildAgenticHyperEdgeV1({
      edgeId: 'edge:bad', actionId: null, workspaceRevision: null, sourceRevision: null,
      members: [{ ...member, resolutionState: 'AMBIGUOUS', canonicalId: 'invented:id' }], producerRevision: 'test',
    })).toThrow('UNRESOLVED_MEMBER_CANNOT_CLAIM_CANONICAL_ID');
  });

  it('accepts a resolved member with explicit evidence', () => {
    const edge = buildAgenticHyperEdgeV1({
      edgeId: 'edge:resolved', actionId: 'action:1', workspaceRevision: 'workspace:v1', sourceRevision: 'source:v1',
      members: [{ ...member, canonicalId: 'canonical:1', resolutionState: 'RESOLVED', evidenceRefs: ['evidence:1'] }],
      producerRevision: 'agentic-hyperedge:test:v1',
    });
    expect(edge.members[0]?.canonicalId).toBe('canonical:1');
  });
});
