/**
 * graph-retrieval-adapter.ts — bounded retrieval-facing facade over
 * GraphAnalyticsPort.
 *
 * Retrieval and MCP callers should go through this adapter, not
 * graph-analytics-service.ts directly — it enforces the bounds this
 * project's retrieval contract requires (no unbounded traversal, no
 * unbounded top-K) rather than trusting every caller to pass sane limits.
 */
import { getGraphAnalyticsService } from './graph-analytics-service.js';
import type { AuthorityNodeClient, ExpandGraphNodeClient } from './neo4j-gds-client.js';

const MAX_TOP_PAGERANK_LIMIT = 50;
const MAX_EXPAND_DEPTH = 3;
const MAX_EXPAND_LIMIT = 200;

/** Top-N nodes by PageRank, bounded to MAX_TOP_PAGERANK_LIMIT regardless of caller input. */
export async function getTopPageRankBounded(
  limit: number,
  nodeType?: string,
): Promise<AuthorityNodeClient[]> {
  const service = getGraphAnalyticsService();
  const boundedLimit = Math.max(1, Math.min(limit, MAX_TOP_PAGERANK_LIMIT));
  return service.getTopPageRank({ limit: boundedLimit, nodeType });
}

/**
 * Bounded k-hop neighborhood expansion — this is the "Neo4j one-hop or
 * two-hop bounded expansion" step in the semantic_768 → PageRank blend
 * pipeline. Never expands the whole graph.
 */
export async function expandGraphBounded(
  stableKey: string,
  maxDepth?: number,
  limit?: number,
): Promise<{ nodes: ExpandGraphNodeClient[]; apocUsed: boolean }> {
  const service = getGraphAnalyticsService();
  const boundedDepth = Math.max(1, Math.min(maxDepth ?? 2, MAX_EXPAND_DEPTH));
  const boundedLimit = Math.max(1, Math.min(limit ?? 50, MAX_EXPAND_LIMIT));
  return service.expandGraph({ stableKey, maxDepth: boundedDepth, limit: boundedLimit });
}
