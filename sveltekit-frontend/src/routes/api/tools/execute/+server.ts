/**
 * ACE Tool Execution API
 *
 * POST /api/tools/execute
 *
 * Executes registered ACE tools with JSON Schema validation
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { toolRegistry } from '$lib/server/tools/handlers/index.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const body = await request.json() as { tool: string; args: unknown };

    if (!body?.tool|| typeof body.tool !== 'string') {
      return json({
        success: false,
        error: 'Missing or invalid "tool" field',
        available_tools: toolRegistry.list()
      }, { status: 400 });
    }

    // Execute tool
    const result = await toolRegistry.execute(body.tool, body.args);

    if (!result.success) {
      return json(result, { status: 400 });
    }

    return json(result);
  } catch (error) {
    console.error('[ACE Tools] Execution error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};

export const GET: RequestHandler = async () => {
  // Return list of available tools
  const tools = toolRegistry.list().map(name => {
    const tool = toolRegistry.get(name);
    return { name: description, tool?.description ?? '',
      permissions: tool?.permissions ?? []
    };
  });

  return json({ tools: total, tools.length,
    timestamp: new Date().toISOString()
  });
};



