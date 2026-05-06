/**
 * Dev Context Planner — Step 5B (TRACE/Karpathy plan).
 *
 * Pre-loop planning pass: runs read-only MCP tools BEFORE the main
 * Gemma4 agent loop to build compressed dev context for coding /
 * debugging prompts.
 *
 * Tool preference order (coding prompts only):
 *   1. search.dev_context           — ACE codebase hits (always)
 *   2. trace.explain_retrieval      — only when confidence is low or >5 hits
 *   3. context.build_kv_packet      — when ≤8 hot files identified
 *
 * workspace.timeline is read-only (reads agent_actions).
 * Writes use recordAgentAction('plan'). TimelineEvent is returned in
 * DevContextPlan.timelineEvent for the Step 6 write-path.
 */

import { dispatchToolCall } from './gemma4-tool-controller.js';
import { buildKvContextPacket, getStablePrefixHash } from './kv-context-controller.js';
import { recordAgentAction } from '$lib/server/trace/trace-collector.js';
import type { MCPToolResult } from './mcp-tool-dispatch.js';
import { createHash } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DevContextHits {
  stableKeys:     string[];
  filePaths:      string[];
  hitCount:       number;
  confidence:     'high' | 'medium' | 'low';
  hasExplanation: boolean;
  sourceTypes:    string[];
}

export interface TimelineEvent {
  query:                  string;
  toolsUsed:              string[];
  selectedStableKeys:     string[];
  selectedFiles:          string[];
  priorAnswerKeyUsed:     boolean;
  explainRetrievalCalled: boolean;
  kvPacketBuilt:          boolean;
  timestamp:              string;
}

export interface DevContextPlan {
  isCodingPrompt:         boolean;
  selectedStableKeys:     string[];
  selectedFiles:          string[];
  contextHitCount:        number;
  contextSummary:         string;   // injected into prompt before agent loop
  explainRetrievalCalled: boolean;
  toolsUsed:              string[];
  kvPacketTaskId?:        string;
  stablePrefixHash?:      string;
  timelineEvent:          TimelineEvent;
}

// ── Coding prompt classifier ───────────────────────────────────────────────────

const CODING_KEYWORDS =
  /\b(error|fix|debug|implement|function|class|component|route|endpoint|schema|test|import|export|file|code|type|interface|hook|store|api|server|client|fetch|query|mutation|module|refactor|bug|crash|exception|throw|fail|broken|null|undefined|typescript|svelte|vitest|playwright|architecture)\b/i;

export function isCodingPrompt(query: string): boolean {
  return CODING_KEYWORDS.test(query);
}

// ── Hit extractor ─────────────────────────────────────────────────────────────

type RawHit = Record<string, unknown>;

export function extractDevContextHits(result: MCPToolResult): DevContextHits {
  if (!result.success || !Array.isArray(result.data)) {
    return {
      stableKeys: [], filePaths: [], hitCount: 0,
      confidence: 'low', hasExplanation: false, sourceTypes: [],
    };
  }

  const hits = result.data as RawHit[];
  const stableKeys  = hits.map(h => h.stable_key).filter((k): k is string => typeof k === 'string');
  const filePaths   = [...new Set(hits.map(h => h.file_path).filter((f): f is string => typeof f === 'string'))];
  const sourceTypes = [...new Set(hits.map(h => h.topo_class).filter((t): t is string => typeof t === 'string'))];
  const hasExplain  = hits.some(h => typeof h.explanation === 'string');

  const highScoreCount = hits.filter(h => typeof h.score === 'number' && (h.score as number) > 0.7).length;
  const confidence: DevContextHits['confidence'] =
    highScoreCount >= 2 ? 'high' :
    hits.length > 0     ? 'medium' :
                          'low';

  return { stableKeys, filePaths, hitCount: hits.length, confidence, hasExplanation: hasExplain, sourceTypes };
}

// ── Explanation threshold ──────────────────────────────────────────────────────

/**
 * Returns true when trace.explain_retrieval should be called to clarify
 * ambiguous search results: too many hits, low confidence, or mixed topo
 * source types indicate that the raw hit list alone is not reliable.
 */
export function needsExplanation(hits: DevContextHits): boolean {
  return hits.hitCount > 5 || hits.confidence === 'low' || hits.sourceTypes.length > 2;
}

// ── Context summary builder ────────────────────────────────────────────────────

function buildContextSummary(
  result:             MCPToolResult,
  hits:               DevContextHits,
  explanationSnippet: string,
): string {
  const hitLines = (Array.isArray(result.data) ? (result.data as RawHit[]) : [])
    .slice(0, 5)
    .map(h => `- ${String(h.file_path ?? '?')}: ${String(h.content ?? '').slice(0, 150)}`)
    .join('\n');

  return [
    `[Dev context — ${hits.hitCount} hits, confidence=${hits.confidence}]`,
    hitLines || '(no hits)',
    explanationSnippet,
  ].filter(Boolean).join('\n');
}

// ── Main planner ───────────────────────────────────────────────────────────────

export async function buildDevContextPlan(
  query: string,
  opts: {
    filePath?:       string;
    priorAnswerKey?: string;
    taskId?:         string;
    userId?:         string;
    sessionId?:      string;
  } = {},
): Promise<DevContextPlan> {
  const toolsUsed: string[] = [];
  let explainRetrievalCalled = false;
  let kvPacketTaskId:   string | undefined;
  let stablePrefixHash: string | undefined;

  const coding = isCodingPrompt(query);

  // ── Step 1: search.dev_context ────────────────────────────────────────────
  const { result: devCtxResult } = await dispatchToolCall('search.dev_context', {
    query,
    ...(opts.filePath ? { filePath: opts.filePath } : {}),
    limit: 8,
  });
  toolsUsed.push('search.dev_context');

  const hits = extractDevContextHits(devCtxResult);

  // ── Step 2: trace.explain_retrieval (conditional) ──────────────────────────
  let explanationSnippet = '';
  if (needsExplanation(hits)) {
    const qHash    = createHash('sha1').update(query).digest('hex').slice(0, 8);
    const traceKey = `ace:trace:q${qHash}`;
    const { result: explainResult } = await dispatchToolCall('trace.explain_retrieval', { traceKey });
    toolsUsed.push('trace.explain_retrieval');
    explainRetrievalCalled = true;

    if (explainResult.success && explainResult.data) {
      const d = explainResult.data as Record<string, unknown>;
      explanationSnippet = `[Retrieval: ${String(d.query ?? '').slice(0, 60)}, sources: ${JSON.stringify(d.sources ?? []).slice(0, 80)}]`;
    }
  }

  // ── Step 3: context.build_kv_packet (when ≤8 hot files identified) ─────────
  const shouldBuildPacket = hits.filePaths.length > 0 && hits.filePaths.length <= 8;
  if (shouldBuildPacket) {
    try {
      const taskId = opts.taskId ?? `dev-${createHash('sha1').update(query).digest('hex').slice(0, 8)}`;
      const packet = await buildKvContextPacket({
        taskId,
        query,
        hotFiles:   hits.filePaths,
        hotSymbols: [],
      });
      toolsUsed.push('context.build_kv_packet');
      kvPacketTaskId   = packet.taskId;
      stablePrefixHash = packet.stablePrefixHash;
    } catch { /* non-fatal — KV packet is a best-effort optimisation */ }
  }

  if (!stablePrefixHash) {
    stablePrefixHash = getStablePrefixHash();
  }

  // ── Build compressed context summary ──────────────────────────────────────
  const contextSummary = buildContextSummary(devCtxResult, hits, explanationSnippet);

  // ── Fire-and-forget plan action record ────────────────────────────────────
  recordAgentAction('plan', {
    sessionId: opts.sessionId,
    userId:    opts.userId,
    query,
    resultSummary: `dev_context:${hits.hitCount} hits confidence=${hits.confidence}`,
    metadata: {
      selectedStableKeys:  hits.stableKeys.slice(0, 5),
      selectedFiles:       hits.filePaths.slice(0, 5),
      toolsUsed,
      explainRetrievalCalled,
      isCodingPrompt: coding,
    },
  });

  const timelineEvent: TimelineEvent = {
    query,
    toolsUsed,
    selectedStableKeys:     hits.stableKeys.slice(0, 10),
    selectedFiles:          hits.filePaths.slice(0, 10),
    priorAnswerKeyUsed:     !!opts.priorAnswerKey,
    explainRetrievalCalled,
    kvPacketBuilt:          !!kvPacketTaskId,
    timestamp:              new Date().toISOString(),
  };

  return {
    isCodingPrompt:         coding,
    selectedStableKeys:     hits.stableKeys.slice(0, 10),
    selectedFiles:          hits.filePaths.slice(0, 10),
    contextHitCount:        hits.hitCount,
    contextSummary,
    explainRetrievalCalled,
    toolsUsed,
    kvPacketTaskId,
    stablePrefixHash,
    timelineEvent,
  };
}
