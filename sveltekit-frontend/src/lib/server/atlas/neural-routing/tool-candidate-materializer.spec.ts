import { describe, expect, it } from 'vitest';
import { materializeToolCandidates } from './tool-candidate-materializer.js';

describe('tool candidate materializer', () => {
  it('normalizes FSM aliases and allows implemented BFS only when permission and preconditions pass', () => {
    const candidates = materializeToolCandidates({
      context: {
        fsmAllowedTools: ['atlas.graph_traversal'],
        grantedPermissions: ['graph:read'],
        satisfiedPreconditions: ['canonical_seed_resolved', 'graph_revision_known'],
        modeByTool: { 'atlas.graph.expand': 'bfs' },
      },
    });
    const graph = candidates.find((candidate) => candidate.toolId === 'atlas.graph.expand');
    expect(graph?.eligible).toBe(true);
  });

  it('blocks an unwired graph mode even when FSM and permissions permit it', () => {
    const candidates = materializeToolCandidates({
      context: {
        fsmAllowedTools: ['atlas.graph_traversal'],
        grantedPermissions: ['graph:read'],
        satisfiedPreconditions: ['canonical_seed_resolved', 'graph_revision_known'],
        modeByTool: { 'atlas.graph.expand': 'sssp' },
      },
    });
    const graph = candidates.find((candidate) => candidate.toolId === 'atlas.graph.expand');
    expect(graph?.eligible).toBe(false);
    expect(graph?.exclusionReasonCodes).toContain('SSSP_EXECUTOR_NOT_WIRED');
  });

  it('blocks current search and patch stubs regardless of high bootstrap semantic fit', () => {
    const candidates = materializeToolCandidates({
      context: {
        fsmAllowedTools: ['atlas.retrieve', 'atlas.patch.propose', 'atlas.apply_change'],
        grantedPermissions: ['search:read', 'code:propose', 'code:write'],
        satisfiedPreconditions: [
          'query_non_empty', 'source_revision_known', 'evidence_present',
          'approved_proposal', 'approval_token_valid', 'base_revision_matches',
        ],
      },
      bootstrapSignals: {
        'atlas.search': { signals: { semantic: 1 }, intentProbability: 1 },
        'atlas.patch.propose': { signals: { semantic: 1 }, intentProbability: 1 },
        'atlas.patch.apply': { signals: { semantic: 1 }, intentProbability: 1 },
      },
    });
    expect(candidates.find((candidate) => candidate.toolId === 'atlas.search')?.eligible).toBe(false);
    expect(candidates.find((candidate) => candidate.toolId === 'atlas.patch.propose')?.eligible).toBe(false);
    expect(candidates.find((candidate) => candidate.toolId === 'atlas.patch.apply')?.eligible).toBe(false);
  });

  it('leaves historical metrics at zero during bootstrap instead of inventing observations', () => {
    const candidates = materializeToolCandidates({
      context: {
        fsmAllowedTools: ['atlas.graph.pagerank'],
        grantedPermissions: ['graph:read'],
        satisfiedPreconditions: [],
      },
    });
    const pagerank = candidates.find((candidate) => candidate.toolId === 'atlas.graph.pagerank');
    expect(pagerank?.historicalSuccessRate).toBe(0);
    expect(pagerank?.historicalFailureRate).toBe(0);
  });
});
