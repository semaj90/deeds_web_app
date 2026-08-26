import { performance } from 'node:perf_hooks';

export type AtlasEmbeddingRoleV1 = 'QUERY' | 'DOCUMENT';
export type AtlasDocumentEmbeddingExecutorIdV1 = 'OLLAMA' | 'LLAMA_CPP_CUDA';

export type AtlasSemanticDocumentV1 = {
  packetKey: string;
  sourceRef: string;
  sourceRevision: string | null;
  contentHash: string | null;
  documentKind: string;
  title: string;
  documentText: string;
  embeddingRole: AtlasEmbeddingRoleV1;
};

export type EmbeddingBatchPolicyV1 = {
  maxDocuments: number;
  maxTokens: number;
  maxBytes: number;
};

export type AtlasEmbeddingBatchReceiptV1 = {
  executorId: AtlasDocumentEmbeddingExecutorIdV1;
  representationId: 'semantic_768';
  representationRevision: string;
  modelRevision: string;
  role: AtlasEmbeddingRoleV1;
  documentCount: number;
  dimension: 768;
  normalization: 'L2';
  elapsedMs: number;
  outputChecksum: string;
};

export type AtlasDocumentEmbeddingBatchResultV1 = {
  vectors: Float32Array[];
  receipt: AtlasEmbeddingBatchReceiptV1;
};

export interface AtlasDocumentEmbeddingExecutorV1 {
  readonly executorId: AtlasDocumentEmbeddingExecutorIdV1;
  readonly representationId: 'semantic_768';
  embedDocuments(
    documents: readonly AtlasSemanticDocumentV1[],
    policy: EmbeddingBatchPolicyV1,
  ): Promise<AtlasDocumentEmbeddingBatchResultV1>;
}

type FetchLike = typeof fetch;

function assertPolicy(policy: EmbeddingBatchPolicyV1): void {
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`INVALID_EMBEDDING_BATCH_POLICY:${name}`);
  }
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(Buffer.byteLength(text, 'utf8') / 4));
}

function formatDocument(document: AtlasSemanticDocumentV1): string {
  return `${document.title}\n${document.documentText}`;
}

function assertDocumentBatch(documents: readonly AtlasSemanticDocumentV1[], policy: EmbeddingBatchPolicyV1): void {
  assertPolicy(policy);
  if (documents.length === 0) throw new Error('EMPTY_EMBEDDING_DOCUMENT_BATCH');
  if (documents.length > policy.maxDocuments) throw new Error('EMBEDDING_BATCH_DOCUMENT_LIMIT_EXCEEDED');
  const texts = documents.map(formatDocument);
  const tokens = texts.reduce((sum, text) => sum + estimateTokens(text), 0);
  const bytes = texts.reduce((sum, text) => sum + Buffer.byteLength(text, 'utf8'), 0);
  if (tokens > policy.maxTokens) throw new Error('EMBEDDING_BATCH_TOKEN_LIMIT_EXCEEDED');
  if (bytes > policy.maxBytes) throw new Error('EMBEDDING_BATCH_BYTE_LIMIT_EXCEEDED');
  const role = documents[0]!.embeddingRole;
  if (documents.some((document) => document.embeddingRole !== role)) {
    throw new Error('EMBEDDING_BATCH_ROLE_MIXED');
  }
}

function validateVector(value: unknown): Float32Array {
  if (!Array.isArray(value) || value.length !== 768 || value.some((item) => !Number.isFinite(item))) {
    throw new Error('EMBEDDING_VECTOR_NOT_SEMANTIC_768');
  }
  const vector = Float32Array.from(value as number[]);
  const norm = Math.hypot(...vector);
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-3) throw new Error('EMBEDDING_VECTOR_NOT_L2_NORMALIZED');
  return vector;
}

function checksum(vectors: readonly Float32Array[]): string {
  let hash = 2166136261;
  for (const vector of vectors) {
    for (const value of vector) {
      const bytes = new Uint8Array(new Float32Array([value]).buffer);
      for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createHttpDocumentEmbeddingExecutorV1(input: {
  executorId: AtlasDocumentEmbeddingExecutorIdV1;
  endpoint: string;
  model: string;
  modelRevision: string;
  representationRevision: string;
  fetchImpl?: FetchLike;
}): AtlasDocumentEmbeddingExecutorV1 {
  const fetchImpl = input.fetchImpl ?? fetch;
  const endpoint = input.endpoint.replace(/\/+$/, '');
  return {
    executorId: input.executorId,
    representationId: 'semantic_768',
    async embedDocuments(documents, policy) {
      assertDocumentBatch(documents, policy);
      const role = documents[0]!.embeddingRole;
      const started = performance.now();
      const response = await fetchImpl(
        input.executorId === 'LLAMA_CPP_CUDA' ? `${endpoint}/v1/embeddings` : `${endpoint}/api/embed`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input.executorId === 'LLAMA_CPP_CUDA'
            ? { model: input.model, input: documents.map(formatDocument) }
            : { model: input.model, input: documents.map(formatDocument) }),
        },
      );
      if (!response.ok) throw new Error(`EMBEDDING_EXECUTOR_HTTP_${response.status}`);
      const payload = await response.json() as { data?: Array<{ embedding?: unknown }>; embeddings?: unknown[] };
      const raw = Array.isArray(payload.data)
        ? payload.data.map((item) => item.embedding)
        : payload.embeddings;
      if (!Array.isArray(raw) || raw.length !== documents.length) throw new Error('EMBEDDING_VECTOR_COUNT_MISMATCH');
      const vectors = raw.map(validateVector);
      return {
        vectors,
        receipt: {
          executorId: input.executorId,
          representationId: 'semantic_768',
          representationRevision: input.representationRevision,
          modelRevision: input.modelRevision,
          role,
          documentCount: documents.length,
          dimension: 768,
          normalization: 'L2',
          elapsedMs: Math.round(performance.now() - started),
          outputChecksum: checksum(vectors),
        },
      };
    },
  };
}
