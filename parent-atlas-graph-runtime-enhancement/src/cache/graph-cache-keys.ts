export function graphCacheKey(a:{
  workspaceRevision:string;
  graphRevision:string;
  algorithmRevision:string;
  mode:string;
  queryHash:string;
}): string {
  return ['atlas','graph',a.workspaceRevision,a.graphRevision,a.algorithmRevision,a.mode,a.queryHash].join(':');
}
export const DEFAULT_GRAPH_CACHE_TTL_SECONDS = 300;
