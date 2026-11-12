import { describe, it, expect } from 'vitest';
import { encode } from '@msgpack/msgpack';
import {
  encodeNesLutDescriptorToMsgpack,
  decodeNesLutDescriptorFromMsgpack,
  NES_LUT_DESCRIPTOR_SCHEMA,
  type NesLutDescriptorV1,
} from './packet-msgpack-codec.js';

const GOOD: NesLutDescriptorV1 = {
  domain: 'retrieval',
  lutByte: 0x03,
  nesHex: '0x21',
  uuidRef: '3f2b8c1e-9a4d-4b7e-8f10-2c6d5e7a9b01',
  tierFlags: 0b00000101,
};

describe('NES LUT descriptor MsgPack (NLUT-06)', () => {
  it('round-trips the descriptor exactly', () => {
    const bytes = encodeNesLutDescriptorToMsgpack(GOOD);
    expect(decodeNesLutDescriptorFromMsgpack(bytes)).toEqual(GOOD);
  });

  it('keeps lutByte and nesHex as distinct fields', () => {
    const back = decodeNesLutDescriptorFromMsgpack(encodeNesLutDescriptorToMsgpack(GOOD));
    expect(back.lutByte).toBe(0x03);
    expect(back.nesHex).toBe('0x21');
    expect(back.lutByte).not.toBe(parseInt(back.nesHex, 16));
  });

  it('keeps the unresolved byte 0x00 as a valid, explicit value', () => {
    const unresolved = { ...GOOD, domain: 'unresolved', lutByte: 0 };
    expect(decodeNesLutDescriptorFromMsgpack(encodeNesLutDescriptorToMsgpack(unresolved)).lutByte).toBe(0);
  });

  it('is a small fixed-shape payload: under 128 bytes, scalars only, no float arrays', () => {
    const bytes = encodeNesLutDescriptorToMsgpack(GOOD);
    expect(bytes.byteLength).toBeLessThan(128);
    const decoded = JSON.parse(JSON.stringify(decodeNesLutDescriptorFromMsgpack(bytes)));
    for (const value of Object.values(decoded)) {
      expect(Array.isArray(value)).toBe(false);
      if (typeof value === 'number') expect(Number.isInteger(value)).toBe(true);
    }
    expect(Object.keys(decoded).sort()).toEqual(['domain', 'lutByte', 'nesHex', 'tierFlags', 'uuidRef']);
  });

  it('rejects invalid fields instead of defaulting them', () => {
    const bad: Array<[string, Partial<NesLutDescriptorV1>, string]> = [
      ['domain', { domain: '' }, 'NES_LUT_DESCRIPTOR_DOMAIN_INVALID'],
      ['lutByte high', { lutByte: 256 }, 'NES_LUT_DESCRIPTOR_LUT_BYTE_INVALID'],
      ['lutByte float', { lutByte: 1.5 }, 'NES_LUT_DESCRIPTOR_LUT_BYTE_INVALID'],
      ['nesHex no prefix', { nesHex: '21' }, 'NES_LUT_DESCRIPTOR_NES_HEX_INVALID'],
      ['uuid', { uuidRef: 'not-a-uuid' }, 'NES_LUT_DESCRIPTOR_UUID_INVALID'],
      ['tierFlags', { tierFlags: -1 }, 'NES_LUT_DESCRIPTOR_TIER_FLAGS_INVALID'],
    ];
    for (const [, override, code] of bad) {
      expect(() => encodeNesLutDescriptorToMsgpack({ ...GOOD, ...override })).toThrow(code);
    }
  });

  it('rejects a payload with the wrong schema tag', () => {
    const wrong = encode({ s: 'atlas.other.v1', d: 'x', l: 1, n: '0x16', u: GOOD.uuidRef, t: 0 });
    expect(() => decodeNesLutDescriptorFromMsgpack(wrong)).toThrow('NES_LUT_DESCRIPTOR_SCHEMA_MISMATCH');
    expect(NES_LUT_DESCRIPTOR_SCHEMA).toBe('atlas.nes-lut-descriptor.v1');
  });
});
