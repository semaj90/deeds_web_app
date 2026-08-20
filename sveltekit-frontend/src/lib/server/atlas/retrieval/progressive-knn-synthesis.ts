import { z } from 'zod';
import type { ProgressiveKnnGraphPlanV1 } from './progressive-knn-graph-contracts.js';
import type { ProgressiveRapidsRunV1 } from './progressive-knn-rapids-runner.js';
import {
  buildKnnContextGraph,
  canonicalJsonArtifact,
  searchKnnAStar,
  synthesizeKnnMultihop,
  KnnAStarReceiptV1Schema,
  KnnContextGraphV1Schema,
  KnnMultihopReceiptV1Schema,
} from './knn-context-graph.js';

export const ProgressiveKnnSynthesisReceiptV1Schema = z.object({
  schema: z.literal('atlas.progressive-knn-synthesis.v1'),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  contextGraph: KnnContextGraphV1Schema,
  multihop: KnnMultihopReceiptV1Schema,
  aStar: KnnAStarReceiptV1Schema.nullable(),
  challengerRecallAtK: z.number().finite().min(0).max(1).nullable(),
  cache: z.object({
    enabled: z.boolean(),
    cacheKey: z.string().min(1).nullable(),
    contentType: z.literal('application/json'),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    byteLength: z.number().int().nonnegative(),
    /** Canonical JSON is an immutable cache payload; it is not canonical graph truth. */
    role: z.literal('DERIVED_CONTEXT_CACHE'),
  }).strict(),
  exactPromotionRequired: z.literal(true),
  canonicalWrites: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type ProgressiveKnnSynthesisReceiptV1 = z.infer<typeof ProgressiveKnnSynthesisReceiptV1Schema>;

export type ProgressiveKnnSynthesisArtifactV1 = {
  receipt: ProgressiveKnnSynthesisReceiptV1;
  json: string;
};

/**
 * Build the read-only contextual graph immediately after the RAPIDS stage.
 * Only exact cuVS edges become A* termination-authority edges. CAGRA/latent
 * outputs remain challenger/routing evidence and are recorded on candidates.
 */
export function synthesizeProgressiveKnnContext(input: {
  plan: ProgressiveKnnGraphPlanV1;
  rapids: ProgressiveRapidsRunV1;
  seedCanonicalIds: readonly string[];
  targetCanonicalId?: string | null;
  maxContextNodes?: number;
  maxAStarExpansions?: number;
  /** Optional admissible lower bound such as ALT. Never pass PCA/latent/GNN here unless separately proven. */
  lowerBoundByCanonicalId?: Readonly<Record<string, number>>;
  lowerBoundProven?: boolean;
  /** PCA/latent/spectral/GNN scores may be secondary ordering only. */
  aggressiveTieBreakerByCanonicalId?: Readonly<Record<string, number>>;
  producerRevision: string;
}): ProgressiveKnnSynthesisArtifactV1 {
  const graph = buildKnnContextGraph({
    requestId: input.plan.requestId,
    workspaceRevision: input.plan.workspaceRevision,
    representationId: input.plan.semanticRepresentation.representationId,
    representationRevision: input.plan.semanticRepresentation.representationRevision,
    metric: 'COSINE',
    candidates: input.rapids.candidates.slice(0, input.rapids.graphNodeCount),
    edges: input.rapids.knnEdges,
    exactEdgesOnly: true,
    producerRevision: input.producerRevision,
  });

  const multihop = synthesizeKnnMultihop({
    graph,
    seedCanonicalIds: input.seedCanonicalIds,
    maxHops: input.plan.maxGraphHops,
    maxNodes: input.maxContextNodes ?? Math.max(1, graph.nodes.length),
    producerRevision: input.producerRevision,
  });

  const sourceCanonicalId = multihop.seedCanonicalIds[0];
  const targetCanonicalId = input.targetCanonicalId ?? null;
  const aStar = targetCanonicalId
    ? searchKnnAStar({
        graph,
        sourceCanonicalId,
        targetCanonicalId,
        maxHops: input.plan.maxGraphHops,
        maxExpansions: input.maxAStarExpansions ?? Math.max(64, graph.nodes.length * 4),
        lowerBoundByCanonicalId: input.lowerBoundByCanonicalId,
        lowerBoundProven: input.lowerBoundProven,
        aggressiveTieBreakerByCanonicalId: input.aggressiveTieBreakerByCanonicalId,
        producerRevision: input.producerRevision,
      })
    : null;

  const cacheBody = {
    schema: 'atlas.progressive-knn-cache-payload.v1',
    requestId: input.plan.requestId,
    workspaceRevision: input.plan.workspaceRevision,
    graphRevision: input.plan.graphRevision,
    semanticRepresentation: input.plan.semanticRepresentation,
    latent128Representation: input.plan.latent128Representation,
    latent64Representation: input.plan.latent64Representation,
    candidates: input.rapids.candidates,
    contextGraph: graph,
    multihop,
    aStar,
    challengerRecallAtK: input.rapids.challengerRecallAtK,
    exactPromotionRequired: true,
    canonicalWrites: false,
  };
  const artifact = canonicalJsonArtifact(cacheBody);
  const cacheKey = input.plan.cacheJson
    ? `atlas:progressive-knn:${input.plan.workspaceRevision}:${input.plan.graphRevision}:${artifact.sha256}`
    : null;

  const receipt = ProgressiveKnnSynthesisReceiptV1Schema.parse({
    schema: 'atlas.progressive-knn-synthesis.v1',
    requestId: input.plan.requestId,
    workspaceRevision: input.plan.workspaceRevision,
    graphRevision: input.plan.graphRevision,
    contextGraph: graph,
    multihop,
    aStar,
    challengerRecallAtK: input.rapids.challengerRecallAtK,
    cache: {
      enabled: input.plan.cacheJson,
      cacheKey,
      contentType: 'application/json',
      checksumSha256: artifact.sha256,
      byteLength: artifact.byteLength,
      role: 'DERIVED_CONTEXT_CACHE',
    },
    exactPromotionRequired: true,
    canonicalWrites: false,
    producerRevision: input.producerRevision,
  });

  return { receipt, json: artifact.json };
}
