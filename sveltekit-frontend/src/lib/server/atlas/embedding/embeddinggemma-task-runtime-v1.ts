import {
  assertEmbeddingGemmaNative768,
  buildEmbeddingGemmaTaskRepresentationLineageV1,
  formatEmbeddingGemmaInputV1,
  projectEmbeddingGemmaMrlV1,
  type EmbeddingGemmaMrlDimension,
  type EmbeddingGemmaTaskModeV1,
} from './embeddinggemma-task-representation-v1.js';

export interface EmbeddingGemmaNativeExecutorV1 {
  embedNative768(formattedText: string): Promise<{
    vector: Float32Array;
    executor: string;
    executorRevision: string;
    modelRevision: string;
    execMs: number;
  }>;
}

export interface EmbeddingGemmaTaskRuntimeResultV1 {
  schema: 'atlas.embeddinggemma-task-runtime-result.v1';
  mode: EmbeddingGemmaTaskModeV1;
  promptRevision: string;
  sourceTextDigest: string;
  native768: Float32Array;
  projected: Partial<Record<EmbeddingGemmaMrlDimension, Float32Array>>;
  lineage: ReturnType<typeof buildEmbeddingGemmaTaskRepresentationLineageV1>[];
  executor: string;
  executorRevision: string;
  modelRevision: string;
  execMs: number;
  persistencePerformed: false;
  canonicalDefaultChanged: false;
}

export async function embedEmbeddingGemmaTaskV1(input: {
  executor: EmbeddingGemmaNativeExecutorV1;
  mode: EmbeddingGemmaTaskModeV1;
  text: string;
  title?: string | null;
  dimensions?: readonly EmbeddingGemmaMrlDimension[];
  representationRevision: string;
}): Promise<EmbeddingGemmaTaskRuntimeResultV1> {
  const formatted = formatEmbeddingGemmaInputV1({ mode: input.mode, text: input.text, title: input.title });
  const native = await input.executor.embedNative768(formatted.formattedText);
  assertEmbeddingGemmaNative768(native.vector);

  const requested = [...new Set(input.dimensions ?? [768])];
  if (!requested.includes(768)) requested.push(768);
  const projected: Partial<Record<EmbeddingGemmaMrlDimension, Float32Array>> = {};
  const lineage = requested
    .sort((a, b) => b - a)
    .map((dimension) => {
      projected[dimension] = dimension === 768
        ? projectEmbeddingGemmaMrlV1(native.vector, 768)
        : projectEmbeddingGemmaMrlV1(native.vector, dimension);
      return buildEmbeddingGemmaTaskRepresentationLineageV1({
        mode: input.mode,
        dimension,
        modelRevision: native.modelRevision,
        representationRevision: input.representationRevision,
      });
    });

  return {
    schema: 'atlas.embeddinggemma-task-runtime-result.v1',
    mode: input.mode,
    promptRevision: formatted.promptRevision,
    sourceTextDigest: formatted.sourceTextDigest,
    native768: native.vector,
    projected,
    lineage,
    executor: native.executor,
    executorRevision: native.executorRevision,
    modelRevision: native.modelRevision,
    execMs: native.execMs,
    persistencePerformed: false,
    canonicalDefaultChanged: false,
  };
}
