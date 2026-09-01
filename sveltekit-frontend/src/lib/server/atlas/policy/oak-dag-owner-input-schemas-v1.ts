import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);

/** Input gates for existing DAG owners. These schemas do not execute owners. */
export const oakDagAstScanInputSchema = z.object({
  sourceRef: id,
  sourceRevision: revision,
  language: id,
  source: z.string(),
}).strict();

export const oakDagAstEvidenceInputSchema = z.object({
  treeNodeIds: z.array(id).min(1).max(100),
  sourceRevision: revision,
}).strict();

export const oakDagGraphExpandInputSchema = z.object({
  packetKey: id,
  maxHops: z.number().int().min(0).max(4),
  maxNodes: z.number().int().positive().max(1000).optional(),
  maxEdges: z.number().int().positive().max(5000).optional(),
  direction: z.enum(['out', 'in', 'both']).optional(),
  graphRevision: revision,
  workspaceRevision: revision,
  graphOrdinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  candidateOrdinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
}).strict();

export const oakDagQdrantSearchInputSchema = z.object({
  embedding: z.array(z.number().finite()).length(768),
  limit: z.number().int().positive().max(100).default(30),
  collection: id.default('codebase_chunks_768'),
  topoClass: id.optional(),
}).strict();

export const oakDagPostgresInputSchema = z.object({
  canonicalIds: z.array(id).min(1).max(100),
}).strict();

export const oakDagContextBuildInputSchema = z.object({
  context: z.record(z.string(), z.unknown()),
  options: z.record(z.string(), z.unknown()),
}).strict();

export const OAK_DAG_OWNER_INPUT_SCHEMA_IDS = {
  AST_SCAN: 'atlas.oak-dag-ast-scan-input.v1',
  AST_EVIDENCE: 'atlas.oak-dag-ast-evidence-input.v1',
  GRAPH_EXPAND: 'atlas.oak-dag-graph-expand-input.v1',
  FETCH_QDRANT: 'atlas.oak-dag-qdrant-search-input.v1',
  FETCH_POSTGRES: 'atlas.oak-dag-postgres-input.v1',
  BUILD_CONTEXT: 'atlas.oak-dag-context-build-input.v1',
} as const;
