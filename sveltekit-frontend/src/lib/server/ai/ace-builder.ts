import { getValkeyClient } from '../cache/valkey-client.js';
import { tool_graph_expand_neighborhood, tool_search_hybrid } from './mcp-tool-dispatch.js';
import { buildKvContextPacket, formatKvPacketForPrompt } from './kv-context-controller.js';

const redis = getValkeyClient();

export async function buildACEPacket(query: string, ctx: any) {
  const taskId = ctx.taskId || ctx.runId || `ace-${Buffer.from(query).toString('base64').slice(0, 12)}`;

  // 1. Fetch Graph Traversal Data (Topology)
  const graphData = await tool_graph_expand_neighborhood({ maxHops: 1, limit: 10 });

  // Upgrade to Cluster Summaries (Phase 8C/9)
  // We prefer cluster summaries + top edges to save tokens and improve reasoning stability for Gemma4.
  // We keep raw nodes only as fallback/debug.
  let clusteredContext = null;
  if (graphData.success && graphData.data) {
    const rawNodes = (graphData.data as any).nodes || [];
    const topEdges = (graphData.data as any).edges || [];

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

  const hotFiles = Array.from(new Set([
    ...(Array.isArray(ctx.hotFiles) ? ctx.hotFiles : []),
    ...((Array.isArray((graphData.data as any)?.nodes) ? (graphData.data as any).nodes : [])
      .map((node: any) => node?.path ?? node?.sourceRef ?? node?.source_ref)
      .filter((value: unknown): value is string => typeof value === 'string')),
    ...((Array.isArray((qdrantHits as any)?.data) ? (qdrantHits as any).data : [])
      .map((hit: any) => hit?.path ?? hit?.sourceRef ?? hit?.source_ref)
      .filter((value: unknown): value is string => typeof value === 'string')),
  ])).slice(0, 8);

  const hotSymbols = Array.from(new Set([
    ...(Array.isArray(ctx.hotSymbols) ? ctx.hotSymbols : []),
    ...((Array.isArray((graphData.data as any)?.nodes) ? (graphData.data as any).nodes : [])
      .map((node: any) => node?.symbol ?? node?.label ?? node?.name)
      .filter((value: unknown): value is string => typeof value === 'string')),
  ])).slice(0, 12);

  const blockedAreas = Array.isArray(ctx.blockedAreas) ? ctx.blockedAreas : [];
  const kvPacket = await buildKvContextPacket({
    taskId,
    query,
    hotFiles,
    hotSymbols,
    blockedAreas,
  });
  const kvContextBlock = formatKvPacketForPrompt(kvPacket);

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
      taskId,
      failures: recentFailures
    },
    kvContext: {
      taskId: kvPacket.taskId,
      stablePrefixHash: kvPacket.stablePrefixHash,
      attentionToc: kvPacket.level3AttentionToc,
      compressed: kvPacket.level2Compressed,
      promptBlock: kvContextBlock,
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
