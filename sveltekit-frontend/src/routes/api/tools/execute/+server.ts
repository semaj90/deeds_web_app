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
import { z } from 'zod';

const executeToolSchema = z.object({
  tool: z.string().min(1).max(200),
  args: z.unknown().optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const raw = await request.json();
    const parsed = executeToolSchema.safeParse(raw);
    if (!parsed.success) {
      return json({
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid input',
        available_tools: toolRegistry.list()
      }, { status: 400 });
    }

    // Execute tool
    const result = await toolRegistry.execute(parsed.data.tool, parsed.data.args);

    if (!result.success) {
      return json(result, { status: 400 });
    }

    return json(result);
  } catch (error) {
    console.error('[ACE Tools] Execution error:', error);
    return json({
      success: false,
      error: 'Tool execution failed',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  // Return list of available tools
  const tools = toolRegistry.list().map(name => {
    const tool = toolRegistry.get(name);
    return { name, description: tool?.description ?? '',
      permissions: tool?.permissions ?? []
    };
  });

  return json({ tools, total: tools.length,
    timestamp: new Date().toISOString()
  });
};



