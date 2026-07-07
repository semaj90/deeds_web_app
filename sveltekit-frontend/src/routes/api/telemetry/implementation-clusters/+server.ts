import { json, type RequestHandler } from '@sveltejs/kit';
import { getRedis } from '$lib/server/redis.js';
import { aggregateMcpToolTelemetry } from '$lib/server/telemetry/mcp-tool-telemetry.js';

/**
 * Implementation Cluster Discovery API
 *
 * Aggregates telemetry from dispatcher nodes + MCP tools to surface the complete
 * feature implementation cluster: files + routes + tools + RPCs + tests + summaries
 * that together implement a feature.
 *
 * Query params:
 * - tool_name: filter by MCP tool (e.g., 'identity:recover')
 * - node_id: filter by dispatcher node (e.g., 'node_recover_identity')
 * - feature_id: filter by feature (e.g., 'auth.sessions')
 * - duration_ms_min: min execution time (ms)
 * - duration_ms_max: max execution time (ms)
 *
 * Returns:
 * {
 *   clusters: [
 *     {
 *       cluster_id: string (hash of tool_name + feature_id)
 *       tool_name: string
 *       node_id: string
 *       feature_id: string
 *       files: { path, type, last_modified }[]
 *       routes: { path, method, handler }[]
 *       tools: { name, params, returns }[]
 *       tests: { path, passing, total }[]
 *       summaries: { chunk_id, content, embedding }[]
 *       graph_neighbors: { packet_key, distance, type }[]
 *       metrics: {
 *         total_calls: number
 *         success_rate: number
 *         avg_duration_ms: number
 *         p50_duration_ms: number
 *         p95_duration_ms: number
 *         error_count: number
 *         last_error: string | null
 *       }
 *       confidence: number (0-1, based on data completeness)
 *     }
 *   ]
 *   summary: {
 *     total_clusters: number
 *     total_telemetry_events: number
 *     aggregated_at: ISO timestamp
 *   }
 * }
 */
export const GET: RequestHandler = async ({ url }) => {
  let redis = null;
  try {
    const toolName = url.searchParams.get('tool_name');
    const nodeId = url.searchParams.get('node_id');
    const featureId = url.searchParams.get('feature_id');
    const durationMin = parseInt(url.searchParams.get('duration_ms_min') || '0');
    const durationMax = parseInt(url.searchParams.get('duration_ms_max') || '999999');

    redis = getRedis();

    // Aggregate telemetry from Redis
    const telemetryAgg = await aggregateMcpToolTelemetry(redis);
    const clusters: any[] = [];
    let totalTelemetryEvents = 0;

    // Transform aggregated tool telemetry into cluster format
    for (const [toolName, toolMetrics] of Object.entries(telemetryAgg.tools || {})) {
      // Apply filters
      if (toolName && !toolName.includes(url.searchParams.get('tool_name') || '')) {
        continue;
      }
      if (toolMetrics.avg_duration_ms < durationMin || toolMetrics.avg_duration_ms > durationMax) {
        continue;
      }

      // Build cluster for this tool
      const cluster = {
        cluster_id: `${toolName}:${featureId || 'default'}`,
        tool_name: toolName,
        node_id: nodeId || `mcp:${toolName}`,
        feature_id: featureId || 'unknown',
        files: await getImplementationFiles(redis, toolName),
        routes: await getImplementationRoutes(redis, toolName),
        tools: [
          {
            name: toolName,
            params: ['args'],
            returns: 'ToolResult',
          },
        ],
        tests: await getImplementationTests(redis, toolName),
        summaries: [],
        graph_neighbors: [],
        metrics: {
          total_calls: toolMetrics.call_count,
          success_rate: toolMetrics.success_rate,
          avg_duration_ms: toolMetrics.avg_duration_ms,
          p50_duration_ms: toolMetrics.p50_duration_ms,
          p95_duration_ms: toolMetrics.p95_duration_ms,
          error_count: toolMetrics.error_count,
          last_error: toolMetrics.last_error || null,
        },
        confidence: computeClusterConfidence(toolMetrics),
      };

      clusters.push(cluster);
      totalTelemetryEvents += toolMetrics.call_count;
    }

    return json({
      clusters,
      summary: {
        total_clusters: clusters.length,
        total_telemetry_events: totalTelemetryEvents,
        aggregated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[implementation-clusters] Error:', message);
    return json(
      { error: message, clusters: [], summary: { total_clusters: 0, total_telemetry_events: 0 } },
      { status: 500 }
    );
  } finally {
    if (redis && redis.isOpen) {
      await redis.quit().catch(() => {
        // Ignore quit errors
      });
    }
  }
};

/**
 * Get implementation files for a tool from Redis cache
 * Format: toolImplementationFiles:{toolName} = JSON array
 */
async function getImplementationFiles(redis: any, toolName: string) {
  try {
    const cached = await redis.get(`toolImplementationFiles:${toolName}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn(`[implementation-clusters] Failed to get files for ${toolName}:`, err);
  }
  return [];
}

/**
 * Get implementation routes for a tool from Redis cache
 * Format: toolImplementationRoutes:{toolName} = JSON array
 */
async function getImplementationRoutes(redis: any, toolName: string) {
  try {
    const cached = await redis.get(`toolImplementationRoutes:${toolName}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn(`[implementation-clusters] Failed to get routes for ${toolName}:`, err);
  }
  return [];
}

/**
 * Get implementation tests for a tool from Redis cache
 * Format: toolImplementationTests:{toolName} = JSON array
 */
async function getImplementationTests(redis: any, toolName: string) {
  try {
    const cached = await redis.get(`toolImplementationTests:${toolName}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn(`[implementation-clusters] Failed to get tests for ${toolName}:`, err);
  }
  return [];
}

/**
 * Compute cluster confidence score (0-1) based on data completeness
 * Factors: call_count, success_rate, average duration consistency
 */
function computeClusterConfidence(metrics: any): number {
  let confidence = 0;

  // Call count factor (0-0.4)
  if (metrics.call_count >= 100) {
    confidence += 0.4;
  } else if (metrics.call_count >= 10) {
    confidence += 0.3;
  } else if (metrics.call_count > 0) {
    confidence += 0.1;
  }

  // Success rate factor (0-0.4)
  if (metrics.success_rate >= 0.95) {
    confidence += 0.4;
  } else if (metrics.success_rate >= 0.85) {
    confidence += 0.25;
  } else if (metrics.success_rate >= 0.5) {
    confidence += 0.1;
  }

  // Duration consistency factor (0-0.2)
  if (metrics.p95_duration_ms > 0 && metrics.p50_duration_ms > 0) {
    const ratio = metrics.p95_duration_ms / metrics.p50_duration_ms;
    if (ratio < 2) {
      confidence += 0.2;
    } else if (ratio < 3) {
      confidence += 0.1;
    }
  }

  return Math.min(confidence, 1.0);
}
