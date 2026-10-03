import { describe, expect, it } from 'vitest';
import {
  AGENTIC_CAPABILITY_BITS_V1,
  assertAgenticCapabilityCpuParityV1,
  decodeAgenticCapabilityMaskV1,
  encodeAgenticCapabilityMaskV1,
  hasAgenticCapabilityV1,
} from './agentic-capability-mask-v1';

describe('agentic capability mask v1', () => {
  it('encodes a deterministic sorted mask and decodes it on the CPU', () => {
    const encoded = encodeAgenticCapabilityMaskV1(['SEARCH', 'READ', 'SEARCH']);
    expect(encoded.mask).toBe((1 << AGENTIC_CAPABILITY_BITS_V1.READ) | (1 << AGENTIC_CAPABILITY_BITS_V1.SEARCH));
    expect(encoded.capabilities).toEqual(['READ', 'SEARCH']);
    expect(decodeAgenticCapabilityMaskV1(encoded.mask)).toEqual(['READ', 'SEARCH']);
    expect(encoded.canonicalAuthority).toBe(false);
    expect(encoded.writesPerformed).toBe(false);
  });

  it('proves the reference parity vector and capability membership', () => {
    const expected = (1 << AGENTIC_CAPABILITY_BITS_V1.VALIDATE) | (1 << AGENTIC_CAPABILITY_BITS_V1.REPAIR);
    const encoded = assertAgenticCapabilityCpuParityV1(['REPAIR', 'VALIDATE'], expected);
    expect(hasAgenticCapabilityV1(encoded, 'REPAIR')).toBe(true);
    expect(hasAgenticCapabilityV1(encoded, 'MUTATE')).toBe(false);
  });

  it('fails closed for invalid masks and parity', () => {
    expect(() => decodeAgenticCapabilityMaskV1(-1)).toThrow('AGENTIC_CAPABILITY_MASK_UNQUALIFIED');
    expect(() => assertAgenticCapabilityCpuParityV1(['READ'], 0)).toThrow('AGENTIC_CAPABILITY_CPU_PARITY_FAILED');
  });
});
