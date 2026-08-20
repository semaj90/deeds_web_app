import { createHash } from 'node:crypto';
import type { ByteHasher } from './rfc9162-merkle.js';

export const nodeSha256Hasher: ByteHasher = {
  sha256(input: Uint8Array): Uint8Array {
    return new Uint8Array(createHash('sha256').update(input).digest());
  },
};
