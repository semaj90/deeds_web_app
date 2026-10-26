import { embedSemantic768Canonical } from '$lib/server/embedding/canonical-embed.js';

export type AtlasSearchEmbeddingConfig = {
  strict: boolean;
  model: string;
  modelArtifactRevision?: string;
  tokenizerRevision?: string;
  inputPolicyRevision?: string;
  baseUrl?: string;
};

export async function embedAtlasSearchQuery(
  query: string,
  config: AtlasSearchEmbeddingConfig,
  embed: typeof embedSemantic768Canonical = embedSemantic768Canonical,
): Promise<number[] | null> {
  if (!config.strict) return null;
  if (!config.modelArtifactRevision || !config.tokenizerRevision || !config.inputPolicyRevision) {
    throw new Error('SEMANTIC_768_STRICT_LINEAGE_CONFIGURATION_REQUIRED');
  }

  const result = await embed(query, {
    model: config.model,
    modelArtifactRevision: config.modelArtifactRevision,
    tokenizerRevision: config.tokenizerRevision,
    inputPolicyRevision: config.inputPolicyRevision,
    baseUrl: config.baseUrl,
    timeoutMs: 20_000,
  });
  return result.embedding;
}
