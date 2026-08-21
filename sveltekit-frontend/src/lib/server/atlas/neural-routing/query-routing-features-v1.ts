import { z } from 'zod';
import { createHash } from 'node:crypto';

/**
 * Deterministic query features for a future probabilistic router.
 *
 * This is not a classifier and does not mutate retrieval policy. It preserves
 * an ordered, revisioned input contract for a future XGBoost multi:softprob
 * model and keeps EmbeddingGemma classification embeddings optional.
 */
export const QUERY_ROUTING_FEATURE_ORDER_V1 = [
  'query_length_norm',
  'token_count_norm',
  'identifier_count_norm',
  'path_signal',
  'file_extension_signal',
  'programming_language_signal',
  'error_signal',
  'question_signal',
  'mutation_signal',
  'exact_symbol_signal',
  'retrieval_signal',
  'graph_signal',
  'database_signal',
  'api_signal',
  'test_signal',
  'debug_signal',
  'compare_signal',
  'synthesize_signal',
] as const;

export const QueryRoutingFeatureVectorV1Schema = z.object({
  schemaVersion: z.literal('atlas.query-routing-features.v1'),
  featureRevision: z.string().min(1),
  featureOrder: z.array(z.string()).length(QUERY_ROUTING_FEATURE_ORDER_V1.length),
  values: z.array(z.number().finite()).length(QUERY_ROUTING_FEATURE_ORDER_V1.length),
  sourceQueryDigest: z.string().regex(/^[a-f0-9]{64}$/),
  embeddingRepresentationId: z.literal('classification_mrl_128').nullable(),
  status: z.literal('FEATURES_ONLY'),
}).strict();

export type QueryRoutingFeatureVectorV1 = z.infer<typeof QueryRoutingFeatureVectorV1Schema>;

const signal = (query: string, pattern: RegExp): number => pattern.test(query) ? 1 : 0;

function digest(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function compileQueryRoutingFeatures(
  query: string,
  featureRevision = 'atlas.query-routing-features.v1',
): QueryRoutingFeatureVectorV1 {
  const normalized = query.trim().toLowerCase();
  if (!normalized) throw new Error('QUERY_ROUTING_EMPTY_QUERY');
  const tokens = normalized.split(/\s+/u);
  const values = [
    Math.min(normalized.length / 256, 1),
    Math.min(tokens.length / 64, 1),
    Math.min((normalized.match(/[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*/giu) ?? []).length / 16, 1),
    signal(normalized, /[/\\]|file|path|module|source/u),
    signal(normalized, /\.(?:ts|tsx|js|py|sql|svelte|json)\b/u),
    signal(normalized, /typescript|javascript|python|sql|rust|go\b/u),
    signal(normalized, /error|exception|stack|fail|failure|bug|crash/u),
    signal(normalized, /\?|why|what|where|how|which|explain/u),
    signal(normalized, /fix|change|update|write|delete|migrate|patch/u),
    signal(normalized, /["'`]?[a-z_$][\w$]*\s*(?:\(|::|->)|symbol|function|method/u),
    signal(normalized, /search|find|retrieve|candidate|qdrant|embedding/u),
    signal(normalized, /graph|neo4j|pagerank|topology|edge|relationship|hop/u),
    signal(normalized, /postgres|postgresql|drizzle|sql|database|table|query/u),
    signal(normalized, /api|endpoint|route|http|request|response|handler/u),
    signal(normalized, /test|spec|vitest|playwright|assert/u),
    signal(normalized, /debug|diagnose|trace|broken|issue|warning/u),
    signal(normalized, /compare|difference|parity|versus|vs\b/u),
    signal(normalized, /summarize|synthesize|context|recommend|plan/u),
  ];

  return QueryRoutingFeatureVectorV1Schema.parse({
    schemaVersion: 'atlas.query-routing-features.v1',
    featureRevision,
    featureOrder: [...QUERY_ROUTING_FEATURE_ORDER_V1],
    values,
    sourceQueryDigest: digest(normalized),
    embeddingRepresentationId: null,
    status: 'FEATURES_ONLY',
  });
}
