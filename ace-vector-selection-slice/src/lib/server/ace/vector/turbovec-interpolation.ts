import { ACE_LATENT_DIM } from './ace-packet-vector';

export type TurboVecInterpolationInput = {
  packet: Float32Array;
  query: Float32Array;
  centroid?: Float32Array;
  packetWeight: number;
  queryWeight: number;
  centroidWeight?: number;
};

function assertVector(name: string, vector: Float32Array): void {
  if (!(vector instanceof Float32Array)) {
    throw new TypeError(`${name} must be a Float32Array`);
  }
  if (vector.length !== ACE_LATENT_DIM) {
    throw new RangeError(
      `${name} must contain exactly ${ACE_LATENT_DIM} values; got ${vector.length}`,
    );
  }
  for (let i = 0; i < vector.length; i += 1) {
    if (!Number.isFinite(vector[i])) {
      throw new TypeError(`${name}[${i}] must be finite`);
    }
  }
}

function assertWeight(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, non-negative number`);
  }
}

export function l2Normalize64(vector: Float32Array): Float32Array {
  assertVector('vector', vector);

  let squaredNorm = 0;
  for (let i = 0; i < vector.length; i += 1) {
    squaredNorm += vector[i] * vector[i];
  }

  const norm = Math.sqrt(squaredNorm);
  if (!Number.isFinite(norm) || norm <= Number.EPSILON) {
    throw new Error('Cannot L2-normalize a zero-length vector');
  }

  const output = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) {
    output[i] = vector[i] / norm;
  }
  return output;
}

export function interpolateTurboVec(
  input: TurboVecInterpolationInput,
): Float32Array {
  assertVector('packet', input.packet);
  assertVector('query', input.query);

  if (input.centroid !== undefined) {
    assertVector('centroid', input.centroid);
  }

  const centroidWeight = input.centroidWeight ?? 0;

  assertWeight('packetWeight', input.packetWeight);
  assertWeight('queryWeight', input.queryWeight);
  assertWeight('centroidWeight', centroidWeight);

  if (!input.centroid && centroidWeight !== 0) {
    throw new Error(
      'centroidWeight must be 0 when no centroid vector is supplied',
    );
  }

  const totalWeight =
    input.packetWeight + input.queryWeight + centroidWeight;

  if (totalWeight <= Number.EPSILON) {
    throw new Error('Interpolation weights must sum to a positive value');
  }

  const packetWeight = input.packetWeight / totalWeight;
  const queryWeight = input.queryWeight / totalWeight;
  const normalizedCentroidWeight = centroidWeight / totalWeight;

  const output = new Float32Array(ACE_LATENT_DIM);

  for (let i = 0; i < ACE_LATENT_DIM; i += 1) {
    output[i] =
      packetWeight * input.packet[i] +
      queryWeight * input.query[i] +
      normalizedCentroidWeight * (input.centroid?.[i] ?? 0);
  }

  return l2Normalize64(output);
}

export function cosineSimilarity64(
  left: Float32Array,
  right: Float32Array,
): number {
  assertVector('left', left);
  assertVector('right', right);

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let i = 0; i < ACE_LATENT_DIM; i += 1) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }

  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  if (denominator <= Number.EPSILON) {
    return 0;
  }

  return dot / denominator;
}
