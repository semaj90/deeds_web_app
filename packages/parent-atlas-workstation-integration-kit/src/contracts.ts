export type ProofState = 'PROVEN' | 'PARTIAL' | 'NOT_PROVEN' | 'FAILED' | 'SKIPPED';

export type RepresentationIdentity = {
  representationId: string;
  modelId: string;
  modelRevision: string;
  dimensions: number;
  normalization: 'none' | 'l2' | 'unit';
  tokenizerId?: string;
  runtime: 'onnx-cuda' | 'python-pytorch' | 'local-fallback' | 'other';
  fallback: boolean;
};

export type ProjectionIdentity = {
  workspaceRevision: string;
  sourceRevision: string;
  contentHash: string;
  schemaVersion: string;
  projectionRevision: string;
};

export type PacketProjectionRow = ProjectionIdentity & {
  packetId: string;
  packetKey: string | null;
  sourceRef: string | null;
  featureId: string | null;
  featureLabel: string | null;
  summary: string | null;
  tags: string[];
  conceptIds: string[];
  domainClass: string | null;
  artifactKind: string | null;
  qdrantPointId: string | null;
  qdrantCollection: string | null;
  neo4jNodeId: string | null;
  pagerank: number | null;
  communityId: number | null;
  updatedAt: string;
};

export type StageScore = {
  id: string;
  label: string;
  weight: number;
  achieved: number;
  state: ProofState;
  evidence: string[];
  blockers: string[];
};
