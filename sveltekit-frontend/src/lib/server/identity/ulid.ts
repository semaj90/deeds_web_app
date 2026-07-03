import crypto from 'crypto';

const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(time: number, length = 10): string {
  let value = Math.floor(time);
  let output = '';

  for (let i = 0; i < length; i++) {
    output = ULID_ALPHABET[value % 32] + output;
    value = Math.floor(value / 32);
  }

  return output;
}

function encodeRandom(bytes: Buffer): string {
  let output = '';
  let value = 0;
  let bits = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += ULID_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
      value &= (1 << bits) - 1;
    }
  }

  if (bits > 0) {
    output += ULID_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output.padEnd(16, '0').slice(0, 16);
}

export function makePacketUlid(now = Date.now()): string {
  return `${encodeTime(now, 10)}${encodeRandom(crypto.randomBytes(10))}`;
}
