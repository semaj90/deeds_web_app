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

/**
 * DAG-order RAG chunks by citation dependency so cited sources appear first.
 */
function dagOrderRAGChunks(
  chunks: Array<{ content: string; score: number; source: string }>
): typeof chunks {
  if (chunks.length <= 1) return chunks;
  const knownIds = new Set(chunks.map((_, i) => `chunk-${i}`));
  const dagDocs: DAGDocument[] = chunks.map((c, i) => ({
    id: `chunk-${i}`,
    title: c.source,
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
  ragChunks: Array<{ content: string; score: number; source: string }>
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
        sourceTitle: chunk?.source ?? `Source ${match[1]}`,
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

      const data = await res.json();
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

  const raw = await event.request.json();
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
    retryOnLowQuality = true,
    includeCitations = true,
  } = body;

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
    if (cached) {
      timer.mark('cache-hit');
      console.log(timer.summary());
      return json({ ...(cached as unknown as SynthesisResponse), cached: true });
    }

    // Stage 2: Publish to RabbitMQ worker — returns immediately with synthesisId
    const synthesisId = crypto.randomUUID();
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
      enableCodebaseContext: body.enableCodebaseContext,
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
      enableCodebaseContext: body.enableCodebaseContext,
    });
    context.ragChunks = dagOrderRAGChunks(context.ragChunks);
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