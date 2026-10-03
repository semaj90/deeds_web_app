import { describe, expect, it } from 'vitest';
import { canonicalHashJSON, verifyCanonicalHash } from './canonical-hashing.js';
import crypto from 'crypto';

describe('canonicalHashJSON', () => {
  it('sorts keys recursively without dropping nested fields', () => {
    const value = { z: { b: 2, a: 1 }, a: [{ d: 4, c: 3 }] };
    const canonical = '{"a":[{"c":3,"d":4}],"z":{"a":1,"b":2}}';
    const expected = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
    expect(canonicalHashJSON(value)).toBe(expected);
  });

  it('is independent of object insertion order at every depth', () => {
    const left = { outer: { alpha: 1, beta: 2 }, rows: [{ y: 3, x: 4 }] };
    const right = { rows: [{ x: 4, y: 3 }], outer: { beta: 2, alpha: 1 } };
    expect(canonicalHashJSON(left)).toBe(canonicalHashJSON(right));
  });

  it('preserves array order and verifies the resulting digest', () => {
    const first = { values: ['a', 'b'] };
    const second = { values: ['b', 'a'] };
    const digest = canonicalHashJSON(first);
    expect(verifyCanonicalHash(first, digest)).toBe(true);
    expect(verifyCanonicalHash(second, digest)).toBe(false);
  });
});
