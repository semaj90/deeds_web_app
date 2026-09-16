import { describe, expect, it, vi } from 'vitest';
import { blockAtlasWorkflowV1, verifyRetrievedPacketsV1 } from './atlas-mastra-workflow.js';

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
});
