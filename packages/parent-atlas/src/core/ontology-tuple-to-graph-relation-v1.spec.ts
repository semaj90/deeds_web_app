import { describe, expect, it } from 'vitest';
import { projectOntologyTupleToGraphRelationV1 } from './ontology-tuple-to-graph-relation-v1.js';

const input = {
  snapshotId: '11111111-1111-4111-8111-111111111111',
  tupleId: 'tuple:r17',
  label: 'CODE_REPAIR_CAUSAL_PATH',
  sourceRef: 'src/lib/server/atlas/symbol-repair-example.ts',
  confidence: 0.93,
  evidenceSpan: { sourceRef: 'src/lib/server/atlas/symbol-repair-example.ts', start: 120, end: 168 },
  participants: [
    { entityId: 'symbol:S1', entityKind: 'ast_symbol', role: 'cause' },
    { entityId: 'symbol:S2', entityKind: 'ast_symbol', role: 'effect' },
    { entityId: 'symbol:T7', entityKind: 'ast_symbol', role: 'evidence' },
    { entityId: 'tool_call:typecheck-run-42', entityKind: 'tool_call', role: 'tool' },
  ],
};

describe('projectOntologyTupleToGraphRelationV1', () => {
  it('projects exactly one relation_event node, never a pairwise clique', () => {
    const result = projectOntologyTupleToGraphRelationV1(input);
    expect(result.relationNode.nodeType).toBe('relation_event');
    expect(result.relationNode.nodeKey).toBe('relation_event:tuple:r17');
  });

  it('projects only the 3 FK-safe participants as GraphRelationParticipant rows, excluding the unmapped one', () => {
    const result = projectOntologyTupleToGraphRelationV1(input);
    // FK: atlas_graph_relation_participants_v2.nodeFk requires the
    // participant's nodeKey to exist as a real atlas_graph_nodes_v2 row.
    // tool_call has no honest GraphNodeType, so it's excluded here (still
    // reported in unmappedNodeKinds), preserving original ordinal values
    // for the ones that DO make it in.
    expect(result.participants).toHaveLength(3);
    expect(result.participants.map((p) => p.role)).toEqual(['cause', 'effect', 'evidence']);
    expect(result.participants.map((p) => p.ordinal)).toEqual([0, 1, 2]);
  });

  it('maps ast_symbol participants to real symbol GraphNode rows', () => {
    const result = projectOntologyTupleToGraphRelationV1(input);
    expect(result.participantNodes).toHaveLength(3);
    expect(result.participantNodes.every((n) => n.nodeType === 'symbol')).toBe(true);
  });

  it('honestly reports the tool_call participant as unmapped rather than forcing a wrong node type', () => {
    const result = projectOntologyTupleToGraphRelationV1(input);
    expect(result.unmappedNodeKinds).toEqual([{ entityId: 'tool_call:typecheck-run-42', entityKind: 'tool_call' }]);
  });

  it('serializes evidenceSpan into the schema-required string shape', () => {
    const result = projectOntologyTupleToGraphRelationV1(input);
    expect(result.relationEvent.evidenceSpan).toBe('src/lib/server/atlas/symbol-repair-example.ts:120-168');
  });

  it('computes a real topologyHash (sha256 of the actual write-eligible content) deterministically', () => {
    const a = projectOntologyTupleToGraphRelationV1(input);
    const b = projectOntologyTupleToGraphRelationV1(input);
    expect(a.relationEvent.topologyHash).toBe(b.relationEvent.topologyHash);
    expect(a.relationEvent.topologyHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('topologyHash changes if the write-eligible participant set changes', () => {
    const a = projectOntologyTupleToGraphRelationV1(input);
    const fewerParticipants = projectOntologyTupleToGraphRelationV1({ ...input, participants: input.participants.slice(0, 2) });
    expect(a.relationEvent.topologyHash).not.toBe(fewerParticipants.relationEvent.topologyHash);
  });
});
