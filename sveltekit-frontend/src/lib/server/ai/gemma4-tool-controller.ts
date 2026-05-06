/**
 * Gemma4 MCP Tool-Call Controller — Step 5 (TRACE/Karpathy plan).
 *
 * Routes Gemma4 tool calls through trace-mcp-server.ts (:8788) for
 * read-only graph/search/context operations. Falls back to in-process
 * dispatch when the standalone server is unavailable.
 *
 * Policy:
 *   - maxToolRounds:      3
 *   - maxToolResultChars: 12,000
 *   - Allowlisted tools only — no write/mutation tools exposed
 *   - Stops on repeated identical tool call (dedup guard)
 *   - Stops (records stuck) on 2× error from same tool
 *   - Prior answers compressed to HCA 128-token card before injection
 *
 * MCP tool surface (read-only):
 *   trace-mcp-server.ts :8788 — trace.kag_search, trace.explain_retrieval,
 *     graph.expand_neighborhood, graph.shortest_path, graph.community_for_node,
 *     graph.pagerank_top, topology.search_near, topology.same_som_cluster,
 *     clusters.get_members, clusters.get_summary_lenses
 *   in-process fallback — search.hybrid, search.dev_context, search.postgres_fts,
 *     search.qdrant_topology, topology.route_query, context.build_kv_packet,
 *     context.get_compressed_card, context.explain_compression, workspace.timeline
 *
 * Blocked (never dispatched):
 *   qdrant.upsert, neo4j.write, redis.set, delete, migration,
 *   package install, arbitrary shell, code patching, database mutation
 */

import { TOOL_DISPATCH, type MCPToolResult } from './mcp-tool-dispatch.js';
import { compressToHCACard, hcaCardToContextSnippet, type HCACard } from './hca-compressor.js';
import { recordAgentAction } from '$lib/server/trace/trace-collector.js';
import { createHash } from 'crypto';

// ── Allowlist ─────────────────────────────────────────────────────────────────

export const ALLOWED_MCP_TOOLS = new Set([
  // trace-mcp-server.ts :8788 — graph / topology / cluster / trace tools
  'trace.kag_search',
  'trace.explain_retrieval',
  'graph.expand_neighborhood',
  'graph.shortest_path',
  'graph.community_for_node',
  'graph.pagerank_top',
  'topology.search_near',
  'topology.same_som_cluster',
  'clusters.get_members',
  'clusters.get_summary_lenses',
  // in-process fallback via TOOL_DISPATCH (mcp-tool-dispatch.ts)
  'search.hybrid',
  'search.dev_context',
  'search.postgres_fts',
  'search.qdrant_topology',
  'topology.route_query',
  'context.build_kv_packet',
  'context.get_compressed_card',
  'context.explain_compression',
  'workspace.timeline',
]);

/** Pattern-based blocklist — matched against tool names AND arguments */
const BLOCKED_PATTERNS = [
  /upsert/i, /\.write/i, /redis\.set/i, /delete/i, /migration/i,
  /install/i, /shell/i, /patch/i, /mutation/i, /drop/i, /truncate/i,
];

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_TOOL_ROUNDS     = 3;
const MAX_TOOL_RESULT_CHARS = 12_000;
const MCP_SERVER_URL      = 'http://localhost:8788';
const MCP_TIMEOUT_MS      = 8_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToolCallRecord {
  toolName: string;
  args:     Record<string, unknown>;
  result:   string;      // truncated JSON
  durationMs: number;
  fromServer: boolean;   // true = HTTP :8788, false = in-process fallback
  error?:     string;
}

export interface ToolLoopOutput {
  answer:              string;
  toolsUsed:           string[];
  toolRounds:          number;
  toolResultChars:     number;
  stuckTool?:          string;      // set if loop stopped due to repeated errors
  priorAnswerKey?:     string;      // set if a prior-answer HCA card was injected
  priorAnswerCard?:    HCACard;
  mcpPort:             number;
  // Step 5B — populated when devContextMeta is supplied to runGemma4ToolLoop
  selectedStableKeys?: string[];
  selectedFiles?:      string[];
  contextHitCount?:    number;
  kvPacketTaskId?:     string;
  stablePrefixHash?:   string;
}

/** Minimal dev context metadata passed from dev-context-planner into the loop. */
export interface DevContextPlanMeta {
  contextSummary?:     string;
  selectedStableKeys?: string[];
  selectedFiles?:      string[];
  contextHitCount?:    number;
  kvPacketTaskId?:     string;
  stablePrefixHash?:   string;
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateToolName(name: string): { valid: boolean; reason?: string } {
  if (!ALLOWED_MCP_TOOLS.has(name)) {
    return { valid: false, reason: `Tool '${name}' is not in the MCP read-only allowlist` };
  }
  for (const pat of BLOCKED_PATTERNS) {
    if (pat.test(name)) {
      return { valid: false, reason: `Tool '${name}' matches blocked pattern ${pat}` };
    }
  }
  return { valid: true };
}

// ── Result truncation ─────────────────────────────────────────────────────────

export function truncateToolResult(result: unknown, maxChars = MAX_TOOL_RESULT_CHARS): string {
  const json = JSON.stringify(result, null, 0);
  if (json.length <= maxChars) return json;
  return json.slice(0, maxChars - 20) + '…[truncated]';
}

// ── Tool result message builder ───────────────────────────────────────────────

export function buildToolResultMessage(
  toolCall: { name: string; arguments: Record<string, unknown> },
  result:   string,
): { role: 'tool'; content: string; name: string } {
  return { role: 'tool', content: result, name: toolCall.name };
}

// ── MCP HTTP dispatch (tries :8788, falls back to in-process) ─────────────────

async function dispatchViaHTTP(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult | null> {
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), MCP_TIMEOUT_MS);
    const res  = await fetch(`${MCP_SERVER_URL}/tools/${encodeURIComponent(toolName)}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(args),
      signal:  ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return null;
    return await res.json() as MCPToolResult;
  } catch {
    return null; // server not running — fall through to in-process
  }
}

export async function dispatchToolCall(
  toolName: string,
  args:     Record<string, unknown>,
): Promise<{ result: MCPToolResult; fromServer: boolean }> {
  const validation = validateToolName(toolName);
  if (!validation.valid) {
    return {
      result:     { tool: toolName, success: false, data: null, error: validation.reason },
      fromServer: false,
    };
  }

  // Try HTTP server first
  const httpResult = await dispatchViaHTTP(toolName, args);
  if (httpResult) return { result: httpResult, fromServer: true };

  // In-process fallback
  const handler = TOOL_DISPATCH[toolName];
  if (!handler) {
    return {
      result:     { tool: toolName, success: false, data: null, error: `No handler for ${toolName}` },
      fromServer: false,
    };
  }
  const result = await handler(args);
  return { result, fromServer: false };
}

// ── Call hash for dedup detection ────────────────────────────────────────────

function callHash(toolName: string, args: Record<string, unknown>): string {
  return createHash('sha1').update(toolName + ':' + JSON.stringify(args)).digest('hex').slice(0, 12);
}

// ── Main tool loop ────────────────────────────────────────────────────────────

export interface ToolLoopMessage {
  role:        'system' | 'user' | 'assistant' | 'tool';
  content:     string;
  name?:       string;
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
}

export interface RunToolLoopInput {
  messages:         ToolLoopMessage[];
  priorAnswerText?: string;   // raw prior-answer to compress to HCA card
  priorAnswerKey?:  string;   // 'query:{sha1}'
  sessionId?:       string;
  userId?:          string;
  /** Step 5B: pre-built dev context plan metadata to inject + surface in output */
  devContextMeta?:  DevContextPlanMeta;
  /** Callback: given current messages, returns model response with possible tool_calls */
  callModel: (msgs: ToolLoopMessage[]) => Promise<{
    content:     string;
    tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
  }>;
}

export async function runGemma4ToolLoop(input: RunToolLoopInput): Promise<ToolLoopOutput> {
  const {
    priorAnswerText,
    priorAnswerKey,
    sessionId,
    userId,
    devContextMeta,
    callModel,
  } = input;

  // ── Dev context summary injection (Step 5B) ───────────────────────────────
  let priorAnswerCard: HCACard | undefined;
  let messages = [...input.messages];

  if (devContextMeta?.contextSummary) {
    // Inject before the last user message so the model sees dev context first
    const lastUserIdx = messages.map(m => m.role).lastIndexOf('user');
    const insertAt = lastUserIdx >= 0 ? lastUserIdx : messages.length;
    messages = [
      ...messages.slice(0, insertAt),
      { role: 'system', content: devContextMeta.contextSummary },
      ...messages.slice(insertAt),
    ];
  }

  if (priorAnswerText && priorAnswerKey) {
    priorAnswerCard = compressToHCACard(
      priorAnswerText,
      priorAnswerKey,
      'openai-facade',
      { type: 'prior-answer', ttl: '6h', embeddingQueued: true, fromRedis: true },
    );
    // Inject compact card before the last user message
    const lastUserIdx = messages.map(m => m.role).lastIndexOf('user');
    if (lastUserIdx >= 0) {
      messages = [
        ...messages.slice(0, lastUserIdx),
        {
          role:    'system',
          content: hcaCardToContextSnippet(priorAnswerCard),
        },
        ...messages.slice(lastUserIdx),
      ];
    }
  }

  // ── Loop state ────────────────────────────────────────────────────────────
  const toolRecords: ToolCallRecord[] = [];
  const seenCallHashes = new Set<string>();
  const errorCountByTool: Record<string, number> = {};
  let totalResultChars = 0;
  let stuckTool: string | undefined;
  let round = 0;
  let finalAnswer = '';

  for (round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callModel(messages);
    finalAnswer = response.content;

    if (!response.tool_calls?.length) break;

    // Process each tool call in this round
    const toolMessages: ToolLoopMessage[] = [];

    for (const tc of response.tool_calls) {
      const { name, arguments: args } = tc.function;
      const hash = callHash(name, args);

      // Dedup: stop if this exact call already seen
      if (seenCallHashes.has(hash)) {
        finalAnswer = `(Stopping: repeated identical tool call '${name}')`;
        stuckTool = name;
        break;
      }
      seenCallHashes.add(hash);

      const t0 = Date.now();
      const { result, fromServer } = await dispatchToolCall(name, args);
      const durationMs = Date.now() - t0;
      const resultStr  = truncateToolResult(result.data ?? result.error ?? '');
      totalResultChars += resultStr.length;

      // Track errors
      if (!result.success) {
        errorCountByTool[name] = (errorCountByTool[name] ?? 0) + 1;
        if (errorCountByTool[name] >= 2) {
          stuckTool = name;
        }
      }

      toolRecords.push({ toolName: name, args, result: resultStr, durationMs, fromServer, error: result.error });
      toolMessages.push(buildToolResultMessage({ name, arguments: args }, resultStr));

      // Fire-and-forget trace record
      recordAgentAction('mcp_tool', {
        sessionId,
        userId,
        toolName:      name,
        resultSummary: resultStr.slice(0, 200),
        resultCode:    result.success ? 0 : 1,
        durationMs,
      });
    }

    // Append model's assistant message + tool results
    messages = [
      ...messages,
      { role: 'assistant', content: finalAnswer, tool_calls: response.tool_calls },
      ...toolMessages,
    ];

    if (stuckTool) break;
  }

  // If the loop exhausted all MAX_TOOL_ROUNDS without the model giving a
  // prose answer (it kept returning tool_calls every round), make one final
  // forced call so the response is always prose, not a dangling tool request.
  if (!stuckTool && round >= MAX_TOOL_ROUNDS && toolRecords.length > 0) {
    try {
      const forced = await callModel(messages);
      finalAnswer = forced.content || finalAnswer;
    } catch { /* non-fatal — keep last content */ }
  }

  const toolsUsed = [...new Set(toolRecords.map(r => r.toolName))];

  return {
    answer:              finalAnswer,
    toolsUsed,
    toolRounds:          round,
    toolResultChars:     totalResultChars,
    stuckTool,
    priorAnswerKey,
    priorAnswerCard,
    mcpPort:             8788,
    // Step 5B — pass through pre-built dev context metadata unchanged
    selectedStableKeys:  devContextMeta?.selectedStableKeys,
    selectedFiles:       devContextMeta?.selectedFiles,
    contextHitCount:     devContextMeta?.contextHitCount,
    kvPacketTaskId:      devContextMeta?.kvPacketTaskId,
    stablePrefixHash:    devContextMeta?.stablePrefixHash,
  };
}
