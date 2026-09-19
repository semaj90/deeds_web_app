import { describe, expect, it, vi } from 'vitest';
import { blockAtlasWorkflowV1, executeAtlasRetrieval, requireRuntimeToolReceiptForResultV1, verifyRetrievedPacketsV1 } from './atlas-mastra-workflow.js';

describe('Atlas packet verification boundary', () => {
  it('blocks unavailable discovery and unreceipted validation', () => {
    expect(blockAtlasWorkflowV1('DISCOVERY_ADAPTER_UNAVAILABLE')).toEqual({
      state: 'RECOVER',
      reason: 'DISCOVERY_ADAPTER_UNAVAILABLE',
    });
    expect(blockAtlasWorkflowV1('VALIDATION_RECEIPT_REQUIRED')).toEqual({
      state: 'RECOVER',
      reason: 'VALIDATION_RECEIPT_REQUIRED',
    });
  });

  it('rejects empty retrieval without invoking the validator', async () => {
    const validate = vi.fn();
    await expect(verifyRetrievedPacketsV1([], validate)).resolves.toEqual({
      valid: false,
      reason: 'NO_RETRIEVED_PACKETS_TO_VERIFY',
    });
    expect(validate).not.toHaveBeenCalled();
  });

  it('rejects missing packet identity', async () => {
    const validate = vi.fn();
    await expect(verifyRetrievedPacketsV1([{}], validate)).resolves.toEqual({
      valid: false,
      reason: 'RETRIEVED_PACKET_KEY_REQUIRED',
    });
  });

  it('requires every packet to validate before synthesis can proceed', async () => {
    const validate = vi.fn(async (packetKey: string) => ({ valid: packetKey === 'packet:ok' }));
    await expect(verifyRetrievedPacketsV1([{ packetKey: 'packet:ok' }, { packetKey: 'packet:bad' }], validate))
      .resolves.toEqual({ valid: false, reason: 'PACKET_CANONICAL_VALIDATION_FAILED' });
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('returns a bounded valid result only when all packet checks pass', async () => {
    const validate = vi.fn(async () => ({ valid: true }));
    await expect(verifyRetrievedPacketsV1([{ packetKey: 'packet:1' }], validate))
      .resolves.toEqual({ valid: true, packetCount: 1 });
  });

  it('rejects a prior receipt that belongs to another revision cohort', async () => {
    await expect(executeAtlasRetrieval({
      workspaceId: 'workspace-1',
      query: 'query',
      packetKey: 'packet-1',
      workspaceRevision: 'workspace-r2',
      packetRevision: 'packet-r1',
      maxIterations: 1,
      priorToolReceipt: {
        schema: 'atlas.runtime-tool-receipt.v1',
        receiptId: 'receipt-1',
        receiptChecksum: 'sha256:' + 'a'.repeat(64),
        toolCallId: 'tool-call-1',
        toolName: 'atlas.discover',
        runId: 'different-run',
        workspaceId: 'workspace-1',
        packetKey: 'packet-1',
        workspaceRevision: 'workspace-r1',
        packetRevision: 'packet-r1',
        succeeded: true,
        errorCode: null,
        retrievalConfidence: 0.8,
        evidenceCount: 1,
        validationStatus: 'PASS',
        outputChecksum: null,
        writesPerformed: false,
        canonicalAuthority: false,
      },
    })).rejects.toThrow('ATLAS_TOOL_RECEIPT_IDENTITY_MISMATCH');
  });

  it('does not treat a backend payload as evidence without an explicit receipt', () => {
    expect(() => requireRuntimeToolReceiptForResultV1({ evidence: [] }))
      .toThrow('RUNTIME_TOOL_RECEIPT_REQUIRED');
  });
});
