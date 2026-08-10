import { NUMERIC_EPSILON } from './feature-ranges';

export type GeometrySourceSpace = 'SEMANTIC_768' | 'LATENT_128';
export type GeometryTargetSpace = 'SOM_2D' | 'SCENE_3D';

export interface GeometryExperimentManifest {
  experimentRevision: string;
  representationRevision: string;
  sourceSpace: GeometrySourceSpace;
  targetSpace: GeometryTargetSpace;
  algorithm: 'KMEANS' | 'SOM' | 'LINEAR_PROJECTION' | 'AUTOENCODER';
  promoted: false;
}

export interface ProjectionDiagnostics {
  jacobianFrobeniusNorm?: number;
  sigmaMax?: number;
  sigmaMin?: number;
  conditionNumber?: number;
  localVolumeScale?: number;
  neighborhoodRecall?: number;
  trustworthiness?: number;
}

export function l2Normalize(vector: readonly number[], epsilon = NUMERIC_EPSILON): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  const denom = Math.max(norm, epsilon);
  return vector.map((value) => value / denom);
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error('Vector dimensions differ.');
  const na = l2Normalize(a);
  const nb = l2Normalize(b);
  return na.reduce((sum, value, index) => sum + value * nb[index], 0);
}

export function angularAreaForUnitVectors(a: readonly number[], b: readonly number[]): number {
  const cosine = Math.max(-1, Math.min(1, cosineSimilarity(a, b)));
  return Math.sqrt(Math.max(0, 1 - cosine * cosine));
}
