import { describe, expect, it } from 'vitest';
import { validateContextToolDag, workflowActionFromDagNode } from './context-tool-dag-contracts.js';

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
