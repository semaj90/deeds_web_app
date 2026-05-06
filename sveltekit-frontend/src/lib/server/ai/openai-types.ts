/**
 * OpenAI-compatible request/response types + Zod schemas.
 *
 * Subset of the OpenAI Chat Completions API (https://platform.openai.com/docs/api-reference/chat).
 * Just the fields OpenWebUI / VS Code Continue / Cursor / Aider use in practice.
 *
 * stream:false only for v1 — streaming added in a follow-up commit.
 * tools/tool_choice accepted but routed through our internal MCP loop, not
 * passed to the model as OpenAI-shape function-calls (the underlying Gemma4
 * uses a different tool-call format).
 */

import { z } from 'zod';

// ── Request ────────────────────────────────────────────────────────────────

export const openAIMessageSchema = z.object({
  role:    z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().or(z.null()).optional(),
  name:    z.string().optional(),
  tool_call_id: z.string().optional(),
});

export const openAIChatCompletionRequestSchema = z.object({
  model:        z.string().min(1).max(200),
  messages:     z.array(openAIMessageSchema).min(1).max(100),
  temperature:  z.number().min(0).max(2).optional().default(0.3),
  max_tokens:   z.number().int().min(1).max(32_000).optional(),
  top_p:        z.number().min(0).max(1).optional(),
  presence_penalty:  z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  stream:       z.boolean().optional().default(false),
  tools:        z.array(z.unknown()).optional(),
  tool_choice:  z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  user:         z.string().optional(),
  // ── Custom extensions (ignored by stock OpenAI clients, used by our agents) ──
  /** Repo-relative file path for nes-arch AGENTS.md preflight + same-dir boost */
  file_path:    z.string().optional(),
  /** Case UUID for case-scoped retrieval */
  case_id:      z.string().uuid().optional(),
  /** Disable ACE retrieval entirely (raw passthrough to bifrostChat) */
  raw:          z.boolean().optional().default(false),
});

export type OpenAIMessage = z.infer<typeof openAIMessageSchema>;
export type OpenAIChatCompletionRequest = z.infer<typeof openAIChatCompletionRequestSchema>;

// ── Response ───────────────────────────────────────────────────────────────

export interface OpenAIChatCompletionChoice {
  index:         number;
  message:       { role: 'assistant'; content: string };
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

export interface OpenAIChatCompletionUsage {
  prompt_tokens:     number;
  completion_tokens: number;
  total_tokens:      number;
}

export interface OpenAIChatCompletionResponse {
  id:      string;
  object:  'chat.completion';
  created: number;
  model:   string;
  choices: OpenAIChatCompletionChoice[];
  usage:   OpenAIChatCompletionUsage;
  /** Custom field — context sources used for this completion (transparency) */
  yorha?: {
    aceUsed:        boolean;
    contextChunks:  number;
    agentsMd:       boolean;
    codeLlmHit:     boolean;
    cacheHit:       'none' | 'agents-md' | 'prior-answer' | 'bifrost';
    durationMs:     number;
    // Tool loop metadata (Step 5 — Gemma4 MCP tool controller)
    toolsUsed?:        string[];
    toolRounds?:       number;
    toolResultChars?:  number;
    priorAnswerKey?:   string;
    mcpPort?:          number;
    // KV context compression metadata (Step 5A)
    kvPacketTaskId?:   string;
    stablePrefixHash?: string;
    // Dev context loop metadata (Step 5B)
    selectedStableKeys?: string[];
    selectedFiles?:      string[];
    contextHitCount?:    number;
  };
}

// ── Models list ────────────────────────────────────────────────────────────

export interface OpenAIModelEntry {
  id:        string;
  object:    'model';
  created:   number;
  owned_by:  string;
}

export interface OpenAIModelListResponse {
  object: 'list';
  data:   OpenAIModelEntry[];
}
