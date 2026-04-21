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
import type { AceCodeIntelContext } from './codeintel-datastore.js';

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
}

export interface Gemma4AceResult {
  ok: boolean;
  text: string;
  parsed?: unknown;
  degraded: boolean;
  error?: string;
  latencyMs: number;
  model: string;
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

export function buildGemma4AcePrompt(
  context: AceCodeIntelContext,
  task?: string,
): string {
  const sections: string[] = [];

  // 1. CLUSTER SUMMARIES (Highly Stable Prefix) ─────────────────────────────
  if (context.clusterContext.length > 0) {
    const clusterLines = context.clusterContext.map(c => {
      const parts = [`  Cluster ${c.gpuCluster} — ${c.purpose ?? 'unknown purpose'}`];
      if (c.summary) parts.push(`  Summary: ${c.summary}`);
      if (c.patterns.length) parts.push(`  Patterns: ${c.patterns.join(', ')}`);
      if (c.warnings.length) parts.push(`  Warnings: ${c.warnings.join('; ')}`);
      if (c.tags.length)     parts.push(`  Tags: ${c.tags.join(', ')}`);
      return parts.join('\n');
    });
    sections.push(`## CLUSTER REVIEWS (${context.clusterContext.length})\n${clusterLines.join('\n\n')}`);
  }

  // 2. RELEVANT CHUNKS ──────────────────────────────────────────────────────
  if (context.chunkContext.length > 0) {
    const chunkLines = context.chunkContext.map(c => {
      const meta = [c.kind, c.domain, c.language].filter(Boolean).join(' | ');
      const tags = c.semanticTags.slice(0, 4).join(', ');
      const parts = [`  ${c.relativePath ?? c.chunkId} [${meta}]`];
      if (tags)      parts.push(`  Tags: ${tags}`);
      if (c.summary) parts.push(`  Summary: ${c.summary.slice(0, 300)}`);
      return parts.join('\n');
    });
    sections.push(`## SOURCE CONTEXT (${context.chunkContext.length})\n${chunkLines.join('\n\n')}`);
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

const DEFAULT_MODEL = 'gemma4-legal-fast:latest';

export async function callGemma4WithAceContext(
  context: AceCodeIntelContext,
  userPrompt: string,
  opts: Gemma4AceOpts = {},
): Promise<Gemma4AceResult> {
  const model       = opts.model       ?? DEFAULT_MODEL;
  const temperature = opts.temperature ?? 0.2;
  const maxTokens   = opts.maxTokens   ?? 1024;
  const jsonMode    = opts.jsonMode    ?? !!opts.responseSchema;
  const startMs     = Date.now();

  if (context.degraded && context.clusterContext.length === 0 && context.chunkContext.length === 0) {
    return {
      ok: false,
      text: '',
      degraded: true,
      error: 'No context available — all data sources degraded',
      latencyMs: Date.now() - startMs,
      model,
    };
  }

  const systemPrompt =
    opts.systemPromptOverride?.trim()
      ? opts.systemPromptOverride
      : buildGemma4AcePrompt(context);

  // Build the format field: prefer explicit schema, then json string, then omit
  const formatField = opts.responseSchema ?? (jsonMode ? 'json' : undefined);

  try {
    const resp = await fetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt:  userPrompt,
        system:  systemPrompt,
        stream:  false,
        ...(formatField !== undefined ? { format: formatField } : {}),
        options: { 
          temperature, 
          num_predict: maxTokens,
          num_ctx: 16384, // ACE architectural contexts are large
        },
        keep_alive: '1h', // Maximize KV cache reuse for agentic loops
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);
    const data = await resp.json() as { response?: string };
    const text = (data.response ?? '').trim();

    let parsed: unknown;
    if (jsonMode) {
      try {
        const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        // non-fatal — return text as-is
      }
    }

    return { ok: true, text, parsed, degraded: context.degraded, latencyMs: Date.now() - startMs, model };
  } catch (e: unknown) {
    return {
      ok: false,
      text: '',
      degraded: true,
      error: `LLM call failed: ${e instanceof Error ? e.message : String(e)}`,
      latencyMs: Date.now() - startMs,
      model,
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
  degraded: boolean;
  error?: string;
  latencyMs: number;
  model: string;
}

const MAX_TOOL_ROUNDS = 5;

type OllamaMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
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
  opts: Pick<Gemma4AceOpts, 'model' | 'temperature' | 'maxTokens'> = {},
): Promise<Gemma4ToolCallResult> {
  const model       = opts.model       ?? DEFAULT_MODEL;
  const temperature = opts.temperature ?? 0.2;
  const maxTokens   = opts.maxTokens   ?? 1024;
  const startMs     = Date.now();

  // Ollama tool definitions — executor stripped (local-only)
  const ollamaTools = tools.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const executorMap = new Map(tools.map(t => [t.name, t.execute]));

  const messages: OllamaMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userMessage  },
  ];

  let toolCallsExecuted = 0;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const resp = await fetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          tools:   ollamaTools,
          stream:  false,
          options: { temperature, num_predict: maxTokens },
        }),
        signal: AbortSignal.timeout(90_000),
      });

      if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);

      const data = await resp.json() as { message: OllamaMessage; done: boolean };
      const msg  = data.message;
      messages.push(msg); // append assistant turn

      // No tool calls → final answer ready
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return {
          ok: true,
          text: msg.content.trim(),
          toolCallsExecuted,
          degraded: false,
          latencyMs: Date.now() - startMs,
          model,
        };
      }

      // Execute each tool call and feed results back
      for (const tc of msg.tool_calls) {
        const { name, arguments: args } = tc.function;
        const executor = executorMap.get(name);
        let result: string;
        if (executor) {
          try   { result = await executor(args); }
          catch (err) { result = `Error: ${err instanceof Error ? err.message : String(err)}`; }
        } else {
          result = `Error: unknown tool "${name}"`;
        }
        messages.push({ role: 'tool', content: result });
        toolCallsExecuted++;
      }
    }

    // Exceeded MAX_TOOL_ROUNDS — return last assistant content
    const last = [...messages].reverse().find(m => m.role === 'assistant');
    return {
      ok: false,
      text: last?.content ?? '',
      toolCallsExecuted,
      degraded: true,
      error: `Exceeded max tool rounds (${MAX_TOOL_ROUNDS})`,
      latencyMs: Date.now() - startMs,
      model,
    };
  } catch (e: unknown) {
    return {
      ok: false, text: '', toolCallsExecuted, degraded: true,
      error: `Tool loop failed: ${e instanceof Error ? e.message : String(e)}`,
      latencyMs: Date.now() - startMs, model,
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
  opts: Gemma4AceOpts = {},
): Promise<{ ok: boolean; recommendation: AceFixRecommendation; degraded: boolean; error?: string }> {
  const fallback: AceFixRecommendation = {
    problem:             failingArea,
    likely_causes:       ['Unknown — LLM unavailable or context degraded'],
    recommended_files:   context.chunkContext.slice(0, 3).map(c => c.relativePath ?? c.chunkId),
    recommended_actions: ['Inspect the files above for the error', 'Check service connectivity'],
    safety_checks:       ['Confirm DB connection', 'Confirm Ollama reachability'],
  };

  // Build a rich task description for the model
  const clusterWarnings = context.clusterContext.flatMap(c => c.warnings).slice(0, 5);
  const relevantPurposes = context.clusterContext.map(c => c.purpose).filter(Boolean).slice(0, 3);
  const refFiles = context.chunkContext.slice(0, 5).map(c => c.relativePath ?? c.chunkId).join('\n');

  const userPrompt = [
    `Failing area: ${failingArea}`,
    relevantPurposes.length ? `Cluster purposes: ${relevantPurposes.join('; ')}` : '',
    clusterWarnings.length  ? `Known warnings: ${clusterWarnings.join('; ')}` : '',
    refFiles ? `Reference files:\n${refFiles}` : '',
    'Diagnose and return the fix recommendation JSON.',
  ].filter(Boolean).join('\n');

  const result = await callGemma4WithAceContext(
    { ...context, query: failingArea },
    userPrompt,
    { ...opts, jsonMode: true },
  );

  if (!result.ok || !result.parsed) {
    // Heuristic fallback using cluster metadata
    if (context.clusterContext.length > 0 || context.chunkContext.length > 0) {
      return {
        ok: false,
        degraded: true,
        error: result.error,
        recommendation: {
          ...fallback,
          likely_causes:   clusterWarnings.length ? clusterWarnings : fallback.likely_causes,
          recommended_files: context.chunkContext.slice(0, 5).map(c => c.relativePath ?? c.chunkId),
        },
      };
    }
    return { ok: false, degraded: true, error: result.error, recommendation: fallback };
  }

  // Parse and normalize the structured response
  const raw = result.parsed as any;
  const recommendation: AceFixRecommendation = {
    problem:             String(raw.problem ?? failingArea),
    likely_causes:       Array.isArray(raw.likely_causes) ? raw.likely_causes.map(String) : [],
    recommended_files:   Array.isArray(raw.recommended_files) ? raw.recommended_files.map(String) : [],
    recommended_actions: Array.isArray(raw.recommended_actions) ? raw.recommended_actions.map(String) : [],
    safety_checks:       Array.isArray(raw.safety_checks) ? raw.safety_checks.map(String) : [],
  };

  return { ok: true, degraded: context.degraded, recommendation };
}
