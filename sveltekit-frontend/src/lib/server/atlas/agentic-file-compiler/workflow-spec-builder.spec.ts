import { describe, expect, it } from 'vitest';
import { buildAtlasWorkflowSpec, buildDagNode } from './workflow-spec-builder.js';

describe('buildAtlasWorkflowSpec', () => {
  it('rejects mutation DAGs without a validation descendant', () => {
    const mutate = buildDagNode({ nodeId:'m', kind:'MUTATE', lane:'tool', capability:'atlas.filesystem.mutate', inputRefs:[], outputRefs:[], dependsOn:[], resources:{}, retry:{maxAttempts:1,strategy:'NONE'}, idempotencyKey:'m', requiredEvidenceRefs:[] });
    expect(() => buildAtlasWorkflowSpec({ workflowId:'w', workflowRevision:1, requestId:'r', workspaceRevision:'wr', representationRevision:'semantic_768:v1', intentId:'i', contextManifestId:'c', nodes:[mutate], edges:[], entryNodeIds:['m'], terminalNodeIds:['m'], resourceEnvelope:{tokenBudget:1,candidateBudget:1,graphHopBudget:0,hyperedgeExpansionBudget:0,toolCallBudget:1}, retryPolicyRevision:'r', authorizationPolicyRevision:'a', validationPolicyRevision:'v' })).toThrow(/validator/);
  });
});
