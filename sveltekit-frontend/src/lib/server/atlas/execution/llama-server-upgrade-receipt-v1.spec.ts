import { describe, expect, it } from 'vitest';
import { buildLlamaServerUpgradeReceiptV1 } from './llama-server-upgrade-receipt-v1.js';

describe('LlamaServerUpgradeReceiptV1', () => {
  it('keeps the current :8090 runtime review-only when checksums are missing', () => {
    const receipt = buildLlamaServerUpgradeReceiptV1({ currentModelId: 'ornith-1.5-9b' });
    expect(receipt.status).toBe('BLOCKED_MISSING_CHECKSUM');
    expect(receipt.upgradeAuthorized).toBe(false);
    expect(receipt.rollback.disableCandidateOnly).toBe(true);
    expect(receipt.writesPerformed).toBe(false);
  });

  it('requires explicit review even when candidate identity is complete', () => {
    const receipt = buildLlamaServerUpgradeReceiptV1({
      currentModelId: 'ornith-1.5-9b',
      currentModelChecksum: 'sha256:current',
      candidateBinaryRevision: 'llama-server:next',
      candidateModelChecksum: 'sha256:candidate',
    });
    expect(receipt.status).toBe('READY_FOR_EXPLICIT_REVIEW');
    expect(receipt.upgradeAuthorized).toBe(false);
    expect(receipt.canonicalAuthority).toBe(false);
  });
});
