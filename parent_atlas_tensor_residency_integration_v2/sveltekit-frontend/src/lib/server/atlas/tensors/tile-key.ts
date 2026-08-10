import type { QuantizedTopology4 } from './topology-coordinate4';

function rotate(n: number, x: number, y: number, rx: number, ry: number): [number, number] {
  if (ry === 0) {
    if (rx === 1) {
      x = n - 1 - x;
      y = n - 1 - y;
    }
    return [y, x];
  }
  return [x, y];
}

export function hilbertIndex2D(x: number, y: number, bits = 5): number {
  const n = 1 << bits;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) {
    throw new Error(`Hilbert coordinate must be in [0, ${n - 1}]`);
  }
  let d = 0;
  let xx = x;
  let yy = y;
  for (let s = n >> 1; s > 0; s >>= 1) {
    const rx = (xx & s) > 0 ? 1 : 0;
    const ry = (yy & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    [xx, yy] = rotate(s, xx, yy, rx, ry);
  }
  return d;
}

export function buildTileKey(
  representationRevision: string,
  q: QuantizedTopology4,
  bits = 5
): string {
  if (!representationRevision) throw new Error('representationRevision required');
  const h = hilbertIndex2D(q.somX, q.somY, bits);
  return `${representationRevision}:h${h}:a${q.authorityBin}:e${q.entropyBin}`;
}
