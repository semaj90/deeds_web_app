/** Experiment-only ATXP v1 binary envelope, not canonical Atlas packet framing. */
import { createHash, timingSafeEqual } from 'node:crypto';
const MAGIC = Buffer.from('ATXP', 'ascii');
export const MAX_PAYLOAD = 2_000_000;
export const HEADER_BYTES = 41;
export function encodeEnvelope(payload: Uint8Array): Buffer {
  if (!(payload instanceof Uint8Array) || payload.byteLength > MAX_PAYLOAD) throw new Error('INVALID_PAYLOAD');
  const body = Buffer.from(payload);
  const header = Buffer.alloc(HEADER_BYTES);
  MAGIC.copy(header, 0);
  header.writeUInt8(1, 4);
  header.writeUInt32BE(body.length, 5);
  createHash('sha256').update(body).digest().copy(header, 9);
  return Buffer.concat([header, body]);
}
export function decodeEnvelope(wire: Uint8Array): Buffer {
  if (!(wire instanceof Uint8Array) || wire.byteLength < HEADER_BYTES) throw new Error('TRUNCATED_HEADER');
  const b = Buffer.from(wire);
  if (!b.subarray(0, 4).equals(MAGIC) || b[4] !== 1) throw new Error('UNSUPPORTED_ENVELOPE');
  const length = b.readUInt32BE(5);
  if (length > MAX_PAYLOAD || b.length !== HEADER_BYTES + length) throw new Error('INVALID_LENGTH');
  const actual = createHash('sha256').update(b.subarray(HEADER_BYTES)).digest();
  if (!timingSafeEqual(actual, b.subarray(9, 41))) throw new Error('CHECKSUM_MISMATCH');
  return b.subarray(HEADER_BYTES);
}
