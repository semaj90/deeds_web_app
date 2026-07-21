/**
 * App-side retrieval executor tree.
 *
 * This is the explicit wiring surface that binds the canonical retrieval
 * rerank/extraction/tracing executors into one typed tree for the control
 * plane. It keeps imports lazy so the tree can be smoke-tested without
 * forcing backend services or environment-specific aliases to resolve at
 * module load time.
 */

export const APP_SIDE_CAR_EXECUTOR_TREE = {
  crossEncoder: {
    module: './cross-encoder-reranker.js',
    exportName: 'rerankWithCrossEncoder',
  },
  langExtract: {
    module: './langextract-reranker.js',
    exportName: 'rerankWithLangExtractGRPO',
  },
  trace: {
    module: '../ai/trace-reranker.js',
    exportName: 'traceRerank',
  },
} as const;

type CrossEncoderModule = typeof import('./cross-encoder-reranker.js');
type LangExtractModule = typeof import('./langextract-reranker.js');
type TraceModule = typeof import('../ai/trace-reranker.js');

export function getAppSideCarExecutorTreeStatus() {
  return {
    crossEncoder: {
      present: true,
      module: APP_SIDE_CAR_EXECUTOR_TREE.crossEncoder.module,
      exportName: APP_SIDE_CAR_EXECUTOR_TREE.crossEncoder.exportName,
    },
    langExtract: {
      present: true,
      module: APP_SIDE_CAR_EXECUTOR_TREE.langExtract.module,
      exportName: APP_SIDE_CAR_EXECUTOR_TREE.langExtract.exportName,
    },
    trace: {
      present: true,
      module: APP_SIDE_CAR_EXECUTOR_TREE.trace.module,
      exportName: APP_SIDE_CAR_EXECUTOR_TREE.trace.exportName,
    },
  } as const;
}

export async function loadCrossEncoderReranker() {
  return import('./cross-encoder-reranker.js');
}

export async function loadLangExtractReranker() {
  return import('./langextract-reranker.js');
}

export async function loadTraceReranker() {
  return import('../ai/trace-reranker.js');
}

export async function getRerankStatus() {
  const mod = await loadCrossEncoderReranker();
  return mod.getRerankStatus();
}

export async function rerankWithCrossEncoder(...args: Parameters<CrossEncoderModule['rerankWithCrossEncoder']>) {
  const mod = await loadCrossEncoderReranker();
  return mod.rerankWithCrossEncoder(...args);
}

export async function rerankToUnified(...args: Parameters<CrossEncoderModule['rerankToUnified']>) {
  const mod = await loadCrossEncoderReranker();
  return mod.rerankToUnified(...args);
}

export async function rerankWithLangExtractGRPO(...args: Parameters<LangExtractModule['rerankWithLangExtractGRPO']>) {
  const mod = await loadLangExtractReranker();
  return mod.rerankWithLangExtractGRPO(...args);
}

export async function rerankChunksGRPO(...args: Parameters<LangExtractModule['rerankChunksGRPO']>) {
  const mod = await loadLangExtractReranker();
  return mod.rerankChunksGRPO(...args);
}

export async function traceRerank(...args: Parameters<TraceModule['traceRerank']>) {
  const mod = await loadTraceReranker();
  return mod.traceRerank(...args);
}
