import { describe, expect, it } from 'vitest';
import {
  AgenticFileMutationPlanV1Schema,
  AtlasKernelSessionV1Schema,
  assertKernelResponseIsNomination,
  defaultAtlasKernelAccessPolicy,
  validateKernelRequestAgainstDag,
} from './atlas-kernel-session.js';
import { ContextToolDagV1Schema } from '../workflow/context-tool-dag-contracts.js';

const session = AtlasKernelSessionV1Schema.parse({
  schema: 'atlas.kernel-session.v1',
  sessionId: 'kernel-1',
  kernelRevision: 'kernel-r1',
  pythonVersion: '3.13',
  environmentRevision: 'env-r1',
  workspaceRevision: 'ws-1',
  graphRevision: 'g-1',
  persistent: true,
  modelFacingLanguage: 'PYTHON',
  authoritativeHostLanguage: 'TYPESCRIPT',
  securitySandbox: false,
  capabilities: ['RETRIEVE', 'GRAPH_EVIDENCE', 'VERIFY_CLAIM', 'PROPOSE_PATCH'],
  accessPolicy: defaultAtlasKernelAccessPolicy(),
  loadedSkills: ['semantic-search', 'graph-evidence', 'claim-verifier', 'file-repair'],
  artifactHandles: [],
  canonicalWritesAllowed: false,
  producerRevision: 'test',
});

const dag = ContextToolDagV1Schema.parse({
  schema: 'atlas.context-tool-dag.v1',
  workflowId: 'wf-1',
  workflowRevision: 1,
  requestId: 'req-1',
  workspaceRevision: 'ws-1',
  graphRevision: 'g-1',
  canonicalWritesAllowed: false,
  producerRevision: 'test',
  nodes: [
    {
      nodeId: 'retrieve', kind: 'RETRIEVAL', dependsOn: [], canonicalIds: [], toolName: null,
      readOnly: true, requiresExactPromotion: false, requiresValidation: false, maxAttempts: 1,
    },
    {
      nodeId: 'repair', kind: 'MCP_TOOL_CALL', dependsOn: ['retrieve'], canonicalIds: [], toolName: 'propose_patch',
      readOnly: true, requiresExactPromotion: false, requiresValidation: true, maxAttempts: 1,
    },
  ],
});

describe('AtlasKernelSessionV1', () => {
  it('makes the Python kernel explicitly non-authoritative', () => {
    expect(session.modelFacingLanguage).toBe('PYTHON');
    expect(session.authoritativeHostLanguage).toBe('TYPESCRIPT');
    expect(session.securitySandbox).toBe(false);
    expect(session.canonicalWritesAllowed).toBe(false);
    expect(session.accessPolicy.directRepositoryWrite).toBe(false);
    expect(session.accessPolicy.canonicalDbWrite).toBe(false);
    expect(session.accessPolicy.directMutationAuthorization).toBe(false);
  });

  it('accepts a bounded revision-qualified retrieve request tied to a DAG node', () => {
    const request = validateKernelRequestAgainstDag({
      session,
      dag,
      request: {
        schema: 'atlas.kernel-host-request.v1',
        requestId: 'kernel-request-1',
        sessionId: 'kernel-1',
        workflowId: 'wf-1',
        workflowRevision: 1,
        dagNodeId: 'retrieve',
        kind: 'RETRIEVE',
        workspaceRevision: 'ws-1',
        graphRevision: 'g-1',
        canonicalIds: [],
        evidenceRefs: [],
        payload: { query: 'find candidate owner', k: 256 },
        resourceBudget: {
          maxCandidates: 256, maxGraphHops: 2, maxToolCalls: 0, maxOutputBytes: 1_000_000, deadlineMs: 5_000,
        },
        canonicalWritesRequested: false,
        producerRevision: 'test',
      },
    });
    expect(request.kind).toBe('RETRIEVE');
  });

  it('rejects a request tied to the wrong workspace revision', () => {
    expect(() => validateKernelRequestAgainstDag({
      session,
      dag,
      request: {
        schema: 'atlas.kernel-host-request.v1',
        requestId: 'kernel-request-2', sessionId: 'kernel-1', workflowId: 'wf-1', workflowRevision: 1,
        dagNodeId: 'retrieve', kind: 'RETRIEVE', workspaceRevision: 'ws-2', graphRevision: 'g-1',
        canonicalIds: [], evidenceRefs: [], payload: {},
        resourceBudget: { maxCandidates: 1, maxGraphHops: 0, maxToolCalls: 0, maxOutputBytes: 100, deadlineMs: 100 },
        canonicalWritesRequested: false, producerRevision: 'test',
      },
    })).toThrow(/workspace revision mismatch/);
  });

  it('accepts a mutation nomination while proving no direct write happened', () => {
    const response = AgenticFileMutationPlanV1Schema.parse({
      schema: 'atlas.agentic-file-mutation-plan.v1',
      requestId: 'repair-1',
      workspaceRevision: 'ws-1',
      targetPath: 'src/example.ts',
      baseChecksumSha256: 'a'.repeat(64),
      operations: [{ kind: 'INSERT', startLine: 1, endLine: null, content: 'const x = 1;\n' }],
      evidenceRefs: ['source:1'],
      requiresRevisionCas: true,
      requiresExactSourceEvidence: true,
      requiresValidation: true,
      directWritePerformed: false,
    });
    expect(assertKernelResponseIsNomination(response).schema).toBe('atlas.agentic-file-mutation-plan.v1');
  });

  it('rejects a kernel response that claims a direct file write occurred', () => {
    expect(() => assertKernelResponseIsNomination({
      schema: 'atlas.agentic-file-mutation-plan.v1',
      requestId: 'repair-2', workspaceRevision: 'ws-1', targetPath: 'src/example.ts',
      baseChecksumSha256: 'b'.repeat(64),
      operations: [{ kind: 'DELETE_RANGE', startLine: 1, endLine: 2, content: '' }],
      evidenceRefs: ['source:2'], requiresRevisionCas: true, requiresExactSourceEvidence: true,
      requiresValidation: true, directWritePerformed: true,
    } as never)).toThrow();
  });
});
