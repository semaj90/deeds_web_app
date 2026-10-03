import { describe, expect, it } from 'vitest';
import { buildDagNode } from '../../agentic-file-compiler/workflow-spec-builder.js';
import { synthesizeAgenticDagV1 } from './agentic-dag-synthesis-v1.js';

describe('agentic DAG synthesis v1', () => {
  it('wraps the existing workflow owner in a non-authoritative readiness receipt', () => {
    const validate = buildDagNode({ nodeId: 'validate', kind: 'VALIDATE', lane: 'validator', capability: 'atlas.typecheck', inputRefs: [], outputRefs: ['receipt'], dependsOn: [], resources: {}, retry: { maxAttempts: 1, strategy: 'NONE' }, idempotencyKey: 'validate:1', requiredEvidenceRefs: [] });
    const tool = buildDagNode({ nodeId: 'tool', kind: 'TOOL', lane: 'tool', capability: 'atlas.search', inputRefs: [], outputRefs: ['result'], dependsOn: [], resources: {}, retry: { maxAttempts: 1, strategy: 'NONE' }, idempotencyKey: 'tool:1', requiredEvidenceRefs: [] });
    const receipt = synthesizeAgenticDagV1({
      workflowId: 'workflow:fixture', workflowRevision: 1, requestId: 'request:fixture', workspaceRevision: 'workspace:fixture',
      representationRevision: 'semantic_768:v1', intentId: 'intent:fixture', contextManifestId: 'context:fixture',
      nodes: [tool, validate], edges: [{ from: 'tool', to: 'validate', kind: 'SEQUENCE' }], entryNodeIds: ['tool'], terminalNodeIds: ['validate'],
      resourceEnvelope: { tokenBudget: 100, candidateBudget: 2, graphHopBudget: 0, hyperedgeExpansionBudget: 0, toolCallBudget: 1 },
      retryPolicyRevision: 'retry:v1', authorizationPolicyRevision: 'auth:v1', validationPolicyRevision: 'validation:v1',
    });
    expect(receipt.status).toBe('READY_FOR_PROOF');
    expect(receipt.nodeCount).toBe(2);
    expect(receipt.workflowChecksum).toBe((receipt.workflow as { checksum: string }).checksum);
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.writesPerformed).toBe(false);
  });

  it('retains the existing compiler fail-closed mutation validation', () => {
    const mutate = buildDagNode({ nodeId: 'mutate', kind: 'MUTATE', lane: 'tool', capability: 'atlas.filesystem.mutate', inputRefs: [], outputRefs: [], dependsOn: [], resources: {}, retry: { maxAttempts: 1, strategy: 'NONE' }, idempotencyKey: 'mutate:1', requiredEvidenceRefs: [] });
    expect(() => synthesizeAgenticDagV1({
      workflowId: 'workflow:bad', workflowRevision: 1, requestId: 'request:bad', workspaceRevision: 'workspace:fixture',
      representationRevision: 'semantic_768:v1', intentId: 'intent:bad', contextManifestId: 'context:bad', nodes: [mutate], edges: [], entryNodeIds: ['mutate'], terminalNodeIds: ['mutate'],
      resourceEnvelope: { tokenBudget: 1, candidateBudget: 1, graphHopBudget: 0, hyperedgeExpansionBudget: 0, toolCallBudget: 1 }, retryPolicyRevision: 'r', authorizationPolicyRevision: 'a', validationPolicyRevision: 'v',
    })).toThrow('mutation node mutate has no reachable validator');
  });
});
