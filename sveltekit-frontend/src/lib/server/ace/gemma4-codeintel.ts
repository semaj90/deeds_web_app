/**
 * gemma4-codeintel.ts — Gemma4 prompt builder + LLM caller for CodeIntel ACE context.
 *
 * Consumes normalized AceCodeIntelContext shapes from codeintel-datastore.ts only.
 * Never reads raw DB/Qdrant data directly.
 *
 * Exports:
 *   buildGemma4AcePrompt(context, task?)  — deterministic prompt string
 *   callGemma4WithAceContext(...)         — calls Ollama, returns structured result
 *   generateFixRecommendationsFromAce(...)— targeted repair plan for Claude Code
 */

import { ENV } from '$lib/server/env.server.js';
import crypto from 'node:crypto';
import type { AceCodeIntelContext } from './codeintel-datastore.js';
import {
  assertDirectOllamaAllowed,
  bifrostChat,
  getChatModelKeepAlive,
  getOllamaRequestTimeoutMs,
  ollamaFetch,
} from '../ollama.js';
import { getOllamaEndpoint } from '../utils/ollama-endpoint.js';
import * as Hypergraph from '../ai/hypergraph-store.js';
import { retrievalClient } from '../grpc/retrieval-client.js';

const RUNTIME_CONTEXT_SIZE = Number(
  process.env.LLM_CONTEXT_SIZE ??
    process.env.TURBO_CTX_SIZE ??
    process.env.LLAMA_CTX_SIZE ??
    process.env.TURBO_CTX ??
    process.env.LLAMA_SERVER_CTX ??
    process.env.OLLAMA_CONTEXT_LENGTH ??
    65536
);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Gemma4AceOpts {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Force JSON response format */
  jsonMode?: boolean;
  /**
   * Override the system prompt entirely. When set, buildGemma4AcePrompt is not called.
   * Use this when you need a task-specific system prompt built on top of the ACE context.
   */
  systemPromptOverride?: string;
  /**
   * Ollama structured output schema (passed as `format` body field).
   * When set, jsonMode is implied true.
   */
  responseSchema?: Record<string, unknown>;
  lane?: string;
  taskType?: string;
  sessionId?: string;
  /** Use multi-step tool loop */
  useTools?: boolean;
}

export interface Gemma4AceResult {
  ok: boolean;
  text: string;
  parsed?: unknown;
  degraded: boolean;
  error?: string;
  latencyMs: number;
  model: string;
  toolCallsExecuted: number;
  toolCallNames: string[];
  stageTimings: Gemma4StageTimings;
}

export interface Gemma4AssistantTurnTiming {
  round: number;
  durationMs: number;
  toolCalls: number;
}

export interface Gemma4ToolTiming {
  round: number;
  toolName: string;
  durationMs: number;
}

export interface Gemma4StageTimings {
  totalMs: number;
  assistantTurns: Gemma4AssistantTurnTiming[];
  toolCalls: Gemma4ToolTiming[];
  finalAssistantMs: number;
}

export function createEmptyGemmaStageTimings(totalMs = 0): Gemma4StageTimings {
  return {
    totalMs,
    assistantTurns: [],
    toolCalls: [],
    finalAssistantMs: 0,
  };
}

export interface AceFixRecommendation {
  problem: string;
  likely_causes: string[];
  recommended_files: string[];
  recommended_actions: string[];
  safety_checks: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildGemma4AcePrompt(context: AceCodeIntelContext, task?: string): string {
  const sections: string[] = [];

  // 1. CLUSTER SUMMARIES (Highly Stable Prefix) ─────────────────────────────
  if (context.clusterContext.length > 0) {
    const clusterLines = context.clusterContext.map((c) => {
      const parts = [`  Cluster ${c.gpuCluster} — ${c.purpose ?? 'unknown purpose'}`];
      if (c.summary) parts.push(`  Summary: ${c.summary}`);
      if (c.patterns.length) parts.push(`  Patterns: ${c.patterns.join(', ')}`);
      if (c.warnings.length) parts.push(`  Warnings: ${c.warnings.join('; ')}`);
      if (c.tags.length) parts.push(`  Tags: ${c.tags.join(', ')}`);
      return parts.join('\n');
    });
    sections.push(
      `## CLUSTER REVIEWS (${context.clusterContext.length})\n${clusterLines.join('\n\n')}`
    );
  }

  // 2. RELEVANT CHUNKS ──────────────────────────────────────────────────────
  if (context.chunkContext.length > 0) {
    const chunkLines = context.chunkContext.map((c) => {
      const meta = [c.kind, c.domain, c.language].filter(Boolean).join(' | ');
      const tags = c.semanticTags.slice(0, 4).join(', ');
      const parts = [`  ${c.relativePath ?? c.chunkId} [${meta}]`];
      if (tags) parts.push(`  Tags: ${tags}`);
      if (c.summary) parts.push(`  Summary: ${c.summary.slice(0, 300)}`);
      return parts.join('\n');
    });
    sections.push(`## SOURCE CONTEXT (${context.chunkContext.length})\n${chunkLines.join('\n\n')}`);
  }

  // 3. RESEARCH CONTEXT (Lane 3) ────────────────────────────────────────────
  if (context.researchContext && context.researchContext.length > 0) {
    const researchLines = context.researchContext.map((r) => {
      const tags = r.semanticTags.slice(0, 4).join(', ');
      const parts = [`  [${r.source.toUpperCase()}] ${r.title}`];
      if (r.url) parts.push(`  Source: ${r.url}`);
      if (tags) parts.push(`  Tags: ${tags}`);
      parts.push(`  Content: ${r.body.slice(0, 800)}`);
      return parts.join('\n');
    });
    sections.push(
      `## RESEARCH INSIGHTS (${context.researchContext.length})\n${researchLines.join('\n\n')}`
    );
  }

  // 3. SYSTEM HEALTH ────────────────────────────────────────────────────────
  const h = context.health;
  const healthLines = [
    `  Status: ${h.ok ? 'ok' : 'degraded'}`,
    `  Index: ${h.chunkCount.toLocaleString()} chunks`,
  ];
  if (h.embeddingCoverage != null) {
    healthLines.push(`  Coverage: ${Math.round(h.embeddingCoverage * 100)}%`);
  }
  sections.push(`## SYSTEM STATUS\n${healthLines.join('\n')}`);

  // 4. QUERY (Volatile) ─────────────────────────────────────────────────────
  sections.push(`## USER QUERY\n${context.query}`);

  // 5. TASK ─────────────────────────────────────────────────────────────────
  if (task) sections.push(`## TASK INSTRUCTIONS\n${task}`);

  return sections.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM caller
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = ENV.OLLAMA_CHAT_MODEL ?? ENV.GEMMA4_MODEL;

export async function callGemma4WithAceContext(
  context: AceCodeIntelContext,
  userPrompt: string,
  opts: Gemma4AceOpts = {}
): Promise<Gemma4AceResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const requestTimeoutMs = getOllamaRequestTimeoutMs();
  const temperature = opts.temperature ?? 0.2;
  const maxTokens = opts.maxTokens ?? 1024;
  const jsonMode = opts.jsonMode ?? !!opts.responseSchema;
  const startMs = Date.now();

  if (
    context.degraded &&
    context.clusterContext.length === 0 &&
    context.chunkContext.length === 0
  ) {
    return {
      ok: false,
      text: '',
      degraded: true,
      error: 'No context available — all data sources degraded',
      latencyMs: Date.now() - startMs,
      model,
      toolCallsExecuted: 0,
      toolCallNames: [],
      stageTimings: createEmptyGemmaStageTimings(Date.now() - startMs),
    };
  }

  const systemPrompt = opts.systemPromptOverride?.trim()
    ? opts.systemPromptOverride
    : buildGemma4AcePrompt(context);

  const sessionId = opts.sessionId ?? crypto.randomUUID();
  const lane = opts.lane ?? 'interactive-agent';
  const taskType = opts.taskType ?? 'streaming-chat';

  if (lane === 'interactive-agent') {
    await Hypergraph.recordSessionStart({
      sessionId,
      lane: lane as any,
      taskType: taskType as any,
      startTime: Date.now(),
      metadata: { model, query: context.query },
    });
  }

  // Build the format field: prefer explicit schema, then json string, then omit
  const formatField = jsonMode ? 'json' : undefined;

  if (opts.useTools) {
    const toolResult = await callGemma4WithTools(systemPrompt, userPrompt, ACE_TOOLS, {
      model: opts.model,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      lane,
      taskType,
    });

    // Link chunks for tool loop as well
    if (lane === 'interactive-agent') {
      for (const chunk of context.chunkContext) {
        if (chunk.relativePath) {
          await Hypergraph.linkKnowledgeToSession(sessionId, chunk.relativePath, 1.0);
        }
      }
      for (const res of context.researchContext) {
        await Hypergraph.linkResearchToSession(sessionId, res.url, res.source, 1.0);
      }
      await Hypergraph.finalizeSession(sessionId, 'completed');
    }

    return {
      ok: toolResult.ok,
      text: toolResult.text,
      parsed: undefined, // caller will parse toolResult.text if jsonMode
      degraded: toolResult.degraded,
      error: toolResult.error,
      latencyMs: toolResult.latencyMs,
      model: toolResult.model,
      toolCallsExecuted: toolResult.toolCallsExecuted,
      toolCallNames: toolResult.toolCallNames,
      stageTimings: toolResult.stageTimings,
    };
  }

  // ── Route through bifrostChat for Hypergraph & Lane Support ────────────────
  try {
    const assistantStartedAt = Date.now();
    const content = formatField
      ? await (async () => {
          assertDirectOllamaAllowed(
            'ace/gemma4-codeintel',
            'json-schema',
            'Structured JSON schema format is required for this lane.'
          );
          const response = await ollamaFetch(`${getOllamaEndpoint()}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              stream: false,
              keep_alive: getChatModelKeepAlive(),
              format: formatField,
              options: {
                temperature,
                num_predict: maxTokens,
                num_ctx: RUNTIME_CONTEXT_SIZE,
                repeat_penalty: 1.05,
              },
            }),
            signal: AbortSignal.timeout(requestTimeoutMs),
          });

          if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`Ollama /api/chat failed: ${response.status} ${errText.slice(0, 200)}`);
          }

          const data = (await response.json()) as { message?: { content?: string } };
          return data.message?.content ?? '';
        })()
      : await bifrostChat(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          model,
          {
            temperature,
            maxTokens,
            lane: lane as any,
            taskType: taskType as any,
            sessionId,
            timeoutMs: requestTimeoutMs,
          }
        );
    const assistantDurationMs = Date.now() - assistantStartedAt;

    const text = typeof content === 'string' ? content : (content as { content: string }).content;

    // ── Link Consulted Chunks to Hypergraph ──
    if (lane === 'interactive-agent') {
      for (const chunk of context.chunkContext) {
        if (chunk.relativePath) {
          await Hypergraph.linkKnowledgeToSession(sessionId, chunk.relativePath, 1.0);
        }
      }
      for (const res of context.researchContext) {
        await Hypergraph.linkResearchToSession(sessionId, res.url, res.source, 1.0);
      }
      await Hypergraph.finalizeSession(sessionId, 'completed');
    }

    let parsed: unknown;
    if (jsonMode) {
      try {
        const cleaned = text
          .replace(/^```(?:json)?\n?/m, '')
          .replace(/\n?```$/m, '')
          .trim();
        parsed = JSON.parse(cleaned);
      } catch {
        // non-fatal — return text as-is
      }
    }

    return {
      ok: true,
      text,
      parsed,
      degraded: context.degraded,
      latencyMs: Date.now() - startMs,
      model,
      toolCallsExecuted: 0,
      toolCallNames: [],
      stageTimings: {
        totalMs: Date.now() - startMs,
        assistantTurns: [{ round: 1, durationMs: assistantDurationMs, toolCalls: 0 }],
        toolCalls: [],
        finalAssistantMs: assistantDurationMs,
      },
    };
  } catch (e: unknown) {
    return {
      ok: false,
      text: '',
      degraded: true,
      error: `LLM call failed: ${e instanceof Error ? e.message : String(e)}`,
      latencyMs: Date.now() - startMs,
      model,
      toolCallsExecuted: 0,
      toolCallNames: [],
      stageTimings: createEmptyGemmaStageTimings(Date.now() - startMs),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-step tool-calling loop  (uses /api/chat, NOT /api/generate)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A tool definition for Gemma 4 function calling.
 * `execute` is local-only — it is never sent to Ollama.
 */
export interface Gemma4Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface Gemma4ToolCallResult {
  ok: boolean;
  text: string;
  toolCallsExecuted: number;
  toolCallNames: string[];
  degraded: boolean;
  error?: string;
  latencyMs: number;
  model: string;
  stageTimings: Gemma4StageTimings;
}

const MAX_TOOL_ROUNDS = 5;

// ── Default Tools ────────────────────────────────────────────────────────────

/**
 * Standard gRPC tools for the Lane 1 agent loop.
 */
export const ACE_TOOLS: Gemma4Tool[] = [
  {
    name: 'search_codebase',
    description:
      'Search for codebase chunks using semantic vector search. Returns code snippets and metadata.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query (e.g. "auth middleware logic")' },
        limit: { type: 'integer', description: 'Max results to return (default 5)' },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const results = await retrievalClient.searchChunks(
        String(args.query),
        Number(args.limit ?? 5)
      );
      return JSON.stringify(results.results);
    },
  },
  {
    name: 'get_cluster_summary',
    description: 'Fetch the narrative summary and patterns for a GPU/SOM cluster.',
    parameters: {
      type: 'object',
      properties: {
        cluster_id: { type: 'integer', description: 'The ID of the cluster' },
        cluster_type: {
          type: 'string',
          enum: ['gpu', 'som'],
          description: 'Type of cluster (default gpu)',
        },
      },
      required: ['cluster_id'],
    },
    execute: async (args) => {
      const result = await retrievalClient.getClusterSummary(
        Number(args.cluster_id),
        (args.cluster_type as any) ?? 'gpu'
      );
      return JSON.stringify(result);
    },
  },
  {
    name: 'expand_ast',
    description: 'Find 1-hop AST neighbors (callers, callees, types) for a symbol or file.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name (e.g. "UserStore")' },
        file_path: { type: 'string', description: 'Relative path to file' },
      },
    },
    execute: async (args) => {
      const result = await retrievalClient.expandAstNeighbors(
        String(args.symbol ?? ''),
        String(args.file_path ?? '')
      );
      return JSON.stringify(result);
    },
  },
  {
    name: 'get_topology_context',
    description: 'Get code neighbors based on SOM (Self-Organizing Map) topology.',
    parameters: {
      type: 'object',
      properties: {
        bmu_row: { type: 'integer', description: 'Best Matching Unit row' },
        bmu_col: { type: 'integer', description: 'Best Matching Unit column' },
        radius: { type: 'integer', description: 'Neighborhood radius (default 1)' },
      },
      required: ['bmu_row', 'bmu_col'],
    },
    execute: async (args) => {
      const result = await retrievalClient.getTopologyContext(
        Number(args.bmu_row),
        Number(args.bmu_col),
        Number(args.radius ?? 1)
      );
      return JSON.stringify(result);
    },
  },
];

type OllamaMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
  tool_name?: string;
};

/**
 * Multi-step Gemma 4 tool-calling loop via Ollama /api/chat.
 *
 * Loop:
 *   1. Send messages + tool definitions to Ollama.
 *   2. If response has tool_calls → execute each tool locally.
 *   3. Append tool results as { role: 'tool' } messages.
 *   4. Repeat until no tool_calls or MAX_TOOL_ROUNDS reached.
 *   5. Return the final assistant text.
 *
 * Usage:
 *   const result = await callGemma4WithTools(systemPrompt, userMessage, [
 *     { name: 'get_cluster', description: '...', parameters: {...}, execute: async (args) => '...' },
 *   ]);
 */
export async function callGemma4WithTools(
  systemPrompt: string,
  userMessage: string,
  tools: Gemma4Tool[],
  opts: Pick<Gemma4AceOpts, 'model' | 'temperature' | 'maxTokens' | 'lane' | 'taskType'> = {}
): Promise<Gemma4ToolCallResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const requestTimeoutMs = getOllamaRequestTimeoutMs();
  const temperature = opts.temperature ?? 0.2;
  const maxTokens = opts.maxTokens ?? 1024;
  const startMs = Date.now();
  const keepAlive = getChatModelKeepAlive();

  // Ollama tool definitions — executor stripped (local-only)
  const ollamaTools = tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const executorMap = new Map(tools.map((t) => [t.name, t.execute]));

  const messages: OllamaMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  let toolCallsExecuted = 0;
  const toolCallNames: string[] = [];
  const assistantTurns: Gemma4AssistantTurnTiming[] = [];
  const toolCallTimings: Gemma4ToolTiming[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      assertDirectOllamaAllowed(
        'ace/gemma4-codeintel',
        'tool-calls',
        'Native tool-calling loop requires direct /api/chat tools payload.'
      );
      const assistantStartedAt = Date.now();
      const response = await ollamaFetch(`${getOllamaEndpoint()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          tools: ollamaTools,
          stream: false,
          keep_alive: keepAlive,
          options: {
            temperature,
            num_predict: maxTokens,
            num_ctx: RUNTIME_CONTEXT_SIZE,
            repeat_penalty: 1.05,
          },
        }),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Ollama /api/chat failed: ${response.status} ${errText.slice(0, 200)}`);
      }

      const data = (await response.json()) as {
        message?: {
          content?: string;
          tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
        };
      };
      const assistantDurationMs = Date.now() - assistantStartedAt;
      const emittedToolCalls = data.message?.tool_calls?.length ?? 0;
      assistantTurns.push({
        round: round + 1,
        durationMs: assistantDurationMs,
        toolCalls: emittedToolCalls,
      });

      const msg: OllamaMessage = data.message
        ? {
            role: 'assistant',
            content: data.message.content ?? '',
            tool_calls: data.message.tool_calls,
          }
        : { role: 'assistant', content: '' };

      messages.push(msg); // append assistant turn

      // No tool calls → final answer ready
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return {
          ok: true,
          text: msg.content.trim(),
          toolCallsExecuted,
          toolCallNames,
          degraded: false,
          latencyMs: Date.now() - startMs,
          model,
          stageTimings: {
            totalMs: Date.now() - startMs,
            assistantTurns,
            toolCalls: toolCallTimings,
            finalAssistantMs: assistantDurationMs,
          },
        };
      }

      // Execute each tool call and feed results back
      for (const tc of msg.tool_calls) {
        const { name, arguments: args } = tc.function;
        const executor = executorMap.get(name);
        let result: string;
        const toolStartedAt = Date.now();
        if (executor) {
          try {
            result = await executor(args);
          } catch (err) {
            result = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
        } else {
          result = `Error: unknown tool "${name}"`;
        }
        messages.push({ role: 'tool', content: result, tool_name: name });
        toolCallsExecuted++;
        toolCallNames.push(name);
        toolCallTimings.push({
          round: round + 1,
          toolName: name,
          durationMs: Date.now() - toolStartedAt,
        });
      }
    }

    // Exceeded MAX_TOOL_ROUNDS — return last assistant content
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    return {
      ok: false,
      text: last?.content ?? '',
      toolCallsExecuted,
      toolCallNames,
      degraded: true,
      error: `Exceeded max tool rounds (${MAX_TOOL_ROUNDS})`,
      latencyMs: Date.now() - startMs,
      model,
      stageTimings: {
        totalMs: Date.now() - startMs,
        assistantTurns,
        toolCalls: toolCallTimings,
        finalAssistantMs: assistantTurns.at(-1)?.durationMs ?? 0,
      },
    };
  } catch (e: unknown) {
    return {
      ok: false,
      text: '',
      toolCallsExecuted,
      toolCallNames,
      degraded: true,
      error: `Tool loop failed: ${e instanceof Error ? e.message : String(e)}`,
      latencyMs: Date.now() - startMs,
      model,
      stageTimings: {
        totalMs: Date.now() - startMs,
        assistantTurns,
        toolCalls: toolCallTimings,
        finalAssistantMs: assistantTurns.at(-1)?.durationMs ?? 0,
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fix recommendation generator — optimized for Claude Code consumption
// ─────────────────────────────────────────────────────────────────────────────

const FIX_SYSTEM =
  'You are a code-repair assistant. Using the codebase context provided, diagnose the failing area and output ONLY valid JSON matching this exact schema:\n' +
  '{\n' +
  '  "problem": "one-sentence description",\n' +
  '  "likely_causes": ["cause1", "cause2"],\n' +
  '  "recommended_files": ["path/to/file.ts"],\n' +
  '  "recommended_actions": ["action1", "action2"],\n' +
  '  "safety_checks": ["check1", "check2"]\n' +
  '}\n' +
  'Do NOT include any text outside the JSON.';

export async function generateFixRecommendationsFromAce(
  context: AceCodeIntelContext,
  failingArea: string,
  opts: Gemma4AceOpts = {}
): Promise<{
  ok: boolean;
  recommendation: AceFixRecommendation;
  degraded: boolean;
  error?: string;
}> {
  const fallback: AceFixRecommendation = {
    problem: failingArea,
    likely_causes: ['Unknown — LLM unavailable or context degraded'],
    recommended_files: context.chunkContext.slice(0, 3).map((c) => c.relativePath ?? c.chunkId),
    recommended_actions: ['Inspect the files above for the error', 'Check service connectivity'],
    safety_checks: ['Confirm DB connection', 'Confirm Ollama reachability'],
  };

  // Build a rich task description for the model
  const clusterWarnings = context.clusterContext.flatMap((c) => c.warnings).slice(0, 5);
  const relevantPurposes = context.clusterContext
    .map((c) => c.purpose)
    .filter(Boolean)
    .slice(0, 3);
  const refFiles = context.chunkContext
    .slice(0, 5)
    .map((c) => c.relativePath ?? c.chunkId)
    .join('\n');

  const userPrompt = [
    `Failing area: ${failingArea}`,
    relevantPurposes.length ? `Cluster purposes: ${relevantPurposes.join('; ')}` : '',
    clusterWarnings.length ? `Known warnings: ${clusterWarnings.join('; ')}` : '',
    refFiles ? `Reference files:\n${refFiles}` : '',
    'Diagnose and return the fix recommendation JSON.',
  ]
    .filter(Boolean)
    .join('\n');

  if (opts.useTools) {
    const toolResult = await callGemma4WithTools(
      FIX_SYSTEM + '\n\n' + buildGemma4AcePrompt(context),
      userPrompt,
      ACE_TOOLS,
      {
        ...opts,
        lane: 'interactive-agent',
        taskType: 'fix-recommender',
      }
    );

    if (toolResult.ok) {
      try {
        const cleaned = toolResult.text
          .replace(/^```(?:json)?\n?/m, '')
          .replace(/\n?```$/m, '')
          .trim();
        const parsed = JSON.parse(cleaned);
        return {
          ok: true,
          degraded: context.degraded,
          recommendation: parsed as AceFixRecommendation,
        };
      } catch {
        return {
          ok: false,
          degraded: true,
          error: 'Failed to parse tool loop response as JSON',
          recommendation: fallback,
        };
      }
    }
    return { ok: false, degraded: true, error: toolResult.error, recommendation: fallback };
  }

  const result = await callGemma4WithAceContext({ ...context, query: failingArea }, userPrompt, {
    ...opts,
    jsonMode: true,
    lane: 'interactive-agent',
    taskType: 'fix-recommender',
  } as Gemma4AceOpts);

  if (!result.ok || !result.parsed) {
    // Heuristic fallback using cluster metadata
    if (context.clusterContext.length > 0 || context.chunkContext.length > 0) {
      return {
        ok: false,
        degraded: true,
        error: result.error,
        recommendation: {
          ...fallback,
          likely_causes: clusterWarnings.length ? clusterWarnings : fallback.likely_causes,
          recommended_files: context.chunkContext
            .slice(0, 5)
            .map((c) => c.relativePath ?? c.chunkId),
        },
      };
    }
    return { ok: false, degraded: true, error: result.error, recommendation: fallback };
  }

  // Parse and normalize the structured response
  const raw = result.parsed as any;
  const recommendation: AceFixRecommendation = {
    problem: String(raw.problem ?? failingArea),
    likely_causes: Array.isArray(raw.likely_causes) ? raw.likely_causes.map(String) : [],
    recommended_files: Array.isArray(raw.recommended_files)
      ? raw.recommended_files.map(String)
      : [],
    recommended_actions: Array.isArray(raw.recommended_actions)
      ? raw.recommended_actions.map(String)
      : [],
    safety_checks: Array.isArray(raw.safety_checks) ? raw.safety_checks.map(String) : [],
  };

  return { ok: true, degraded: context.degraded, recommendation };
}
