/**
 * OpenCode aggregator: query → HyperRAG → narrowed tools → replayTrace.
 * POST /api/opencode
 *
 * Flow:
 *   1. Extract query
 *   2. Call /api/tools/rpc-search for packet context
 *   3. Fetch TRACE MCP tool registry
 *   4. Narrow tools by feature_id match
 *   5. Assemble ACE/KAG/DAG replay trace
 *   6. Return {query, packets, tools, replayTrace, cache, provenance}
 */

import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { callTraceMcp } from '$lib/server/mcp/trace-http.js';
import { getRedis } from '$lib/server/redis.js';

const requestSchema = z.object({
  query: z.string().min(1),
  file_path: z.string().optional(),
  case_id: z.string().optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return error(401, 'Unauthorized');
  }

  try {
    const body = await request.json();
    const { query, file_path, case_id } = requestSchema.parse(body);
    const startMs = performance.now();

    // Stage 1: Call /api/tools/rpc-search
    const rpcRes = await fetch(new URL('/api/tools/rpc-search', request.url).href, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') || '',
      },
      body: JSON.stringify({ query, limit: 10 }),
    });

    if (!rpcRes.ok) {
      return error(rpcRes.status, 'RPC search failed');
    }

    const { packets, cached: rpcCached } = await rpcRes.json();
    const featureIds = [...new Set(packets.map((p: any) => p.feature_id))];

    // Stage 2: Fetch TRACE MCP tools
    let allTools: any[] = [];
    try {
      const toolRes = await callTraceMcp('tools/list', {});
      allTools = toolRes.tools || [];
    } catch (e) {
      console.warn('[opencode] MCP tools/list failed, falling back to empty');
    }

    // Stage 3: Narrow tools by feature_id
    const narrowedTools = allTools.filter((tool) => {
      const toolFeatures = tool.metadata?.features || [];
      return featureIds.some((fid: string) => toolFeatures.includes(fid));
    });

    // Stage 4: Assemble replay trace
    const replayTrace = {
      query,
      queryHash: Buffer.from(query).toString('base64').slice(0, 16),
      timestamp: Date.now(),
      userId: locals.user.id,
      filePath: file_path,
      caseId: case_id,
      packets: packets.slice(0, 5),
      featureIds,
      toolCount: narrowedTools.length,
      cacheHits: {
        rpc: rpcCached,
      },
    };

    // Stage 5: Return context pack
    return json({
      query,
      packets: packets.slice(0, 10),
      tools: narrowedTools.slice(0, 20),
      replayTrace,
      cache: {
        rpcHit: rpcCached,
        bitfrostHit: false,
        qdrantHit: true,
        graphHit: false,
      },
      provenance: {
        packetKeys: packets.map((p: any) => p.packet_key),
        sourceRefs: featureIds,
        featureIds,
        qdrantPointIds: packets.map((p: any) => p.qdrant_id || null),
      },
      latencyMs: performance.now() - startMs,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return error(400, 'Invalid request');
    }
    console.error('[opencode]', err);
    return error(500, 'Internal error');
  }
};
