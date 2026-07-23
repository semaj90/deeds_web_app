/**
 * server-fastmcp.ts — FastMCP TypeScript codebase intelligence server
 *
 * Tools: topology_search · graph.expand_neighborhood · graph.shortest_path
 *        clusters.get_summary_lenses · clusters.som_cell_lookup · clusters.kmeans_members · trace.kag_search
 *
 * Run: npx tsx src/mcp/server-fastmcp.ts
 * Or:  npm run mcp:intel
 */

import { FastMCP } from 'fastmcp';
import { topologySearchTool }                              from './tools/topology-search.tool.js';
import { graphExpandNeighborhoodTool, graphShortestPathTool } from './tools/graph-analysis.tool.js';
import { clusterSummaryLensesTool, somCellLookupTool, kmeansClusterMembersTool } from './tools/cluster-lenses.tool.js';
import { traceKagSearchTool }                              from './tools/trace-kag.tool.js';
import {
  vaultSearchTool,
  vaultReadTool,
  vaultFollowLinksTool,
  vaultResolveEmbeddingTool,
  retrievalQdrantLookupTool,
  agentExplainClusterTool,
  agentProposeFixTool,
  hypergraphSearchByLaneTool,
} from './tools/vault-walker.tool.js';

const server = new FastMCP({
  name:    'deeds-codebase-intel',
  version: '1.0.0' as `${number}.${number}.${number}`,
});

// addTool individually — fastmcp v4 addTools[] infers a single Params type
// across the whole array which breaks for heterogeneous tool schemas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server.addTool as (t: any) => void)(topologySearchTool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server.addTool as (t: any) => void)(graphExpandNeighborhoodTool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server.addTool as (t: any) => void)(graphShortestPathTool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server.addTool as (t: any) => void)(clusterSummaryLensesTool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server.addTool as (t: any) => void)(somCellLookupTool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server.addTool as (t: any) => void)(kmeansClusterMembersTool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server.addTool as (t: any) => void)(traceKagSearchTool);

// Vault walker — 7 read-only tools over the Obsidian codebase vault
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server.addTool as (t: any) => void)(vaultSearchTool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server.addTool as (t: any) => void)(vaultReadTool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server.addTool as (t: any) => void)(vaultFollowLinksTool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server.addTool as (t: any) => void)(vaultResolveEmbeddingTool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server.addTool as (t: any) => void)(retrievalQdrantLookupTool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server.addTool as (t: any) => void)(agentExplainClusterTool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server.addTool as (t: any) => void)(agentProposeFixTool);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server.addTool as (t: any) => void)(hypergraphSearchByLaneTool);

server.start({ transportType: 'stdio' });
