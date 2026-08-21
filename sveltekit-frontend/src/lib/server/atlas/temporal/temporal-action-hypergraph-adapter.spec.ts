import { describe, expect, it } from 'vitest';
import { buildAgentActionEvent } from '@deeds/parent-atlas';

import { adaptFinalizedTemporalActionToAtlasEvent } from './temporal-action-hypergraph-adapter.js';

const HASH = 'b'.repeat(64);

function makeEvent(input?: { workspaceAuthority?: 'PROVEN' | 'UNPROVEN'; sourceAuthority?: 'PROVEN' | 'UNPROVEN' }) {
  const workspaceAuthority = input?.workspaceAuthority ?? 'PROVEN';
  const sourceAuthority = input?.sourceAuthority ?? 'PROVEN';
  return buildAgentActionEvent({
    event_id: 'workflow:w1:1:4',
    ledger_sequence: 4,
    workflow_action: {
      workflow_id: 'workflow:1',
      workflow_revision: 1,
      action_id: 'action:rg-1',
      sequence: 4,
    },
    descriptor: {
      opcode: 'RG_SEARCH',
      query_class: 'exact_symbol',
      target: {
        canonical_id: 'symbol:canonical-1',
        resource: 'src/lib/server/atlas/example.ts',
        target_class: 'typescript_symbol',
      },
      input_hash: HASH,
      implementation_revision: 'rg-search-v1',
      parameter_revision: 'rg-params-v1',
      context_manifest_hash: null,
      applicability: {
        observed_at: '2026-08-21T18:42:19.381Z',
        valid_time: { from: null, to: null },
        workspace_revision: {
          value: workspaceAuthority === 'PROVEN' ? 'workspace:123' : null,
          authority: workspaceAuthority,
          evidence_refs: [],
        },
        source_revision: {
          value: sourceAuthority === 'PROVEN' ? 'source:456' : null,
          authority: sourceAuthority,
          evidence_refs: [],
        },
        graph_revision: { value: null, authority: 'NOT_APPLICABLE', evidence_refs: [] },
        relevant_dimensions: ['workspace', 'source'],
        evidence_frontier_hash: null,
      },
    },
    state: 'FINALIZED',
    outcome: 'SUCCESS_EXACT',
    result_ref: 'artifact:rg-result',
    error_code: null,
    evidence_refs: ['evidence:source-span'],
    artifact_refs: ['artifact:rg-result'],
    cost: { latency_ms: 8, gpu_bytes: null, tokens: 0, tool_calls: 1 },
    observed_at: '2026-08-21T18:42:19.381Z',
    producer_revision: 'temporal-ledger-v1',
  });
}

describe('temporal action hypergraph adapter', () => {
  it('projects finalized revision-proven action history into the existing hypergraph owner', () => {
    const temporal = makeEvent();
    const projected = adaptFinalizedTemporalActionToAtlasEvent({
      event: temporal,
      representationRevision: 'representation:source-v1',
      canonicalizerRevision: 'hypergraph-canonicalizer-v1',
      compilerRevision: 'temporal-hypergraph-compiler-v1',
    });

    expect(projected.schemaVersion).toBe('atlas.event.hypergraph.v1');
    expect(projected.eventType).toBe('packet_retrieval');
    expect(projected.workspaceRevision).toBe('workspace:123');
    expect(projected.sourceRevision).toBe('source:456');
    expect(projected.representationRevision).toBe('representation:source-v1');
    expect(projected.metadata.temporalEventId).toBe(temporal.event_id);
    expect(projected.metadata.canonicalAuthority).toBe(false);
    expect(projected.participants.some((p) => p.entityId === 'action:rg-1')).toBe(true);
  });

  it('refuses unproven workspace lineage instead of inventing a revision', () => {
    expect(() => adaptFinalizedTemporalActionToAtlasEvent({
      event: makeEvent({ workspaceAuthority: 'UNPROVEN' }),
      representationRevision: 'representation:source-v1',
      canonicalizerRevision: 'hypergraph-canonicalizer-v1',
      compilerRevision: 'temporal-hypergraph-compiler-v1',
    })).toThrow('TEMPORAL_HYPERGRAPH_WORKSPACE_REVISION_UNPROVEN');
  });

  it('refuses unproven source lineage', () => {
    expect(() => adaptFinalizedTemporalActionToAtlasEvent({
      event: makeEvent({ sourceAuthority: 'UNPROVEN' }),
      representationRevision: 'representation:source-v1',
      canonicalizerRevision: 'hypergraph-canonicalizer-v1',
      compilerRevision: 'temporal-hypergraph-compiler-v1',
    })).toThrow('TEMPORAL_HYPERGRAPH_SOURCE_REVISION_UNPROVEN');
  });

  it('requires representation revision from its real owner', () => {
    expect(() => adaptFinalizedTemporalActionToAtlasEvent({
      event: makeEvent(),
      representationRevision: '   ',
      canonicalizerRevision: 'hypergraph-canonicalizer-v1',
      compilerRevision: 'temporal-hypergraph-compiler-v1',
    })).toThrow('TEMPORAL_HYPERGRAPH_REPRESENTATION_REVISION_MISSING');
  });
});
