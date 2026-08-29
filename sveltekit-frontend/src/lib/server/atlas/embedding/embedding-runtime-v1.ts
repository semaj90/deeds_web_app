import { createHash } from 'node:crypto';
import type { EmbeddingContextPlanV1 } from './embedding-context-plan-v1.js';

export type AtlasEmbeddingExecutorIdV1 =
  | 'OLLAMA'
  | 'ONNX_DIRECTML'
  | 'ONNX_WEBGPU'
  | 'FASTEMBED_CUDA'
  | 'PYTORCH_CUDA';

export type AtlasEmbeddingRuntimeResultV1 = {
  executorId: AtlasEmbeddingExecutorIdV1;
  representationId: 'semantic_768';
  representationRevision: string;
  modelRevision: string;
  tokenizerRevision: string;
  promptRevision: string;
  dimension: 768;
  normalized: true;
  vector: Float32Array;
  outputChecksum: string;
};

export interface AtlasEmbeddingRuntimeV1 {
  readonly executorId: AtlasEmbeddingExecutorIdV1;
  embed(plan: EmbeddingContextPlanV1): Promise<AtlasEmbeddingRuntimeResultV1>;
}

export function validateSemantic768OutputV1(value: readonly number[] | Float32Array): Float32Array {
  if (value.length !== 768 || value.some((item) => !Number.isFinite(item))) {
    throw new Error('SEMANTIC_768_OUTPUT_INVALID');
  }
  const vector = Float32Array.from(value);
  let normSquared = 0;
  for (const item of vector) normSquared += item * item;
  const norm = Math.sqrt(normSquared);
  if (!Number.isFinite(norm) || norm <= 0 || Math.abs(norm - 1) > 1e-3) {
    throw new Error('SEMANTIC_768_OUTPUT_NOT_L2_NORMALIZED');
  }
  return vector;
}

export function digestSemantic768OutputV1(vector: Float32Array): string {
  return `sha256:${createHash('sha256').update(Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)).digest('hex')}`;
}

