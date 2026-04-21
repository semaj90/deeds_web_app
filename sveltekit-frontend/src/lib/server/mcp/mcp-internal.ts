/**
 * Internal MCP Bridge
 *
 * Provides an in-memory client for calling MCP tools from within
 * the SvelteKit server environment (Loaders, Actions, API routes).
 */

import { server, setupToolHandlers } from '../../../mcp/server.js';

// Ensure handlers are registered
setupToolHandlers();

/**
 * Call an MCP tool directly in-memory.
 *
 * @param name - The name of the tool (e.g. 'codebase:search')
 * @param args - The arguments for the tool
 * @returns The tool result content or throws an error
 */
export async function callMcpTool(name: string, args: Record<string, any> = {}) {
  try {
    const response = await (server as any).handleRequest({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    });

    if ('error' in response) {
      throw new Error(`MCP Tool Error [${name}]: ${response.error.message}`);
    }

    if ('result' in response) {
      return (response.result as any).content;
    }

    return null;
  } catch (err: any) {
    console.error(`[MCP Internal] Error calling ${name}:`, err);
    throw err;
  }
}

/**
 * List all available tools registered in the server.
 */
export async function listMcpTools() {
  const response = await (server as any).handleRequest({
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/list',
    params: {}
  });

  if ('result' in response) {
    return (response.result as any).tools;
  }
  return [];
}
