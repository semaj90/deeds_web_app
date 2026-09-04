import { describe, expect, it } from 'vitest';
import { bindOakExecutionReceiptToLineageV1 } from './oak-dag-lineage-receipt-v1.js';
import {
  assertOakDagApprovalMatchesProposalV1,
  buildOakDagApprovalThreadIdV1,
} from './oak-dag-langgraph-approval-v1.js';

const H = (char: string) => char.repeat(64);

const execution = {
  schema: 'atlas.oak-execution-receipt.v1' as const,
  planId: 'plan:1',
  planChecksum: H('a'),
  actions: [{
    id: 'fetch',
    actionKind: 'FETCH_FILE' as const,
    status: 'SUCCEEDED' as const,
    inputChecksum: H('b'),
    outputChecksum: H('c'),
    durationMs: 7,
    writesPerformed: false as const,
    canonicalAuthority: false as const,
  }],
  deterministicExecutionChecksum: H('d'),
  writesPerformed: false as const,
  canonicalAuthority: false as const,
};

const lineage = {
  schema: 'atlas.oak-execution-lineage.v1' as const,
  requestId: 'request:1',
  kernelRevision: 'kernel:v1',
  functionRevision: 'function:v1',
  contextManifestChecksum: H('e'),
  candidateSnapshotRevision: 'candidate-snapshot:v1',
  candidateOrdinalMapChecksum: H('f'),
  workspaceRevision: 'workspace:v1',
  sourceRevisionSetChecksum: H('1'),
  evidenceRevisionSetChecksum: H('2'),
  graphRevision: 'graph:v1',
  representationRevision: 'semantic:768:v1',
  producerRevision: 'oak-lineage:test:v1',
  canonicalAuthority: false as const,
};

describe('OaK DAG governance contracts', () => {
  it('binds runtime-independent execution semantics to revision lineage deterministically', () => {
    const first = bindOakExecutionReceiptToLineageV1({ execution, lineage });
    const second = bindOakExecutionReceiptToLineageV1({
      execution: { ...execution, actions: [{ ...execution.actions[0], durationMs: 999 }] },
      lineage,
    });
    expect(first.deterministicLineageExecutionChecksum).toBe(second.deterministicLineageExecutionChecksum);
    expect(first.writesPerformed).toBe(false);
    expect(first.canonicalAuthority).toBe(false);
  });

  it('builds a stable bounded LangGraph approval thread id', () => {
    const input = { requestId: 'request:1', planChecksum: H('a'), proposalChecksum: H('9') };
    const a = buildOakDagApprovalThreadIdV1(input);
    const b = buildOakDagApprovalThreadIdV1(input);
    expect(a).toBe(b);
    expect(a).toMatch(/^oak-approval:[a-f0-9]{64}$/);
    expect(a.length).toBeLessThan(255);
  });

  it('fails closed when approval is for a different proposal checksum', () => {
    const payload = {
      schema: 'atlas.oak-dag-approval-payload.v1' as const,
      requestId: 'request:1',
      planId: 'plan:1',
      planChecksum: H('a'),
      executionChecksum: H('d'),
      proposalChecksum: H('9'),
      evidenceChecksum: H('8'),
      affectedFiles: ['src/example.ts'],
      validations: ['focused-vitest'],
      mutationClass: 'PATCH_FILE' as const,
      canonicalAuthority: false as const,
    };
    expect(() => assertOakDagApprovalMatchesProposalV1({
      payload,
      decision: { decision: 'APPROVE', proposalChecksum: H('7'), reviewerNote: null },
    })).toThrow('OAK_APPROVAL_PROPOSAL_CHECKSUM_MISMATCH');
  });

  it('does not treat rejection as mutation authority', () => {
    const payload = {
      schema: 'atlas.oak-dag-approval-payload.v1' as const,
      requestId: 'request:1',
      planId: 'plan:1',
      planChecksum: H('a'),
      executionChecksum: H('d'),
      proposalChecksum: H('9'),
      evidenceChecksum: H('8'),
      affectedFiles: [],
      validations: [],
      mutationClass: 'OTHER' as const,
      canonicalAuthority: false as const,
    };
    expect(() => assertOakDagApprovalMatchesProposalV1({
      payload,
      decision: { decision: 'REJECT', proposalChecksum: H('9'), reviewerNote: 'needs more evidence' },
    })).toThrow('OAK_APPROVAL_REJECTED');
  });
});
