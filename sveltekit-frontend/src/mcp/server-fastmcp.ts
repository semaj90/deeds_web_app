/**
 * server-fastmcp.ts — FastMCP TypeScript codebase intelligence server
 *
 * Tools: topology_search · graph.expand_neighborhood · graph.shortest_path
 *        clusters.get_summary_lenses · trace.kag_search
 *
 * Run: npx tsx src/mcp/server-fastmcp.ts
 * Or:  npm run mcp:intel
 */

import { FastMCP } from 'fastmcp';
import { topologySearchTool }                              from './tools/topology-search.tool.js';
import { graphExpandNeighborhoodTool, graphShortestPathTool } from './tools/graph-analysis.tool.js';
import { clusterSummaryLensesTool }                        from './tools/cluster-lenses.tool.js';
import { traceKagSearchTool }                              from './tools/trace-kag.tool.js';

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
(server.addTool as (t: any) => void)(traceKagSearchTool);

server.start({ transportType: 'stdio' });
