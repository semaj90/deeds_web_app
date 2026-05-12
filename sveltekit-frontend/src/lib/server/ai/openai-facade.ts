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

import { createHash } from 'node:crypto';
import type {
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
  OpenAIMessage,
} from './openai-types.js';
import { assembleACEContext, buildACEPromptCached } from '$lib/server/ace/context-assembler.js';
import { turboQuantChat, bifrostChat } from '$lib/server/ollama.js';
import { runGemma4Agent } from '$lib/server/ai/gemma4-agent.js';
import { compressToHCACard } from '$lib/server/ai/hca-compressor.js';
import { buildDevContextPlan, isCodingPrompt } from '$lib/server/ai/dev-context-planner.js';
import { classifyQuerySection } from '$lib/server/analysis/hmm-ace-analyzer.js';

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
  if (m === 'yorha-hermes') return 'yorha-hermes'; // hermes composer path in openai-facade
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

  // ── Agent loop path: route through Gemma4 tool-calling agent ──
  // Triggered for: model=gemma4-agent, client-supplied tools[], or coding prompts.
  // Coding prompts use LLAMA_TOOL_DEFINITIONS (native TurboQuant tool_calls) via
  // the isCodingPipeline switch in gemma4-agent.ts, and expose toolsUsed in yorha.
  const isAgentModel  = req.model.toLowerCase().includes('agent');
  const hasTools      = Array.isArray(req.tools) && req.tools.length > 0;
  const isCodingQuery = isCodingPrompt(query);
  if (isAgentModel || hasTools || isCodingQuery) {
    // Step 5B: pre-loop dev context planning for coding/debugging prompts
    let devPlan: Awaited<ReturnType<typeof buildDevContextPlan>> | undefined;
    if (isCodingPrompt(query)) {
      try {
        devPlan = await buildDevContextPlan(query, {
          filePath:  req.file_path,
          userId:    opts.userId,
        });
      } catch { /* non-fatal — proceed without dev context */ }
    }

    const agentResult = await runGemma4Agent(query, {
      userId:    opts.userId,
      pipeline:  'openai-facade',
      metadata: {
        filePath:        req.file_path,
        caseId:          req.case_id,
        allowWriteTools: false,   // OpenAI compat clients get read-only by default
        allowGatedTools: false,
        devContextSummary: devPlan?.contextSummary,
      },
    });
    const agentHmmResult = (() => { try { return classifyQuerySection(query); } catch { return null; } })();
    return wrapResponse({
      content:    agentResult.answer,
      model:      internalModel,
      durationMs: Date.now() - startMs,
      ace: {
        used:       true,
        chunks:     0,
        agentsMd:   false,
        codeLlmHit: agentResult.cacheTier !== undefined,
        cacheHit:   agentResult.cacheTier ? 'prior-answer' : 'none',
      },
      hmm: agentHmmResult ? {
        hmmAnalyzerUsed: true,
        intent:          agentHmmResult.section,
        confidence:      agentHmmResult.confidence,
        state:           'agent_loop',
        signals:         ['gemma4_agent', ...(agentResult.toolsUsed ?? [])],
      } : undefined,
      toolLoop: {
        toolsUsed:           agentResult.toolsUsed ?? [],
        toolRounds:          agentResult.rounds ?? 0,
        toolResultChars:     0,
        mcpPort:             8788,
        kvPacketTaskId:      devPlan?.kvPacketTaskId,
        stablePrefixHash:    devPlan?.stablePrefixHash,
        selectedStableKeys:  devPlan?.selectedStableKeys,
        selectedFiles:       devPlan?.selectedFiles,
        contextHitCount:     devPlan?.contextHitCount,
      },
    });
  }

  // ── ACE path: full retrieval + prompt assembly ──
  // 20s guard: embeddinggemma won't load when VRAM is occupied by gemma4-legal-vlm.
  // On timeout we fall through with an empty context — bifrostChat still fires.
  const ACE_TIMEOUT_MS = 20_000;
  const acePromise = assembleACEContext({
    query,
    userId:                opts.userId,
    caseId:                req.case_id,
    filePath:              req.file_path,
    enableCodebaseContext: true,
    enableWebSearch:       false,
  });
  acePromise.catch(() => {}); // prevent UnhandledPromiseRejection if race abandons it

  type AceCtx = Awaited<ReturnType<typeof assembleACEContext>>;
  let aceCtx: AceCtx;
  try {
    aceCtx = await Promise.race([
      acePromise,
      new Promise<never>((_, r) => setTimeout(() => r(new Error('ace-timeout')), ACE_TIMEOUT_MS)),
    ]);
  } catch {
    aceCtx = {
      userProfile: null, caseContext: null, glossaryMatches: null,
      ragChunks: [], kbChunks: [], caseChunks: [], kagNeighbors: [],
      chatHistory: history,
      entities: { statutes: [], cases: [], persons: [], organizations: [], dates: [] },
      practiceTemplate: null, queryTags: [], webSearchContext: null,
      persona: 'assistant', evidenceMetadata: null, evidenceConnections: null,
      userAnalyticsContext: null, codebaseContext: null, policyDecision: null,
    } as AceCtx;
  }

  // The ACE context already includes its own chatHistory injection (per-user
  // semantic recall). Append the request's conversation history on top so the
  // current OpenAI conversation thread is always honoured.
  if (history.length > 0) {
    aceCtx.chatHistory = [...(aceCtx.chatHistory ?? []), ...history];
  }

  const prompt = await buildACEPromptCached(aceCtx, query);
  const qHash  = createHash('sha1').update(query).digest('hex').slice(0, 16);

  // ── KV context packet assembly (Step 5A) ────────────────────────────────
  // Builds a 3-level compressed context packet from the ACE hot files.
  // Allows llama-server to reuse the stable system prefix KV cache across calls.
  // Non-fatal: if Redis is unavailable (tests, cold start) we fall back to ACE prompt.
  let sysFull         = systemPreamble
    ? `${systemPreamble}\n\n${prompt.systemPrompt}`
    : prompt.systemPrompt;
  let kvPacketTaskId: string | undefined;
  let stablePrefixHash: string | undefined;
  let kvContextBlock  = '';

  try {
    const kv = await import('$lib/server/ai/kv-context-controller.js');
    const hotFiles = (aceCtx.ragChunks ?? [])
      .map((c) => (c as unknown as Record<string, unknown>).filePath as string)
      .filter(Boolean)
      .slice(0, 8);

    kvPacketTaskId   = `task:${qHash}`;
    const packet     = await kv.buildKvContextPacket({
      taskId:   kvPacketTaskId,
      query,
      hotFiles,
    });
    stablePrefixHash = packet.stablePrefixHash;

    // Replace ACE system prompt with the stable prefix (KV cache reuse on llama-server)
    const stablePrefix = kv.getStableSystemPrefix();
    sysFull = systemPreamble
      ? `${stablePrefix}\n\n${systemPreamble}\n\n${prompt.systemPrompt}`
      : `${stablePrefix}\n\n${prompt.systemPrompt}`;

    // Compressed TOC block injected before the user query
    kvContextBlock = kv.formatKvPacketForPrompt(packet);
  } catch { /* KV controller unavailable — use plain ACE prompt */ }

  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
    { role: 'system', content: sysFull },
    ...history,
    ...(kvContextBlock ? [{ role: 'system' as const, content: kvContextBlock }] : []),
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

  // Fire-and-forget: store answer so run-2 gets a prior-answer cache hit
  import('$lib/server/cache/code-llm-index.js').then(({ recordRagAnswer }) => {
    recordRagAnswer(`query:${qHash}`, text, {
      query,
      glyphClusterId: aceCtx.ragChunks?.[0]?.somCluster,
    }).catch(() => {});
  }).catch(() => {});

  // When a prior-answer cache hit is present, compress it to an HCA 128-token card
  // so the next related query gets a compact prior-answer hint instead of full retrieval.
  let priorAnswerKey: string | undefined;
  if (aceCtx.codeLlmHit?.llmOutput) {
    const hcaKey = `query:${qHash}`;
    compressToHCACard(aceCtx.codeLlmHit.llmOutput, hcaKey, 'openai-facade', {
      type: 'prior-answer', ttl: '6h', embeddingQueued: true, fromRedis: true,
    });
    priorAnswerKey = hcaKey;
  }

  const hmmResult = (() => { try { return classifyQuerySection(query); } catch { return null; } })();

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
    hmm: hmmResult ? {
      hmmAnalyzerUsed: true,
      intent:          hmmResult.section,
      confidence:      hmmResult.confidence,
      state:           'context_sufficient',
      signals:         ['ace_retrieval', 'qdrant', ...(aceCtx.agentsMd ? ['agents_md'] : [])],
    } : undefined,
    toolLoop: {
      toolsUsed:       [],
      toolRounds:      0,
      toolResultChars: 0,
      priorAnswerKey,
      mcpPort:         8788,
      kvPacketTaskId,
      stablePrefixHash,
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
    cacheHit:   NonNullable<OpenAIChatCompletionResponse['yorha']>['cacheHit'];
  };
  hmm?: NonNullable<NonNullable<OpenAIChatCompletionResponse['yorha']>['hmm']>;
  topoPrefilter?: { used: boolean; hitCount?: number } | null;
  toolLoop?: {
    toolsUsed?:          string[];
    toolRounds?:         number;
    toolResultChars?:    number;
    priorAnswerKey?:     string;
    mcpPort?:            number;
    kvPacketTaskId?:     string;
    stablePrefixHash?:   string;
    // Step 5B
    selectedStableKeys?: string[];
    selectedFiles?:      string[];
    contextHitCount?:    number;
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
    retrievalTrace: args.hmm ? {
      hmm:           args.hmm,
      topoPrefilter: args.topoPrefilter ?? null,
    } : undefined,
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
      aceUsed:         args.ace.used,
      contextChunks:   args.ace.chunks,
      agentsMd:        args.ace.agentsMd,
      codeLlmHit:      args.ace.codeLlmHit,
      cacheHit:        args.ace.cacheHit,
      durationMs:      args.durationMs,
      toolsUsed:        args.toolLoop?.toolsUsed,
      toolRounds:       args.toolLoop?.toolRounds,
      toolResultChars:  args.toolLoop?.toolResultChars,
      priorAnswerKey:   args.toolLoop?.priorAnswerKey,
      mcpPort:          args.toolLoop?.mcpPort ?? 8788,
      kvPacketTaskId:      args.toolLoop?.kvPacketTaskId,
      stablePrefixHash:    args.toolLoop?.stablePrefixHash,
      selectedStableKeys:  args.toolLoop?.selectedStableKeys,
      selectedFiles:       args.toolLoop?.selectedFiles,
      contextHitCount:     args.toolLoop?.contextHitCount,
      hmm:                 args.hmm,
    },
  };
}

// ── Models list ────────────────────────────────────────────────────────────

export const ADVERTISED_MODELS = [
  { id: 'gemma4-agent',   owned_by: 'local' },  // → gemma4-legal-vlm (ACE/KAG/RAG brain)
  { id: 'gemma4-raw',     owned_by: 'local' },  // → gemma4-legal-vlm (direct, no ACE)
  { id: 'yorha-legal',    owned_by: 'yorha' },   // → gemma4-legal-vlm (alias)
  { id: 'yorha-fast',     owned_by: 'yorha' },   // → gemma3:270m
  { id: 'yorha-hermes',   owned_by: 'yorha' },   // → hermes composer (HERMES_API_URL → bifrostChat gemma4-legal)
  { id: 'gemma4-legal',   owned_by: 'yorha' },   // → gemma4-legal-vlm explicit
  { id: 'gemma3-legal',   owned_by: 'yorha' },   // → gemma3-legal
  { id: 'gemma3:270m',    owned_by: 'ollama' },
] as const;
