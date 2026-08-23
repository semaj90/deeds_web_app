import { describe, expect, it } from 'vitest';

import {
  materializeTraceCandidateEvidenceBindingV1,
  materializeTraceExecutionV1,
  materializeTraceOutcomeReceiptV1,
  traceCandidateEvidenceBindingV1Schema,
} from './trace-authority-v1.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const START = '2026-08-22T18:00:00.000Z';
const END = '2026-08-22T18:00:01.000Z';

function executionInput() {
  return {
    traceId: 'trace-001',
    requestId: 'request-001',
    workflowId: null,
    queryHash: HASH_A,
    surface: 'search-runtime',
    workspaceRevision: 'workspace-r1',
    graphRevision: 'graph-r1',
    representationRevision: 'semantic-768-r1',
    revisionSetHash: HASH_B,
    startedAt: START,
    finalizedAt: null,
    state: 'OPEN' as const,
    producerRevision: 'trace-owner-r1',
  };
}

function bindingInput() {
  return {
    traceId: 'trace-001',
    candidateOrdinal: 7,
    candidateSnapshotRevision: 'candidate-snapshot-r1',
    packetKey: 'packet:key:7',
    canonicalId: 'canonical:7',
    symbolVersionId: 'symbol-version:7',
    sourceRef: 'src/lib/example.ts#L10-L20',
    workspaceRevision: 'workspace-r1',
    sourceRevision: 'source-r7',
    representationRevision: 'semantic-768-r1',
    logicalLane: 'semantic',
    executor: 'qdrant',
    rawScore: 0.91,
    normalizedScore: 0.88,
    rank: 0,
    retrieved: true,
    selected: true,
    exactPromoted: true,
    usedInContext: true,
    executionDependentOnCandidate: false,
    evidenceRefs: ['evidence:source:7'],
    producerRevision: 'trace-owner-r1',
  };
}

describe('Trace authority v1', () => {
  it('materializes deterministic correlation identity without becoming canonical candidate identity', () => {
    const first = materializeTraceExecutionV1(executionInput());
    const second = materializeTraceExecutionV1({ ...executionInput() });

    expect(first).toEqual(second);
    expect(first.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(first.identityAuthority).toBe(false);
    expect(first.state).toBe('OPEN');
  });

  it('requires a finalized timestamp for finalized executions', () => {
    expect(() => materializeTraceExecutionV1({
      ...executionInput(),
      state: 'FINALIZED',
      finalizedAt: null,
    })).toThrow(/TRACE_FINALIZED_REQUIRES_FINALIZED_AT/);

    expect(materializeTraceExecutionV1({
      ...executionInput(),
      state: 'FINALIZED',
      finalizedAt: END,
    }).finalizedAt).toBe(END);
  });

  it('binds candidate evidence to exact identity and snapshot-scoped ordinal coordinates', () => {
    const binding = materializeTraceCandidateEvidenceBindingV1(bindingInput());

    expect(binding.candidateOrdinal).toBe(7);
    expect(binding.candidateSnapshotRevision).toBe('candidate-snapshot-r1');
    expect(binding.packetKey).toBe('packet:key:7');
    expect(binding.sourceRevision).toBe('source-r7');
    expect(binding.bindingChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(binding.identityAuthority).toBe(false);
  });

  it('rejects impossible retrieval-to-execution progression', () => {
    expect(() => materializeTraceCandidateEvidenceBindingV1({
      ...bindingInput(),
      retrieved: false,
      selected: true,
    })).toThrow(/TRACE_SELECTED_REQUIRES_RETRIEVED/);

    expect(() => materializeTraceCandidateEvidenceBindingV1({
      ...bindingInput(),
      selected: false,
      exactPromoted: true,
    })).toThrow(/TRACE_EXACT_PROMOTION_REQUIRES_SELECTED/);

    expect(() => materializeTraceCandidateEvidenceBindingV1({
      ...bindingInput(),
      exactPromoted: false,
      usedInContext: true,
    })).toThrow(/TRACE_CONTEXT_USE_REQUIRES_EXACT_PROMOTION/);
  });

  it('requires CandidateOrdinal and candidate snapshot revision together', () => {
    const parsed = traceCandidateEvidenceBindingV1Schema.safeParse({
      ...materializeTraceCandidateEvidenceBindingV1(bindingInput()),
      candidateSnapshotRevision: null,
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message === 'TRACE_CANDIDATE_ORDINAL_REQUIRES_SNAPSHOT_REVISION')).toBe(true);
    }
  });

  it('keeps downstream outcome separate from retrieval relevance', () => {
    const receipt = materializeTraceOutcomeReceiptV1({
      receiptId: 'receipt-001',
      traceId: 'trace-001',
      executed: true,
      outcome: 'SUCCESS',
      downstreamSuccess: true,
      repairSucceeded: true,
      verificationPassed: true,
      resultRef: 'artifact:repair:1',
      failureClass: null,
      errorCode: null,
      latencyMs: 1234,
      tokenCost: 456,
      verificationReceiptRefs: ['verify:test:1'],
      workspaceRevision: 'workspace-r1',
      graphRevision: 'graph-r1',
      representationRevision: 'semantic-768-r1',
      revisionSetHash: HASH_B,
      finalizedAt: END,
      producerRevision: 'trace-owner-r1',
    });

    expect(receipt.finalized).toBe(true);
    expect(receipt.outcome).toBe('SUCCESS');
    expect(receipt.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect('relevance' in receipt).toBe(false);
  });

  it('does not permit repair success without validator success', () => {
    expect(() => materializeTraceOutcomeReceiptV1({
      receiptId: 'receipt-002',
      traceId: 'trace-001',
      executed: true,
      outcome: 'SUCCESS',
      downstreamSuccess: true,
      repairSucceeded: true,
      verificationPassed: false,
      resultRef: null,
      failureClass: null,
      errorCode: null,
      latencyMs: null,
      tokenCost: null,
      verificationReceiptRefs: [],
      workspaceRevision: 'workspace-r1',
      graphRevision: null,
      representationRevision: 'semantic-768-r1',
      revisionSetHash: HASH_B,
      finalizedAt: END,
      producerRevision: 'trace-owner-r1',
    })).toThrow(/TRACE_REPAIR_SUCCESS_REQUIRES_VERIFICATION_PASS/);
  });
});
