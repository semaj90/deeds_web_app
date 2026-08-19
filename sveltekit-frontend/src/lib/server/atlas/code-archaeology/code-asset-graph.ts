import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Non-destructive source-code archaeology graph used by deeds_lab/.
 *
 * This is an extraction/indexing representation only. It never becomes the
 * canonical source-code owner, never authorizes a mutation, and never changes
 * retrieval lane vote counts. Its purpose is to make existing implementation
 * owners/functions/schemas reusable when Parent Atlas proposes new files or
 * repairs an existing one.
 */

export const CodeAssetKindSchema = z.enum([
  'FILE',
  'FUNCTION',
  'METHOD',
  'CLASS',
  'INTERFACE',
  'TYPE_ALIAS',
  'ENUM',
  'VARIABLE',
  'ZOD_SCHEMA',
  'API_ENDPOINT',
  'SIDECAR',
  'SCRIPT',
  'PROTO',
  'OPEN_SPEC',
  'DOCUMENT',
  'EXTERNAL_MODULE',
]);
export type CodeAssetKind = z.infer<typeof CodeAssetKindSchema>;

export const CodeAssetDomainSchema = z.enum([
  'INDEXING',
  'RETRIEVAL',
  'RANKING',
  'SCHEMA',
  'AST',
  'GRAPH',
  'HYPERGRAPH',
  'SEMANTIC',
  'ACE',
  'RLM',
  'CACHE',
  'BITFROST',
  'TURBOVEC',
  'DISKANN',
  'CUVS',
  'CUGRAPH',
  'CUDA',
  'SIDECAR',
  'DAG',
  'MCP',
  'AGENTIC_REPAIR',
  'VALIDATION',
  'TRANSPORT',
  'DATABASE',
  'OTHER',
]);
export type CodeAssetDomain = z.infer<typeof CodeAssetDomainSchema>;

export const CodeAssetRelationSchema = z.enum([
  'CONTAINS',
  'IMPORTS',
  'EXPORTS',
  'CALLS_CANDIDATE',
  'REFERENCES_CANDIDATE',
  'EXTENDS',
  'IMPLEMENTS',
  'VALIDATES_WITH',
  'USES_SCHEMA',
  'USES_CACHE',
  'USES_SIDECAR',
  'RELATED_DOMAIN',
]);
export type CodeAssetRelation = z.infer<typeof CodeAssetRelationSchema>;

export const SourceSpanV1Schema = z.object({
  startLine: z.number().int().positive(),
  startColumn: z.number().int().nonnegative(),
  endLine: z.number().int().positive(),
  endColumn: z.number().int().nonnegative(),
}).strict();

export const CodeAssetNodeV1Schema = z.object({
  schema: z.literal('atlas.code-asset-node.v1'),
  assetId: z.string().regex(/^[a-f0-9]{64}$/),
  kind: CodeAssetKindSchema,
  name: z.string().min(1),
  qualifiedName: z.string().min(1),
  sourceRef: z.string().min(1),
  language: z.string().min(1),
  span: SourceSpanV1Schema.nullable(),
  domains: z.array(CodeAssetDomainSchema).min(1),
  exported: z.boolean(),
  async: z.boolean(),
  signature: z.string(),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  tags: z.array(z.string().min(1)),
  reusableForNewFileCreation: z.boolean(),
  repairEvidenceCandidate: z.boolean(),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type CodeAssetNodeV1 = z.infer<typeof CodeAssetNodeV1Schema>;

export const CodeAssetEdgeV1Schema = z.object({
  schema: z.literal('atlas.code-asset-edge.v1'),
  edgeId: z.string().regex(/^[a-f0-9]{64}$/),
  fromAssetId: z.string().regex(/^[a-f0-9]{64}$/),
  toAssetId: z.string().regex(/^[a-f0-9]{64}$/),
  relation: CodeAssetRelationSchema,
  sourceRef: z.string().min(1),
  confidence: z.number().finite().min(0).max(1),
  exact: z.boolean(),
  evidence: z.string(),
  sourceRevision: z.string().min(1),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type CodeAssetEdgeV1 = z.infer<typeof CodeAssetEdgeV1Schema>;

export const CodeAssetGraphV1Schema = z.object({
  schema: z.literal('atlas.code-asset-graph.v1'),
  graphId: z.string().regex(/^[a-f0-9]{64}$/),
  workspaceRevision: z.string().min(1),
  extractionRevision: z.string().min(1),
  generatedAt: z.string().datetime(),
  sourceRoots: z.array(z.string().min(1)).min(1),
  nodes: z.array(CodeAssetNodeV1Schema),
  edges: z.array(CodeAssetEdgeV1Schema),
  statistics: z.object({
    files: z.number().int().nonnegative(),
    symbols: z.number().int().nonnegative(),
    schemas: z.number().int().nonnegative(),
    sidecars: z.number().int().nonnegative(),
    edges: z.number().int().nonnegative(),
  }).strict(),
  invariants: z.object({
    sourceRefRequired: z.literal(true),
    originalsPreserved: z.literal(true),
    noMoves: z.literal(true),
    noDeletes: z.literal(true),
    canonicalWritesAllowed: z.literal(false),
    executorMultiplicityAddsVotes: z.literal(false),
  }).strict(),
  producerRevision: z.string().min(1),
}).strict();
export type CodeAssetGraphV1 = z.infer<typeof CodeAssetGraphV1Schema>;

function sha256(parts: readonly string[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(part, 'utf8');
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function normalizeCodeAssetSourceRef(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

export function codeAssetId(input: {
  sourceRef: string;
  kind: CodeAssetKind;
  qualifiedName: string;
}): string {
  return sha256([
    normalizeCodeAssetSourceRef(input.sourceRef).toLowerCase(),
    input.kind,
    input.qualifiedName,
  ]);
}

export function codeAssetEdgeId(input: {
  fromAssetId: string;
  relation: CodeAssetRelation;
  toAssetId: string;
  sourceRevision: string;
}): string {
  return sha256([input.fromAssetId, input.relation, input.toAssetId, input.sourceRevision]);
}

const DOMAIN_RULES: ReadonlyArray<{ domain: CodeAssetDomain; patterns: readonly RegExp[] }> = [
  { domain: 'INDEXING', patterns: [/index(?:ing|er)?/i, /materializ/i, /chunk/i] },
  { domain: 'RETRIEVAL', patterns: [/retriev/i, /search/i, /candidate/i] },
  { domain: 'RANKING', patterns: [/rank/i, /rerank/i, /topk/i, /top-k/i, /rrf/i, /pagerank/i, /hits/i] },
  { domain: 'SCHEMA', patterns: [/schema/i, /\bzod\b/i, /z\.object/i, /z\.enum/i] },
  { domain: 'AST', patterns: [/tree[-_ ]?sitter/i, /ast[-_ ]?grep/i, /ts[-_ ]?morph/i, /language[-_ ]?server/i] },
  { domain: 'GRAPH', patterns: [/graph/i, /pagerank/i, /leiden/i, /louvain/i, /networkx/i] },
  { domain: 'HYPERGRAPH', patterns: [/hypergraph/i, /n[-_ ]?ary/i, /hyperedge/i] },
  { domain: 'SEMANTIC', patterns: [/semantic/i, /embedding/i, /vector/i, /cosine/i] },
  { domain: 'ACE', patterns: [/(?:^|[\W_])ace(?:[\W_]|$)/i, /contextmanifest/i, /context[-_ ]?manifest/i] },
  { domain: 'RLM', patterns: [/(?:^|[\W_])rlm(?:[\W_]|$)/i, /recursive[-_ ]?language/i] },
  { domain: 'CACHE', patterns: [/cache/i, /residenc/i, /prefetch/i] },
  { domain: 'BITFROST', patterns: [/bitfrost/i, /valkey/i] },
  { domain: 'TURBOVEC', patterns: [/turbovec/i, /turboquant/i] },
  { domain: 'DISKANN', patterns: [/diskann/i, /vamana/i] },
  { domain: 'CUVS', patterns: [/\bcuvs\b/i, /cagra/i, /ivf[-_ ]?(?:flat|pq)/i, /brute[-_ ]?force/i] },
  { domain: 'CUGRAPH', patterns: [/cugraph/i, /nx[-_ ]?cugraph/i] },
  { domain: 'CUDA', patterns: [/cuda/i, /cublas/i, /cutile/i, /triton/i, /gpu/i] },
  { domain: 'SIDECAR', patterns: [/sidecar/i, /fastapi/i, /grpc/i] },
  { domain: 'DAG', patterns: [/\bdag\b/i, /workflow/i, /langgraph/i] },
  { domain: 'MCP', patterns: [/\bmcp\b/i, /tool[-_ ]?call/i] },
  { domain: 'AGENTIC_REPAIR', patterns: [/repair/i, /fix/i, /mutation/i, /patch/i, /rollback/i, /retry/i] },
  { domain: 'VALIDATION', patterns: [/validat/i, /parity/i, /receipt/i, /gate/i] },
  { domain: 'TRANSPORT', patterns: [/grpc/i, /quic/i, /rabbitmq/i, /kafka/i, /protobuf/i, /msgpack/i] },
  { domain: 'DATABASE', patterns: [/postgres/i, /qdrant/i, /neo4j/i, /drizzle/i, /sql/i] },
];

export function classifyCodeAssetDomains(...values: readonly string[]): CodeAssetDomain[] {
  const haystack = values.filter(Boolean).join('\n');
  const domains = DOMAIN_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(haystack)))
    .map((rule) => rule.domain);
  return domains.length > 0 ? [...new Set(domains)] : ['OTHER'];
}

export function reusableCodeAsset(domains: readonly CodeAssetDomain[], kind: CodeAssetKind): boolean {
  if (kind === 'DOCUMENT' || kind === 'EXTERNAL_MODULE') return false;
  return domains.some((domain) => [
    'INDEXING', 'RETRIEVAL', 'RANKING', 'SCHEMA', 'AST', 'GRAPH', 'HYPERGRAPH',
    'ACE', 'RLM', 'CACHE', 'BITFROST', 'TURBOVEC', 'DISKANN', 'CUVS', 'CUGRAPH',
    'CUDA', 'DAG', 'MCP', 'AGENTIC_REPAIR', 'VALIDATION', 'TRANSPORT', 'DATABASE',
  ].includes(domain));
}

export function repairEvidenceCodeAsset(domains: readonly CodeAssetDomain[]): boolean {
  return domains.includes('AGENTIC_REPAIR') || domains.includes('VALIDATION') || domains.includes('AST');
}
