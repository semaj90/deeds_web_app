import { describe, expect, it } from 'vitest';
import {
  fromCanonicalWorkflowActionEvent,
  toCanonicalWorkflowActionEvent,
  validateContextToolDag,
  workflowActionFromDagNode,
} from './context-tool-dag-contracts.js';

function baseDag() {
  return {
    schema: 'atlas.context-tool-dag.v1' as const,
    workflowId: 'wf-1',
    workflowRevision: 1,
    requestId: 'r-1',
    workspaceRevision: 'ws-1',
    graphRevision: 'g-1',
    canonicalWritesAllowed: false,
    producerRevision: 'test',
    nodes: [
      {
        nodeId: 'retrieve',
        kind: 'RETRIEVAL' as const,
        dependsOn: [],
        canonicalIds: ['S1'],
        toolName: null,
        readOnly: true,
        requiresExactPromotion: false,
        requiresValidation: false,
        maxAttempts: 1,
      },
      {
        nodeId: 'promote',
        kind: 'EXACT_PROMOTION' as const,
        dependsOn: ['retrieve'],
        canonicalIds: ['S1'],
        toolName: null,
        readOnly: true,
        requiresExactPromotion: false,
        requiresValidation: false,
        maxAttempts: 1,
      },
      {
        nodeId: 'tool',
        kind: 'MCP_TOOL_CALL' as const,
        dependsOn: ['promote'],
        canonicalIds: ['S1'],
        toolName: 'read_symbol',
        readOnly: true,
        requiresExactPromotion: true,
        requiresValidation: false,
        maxAttempts: 2,
      },
    ],
  };
}

describe('context tool DAG contracts', () => {
  it('accepts read-only MCP tool calls after exact promotion', () => {
    expect(() => validateContextToolDag(baseDag())).not.toThrow();
    const event = workflowActionFromDagNode({
      dag: baseDag(),
      nodeId: 'tool',
      sequence: 3,
      actionId: 'a-3',
      kind: 'scheduled',
      lane: 'tool',
      producerRevision: 'test',
    });
    expect(event.transport).toBe('mcp');
    expect(event.mutationRequested).toBe(false);
  });

  it('rejects MCP calls claiming exact promotion without an exact-promotion ancestor', () => {
    const dag = baseDag();
    dag.nodes[2] = { ...dag.nodes[2], dependsOn: ['retrieve'] };
    expect(() => validateContextToolDag(dag)).toThrow(/EXACT_PROMOTION/);
  });

  it('rejects unauthorized mutating tool nodes', () => {
    const dag = baseDag();
    dag.nodes[2] = {
      ...dag.nodes[2],
      readOnly: false,
      requiresValidation: true,
      toolName: 'apply_patch',
    };
    expect(() => validateContextToolDag(dag)).toThrow(/canonicalWritesAllowed=false/);
  });
});

describe('context tool DAG contracts -- canonical workflow-action adapter (WORKFLOW-ACTION-SCHEMA-OWNER-01)', () => {
  it('round-trips every field the DAG-execution layer actually reads', () => {
    const local = workflowActionFromDagNode({
      dag: baseDag(),
      nodeId: 'tool',
      sequence: 3,
      actionId: 'a-3',
      kind: 'scheduled',
      lane: 'tool',
      evidenceRefs: ['ev-1'],
      producerRevision: 'test',
    });

    const canonical = toCanonicalWorkflowActionEvent(local);
    expect(canonical.schema).toBe('atlas.workflow-action.v1');
    expect(canonical.canonicalIds).toEqual(local.canonicalIds);
    expect(canonical.toolName).toBe(local.toolName);
    expect(canonical.mutationRequested).toBe(local.mutationRequested);
    expect(canonical.validationRequired).toBe(local.validationRequired);
    expect(canonical.transport).toBe('mcp');

    const roundTripped = fromCanonicalWorkflowActionEvent(canonical);
    expect(roundTripped.workflowId).toBe(local.workflowId);
    expect(roundTripped.workflowRevision).toBe(local.workflowRevision);
    expect(roundTripped.sequence).toBe(local.sequence);
    expect(roundTripped.actionId).toBe(local.actionId);
    expect(roundTripped.dagNodeId).toBe(local.dagNodeId);
    expect(roundTripped.attempt).toBe(local.attempt);
    expect(roundTripped.lane).toBe(local.lane);
    expect(roundTripped.transport).toBe(local.transport);
    expect(roundTripped.kind).toBe(local.kind);
    expect(roundTripped.canonicalIds).toEqual(local.canonicalIds);
    expect(roundTripped.evidenceRefs).toEqual(local.evidenceRefs);
    expect(roundTripped.toolName).toBe(local.toolName);
    expect(roundTripped.mutationRequested).toBe(local.mutationRequested);
    expect(roundTripped.validationRequired).toBe(local.validationRequired);
    expect(roundTripped.producerRevision).toBe(local.producerRevision);
  });

  it('throws rather than silently drop a canonical-only kind this local shape cannot represent', () => {
    const local = workflowActionFromDagNode({
      dag: baseDag(), nodeId: 'retrieve', sequence: 1, actionId: 'a-1',
      kind: 'scheduled', lane: 'tool', producerRevision: 'test',
    });
    const canonical = { ...toCanonicalWorkflowActionEvent(local), kind: 'suspended' as const };
    expect(() => fromCanonicalWorkflowActionEvent(canonical)).toThrow(
      /WORKFLOW_ACTION_EVENT_KIND_NOT_REPRESENTABLE_IN_DAG_SHAPE/,
    );
  });
});
