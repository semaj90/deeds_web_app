/**
 * OpenAI-compatible facade for the YorHA agent stack.
 *
 * Routes OpenAI-shape requests through the full ACE/KAG/RAG context-assembler
 * + code-llm-index PRIOR ANSWER cache + bifrostChat (Bifrost L2 → TurboQuant
 * → Ollama cascade) before returning an OpenAI-shaped response.
 *
 * This is what makes OpenWebUI (or any OpenAI-compat client) talk to your
 * full agent brain instead of raw llama-server.
 *
 * Flow:
 *   OpenAI request → extract last user query
 *                 → assembleACEContext({query, filePath, caseId, ...})
 *                 → buildACEPromptCached(context, query)
 *                 → bifrostChat([{system}, ...history, {user}])
 *                 → wrap in OpenAI choices/usage shape
 */

import type {
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
  OpenAIMessage,
} from './openai-types.js';
import { assembleACEContext, buildACEPromptCached } from '$lib/server/ace/context-assembler.js';
import { turboQuantChat, bifrostChat } from '$lib/server/ollama.js';

interface RunOpts {
  /** Authenticated user id (from locals.user) — used for ACE personalization */
  userId?: string;
}

/**
 * Map the request `model` field to an internal Ollama/TurboQuant model name.
 * Lets clients use friendly names like "yorha-legal" without knowing the
 * underlying tag, and gives us a stable surface to swap models without
 * breaking external clients.
 */
function resolveInternalModel(requested: string): string {
  // Drop any trailing `:latest` to normalise comparisons
  const m = requested.toLowerCase().replace(/:latest$/, '');
  if (m.startsWith('yorha') || m.startsWith('legal') || m.includes('vlm')) {
    return 'gemma4-legal-vlm:latest';
  }
  if (m === 'gemma4-agent' || m === 'gemma4-raw' || m.startsWith('gemma4')) {
    return 'gemma4-legal-vlm:latest';
  }
  if (m.startsWith('gemma3')) return 'gemma3-legal:latest';
  if (m.startsWith('gemma270') || m.startsWith('gemma3:270')) return 'gemma3:270m';
  // Default — use as-is so direct Ollama tags pass through
  return requested;
}

/**
 * Extract the last user message as the "query" for ACE retrieval, leaving
 * earlier messages as chat history that the assembler can inject.
 */
function splitMessages(messages: ReadonlyArray<OpenAIMessage>): {
  query: string;
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  systemPreamble: string | null;
} {
  let query = '';
  let systemPreamble: string | null = null;
  const history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

  // Walk forward, collect history. Last user message becomes the query.
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const content = m.content ?? '';
    if (m.role === 'system' && i === 0) {
      systemPreamble = content;
      continue;
    }
    if (m.role === 'user' && i === messages.length - 1) {
      query = content;
      continue;
    }
    if (m.role === 'user' || m.role === 'assistant' || m.role === 'system') {
      history.push({ role: m.role, content });
    }
    // Tool messages are dropped — clients should not be feeding tool-call
    // results through this surface; use /api/ai/agent for tool loops.
  }

  // Edge case: only system + user, or only user — query is the last user message
  if (!query && messages.length > 0) {
    const last = messages[messages.length - 1];
    if (last.role === 'user') query = last.content ?? '';
  }
  return { query, history, systemPreamble };
}

/**
 * Run an OpenAI chat completion through the full agent stack.
 * Returns an OpenAI-shaped response. stream:true is rejected at the route
 * level for v1 — implement separately when bifrostChat streaming is wired.
 */
export async function runChatCompletion(
  req:  OpenAIChatCompletionRequest,
  opts: RunOpts = {},
): Promise<OpenAIChatCompletionResponse> {
  const startMs       = Date.now();
  const internalModel = resolveInternalModel(req.model);
  const { query, history, systemPreamble } = splitMessages(req.messages);

  if (!query) {
    throw new Error('No user query found in messages — last message must be role:user');
  }

  // ── Raw passthrough mode: skip ACE, use messages verbatim ──
  // For benchmarking / debugging the model layer in isolation.
  if (req.raw) {
    const mappedMsgs = req.messages.map((m) => ({
      role:    m.role === 'tool' ? 'user' as const : m.role,
      content: m.content ?? '',
    }));
    // Try TurboQuant first (78 tok/s GPU), fall back to bifrostChat
    let text: string;
    try {
      const content = await turboQuantChat(mappedMsgs, internalModel, {
        temperature: req.temperature,
        maxTokens: req.max_tokens,
      });
      text = typeof content === 'string' ? content : (content as { content: string }).content;
    } catch {
      const content = await bifrostChat(mappedMsgs, internalModel, {
        temperature: req.temperature,
        maxTokens: req.max_tokens,
      });
      text = typeof content === 'string' ? content : (content as { content: string }).content;
    }
    return wrapResponse({
      content:  text,
      model:    internalModel,
      durationMs: Date.now() - startMs,
      ace:      { used: false, chunks: 0, agentsMd: false, codeLlmHit: false, cacheHit: 'none' },
    });
  }

  // ── ACE path: full retrieval + prompt assembly ──
  const aceCtx = await assembleACEContext({
    query,
    userId:                opts.userId,
    caseId:                req.case_id,
    filePath:              req.file_path,
    enableCodebaseContext: true,
    enableWebSearch:       false, // OpenWebUI clients tend to want fast first-token; web search via dedicated route
  });

  // The ACE context already includes its own chatHistory injection (per-user
  // semantic recall). Append the request's conversation history on top so the
  // current OpenAI conversation thread is always honoured.
  if (history.length > 0) {
    aceCtx.chatHistory = [...(aceCtx.chatHistory ?? []), ...history];
  }

  const prompt   = await buildACEPromptCached(aceCtx, query);
  const sysFull  = systemPreamble
    ? `${systemPreamble}\n\n${prompt.systemPrompt}`
    : prompt.systemPrompt;

  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
    { role: 'system', content: sysFull },
    ...history,
    { role: 'user',   content: query },
  ];

  // Try TurboQuant first (78 tok/s GPU), fall back to bifrostChat
  let text: string;
  try {
    const result = await turboQuantChat(messages, internalModel, {
      temperature: req.temperature,
      maxTokens:   req.max_tokens,
    });
    text = typeof result === 'string' ? result : (result as { content: string }).content;
  } catch {
    const result = await bifrostChat(messages, internalModel, {
      temperature: req.temperature,
      maxTokens:   req.max_tokens,
    });
    text = typeof result === 'string' ? result : (result as { content: string }).content;
  }

  return wrapResponse({
    content:    text,
    model:      internalModel,
    durationMs: Date.now() - startMs,
    ace: {
      used:       true,
      chunks:     (aceCtx.ragChunks?.length ?? 0) + (aceCtx.kbChunks?.length ?? 0) + (aceCtx.caseChunks?.length ?? 0),
      agentsMd:   !!aceCtx.agentsMd?.markdown,
      codeLlmHit: !!aceCtx.codeLlmHit?.llmOutput,
      cacheHit:   aceCtx.codeLlmHit ? 'prior-answer' : (aceCtx.agentsMd ? 'agents-md' : 'none'),
    },
  });
}

// ── Response wrapper ───────────────────────────────────────────────────────

function wrapResponse(args: {
  content:    string;
  model:      string;
  durationMs: number;
  ace: {
    used:       boolean;
    chunks:     number;
    agentsMd:   boolean;
    codeLlmHit: boolean;
    cacheHit:   OpenAIChatCompletionResponse['yorha']['cacheHit'];
  };
}): OpenAIChatCompletionResponse {
  // Token counts: rough estimate (chars/4). Real counts only available when
  // bifrostChat returns them, which it does for direct Ollama but not always
  // for cached Bifrost hits.
  const completionTokens = Math.ceil(args.content.length / 4);

  return {
    id:      `chatcmpl-yorha-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    object:  'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model:   args.model,
    choices: [
      {
        index:         0,
        message:       { role: 'assistant', content: args.content },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens:     0, // not tracked here — see /api/v1/usage if needed
      completion_tokens: completionTokens,
      total_tokens:      completionTokens,
    },
    yorha: {
      aceUsed:       args.ace.used,
      contextChunks: args.ace.chunks,
      agentsMd:      args.ace.agentsMd,
      codeLlmHit:    args.ace.codeLlmHit,
      cacheHit:      args.ace.cacheHit,
      durationMs:    args.durationMs,
    },
  };
}

// ── Models list ────────────────────────────────────────────────────────────

export const ADVERTISED_MODELS = [
  { id: 'gemma4-agent',   owned_by: 'local' },  // → gemma4-legal-vlm (ACE/KAG/RAG brain)
  { id: 'gemma4-raw',     owned_by: 'local' },  // → gemma4-legal-vlm (direct, no ACE)
  { id: 'yorha-legal',    owned_by: 'yorha' },   // → gemma4-legal-vlm (alias)
  { id: 'yorha-fast',     owned_by: 'yorha' },   // → gemma3:270m
  { id: 'gemma4-legal',   owned_by: 'yorha' },   // → gemma4-legal-vlm explicit
  { id: 'gemma3-legal',   owned_by: 'yorha' },   // → gemma3-legal
  { id: 'gemma3:270m',    owned_by: 'ollama' },
] as const;
