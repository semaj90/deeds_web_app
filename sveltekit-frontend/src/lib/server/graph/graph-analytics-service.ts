/**
 * graph-analytics-service.ts — canonical GraphAnalyticsPort implementation.
 *
 * Single orchestration surface for Neo4j GDS projection lifecycle, PageRank,
 * top-authority reads, and bounded neighborhood expansion. Everything else
 * that touches these concerns (MCP tools, retrieval adapters, legacy
 * neo4j-gds.ts wrappers) should call through this port rather than
 * reimplementing the Cypher.
 */
import {
  PROJECTION_NAME as DEFAULT_PROJECTION_NAME,
  ensureProjectionClient,
  runPageRankClient,
  getTopPageRankClient,
  expandGraphClient,
  type ProjectionResult,
  type PageRankMutateResult,
  type AuthorityNodeClient,
  type ExpandGraphNodeClient,
} from './neo4j-gds-client.js';

export interface GraphProjectionRequest {
  /** Defaults to the shared 'codeTopology' projection when omitted. */
  projectionName?: string;
  force?: boolean;
}

export interface PageRankRequest {
  projectionName?: string;
  maxIterations?: number;
  dampingFactor?: number;
  mutateProperty?: string;
}

export interface PageRankQuery {
  limit: number;
  nodeType?: string;
  scoreProperty?: string;
}

export interface GraphExpansionRequest {
  stableKey: string;
  maxDepth?: number;
  limit?: number;
}

export interface GraphAnalyticsPort {
  ensureProjection(input?: GraphProjectionRequest): Promise<ProjectionResult>;
  runPageRank(input?: PageRankRequest): Promise<PageRankMutateResult>;
  getTopPageRank(input: PageRankQuery): Promise<AuthorityNodeClient[]>;
  expandGraph(input: GraphExpansionRequest): Promise<{ nodes: ExpandGraphNodeClient[]; apocUsed: boolean }>;
}

class Neo4jGraphAnalyticsService implements GraphAnalyticsPort {
  async ensureProjection(input: GraphProjectionRequest = {}): Promise<ProjectionResult> {
    return ensureProjectionClient(input.projectionName ?? DEFAULT_PROJECTION_NAME, input.force ?? false);
  }

  async runPageRank(input: PageRankRequest = {}): Promise<PageRankMutateResult> {
    return runPageRankClient(input.projectionName ?? DEFAULT_PROJECTION_NAME, {
      maxIterations: input.maxIterations,
      dampingFactor: input.dampingFactor,
      mutateProperty: input.mutateProperty,
    });
  }

  async getTopPageRank(input: PageRankQuery): Promise<AuthorityNodeClient[]> {
    return getTopPageRankClient(input.limit, input.nodeType, input.scoreProperty ?? 'graphPageRank');
  }

  async expandGraph(
    input: GraphExpansionRequest,
  ): Promise<{ nodes: ExpandGraphNodeClient[]; apocUsed: boolean }> {
    return expandGraphClient(input.stableKey, input.maxDepth ?? 3, input.limit ?? 100);
  }
}

let cachedService: Neo4jGraphAnalyticsService | null = null;

export function getGraphAnalyticsService(): GraphAnalyticsPort {
  if (!cachedService) cachedService = new Neo4jGraphAnalyticsService();
  return cachedService;
}
