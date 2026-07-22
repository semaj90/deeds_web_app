import {
  EMBEDDING_CONTRACT,
  CANONICAL_EMBEDDING_DIM,
} from '../embedding/embedding-contract.js';
import {
  ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1,
  EMBEDDINGGEMMA_FULL768_V1,
} from './embeddinggemma-prefix384.js';

export type LaneRegistryRole =
  | 'canonical'
  | 'native'
  | 'derived'
  | 'legacy';

export type LaneRegistryKind =
  | 'semantic'
  | 'topology'
  | 'routing'
  | 'retrieval'
  | 'memory'
  | 'authority'
  | 'legacy-vector';

export interface LaneRegistryEntry {
  laneId: string;
  laneName: string;
  role: LaneRegistryRole;
  kind: LaneRegistryKind;
  contractVersion: string;
  sourceDimensions: number;
  outputDimensions: number;
  projectionKind: 'none' | 'prefix' | 'mrl' | 'autoencoder';
  normalization: 'none' | 'l2';
  canonical: boolean;
  purpose: string;
  collection?: string;
  notes: string;
}

export const LANE_REGISTRY = {
  retrieval384: {
    laneId: 'lane:retrieval:embeddinggemma-prefix384',
    laneName: 'Canonical retrieval projection',
    role: 'canonical',
    kind: 'retrieval',
    contractVersion: ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1,
    sourceDimensions: 768,
    outputDimensions: CANONICAL_EMBEDDING_DIM,
    projectionKind: 'prefix',
    normalization: 'l2',
    canonical: true,
    purpose: 'Primary Qdrant retrieval lane for Go Retrieval and ACE evidence selection.',
    collection: EMBEDDING_CONTRACT.qdrant_collection,
    notes: 'Atlas-defined direct-slice 384 retrieval lane. Do not treat as a native Gemma output.',
  },
  source768: {
    laneId: 'lane:source:embeddinggemma-full768',
    laneName: 'Native source embedding lane',
    role: 'native',
    kind: 'semantic',
    contractVersion: EMBEDDINGGEMMA_FULL768_V1,
    sourceDimensions: 768,
    outputDimensions: 768,
    projectionKind: 'none',
    normalization: 'l2',
    canonical: false,
    purpose: 'Native EmbeddingGemma output used as the source space for projections and accelerators.',
    collection: 'codebase_chunks_768',
    notes: 'Native semantic source lane; not the canonical retrieval contract.',
  },
  latent64: {
    laneId: 'lane:routing:autoencoder-768x64',
    laneName: 'Latent routing lane',
    role: 'derived',
    kind: 'routing',
    contractVersion: 'atlas-autoencoder-768x64-v1',
    sourceDimensions: 768,
    outputDimensions: 64,
    projectionKind: 'autoencoder',
    normalization: 'l2',
    canonical: false,
    purpose: 'Compact routing vector for K-means, SOM, centroid caches, and retrieval widening.',
    collection: 'vector_snapshot_packets',
    notes: 'Derived routing lane. Never use as canonical semantic meaning.',
  },
  topology128: {
    laneId: 'lane:topology:structural-128',
    laneName: 'Topology projection lane',
    role: 'derived',
    kind: 'topology',
    contractVersion: 'atlas-topology-embedding-128-v1',
    sourceDimensions: 768,
    outputDimensions: 128,
    projectionKind: 'autoencoder',
    normalization: 'l2',
    canonical: false,
    purpose: 'Structural relation lane for graph-aware retrieval and authority analysis.',
    collection: 'code_structural_facts',
    notes: 'Derived structural lane for topology evidence, not semantic truth.',
  },
  fixerMemory768: {
    laneId: 'lane:memory:fixer-768',
    laneName: 'Fixer memory lane',
    role: 'native',
    kind: 'memory',
    contractVersion: 'fixer-memory-768-v1',
    sourceDimensions: 768,
    outputDimensions: 768,
    projectionKind: 'none',
    normalization: 'l2',
    canonical: false,
    purpose: 'Error-fix recall lane for agentic recovery and patch memory.',
    collection: 'fixer_memory_768',
    notes: 'Native accelerator lane. Keep separate from retrieval contracts.',
  },
  attention768: {
    laneId: 'lane:authority:attention-768',
    laneName: 'Attention reranker lane',
    role: 'native',
    kind: 'authority',
    contractVersion: 'attention-reranker-768-v1',
    sourceDimensions: 768,
    outputDimensions: 768,
    projectionKind: 'none',
    normalization: 'l2',
    canonical: false,
    purpose: 'Attention-style reranking and authority scoring lane for high-signal candidate ordering.',
    collection: 'codebase_chunks_768',
    notes: 'Native ranking lane. Keep separate from canonical retrieval space.',
  },
  legacyContent768: {
    laneId: 'lane:legacy:content-768',
    laneName: 'Legacy content vector lane',
    role: 'legacy',
    kind: 'legacy-vector',
    contractVersion: 'legacy-content-768-v1',
    sourceDimensions: 768,
    outputDimensions: 768,
    projectionKind: 'none',
    normalization: 'l2',
    canonical: false,
    purpose: 'Legacy direct 768 content vector lane retained for compatibility only.',
    collection: 'codebase_chunks_768',
    notes: 'Compatibility lane. Tag as legacy and migrate consumers away from it.',
  },
  legacyError768: {
    laneId: 'lane:legacy:error-768',
    laneName: 'Legacy error vector lane',
    role: 'legacy',
    kind: 'legacy-vector',
    contractVersion: 'legacy-error-768-v1',
    sourceDimensions: 768,
    outputDimensions: 768,
    projectionKind: 'none',
    normalization: 'l2',
    canonical: false,
    purpose: 'Legacy error vector lane retained for compatibility with older agent-fix paths.',
    collection: 'codebase_chunks_768',
    notes: 'Compatibility lane. Do not treat as a canonical retrieval contract.',
  },
  legacySignature768: {
    laneId: 'lane:legacy:signature-768',
    laneName: 'Legacy signature vector lane',
    role: 'legacy',
    kind: 'legacy-vector',
    contractVersion: 'legacy-signature-768-v1',
    sourceDimensions: 768,
    outputDimensions: 768,
    projectionKind: 'none',
    normalization: 'l2',
    canonical: false,
    purpose: 'Legacy structural signature lane retained for compatibility and parity checks.',
    collection: 'codebase_chunks_768',
    notes: 'Compatibility lane. Preserve only until all callers are migrated.',
  },
} as const satisfies Record<string, LaneRegistryEntry>;

export type LaneRegistryKey = keyof typeof LANE_REGISTRY;

export function listLaneRegistryEntries(): LaneRegistryEntry[] {
  return Object.values(LANE_REGISTRY);
}

export function getLaneRegistryEntry(key: LaneRegistryKey): LaneRegistryEntry {
  return LANE_REGISTRY[key];
}

export function listLaneRegistryByRole(role: LaneRegistryRole): LaneRegistryEntry[] {
  return listLaneRegistryEntries().filter((entry) => entry.role === role);
}
