import { z } from 'zod';

export const graphTraversalDirections = ['outbound', 'inbound', 'both'] as const;
export type GraphTraversalDirection = (typeof graphTraversalDirections)[number];

export const atlasCandidateBuckets = [32, 64, 128, 256, 512] as const;
export type AtlasCandidateBucket = (typeof atlasCandidateBuckets)[number];

export const sourceMutationStatusValues = ['FRESH', 'STALE', 'UNKNOWN', 'MISSING'] as const;
export type SourceMutationStatusV1 = (typeof sourceMutationStatusValues)[number];

/**
 * A source version is not an embedding dimension or representation revision.
 * The live atlas_packets audit has no literal source_revision column, so delta
 * producers must carry the evidence they actually possess and may leave the
 * legacy numeric sourceRevision null until a real owner is established.
 */
export interface SourceVersionAnchorV1 {
  sourceRef: string;
  contentHash: string | null;
  workspaceRevision: number | null;
  representationRevision: number | null;
  mutationDiffHash: string | null;
  mutationCommit: string | null;
}

export interface GraphDeltaV1 {
  schema: 'atlas.graph-delta.v1';
  baseSnapshotId: string;
  workspaceRevision: number;
  /** @deprecated Do not synthesize this from workspace/representation revisions. */
  sourceRevision?: number | null;
  sourceVersionAnchors: SourceVersionAnchorV1[];
  nodesAdded: Array<Record<string, unknown>>;
  nodesChanged: Array<Record<string, unknown>>;
  nodesRemoved: string[];
  edgesAdded: Array<Record<string, unknown>>;
  edgesChanged: Array<Record<string, unknown>>;
  edgesRemoved: string[];
  relationsAdded: Array<Record<string, unknown>>;
  relationsRemoved: string[];
  evidenceRefs: string[];
}

export interface GraphRuntimeProjectionReceiptV1 {
  schema: 'atlas.graph-runtime-projection-receipt.v1';
  snapshotId: string;
  topologyHash: string;
  producerRevision: string;
  createdAt: string;
  nodeCount: number;
  edgeCount: number;
  relationCount: number;
  projections: Array<{
    executor: 'postgres' | 'go' | 'neo4j-gds' | 'cugraph';
    revision: string;
    checksum?: string;
    status: 'ready' | 'degraded' | 'failed';
  }>;
}

export interface GraphTraverseRequestV1 {
  schema?: 'atlas.graph-traverse-request.v1';
  snapshotId: string;
  seedNodeKeys: string[];
  maxHops?: number;
  maxNodes?: number;
  direction?: GraphTraversalDirection;
  edgeTypes?: string[];
}

/** Which read model a graph packet belongs to. Views share one identity space; none mints identity. */
export const graphViewKinds = ['STRUCTURAL', 'DOMAIN', 'KNOWLEDGE', 'TIMELINE', 'HYPERGRAPH'] as const;
export type GraphViewKindV1 = (typeof graphViewKinds)[number];

/**
 * How far a node/edge has been verified. A classifier, LLM, PageRank or
 * embedding-similarity signal can only reach PROPOSED; STRUCTURAL_PROVEN needs
 * source-grounded evidence (CST/AST/LSP span), HUMAN_REVIEWED needs a reviewer.
 */
export const graphQualificationStates = [
  'PROPOSED',
  'STRUCTURAL_PROVEN',
  /** Checksum-verified event chain; has no source span, so it is never STRUCTURAL_PROVEN. */
  'EVENT_CHAIN_VERIFIED',
  'HUMAN_REVIEWED',
  'STALE',
  'REJECTED',
] as const;
export type GraphQualificationV1 = (typeof graphQualificationStates)[number];

export interface GraphSourceSpanV1 {
  /** Exact UTF-8 byte offsets in the file identified by sourceRevision. */
  startByte: number;
  endByte: number;
  startLine?: number;
  endLine?: number;
}

/** Task/worktree context for TIMELINE view and revision comparison. Optional, additive. */
export interface GraphTemporalContextV1 {
  workspaceEventId: string | null;
  taskId: string | null;
  worktreeId: string | null;
  recordedAt: string | null;
}

export interface GraphViewNodeV1 {
  id: string;
  type: string;
  label: string;
  packetKey: string | null;
  sourceRef: string | null;
  hop: number;
  properties: Record<string, unknown>;
  /** Additive (all optional) so existing producers keep compiling. */
  sourceRevision?: string | null;
  span?: GraphSourceSpanV1 | null;
  qualification?: GraphQualificationV1;
  evidenceRefs?: string[];
  temporal?: GraphTemporalContextV1 | null;
}

export interface GraphViewEdgeV1 {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number;
  confidence: number;
  hop: number;
  qualification?: GraphQualificationV1;
  evidenceRefs?: string[];
  /** Revision of the source the relation was observed in. */
  sourceRevision?: string | null;
  span?: GraphSourceSpanV1 | null;
}

export interface GraphViewPacketV1 {
  schema: 'atlas.graph-view.v1';
  snapshotId: string;
  queryId: string;
  /** 'neo4j' only for HYPERGRAPH (a derived mirror; never canonical). */
  executor: 'postgres' | 'neo4j';
  nodes: GraphViewNodeV1[];
  edges: GraphViewEdgeV1[];
  truncated: boolean;
  maxHops: number;
  maxNodes: number;
  /** Additive: defaults to STRUCTURAL when absent. */
  view?: GraphViewKindV1;
  /** Opaque cursor for paginated expansion; null when the page is complete. */
  nextCursor?: string | null;
  workspaceRevision?: string | null;
}

/**
 * A relation may be shown as an edge in DOMAIN/KNOWLEDGE views only as
 * PROPOSED unless backed by source-grounded evidence. Fails closed.
 */
export function clampGraphQualificationV1(
  requested: GraphQualificationV1,
  evidence: { hasSourceSpan: boolean; humanReviewed: boolean },
): GraphQualificationV1 {
  if (requested === 'HUMAN_REVIEWED') return evidence.humanReviewed ? 'HUMAN_REVIEWED' : 'PROPOSED';
  if (requested === 'STRUCTURAL_PROVEN') return evidence.hasSourceSpan ? 'STRUCTURAL_PROVEN' : 'PROPOSED';
  return requested;
}

export interface AtlasSynthesisRequestV1 {
  schema?: 'atlas.synthesis-request.v1';
  snapshotId: string;
  /** Generalized graph-analysis revision. Never silently inferred from snapshotId. */
  graphRevision?: string;
  query: string;
  seedNodeKeys: string[];
  edgeTypes?: string[];
  maxHops?: number;
  candidateLimit?: number;
  tokenBudget?: number;
}

export interface CandidateFeatureRowV1 {
  candidateOrdinal: number;
  canonicalId: string;
  packetKey: string | null;
  nodeKey: string;
  sourceRef: string | null;
  sourceMutationStatus: SourceMutationStatusV1;
  sourceFreshnessProven: boolean;
  semanticCosine: number | null;
  lexicalScore: number | null;
  exactSymbolMatch: number;
  astMatch: number | null;
  personalizedPageRank: number | null;
  graphHopDistance: number;
  globalPageRank: number | null;
  communityId: string | null;
  typeCompatibility: number | null;
  /** Graph-analysis revision parity; source freshness is tracked separately. */
  revisionMatch: number;
  bitfrostHotness: number | null;
}

export interface ContextManifestV1 {
  schema: 'atlas.context-manifest.v1';
  requestId: string;
  snapshotId: string;
  graphRevision?: string | null;
  query: string;
  candidateBucket: AtlasCandidateBucket | number;
  candidateCount: number;
  tokenBudget: number;
  selectedNodeKeys: string[];
  evidenceRefs: string[];
  mutationAwareness?: {
    proofPolicy: 'content-hash-plus-tracked-git-provenance';
    freshCount: number;
    staleCount: number;
    unknownCount: number;
    missingCount: number;
    staleNodeKeys: string[];
    unknownNodeKeys: string[];
  };
  producerRevision: string;
}

const ContextManifestMutationAwarenessV1Schema = z.object({
  proofPolicy: z.literal('content-hash-plus-tracked-git-provenance'),
  freshCount: z.number().int().nonnegative(),
  staleCount: z.number().int().nonnegative(),
  unknownCount: z.number().int().nonnegative(),
  missingCount: z.number().int().nonnegative(),
  staleNodeKeys: z.array(z.string().min(1)),
  unknownNodeKeys: z.array(z.string().min(1)),
}).strict();

export const ContextManifestV1Schema = z.object({
  schema: z.literal('atlas.context-manifest.v1'),
  requestId: z.string().min(1),
  snapshotId: z.string().min(1),
  graphRevision: z.string().min(1).nullable().optional(),
  query: z.string(),
  candidateBucket: z.number().int().positive(),
  candidateCount: z.number().int().nonnegative(),
  tokenBudget: z.number().int().positive(),
  selectedNodeKeys: z.array(z.string().min(1)),
  evidenceRefs: z.array(z.string().min(1)),
  mutationAwareness: ContextManifestMutationAwarenessV1Schema.optional(),
  producerRevision: z.string().min(1),
}).strict();

export function chooseCandidateBucket(candidateCount: number): AtlasCandidateBucket {
  const normalized = Math.max(1, Math.min(512, Math.ceil(candidateCount)));
  return atlasCandidateBuckets.find((bucket) => normalized <= bucket) ?? 512;
}
