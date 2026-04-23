export {
  expandAstNeighborsViaGrpc,
  getClusterSummaryViaGrpc,
  getResearchContextViaGrpc,
  getTopologyContextViaGrpc,
  retrievalClient,
  searchChunksViaGrpc,
} from '../grpc/retrieval-client.js';

export type {
  AstEdge,
  AstExpansionResponse,
  AstNode,
  ClusterSummaryLookupResponse,
  ResearchContextChunk,
  ResearchContextResponse,
  RetrievedCodebaseChunk,
  SearchChunksResponse,
  TopologyContextResponse,
} from '../grpc/retrieval-client.js';
