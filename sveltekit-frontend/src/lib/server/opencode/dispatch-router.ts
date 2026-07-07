/**
 * OpenCode Dispatch Router — Phase 1
 *
 * Routes validated dispatch requests to appropriate execution lanes:
 * - search_rg: ripgrep lexical search
 * - query_qdrant: vector semantic search
 * - search_codebase: AST-aware structural search
 * - plan: multi-step task planning
 * - auto: dispatcher decides
 */

import type { RequestHandler } from '@sveltejs/kit';

export interface DispatchContext {
  intent: string;
  action: 'search_rg' | 'query_qdrant' | 'search_codebase' | 'auto' | 'plan';
  toolName?: string;
  context?: Record<string, unknown>;
}

export interface DispatchResult {
  lane: string;
  executionMethod: 'mcp_tool' | 'rpc_call' | 'langgraph_node' | 'stub';
  status: 'queued' | 'executing' | 'success' | 'failed' | 'partial';
  data?: unknown;
  error?: string;
  timing: {
    queuedAt: number;
    executedAt?: number;
    completedAt?: number;
  };
}

// ============================================================================
// LANE ROUTERS
// ============================================================================

/**
 * Route to ripgrep lexical search lane
 * Executes via MCP tool: trace.kag_search (text-based)
 */
export async function routeRgSearch(ctx: DispatchContext): Promise<DispatchResult> {
  return {
    lane: 'search_rg',
    executionMethod: 'mcp_tool',
    status: 'queued',
    timing: {
      queuedAt: Date.now()
    }
    // STUB: MCP tool invocation
  };
}

/**
 * Route to Qdrant vector semantic search lane
 * Executes via RPC: query Qdrant codebase_chunks_768 collection
 */
export async function routeQdrantSearch(ctx: DispatchContext): Promise<DispatchResult> {
  return {
    lane: 'query_qdrant',
    executionMethod: 'rpc_call',
    status: 'queued',
    timing: {
      queuedAt: Date.now()
    }
    // STUB: Qdrant query execution
  };
}

/**
 * Route to codebase AST-aware structural search lane
 * Executes via LangGraph node: ast_symbol_resolver
 */
export async function routeCodebaseSearch(ctx: DispatchContext): Promise<DispatchResult> {
  return {
    lane: 'search_codebase',
    executionMethod: 'langgraph_node',
    status: 'queued',
    timing: {
      queuedAt: Date.now()
    }
    // STUB: LangGraph AST node invocation
  };
}

/**
 * Route to planning lane
 * Decomposes complex intent into sub-tasks via Gemma4 plan synthesis
 */
export async function routePlanTask(ctx: DispatchContext): Promise<DispatchResult> {
  return {
    lane: 'plan',
    executionMethod: 'langgraph_node',
    status: 'queued',
    timing: {
      queuedAt: Date.now()
    }
    // STUB: LangGraph planner node invocation
  };
}

/**
 * Auto-decide which lane to use based on intent analysis
 * Fallback: dispatch to auto-router in LangGraph dispatcher (Stage A0)
 */
export async function routeAuto(ctx: DispatchContext): Promise<DispatchResult> {
  return {
    lane: 'auto',
    executionMethod: 'langgraph_node',
    status: 'queued',
    timing: {
      queuedAt: Date.now()
    }
    // STUB: LangGraph dispatcher auto-routing
  };
}

// ============================================================================
// MAIN DISPATCHER
// ============================================================================

export async function dispatchOpenCodeRequest(
  ctx: DispatchContext
): Promise<DispatchResult> {
  switch (ctx.action) {
    case 'search_rg':
      return routeRgSearch(ctx);
    case 'query_qdrant':
      return routeQdrantSearch(ctx);
    case 'search_codebase':
      return routeCodebaseSearch(ctx);
    case 'plan':
      return routePlanTask(ctx);
    case 'auto':
    default:
      return routeAuto(ctx);
  }
}

// ============================================================================
// PHASE 1 VALIDATION SCHEMA EXPORT
// ============================================================================

export { createValidationMiddleware } from './validation-schema';
export type { DispatcherParameter, DispatcherSchema } from './validation-schema';
