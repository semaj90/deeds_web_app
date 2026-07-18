import { createHash } from 'node:crypto';

export function symbolIdentity(sourceRef: string, symbol: string, kind = 'unknown'): string {
  return createHash('sha1').update([sourceRef, kind, symbol].join('|')).digest('hex').slice(0, 24);
}

