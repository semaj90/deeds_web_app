import Redis from 'ioredis';
import { ENV } from '../env.server.js';
import { tool_graph_expand_neighborhood, tool_search_hybrid } from './mcp-tool-dispatch.js';

const redis = new Redis(ENV.REDIS_URL || 'redis://127.0.0.1:6379');

export async function buildACEPacket(query: string, ctx: any) {
  // 1. Fetch Graph Traversal Data (Topology)
  const graphData = await tool_graph_expand_neighborhood({ maxHops: 1, limit: 10 });
  
  // Upgrade to Cluster Summaries (Phase 8C/9)
  // We prefer cluster summaries + top edges to save tokens and improve reasoning stability for Gemma4.
  // We keep raw nodes only as fallback/debug.
  let clusteredContext = null;
  if (graphData.success && graphData.data) {
    const rawNodes = graphData.data.nodes || [];
    const topEdges = graphData.data.edges || [];
    
    // Group raw nodes into conceptual cluster summaries
    const clusters = rawNodes.reduce((acc: any, node: any) => {
      const clusterId = node.clusterId || 'uncategorized';
      if (!acc[clusterId]) {
        acc[clusterId] = { id: clusterId, summary: `Cluster ${clusterId} covering ${node.label || 'entities'}` };
      }
      return acc;
    }, {});
    
    clusteredContext = {
      clusterSummaries: Object.values(clusters),
      topEdges,
      _debug_rawNodes: rawNodes // kept for fallback/debug only
    };
  }

  // 2. Fetch Dense Qdrant Vector Hits
  const qdrantHits = await tool_search_hybrid({ query });

  // 3. Extract recent Redis Failures for this execution trajectory
  const recentFailures = ctx.history ? ctx.history.slice(-3) : [];

  // Compress into the compact ACE Payload
  const packet = {
    metadata: {
      timestamp: Date.now(),
      intent: ctx.strategy || 'default'
    },
    context: {
      query,
      failures: recentFailures
    },
    graph: clusteredContext,
    vectors: qdrantHits.success ? qdrantHits.data : null
  };

  return JSON.stringify(packet);
}

export async function injectACETableCache(query: string, packetStr: string) {
  const runId = Buffer.from(query).toString('base64').substring(0, 16);
  // Hot cache with 1h TTL as specified in AGENTS.md
  await redis.set(`ace:packet:${runId}`, packetStr, 'EX', 3600);
  return runId;
}
