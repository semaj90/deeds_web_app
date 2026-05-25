export type AceCartridge = {
  cartridgeId: string;
  queryHash: string;
  intent: 'failure' | 'code' | 'graph' | 'hybrid';
  clusterTags: string[];
  topoClass: string;
  sourceRefs: string[];
  rankedCards: unknown[];
  subgraph: { nodes: unknown[]; edges: unknown[] };
  failureHints: string[];
  nextActions: string[];
  ttlSeconds: number;
};
