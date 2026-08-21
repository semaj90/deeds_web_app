import { describe, expect, it } from 'vitest';
import { bytesToHex, merkleTreeHash } from './rfc9162-merkle.js';
import { nodeSha256Hasher } from './node-sha256.js';

const enc = new TextEncoder();

describe('Merkle tree', () => {
  it('is deterministic', () => {
    const leaves = ['a', 'b', 'c'].map((x) => enc.encode(x));
    const a = bytesToHex(merkleTreeHash(leaves, nodeSha256Hasher));
    const b = bytesToHex(merkleTreeHash(leaves, nodeSha256Hasher));
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('is order-sensitive', () => {
    const a = ['a', 'b', 'c'].map((x) => enc.encode(x));
    const b = ['b', 'a', 'c'].map((x) => enc.encode(x));
    expect(bytesToHex(merkleTreeHash(a, nodeSha256Hasher)))
      .not.toBe(bytesToHex(merkleTreeHash(b, nodeSha256Hasher)));
  });

  it('changes when one leaf changes', () => {
    const a = ['a', 'b', 'c'].map((x) => enc.encode(x));
    const b = ['a', 'B', 'c'].map((x) => enc.encode(x));
    expect(bytesToHex(merkleTreeHash(a, nodeSha256Hasher)))
      .not.toBe(bytesToHex(merkleTreeHash(b, nodeSha256Hasher)));
  });
});
