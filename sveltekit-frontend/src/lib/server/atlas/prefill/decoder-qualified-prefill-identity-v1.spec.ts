import { describe, expect, it } from 'vitest';
import {
  buildDecoderQualifiedPrefillIdentityV1,
  computeLatentInputChecksumV1,
  decoderQualifiedPrefillCacheKeyV1,
  type DecoderQualifiedPrefillIdentityInputV1,
} from './decoder-qualified-prefill-identity-v1.js';

const BASE_PREFILL_IDENTITY_CHECKSUM =
  'a'.repeat(64);
const CHECKPOINT_SHA =
  'b'.repeat(64);

function baseInput(): DecoderQualifiedPrefillIdentityInputV1 {
  return {
    basePrefillIdentityChecksum: BASE_PREFILL_IDENTITY_CHECKSUM,
    decoderContractRevision: 'decoder-contract-v1',
    representationId: 'latent_256',
    representationRevision: 'rep-v1',
    checkpointRevision: 'ckpt-2026-08-31',
    checkpointSha256: CHECKPOINT_SHA,
    latentInputChecksum: computeLatentInputChecksumV1([[1, 2, 3]]),
    decoderPolicyRevision: 'policy-v1',
  };
}

describe('DECODER-QUALIFIED-PREFILL-IDENTITY-01', () => {
  it('is deterministic across repeated builds of the same input', () => {
    const a = buildDecoderQualifiedPrefillIdentityV1(baseInput());
    const b = buildDecoderQualifiedPrefillIdentityV1(baseInput());
    expect(a.checksumSha256).toBe(b.checksumSha256);
    expect(decoderQualifiedPrefillCacheKeyV1(a)).toBe(decoderQualifiedPrefillCacheKeyV1(b));
  });

  it('changes when the base prefill identity changes (no silent stale reuse across base revisions)', () => {
    const a = buildDecoderQualifiedPrefillIdentityV1(baseInput());
    const b = buildDecoderQualifiedPrefillIdentityV1({
      ...baseInput(),
      basePrefillIdentityChecksum: 'c'.repeat(64),
    });
    expect(a.checksumSha256).not.toBe(b.checksumSha256);
  });

  it('changes when checkpointRevision changes (the exact trap this module closes)', () => {
    const a = buildDecoderQualifiedPrefillIdentityV1(baseInput());
    const b = buildDecoderQualifiedPrefillIdentityV1({ ...baseInput(), checkpointRevision: 'ckpt-2026-09-01' });
    expect(a.checksumSha256).not.toBe(b.checksumSha256);
  });

  it('changes when checkpointSha256 changes', () => {
    const a = buildDecoderQualifiedPrefillIdentityV1(baseInput());
    const b = buildDecoderQualifiedPrefillIdentityV1({ ...baseInput(), checkpointSha256: 'd'.repeat(64) });
    expect(a.checksumSha256).not.toBe(b.checksumSha256);
  });

  it('changes when latentInputChecksum changes (different semantic_768 batch)', () => {
    const a = buildDecoderQualifiedPrefillIdentityV1(baseInput());
    const b = buildDecoderQualifiedPrefillIdentityV1({
      ...baseInput(),
      latentInputChecksum: computeLatentInputChecksumV1([[4, 5, 6]]),
    });
    expect(a.checksumSha256).not.toBe(b.checksumSha256);
  });

  it('changes when decoderPolicyRevision changes', () => {
    const a = buildDecoderQualifiedPrefillIdentityV1(baseInput());
    const b = buildDecoderQualifiedPrefillIdentityV1({ ...baseInput(), decoderPolicyRevision: 'policy-v2' });
    expect(a.checksumSha256).not.toBe(b.checksumSha256);
  });

  it('changes when decoderContractRevision or representationRevision change', () => {
    const a = buildDecoderQualifiedPrefillIdentityV1(baseInput());
    const bContract = buildDecoderQualifiedPrefillIdentityV1({ ...baseInput(), decoderContractRevision: 'decoder-contract-v2' });
    const bRepresentation = buildDecoderQualifiedPrefillIdentityV1({ ...baseInput(), representationRevision: 'rep-v2' });
    expect(a.checksumSha256).not.toBe(bContract.checksumSha256);
    expect(a.checksumSha256).not.toBe(bRepresentation.checksumSha256);
  });

  it('computeLatentInputChecksumV1 is order-sensitive and value-sensitive (not a set hash)', () => {
    const rowOrderA = computeLatentInputChecksumV1([[1, 2], [3, 4]]);
    const rowOrderB = computeLatentInputChecksumV1([[3, 4], [1, 2]]);
    const differentValue = computeLatentInputChecksumV1([[1, 2], [3, 4.0001]]);
    expect(rowOrderA).not.toBe(rowOrderB);
    expect(rowOrderA).not.toBe(differentValue);
  });

  it('cache key is namespaced under the existing atlas:prefill:v1 root, not a second cache authority', () => {
    const identity = buildDecoderQualifiedPrefillIdentityV1(baseInput());
    expect(decoderQualifiedPrefillCacheKeyV1(identity)).toMatch(/^atlas:prefill:v1:decoder-qualified:[a-f0-9]{64}$/);
  });

  it('rejects a schema that leaks executor coordinates (serviceUrl/containerId) into identity', () => {
    const withExtra = { ...baseInput(), serviceUrl: 'http://127.0.0.1:8121' } as unknown;
    expect(() =>
      buildDecoderQualifiedPrefillIdentityV1(withExtra as DecoderQualifiedPrefillIdentityInputV1),
    ).toThrow();
  });
});
