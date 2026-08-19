export const graphTraversalDirections = ['outbound', 'inbound', 'both'] as const;
export type GraphTraversalDirection = (typeof graphTraversalDirections)[number];

export const atlasCandidateBuckets = [32, 64, 128, 256, 512] as const;
export type AtlasCandidateBucket = (typeof atlasCandidateBuckets)[number];

export interface GraphDeltaV1 {
  schema: 'atlas.graph-delta.v1';
  baseSnapshotId: string;
  workspaceRevision: number;
  sourceRevision: number;
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

export interface GraphProjectionReceiptV1 {
  schema: 'atlas.graph-projection-receipt.v1';
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

export interface GraphViewNodeV1 {
  id: string;
  type: string;
  label: string;
  packetKey: string | null;
  sourceRef: string | null;
  hop: number;
  properties: Record<string, unknown>;
}

export interface GraphViewEdgeV1 {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number;
  confidence: number;
  hop: number;
}

export interface GraphViewPacketV1 {
  schema: 'atlas.graph-view.v1';
  snapshotId: string;
  queryId: string;
  executor: 'postgres';
  nodes: GraphViewNodeV1[];
  edges: GraphViewEdgeV1[];
  truncated: boolean;
  maxHops: number;
  maxNodes: number;
}

export interface AtlasSynthesisRequestV1 {
  schema?: 'atlas.synthesis-request.v1';
  snapshotId: string;
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
  semanticCosine: number | null;
  lexicalScore: number | null;
  exactSymbolMatch: number;
  astMatch: number | null;
  personalizedPageRank: number | null;
  graphHopDistance: number;
  globalPageRank: number | null;
  typeCompatibility: number | null;
  revisionMatch: number;
  bitfrostHotness: number | null;
}

export interface ContextManifestV1 {
  schema: 'atlas.context-manifest.v1';
  requestId: string;
  snapshotId: string;
  query: string;
  candidateBucket: AtlasCandidateBucket;
  candidateCount: number;
  tokenBudget: number;
  selectedNodeKeys: string[];
  evidenceRefs: string[];
  producerRevision: string;
}

export function chooseCandidateBucket(candidateCount: number): AtlasCandidateBucket {
  const normalized = Math.max(1, Math.min(512, Math.ceil(candidateCount)));
  return atlasCandidateBuckets.find((bucket) => normalized <= bucket) ?? 512;
}
