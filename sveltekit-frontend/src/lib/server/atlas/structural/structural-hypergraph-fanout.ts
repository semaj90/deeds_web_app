import { createHash } from 'node:crypto';
import { z } from 'zod';

const S = z.string().min(1);
const Unit = z.number().finite().min(0).max(1);

export const StructuralParticipantRoleSchema = z.enum([
  'ast_node',
  'symbol',
  'symbol_version',
  'packet',
  'callee',
  'caller',
  'argument',
  'parameter',
  'expected_type',
  'observed_type',
  'diagnostic',
  'test',
  'source_span',
  'ontology_concept',
  'domain',
]);

export const StructuralHyperedgeTypeSchema = z.enum([
  'CALL_BINDING',
  'TYPE_CONSTRAINT',
  'DIAGNOSTIC_CONTEXT',
  'TEST_COVERAGE',
  'ONTOLOGY_ASSERTION',
  'RETRIEVAL_PROMOTION',
]);

export const StructuralHyperedgeV1Schema = z.object({
  schema: z.literal('atlas.structural-hyperedge.v1'),
  hyperedgeId: S,
  type: StructuralHyperedgeTypeSchema,
  workspaceRevision: S,
  sourceRevision: S,
  graphRevision: S,
  representationRevision: S,
  participants: z.array(z.object({
    entityId: S,
    entityKind: S,
    role: StructuralParticipantRoleSchema,
    ordinal: z.number().int().nonnegative(),
  }).strict()).min(3),
  evidenceRefs: z.array(S).min(1),
  confidence: Unit,
  producerRevision: S,
}).strict();

export type StructuralHyperedgeV1 = z.infer<typeof StructuralHyperedgeV1Schema>;

export const RetrievalFanoutPlanV1Schema = z.object({
  schema: z.literal('atlas.retrieval-fanout-plan.v1'),
  requestId: S,
  workspaceRevision: S,
  graphRevision: S,
  representationRevision: S,
  semanticLane: z.object({
    logicalLane: z.literal('semantic_768'),
    candidateK: z.number().int().positive().max(4096),
    executors: z.array(z.enum(['QDRANT', 'CUVS_EXACT', 'CAGRA', 'TURBOVEC'])).min(1),
    oneLogicalVote: z.literal(true),
  }).strict(),
  routing: z.object({
    somCell: z.object({ x: z.number().int().min(0).max(19), y: z.number().int().min(0).max(19), revision: S }).nullable(),
    neighboringSomCells: z.array(z.object({ x: z.number().int().min(0).max(19), y: z.number().int().min(0).max(19) }).strict()).max(9),
    kmeansCentroidIds: z.array(S).max(64),
    kmeansRevision: S.nullable(),
  }).strict(),
  exactPromotion: z.object({
    sampleK: z.number().int().positive().max(1024),
    promotedK: z.number().int().positive().max(256),
    requireCanonicalIdentity: z.literal(true),
    requireRevisionParity: z.literal(true),
  }).strict(),
  graphFanout: z.object({
    seedK: z.number().int().positive().max(128),
    maxDepth: z.number().int().min(0).max(3),
    maxNeighborsPerSeed: z.number().int().positive().max(256),
    includeNeo4j: z.boolean(),
    includeCuGraph: z.boolean(),
    relations: z.array(z.enum(['AST_PARENT', 'AST_CHILD', 'CALLS', 'REFERENCES', 'TESTS', 'TYPE_OF', 'IMPORTS', 'EXPORTS'])),
  }).strict(),
  qdrantPayloadFilters: z.record(z.string(), z.unknown()),
  reasonCodes: z.array(S).min(1),
}).strict();

export type RetrievalFanoutPlanV1 = z.infer<typeof RetrievalFanoutPlanV1Schema>;

function stableHash(prefix: string, value: unknown): string {
  return `${prefix}:${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24)}`;
}

export function buildStructuralHyperedge(input: Omit<StructuralHyperedgeV1, 'schema' | 'hyperedgeId'>): StructuralHyperedgeV1 {
  const participants = [...input.participants].sort((a, b) => a.ordinal - b.ordinal || a.role.localeCompare(b.role) || a.entityId.localeCompare(b.entityId));
  const hyperedgeId = stableHash('hyper', {
    type: input.type,
    workspaceRevision: input.workspaceRevision,
    sourceRevision: input.sourceRevision,
    graphRevision: input.graphRevision,
    participants,
    evidenceRefs: [...new Set(input.evidenceRefs)].sort(),
  });
  return StructuralHyperedgeV1Schema.parse({ ...input, schema: 'atlas.structural-hyperedge.v1', hyperedgeId, participants });
}

export function buildRetrievalFanoutPlan(input: {
  requestId: string;
  workspaceRevision: string;
  graphRevision: string;
  representationRevision: string;
  taskKind: string;
  somCell?: { x: number; y: number; revision: string } | null;
  neighboringSomCells?: Array<{ x: number; y: number }>;
  kmeansCentroidIds?: string[];
  kmeansRevision?: string | null;
  qdrantPayloadFilters?: Record<string, unknown>;
  qdrantAvailable?: boolean;
  cuvsExactAvailable?: boolean;
  cagraProven?: boolean;
  turbovecProven?: boolean;
}): RetrievalFanoutPlanV1 {
  const text = input.taskKind.toLowerCase();
  const repairLike = /repair|fix|error|fail|compile|runtime|test/.test(text);
  const structuralLike = repairLike || /ast|symbol|call|type|graph/.test(text);
  const executors: Array<'QDRANT' | 'CUVS_EXACT' | 'CAGRA' | 'TURBOVEC'> = [];
  if (input.qdrantAvailable !== false) executors.push('QDRANT');
  if (input.cuvsExactAvailable) executors.push('CUVS_EXACT');
  if (input.cagraProven) executors.push('CAGRA');
  if (input.turbovecProven) executors.push('TURBOVEC');
  if (executors.length === 0) executors.push('QDRANT');

  return RetrievalFanoutPlanV1Schema.parse({
    schema: 'atlas.retrieval-fanout-plan.v1',
    requestId: input.requestId,
    workspaceRevision: input.workspaceRevision,
    graphRevision: input.graphRevision,
    representationRevision: input.representationRevision,
    semanticLane: {
      logicalLane: 'semantic_768',
      candidateK: repairLike ? 512 : 256,
      executors,
      oneLogicalVote: true,
    },
    routing: {
      somCell: input.somCell ?? null,
      neighboringSomCells: input.neighboringSomCells ?? [],
      kmeansCentroidIds: input.kmeansCentroidIds ?? [],
      kmeansRevision: input.kmeansRevision ?? null,
    },
    exactPromotion: {
      sampleK: repairLike ? 96 : 64,
      promotedK: repairLike ? 24 : 16,
      requireCanonicalIdentity: true,
      requireRevisionParity: true,
    },
    graphFanout: {
      seedK: repairLike ? 32 : 16,
      maxDepth: structuralLike ? 2 : 1,
      maxNeighborsPerSeed: structuralLike ? 64 : 24,
      includeNeo4j: structuralLike,
      includeCuGraph: false,
      relations: structuralLike
        ? ['AST_PARENT', 'AST_CHILD', 'CALLS', 'REFERENCES', 'TESTS', 'TYPE_OF']
        : ['CALLS', 'REFERENCES'],
    },
    qdrantPayloadFilters: input.qdrantPayloadFilters ?? {},
    reasonCodes: [
      'SOM_AND_KMEANS_ROUTE_ONLY',
      'KNN_REMAINS_CANDIDATE_RETRIEVAL',
      'GRAPH_FANOUT_AFTER_TOPK',
      'ONE_SEMANTIC_LANE_ONE_VOTE',
    ],
  });
}
