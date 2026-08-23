import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * NLP-1: deterministic, dependency-free query-shape/POS-like features.
 *
 * These are intentionally lexical heuristics, not canonical linguistic truth.
 * They provide cheap, stable numeric signals beside EmbeddingGemma's learned
 * classification representation. A future spaCy/Stanza/compromise adapter may
 * enrich the row, but changing a tagger must not change the base feature order.
 */

export const QUERY_FEATURE_CONTRACT_REVISION = 'atlas.query-feature-projection.v1' as const;

const QueryFeatureSchema = z.number().finite();

export const QueryFeatureProjectionV1Schema = z.object({
  schema: z.literal('atlas.query-feature-projection.v1'),
  revision: z.literal(QUERY_FEATURE_CONTRACT_REVISION),
  queryDigest: z.string().length(64),

  tokenCount: QueryFeatureSchema,
  charCount: QueryFeatureSchema,
  identifierCount: QueryFeatureSchema,
  quotedSpanCount: QueryFeatureSchema,
  pathLikeCount: QueryFeatureSchema,
  extensionCount: QueryFeatureSchema,
  camelCaseCount: QueryFeatureSchema,
  snakeCaseCount: QueryFeatureSchema,
  screamingSnakeCount: QueryFeatureSchema,
  numericTokenCount: QueryFeatureSchema,

  nounLikeDensity: QueryFeatureSchema,
  verbLikeDensity: QueryFeatureSchema,
  questionWordDensity: QueryFeatureSchema,
  mutationVerbDensity: QueryFeatureSchema,
  debugTermDensity: QueryFeatureSchema,
  comparisonTermDensity: QueryFeatureSchema,
  graphTermDensity: QueryFeatureSchema,
  databaseTermDensity: QueryFeatureSchema,
  retrievalTermDensity: QueryFeatureSchema,
  apiTermDensity: QueryFeatureSchema,
  testTermDensity: QueryFeatureSchema,

  hasStackTraceShape: QueryFeatureSchema,
  hasCodeFence: QueryFeatureSchema,
  hasFunctionCallShape: QueryFeatureSchema,
  hasSqlShape: QueryFeatureSchema,
  hasUrl: QueryFeatureSchema,

  producer: z.literal('deterministic-query-shape-v1'),
  evidenceAuthority: z.literal(false),
}).strict();

export type QueryFeatureProjectionV1 = z.infer<typeof QueryFeatureProjectionV1Schema>;

export const QUERY_FEATURE_ORDER_V1 = [
  'tokenCount',
  'charCount',
  'identifierCount',
  'quotedSpanCount',
  'pathLikeCount',
  'extensionCount',
  'camelCaseCount',
  'snakeCaseCount',
  'screamingSnakeCount',
  'numericTokenCount',
  'nounLikeDensity',
  'verbLikeDensity',
  'questionWordDensity',
  'mutationVerbDensity',
  'debugTermDensity',
  'comparisonTermDensity',
  'graphTermDensity',
  'databaseTermDensity',
  'retrievalTermDensity',
  'apiTermDensity',
  'testTermDensity',
  'hasStackTraceShape',
  'hasCodeFence',
  'hasFunctionCallShape',
  'hasSqlShape',
  'hasUrl',
] as const satisfies readonly (keyof QueryFeatureProjectionV1)[];

const WORD = /[A-Za-z_][A-Za-z0-9_.$:/\\-]*|\d+(?:\.\d+)?/g;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
const PATH_LIKE = /(?:[A-Za-z]:\\|\.\.?\/|\/)[^\s'"`]+/g;
const EXTENSION = /\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs|py|rs|go|java|json|sql|md|svelte|proto|yaml|yml)\b/gi;
const CAMEL = /^[a-z]+(?:[A-Z][A-Za-z0-9]*)+$/;
const SNAKE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
const SCREAMING = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

const VERBS = new Set([
  'add','build','call','change','check','compare','compile','create','debug','delete','explain','find','fix','generate',
  'get','implement','index','load','map','modify','move','parse','prove','query','read','remove','replace','rerank','retrieve',
  'route','run','search','select','store','trace','train','update','upsert','use','validate','verify','write',
]);
const MUTATION = new Set(['add','change','create','delete','fix','implement','modify','move','patch','remove','replace','update','upsert','write']);
const DEBUG = new Set(['bug','crash','debug','error','exception','fail','failed','failure','fix','incorrect','issue','regression','stack','trace']);
const COMPARE = new Set(['compare','comparison','difference','different','versus','vs','better','best','benchmark','parity']);
const GRAPH = new Set(['graph','edge','edges','node','nodes','pagerank','ppr','community','hop','hops','caller','callee','dependency','dependencies','topology']);
const DATABASE = new Set(['database','postgres','postgresql','sql','drizzle','table','row','rows','transaction','query','index','bitmap','gin','btree']);
const RETRIEVAL = new Set(['retrieve','retrieval','search','qdrant','embedding','vector','hnsw','cagra','diskann','vamana','bm25','splade','minicoil','rerank']);
const API = new Set(['api','endpoint','route','grpc','mcp','a2a','acp','schema','protobuf','openapi','request','response','tool']);
const TEST = new Set(['test','tests','spec','vitest','pytest','fixture','assert','assertion','coverage','smoke','proof']);
const QUESTION = new Set(['what','where','when','why','who','which','how']);

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function density(tokens: readonly string[], vocabulary: ReadonlySet<string>): number {
  if (tokens.length === 0) return 0;
  let hits = 0;
  for (const token of tokens) if (vocabulary.has(token.toLowerCase())) hits += 1;
  return hits / tokens.length;
}

function bool(value: boolean): number {
  return value ? 1 : 0;
}

export function projectQueryFeaturesV1(query: string): QueryFeatureProjectionV1 {
  const normalized = query.trim();
  if (!normalized) throw new Error('QUERY_FEATURE_QUERY_REQUIRED');

  const tokens = normalized.match(WORD) ?? [];
  const lowerTokens = tokens.map((token) => token.toLowerCase());
  const wordish = tokens.filter((token) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(token));
  const nonVerbWordCount = wordish.filter((token) => !VERBS.has(token.toLowerCase())).length;

  return QueryFeatureProjectionV1Schema.parse({
    schema: 'atlas.query-feature-projection.v1',
    revision: QUERY_FEATURE_CONTRACT_REVISION,
    queryDigest: sha256(normalized),

    tokenCount: tokens.length,
    charCount: normalized.length,
    identifierCount: tokens.filter((token) => IDENTIFIER.test(String(token)) && (String(token).includes('.') || /[A-Z_$]/.test(String(token)) || String(token).includes('_'))).length,
    quotedSpanCount: (normalized.match(/(['"`])(?:(?!\1).)*\1/g) ?? []).length,
    pathLikeCount: (normalized.match(PATH_LIKE) ?? []).length,
    extensionCount: (normalized.match(EXTENSION) ?? []).length,
    camelCaseCount: tokens.filter((token) => CAMEL.test(token)).length,
    snakeCaseCount: tokens.filter((token) => SNAKE.test(token)).length,
    screamingSnakeCount: tokens.filter((token) => SCREAMING.test(token)).length,
    numericTokenCount: tokens.filter((token) => /^\d+(?:\.\d+)?$/.test(token)).length,

    nounLikeDensity: wordish.length > 0 ? nonVerbWordCount / wordish.length : 0,
    verbLikeDensity: density(lowerTokens, VERBS),
    questionWordDensity: density(lowerTokens, QUESTION),
    mutationVerbDensity: density(lowerTokens, MUTATION),
    debugTermDensity: density(lowerTokens, DEBUG),
    comparisonTermDensity: density(lowerTokens, COMPARE),
    graphTermDensity: density(lowerTokens, GRAPH),
    databaseTermDensity: density(lowerTokens, DATABASE),
    retrievalTermDensity: density(lowerTokens, RETRIEVAL),
    apiTermDensity: density(lowerTokens, API),
    testTermDensity: density(lowerTokens, TEST),

    hasStackTraceShape: bool(/\bat\s+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\s*\([^\n]+:\d+(?::\d+)?\)/.test(normalized)),
    hasCodeFence: bool(normalized.includes('```')),
    hasFunctionCallShape: bool(/\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(/.test(normalized)),
    hasSqlShape: bool(/\b(?:select|insert\s+into|update|delete\s+from|create\s+table|alter\s+table)\b/i.test(normalized)),
    hasUrl: bool(/https?:\/\//i.test(normalized)),

    producer: 'deterministic-query-shape-v1',
    evidenceAuthority: false,
  });
}

export function flattenQueryFeaturesV1(row: QueryFeatureProjectionV1): Float32Array {
  return Float32Array.from(QUERY_FEATURE_ORDER_V1.map((name) => Number(row[name])));
}
