/**
 * POST /api/synthesis/generate
 *
 * Unified LLM synthesis endpoint with ACE self-evaluation.
 * Pipeline: Auth → Cache → ACE Context Assembly → LLM Generate → Self-Eval → Optional Retry → Cache + Return
 *
 * Supports JSON (default) and SSE streaming modes.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth-helpers.js';
import { ENV } from '$lib/server/env.server.js';
import { rateLimitOrRespond, RateLimitPresets } from '$lib/server/middleware/rate-limit.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { z } from 'zod';

const synthesisRequestSchema = z.object({
  query: z.string().min(3, 'Query must be at least 3 characters').max(5000),
  caseId: z.string().uuid().optional(),
  conversationId: z.string().max(200).optional(),
  persona: z.enum(['neutral', 'prosecutor', 'defense', 'plain-language', 'academic']).optional(),
  maxTokens: z.number().int().min(64).max(8192).optional(),
  temperature: z.number().min(0).max(2).optional(),
  enableACE: z.boolean().optional(),
  retryOnLowQuality: z.boolean().optional(),
  stream: z.boolean().optional(),
  includeCitations: z.boolean().optional(),
  enableCodebaseContext: z.boolean().optional(),
  jurisdiction: z.string().max(200).optional(),
  legalArea: z.string().max(200).optional(),
  sectionTypes: z
    .array(
      z.enum([
        'facts',
        'issues',
        'reasoning',
        'holding',
        'citations',
        'parties',
        'motions',
        'bibliography',
        'procedural_history',
        'sentencing',
        'judgment',
      ])
    )
    .max(11)
    .optional(),
});
import { getVectorCache, setVectorCache } from '$lib/server/vector-cache.js';
import { assembleACEContext, buildACEPromptCached } from '$lib/server/ace/context-assembler.js';
import { evaluateResponse, generateCorrectionPrompt } from '$lib/server/ace/self-prompt.js';
import { rabbitmq } from '$lib/server/queue/rabbitmq-manager-fixed.js';
import { dispatchOrExecuteInline } from '$lib/server/queue/dispatch-inline.js';
import { createHash } from 'crypto';
import { ollamaFetch } from '$lib/server/ollama.js';
import { routeInference } from '$lib/server/inference/inference-router.js';
import { trackTokenUsage } from '$lib/server/ai/token-tracker.js';
import { orderByDependency, extractCitationRefs } from '$lib/server/retrieval/document-dag.js';
import type { DAGDocument } from '$lib/server/retrieval/document-dag.js';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';
import { db } from '$lib/server/db/client';
import { synthesisRuns } from '$lib/server/db/schema-postgres.js';
import { logQuery, logEvent } from '$lib/server/analytics/event-logger.js';
import {
  langGraphSynthesize,
  langGraphSynthesizeStream,
  parseLangGraphSSE,
  type LangGraphSynthesizeResponse,
} from '$lib/server/ai/langgraph-client.js';

// ── Types ─────────────────────────────────────────────────────────────

type SynthesisRequest = z.infer<typeof synthesisRequestSchema>;

interface SynthesisCitation {
  id: string;
  sourceTitle: string;
  quote: string;
}

interface SynthesisEvaluation {
  quality: number;
  completeness: number;
  accuracy: number;
  suggestions: string[];
  wasRetried: boolean;
}

interface SynthesisTiming {
  contextMs: number;
  generateMs: number;
  evalMs: number;
  totalMs: number;
}

interface SynthesisResponse {
  synthesisId: string;
  query: string;
  answer: string;
  citations: SynthesisCitation[];
  evaluation: SynthesisEvaluation | null;
  confidence: number;
  model: string;
  tokensUsed: number;
  timing: SynthesisTiming;
  cached: boolean;
  timestamp: string;
  evaluationUrl: string | null;
  predictedFollowUps: string[];
  /** Dominant HMM legal section inferred from top RAG chunks. null when votes split or no tags. */
  dominantSection: string | null;
  /** True when user analytics context was available and injected into ACE assembly. */
  analyticsContextUsed: boolean;
  /** True when ACE context was served from a predicted-prefetch cache entry. */
  prefetched: boolean;
  /** Where the ACE context came from: pre-assembled & cached vs predicted prefetch vs full L3. */
  aceSource: 'fresh' | 'cache' | 'predicted-prefetch';
  contextSources: {
    ragChunks: number;
    kagNeighbors: number;
    codebaseChunks: number;
    hasEvidence: boolean;
    hasGlossary: boolean;
    hasCaseContext: boolean;
    hasWebSearch: boolean;
  } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────

const MODEL = 'gemma4-legal:latest';
const QUALITY_THRESHOLD = 0.6;

// ── User Analytics + Predictive Pre-fetch ─────────────────────────────

/**
 * Map from HMM legal section state → likely follow-up query templates.
 * Mirrors the LegalHMM transition matrix logic from app.py on the TS side.
 * FACTS → LEGAL_AUTHORITY → CLAIMS → PRAYER/HOLDING progression.
 */
const SECTION_FOLLOWUP: Record<string, string[]> = {
  FACTS:          ['What statutes apply to {entities}?', 'What is the legal standard for {topic}?'],
  LEGAL_AUTHORITY:['What are the elements of {entities}?', 'What defenses apply under {entities}?'],
  CLAIMS:         ['What relief is available for {topic}?', 'What is the burden of proof for {topic}?'],
  PRAYER:         ['What is the likely outcome for {topic}?', 'What precedents support {topic}?'],
  HOLDING:        ['How does this holding apply to {topic}?', 'What are the implications of {topic}?'],
  PARTIES:        ['What claims does {topic} have?', 'What is the procedural history of {topic}?'],
  JURISDICTION:   ['What court has jurisdiction over {topic}?', 'What venue rules apply to {topic}?'],
};

/**
 * Predict 1-2 likely follow-up queries from the current synthesis result.
 * Uses the dominant section type from the response and extracted entities.
 */
function predictFollowUpQueries(
  query: string,
  dominantSection: string | null,
  entities: { statutes: string[]; cases: string[] },
  sectionTypes?: string[]
): string[] {
  const section = dominantSection ?? sectionTypes?.[0]?.toUpperCase() ?? 'FACTS';
  const templates = SECTION_FOLLOWUP[section] ?? SECTION_FOLLOWUP.FACTS;

  // Build entity hint: prefer statutes, fall back to cases, then query noun phrase
  const entityHint =
    entities.statutes[0] ??
    entities.cases[0] ??
    // Extract first noun phrase (≤3 words) from query as fallback
    query.match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/)?.[1] ??
    query.slice(0, 40);

  const topicHint = query.split(' ').slice(0, 6).join(' ');

  return templates.slice(0, 2).map((t) =>
    t.replace('{entities}', entityHint).replace('{topic}', topicHint)
  );
}

/**
 * Fire-and-forget: pre-warm ACE context for predicted follow-up queries.
 * Runs after the main synthesis response is sent — never blocks the caller.
 */
async function prefetchContextForPredictions(
  userId: string,
  predictions: string[],
  caseId: string | undefined,
  persona: string | undefined
): Promise<void> {
  for (const predicted of predictions.slice(0, 2)) {
    try {
      const prefetchKey = buildCacheKey(userId, predicted, caseId, persona);
      const { entry: alreadyCached } = await getVectorCache(prefetchKey, {});
      if (alreadyCached) continue; // already warm

      const ctx = await assembleACEContext({
        query: predicted,
        userId,
        caseId,
        persona: persona as SynthesisRequest['persona'],
      });
      const acePrompt = await buildACEPromptCached(ctx, predicted);
      // Cache the assembled context (not the full synthesis) so next request
      // skips the expensive ACE assembly step (~200-800ms saved)
      setVectorCache(prefetchKey, [{ _prefetched: true, acePrompt, contextSources: {
        ragChunks: ctx.ragChunks.length,
        kagNeighbors: ctx.kagNeighbors.length,
      }}], { searchTime: 0, totalResults: 1, model: MODEL, distanceMetric: 'cosine', threshold: 0 })
        .catch(() => {});

      logEvent({
        userId,
        eventType: 'cache_miss',
        payload: {
          queryHash: createHash('sha256').update(predicted).digest('hex').slice(0, 16),
          queryPreview: `[prefetch] ${predicted.slice(0, 100)}`,
          source: 'server',
        },
      });
    } catch {
      // Never throw — pre-fetch is best-effort
    }
  }
}

/**
 * DAG-order RAG chunks by citation dependency so cited sources appear first.
 */
function dagOrderRAGChunks(
  chunks: import('$lib/server/types/retrieval.js').UnifiedRetrievalResult[]
): typeof chunks {
  if (chunks.length <= 1) return chunks;
  const knownIds = new Set(chunks.map((_, i) => `chunk-${i}`));
  const dagDocs: DAGDocument[] = chunks.map((c, i) => ({
    id: `chunk-${i}`,
    title: c.sourceId ?? c.id,
    score: c.score,
    citations: extractCitationRefs(c.content, knownIds),
    content: c.content,
  }));
  const { ordered } = orderByDependency(dagDocs);
  const chunkMap = new Map(chunks.map((c, i) => [`chunk-${i}`, c]));
  return ordered
    .map((d) => chunkMap.get(d.id))
    .filter((c): c is (typeof chunks)[number] => c !== undefined);
}

function buildCacheKey(userId: string, query: string, caseId?: string, persona?: string): string {
  const payload = `${userId}|${query}|${caseId ?? ''}|${persona ?? 'neutral'}`;
  return `synthesis:${createHash('sha256').update(payload).digest('hex').slice(0, 16)}`;
}

function extractCitations(
  answerText: string,
  ragChunks: import('$lib/server/types/retrieval.js').UnifiedRetrievalResult[]
): SynthesisCitation[] {
  const citations: SynthesisCitation[] = [];
  const refs = answerText.match(/\[Source\s+(\d+)[^\]]*\]/g) ?? [];
  const seen = new Set<string>();

  for (const ref of refs) {
    const match = ref.match(/\[Source\s+(\d+)/);
    if (match && !seen.has(match[1])) {
      seen.add(match[1]);
      const idx = parseInt(match[1], 10) - 1;
      const chunk = ragChunks[idx];
      citations.push({
        id: crypto.randomUUID(),
        sourceTitle: chunk?.sourceId ?? chunk?.id ?? `Source ${match[1]}`,
        quote: ref,
      });
    }
  }
  return citations;
}

function computeConfidence(
  answerText: string,
  citations: SynthesisCitation[],
  eval_?: SynthesisEvaluation | null
): number {
  let score = 0.4;
  if (answerText.length > 100) score += 0.15;
  if (answerText.length > 300) score += 0.1;
  if (citations.length > 0) score += 0.15;
  if (citations.length >= 3) score += 0.1;
  if (eval_ && eval_.quality > 0.7) score += 0.05;
  return Math.min(0.95, score);
}

/** Timer helper for structured response event logging */
function createEventTimer(label: string) {
  const t0 = performance.now();
  const events: Array<{ stage: string; ms: number }> = [];
  return {
    mark(stage: string) {
      events.push({ stage, ms: Math.round(performance.now() - t0) });
    },
    elapsed() {
      return Math.round(performance.now() - t0);
    },
    summary() {
      return `[${label}] ${events.map((e) => `${e.stage}=${e.ms}ms`).join(' → ')} total=${this.elapsed()}ms`;
    },
    events,
  };
}

async function callOllama(
  systemPrompt: string,
  contextWindow: string,
  query: string,
  maxTokens: number,
  temperature: number,
  correctionPrompt?: string | null
): Promise<{ text: string; tokensUsed: number; durationMs: number }> {
  const userPrompt = correctionPrompt
    ? `${contextWindow}\n\nQuestion: ${query}\n\n${correctionPrompt}`
    : `${contextWindow}\n\nQuestion: ${query}\n\nProvide a comprehensive legal analysis. Include [Source N] citations where applicable.`;

  const start = performance.now();
  return traceLLM(
    'synthesis-generate',
    { model: MODEL, prompt: query.slice(0, 500) },
    async (gen) => {
      // TODO: Re-enable TensorRT fast-path when Bifrost timeout is configurable (currently 30s server-side).
      // ACE-enriched synthesis prompts are large/unique — they exceed Bifrost's 30s timeout and have
      // near-zero semantic cache hit rate. routeInference goes TRT→Bifrost→Ollama chain; the Bifrost
      // step sends an orphaned request to Ollama that blocks subsequent direct calls.
      // Only try TRT with a 3s budget — if TRT isn't available instantly, skip to direct Ollama.
      try {
        const trtResult = await Promise.race([
          routeInference({
            prompt: userPrompt,
            systemPrompt,
            maxTokens,
            temperature,
            preferTensorrt: true,
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        if (
          trtResult &&
          (trtResult.backend === 'tensorrt' || trtResult.backend === 'triton') &&
          trtResult.text &&
          !trtResult.error
        ) {
          gen.end({ output: trtResult.text.slice(0, 1000) });
          return {
            text: trtResult.text.trim(),
            tokensUsed: trtResult.usage?.total_tokens ?? Math.ceil(trtResult.text.length / 4),
            durationMs: trtResult.latencyMs,
          };
        }
      } catch {
        // TRT-LLM unavailable — fall through to direct Ollama
      }

      // Direct Ollama (default path — Bifrost skipped due to 30s timeout constraint)
      const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: false,
          options: { num_predict: maxTokens, temperature },
        }),
        signal: AbortSignal.timeout(180_000),
      });

      if (!res.ok) throw new Error(`Ollama ${res.status}: ${res.statusText}`);

      // GPU-accelerated JSON parsing via simdjson (5× faster for ACE synthesis responses)
      const rawText = await res.text();
      const data = fastJsonParse<{ message?: { content?: string }; prompt_eval_count?: number; eval_count?: number }>(rawText);
      const text = (data.message?.content ?? '').trim();
      gen.end({
        output: text.slice(0, 1000),
        usage: { promptTokens: data.prompt_eval_count, completionTokens: data.eval_count },
      });
      return {
        text,
        tokensUsed: data.eval_count ?? Math.ceil(text.length / 4),
        durationMs: performance.now() - start,
      };
    }
  );
}

// ── SSE Stream Handler ────────────────────────────────────────────────

async function handleStream(body: SynthesisRequest, userId: string): Promise<Response> {
  const {
    query,
    maxTokens = 2048,
    temperature = 0.3,
    enableACE = true,
    retryOnLowQuality = true,
  } = body;

  // ── LangGraph streaming fast-path ────────────────────────────────────
  // Translates LangGraph SSE events → SvelteKit synthesis event format.
  const lgStream = await langGraphSynthesizeStream({
    query,
    case_id: body.caseId ?? null,
    temperature,
    max_tokens: maxTokens,
    skip_cache: false,
  });

  if (lgStream) {
    // Pipe LangGraph SSE → SvelteKit SSE with event name translation
    const transformedStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        controller.enqueue(encoder.encode('retry: 3000\n\n'));

        const reader = lgStream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponse = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const evt = parseLangGraphSSE(line);
              if (!evt) continue;

              switch (evt.stage) {
                case 'rag':
                  if (evt.status === 'done') {
                    sendEvent('context_assembled', {
                      ragChunks: evt.hits ?? 0, kagNeighbors: 0, persona: null, contextMs: 0,
                    });
                  }
                  break;
                case 'kag':
                  if (evt.status === 'done') {
                    sendEvent('context_assembled', {
                      ragChunks: evt.hits ?? 0,
                      kagNeighbors: evt.neighbors ?? 0,
                      kagSource: evt.kag_source,
                      webResults: evt.web ?? 0,
                      contextMs: 0,
                    });
                  }
                  break;
                case 'llm':
                  if (evt.token) {
                    fullResponse += evt.token;
                    sendEvent('synthesis_chunk', { text: evt.token });
                  } else if (evt.status === 'running') {
                    sendEvent('synthesis_started', { model: 'gemma4-legal:latest', maxTokens });
                  }
                  break;
                case 'cache':
                  sendEvent('context_assembled', {
                    ragChunks: 0, kagNeighbors: 0, persona: null, contextMs: 0, cache: evt.source,
                  });
                  break;
                case 'done':
                  sendEvent('synthesis_complete', { fullResponse, tokensUsed: Math.ceil(fullResponse.length / 4) });
                  sendEvent('complete', {
                    synthesisId: crypto.randomUUID(),
                    query,
                    answer: fullResponse,
                    citations: evt.citations ?? [],
                    evaluation: null,
                    confidence: evt.confidence ?? 0.5,
                    model: 'gemma4-legal:latest',
                    tokensUsed: Math.ceil(fullResponse.length / 4),
                    timing: { contextMs: 0, generateMs: 0, evalMs: 0, totalMs: 0 },
                    cached: evt.cache !== 'L3-langgraph',
                    timestamp: new Date().toISOString(),
                    evaluationUrl: null,
                    predictedFollowUps: [],
                    dominantSection: null,
                    analyticsContextUsed: false,
                    prefetched: false,
                    aceSource: evt.cache === 'L1-redis' ? 'cache' : 'fresh',
                    contextSources: null,
                  });
                  break;
              }
            }
          }
        } catch (err) {
          sendEvent('error', { message: 'LangGraph stream failed' });
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    return new Response(transformedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  // ── In-process fallback (LangGraph unavailable) ────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Set SSE reconnection interval (3s)
        controller.enqueue(encoder.encode('retry: 3000\n\n'));
        const totalStart = performance.now();

        // Stage 1: Context assembly
        const ctxStart = performance.now();
        const context = await assembleACEContext({
          query,
          userId,
          caseId: body.caseId,
          conversationId: body.conversationId,
          persona: body.persona,
          sectionTypes: body.sectionTypes,
        });
        // DAG-order RAG chunks so cited sources appear before citing sources
        context.ragChunks = dagOrderRAGChunks(context.ragChunks);
        const acePrompt = await buildACEPromptCached(context, query);
        sendEvent('context_assembled', {
          ragChunks: context.ragChunks.length,
          kagNeighbors: context.kagNeighbors.length,
          persona: context.persona,
          contextMs: Math.round(performance.now() - ctxStart),
        });

        // Stage 2: Stream LLM
        sendEvent('synthesis_started', { model: MODEL, maxTokens });

        const userPrompt = `${acePrompt.contextWindow}\n\nQuestion: ${query}\n\nProvide a comprehensive legal analysis. Include [Source N] citations where applicable.`;
        const genRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: 'system', content: acePrompt.systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            stream: true,
            options: { num_predict: maxTokens, temperature },
          }),
        });

        if (!genRes.ok || !genRes.body)
          throw new Error(`Ollama streaming failed: ${genRes.status}`);

        const reader = genRes.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        let tokensUsed = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n').filter((l) => l.trim())) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                fullResponse += parsed.message.content;
                sendEvent('synthesis_chunk', { text: parsed.message.content });
              }
              if (parsed.done) {
                tokensUsed = parsed.eval_count ?? Math.ceil(fullResponse.length / 4);
              }
            } catch {
              /* skip malformed lines */
            }
          }
        }
        reader.releaseLock();

        const generateMs = performance.now() - ctxStart;
        sendEvent('synthesis_complete', { fullResponse, tokensUsed });

        // Stage 3: ACE eval (non-streaming)
        let evaluation: SynthesisEvaluation | null = null;
        let evalMs = 0;
        if (enableACE) {
          const evalStart = performance.now();
          const selfEval = await evaluateResponse({
            query,
            response: fullResponse,
            context,
            backend: 'ollama',
          });
          evalMs = performance.now() - evalStart;
          evaluation = {
            quality: selfEval.quality,
            completeness: selfEval.completeness,
            accuracy: selfEval.accuracy,
            suggestions: selfEval.suggestions,
            wasRetried: false,
          };

          if (retryOnLowQuality && selfEval.quality < QUALITY_THRESHOLD && selfEval.shouldRetry) {
            const correction = generateCorrectionPrompt(selfEval, query, fullResponse);
            if (correction) {
              sendEvent('retry_started', {
                reason: 'Low quality score',
                quality: selfEval.quality,
              });
              const retry = await callOllama(
                acePrompt.systemPrompt,
                acePrompt.contextWindow,
                query,
                maxTokens,
                temperature,
                correction
              );
              fullResponse = retry.text;
              tokensUsed += retry.tokensUsed;
              const retryEval = await evaluateResponse({
                query,
                response: fullResponse,
                context,
                backend: 'ollama',
              });
              evaluation = {
                quality: retryEval.quality,
                completeness: retryEval.completeness,
                accuracy: retryEval.accuracy,
                suggestions: retryEval.suggestions,
                wasRetried: true,
              };
              evalMs += performance.now() - evalStart;
            }
          }
          sendEvent('evaluation', evaluation);
        }

        const citations = extractCitations(fullResponse, context.ragChunks);
        const confidence = computeConfidence(fullResponse, citations, evaluation);
        const totalMs = performance.now() - totalStart;

        const synthesisId = crypto.randomUUID();

        // Section drift guard for stream path (same 50% threshold as sync path)
        const streamSectionCounts = context.ragChunks
          .slice(0, 3)
          .map((c) => (c.metadata?.['primary_state'] as string | undefined) ?? null)
          .filter((s): s is string => s !== null)
          .reduce<Record<string, number>>((acc, s) => { acc[s] = (acc[s] ?? 0) + 1; return acc; }, {});
        const streamTotalVotes = Object.values(streamSectionCounts).reduce((a, b) => a + b, 0);
        const streamTopSection = Object.keys(streamSectionCounts)
          .sort((a, b) => (streamSectionCounts[b] ?? 0) - (streamSectionCounts[a] ?? 0))[0] ?? null;
        const streamTopVotes   = streamTopSection ? (streamSectionCounts[streamTopSection] ?? 0) : 0;
        const streamDominant: string | null =
          streamTopSection && streamTotalVotes > 0 && streamTopVotes / streamTotalVotes >= 0.5
            ? streamTopSection : null;

        const streamAnalyticsUsed = !!(
          context.kagNeighbors.length > 0 ||
          (context as unknown as Record<string, unknown>)['analyticsPatterns'] ||
          (context as unknown as Record<string, unknown>)['userAnalytics']
        );

        sendEvent('complete', {
          synthesisId,
          query,
          answer: fullResponse,
          citations,
          evaluation,
          confidence,
          model: MODEL,
          tokensUsed,
          timing: {
            contextMs: Math.round(performance.now() - ctxStart),
            generateMs: Math.round(generateMs),
            evalMs: Math.round(evalMs),
            totalMs: Math.round(totalMs),
          },
          cached: false,
          timestamp: new Date().toISOString(),
          evaluationUrl: `/api/synthesis/evaluation/${synthesisId}`,
          predictedFollowUps: predictFollowUpQueries(query, streamDominant, { statutes: [], cases: [] }),
          dominantSection: streamDominant,
          analyticsContextUsed: streamAnalyticsUsed,
          prefetched: false,
          aceSource: 'fresh' as const,
          contextSources: {
            ragChunks: context.ragChunks.length,
            kagNeighbors: context.kagNeighbors.length,
            codebaseChunks: 0,
            hasEvidence: false,
            hasGlossary: !!context.glossaryMatches?.length,
            hasCaseContext: !!context.caseContext,
            hasWebSearch: !!context.webSearchContext,
          },
        } satisfies SynthesisResponse);
      } catch (err) {
        sendEvent('error', { message: 'Synthesis failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ── POST Handler ──────────────────────────────────────────────────────

export const POST: RequestHandler = async (event) => {
  if (!event.locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const auth = await requireAuth(event);

  // Rate limiting: 20 requests per 5 minutes (AI endpoint preset)
  const rateLimited = await rateLimitOrRespond(event, RateLimitPresets.aiEndpoint);
  if (rateLimited) return rateLimited;

  const timer = createEventTimer('synthesis');

  // GPU-accelerated JSON parsing via simdjson (5× faster for ACE request payloads)
  const rawText = await event.request.text();
  const raw = fastJsonParse<Record<string, unknown>>(rawText);
  const parsed = synthesisRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const body = parsed.data;

  const {
    query,
    maxTokens = 2048,
    temperature = 0.3,
    enableACE = true,
    includeCitations = true,
  } = body;

  // Step 9: auto-enable codebase context when the query looks code-related
  const enableCodebaseContext =
    body.enableCodebaseContext ??
    /\b(function|class|route|component|schema|hook|store|import|api|endpoint|interface|type|const|export)\b/i.test(
      query
    );

  // SSE stream mode
  if (body.stream) {
    return handleStream(body, auth.user.id);
  }

  // ── JSON mode (async via RabbitMQ worker) ────────────────────────

  try {
    // Stage 1: Cache check (synchronous — return immediately if cached)
    timer.mark('cache-check');
    const cacheKey = buildCacheKey(auth.user.id, query, body.caseId, body.persona);
    const { entry: cached } = await getVectorCache(cacheKey, {});

    // Differentiate full synthesis cache hit vs predicted-prefetch ACE context entry.
    // Prefetch entries have _prefetched:true and contain acePrompt but NOT a full answer.
    // Returning a prefetch entry as a SynthesisResponse would expose a broken shape.
    let aceSource: 'fresh' | 'cache' | 'predicted-prefetch' = 'fresh';
    let prefetchEntry: { acePrompt: unknown; contextSources: unknown } | null = null;

    if (cached) {
      const c = cached as unknown as Record<string, unknown>;
      if (c['synthesisId']) {
        // Full synthesis response — return immediately
        timer.mark('cache-hit');
        console.log(timer.summary());
        return json({
          ...(cached as unknown as SynthesisResponse),
          cached: true,
          aceSource: 'cache',
          prefetched: false,
        });
      }
      if (c['_prefetched']) {
        // Predicted prefetch hit — ACE context pre-built, skip expensive assembly
        aceSource = 'predicted-prefetch';
        prefetchEntry = cached as unknown as { acePrompt: unknown; contextSources: unknown };
        timer.mark('prefetch-hit');
      }
    }

    // Stage 2: LangGraph Docker service (if enabled + healthy)
    // Full DAG: web_search + rg_search → retrieve_rag → retrieve_kag → tag_chunks (HMM)
    //   → assemble_ace → merge → synthesize → self_eval
    // Falls through to RabbitMQ / in-process if unavailable.
    const synthesisId = crypto.randomUUID();
    timer.mark('langgraph-check');

    const lgResult = await langGraphSynthesize({
      query,
      case_id: body.caseId ?? null,
      temperature,
      max_tokens: maxTokens,
      skip_cache: false,
    });

    if (lgResult) {
      timer.mark('langgraph-done');
      const lgCitations: SynthesisCitation[] = (lgResult.citations ?? []).map((c) => ({
        id: crypto.randomUUID(),
        sourceTitle: c.title,
        quote: c.text,
      }));
      const lgConfidence = lgResult.confidence;
      const lgResponse: SynthesisResponse = {
        synthesisId,
        query,
        answer: lgResult.answer,
        citations: lgCitations,
        evaluation: null,
        confidence: lgConfidence,
        model: MODEL,
        tokensUsed: Math.ceil(lgResult.answer.length / 4),
        timing: {
          contextMs: 0,
          generateMs: lgResult.latency_ms,
          evalMs: 0,
          totalMs: timer.elapsed(),
        },
        cached: lgResult.cache !== 'L3-langgraph',
        timestamp: new Date().toISOString(),
        evaluationUrl: null,
        predictedFollowUps: [],
        dominantSection: null,
        analyticsContextUsed: lgResult.kag_neighbors > 0,
        prefetched: false,
        aceSource: lgResult.cache === 'L1-redis' ? 'cache' : 'fresh',
        contextSources: {
          ragChunks: lgResult.rag_hits,
          kagNeighbors: lgResult.kag_neighbors,
          codebaseChunks: lgResult.rg_results,
          hasEvidence: lgResult.rag_hits > 0,
          hasGlossary: false,
          hasCaseContext: !!body.caseId,
          hasWebSearch: lgResult.web_results > 0,
        },
      };
      console.log(`[synthesis] LangGraph path: ${timer.summary()}`);
      return json(lgResponse);
    }

    timer.mark('queue-publish');

    const published = await rabbitmq.publishSynthesisGenerate({
      synthesisId,
      query,
      userId: auth.user.id,
      caseId: body.caseId,
      conversationId: body.conversationId,
      persona: body.persona,
      maxTokens,
      temperature,
      enableACE,
      enableCodebaseContext,
      sectionTypes: body.sectionTypes,
    });

    if (published) {
      timer.mark('queued');
      console.log(timer.summary());
      return json({
        synthesisId,
        status: 'pending',
        pollUrl: `/api/synthesis/evaluation/${synthesisId}`,
        message: 'Synthesis queued — poll pollUrl for results',
      }, { status: 202 });
    }

    // Fallback: RabbitMQ unavailable — run synchronously
    console.warn('[synthesis] RabbitMQ unavailable, running synchronously');
    timer.mark('sync-fallback');

    timer.mark('ace-context-start');
    const ctxStart = performance.now();
    const context = await assembleACEContext({
      query,
      userId: auth.user.id,
      caseId: body.caseId,
      conversationId: body.conversationId,
      persona: body.persona,
      sectionTypes: body.sectionTypes,
      enableCodebaseContext,
      enableWebSearch: true,
    });
    context.ragChunks = dagOrderRAGChunks(context.ragChunks);
    // GPU attention re-ranking: re-score DAG-ordered chunks against the query embedding.
    // Preserves citation chain ordering from DAG while surfacing the most query-relevant
    // chunks first. Best-effort — keeps DAG order if embedding service is unavailable.
    if (context.ragChunks.length > 1) {
      try {
        const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');
        const { scoreAttention } = await import('$lib/server/grpc/graph-ml-client.js');
        const DIM = 768;
        const texts = [query, ...context.ragChunks.map((c) => c.content.slice(0, 512))];
        const embedResult = await generateEmbeddings(texts);
        const queryVec = new Float32Array(embedResult.vectors[0]);
        const chunkVecs = embedResult.vectors.slice(1);
        const n = chunkVecs.length;
        const keysMatrix = new Float32Array(n * DIM);
        chunkVecs.forEach((v, i) => keysMatrix.set(v.slice(0, DIM), i * DIM));
        const attn = await scoreAttention(queryVec, DIM, keysMatrix, n);
        const ranked = context.ragChunks
          .map((c, i) => ({ c, attnScore: attn.scores[i] ?? 0 }))
          .sort((a, b) => b.attnScore - a.attnScore);
        context.ragChunks = ranked.map((x) => x.c);
        timer.mark('attn-rerank');
      } catch {
        // Keep DAG order — attention re-ranking is best-effort
      }
    }
    const acePrompt = await buildACEPromptCached(context, query);
    const contextMs = performance.now() - ctxStart;
    timer.mark('ace-context-done');

    timer.mark('llm-start');
    const gen = await callOllama(
      acePrompt.systemPrompt,
      acePrompt.contextWindow,
      query,
      maxTokens,
      temperature
    );
    const answer = gen.text;
    const tokensUsed = gen.tokensUsed;
    timer.mark('llm-done');

    // GRPO reward score: GPU cosine similarity between answer and query embeddings.
    // Provides a per-run quality signal for LangGraph GRPO fine-tuning.
    // Re-uses the attention embedding call so both ops share the same batch.
    let grpoRewardScore: number | undefined;
    try {
      const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');
      const { scoreGRPOReward } = await import('$lib/server/grpc/graph-ml-client.js');
      const DIM = 768;
      const embedResult = await generateEmbeddings([query, answer.slice(0, 512)]);
      const queryVec = new Float32Array(embedResult.vectors[0]);
      const answerVec = new Float32Array(embedResult.vectors[1]);
      const reward = await scoreGRPOReward(answerVec, queryVec, DIM);
      grpoRewardScore = reward.reward;
      timer.mark('grpo-reward');
    } catch {
      // Best-effort — skip on embedding service failure
    }

    const citations = includeCitations ? extractCitations(answer, context.ragChunks) : [];

    if (enableACE) {
      dispatchOrExecuteInline('ace.evaluate', {
          responseId: synthesisId,
          query,
          response: answer,
          context: {
            ragChunks: context.ragChunks,
            kagNeighbors: context.kagNeighbors,
            persona: context.persona,
          },
        })
        .catch(() => {});
    }

    const confidence = computeConfidence(answer, citations, null);
    timer.mark('response-built');

    // Infer dominant legal section from RAG chunk tags (set by LangGraph tag_chunks node).
    // Drift guard: require ≥50% of sampled votes to avoid noisy retrievals pushing the
    // wrong follow-up track. Tied or split votes fall through to null → FACTS default.
    const sectionCounts = context.ragChunks
      .slice(0, 3)
      .map((c) => (c.metadata?.['primary_state'] as string | undefined) ?? null)
      .filter((s): s is string => s !== null)
      .reduce<Record<string, number>>((acc, s) => { acc[s] = (acc[s] ?? 0) + 1; return acc; }, {});
    const totalVotes  = Object.values(sectionCounts).reduce((a, b) => a + b, 0);
    const topSection  = Object.keys(sectionCounts)
      .sort((a, b) => (sectionCounts[b] ?? 0) - (sectionCounts[a] ?? 0))[0] ?? null;
    const topVotes    = topSection ? (sectionCounts[topSection] ?? 0) : 0;
    // Only trust the dominant section when it holds a clear majority (≥50%)
    const dominantSection: string | null =
      topSection && totalVotes > 0 && topVotes / totalVotes >= 0.5 ? topSection : null;

    const entities: { statutes: string[]; cases: string[] } = {
      statutes: (context.entities as { statutes?: string[] } | undefined)?.statutes ?? [],
      cases:    (context.entities as { cases?: string[] }    | undefined)?.cases    ?? [],
    };

    const predictedFollowUps = predictFollowUpQueries(
      query, dominantSection, entities, body.sectionTypes as string[]
    );

    // Detect analytics enrichment: proxy — context has user-specific neighbors or case data
    const analyticsContextUsed = !!(
      context.kagNeighbors.length > 0 ||
      (context as unknown as Record<string, unknown>)['analyticsPatterns'] ||
      (context as unknown as Record<string, unknown>)['userAnalytics']
    );

    const response: SynthesisResponse = {
      synthesisId,
      query,
      answer,
      citations,
      evaluation: null,
      confidence,
      model: MODEL,
      tokensUsed,
      timing: {
        contextMs: Math.round(contextMs),
        generateMs: Math.round(gen.durationMs),
        evalMs: 0,
        totalMs: timer.elapsed(),
      },
      cached: false,
      timestamp: new Date().toISOString(),
      evaluationUrl: enableACE ? `/api/synthesis/evaluation/${synthesisId}` : null,
      predictedFollowUps,
      dominantSection,
      analyticsContextUsed,
      prefetched: aceSource === 'predicted-prefetch',
      aceSource,
      contextSources: {
        ragChunks: context.ragChunks.length,
        kagNeighbors: context.kagNeighbors.length,
        codebaseChunks: context.codebaseContext?.length ?? 0,
        hasEvidence: !!context.evidenceMetadata?.length,
        hasGlossary: !!context.glossaryMatches?.length,
        hasCaseContext: !!context.caseContext,
        hasWebSearch: !!context.webSearchContext,
      },
    };

    setVectorCache(cacheKey, [response], {
      searchTime: timer.elapsed(),
      totalResults: 1,
      model: MODEL,
      distanceMetric: 'cosine',
      threshold: 0,
    }).catch(() => {});

    trackTokenUsage({
      userId: auth.user.id,
      endpoint: '/api/synthesis/generate',
      model: MODEL,
      promptTokens: 0,
      completionTokens: tokensUsed,
      durationMs: timer.elapsed(),
    });

    // ── Write analytics signal (powers future getTopQueryPatterns) ──────
    logQuery({
      userId: auth.user.id,
      query,
      source: 'server',
      latencyMs: timer.elapsed(),
      resultCount: context.ragChunks.length,
      topHits: context.ragChunks.slice(0, 5).map((c) => c.source ?? ''),
      confidence,
    });
    logEvent({
      userId: auth.user.id,
      eventType: 'rag_search',
      payload: {
        queryHash: createHash('sha256').update(query.toLowerCase().trim()).digest('hex').slice(0, 16),
        queryPreview: query.slice(0, 120),
        resultCount: context.ragChunks.length,
        latencyMs: timer.elapsed(),
        confidence,
        metadata: {
          kagNeighbors: context.kagNeighbors.length,
          dominantSection,
          caseId: body.caseId,
          persona: body.persona,
          predictedFollowUps,
        },
      },
    });

    // ── Pre-fetch ACE context for top predicted follow-ups (fire-and-forget) ─
    prefetchContextForPredictions(auth.user.id, predictedFollowUps, body.caseId, body.persona)
      .catch(() => {});

    // Non-blocking save to synthesis_runs — provides QLoRA training pairs
    db.insert(synthesisRuns).values({
      userId: Number(auth.user.id),
      query,
      answer,
      model: MODEL,
      cacheHit: 'L3-ollama',
      latencyMs: timer.elapsed(),
      confidence,
      grpoRewardScore,
      citations: citations.map((c, i) => ({
        index: i + 1,
        id: c.id,
        title: c.sourceTitle,
        source: c.sourceTitle,
        score: 0,
        section: '',
        text: c.quote,
      })),
    }).catch(() => {});

    console.log(timer.summary());
    return json(response);
  } catch (err) {
    timer.mark('error');
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[synthesis] ${timer.summary()} error=${errMsg.slice(0, 200)}`);
    const isOllamaDown =
      err instanceof Error &&
      (errMsg.includes('Ollama') ||
        errMsg.includes('fetch') ||
        errMsg.includes('Bifrost') ||
        errMsg.includes('timeout'));
    return json(
      {
        error: isOllamaDown ? 'LLM service unavailable — retry in a moment' : 'Synthesis failed',
        degraded: true,
      },
      { status: isOllamaDown ? 502 : 500 }
    );
  }
};
