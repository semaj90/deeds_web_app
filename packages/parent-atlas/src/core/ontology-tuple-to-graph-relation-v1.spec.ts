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

  it('projects all 4 participants as GraphRelationParticipant rows with preserved order/roles', () => {
    const result = projectOntologyTupleToGraphRelationV1(input);
    expect(result.participants).toHaveLength(4);
    expect(result.participants.map((p) => p.role)).toEqual(['cause', 'effect', 'evidence', 'tool']);
    expect(result.participants.map((p) => p.ordinal)).toEqual([0, 1, 2, 3]);
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

  it('is deterministic — same input yields the same placeholder topologyHash', () => {
    const a = projectOntologyTupleToGraphRelationV1(input);
    const b = projectOntologyTupleToGraphRelationV1(input);
    expect(a.relationEvent.topologyHash).toBe(b.relationEvent.topologyHash);
  });
});
