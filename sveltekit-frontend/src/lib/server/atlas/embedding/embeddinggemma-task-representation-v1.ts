import { createHash } from 'node:crypto';

export const EMBEDDINGGEMMA_MODEL_ID = 'google/embeddinggemma-300m' as const;
export const EMBEDDINGGEMMA_NATIVE_DIMENSION = 768 as const;
export const EMBEDDINGGEMMA_MRL_DIMENSIONS = [128, 256, 512, 768] as const;
export type EmbeddingGemmaMrlDimension = (typeof EMBEDDINGGEMMA_MRL_DIMENSIONS)[number];

export type EmbeddingGemmaTaskModeV1 =
  | 'retrieval_query'
  | 'retrieval_document'
  | 'code_retrieval_query'
  | 'classification'
  | 'clustering'
  | 'sentence_similarity'
  | 'summarization';

export const EMBEDDINGGEMMA_PROMPT_REVISION_V1 = 'embeddinggemma.task-prompts.google-v1' as const;

export const EMBEDDINGGEMMA_TASK_PREFIX_V1: Readonly<Record<EmbeddingGemmaTaskModeV1, string>> = {
  retrieval_query: 'task: search result | query: ',
  retrieval_document: 'title: none | text: ',
  code_retrieval_query: 'task: code retrieval | query: ',
  classification: 'task: classification | query: ',
  clustering: 'task: clustering | query: ',
  sentence_similarity: 'task: sentence similarity | query: ',
  summarization: 'task: summarization | query: ',
};

export interface EmbeddingGemmaFormattedInputV1 {
  schema: 'atlas.embeddinggemma-formatted-input.v1';
  mode: EmbeddingGemmaTaskModeV1;
  promptRevision: typeof EMBEDDINGGEMMA_PROMPT_REVISION_V1;
  formattedText: string;
  sourceTextDigest: string;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function formatEmbeddingGemmaInputV1(input: {
  mode: EmbeddingGemmaTaskModeV1;
  text: string;
  title?: string | null;
}): EmbeddingGemmaFormattedInputV1 {
  const text = input.text.trim();
  if (!text) throw new Error('EMBEDDINGGEMMA_SOURCE_TEXT_REQUIRED');

  let formattedText: string;
  if (input.mode === 'retrieval_document') {
    const title = input.title?.trim() || 'none';
    formattedText = `title: ${title} | text: ${text}`;
  } else {
    formattedText = `${EMBEDDINGGEMMA_TASK_PREFIX_V1[input.mode]}${text}`;
  }

  return {
    schema: 'atlas.embeddinggemma-formatted-input.v1',
    mode: input.mode,
    promptRevision: EMBEDDINGGEMMA_PROMPT_REVISION_V1,
    formattedText,
    sourceTextDigest: sha256(text),
  };
}

export function encodeRetrievalQuery(text: string): EmbeddingGemmaFormattedInputV1 {
  return formatEmbeddingGemmaInputV1({ mode: 'retrieval_query', text });
}

export function encodeCodeRetrievalQuery(text: string): EmbeddingGemmaFormattedInputV1 {
  return formatEmbeddingGemmaInputV1({ mode: 'code_retrieval_query', text });
}

export function encodeRetrievalDocument(text: string, title?: string | null): EmbeddingGemmaFormattedInputV1 {
  return formatEmbeddingGemmaInputV1({ mode: 'retrieval_document', text, title });
}

export function encodeClassificationInput(text: string): EmbeddingGemmaFormattedInputV1 {
  return formatEmbeddingGemmaInputV1({ mode: 'classification', text });
}

export function assertEmbeddingGemmaNative768(vector: readonly number[] | Float32Array): void {
  if (vector.length !== EMBEDDINGGEMMA_NATIVE_DIMENSION) {
    throw new Error(`EMBEDDINGGEMMA_NATIVE_DIMENSION_MISMATCH expected=768 got=${vector.length}`);
  }
  for (let index = 0; index < vector.length; index += 1) {
    if (!Number.isFinite(vector[index])) throw new Error(`EMBEDDINGGEMMA_NONFINITE_VALUE index=${index}`);
  }
}

export function projectEmbeddingGemmaMrlV1(
  native768: readonly number[] | Float32Array,
  dimension: EmbeddingGemmaMrlDimension,
): Float32Array {
  assertEmbeddingGemmaNative768(native768);
  const output = new Float32Array(dimension);
  let normSq = 0;
  for (let index = 0; index < dimension; index += 1) {
    const value = native768[index];
    output[index] = value;
    normSq += value * value;
  }
  const norm = Math.sqrt(normSq);
  if (!Number.isFinite(norm) || norm <= 0) throw new Error('EMBEDDINGGEMMA_MRL_ZERO_OR_INVALID_NORM');
  for (let index = 0; index < output.length; index += 1) output[index] /= norm;
  return output;
}

export function embeddingGemmaTaskRepresentationIdV1(
  mode: EmbeddingGemmaTaskModeV1,
  dimension: EmbeddingGemmaMrlDimension,
): string {
  const family = mode === 'code_retrieval_query' ? 'code_query' : mode;
  return dimension === 768 ? `${family}_768` : `${family}_mrl_${dimension}`;
}

export interface EmbeddingGemmaTaskRepresentationLineageV1 {
  schema: 'atlas.embeddinggemma-task-representation-lineage.v1';
  modelId: typeof EMBEDDINGGEMMA_MODEL_ID;
  modelRevision: string;
  mode: EmbeddingGemmaTaskModeV1;
  promptRevision: typeof EMBEDDINGGEMMA_PROMPT_REVISION_V1;
  nativeDimension: typeof EMBEDDINGGEMMA_NATIVE_DIMENSION;
  outputDimension: EmbeddingGemmaMrlDimension;
  representationId: string;
  representationRevision: string;
  projectionMethod: 'native-l2' | 'mrl-prefix-l2-renorm';
  persistenceAuthority: 'SEPARATE_CONTRACT';
}

export function buildEmbeddingGemmaTaskRepresentationLineageV1(input: {
  mode: EmbeddingGemmaTaskModeV1;
  dimension: EmbeddingGemmaMrlDimension;
  modelRevision: string;
  representationRevision: string;
}): EmbeddingGemmaTaskRepresentationLineageV1 {
  if (!input.modelRevision.trim()) throw new Error('EMBEDDINGGEMMA_MODEL_REVISION_REQUIRED');
  if (!input.representationRevision.trim()) throw new Error('EMBEDDINGGEMMA_REPRESENTATION_REVISION_REQUIRED');
  return {
    schema: 'atlas.embeddinggemma-task-representation-lineage.v1',
    modelId: EMBEDDINGGEMMA_MODEL_ID,
    modelRevision: input.modelRevision,
    mode: input.mode,
    promptRevision: EMBEDDINGGEMMA_PROMPT_REVISION_V1,
    nativeDimension: EMBEDDINGGEMMA_NATIVE_DIMENSION,
    outputDimension: input.dimension,
    representationId: embeddingGemmaTaskRepresentationIdV1(input.mode, input.dimension),
    representationRevision: input.representationRevision,
    projectionMethod: input.dimension === 768 ? 'native-l2' : 'mrl-prefix-l2-renorm',
    persistenceAuthority: 'SEPARATE_CONTRACT',
  };
}

export function buildEmbeddingCacheIdentityV1(input: {
  modelRevision: string;
  artifactChecksum: string;
  executorRevision: string;
  mode: EmbeddingGemmaTaskModeV1;
  promptRevision?: string;
  sourceTextDigest: string;
  representationRevision: string;
  outputDimension: EmbeddingGemmaMrlDimension;
}): string {
  const fields = [
    input.modelRevision,
    input.artifactChecksum,
    input.executorRevision,
    input.mode,
    input.promptRevision ?? EMBEDDINGGEMMA_PROMPT_REVISION_V1,
    input.sourceTextDigest,
    input.representationRevision,
    String(input.outputDimension),
  ];
  if (fields.some((value) => !value.trim())) throw new Error('EMBEDDING_CACHE_IDENTITY_FIELD_REQUIRED');
  return `egcache:${sha256(fields.join('\u001f'))}`;
}
