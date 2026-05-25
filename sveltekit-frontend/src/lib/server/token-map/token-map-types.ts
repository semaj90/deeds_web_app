export type TokenMapFeature =
  | 'auth'
  | 'ace-cache'
  | 'qdrant-search'
  | 'postgres-atlas'
  | 'opencode-tools'
  | 'sse-chat'
  | 'bifrost-gemma4'
  | 'turbovec-rerank'
  | 'langgraph-dag'
  | 'nats-sidecars'
  | 'feature-mapreduce'
  | 'browser-cache'
  | string;

export interface TokenMapCard {
  id: string;
  chunkId: string;
  sourceRef: string;
  feature: TokenMapFeature;
  embeddingModel?: string;
  embeddingDimension?: number;
  quantizer?: string;
  rotationSeed?: string;
  turbovecRef?: string;
  tokenCost: number;
  compressedTokenCost: number;
  bpeWasteScore: number;
  summary: string;
  symbols: string[];
  envVars: string[];
  routes: string[];
  tables: string[];
  graphLinks: string[];
  qdrantPointId?: string;
  turbovecCode?: string;
  clusterId?: string;
  latent64Ref?: string;
  manifold4?: [number, number, number, number];
  compressionLoss?: number;
}

export type NesCartridgeState =
  | 'cache_hit'
  | 'atlas_lookup'
  | 'qdrant_hit'
  | 'graph_expand'
  | 'rerank'
  | 'synthesis';

export interface NesCartridge {
  cartridgeId: string;
  queryHash: string;
  state: NesCartridgeState;
  cards: TokenMapCard[];
  sourceRefs: string[];
  nextActions: string[];
  degraded: boolean;
}

export interface TokenMapPacket {
  query: string;
  feature: TokenMapFeature;
  cards: TokenMapCard[];
  cartridge: NesCartridge;
}
