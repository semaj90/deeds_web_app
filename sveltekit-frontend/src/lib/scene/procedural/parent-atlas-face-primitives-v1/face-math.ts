/** Parent Atlas procedural face v1. Coordinates in meters: +Y up, +Z forward. */
export type FacePreset = 'neutral' | 'masculine' | 'feminine';
export type FaceParams = {
  preset: FacePreset;
  headWidthM: number; headHeightM: number; headDepthM: number;
  jawWidthRatio: number; cheekWidthRatio: number;
  chinProjectionM: number; browProjectionM: number;
  noseProjectionM: number; lipProjectionM: number;
  eyeSeparationRatio: number;
};
export type Vec3 = readonly [number, number, number];
export type FaceMesh = {
  positions: Float32Array; normals: Float32Array;
  uvs: Float32Array; indices: Uint16Array;
  landmarks: Record<string, Vec3>;
  vertexCount: number; triangleCount: number;
};

const base: FaceParams = {
  preset: 'neutral', headWidthM: 0.168, headHeightM: 0.236, headDepthM: 0.186,
  jawWidthRatio: 0.82, cheekWidthRatio: 1.04,
  chinProjectionM: 0.005, browProjectionM: 0.004,
  noseProjectionM: 0.017, lipProjectionM: 0.003,
  eyeSeparationRatio: 0.44,
};
/** Names are art-direction presets, not inferences of sex/gender from evidence. */
const PRESETS: Record<FacePreset, Partial<FaceParams>> = {
  neutral: {},
  masculine: {jawWidthRatio: 0.94, cheekWidthRatio: 1.00, chinProjectionM: 0.010,
    browProjectionM: 0.009, noseProjectionM: 0.019},
  feminine: {jawWidthRatio: 0.70, cheekWidthRatio: 1.08, chinProjectionM: 0.003,
    browProjectionM: 0.003, noseProjectionM: 0.014, lipProjectionM: 0.005},
};

export function facePreset(preset: FacePreset, overrides: Partial<FaceParams> = {}): FaceParams {
  return validateFaceParams({ ...base, ...PRESETS[preset], ...overrides, preset });
}
/** Blend any two art-directed shapes without changing vertex IDs or topology. */
export function blendFaceParams(a: FaceParams, b: FaceParams, alpha: number): FaceParams {
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new RangeError('alpha must be 0..1');
  const x = validateFaceParams(a), y = validateFaceParams(b);
  const keys = [
    'headWidthM', 'headHeightM', 'headDepthM', 'jawWidthRatio', 'cheekWidthRatio',
    'chinProjectionM', 'browProjectionM', 'noseProjectionM', 'lipProjectionM',
    'eyeSeparationRatio',
  ] as const;
  const out: FaceParams = { ...x, preset: alpha < 0.5 ? x.preset : y.preset };
  for (const key of keys) out[key] = x[key] + (y[key] - x[key]) * alpha;
  return validateFaceParams(out);
}

function range(name: string, n: number, lo: number, hi: number): void {
  if (!Number.isFinite(n) || n < lo || n > hi) throw new RangeError(`${name} must be ${lo}..${hi}`);
}
export function validateFaceParams(input: FaceParams): FaceParams {
  if (!Object.prototype.hasOwnProperty.call(PRESETS, input.preset)) throw new TypeError('Unknown preset');
  range('headWidthM', input.headWidthM, 0.08, 0.32);
  range('headHeightM', input.headHeightM, 0.12, 0.42);
  range('headDepthM', input.headDepthM, 0.08, 0.35);
  range('jawWidthRatio', input.jawWidthRatio, 0.45, 1.1);
  range('cheekWidthRatio', input.cheekWidthRatio, 0.7, 1.3);
  range('chinProjectionM', input.chinProjectionM, -0.01, 0.035);
  range('browProjectionM', input.browProjectionM, 0, 0.03);
  range('noseProjectionM', input.noseProjectionM, 0, 0.05);
  range('lipProjectionM', input.lipProjectionM, 0, 0.03);
  range('eyeSeparationRatio', input.eyeSeparationRatio, 0.28, 0.65);
  return { ...input };
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t);
};
const gauss = (x: number, center: number, width: number) => Math.exp(-(((x - center) / width) ** 2));

/** Deterministic topology shared by every preset. No textures or source claims. */
export function generateFaceMesh(params: FaceParams, longitude = 24, latitude = 16): FaceMesh {
  const p = validateFaceParams(params);
  if (!Number.isInteger(longitude) || longitude < 8 || longitude > 128 ||
      !Number.isInteger(latitude) || latitude < 6 || latitude > 128 ||
      2 + (latitude - 1) * (longitude + 1) > 65535) {
    throw new RangeError('Invalid tessellation or Uint16 vertex count');
  }
  const rx = p.headWidthM / 2, ry = p.headHeightM / 2, rz = p.headDepthM / 2;
  const vertexCount = 2 + (latitude - 1) * (longitude + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  let v = 0;
  function vertex(x: number, y: number, z: number, u: number, vv: number) {
    positions[3 * v] = x; positions[3 * v + 1] = y; positions[3 * v + 2] = z;
    uvs[2 * v] = u; uvs[2 * v + 1] = vv; v++;
  }
  vertex(0, ry, 0, 0.5, 1);
  for (let i = 1; i < latitude; i++) {
    const theta = Math.PI * i / latitude;
    const yn = Math.cos(theta);
    const rad = Math.sin(theta);
    const lower = smooth(-0.02, 0.90, -yn);
    const jawFactor = 1 + (p.jawWidthRatio - 1) * lower;
    const cheekFactor = 1 + (p.cheekWidthRatio - 1) * gauss(yn, -0.03, 0.31);
    for (let j = 0; j <= longitude; j++) {
      const phi = 2 * Math.PI * j / longitude;
      const x = rx * rad * Math.cos(phi) * jawFactor * cheekFactor;
      const y = ry * yn;
      const front = Math.max(0, Math.sin(phi));
      let z = rz * rad * Math.sin(phi);
      // Displacement only on the front hemisphere, avoiding back-of-head artifacts.
      const mask = Math.pow(front, 6);
      z += mask * (
        p.noseProjectionM * gauss(x, 0, rx * 0.20) * gauss(yn, 0.02, 0.32) +
        p.browProjectionM * (gauss(x, -rx * 0.40, rx * 0.22) + gauss(x, rx * 0.40, rx * 0.22)) * gauss(yn, 0.31, 0.14) +
        p.lipProjectionM * gauss(x, 0, rx * 0.33) * gauss(yn, -0.37, 0.13) +
        p.chinProjectionM * gauss(x, 0, rx * 0.43) * gauss(yn, -0.72, 0.20));
      vertex(x, y, z, j / longitude, 1 - i / latitude);
    }
  }
  const bottom = v;
  vertex(0, -ry, 0, 0.5, 0);
  const first = 1, stride = longitude + 1, last = first + (latitude - 2) * stride;
  const indicesList: number[] = [];
  for (let j = 0; j < longitude; j++) indicesList.push(0, first + j + 1, first + j);
  for (let i = 0; i < latitude - 2; i++) {
    const a0 = first + i * stride, b0 = a0 + stride;
    for (let j = 0; j < longitude; j++) {
      const a = a0 + j, b = b0 + j;
      indicesList.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  for (let j = 0; j < longitude; j++) indicesList.push(bottom, last + j, last + j + 1);
  const indices = new Uint16Array(indicesList);
  // Indexed, area-weighted vertex normals with seam continuity.
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k] * 3, b = indices[k + 1] * 3, c = indices[k + 2] * 3;
    const ax = positions[b] - positions[a], ay = positions[b + 1] - positions[a + 1], az = positions[b + 2] - positions[a + 2];
    const bx = positions[c] - positions[a], by = positions[c + 1] - positions[a + 1], bz = positions[c + 2] - positions[a + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    for (const o of [a, b, c]) { normals[o] += nx; normals[o + 1] += ny; normals[o + 2] += nz; }
  }
  for (let i = 0; i < latitude - 1; i++) {
    const a = (first + i * stride) * 3, b = (first + i * stride + longitude) * 3;
    for (let axis = 0; axis < 3; axis++) { const n = normals[a + axis] + normals[b + axis]; normals[a + axis] = n; normals[b + axis] = n; }
  }
  for (let i = 0; i < vertexCount; i++) {
    const j = i * 3; const m = Math.hypot(normals[j], normals[j + 1], normals[j + 2]);
    if (m === 0 || !Number.isFinite(m)) throw new Error('Degenerate face normal');
    normals[j] /= m; normals[j + 1] /= m; normals[j + 2] /= m;
  }
  const eyeX = rx * p.eyeSeparationRatio;
  const eyeY = ry * 0.18;
  const eyeZ = rz * Math.sqrt(1 - (eyeX / rx) ** 2 - (eyeY / ry) ** 2) + 0.006;
  const landmarks: Record<string, Vec3> = {
    'head.top': [0, ry, 0], 'head.chin': [0, -ry * 0.88, rz * 0.43 + p.chinProjectionM],
    'eye.left': [-eyeX, eyeY, eyeZ], 'eye.right': [eyeX, eyeY, eyeZ],
    'ear.left': [-rx * 0.99, -ry * 0.06, 0], 'ear.right': [rx * 0.99, -ry * 0.06, 0],
    'nose.tip': [0, -ry * 0.04, rz + p.noseProjectionM],
    'mouth.center': [0, -ry * 0.38, rz * 0.92 + p.lipProjectionM + 0.002],
    'neck.attach': [0, -ry, 0],
  };
  return { positions, normals, uvs, indices, landmarks, vertexCount, triangleCount: indices.length / 3 };
}

export const FACE_PART_IDS = [
  'face.head', 'face.ear.left', 'face.ear.right', 'face.eye.left', 'face.eye.right',
  'face.nose', 'face.mouth', 'face.hair', 'face.neck',
] as const;

/** Persist this tiny recipe, NOT arrays/Base64, in PostgreSQL. */
export function makeFaceManifest(id: string, p: FaceParams, provenance: {
  kind: 'procedural_generated' | 'artist_authored' | 'source_derived';
  sourceSha256: string | null; reviewStatus: 'unreviewed' | 'reviewed';
}) {
  if (!/^[a-zA-Z0-9_:-]{1,128}$/.test(id)) throw new Error('Invalid asset ID');
  if (provenance.kind === 'source_derived' && !/^[a-f0-9]{64}$/.test(provenance.sourceSha256 ?? '')) {
    throw new Error('Source-derived face requires SHA-256');
  }
  return {
    schemaVersion: 1, id, type: 'humanoid_face', coordinateSystem: 'Y_UP_Z_FORWARD_METERS',
    params: validateFaceParams(p), parts: FACE_PART_IDS, provenance,
    geometry: { format: 'glb', uri: null as string | null, sha256: null as string | null },
  };
}
