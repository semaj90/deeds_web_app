import { SEMANTIC_DIMENSION } from '../embedding/embedding-contract-768.js';

/**
 * Semantic vectors and latent topology projections are different contracts.
 * Never share one dimension union between them — a 128/64-dim topology
 * projection is not a valid semantic embedding dimension and vice versa.
 */
export type SemanticDimension = typeof SEMANTIC_DIMENSION;
export type TopologyDimension = 128 | 64;

export type LaneRegistryKind =
  | 'semantic'
  | 'retrieval'
  | 'topology'
  | 'authority'
  | 'routing'
  | 'memory'
  | 'legacy-vector';

export type VectorLaneRole =
  | 'source'
  | 'canonical'
  | 'derived'
  | 'legacy'
  | 'experimental';

export interface VectorLaneContract {
  laneId: string;
  kind: LaneRegistryKind;
  role: VectorLaneRole;
  modelId: string;
  vectorName: string;
  collection: string;
  dimension: SemanticDimension | 64 | 128 | 384;
  sourceDimension: number;
  projection: 'none' | 'direct_slice' | 'autoencoder' | 'latent';
  normalization: 'none' | 'l2';
  status: 'active' | 'partial' | 'legacy' | 'blocked';
  evidenceAuthority: boolean;
  notes: string;
}

/**
 * Canonical vector-lane registry for Parent Atlas.
 *
 * IMPORTANT:
 * - semantic_768 is the single canonical semantic representation.
 * - latent_128 and latent_64 are derived from semantic_768 and are routing /
 *   topology coordinates only.
 * - dense_384 remains addressable only for historical collection/receipt
 *   compatibility while the migration is completed.
 */
export const VECTOR_LANES = {
  source768: {
    laneId: 'embeddinggemma-768d',
    kind: 'semantic',
    role: 'canonical',
    modelId: 'embeddinggemma:latest',
    vectorName: 'content',
    collection: 'codebase_chunks_768',
    dimension: SEMANTIC_DIMENSION,
    sourceDimension: SEMANTIC_DIMENSION,
    projection: 'none',
    normalization: 'l2',
    status: 'active',
    evidenceAuthority: true,
    notes: 'Single canonical semantic lane. Qdrant/CAGRA/cuVS are executor choices behind this logical lane.',
  },
  topology128: {
    laneId: 'atlas-topology128',
    kind: 'topology',
    role: 'derived',
    modelId: 'atlas-autoencoder-768x128-v1',
    vectorName: 'latent_128',
    collection: 'codebase_topology_128',
    dimension: 128,
    sourceDimension: SEMANTIC_DIMENSION,
    projection: 'autoencoder',
    normalization: 'l2',
    status: 'partial',
    evidenceAuthority: false,
    notes: 'Derived semantic_768→latent_128 topology/neighborhood coordinate. Never a canonical semantic vote.',
  },
  latent64: {
    laneId: 'atlas-latent64',
    kind: 'routing',
    role: 'derived',
    modelId: 'atlas-autoencoder-768x64-v4',
    vectorName: 'latent_64',
    collection: 'codebase_topology_64',
    dimension: 64,
    sourceDimension: SEMANTIC_DIMENSION,
    projection: 'autoencoder',
    normalization: 'l2',
    status: 'partial',
    evidenceAuthority: false,
    notes: 'Derived semantic_768→latent_64 routing/cache coordinate for shard, centroid, residency and cheap locality decisions only.',
  },
  legacy384: {
    laneId: 'embeddinggemma-384-legacy',
    kind: 'legacy-vector',
    role: 'legacy',
    modelId: 'embeddinggemma-prefix384-v1',
    vectorName: 'content',
    collection: 'codebase_chunks_384_hybrid',
    dimension: 384,
    sourceDimension: SEMANTIC_DIMENSION,
    projection: 'direct_slice',
    normalization: 'l2',
    status: 'legacy',
    evidenceAuthority: false,
    notes: 'Compatibility-only lane for historical Qdrant points/receipts. New Parent Atlas retrieval must not promote it to canonical semantic evidence.',
  },
} as const satisfies Record<string, VectorLaneContract>;

export type VectorLaneId = keyof typeof VECTOR_LANES;

export function getVectorLane(laneId: VectorLaneId): VectorLaneContract {
  return VECTOR_LANES[laneId];
}

export function getVectorLaneByCollection(collection: string): VectorLaneContract | undefined {
  return Object.values(VECTOR_LANES).find((lane) => lane.collection === collection);
}

/**
 * The single active semantic lane. Use this instead of indexing VECTOR_LANES
 * directly when the caller needs the canonical semantic embedding contract —
 * it fails loudly if the registry's active semantic lane ever changes shape.
 */
export function getActiveSemanticVectorLane(): VectorLaneContract & { dimension: SemanticDimension } {
  const lane = VECTOR_LANES.source768;
  if (
    lane.kind !== 'semantic' ||
    lane.status !== 'active' ||
    lane.dimension !== 768 ||
    lane.evidenceAuthority !== true
  ) {
    throw new Error('SEMANTIC_768_LANE_INVARIANT_BROKEN: source768 is no longer the active canonical 768-dim semantic lane');
  }
  return lane as VectorLaneContract & { dimension: SemanticDimension };
}

export function assertRoutingLaneIsDerived(laneId: 'topology128' | 'latent64'): void {
  const lane = VECTOR_LANES[laneId];
  if (lane.sourceDimension !== SEMANTIC_DIMENSION || lane.evidenceAuthority || lane.status === 'active' && lane.kind === 'semantic') {
    throw new Error(`ROUTING_LANE_AUTHORITY_VIOLATION:${laneId}`);
  }
}

export function assertLegacy384NotCanonical(): void {
  const lane = VECTOR_LANES.legacy384;
  if (lane.evidenceAuthority || lane.status !== 'legacy') {
    throw new Error('LEGACY_384_CANONICALITY_VIOLATION');
  }
}
