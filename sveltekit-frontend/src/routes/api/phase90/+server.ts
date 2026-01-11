/**
 * Phase 90: RAG+KAG+DAG API Endpoint
 * ==================================
 * Exposes unified knowledge base tools via REST API
 */

import {
    executePhase90Tool,
    getPhase90ToolDefinitions,
    phase90_get_stats
} from '$lib/server/acp/phase90-tools';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET: List available tools or get stats
export const GET: RequestHandler = async ({ url }) => {
  const action = url.searchParams.get('action');

  try {
    if (action === 'stats') {
      const stats = await phase90_get_stats();
      return json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    }

    // Default: list tools
    const tools = getPhase90ToolDefinitions();
    return json({
      success: true,
      tools,
      count: tools.length,
      description: 'Phase 90 RAG+KAG+DAG Unified Knowledge Base',
      capabilities: { embeddings: 73313,
        clusters: 12,
        redisKeys: 113644,
        cudaEnabled: true
      }
    });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
};

// POST: Execute a tool
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { tool, params = {} } = body;

    if (!tool) {
      return json({
        success: false,
        error: 'Missing "tool" parameter'
      }, { status: 400 });
    }

    const result = await executePhase90Tool(tool, params);

    return json({
      success: true,
      tool,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
};


