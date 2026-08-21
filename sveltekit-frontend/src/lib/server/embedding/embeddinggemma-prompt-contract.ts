import { createHash } from 'node:crypto';

export const EMBEDDINGGEMMA_PROMPT_REVISION = 'embeddinggemma-prompt-v1' as const;
export const EMBEDDINGGEMMA_NATIVE_DIMENSION = 768 as const;
export const EMBEDDINGGEMMA_MAX_CONTEXT_TOKENS = 2048 as const;

export type EmbeddingGemmaInputMode =
  | 'RETRIEVAL_QUERY'
  | 'CODE_RETRIEVAL_QUERY'
  | 'RETRIEVAL_DOCUMENT'
  | 'CLASSIFICATION_QUERY';

export interface EmbeddingGemmaPromptedInputV1 {
  schema: 'atlas.embeddinggemma-prompted-input.v1';
  mode: EmbeddingGemmaInputMode;
  promptRevision: typeof EMBEDDINGGEMMA_PROMPT_REVISION;
  formattedText: string;
  sourceTextSha256: string;
  formattedTextSha256: string;
  nativeDimension: typeof EMBEDDINGGEMMA_NATIVE_DIMENSION;
  maxContextTokens: typeof EMBEDDINGGEMMA_MAX_CONTEXT_TOKENS;
  canonicalWritesAllowed: false;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function requireText(value: string, label: string): string {
  const text = value.trim();
  if (!text) throw new Error(`EMBEDDINGGEMMA_${label}_REQUIRED`);
  return text;
}

function receipt(mode: EmbeddingGemmaInputMode, sourceText: string, formattedText: string): EmbeddingGemmaPromptedInputV1 {
  return {
    schema: 'atlas.embeddinggemma-prompted-input.v1',
    mode,
    promptRevision: EMBEDDINGGEMMA_PROMPT_REVISION,
    formattedText,
    sourceTextSha256: sha256(sourceText),
    formattedTextSha256: sha256(formattedText),
    nativeDimension: EMBEDDINGGEMMA_NATIVE_DIMENSION,
    maxContextTokens: EMBEDDINGGEMMA_MAX_CONTEXT_TOKENS,
    canonicalWritesAllowed: false,
  };
}

export function encodeRetrievalQuery(text: string): EmbeddingGemmaPromptedInputV1 {
  const source = requireText(text, 'RETRIEVAL_QUERY');
  return receipt('RETRIEVAL_QUERY', source, `task: search result | query: ${source}`);
}

export function encodeCodeRetrievalQuery(text: string): EmbeddingGemmaPromptedInputV1 {
  const source = requireText(text, 'CODE_RETRIEVAL_QUERY');
  return receipt('CODE_RETRIEVAL_QUERY', source, `task: code retrieval | query: ${source}`);
}

export function encodeRetrievalDocument(text: string, title = 'none'): EmbeddingGemmaPromptedInputV1 {
  const source = requireText(text, 'RETRIEVAL_DOCUMENT');
  const normalizedTitle = title.trim() || 'none';
  return receipt('RETRIEVAL_DOCUMENT', source, `title: ${normalizedTitle} | text: ${source}`);
}

export function encodeClassificationQuery(text: string): EmbeddingGemmaPromptedInputV1 {
  const source = requireText(text, 'CLASSIFICATION_QUERY');
  return receipt('CLASSIFICATION_QUERY', source, `task: classification | query: ${source}`);
}

export interface EmbeddingGemmaCacheIdentityV1 {
  schema: 'atlas.embeddinggemma-cache-identity.v1';
  modelRevision: string;
  artifactChecksum: string;
  executorRevision: string;
  inputMode: EmbeddingGemmaInputMode;
  promptRevision: typeof EMBEDDINGGEMMA_PROMPT_REVISION;
  sourceTextSha256: string;
  representationRevision: string;
  cacheKeySha256: string;
}

export function buildEmbeddingGemmaCacheIdentity(input: {
  modelRevision: string;
  artifactChecksum: string;
  executorRevision: string;
  promptedInput: EmbeddingGemmaPromptedInputV1;
  representationRevision: string;
}): EmbeddingGemmaCacheIdentityV1 {
  const modelRevision = requireText(input.modelRevision, 'MODEL_REVISION');
  const artifactChecksum = requireText(input.artifactChecksum, 'ARTIFACT_CHECKSUM').toLowerCase();
  const executorRevision = requireText(input.executorRevision, 'EXECUTOR_REVISION');
  const representationRevision = requireText(input.representationRevision, 'REPRESENTATION_REVISION');
  if (!/^[a-f0-9]{64}$/.test(artifactChecksum)) throw new Error('EMBEDDINGGEMMA_ARTIFACT_CHECKSUM_INVALID');
  const canonical = [
    modelRevision,
    artifactChecksum,
    executorRevision,
    input.promptedInput.mode,
    input.promptedInput.promptRevision,
    input.promptedInput.sourceTextSha256,
    representationRevision,
  ].join('\0');
  return {
    schema: 'atlas.embeddinggemma-cache-identity.v1',
    modelRevision,
    artifactChecksum,
    executorRevision,
    inputMode: input.promptedInput.mode,
    promptRevision: input.promptedInput.promptRevision,
    sourceTextSha256: input.promptedInput.sourceTextSha256,
    representationRevision,
    cacheKeySha256: sha256(canonical),
  };
}
