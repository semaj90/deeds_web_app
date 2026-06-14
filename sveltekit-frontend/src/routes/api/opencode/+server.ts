/**
 * OpenCode aggregator: query → HyperRAG → narrowed tools.
 * POST /api/opencode
 */

import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';

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

    // Call /api/tools/rpc-search
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
    const featureIds = [...new Set((packets as any[]).map((p) => p.feature_id))];

    // Mock tool list
    const narrowedTools = [
      { name: 'auth.validate', metadata: { features: ['auth.sessions', 'auth.validation'] } },
      { name: 'db.query', metadata: { features: ['auth.validation'] } },
      { name: 'code.search', metadata: { features: ['any'] } },
    ];

    const replayTrace = {
      query,
      queryHash: Buffer.from(query).toString('base64').slice(0, 16),
      timestamp: Date.now(),
      userId: locals.user.id,
      filePath: file_path,
      caseId: case_id,
      packets: (packets as any[]).slice(0, 5),
      featureIds,
      toolCount: narrowedTools.length,
      cacheHits: { rpc: rpcCached },
    };

    return json({
      query,
      packets: packets as any[],
      tools: narrowedTools,
      replayTrace,
      cache: {
        rpcHit: rpcCached,
        bitfrostHit: false,
        qdrantHit: true,
        graphHit: false,
      },
      provenance: {
        packetKeys: (packets as any[]).map((p) => p.packet_key),
        sourceRefs: featureIds,
        featureIds,
        qdrantPointIds: (packets as any[]).map((p) => p.qdrant_id || null),
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
