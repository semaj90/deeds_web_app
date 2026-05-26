/**
 * Unified MCP Client
 * Routes requests to either local in-memory handlers or external HTTP MCP servers.
 */

import { callMcpTool, listMcpTools } from './mcp-internal.js';
import { callTraceMcp } from './trace-http.js';
import { getRedis } from '$lib/server/redis.js';

let isInitialized = false;

/**
 * Initialize the MCP Client.
 * Verifies cache health and checks connectivity to core MCP components.
 */
export async function initialize(): Promise<boolean> {
  if (isInitialized) return true;

  try {
    const redis = getRedis();
    const ping = await redis.ping().catch(() => 'FAIL');
    console.log(`[MCP Client] Redis check: ${ping}`);

    // Verify TRACE server is reachable
    const traceCheck = await callTraceMcp('trace.kag_search', { query: 'test health check check', limit: 1 })
      .catch((err) => ({ ok: false, error: err.message }));
    
    console.log(`[MCP Client] TRACE MCP status: ${traceCheck.ok ? 'ONLINE' : 'DEGRADED'}`);
    
    isInitialized = true;
    return true;
  } catch (error) {
    console.warn('[MCP Client] Initialization encountered errors:', error);
    // Degrade gracefully, do not throw
    isInitialized = true;
    return false;
  }
}

/**
 * List all available tools from local and external registrations.
 */
export async function list(): Promise<any[]> {
  await initialize();
  try {
    const localTools = await listMcpTools();
    // Wrap/format tools to unified MCP standard
    return localTools;
  } catch (error) {
    console.error('[MCP Client] Failed to list tools:', error);
    return [];
  }
}

/**
 * Call an MCP tool, routing by prefix to the appropriate backend.
 */
export async function call(name: string, args: Record<string, any> = {}): Promise<any> {
  await initialize();
  
  if (name.startsWith('trace.') || name.startsWith('graph.')) {
    const result = await callTraceMcp(name, args);
    if (!result.ok) {
      throw new Error(`MCP Client routing error: [${name}] failed - ${result.error || 'Unknown error'}`);
    }
    return result.data;
  }

  // Fallback to local in-memory tools
  return callMcpTool(name, args);
}
