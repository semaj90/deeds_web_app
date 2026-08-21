import { z } from 'zod';
import {
  buildRetrievalFanoutPlan,
  type RetrievalFanoutPlanV1,
  type StructuralHyperedgeV1,
} from './structural-hypergraph-fanout.js';

const S = z.string().min(1);

export const StructuralRoutingCandidateV1Schema = z.object({
  canonicalId: S,
  packetKey: S,
  symbolVersionId: S.nullable(),
  treeNodeId: S.nullable(),
  sourceRef: S,
  workspaceRevision: S,
  sourceRevision: S,
  graphRevision: S,
  representationRevision: S,
  semanticScore: z.number().finite().min(0).max(1),
  lexicalScore: z.number().finite().min(0).max(1),
  astScore: z.number().finite().min(0).max(1),
  graphScore: z.number().finite().min(0).max(1),
  executionScore: z.number().finite().min(0).max(1),
  domainScore: z.number().finite().min(0).max(1),
  kmeansCentroidId: S.nullable(),
  somCell: z.object({ x: z.number().int().min(0).max(19), y: z.number().int().min(0).max(19) }).nullable(),
  evidenceRefs: z.array(S).max(64),
}).strict();
export type StructuralRoutingCandidateV1 = z.infer<typeof StructuralRoutingCandidateV1Schema>;

export const StructuralRoutingDecisionV1Schema = z.object({
  schema: z.literal('atlas.structural-routing-decision.v1'),
  requestId: S,
  taskKind: S,
  fanoutPlan: z.custom<RetrievalFanoutPlanV1>(),
  seedCanonicalIds: z.array(S).max(128),
  selectedHyperedgeIds: z.array(S).max(256),
  notes: z.array(S),
}).strict();
export type StructuralRoutingDecisionV1 = z.infer<typeof StructuralRoutingDecisionV1Schema>;

function candidateScore(row: StructuralRoutingCandidateV1): number {
  return (
    row.semanticScore * 0.27 +
    row.astScore * 0.22 +
    row.graphScore * 0.18 +
    row.executionScore * 0.14 +
    row.lexicalScore * 0.09 +
    row.domainScore * 0.1
  );
}

export function chooseGraphSeeds(
  candidates: StructuralRoutingCandidateV1[],
  seedK = 32,
): StructuralRoutingCandidateV1[] {
  return [...candidates]
    .filter((row) => Boolean(row.canonicalId) && Boolean(row.graphRevision))
    .sort((a, b) => candidateScore(b) - candidateScore(a) || a.canonicalId.localeCompare(b.canonicalId))
    .slice(0, seedK);
}

export function chooseRelevantHyperedges(input: {
  hyperedges: StructuralHyperedgeV1[];
  seedCanonicalIds: string[];
  maxHyperedges?: number;
}): StructuralHyperedgeV1[] {
  const seedSet = new Set(input.seedCanonicalIds);
  return input.hyperedges
    .filter((edge) => edge.participants.some((participant) => seedSet.has(participant.entityId)))
    .sort((a, b) => b.confidence - a.confidence || a.hyperedgeId.localeCompare(b.hyperedgeId))
    .slice(0, input.maxHyperedges ?? 64);
}

export function buildStructuralRoutingDecision(input: {
  requestId: string;
  workspaceRevision: string;
  graphRevision: string;
  representationRevision: string;
  taskKind: string;
  candidates: StructuralRoutingCandidateV1[];
  hyperedges?: StructuralHyperedgeV1[];
  somCell?: { x: number; y: number; revision: string } | null;
  neighboringSomCells?: Array<{ x: number; y: number }>;
  kmeansCentroidIds?: string[];
  kmeansRevision?: string | null;
  qdrantPayloadFilters?: Record<string, unknown>;
  qdrantAvailable?: boolean;
  cuvsExactAvailable?: boolean;
  cagraProven?: boolean;
  turbovecProven?: boolean;
}): StructuralRoutingDecisionV1 {
  const fanoutPlan = buildRetrievalFanoutPlan({
    requestId: input.requestId,
    workspaceRevision: input.workspaceRevision,
    graphRevision: input.graphRevision,
    representationRevision: input.representationRevision,
    taskKind: input.taskKind,
    somCell: input.somCell,
    neighboringSomCells: input.neighboringSomCells,
    kmeansCentroidIds: input.kmeansCentroidIds,
    kmeansRevision: input.kmeansRevision,
    qdrantPayloadFilters: input.qdrantPayloadFilters,
    qdrantAvailable: input.qdrantAvailable,
    cuvsExactAvailable: input.cuvsExactAvailable,
    cagraProven: input.cagraProven,
    turbovecProven: input.turbovecProven,
  });

  const seeds = chooseGraphSeeds(input.candidates, fanoutPlan.graphFanout.seedK);
  const selectedHyperedges = chooseRelevantHyperedges({
    hyperedges: input.hyperedges ?? [],
    seedCanonicalIds: seeds.map((row) => row.canonicalId),
    maxHyperedges: fanoutPlan.graphFanout.seedK * 2,
  });

  return StructuralRoutingDecisionV1Schema.parse({
    schema: 'atlas.structural-routing-decision.v1',
    requestId: input.requestId,
    taskKind: input.taskKind,
    fanoutPlan,
    seedCanonicalIds: seeds.map((row) => row.canonicalId),
    selectedHyperedgeIds: selectedHyperedges.map((edge) => edge.hyperedgeId),
    notes: [
      'KMEANS_AND_SOM_ROUTE_CANDIDATES_ONLY',
      'QDRANT_REMAINS_PERSISTENT_SEMANTIC_PROJECTION',
      'NEO4J_FANOUT_STARTS_AFTER_TOPK_NARROWING',
      'N_ARY_HYPEREDGES_ARE_EVIDENCE_GROUPS_NOT_REPLACEMENTS_FOR_BINARY_AST_EDGES',
    ],
  });
}
