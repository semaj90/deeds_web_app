import { describe, expect, it } from 'vitest';
import {
  observationFromRuntimeToolReceiptV1,
  extractRuntimeToolReceiptV1,
  RuntimeToolReceiptV1Schema,
  type RuntimeToolReceiptV1,
} from './atlas-runtime-context.js';

const receipt: RuntimeToolReceiptV1 = {
  schema: 'atlas.runtime-tool-receipt.v1',
  receiptId: 'receipt-1',
  receiptChecksum: 'sha256:' + 'a'.repeat(64),
  toolCallId: 'tool-call-1',
  toolName: 'atlas.retrieve',
  runId: 'run-1',
  workspaceId: 'workspace-1',
  packetKey: 'packet-1',
  workspaceRevision: 'workspace-r1',
  packetRevision: 'packet-r1',
  succeeded: true,
  errorCode: null,
  retrievalConfidence: 0.91,
  evidenceCount: 4,
  validationStatus: 'PASS',
  outputChecksum: null,
  writesPerformed: false,
  canonicalAuthority: false,
};

describe('RuntimeToolReceiptV1 projection', () => {
  it('projects actual receipt facts without changing identity ownership', () => {
    expect(observationFromRuntimeToolReceiptV1(receipt, 2, 0.25, {
      runId: 'run-1', workspaceId: 'workspace-1', packetKey: 'packet-1',
      workspaceRevision: 'workspace-r1', packetRevision: 'packet-r1',
    })).toMatchObject({
      lastTool: 'atlas.retrieve',
      lastToolSucceeded: true,
      retrievalConfidence: 0.91,
      evidenceCount: 4,
      validationStatus: 'PASS',
      iterationNumber: 2,
    });
  });

  it('fails closed when no prior receipt exists', () => {
    expect(observationFromRuntimeToolReceiptV1(undefined, 1, 0.1)).toMatchObject({
      lastTool: 'none',
      lastToolSucceeded: false,
      lastToolError: 'PRIOR_TOOL_RECEIPT_REQUIRED',
      validationStatus: 'FAIL',
      evidenceCount: 0,
    });
  });

  it('rejects malformed receipt data before it becomes FSM evidence', () => {
    expect(() => RuntimeToolReceiptV1Schema.parse({ ...receipt, evidenceCount: -1 })).toThrow();
    expect(() => observationFromRuntimeToolReceiptV1({ ...receipt, toolName: '' }, 1, 0.1)).toThrow();
  });

  it('rejects a receipt from a different revision-qualified cohort', () => {
    expect(() => observationFromRuntimeToolReceiptV1(receipt, 1, 0.1, {
      runId: 'run-1', workspaceId: 'workspace-1', packetKey: 'packet-1',
      workspaceRevision: 'workspace-r2', packetRevision: 'packet-r1',
    })).toThrow('ATLAS_TOOL_RECEIPT_IDENTITY_MISMATCH');
  });

  it('extracts only an explicitly returned valid receipt', () => {
    expect(extractRuntimeToolReceiptV1({ receipt })).toEqual(receipt);
    expect(() => extractRuntimeToolReceiptV1({ result: 'success' })).toThrow('RUNTIME_TOOL_RECEIPT_REQUIRED');
    expect(() => extractRuntimeToolReceiptV1({ receipt: { ...receipt, evidenceCount: -1 } }))
      .toThrow('RUNTIME_TOOL_RECEIPT_INVALID');
  });
});
