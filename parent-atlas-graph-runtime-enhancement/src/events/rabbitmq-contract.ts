export const GRAPH_ANALYSIS_EXCHANGE = 'parent-atlas.graph-analysis.v1';
export const GRAPH_ANALYSIS_REQUEST_KEY = 'graph.analysis.request';
export const GRAPH_ANALYSIS_RESULT_KEY = 'graph.analysis.result';
export const GRAPH_ANALYSIS_DLQ_KEY = 'graph.analysis.dlq';

export interface GraphAnalysisRequest {
  jobId: string;
  workspaceRevision: string;
  graphRevision: string;
  algorithm: 'pagerank'|'personalized-pagerank'|'louvain'|'leiden'|'bfs'|'cugraph-parity'|'cuvs-parity';
  params: Record<string,unknown>;
  requestedAt: string;
}
export interface GraphAnalysisResult {
  jobId: string;
  workspaceRevision: string;
  graphRevision: string;
  algorithm: string;
  algorithmRevision: string;
  status: 'ok'|'partial'|'failed';
  metrics: Record<string,number|string|boolean>;
  completedAt: string;
}
