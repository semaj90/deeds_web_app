/**
 * OpenAI-compatible facade for the YorHA agent stack.
 *
 * Routes OpenAI-shape requests through the full ACE/KAG/RAG context-assembler
 * + code-llm-index PRIOR ANSWER cache + 24h prompt cache + bifrostChat
 * (Bifrost L2 → TurboQuant → Ollama cascade) before returning an
 * OpenAI-shaped response.
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
  TimingTrace,
} from './openai-types.js';
import { assembleACEContext, buildACEPromptCached } from '$lib/server/ace/context-assembler.js';
import type { ACEContext } from '$lib/server/ace/types.js';
import {
  hashStr,
  buildAcePacketCacheKey,
  buildAceCompletionCacheKey,
} from '$lib/server/cache-keys.js';
import { getExactMatchCache, setExactMatchCache } from '$lib/server/cache/redis-exact-match.js';
import { rankIntent, logIntentEvalEvent } from '$lib/server/ai/intent-ranker.js';
import {
  labelsSignature,
  normalizeLabels,
  orchestrateLabels,
} from '$lib/server/labels/normalize-labels.js';
import { turboQuantChat, bifrostChat } from '$lib/server/ollama.js';
import { callTraceMcp } from '$lib/server/mcp/trace-http.js';
import { runGemma4Agent } from '$lib/server/ai/gemma4-agent.js';
import { resolveRuntimeConfig } from '$lib/server/ai/inference-configs.js';
import { canUseTurboQuant } from '$lib/server/ai/backend-runtime-guards.js';
import { isVlmOrMmprojRequestModel } from '$lib/server/ai/request-classifiers.js';
import { shouldUseDraftModel } from '$lib/server/ai/draft-model-policy.js';
import { compressToHCACard } from '$lib/server/ai/hca-compressor.js';
import { attentionHeadRanker } from '$lib/server/ai/attention-head-ranker.js';
import { countTokens, enforceTokenBudget } from '$lib/server/llm/token-budget.js';
import { getRedis } from '$lib/server/redis.js';
import { recordContextCacheAccess } from '$lib/server/cache/ace-context-cache-metrics.js';
import { buildDevContextPlan, isCodingPrompt } from '$lib/server/ai/dev-context-planner.js';
import { classifyQuerySection } from '$lib/server/analysis/hmm-ace-analyzer.js';
import { ENV } from '$lib/server/env.server.js';
import {
  buildAcePromptPreflight,
  AcePromptPreflightInput,
  AcePromptPreflightResult,
} from '$lib/server/ai/ace-prompt-preflight.js';
import { lookupScenario, storeScenario } from '$lib/server/ai/scenario-cache.js';

const OPENAI_DEFAULT_MAX_TOKENS = Number(process.env.OPENAI_DEFAULT_MAX_TOKENS ?? '1024');
const OPENAI_MAX_OUTPUT_TOKENS = Number(
  process.env.OPENAI_MAX_OUTPUT_TOKENS ?? process.env.OPENCODE_MAX_OUTPUT_TOKENS ?? '2048'
);
const OPENAI_RESERVED_COMPLETION_TOKENS = Number(
  process.env.OPENAI_RESERVED_COMPLETION_TOKENS ?? '1024'
);
const OPENAI_HARD_INPUT_CAP = Number(process.env.OPENAI_HARD_INPUT_CAP ?? '24000');
const ACE_PACKET_TOKEN_CAP = Number(process.env.ACE_PACKET_TOKEN_CAP ?? '3500');
const RUNTIME_CONTEXT_SIZE = Math.max(
  65536,
  ...[
    process.env.LLM_CONTEXT_SIZE,
    process.env.TURBO_CTX_SIZE,
    process.env.LLAMA_CTX_SIZE,
    process.env.TURBO_CTX,
    process.env.LLAMA_SERVER_CTX,
    process.env.OLLAMA_CONTEXT_LENGTH,
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
);

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

interface RunOpts {
  /** Authenticated user id (from locals.user) — used for ACE personalization */
  userId?: string;
  useMcp?: boolean;
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
  if (m === 'yorha-hermes' || m === 'gemma4-rotorquant:latest') return 'gemma4-rotorquant:latest';
  if (m.startsWith('yorha') || m.startsWith('legal') || m.includes('vlm')) {
    return 'gemma4-rotorquant:latest';
  }
  if (m === 'gemma4-agent' || m === 'gemma4-raw' || m.startsWith('gemma4')) {
    return 'gemma4-rotorquant:latest';
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

function deriveRoutingLabels(context: ACEContext) {
  const primaryCluster = context.clusterContext?.[0];
  const primaryChunk = context.codebaseContext?.[0];

  return normalizeLabels({
    jsonb: {
      cluster_key: primaryCluster?.clusterKey ?? primaryChunk?.clusterKey ?? undefined,
      centroid_label: primaryCluster?.centroidLabel ?? primaryChunk?.centroidLabel ?? undefined,
      topology_label:
        primaryCluster?.topoLabel ??
        primaryCluster?.topoClass ??
        primaryChunk?.topologyLabel ??
        primaryChunk?.topoClass ??
        undefined,
      hotness_bucket: primaryCluster?.hotnessBucket ?? primaryChunk?.hotnessBucket ?? undefined,
      feature_family: primaryCluster?.featureFamily ?? primaryChunk?.featureFamily ?? undefined,
      summary:
        primaryCluster?.summary ??
        primaryCluster?.summaryLens ??
        primaryCluster?.synthesisSuggestion ??
        undefined,
      purpose: primaryCluster?.purpose ?? undefined,
      risk_level: primaryCluster?.riskLevel ?? undefined,
    },
    centroid: {
      label:
        primaryCluster?.centroidLabel ??
        primaryChunk?.centroidLabel ??
        primaryChunk?.stableKey ??
        primaryChunk?.filePath ??
        null,
      topology:
        primaryCluster?.topoLabel ??
        primaryCluster?.topoClass ??
        primaryChunk?.topologyLabel ??
        primaryChunk?.topoClass ??
        null,
      clusterKey: primaryCluster?.clusterKey ?? primaryChunk?.clusterKey ?? null,
    },
    karpathy: {
      bucket: primaryCluster?.hotnessBucket ?? primaryChunk?.hotnessBucket ?? null,
      blend:
        primaryChunk?.karpathyBlend ??
        primaryChunk?.clusterPagerank ??
        primaryChunk?.graphAuthorityScore ??
        null,
      score: primaryChunk?.graphAuthorityScore ?? null,
    },
  });
}

function trimHistoryForBudget(
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  keepPairs = 2
): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
  if (history.length <= keepPairs * 2) return history;

  return history.slice(-keepPairs * 2);
}

function summarizeHistory(
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
  if (history.length <= 6) return history;

  const recent = history.slice(-4);
  const earlier = history.slice(0, -4);
  const summaryText = earlier.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join(' ');

  const compacted = enforceTokenBudget(summaryText, 900).text;
  return [
    {
      role: 'system',
      content: `Conversation summary of prior context: ${compacted}`,
    },
    ...recent,
  ];
}

function buildBudgetTrace(
  action: string,
  runtime: ReturnType<typeof resolveRuntimeConfig>,
  inputTokens: number,
  requestedMaxTokens: number,
  maxContextSize: number,
  acePacketTokens: number,
  aceStats: Record<string, any>
) {
  return {
    stage: action,
    cache_prompt_supported: runtime.turboQuant,
    turbo_profile: runtime.profile,
    input_tokens: inputTokens,
    requested_max_tokens: requestedMaxTokens,
    max_context_size: maxContextSize,
    max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
    ace_packet_tokens: acePacketTokens,
    topo_hit: !!aceStats.topo_hit,
    packet_hit: !!aceStats.packet_hit,
  };
}

type InferenceLane = 'hermes' | 'turboquant' | 'bifrost';

async function runHermesChat(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  maxTokens: number,
  temperature?: number
): Promise<string> {
  const res = await fetch(`${ENV.HERMES_API_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma4-rotorquant:latest',
      messages,
      max_tokens: maxTokens,
      temperature: temperature ?? 0.2,
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    throw new Error(`Hermes chat failed (${res.status}): ${await res.text().catch(() => '')}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

function clampRequestedMaxTokens(requested: number | undefined): number {
  return Math.min(requested ?? OPENAI_DEFAULT_MAX_TOKENS, 4096, OPENAI_MAX_OUTPUT_TOKENS);
}

function extractAssistantText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '';

  const rec = result as Record<string, unknown>;

  const direct = rec.content;
  if (typeof direct === 'string') return direct;

  const message = rec.message;
  if (message && typeof message === 'object') {
    const msg = message as Record<string, unknown>;
    if (typeof msg.content === 'string') return msg.content;
  }

  const choices = rec.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0];
    if (first && typeof first === 'object') {
      const choice = first as Record<string, unknown>;
      const choiceMessage = choice.message;
      if (choiceMessage && typeof choiceMessage === 'object') {
        const msg = choiceMessage as Record<string, unknown>;
        if (typeof msg.content === 'string') return msg.content;
      }
      if (typeof choice.content === 'string') return choice.content;
      const delta = choice.delta;
      if (delta && typeof delta === 'object') {
        const d = delta as Record<string, unknown>;
        if (typeof d.content === 'string') return d.content;
      }
    }
  }

  return '';
}

function determineInferenceLane(
  inputTokens: number,
  acePacketTokens: number,
  requestedMaxTokens: number,
  hasSpecializedRetrieval: boolean,
  canUseTurboQuantNow: boolean
): InferenceLane {
  if (
    inputTokens + requestedMaxTokens > 24000 ||
    acePacketTokens > 6000 ||
    requestedMaxTokens > 4096
  ) {
    return 'hermes';
  }

  if (hasSpecializedRetrieval) {
    return canUseTurboQuantNow ? 'turboquant' : 'hermes';
  }

  return canUseTurboQuantNow ? 'turboquant' : 'hermes';
}

type AceSelectedLane = 'redis' | 'turboquant' | 'bifrost';

function selectAceLane(opts: {
  inputTokens: number;
  acePacketTokens: number;
  requestedMaxTokens: number;
  hasSpecializedRetrieval: boolean;
  canUseTurboQuantNow: boolean;
}): {
  selectedLane: Exclude<AceSelectedLane, 'redis'>;
  fallbackReason: string | null;
} {
  const strictHeavy =
    opts.inputTokens + opts.requestedMaxTokens > 24000 ||
    opts.acePacketTokens > 6000 ||
    opts.requestedMaxTokens > 4096;

  const smallFast =
    opts.inputTokens <= 1800 &&
    opts.requestedMaxTokens <= 1024 &&
    opts.acePacketTokens <= 3000 &&
    !opts.hasSpecializedRetrieval;

  if (strictHeavy) {
    return {
      selectedLane: opts.canUseTurboQuantNow ? 'turboquant' : 'bifrost',
      fallbackReason: opts.canUseTurboQuantNow ? 'bifrost_timeout_risk' : 'turboquant_unavailable',
    };
  }

  if (opts.hasSpecializedRetrieval) {
    return { selectedLane: 'bifrost', fallbackReason: null };
  }

  if (smallFast) {
    return {
      selectedLane: opts.canUseTurboQuantNow ? 'turboquant' : 'bifrost',
      fallbackReason: opts.canUseTurboQuantNow ? null : 'turboquant_unavailable',
    };
  }

  return { selectedLane: 'bifrost', fallbackReason: null };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values.filter((value): value is string => typeof value === 'string' && value.length > 0)
    ),
  ];
}

function collectResponseContextMeta(aceCtx: ACEContext): {
  sourceRefs: string[];
  chunkIds: string[];
  contextPacketVersion?: string;
} {
  const payloads = aceCtx.acePayloads ?? [];
  const sourceRefs = uniqueStrings([
    ...payloads.map((payload) => payload.source_ref),
    ...((aceCtx.ragChunks ?? []).map((chunk) => chunk.filePath) as Array<
      string | null | undefined
    >),
    ...((aceCtx.kbChunks ?? []).map((chunk) => chunk.filePath) as Array<string | null | undefined>),
    ...((aceCtx.caseChunks ?? []).map((chunk) => chunk.filePath) as Array<
      string | null | undefined
    >),
    ...((aceCtx.codebaseContext ?? []).map((chunk) => chunk.filePath) as Array<
      string | null | undefined
    >),
  ]);
  const chunkIds = uniqueStrings([
    ...payloads.map((payload) => payload.chunk_id),
    ...((aceCtx.ragChunks ?? []).map((chunk) => chunk.id) as Array<string | null | undefined>),
    ...((aceCtx.acePayloads ?? []).map((payload) => payload.chunk_id) as Array<
      string | null | undefined
    >),
    ...((aceCtx.codebaseContext ?? []).map((chunk) => chunk.stableKey ?? chunk.filePath) as Array<
      string | null | undefined
    >),
  ]);
  return { sourceRefs, chunkIds };
}

/**
 * Run an OpenAI chat completion through the full agent stack.
 * Returns an OpenAI-shaped response. stream:true is handled by the SSE route
 * wrapper, which replays the cached or freshly generated completion chunks.
 */
export async function runChatCompletion(
  req: OpenAIChatCompletionRequest,
  opts: RunOpts = {}
): Promise<OpenAIChatCompletionResponse> {
  const startMs = Date.now();
  const internalModel = resolveInternalModel(req.model);
  const split = splitMessages(req.messages);
  const query = split.query;
  let history = split.history;
  const systemPreamble = split.systemPreamble;
  const runtime = resolveRuntimeConfig();
  const canUseTurboQuantNow = canUseTurboQuant(runtime);
  const draftModelEnabled = shouldUseDraftModel(req.model, canUseTurboQuantNow);
  let redisMs = 0;
  let qdrantMs = 0;
  let postgresMs = 0;
  let graphMs = 0;
  let bifrostMs = 0;
  let turboquantMs = 0;

  if (!query) {
    throw new Error('No user query found in messages — last message must be role:user');
  }

  // Tiered Scenario Cache (Tier 1 Redis, Tier 2 Qdrant + Postgres hydration)
  try {
    const cachedScenario = await lookupScenario(query);
    if (cachedScenario.hit && cachedScenario.response) {
      return wrapResponse({
        content: cachedScenario.response,
        model: internalModel,
        durationMs: Date.now() - startMs,
        inferenceLane: cachedScenario.source === 'redis' ? undefined : (canUseTurboQuantNow ? 'turboquant' : 'hermes'),
        runtimeProfile: runtime.profile,
        runtimeAvailable: runtime.runtimeAvailable,
        turboQuantEnabled: runtime.turboQuant,
        rotorQuantKv: runtime.rotorQuantKv,
        draftModel: draftModelEnabled,
        backend: cachedScenario.source === 'redis' ? 'redis-exact-match' : 'scenario-cache-qdrant',
        selectedLane: cachedScenario.source === 'redis' ? 'redis' : 'bifrost',
        ace: {
          used: false,
          chunks: 0,
          agentsMd: false,
          codeLlmHit: true,
          cacheHit: 'prior-answer',
          inputTokens: countTokens(query),
          maxContextSize: RUNTIME_CONTEXT_SIZE,
          availableContextTokens: RUNTIME_CONTEXT_SIZE,
          budgetGuardTriggered: false,
        },
        timingTrace: {
          redisMs: cachedScenario.source === 'redis' ? Date.now() - startMs : 0,
          qdrantMs: cachedScenario.source === 'qdrant_postgres' ? Date.now() - startMs : 0,
          postgresMs: 0,
          graphMs: 0,
          bifrostMs: 0,
          turboquantMs: 0,
          totalMs: Date.now() - startMs,
          selectedLane: cachedScenario.source === 'redis' ? 'redis' : 'bifrost',
          fallbackReason: null,
        }
      });
    }
  } catch (err) {
    console.warn('[Scenario Cache] Lookup failed (non-fatal):', err);
  }

  // ── Raw passthrough mode: skip ACE, use messages verbatim ──
  // For benchmarking / debugging the model layer in isolation.
  if (req.raw) {
    const mappedMsgs = req.messages.map((m) => ({
      role: m.role === 'tool' ? ('user' as const) : m.role,
      content: m.content ?? '',
    }));

    const rawContextSize =
      internalModel === 'gemma4-rotorquant:latest' ? 65536 : RUNTIME_CONTEXT_SIZE;
    const requestedMaxTokens = clampRequestedMaxTokens(req.max_tokens);
    const rawInputTokens = countTokens(mappedMsgs.map((m) => m.content).join('\n'));
    // For raw passthrough requests we intentionally bypass the ACE stack
    // and route directly to the standard Bifrost backend so clients can
    // benchmark the LLM path in isolation. This avoids invoking the
    // Gemma4 agent tool-calling path for raw debugging requests.
    const rawInferenceLane: InferenceLane = 'bifrost';
    const rawModel = internalModel;

    const runtimeLog = {
      stage: 'raw_openai_passthrough_budget_check',
      model: rawModel,
      profile: runtime.profile,
      turboQuantEnabled: runtime.turboQuant,
      runtimeAvailable: runtime.runtimeAvailable,
      canUseTurboQuantNow,
      input_tokens: rawInputTokens,
      requested_max_tokens: requestedMaxTokens,
      max_context_size: rawContextSize,
      max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
      inference_lane: rawInferenceLane,
    };

    if (requestedMaxTokens > OPENAI_MAX_OUTPUT_TOKENS) {
      console.error({
        ...runtimeLog,
        error: 'requested_max_tokens_exceeds_output_limit',
      });
      throw new BudgetExceededError(
        `Requested max_tokens (${requestedMaxTokens}) exceeds permitted output limit (${OPENAI_MAX_OUTPUT_TOKENS}).`
      );
    }

    if (rawInputTokens + requestedMaxTokens > rawContextSize) {
      console.error({
        ...runtimeLog,
        error: 'context_window_exceeded',
        total_requested: rawInputTokens + requestedMaxTokens,
      });
      throw new BudgetExceededError(
        `Request exceeds context window: input ${rawInputTokens} + max_tokens ${requestedMaxTokens} > ${rawContextSize}. Reduce history or max_tokens.`
      );
    }

    let text: string;
    const selectedLane = 'bifrost';
    if (selectedLane === 'bifrost') {
      text = await runHermesChat(mappedMsgs, requestedMaxTokens, req.temperature);
    } else if (canUseTurboQuantNow) {
      try {
        const result = await turboQuantChat(mappedMsgs, internalModel, {
          temperature: req.temperature,
          maxTokens: requestedMaxTokens,
        });
        text = extractAssistantText(result);
      } catch {
        const result = await bifrostChat(mappedMsgs, internalModel, {
          temperature: req.temperature,
          maxTokens: requestedMaxTokens,
        });
        text = extractAssistantText(result);
      }
    } else {
      const result = await bifrostChat(mappedMsgs, internalModel, {
        temperature: req.temperature,
        maxTokens: requestedMaxTokens,
      });
      text = extractAssistantText(result);
    }
    text = text.trim() || '[No assistant content returned by model]';
    return wrapResponse({
      content: text,
      model: rawModel,
      durationMs: Date.now() - startMs,
      inferenceLane: rawInferenceLane,
      runtimeProfile: runtime.profile,
      runtimeAvailable: runtime.runtimeAvailable,
      turboQuantEnabled: runtime.turboQuant,
      rotorQuantKv: runtime.rotorQuantKv,
      draftModel: draftModelEnabled,
      ace: {
        used: false,
        chunks: 0,
        agentsMd: false,
        codeLlmHit: false,
        cacheHit: 'none',
        inputTokens: rawInputTokens,
        maxContextSize: rawContextSize,
        availableContextTokens: Math.max(0, rawContextSize - rawInputTokens),
        budgetGuardTriggered: false,
      },
    });
  }

  // ── Agent loop path: route through Gemma4 tool-calling agent ──
  // Triggered for: model=gemma4-agent, client-supplied tools[], or coding prompts.
  // Coding prompts use LLAMA_TOOL_DEFINITIONS (native TurboQuant tool_calls) via
  // the isCodingPipeline switch in gemma4-agent.ts, and expose toolsUsed in yorha.
  const isAgentModel = req.model.toLowerCase().includes('agent');
  const hasTools = Array.isArray(req.tools) && req.tools.length > 0;
  const isCodingQuery = isCodingPrompt(query);
  if (isAgentModel || hasTools || isCodingQuery) {
    // Step 5B: pre-loop dev context planning for coding/debugging prompts
    let devPlan: Awaited<ReturnType<typeof buildDevContextPlan>> | undefined;
    if (isCodingPrompt(query)) {
      try {
        devPlan = await buildDevContextPlan(query, {
          filePath: req.file_path,
          userId: opts.userId,
        });
      } catch {
        /* non-fatal — proceed without dev context */
      }
    }

    const agentResult = await runGemma4Agent(query, {
      userId: opts.userId,
      pipeline: 'openai-facade',
      metadata: {
        filePath: req.file_path,
        caseId: req.case_id,
        allowWriteTools: false, // OpenAI compat clients get read-only by default
        allowGatedTools: false,
        devContextSummary: devPlan?.contextSummary,
      },
    });
    const agentHmmResult = (() => {
      try {
        return classifyQuerySection(query);
      } catch {
        return null;
      }
    })();
    return wrapResponse({
      content: agentResult.answer,
      model: internalModel,
      durationMs: Date.now() - startMs,
      inferenceLane: canUseTurboQuantNow ? 'turboquant' : 'hermes',
      runtimeProfile: runtime.profile,
      runtimeAvailable: runtime.runtimeAvailable,
      turboQuantEnabled: runtime.turboQuant,
      rotorQuantKv: runtime.rotorQuantKv,
      draftModel: draftModelEnabled,
      ace: {
        used: true,
        chunks: 0,
        agentsMd: false,
        codeLlmHit: agentResult.cacheTier !== undefined,
        cacheHit: agentResult.cacheTier ? 'prior-answer' : 'none',
      },
      hmm: agentHmmResult
        ? {
            hmmAnalyzerUsed: true,
            intent: agentHmmResult.section,
            confidence: agentHmmResult.confidence,
            state: 'agent_loop',
            signals: ['gemma4_agent', ...(agentResult.toolsUsed ?? [])],
          }
        : undefined,
      toolLoop: {
        toolsUsed: agentResult.toolsUsed ?? [],
        toolRounds: agentResult.rounds ?? 0,
        toolResultChars: 0,
        mcpPort: 8788,
        kvPacketTaskId: devPlan?.kvPacketTaskId,
        stablePrefixHash: devPlan?.stablePrefixHash,
        selectedStableKeys: devPlan?.selectedStableKeys,
        selectedFiles: devPlan?.selectedFiles,
        contextHitCount: devPlan?.contextHitCount,
      },
    });
  }

  // ── ACE path: full retrieval + prompt assembly ──
  // 20s guard: embeddinggemma won't load when VRAM is occupied by gemma4-rotorquant:latest.
  // On timeout we fall through with an empty context — bifrostChat still fires.
  const ACE_TIMEOUT_MS = 20_000;
  const aceStats: Record<string, any> = {};
  const qdrantStartMs = Date.now();
  let mcpCompactSearch: NonNullable<ACEContext['compactSearch']> | null = null;
  if (req.use_mcp) {
    const mcpResult = await callTraceMcp(
      'ace.compact_search',
      {
        query,
        limit: 3,
        tokenBudget: 1200,
        includeFullText: false,
        useCache: true,
      },
      { timeoutMs: 12_000 }
    );

    aceStats.mcpCompactSearch = {
      ok: mcpResult.ok,
      ms: mcpResult.ms,
      error: mcpResult.ok ? undefined : mcpResult.error,
    };

    if (mcpResult.ok && typeof mcpResult.data === 'object' && mcpResult.data !== null) {
      const data = mcpResult.data as Record<string, unknown>;
      const hits = Array.isArray(data.hits) ? data.hits : [];
      mcpCompactSearch = {
        contextTreeId: String(data.context_tree_id ?? ''),
        query: String(data.query ?? query),
        hits: hits.slice(0, 3).map((hit) => {
          const rawHit = hit as Record<string, unknown>;
          const sources = Array.isArray(rawHit.sources)
            ? rawHit.sources.map((item) => String(item))
            : [];
          const rawWeights = rawHit.weights as Record<string, unknown> | undefined;
          return {
            rank: Number(rawHit.rank ?? 0),
            chunkId: String(rawHit.chunkId ?? ''),
            path: String(rawHit.path ?? ''),
            snippet: String(rawHit.snippet ?? ''),
            score: Number(rawHit.score ?? 0),
            topoClass: typeof rawHit.topoClass === 'string' ? rawHit.topoClass : undefined,
            sources,
            weights: {
              lex: Number(rawWeights?.lex ?? 0),
              semantic: Number(rawWeights?.semantic ?? 0),
              authority: Number(rawWeights?.authority ?? 0),
            },
            fullText: typeof rawHit.fullText === 'string' ? rawHit.fullText : undefined,
          };
        }),
        totalCharsEstimate: Number(data.totalCharsEstimate ?? 0),
        cacheHit: Boolean(data.cacheHit),
        elapsedMs: Number(data.elapsedMs ?? mcpResult.ms),
        nextAction: String(data.nextAction ?? ''),
        embedCached: Boolean(data.embedCached),
      };
    }
  }

  const acePromise = assembleACEContext({
    query,
    userId: opts.userId,
    caseId: req.case_id,
    filePath: req.file_path,
    enableCodebaseContext: true,
    enableWebSearch: false,
    modelName: internalModel,
    modelQuant: canUseTurboQuantNow ? 'rotorquant' : runtime.profile,
    kvQuant: `${runtime.kvCacheTypeK ?? 'q8_0'}/${runtime.kvCacheTypeV ?? 'q8_0'}`,
    draftModel: canUseTurboQuantNow,
    backend: canUseTurboQuantNow ? 'turboquant' : 'bifrost',
    tokenizerHash: createHash('sha256')
      .update('embeddinggemma:latest:768')
      .digest('hex')
      .slice(0, 16),
    systemPromptHash: createHash('sha256')
      .update(systemPreamble ?? 'SYSTEM_YORHA_LEGAL')
      .digest('hex')
      .slice(0, 16),
    toolDefinitionsHash: createHash('sha256')
      .update(JSON.stringify(req.tools ?? []))
      .digest('hex')
      .slice(0, 16),
    repoGitSha: process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown',
    corpusHash: 'codebase-graph:unknown',
    ragBundleHash: createHash('sha256').update(query.slice(0, 512)).digest('hex').slice(0, 16),
    graphSnapshotHash: createHash('sha256')
      .update(req.case_id ?? req.file_path ?? 'graph:none')
      .digest('hex')
      .slice(0, 16),
    statsOut: aceStats,
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
      userProfile: null,
      caseContext: null,
      glossaryMatches: null,
      ragChunks: [],
      kbChunks: [],
      caseChunks: [],
      kagNeighbors: [],
      chatHistory: history,
      entities: { statutes: [], cases: [], persons: [], organizations: [], dates: [] },
      practiceTemplate: null,
      queryTags: [],
      webSearchContext: null,
      persona: 'assistant',
      evidenceMetadata: null,
      evidenceConnections: null,
      userAnalyticsContext: null,
      codebaseContext: null,
      policyDecision: null,
    } as AceCtx;
  }
  qdrantMs = Date.now() - qdrantStartMs;

  // The ACE context already includes its own chatHistory injection (per-user
  // semantic recall). Append the request's conversation history on top so the
  // current OpenAI conversation thread is always honoured.
  if (history.length > 0) {
    aceCtx.chatHistory = [...(aceCtx.chatHistory ?? []), ...history];
  }

  if (mcpCompactSearch) {
    aceCtx.compactSearch = mcpCompactSearch;
    const compactHits = mcpCompactSearch.hits.map((hit) => ({
      filePath: hit.path,
      content: hit.snippet,
      score: hit.score,
      lineStart: 0,
      lineEnd: 0,
      tags: [],
      gpuCluster: null,
      pageRankScore: null,
      routeType: null,
      hasAuthGuard: null,
      somCluster: null,
      graphAuthorityScore: null,
      encoded64Score: null,
      communityId: null,
      dirSummary: null,
      agentsCardId: null,
      rerankBreakdown: null,
      stableKey: hit.chunkId,
      topoClass: hit.topoClass ?? null,
      cachedLlmOutput: null,
      cachedLlmSource: null,
    }));
    aceCtx.codebaseContext = [...(aceCtx.codebaseContext ?? []), ...compactHits];
  }

  try {
    if (aceCtx.ragChunks?.length) {
      aceStats.attention_weights = await attentionHeadRanker(query, aceCtx.ragChunks);
    }
  } catch (err) {
    console.warn(
      '[ACE Attention] failed to score retrieved chunks:',
      err instanceof Error ? err.message : err
    );
  }

  // Build ACE preflight packet (compact prompt mapping + selected cards)
  let acePreflight: AcePromptPreflightResult | undefined;
  const pipeline = 'ace';
  const ctxCacheKey = `ace:ctx:${createHash('sha256').update(query + pipeline).digest('hex')}`;
  const redisClientForAce = getRedis();
  let acePreflightCacheHit = false;

  try {
    const cachedPreflight = await redisClientForAce.get(ctxCacheKey);
    if (cachedPreflight) {
      acePreflight = JSON.parse(cachedPreflight);
      acePreflightCacheHit = true;
    }
  } catch (err) {
    console.warn('[ACE Preflight Cache] Read failed:', err);
  }

  if (!acePreflightCacheHit) {
    try {
      if (typeof buildAcePromptPreflight === 'function') {
        acePreflight = await buildAcePromptPreflight({
          query,
          intent: undefined,
          modelName: internalModel,
          backend: canUseTurboQuantNow ? 'turboquant' : 'bifrost',
          tokenBudget: ACE_PACKET_TOKEN_CAP,
          repoGitSha: process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown',
          aceCtx,
        } as AcePromptPreflightInput);
        
        if (acePreflight) {
          await redisClientForAce.setex(ctxCacheKey, 3600, JSON.stringify(acePreflight));
        }
      } else {
        console.warn(
          '[ACE Preflight] buildAcePromptPreflight is not a function; skipping preflight.'
        );
      }
    } catch (err) {
      console.warn('[ACE Preflight] failed:', err instanceof Error ? err.message : err);
    }
  }

  if (acePreflight) {
    aceStats.preflight_selected = acePreflight.selectedCards.length;
    aceStats.preflight_ms = acePreflightCacheHit ? 0 : acePreflight.timing.totalMs;
  }

  const prompt = await buildACEPromptCached(aceCtx, query, aceStats);
  if (acePreflight?.prompt?.context) {
    const preflightPacket = [acePreflight.prompt.system, acePreflight.prompt.context]
      .filter(Boolean)
      .join('\n\n');
    prompt.systemPrompt = preflightPacket
      ? `${preflightPacket}\n\n${prompt.systemPrompt}`
      : prompt.systemPrompt;
  }
  const qHash = createHash('sha1').update(query).digest('hex').slice(0, 16);
  const responseContextMeta = collectResponseContextMeta(aceCtx);
  if (acePreflight) {
    responseContextMeta.sourceRefs = [
      ...new Set([...responseContextMeta.sourceRefs, ...acePreflight.sourceRefs]),
    ];
    responseContextMeta.chunkIds = [
      ...new Set([...responseContextMeta.chunkIds, ...acePreflight.chunkIds]),
    ];
    responseContextMeta.contextPacketVersion = acePreflight.version;
  }

  let acePacketTokens = countTokens(prompt.systemPrompt);
  if (acePacketTokens > ACE_PACKET_TOKEN_CAP) {
    const originalAceTokens = acePacketTokens;
    const clipped = enforceTokenBudget(prompt.systemPrompt, ACE_PACKET_TOKEN_CAP);
    prompt.systemPrompt = clipped.text;
    acePacketTokens = countTokens(prompt.systemPrompt);
    console.warn({
      stage: 'ace_packet_shrink',
      original_tokens: originalAceTokens,
      clipped_tokens: acePacketTokens,
      cache: { topo_hit: !!aceStats.topo_hit, packet_hit: !!aceStats.packet_hit },
    });
  }

  let turbovecSidecar = '';
  try {
    const { runTurbovecPreIngestion } = await import('$lib/server/ai/turbovec-ingest-sidecar.js');
    turbovecSidecar = await runTurbovecPreIngestion(query, {
      userId: opts.userId?.toString(),
      filePath: req.file_path,
    });
  } catch (err) {
    console.warn('[TurboVec sidecar] failed:', err);
  }

  let sysFull = systemPreamble
    ? `${systemPreamble}\n\n${prompt.systemPrompt}`
    : prompt.systemPrompt;
  if (turbovecSidecar) {
    sysFull = `${sysFull}\n\n${turbovecSidecar}`;
  }
  let kvPacketTaskId: string | undefined;
  let stablePrefixHash: string | undefined;
  let kvContextBlock = '';

  try {
    const kv = await import('$lib/server/ai/kv-context-controller.js');
    const hotFiles = (aceCtx.ragChunks ?? [])
      .map((c) => (c as unknown as Record<string, unknown>).filePath as string)
      .filter(Boolean)
      .slice(0, 8);

    kvPacketTaskId = `task:${qHash}`;
    const packet = await kv.buildKvContextPacket({
      taskId: kvPacketTaskId,
      query,
      hotFiles,
    });
    stablePrefixHash = packet.stablePrefixHash;

    // Replace ACE system prompt with the stable prefix (KV cache reuse on llama-server)
    const stablePrefix = kv.getStableSystemPrefix();
    sysFull = systemPreamble
      ? `${stablePrefix}\n\n${systemPreamble}\n\n${prompt.systemPrompt}`
      : `${stablePrefix}\n\n${prompt.systemPrompt}`;
    if (turbovecSidecar) {
      sysFull = `${sysFull}\n\n${turbovecSidecar}`;
    }

    // Compressed TOC block injected before the user query
    kvContextBlock = kv.formatKvPacketForPrompt(packet);
  } catch {
    /* KV controller unavailable — use plain ACE prompt */
  }

  // Prompt ordering: stable system prefix + repo/tool rules first,
  // dynamic ACE packet next, then conversation history, then current query.
  let messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
    { role: 'system', content: sysFull },
    ...(kvContextBlock ? [{ role: 'system' as const, content: kvContextBlock }] : []),
    ...history,
    { role: 'user', content: query },
  ];

  const originalRequestedMaxTokens = req.max_tokens;
  const requestedMaxTokens = clampRequestedMaxTokens(originalRequestedMaxTokens);
  if (originalRequestedMaxTokens != null && requestedMaxTokens !== originalRequestedMaxTokens) {
    console.warn({
      stage: 'max_tokens_clamped',
      requested: originalRequestedMaxTokens,
      clamped: requestedMaxTokens,
      limit: Math.min(4096, OPENAI_MAX_OUTPUT_TOKENS),
    });
  }

  let inputTokens = countTokens(messages.map((m) => m.content ?? '').join('\n'));
  const maxContextSize = RUNTIME_CONTEXT_SIZE;
  let availableContextTokens = maxContextSize - inputTokens;

  if (inputTokens > OPENAI_HARD_INPUT_CAP) {
    console.error({
      stage: 'context_compaction_required',
      input_tokens: inputTokens,
      hard_cap: OPENAI_HARD_INPUT_CAP,
      action: 'summarize_history_and_rebuild_ace_packet',
    });

    history = summarizeHistory(history);
    prompt.systemPrompt = enforceTokenBudget(prompt.systemPrompt, ACE_PACKET_TOKEN_CAP).text;
    acePacketTokens = countTokens(prompt.systemPrompt);
    sysFull = systemPreamble ? `${systemPreamble}\n\n${prompt.systemPrompt}` : prompt.systemPrompt;
    messages = [
      { role: 'system', content: sysFull },
      ...(kvContextBlock ? [{ role: 'system' as const, content: kvContextBlock }] : []),
      ...history,
      { role: 'user', content: query },
    ];
    inputTokens = countTokens(messages.map((m) => m.content ?? '').join('\n'));
    availableContextTokens = maxContextSize - inputTokens;
  }

  const budgetThreshold = Math.floor(maxContextSize * 0.85);

  const hasSpecializedRetrieval =
    hasTools || isCodingQuery || Boolean(req.file_path || req.case_id);
  const finalModelUsed = internalModel;
  let budgetGuardTriggered = false;
  const hmmResult = (() => {
    try {
      return classifyQuerySection(query);
    } catch {
      return null;
    }
  })();
  const topK = aceStats.top_k != null ? aceStats.top_k : maxContextSize >= 24576 ? 5 : 3;
  const routingLabels = deriveRoutingLabels(aceCtx);

  // ── Sink Write (fire-and-forget): propagate structural labels to Redis / Qdrant / JSONL / ClusterCard
  // Does not block inference — errors are swallowed after console.warn.
  {
    const primaryCluster = aceCtx.clusterContext?.[0];
    const primaryChunk = aceCtx.codebaseContext?.[0];
    const labelFileKey =
      ((primaryChunk as Record<string, unknown> | undefined)?.['filePath'] as string) ||
      ((primaryChunk as Record<string, unknown> | undefined)?.['stableKey'] as string) ||
      req.file_path ||
      qHash;
    const labelClusterId =
      primaryCluster?.clusterKey ||
      ((primaryChunk as Record<string, unknown> | undefined)?.['clusterKey'] as string) ||
      undefined;
    const labelQdrantPointId = (primaryChunk as Record<string, unknown> | undefined)?.[
      'pointId'
    ] as string | number | undefined;
    orchestrateLabels(
      {
        jsonb: routingLabels.tags as Record<string, unknown>,
        centroid: {
          label: routingLabels.centroid_label,
          topology: routingLabels.topology_label,
          clusterKey: routingLabels.cluster_key,
        },
        karpathy: {
          bucket: routingLabels.hotness_bucket,
        },
      },
      {
        redisKey: labelFileKey,
        clusterId: labelClusterId,
        jsonl: {
          recordId: qHash,
          query,
          model: finalModelUsed,
          latencyMs: Date.now() - startMs,
        },
        // Qdrant setPayload requires a real point id, not a file path/stable key.
        ...(labelQdrantPointId != null
          ? { qdrant: { collection: 'codebase_chunks_768', pointId: labelQdrantPointId } }
          : {}),
      }
    ).catch(() => {
      /* fire-and-forget */
    });
  }
  const promptContextSignature = createHash('sha256')
    .update(`${kvContextBlock}\n${history.map((m) => `${m.role}:${m.content ?? ''}`).join('\n')}`)
    .digest('hex')
    .slice(0, 16);

  if (!stablePrefixHash) {
    stablePrefixHash = hashStr(sysFull);
  }
  const userQueryHash = hashStr(query);

  const packetKey = buildAcePacketCacheKey({
    model: finalModelUsed,
    stablePrefixHash,
    userIntent: query,
    routingSignature: labelsSignature(routingLabels),
    dynamicContextSignature: promptContextSignature,
  });

  const completionKey = buildAceCompletionCacheKey(packetKey, userQueryHash);
  const redisLookupStartMs = Date.now();
  const cachedPrompt = await getExactMatchCache(completionKey);
  redisMs = Date.now() - redisLookupStartMs;

  const intentRankerDecision = await rankIntent({
    query,
    model: finalModelUsed,
    userId: opts.userId,
    history,
    completionKey,
    packetKey,
    exactCacheEntry: cachedPrompt,
    exactCacheChecked: true,
    caseId: req.case_id,
    filePath: req.file_path,
  });

  void logIntentEvalEvent({
    userId: opts.userId,
    sessionId: undefined,
    model: finalModelUsed,
    queryHash: intentRankerDecision.queryHash,
    decision: intentRankerDecision.decision,
    confidence: intentRankerDecision.confidence,
    rankedCandidates: intentRankerDecision.rankedCandidates,
    rankingLoss: intentRankerDecision.rankingLoss,
    intentLabel: intentRankerDecision.intentLabel,
    intentConfidence: intentRankerDecision.intentConfidence,
    cacheKeys: intentRankerDecision.cacheKeys,
    featureInputs: intentRankerDecision.selectedFeatureInputs,
    didYouMean: intentRankerDecision.didYouMean,
    durationMs: Date.now() - startMs,
    queryPreview: query,
  });

  if (cachedPrompt) {
    // Emit cache access metrics for prompt-cache hit (best-effort, non-blocking)
    try {
      const redis = getRedis();
      recordContextCacheAccess(redis, {
        cacheKey: completionKey,
        cacheSource: 'prompt-cache',
        contextCacheHit: true,
        reusedChunkCount:
          (aceCtx.ragChunks?.length ?? 0) +
          (aceCtx.kbChunks?.length ?? 0) +
          (aceCtx.caseChunks?.length ?? 0),
        promptTokensSavedEstimate: inputTokens - acePacketTokens,
        packId: packetKey,
        query,
        contextBudgetTokens: ACE_PACKET_TOKEN_CAP,
        finalContextTokens: acePacketTokens,
      } as any).catch(() => {});
    } catch {
      /* best-effort */
    }
    return wrapResponse({
      content: cachedPrompt.content,
      model: finalModelUsed,
      durationMs: Date.now() - startMs,
      inferenceLane: undefined,
      runtimeProfile: runtime.profile,
      runtimeAvailable: runtime.runtimeAvailable,
      turboQuantEnabled: runtime.turboQuant,
      rotorQuantKv: runtime.rotorQuantKv,
      draftModel: draftModelEnabled,
      modelName: finalModelUsed,
      backend: 'redis-exact-match',
      kvQuant: `${runtime.kvCacheTypeK ?? 'q8_0'}/${runtime.kvCacheTypeV ?? 'q8_0'}`,
      selectedLane: 'redis',
      fallbackReason: null,
      contextPackKey: packetKey,
      sourceRefs: responseContextMeta.sourceRefs,
      chunkIds: responseContextMeta.chunkIds,
      timingTrace: {
        redisMs,
        qdrantMs,
        postgresMs: 0,
        graphMs: 0,
        bifrostMs: 0,
        turboquantMs: 0,
        totalMs: Date.now() - startMs,
        selectedLane: 'redis',
        fallbackReason: null,
      },
      ace: {
        used: true,
        chunks:
          (aceCtx.ragChunks?.length ?? 0) +
          (aceCtx.kbChunks?.length ?? 0) +
          (aceCtx.caseChunks?.length ?? 0),
        agentsMd: !!aceCtx.agentsMd?.markdown,
        codeLlmHit: !!aceCtx.codeLlmHit?.llmOutput,
        cacheHit: 'prompt-cache',
        acePacketTokens,
        inputTokens,
        maxContextSize,
        availableContextTokens,
        budgetGuardTriggered,
        topoHit: !!aceStats.topo_hit,
        packetHit: !!aceStats.packet_hit,
        topK,
      },
      hmm: hmmResult
        ? {
            hmmAnalyzerUsed: true,
            intent: hmmResult.section,
            confidence: hmmResult.confidence,
            state: 'context_sufficient',
            signals: ['ace_retrieval', 'qdrant', ...(aceCtx.agentsMd ? ['LLMS.md'] : [])],
          }
        : undefined,
      topoPrefilter: aceStats.topoPrefilter ?? null,
      toolLoop: {
        toolsUsed: [],
        toolRounds: 0,
        toolResultChars: 0,
        priorAnswerKey: aceCtx.codeLlmHit ? `query:${qHash}` : undefined,
        mcpPort: 8788,
        kvPacketTaskId,
        stablePrefixHash,
      },
      mcpCompactSearchHitCount: mcpCompactSearch?.hits.length ?? 0,
      mcpCompactSearchCacheHit: mcpCompactSearch?.cacheHit,
      mcpCompactSearchMs: mcpCompactSearch?.elapsedMs,
    });
  }

  const laneDecision = selectAceLane({
    inputTokens,
    acePacketTokens,
    requestedMaxTokens,
    hasSpecializedRetrieval,
    canUseTurboQuantNow,
  });
  let selectedLane: AceSelectedLane = laneDecision.selectedLane;
  let fallbackReason: string | null = laneDecision.fallbackReason;
  let inferenceLane: InferenceLane = selectedLane;

  const runtimeLog = {
    stage: 'llm_request_budget_check',
    model: finalModelUsed,
    profile: runtime.profile,
    turboQuantEnabled: runtime.turboQuant,
    runtimeAvailable: runtime.runtimeAvailable,
    canUseTurboQuantNow,
    cache_prompt_supported: runtime.turboQuant,
    turbo_profile: runtime.profile,
    input_tokens: inputTokens,
    requested_max_tokens: requestedMaxTokens,
    max_context_size: maxContextSize,
    budget_threshold: budgetThreshold,
    max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
    ace_packet_tokens: acePacketTokens,
    available_context_tokens: availableContextTokens,
    budget_guard_triggered: budgetGuardTriggered,
    topo_hit: !!aceStats.topo_hit,
    packet_hit: !!aceStats.packet_hit,
    chunk_count:
      (aceCtx.ragChunks?.length ?? 0) +
      (aceCtx.kbChunks?.length ?? 0) +
      (aceCtx.caseChunks?.length ?? 0),
    inference_lane: inferenceLane,
    selected_lane: selectedLane,
    fallback_reason: fallbackReason,
  };

  const originalHistoryTokenCount = countTokens(history.map((m) => m.content).join('\n'));
  const originalAcePacketTokens = acePacketTokens;
  const originalInputTokens = inputTokens;

  if (inputTokens + requestedMaxTokens > budgetThreshold) {
    budgetGuardTriggered = true;
    history = trimHistoryForBudget(history, 2);
    const historyAfterTokens = countTokens(history.map((m) => m.content).join('\n'));

    const shrinkResult = enforceTokenBudget(prompt.systemPrompt, 2800);
    prompt.systemPrompt = shrinkResult.text;
    acePacketTokens = countTokens(prompt.systemPrompt);
    sysFull = systemPreamble ? `${systemPreamble}\n\n${prompt.systemPrompt}` : prompt.systemPrompt;

    messages = [
      { role: 'system', content: sysFull },
      ...(kvContextBlock ? [{ role: 'system' as const, content: kvContextBlock }] : []),
      ...history,
      { role: 'user', content: query },
    ];

    inputTokens = countTokens(messages.map((m) => m.content ?? '').join('\n'));
    availableContextTokens = maxContextSize - inputTokens;

    console.error({
      ...buildBudgetTrace(
        'llm_budget_guard',
        runtime,
        originalInputTokens,
        requestedMaxTokens,
        maxContextSize,
        originalAcePacketTokens,
        aceStats
      ),
      budget_threshold: budgetThreshold,
      budget_guard: true,
      original_history_tokens: originalHistoryTokenCount,
      history_tokens_after: historyAfterTokens,
      ace_packet_tokens_after: acePacketTokens,
      input_tokens_after: inputTokens,
      available_context_tokens_after: availableContextTokens,
      top_k: 3,
      reason: 'budget_guard_triggered',
    });
  }

  if (requestedMaxTokens > OPENAI_MAX_OUTPUT_TOKENS) {
    console.error({
      ...runtimeLog,
      error: 'requested_max_tokens_exceeds_output_limit',
    });
    throw new BudgetExceededError(
      `Requested max_tokens (${requestedMaxTokens}) exceeds permitted output limit (${OPENAI_MAX_OUTPUT_TOKENS}).`
    );
  }

  if (inputTokens + requestedMaxTokens > maxContextSize) {
    console.error({
      ...runtimeLog,
      error: 'context_window_exceeded',
      total_requested: inputTokens + requestedMaxTokens,
      available_context_tokens: availableContextTokens,
    });
    throw new BudgetExceededError(
      `Request exceeds context window: input ${inputTokens} + max_tokens ${requestedMaxTokens} > ${maxContextSize}. Reduce history or max_tokens.`
    );
  }

  if (availableContextTokens < OPENAI_RESERVED_COMPLETION_TOKENS) {
    console.warn({
      ...runtimeLog,
      warning: 'low_response_budget',
      reserved_completion_tokens: OPENAI_RESERVED_COMPLETION_TOKENS,
      available_context_tokens: availableContextTokens,
    });
  }

  const chunkCount =
    (aceCtx.ragChunks?.length ?? 0) +
    (aceCtx.kbChunks?.length ?? 0) +
    (aceCtx.caseChunks?.length ?? 0);

  console.log({
    stage: 'llm_request',
    input_tokens: inputTokens,
    max_ctx: maxContextSize,
    cache: {
      topo_hit: !!aceStats.topo_hit,
      packet_hit: !!aceStats.packet_hit,
    },
    ace_packet_tokens: acePacketTokens,
    chunk_count: chunkCount,
    top_k: topK,
    inference_lane: inferenceLane,
  });

  // ACE Inference Lane Router:
  // Redis exact-match already short-circuited above. For generation, prefer
  // TurboQuant for small/fast or strict/heavy requests, and Bifrost for the
  // normal semantic-reuse path. If the primary lane fails, fall back once and
  // record the reason in the timing trace.
  let text: string;
  const runTurboquant = async () => {
    const turboStartedMs = Date.now();
    const result = await turboQuantChat(messages, internalModel, {
      temperature: req.temperature,
      maxTokens: requestedMaxTokens,
    });
    turboquantMs = Date.now() - turboStartedMs;
    selectedLane = 'turboquant';
    inferenceLane = 'turboquant';
    return extractAssistantText(result);
  };
  const runBifrost = async () => {
    const bifrostStartedMs = Date.now();
    const result = await bifrostChat(messages, internalModel, {
      temperature: req.temperature,
      maxTokens: requestedMaxTokens,
    });
    bifrostMs = Date.now() - bifrostStartedMs;
    selectedLane = 'bifrost';
    inferenceLane = 'bifrost';
    return extractAssistantText(result);
  };

  if (selectedLane === 'turboquant') {
    try {
      text = await runTurboquant();
    } catch (err) {
      fallbackReason = fallbackReason ?? 'turboquant_failed';
      console.warn('[ACE Lane Router] TurboQuant failed; falling back to Bifrost:', err);
      try {
        text = await runBifrost();
      } catch (bifrostErr) {
        fallbackReason = `${fallbackReason};bifrost_failed`;
        console.warn('[ACE Lane Router] Bifrost fallback failed; trying Hermes:', bifrostErr);
        const hermesStartedMs = Date.now();
        text = await runHermesChat(messages, requestedMaxTokens, req.temperature);
        // Keep generation lane aligned with the actual fallback backend.
        bifrostMs = Math.max(bifrostMs, Date.now() - hermesStartedMs);
      }
    }
  } else {
    try {
      text = await runBifrost();
    } catch (err) {
      fallbackReason = fallbackReason ?? 'bifrost_failed';
      console.warn('[ACE Lane Router] Bifrost failed; falling back to TurboQuant:', err);
      if (canUseTurboQuantNow) {
        try {
          text = await runTurboquant();
        } catch (turboErr) {
          fallbackReason = `${fallbackReason};turboquant_failed`;
          console.warn('[ACE Lane Router] TurboQuant fallback failed; trying Hermes:', turboErr);
          const hermesStartedMs = Date.now();
          text = await runHermesChat(messages, requestedMaxTokens, req.temperature);
          bifrostMs = Math.max(bifrostMs, Date.now() - hermesStartedMs);
        }
      } else {
        fallbackReason = `${fallbackReason};turboquant_unavailable`;
        const hermesStartedMs = Date.now();
        text = await runHermesChat(messages, requestedMaxTokens, req.temperature);
        bifrostMs = Math.max(bifrostMs, Date.now() - hermesStartedMs);
      }
    }
  }

  text = text.trim() || '[No assistant content returned by model]';

  void Promise.all([
    setExactMatchCache(
      packetKey,
      {
        content: sysFull,
        model: finalModelUsed,
        backend: 'openai-facade-packet',
        promptTokens: inputTokens,
        completionTokens: 0,
        cachedPromptTokens: acePacketTokens,
      },
      86400 // 24h
    ),
    setExactMatchCache(
      completionKey,
      {
        content: text,
        model: finalModelUsed,
        backend: 'openai-facade',
        promptTokens: inputTokens,
        completionTokens: countTokens(text),
        cachedPromptTokens: acePacketTokens,
        somCluster: aceCtx.ragChunks?.[0]?.somCluster,
        gpuCluster: aceCtx.ragChunks?.[0]?.gpuCluster,
      },
      86400 // 24h
    ),
  ]).catch(() => {});

  // Store in Scenario Cache (Qdrant + Postgres + Redis) for future lookup
  storeScenario(query, text).catch((err) => {
    console.warn('[Scenario Cache] Storing scenario failed:', err);
  });

  // Fire-and-forget: store answer so run-2 gets a prior-answer cache hit
  import('$lib/server/cache/code-llm-index.js')
    .then(({ recordRagAnswer }) => {
      recordRagAnswer(`query:${qHash}`, text, {
        query,
        glyphClusterId: aceCtx.ragChunks?.[0]?.somCluster,
      }).catch(() => {});
    })
    .catch(() => {});

  // Fire-and-forget: seed reward queue with weak implicit signal.
  // Real signals (thumbs_up/down, copy, dwell) arrive later via /api/analytics/feedback
  // and override this with stronger reward values.
  import('$lib/server/analytics/reward-events.js')
    .then(({ recordRewardEvent }) => {
      const selectedIds = (aceCtx.acePayloads ?? aceCtx.ragChunks ?? [])
        .slice(0, topK)
        .map((c: { chunk_id?: string; id?: string }) => c.chunk_id ?? c.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      recordRewardEvent({
        query,
        selected_chunk_ids: selectedIds,
        rejected_chunk_ids: [],
        signal: 'answer_served',
        reward: 0.1,
        pipeline: 'ace',
        user_id: opts.userId,
        session_id: opts.userId,
        timestamp: Date.now(),
      }).catch(() => {});
    })
    .catch(() => {});

  // When a prior-answer cache hit is present, compress it to an HCA 128-token card
  // so the next related query gets a compact prior-answer hint instead of full retrieval.
  let priorAnswerKey: string | undefined;
  if (aceCtx.codeLlmHit?.llmOutput) {
    const hcaKey = `query:${qHash}`;
    compressToHCACard(aceCtx.codeLlmHit.llmOutput, hcaKey, 'openai-facade', {
      type: 'prior-answer',
      ttl: '6h',
      embeddingQueued: true,
      fromRedis: true,
    });
    priorAnswerKey = hcaKey;
  }

  // Log the LLM Synthesis event durably
  try {
    const { logLlmSynthesisEvent } = await import('$lib/server/llm-synthesis/log-event.js');
    const cleanAcePacket: Record<string, any> = {
      systemPrompt: sysFull,
      aceStats: {
        topo_hit: aceStats.topo_hit,
        packet_hit: aceStats.packet_hit,
        topoPrefilter: aceStats.topoPrefilter ?? null,
      },
      topK,
      mcpCompactSearchHitCount: mcpCompactSearch?.hits.length ?? 0,
      mcpCompactSearchCacheHit: mcpCompactSearch?.cacheHit ?? false,
      mcpCompactSearchMs: mcpCompactSearch?.elapsedMs ?? 0,
    };

    // Strict security scrubbing of forbidden fields in telemetry
    let serialized = JSON.stringify(cleanAcePacket);
    for (const key of ['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor', 'cudaPointer']) {
      serialized = serialized.replace(new RegExp(key, 'gi'), 'cleaned_param');
    }
    const safeAcePacket = JSON.parse(serialized);

    const sourceRefs = (aceCtx.ragChunks ?? []).map((c) => ({
      name: c.filePath ? (c.filePath.split('/').pop()?.split('\\').pop() ?? 'unknown') : 'unknown',
      path: c.filePath ?? 'unknown',
      score: c.score ?? 0,
    }));

    await logLlmSynthesisEvent({
      runId: `run-${qHash}-${Date.now()}`,
      sessionId: opts.userId?.toString() ?? 'session-default',
      userId: typeof opts.userId === 'number' ? opts.userId : undefined,
      query,
      profile: runtime.profile || 'openai-facade',
      acePacket: safeAcePacket,
      toolCalls: [],
      sourceRefs,
      cacheKeys: {
        exact: completionKey,
        packet: packetKey,
        hca: priorAnswerKey ?? '',
      },
      model: finalModelUsed,
    });
  } catch (err) {
    console.warn('[LLM Synthesis Log] failed to record event:', err);
  }

  // Emit ACE metrics for fresh generation (best-effort, non-blocking)
  try {
    const redis = getRedis();
    recordContextCacheAccess(redis, {
      cacheKey: completionKey,
      cacheSource: 'openai-facade',
      contextCacheHit: false,
      reusedChunkCount: chunkCount,
      durationMs: Date.now() - startMs,
      promptTokens: inputTokens,
      completionTokens: countTokens(text),
      promptTokensSavedEstimate: inputTokens - acePacketTokens,
      packId: packetKey,
      query,
      contextBudgetTokens: ACE_PACKET_TOKEN_CAP,
    } as any).catch(() => {});
  } catch (_e) {
    /* best-effort telemetry — ignore errors */
  }

  return wrapResponse({
    content: text,
    model: finalModelUsed,
    durationMs: Date.now() - startMs,
    inferenceLane,
    runtimeProfile: runtime.profile,
    runtimeAvailable: runtime.runtimeAvailable,
    turboQuantEnabled: runtime.turboQuant,
    rotorQuantKv: runtime.rotorQuantKv,
    draftModel: draftModelEnabled,
    modelName: finalModelUsed,
    backend: selectedLane,
    kvQuant: `${runtime.kvCacheTypeK ?? 'q8_0'}/${runtime.kvCacheTypeV ?? 'q8_0'}`,
    selectedLane,
    fallbackReason,
    contextPackKey: packetKey,
    sourceRefs: responseContextMeta.sourceRefs,
    chunkIds: responseContextMeta.chunkIds,
    timingTrace: {
      redisMs: typeof redisMs !== 'undefined' ? redisMs : 0,
      qdrantMs: typeof qdrantMs !== 'undefined' ? qdrantMs : 0,
      postgresMs: typeof postgresMs !== 'undefined' ? postgresMs : 0,
      graphMs: typeof graphMs !== 'undefined' ? graphMs : 0,
      bifrostMs: typeof bifrostMs !== 'undefined' ? bifrostMs : 0,
      turboquantMs: typeof turboquantMs !== 'undefined' ? turboquantMs : 0,
      totalMs: Date.now() - startMs,
      selectedLane,
      fallbackReason,
    },
    ace: {
      used: true,
      chunks: chunkCount,
      agentsMd: !!aceCtx.agentsMd?.markdown,
      codeLlmHit: !!aceCtx.codeLlmHit?.llmOutput,
      cacheHit: aceCtx.codeLlmHit ? 'prior-answer' : aceCtx.agentsMd ? 'LLMS.md' : 'none',
      acePacketTokens,
      inputTokens,
      maxContextSize,
      availableContextTokens,
      budgetGuardTriggered,
      topoHit: !!aceStats.topo_hit,
      packetHit: !!aceStats.packet_hit,
      topK,
    },
    topoPrefilter: aceStats.topoPrefilter ?? null,
    hmm: hmmResult
      ? {
          hmmAnalyzerUsed: true,
          intent: hmmResult.section,
          confidence: hmmResult.confidence,
          state: 'context_sufficient',
          signals: ['ace_retrieval', 'qdrant', ...(aceCtx.agentsMd ? ['LLMS.md'] : [])],
        }
      : undefined,
    toolLoop: {
      toolsUsed: [],
      toolRounds: 0,
      toolResultChars: 0,
      priorAnswerKey,
      mcpPort: 8788,
      kvPacketTaskId,
      stablePrefixHash,
    },
    mcpCompactSearchHitCount: mcpCompactSearch?.hits.length ?? 0,
    mcpCompactSearchCacheHit: mcpCompactSearch?.cacheHit,
    mcpCompactSearchMs: mcpCompactSearch?.elapsedMs,
  });
}

// ── Response wrapper ───────────────────────────────────────────────────────

function wrapResponse(args: {
  content: string;
  model: string;
  durationMs: number;
  ace: {
    used: boolean;
    chunks: number;
    agentsMd: boolean;
    codeLlmHit: boolean;
    cacheHit: NonNullable<OpenAIChatCompletionResponse['yorha']>['cacheHit'];
    acePacketTokens?: number;
    inputTokens?: number;
    maxContextSize?: number;
    availableContextTokens?: number;
    budgetGuardTriggered?: boolean;
    topoHit?: boolean;
    packetHit?: boolean;
    topK?: number;
  };
  inferenceLane?: 'hermes' | 'turboquant' | 'bifrost';
  runtimeProfile?: string;
  runtimeAvailable?: boolean;
  turboQuantEnabled?: boolean;
  rotorQuantKv?: boolean;
  draftModel?: boolean;
  modelName?: string;
  backend?: string;
  kvQuant?: string;
  selectedLane?: 'redis' | 'turboquant' | 'bifrost';
  fallbackReason?: string | null;
  contextPackKey?: string;
  sourceRefs?: string[];
  chunkIds?: string[];
  timingTrace?: TimingTrace;
  hmm?: NonNullable<NonNullable<OpenAIChatCompletionResponse['yorha']>['hmm']>;
  topoPrefilter?: { used: boolean; hitCount?: number } | null;
  toolLoop?: {
    toolsUsed?: string[];
    toolRounds?: number;
    toolResultChars?: number;
    priorAnswerKey?: string;
    mcpPort?: number;
    kvPacketTaskId?: string;
    stablePrefixHash?: string;
    // Step 5B
    selectedStableKeys?: string[];
    selectedFiles?: string[];
    contextHitCount?: number;
  };
  mcpCompactSearchHitCount?: number;
  mcpCompactSearchCacheHit?: boolean;
  mcpCompactSearchMs?: number;
}): OpenAIChatCompletionResponse {
  const assistantContent = args.content.trim() || '[No assistant content returned by model]';

  // Token counts: rough estimate (chars/4). Real counts only available when
  // bifrostChat returns them, which it does for direct Ollama but not always
  // for cached Bifrost hits.
  const completionTokens = Math.ceil(assistantContent.length / 4);

  return {
    id: `chatcmpl-yorha-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: args.model,
    timingTrace: args.timingTrace,
    retrievalTrace: args.hmm
      ? {
          hmm: args.hmm,
          topoPrefilter: args.topoPrefilter ?? null,
        }
      : undefined,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: assistantContent },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: args.ace.inputTokens ?? 0,
      completion_tokens: completionTokens,
      total_tokens: (args.ace.inputTokens ?? 0) + completionTokens,
    },
    yorha: {
      aceUsed: args.ace.used,
      contextChunks: args.ace.chunks,
      agentsMd: args.ace.agentsMd,
      codeLlmHit: args.ace.codeLlmHit,
      cacheHit: args.ace.cacheHit,
      durationMs: args.durationMs,
      toolsUsed: args.toolLoop?.toolsUsed,
      toolRounds: args.toolLoop?.toolRounds,
      toolResultChars: args.toolLoop?.toolResultChars,
      priorAnswerKey: args.toolLoop?.priorAnswerKey,
      mcpPort: args.toolLoop?.mcpPort ?? 8788,
      kvPacketTaskId: args.toolLoop?.kvPacketTaskId,
      stablePrefixHash: args.toolLoop?.stablePrefixHash,
      selectedStableKeys: args.toolLoop?.selectedStableKeys,
      selectedFiles: args.toolLoop?.selectedFiles,
      contextHitCount: args.toolLoop?.contextHitCount,
      acePacketTokens: args.ace.acePacketTokens,
      inputTokens: args.ace.inputTokens,
      maxContextSize: args.ace.maxContextSize,
      availableContextTokens: args.ace.availableContextTokens,
      budgetGuardTriggered: args.ace.budgetGuardTriggered,
      topoHit: args.ace.topoHit,
      packetHit: args.ace.packetHit,
      topK: args.ace.topK,
      inferenceLane: args.inferenceLane,
      runtimeProfile: args.runtimeProfile,
      runtimeAvailable: args.runtimeAvailable,
      turboQuantEnabled: args.turboQuantEnabled,
      rotorQuantKv: args.rotorQuantKv,
      draftModel: args.draftModel,
      modelName: args.modelName ?? args.model,
      backend: args.backend,
      kvQuant: args.kvQuant,
      selectedLane: args.selectedLane,
      fallbackReason: args.fallbackReason ?? null,
      contextPackKey: args.contextPackKey,
      sourceRefs: args.sourceRefs,
      chunkIds: args.chunkIds,
      timingTrace: args.timingTrace,
      mcpCompactSearchHitCount: args.mcpCompactSearchHitCount,
      mcpCompactSearchCacheHit: args.mcpCompactSearchCacheHit,
      mcpCompactSearchMs: args.mcpCompactSearchMs,
      hmm: args.hmm,
    },
  };
}

// ── Models list ────────────────────────────────────────────────────────────

export const ADVERTISED_MODELS = [
  { id: 'gemma4-agent',   owned_by: 'local' },  // → gemma4-rotorquant:latest (ACE/KAG/RAG brain)
  { id: 'gemma4-raw',     owned_by: 'local' },  // → gemma4-rotorquant:latest (direct, no ACE)
  { id: 'yorha-legal',    owned_by: 'yorha' },   // → gemma4-rotorquant:latest (alias)
  { id: 'yorha-fast',     owned_by: 'yorha' },   // → gemma3:270m
  { id: 'yorha-hermes',   owned_by: 'yorha' },   // → hermes composer (HERMES_API_URL → bifrostChat gemma4-rotorquant:latest)
  { id: 'gemma4-rotorquant:latest',   owned_by: 'yorha' },   // → gemma4-rotorquant:latest explicit
  { id: 'gemma3-legal',   owned_by: 'yorha' },   // → gemma3-legal
  { id: 'gemma3:270m',    owned_by: 'ollama' },
] as const;
