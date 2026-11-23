/** Parent Atlas v1 conservative object/chunk AABB frustum culling.
 * Plane format: 6 consecutive (nx, ny, nz, d) tuples; inside means dot(n,p)+d >= 0.
 * Bounds format: N consecutive (minX,minY,minZ,maxX,maxY,maxZ) tuples in WORLD space.
 * Matrix format: column-major 4x4, as in Three.js Matrix4.elements.
 */
export type ClipSpace = 'webgl' | 'webgpu';
export type AabbTuple = readonly [number,number,number,number,number,number];

export function extractFrustumPlanes(matrix: ArrayLike<number>, clipSpace: ClipSpace = 'webgl'): Float32Array {
  if (matrix.length !== 16 || Array.from(matrix).some(x => !Number.isFinite(x)))
    throw new TypeError('viewProjection must be a finite column-major 4x4 matrix');
  const m = matrix;
  // Rows, despite column-major flattening.
  const r1 = [m[0],m[4],m[8],m[12]];
  const r2 = [m[1],m[5],m[9],m[13]];
  const r3 = [m[2],m[6],m[10],m[14]];
  const r4 = [m[3],m[7],m[11],m[15]];
  const add = (a:number[],b:number[]) => a.map((v,i)=>v+b[i]);
  const sub = (a:number[],b:number[]) => a.map((v,i)=>v-b[i]);
  // x+/-w, y+/-w, far z<=w, near z>=-w (WebGL) or >=0 (WebGPU).
  const source = [sub(r4,r1),add(r4,r1),add(r4,r2),sub(r4,r2),sub(r4,r3),clipSpace==='webgpu'?r3:add(r4,r3)];
  const out = new Float32Array(24);
  source.forEach((p,j) => {
    const norm = Math.hypot(p[0],p[1],p[2]);
    if (!(norm > 1e-20) || !Number.isFinite(norm)) throw new RangeError('Degenerate frustum plane');
    for (let k=0;k<4;k++) out[j*4+k] = p[k]/norm;
  });
  return out;
}

/** Conservative test: reject only if the box's most-positive support vertex is outside a plane. */
export function intersectsFrustumAabb(bounds: ArrayLike<number>, planes: ArrayLike<number>): boolean {
  if(bounds.length !== 6 || planes.length !== 24) throw new RangeError('Expected one AABB (6) and 6 planes (24)');
  for (let p=0;p<24;p+=4) {
    const x = planes[p] >= 0 ? bounds[3] : bounds[0];
    const y = planes[p+1] >= 0 ? bounds[4] : bounds[1];
    const z = planes[p+2] >= 0 ? bounds[5] : bounds[2];
    if (planes[p]*x+planes[p+1]*y+planes[p+2]*z+planes[p+3] < -1e-5) return false;
  }
  return true;
}

/** 1=potentially visible, 0=outside, never claims occlusion. JS fallback for native addon. */
export function cullAabbs(bounds: Float32Array, planes: Float32Array): Uint8Array {
  if(bounds.length % 6 || planes.length!==24) throw new RangeError('bounds must be N*6; planes must be 24');
  if(!bounds.every(Number.isFinite) || !planes.every(Number.isFinite)) throw new TypeError('Non-finite bounds or planes');
  const out = new Uint8Array(bounds.length/6);
  for(let i=0;i<out.length;i++){
    const b=bounds.subarray(i*6,i*6+6);
    if(b[0]>b[3] || b[1]>b[4] || b[2]>b[5]) throw new RangeError(`Invalid AABB at ${i}`);
    out[i] = intersectsFrustumAabb(b,planes)?1:0;
  }
  return out;
}

/** Conservative affine AABB transform; includes rotation/non-uniform scale. */
export function transformAabb(bounds: AabbTuple, m: ArrayLike<number>): AabbTuple {
  if(m.length!==16 || Array.from(m).some(x=>!Number.isFinite(x))) throw new TypeError('Invalid affine matrix');
  if(Math.abs(m[3])+Math.abs(m[7])+Math.abs(m[11])>1e-8 || Math.abs(m[15]-1)>1e-8)
    throw new RangeError('Expected affine model/world matrix, not projection');
  const c = [(bounds[0]+bounds[3])/2,(bounds[1]+bounds[4])/2,(bounds[2]+bounds[5])/2];
  const e = [(bounds[3]-bounds[0])/2,(bounds[4]-bounds[1])/2,(bounds[5]-bounds[2])/2];
  if(e.some(x=>x<0||!Number.isFinite(x))) throw new RangeError('Invalid AABB extents');
  const t = [0,1,2].map(row=>m[row]*c[0]+m[4+row]*c[1]+m[8+row]*c[2]+m[12+row]);
  const ext = [0,1,2].map(row=>Math.abs(m[row])*e[0]+Math.abs(m[4+row])*e[1]+Math.abs(m[8+row])*e[2]);
  return [t[0]-ext[0],t[1]-ext[1],t[2]-ext[2],t[0]+ext[0],t[1]+ext[1],t[2]+ext[2]];
}
