import test from 'node:test';
import assert from 'node:assert/strict';

import {
  retrievalReceiptToWorkflowAction,
  acePacketToWorkflowArtifact,
} from '../dist/core/workflow-action-adapters.js';

const identity = {
  workflowId: 'workflow:q-1',
  workflowRevision: 7,
  actionId: 'action:retrieve-1',
  dagNodeId: 'dag:retrieve',
  attempt: 1,
};

test('retrieval receipt preserves receipt/evidence/resource identities without inventing action identity', () => {
  const event = retrievalReceiptToWorkflowAction({
    identity,
    producer_revision: 'workflow-adapter-r1',
    receipt: {
      schema: 'atlas.retrieval-action-receipt.v1',
      receipt_id: 'receipt:r1',
      query_id: 'q-1',
      sequence: 3,
      before_state: 'NEED_RELATIONSHIP',
      action: 'retrieve_relationships',
      requested_entity_types: ['symbol'],
      requested_relationship_types: ['CALLS'],
      requested_evidence_kinds: ['code'],
      candidate_ids: ['candidate:c1'],
      retrieved_evidence_refs: ['evidence:e1'],
      relationship_ids: ['relationship:r1'],
      source_snapshot_revision_before: 'snap-1',
      source_snapshot_revision_after: 'snap-2',
      after_state: 'ENOUGH_EVIDENCE',
      sufficient_after: true,
      executor_refs: ['cugraph'],
      started_at: '2026-08-18T20:00:00.000Z',
      finished_at: '2026-08-18T20:00:00.100Z',
      producer_revision: 'retrieval-r1',
    },
  });

  assert.equal(event.actionId, identity.actionId);
  assert.equal(event.receiptId, 'receipt:r1');
  assert.deepEqual(event.evidenceRefs, ['evidence:e1']);
  assert.ok(event.resourceRefs.some((row) => row.resource_id === 'relationship:r1'));
  assert.equal(event.kind, 'completed');
});

test('ACE packet artifact event aggregates relationship evidence and lineage', () => {
  const packet = {
    schema: 'atlas.ace-packet.v2',
    packet_revision: 'packet-r1',
    envelope: {
      packet_key: 'packet:p1',
      source_ref: 'src/a.ts',
      canonical_source_ref: 'source:src/a.ts',
      feature_id: 'feature:f1',
      source_revision: 'src-r1',
    },
    hypergraph: {
      schema: 'atlas.ace-hypergraph-payload.v1',
      query_id: 'q-1',
      packet_key: 'packet:p1',
      source_ref: 'src/a.ts',
      feature_id: 'feature:f1',
      relationship_evidence: [{
        relationship_id: 'relationship:r1',
        relationship_revision: 'rel-r1',
        relationship_type: 'CALLS',
        relationship_degree: 1,
        participants: [{ entity_type: 'symbol', entity_id: 'symbol:s1', role: 'caller' }],
        hop: 1,
        evidence_refs: ['evidence:e1', 'evidence:e2'],
        confidence: 1,
        persistence: 'canonical',
      }],
      reasoning_chain: {
        schema: 'atlas.reasoning-chain.v1',
        query_id: 'q-1',
        seed_entity_ids: ['symbol:s1'],
        steps: [],
        relationship_ids: ['relationship:r1'],
        entity_ids: ['symbol:s1'],
        source_snapshot_revision: 'source-snap-r1',
        maximum_hop_count: 2,
        fanout_limit: 20,
        chain_score: 1,
      },
      sufficient_context: {
        schema: 'atlas.sufficient-context-decision.v1',
        query_id: 'q-1',
        state: 'ENOUGH_EVIDENCE',
        sufficient: true,
        next_action: 'synthesize',
        missing_entity_types: [],
        missing_relationship_types: [],
        missing_evidence_kinds: [],
        blockers: [],
      },
      lineage: {
        source_snapshot_revision: 'source-snap-r1',
        relationship_projection_revision: 'rel-proj-r1',
        graph_snapshot_revision: 'graph-r1',
        semantic_projection_revision: 'semantic-proj-r1',
        semantic_model_revision: 'embed-r1',
        feature_matrix_revision: 'feature-r1',
        producer_revision: 'hyper-r1',
      },
      retrieval: {
        semantic_lane_votes: 1,
        semantic_executors: ['qdrant'],
        relationship_candidate_count: 1,
        evidence_candidate_count: 2,
        graph_hops_executed: 1,
        fanout_limit: 20,
      },
      derived_ranking_signals: {},
    },
    producer_revision: 'ace-r1',
  };

  const event = acePacketToWorkflowArtifact({
    identity: { ...identity, actionId: 'action:ace-1', dagNodeId: 'dag:ace' },
    sequence: 4,
    packet,
    producer_revision: 'workflow-adapter-r1',
  });

  assert.equal(event.kind, 'artifact');
  assert.deepEqual(event.evidenceRefs.sort(), ['evidence:e1', 'evidence:e2']);
  assert.ok(event.resourceRefs.some((row) => row.resource_id === 'relationship:r1'));
  assert.equal(event.metadata.semantic_projection_revision, 'semantic-proj-r1');
});
