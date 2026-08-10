import { describe, expect, it } from 'vitest';
import { assertTokenFeatureMap, remapKey } from '../../../src/lib/server/atlas/tensors/token-feature-map';

describe('TokenFeatureMap', () => {
  it('keeps model token identity and atlas remap metadata deterministic', () => {
    const row = { tokenizerRevision:'ornith-tokenizer-r1', nativeTokenId:42, byteStart:10, byteEnd:13, engramKey:0x646566, entropy:1.2, surprisal:2.1 };
    expect(() => assertTokenFeatureMap(row)).not.toThrow();
    expect(remapKey(row)).toBe(remapKey({...row}));
  });
});
