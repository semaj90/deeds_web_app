/**
 * 2-D Hilbert locality adapter.
 *
 * This is not a semantic embedding and not proof of a manifold. Feed it an
 * already-justified 2-D projection/routing coordinate pair.
 */

function rot(n, x, y, rx, ry) {
  if (ry === 0) {
    if (rx === 1) { x = n - 1 - x; y = n - 1 - y; }
    [x, y] = [y, x];
  }
  return [x, y];
}

export function hilbertXYToIndex(bits, x, y) {
  if (!Number.isInteger(bits) || bits < 1 || bits > 16) throw new RangeError('bits must be 1..16');
  const n = 1 << bits;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) {
    throw new RangeError(`x/y must be integer grid coordinates in [0,${n - 1}]`);
  }
  let d = 0;
  for (let s = n >> 1; s > 0; s >>= 1) {
    const rx = (x & s) > 0 ? 1 : 0;
    const ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    [x, y] = rot(s, x, y, rx, ry);
  }
  return d >>> 0;
}

export function quantize2D(points, bits = 12) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const n = (1 << bits) - 1;
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError('points require finite x/y');
    xmin=Math.min(xmin,p.x); xmax=Math.max(xmax,p.x); ymin=Math.min(ymin,p.y); ymax=Math.max(ymax,p.y);
  }
  const sx=xmax>xmin?n/(xmax-xmin):0;
  const sy=ymax>ymin?n/(ymax-ymin):0;
  return points.map((p,i)=>({
    ...p,
    _sourceIndex:i,
    hx:sx===0?0:Math.max(0,Math.min(n,Math.round((p.x-xmin)*sx))),
    hy:sy===0?0:Math.max(0,Math.min(n,Math.round((p.y-ymin)*sy))),
  }));
}

export function sortByHilbert2D(points, bits = 12) {
  return quantize2D(points,bits)
    .map(p=>({...p,hilbertIndex:hilbertXYToIndex(bits,p.hx,p.hy)}))
    .sort((a,b)=>a.hilbertIndex-b.hilbertIndex || a._sourceIndex-b._sourceIndex);
}
