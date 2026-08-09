export interface AtlasCommunity {
  communityId: string;
  algorithm: 'louvain' | 'leiden';
  graphRevision: string;
  label: string;
  ontologyPath?: string;
  memberCount: number;
  representativeSymbols: string[];
  representativeFiles: string[];
  semanticCentroidRepresentationId?: string;
  pagerankMass: number;
}

export interface GraphTraversalFeatures {
  bfsHops?: number;
  weightedPathCost?: number;
  pagerankAuthority?: number;
  personalizedPagerank?: number;
  louvainCommunity?: string;
  leidenCommunity?: string;
  somCluster?: string;
  sameCommunity?: number;
  communityDistance?: number;
}
