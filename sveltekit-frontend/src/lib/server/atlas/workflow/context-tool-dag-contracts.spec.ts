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

  it('rejects nodes claiming exact promotion without an exact-promotion ancestor', () => {
    const dag = baseDag();
    dag.nodes[2] = { ...dag.nodes[2], dependsOn: ['retrieve'] };
    expect(() => validateContextToolDag(dag)).toThrow(/EXACT_PROMOTION/);
  });

  it('rejects nodes claiming validation without a validator ancestor', () => {
    const dag = baseDag();
    dag.nodes[2] = {
      ...dag.nodes[2],
      readOnly: false,
      requiresValidation: true,
      toolName: 'apply_patch',
    };
    dag.canonicalWritesAllowed = true;
    expect(() => validateContextToolDag(dag)).toThrow(/VALIDATE ancestor/);
  });

  it('rejects mutating tool nodes with validator ancestry but no canonical write authorization', () => {
    const dag = baseDag();
    dag.nodes.splice(2, 0, {
      nodeId: 'validate',
      kind: 'VALIDATE' as const,
      dependsOn: ['promote'],
      canonicalIds: ['S1'],
      toolName: null,
      readOnly: true,
      requiresExactPromotion: true,
      requiresValidation: false,
      maxAttempts: 1,
    });
    dag.nodes[3] = {
      ...dag.nodes[3],
      dependsOn: ['validate'],
      readOnly: false,
      requiresValidation: true,
      toolName: 'apply_patch',
    };
    expect(() => validateContextToolDag(dag)).toThrow(/canonicalWritesAllowed=false/);
  });

  it('accepts a mutating tool only with exact promotion, validator ancestry, and write authorization', () => {
    const dag = baseDag();
    dag.canonicalWritesAllowed = true;
    dag.nodes.splice(2, 0, {
      nodeId: 'validate',
      kind: 'VALIDATE' as const,
      dependsOn: ['promote'],
      canonicalIds: ['S1'],
      toolName: null,
      readOnly: true,
      requiresExactPromotion: true,
      requiresValidation: false,
      maxAttempts: 1,
    });
    dag.nodes[3] = {
      ...dag.nodes[3],
      dependsOn: ['validate'],
      readOnly: false,
      requiresValidation: true,
      toolName: 'apply_patch',
    };

    expect(() => validateContextToolDag(dag)).not.toThrow();
    const event = workflowActionFromDagNode({
      dag,
      nodeId: 'tool',
      sequence: 4,
      actionId: 'a-4',
      kind: 'scheduled',
      lane: 'tool',
      producerRevision: 'test',
    });
    expect(event.mutationRequested).toBe(true);
    expect(event.validationRequired).toBe(true);
  });
});
