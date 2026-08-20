export type SourceRef = string;
export type SourceRevision = string;

export type ParseNodeId = string & { readonly __brand: 'ParseNodeId' };
export type SymbolId = string & { readonly __brand: 'SymbolId' };
export type SymbolVersionId = string & { readonly __brand: 'SymbolVersionId' };
export type ChunkId = string & { readonly __brand: 'ChunkId' };
export type PacketKey = string & { readonly __brand: 'PacketKey' };
export type ConceptId = string & { readonly __brand: 'ConceptId' };
export type TreeNodeId = string & { readonly __brand: 'TreeNodeId' };
export type GraphNodeKey = string & { readonly __brand: 'GraphNodeKey' };

export type GraphNodeKind =
  | 'DOCUMENT' | 'CHUNK' | 'SYMBOL' | 'SYMBOL_VERSION'
  | 'CONCEPT' | 'PROCESS' | 'PACKAGE' | 'TEST' | 'EXTERNAL_DOC';

export interface ParseNodeIdentityV1 {
  sourceRef: SourceRef;
  sourceRevision: SourceRevision;
  parseNodeId: ParseNodeId;
  language: string;
  nodeType: string;
  startByte: number;
  endByte: number;
  parserBackend: string;
  parserRevision: string;
  degraded: boolean;
}

export interface StableSymbolIdentityV1 {
  symbolId: SymbolId;
  namespace: string;
  qualifiedName: string;
  kind:
    | 'MODULE' | 'INTERFACE' | 'CLASS' | 'FUNCTION' | 'METHOD'
    | 'TYPE' | 'VARIABLE' | 'CONSTANT' | 'ENUM' | 'FIELD' | 'OTHER';
  identityRevision: string;
}

export interface SymbolVersionIdentityV1 {
  symbolVersionId: SymbolVersionId;
  symbolId: SymbolId;
  sourceRef: SourceRef;
  sourceRevision: SourceRevision;
  parseNodeId: ParseNodeId;
  startByte: number;
  endByte: number;
  contentHash: string;
}

export interface ChunkIdentityV1 {
  chunkId: ChunkId;
  packetKey?: PacketKey;
  sourceRef: SourceRef;
  sourceRevision: SourceRevision;
  parseNodeId?: ParseNodeId;
  startByte?: number;
  endByte?: number;
  chunkerRevision: string;
  contentHash: string;
}

export interface GraphNodeIdentityV1 {
  graphNodeKey: GraphNodeKey;
  nodeKind: GraphNodeKind;
  sourceRef?: SourceRef;
  sourceRevision?: SourceRevision;
  parseNodeId?: ParseNodeId;
  symbolId?: SymbolId;
  symbolVersionId?: SymbolVersionId;
  chunkId?: ChunkId;
  packetKey?: PacketKey;
  conceptId?: ConceptId;
  treeNodeId?: TreeNodeId; // projection-row identity only
}

export interface IdentityFieldInventoryRowV1 {
  table: string;
  field: string;
  owner: string;
  scope: string;
  revisionBound: boolean;
  stableAcrossRevision: boolean;
  derivedFrom: string[];
  uniqueConstraint?: string;
  foreignKeys: string[];
  writers: string[];
  readers: string[];
  fallbacks: string[];
}

export interface GraphIdentityAuditReceiptV1 {
  schemaVersion: 'atlas.graph-identity-audit.v1';
  runId: string;
  createdAt: string;
  workspaceRevision?: string;
  sourceRevisionSetHash?: string;

  counts: {
    treeNodes: number;
    canonicalDocuments: number;
    canonicalChunks: number;
    linkedPackets: number;
    orphanPackets: number;
    maxDepth: number;
  };

  collisions: {
    pageIndexPath: number;
    graphNodeKey: number;
    parseNodeId: number;
    symbolId: number;
    symbolVersionId: number;
  };

  gates: {
    packetTreeLineageProven: boolean;
    parseNodeIdentityProven: boolean;
    stableSymbolIdentityProven: boolean;
    symbolVersionIdentityProven: boolean;
    packetToSymbolLineageProven: boolean;
    parserManifestAlignmentProven: boolean;
    canonicalGraphSnapshotProven: boolean;
  };

  evidenceRefs: string[];
}
