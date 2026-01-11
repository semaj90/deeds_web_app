import { createAstVectorizer } from './astVectorizer';

let gpuVectorizer: ReturnType<typeof createAstVectorizer> | null = null;

function ensureGpuVectorizer() {
  if (gpuVectorizer) return gpuVectorizer;

  const modelPath = 'models/phase72/bert_error_encoder.pt';
  gpuVectorizer = createAstVectorizer(modelPath);

  return gpuVectorizer;
}

export function vectorizeErrorsGPU(errors: string[]): number[][] {
  const v = ensureGpuVectorizer();
  return v.generateBatch(errors);
}

export function vectorizeErrorGPU(error: string): number[] {
  const v = ensureGpuVectorizer();
  return v.generateEmbedding(error);
}

export function getErrorCountGPU(): number {
  const v = ensureGpuVectorizer();
  return v.getErrorCount();
}
