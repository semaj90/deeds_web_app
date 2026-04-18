import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { createHash } from 'crypto';
import { ENV } from '$lib/server/env.server.js';
import type { OllamaResponse } from '$lib/server/ollama.js';
import { getChatModelKeepAlive, ollamaFetch } from '$lib/server/ollama.js';
import { getRedis } from '$lib/server/redis.js';
import { recordSearchQuery } from '$lib/server/analytics/search-analytics.js';
import { z } from 'zod';
import {
  CONTEXTUAL_TOOLS,
  executeContextualTool,
  type ContextualToolResult,
} from '$lib/server/ai/contextual-tools.js';

const SIMPLE_HISTORY_LIMIT = 4;
const TOOL_HISTORY_LIMIT = 6;
const SIMPLE_NUM_CTX = 4096;
const TOOL_NUM_CTX = 6144;
const SIMPLE_NUM_PREDICT = 128;
const TOOL_NUM_PREDICT = 320;
const SIMPLE_TIMEOUT_MS = 60_000;
const TOOL_TIMEOUT_MS = 75_000;
const MAX_STORED_HISTORY = 12;

const SIMPLE_SYSTEM_PROMPT =
  'You are a helpful legal AI assistant. Provide clear, accurate responses about legal topics. Track conversation context to give relevant follow-up responses. Unless the user asks for depth, answer in a single concise paragraph of no more than 5 sentences.';

const TOOL_SYSTEM_PROMPT = `You are a contextual legal AI assistant with agentic tool-calling capabilities.

Tool priority order (MUST follow):
1. **glossary_search** - ALWAYS try this first for legal term definitions, meanings, or concepts
2. **rag_search** - Use for relevant documents, evidence, or precedents; also fall back here if glossary returns no results
3. **web_search** - Use only for up-to-date external information that glossary and RAG cannot provide

Track conversation context and provide structured, well-cited responses. Prefer concise answers unless the user explicitly asks for detail.`;

type OllamaCallStage = 'simple' | 'tool-round' | 'tool-final';

interface OllamaCallDiagnostic {
  stage: OllamaCallStage;
  totalDurationMs: number | null;
  loadDurationMs: number | null;
  promptEvalDurationMs: number | null;
  evalDurationMs: number | null;
  promptEvalCount: number | null;
  evalCount: number | null;
}

function toDurationMs(value?: number): number | null {
  return typeof value === 'number' ? Math.round(value / 1e6) : null;
}

function collectOllamaDiagnostic(
  stage: OllamaCallStage,
  data: Partial<OllamaResponse> | null | undefined
): OllamaCallDiagnostic {
  return {
    stage,
    totalDurationMs: toDurationMs(data?.total_duration),
    loadDurationMs: toDurationMs(data?.load_duration),
    promptEvalDurationMs: toDurationMs(data?.prompt_eval_duration),
    evalDurationMs: toDurationMs(data?.eval_duration),
    promptEvalCount: typeof data?.prompt_eval_count === 'number' ? data.prompt_eval_count : null,
    evalCount: typeof data?.eval_count === 'number' ? data.eval_count : null,
  };
}

function summarizeOllamaDiagnostics(calls: OllamaCallDiagnostic[]) {
  const totalDurationMs = calls.reduce((sum, call) => sum + (call.totalDurationMs ?? 0), 0);
  const loadDurationMs = calls.reduce((sum, call) => sum + (call.loadDurationMs ?? 0), 0);
  const promptEvalDurationMs = calls.reduce(
    (sum, call) => sum + (call.promptEvalDurationMs ?? 0),
    0
  );
  const evalDurationMs = calls.reduce((sum, call) => sum + (call.evalDurationMs ?? 0), 0);
  const promptEvalCount = calls.reduce((sum, call) => sum + (call.promptEvalCount ?? 0), 0);
  const evalCount = calls.reduce((sum, call) => sum + (call.evalCount ?? 0), 0);

  return {
    callCount: calls.length,
    totalDurationMs,
    loadDurationMs,
    promptEvalDurationMs,
    evalDurationMs,
    promptEvalCount,
    evalCount,
    approxNonOllamaMs: Math.max(
      0,
      totalDurationMs - loadDurationMs - promptEvalDurationMs - evalDurationMs
    ),
    calls,
  };
}

const contextualChatSchema = z.object({
  message: z.string().min(1).max(10000),
  sessionId: z.string().max(200).optional(),
  userId: z.string().max(200).optional(),
  caseId: z.string().max(200).optional(),
  enableFunctions: z.boolean().optional(),
  /** Pre-assembled ACE context text from selected evidence/notes (checkbox panel) */
  aceContext: z.string().max(15000).optional(),
});

/**
 * Parse request body from either JSON or FormData.
 * The ContextualEvidenceChatModal sends FormData while direct API callers send JSON.
 */
async function parseRequest(request: Request): Promise<z.infer<typeof contextualChatSchema>> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    return {
      message: String(formData.get('message') ?? ''),
      sessionId: formData.get('sessionId') ? String(formData.get('sessionId')) : undefined,
      userId: formData.get('userId') ? String(formData.get('userId')) : undefined,
      caseId: formData.get('caseId') ? String(formData.get('caseId')) : undefined,
      enableFunctions: formData.get('enableFunctions') === 'true' ? true : undefined,
      aceContext: formData.get('aceContext') ? String(formData.get('aceContext')) : undefined,
    };
  }

  return await request.json();
}

/**
 * POST /api/contextual/chat
 * Contextual chat with HMM state tracking + optional agentic tool calling.
 * Accepts both JSON and FormData (for file upload modal compatibility).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const requestStartedAt = performance.now();
    const raw = await parseRequest(request);
    const parsed = contextualChatSchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        { success: false, error: { message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
        { status: 400 }
      );
    }

    const {
      message,
      sessionId = `session-${Date.now()}`,
      userId = 'anonymous',
      caseId,
      enableFunctions = false,
      aceContext,
    } = parsed.data;

    // Record search query for Search Intelligence analytics (fire-and-forget)
    recordSearchQuery({
      query:    message,
      pipeline: 'contextual',
      cacheHit: false,
      userId:   locals.user.id,
    });

    // Get conversation history from Redis for context
    let conversationHistory: Array<{ role: string; content: string }> = [];
    try {
      const redis = getRedis();
      const cached = await redis.get(`contextual:history:${sessionId}`);
      if (cached) {
        conversationHistory = JSON.parse(cached);
      }
    } catch {
      // Redis unavailable — proceed without history
    }

    // Load case context if caseId provided
    let caseContext: string | null = null;
    if (caseId) {
      try {
        const { db } = await import('$lib/server/db/client');
        const { cases } = await import('$lib/server/db/schema');
        const { eq } = await import('drizzle-orm');
        const caseRows = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
        if (caseRows[0]) {
          const c = caseRows[0];
          caseContext = `Active Case: "${c.title}" (${c.caseNumber || 'No case number'})`;
          if (c.jurisdiction) caseContext += ` | Jurisdiction: ${c.jurisdiction}`;
          if (c.status) caseContext += ` | Status: ${c.status}`;
        }
      } catch {
        // Case context unavailable — non-fatal
      }
    }

    const systemMessages: Array<{ role: 'system'; content: string }> = [
      { role: 'system', content: enableFunctions ? TOOL_SYSTEM_PROMPT : SIMPLE_SYSTEM_PROMPT },
    ];

    if (caseContext) {
      systemMessages.push({ role: 'system', content: `## Case Context\n${caseContext}` });
    }

    if (aceContext) {
      systemMessages.push({ role: 'system', content: `## Selected Evidence & Notes\n${aceContext}` });
    }

    const messages: Array<{ role: string; content: string }> = [
      ...systemMessages,
      ...conversationHistory.slice(-(enableFunctions ? TOOL_HISTORY_LIMIT : SIMPLE_HISTORY_LIMIT)),
      { role: 'user', content: message },
    ];

    let responseText = '';
    const toolResultsCtx: Array<ContextualToolResult> = [];
    const ollamaCallDiagnostics: OllamaCallDiagnostic[] = [];

    if (enableFunctions) {
      // Agentic mode: Ollama native tool calling with iterative loop
      const MAX_TOOL_ROUNDS = 1;
      const MAX_TOTAL_TOOL_CALLS = 3;
      let toolRounds = 0;
      let totalToolCalls = 0;

      while (toolRounds < MAX_TOOL_ROUNDS) {
        const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gemma4-legal:latest',
            messages,
            stream: false,
            keep_alive: getChatModelKeepAlive(),
            tools: CONTEXTUAL_TOOLS,
            options: {
              temperature: 0.1,
              top_k: 20,
              top_p: 0.8,
              num_ctx: TOOL_NUM_CTX,
              num_predict: TOOL_NUM_PREDICT,
              repeat_penalty: 1.05,
            },
          }),
          signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
        });

        if (!res.ok) {
          return json(
            { success: false, error: { message: 'AI service unavailable' } },
            { status: 502 }
          );
        }

        const data = await res.json();
        ollamaCallDiagnostics.push(collectOllamaDiagnostic('tool-round', data));
        const toolCalls = data.message?.tool_calls;

        if (!toolCalls || toolCalls.length === 0) {
          // No tool calls — this is the final response
          responseText = data.message?.content || '';
          break;
        }

        // Execute each tool call (respecting hard total cap)
        messages.push({ role: 'assistant', content: data.message?.content || '' });

        for (const tc of toolCalls) {
          if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) break;
          const toolName = tc.function?.name;
          const toolArgs = tc.function?.arguments || {};
          if (!toolName) continue;

          const tr = await executeContextualTool(toolName, toolArgs, {
            message,
            caseId,
          });
          toolResultsCtx.push(tr);
          totalToolCalls++;
          // Append even on failure so model can synthesise gracefully
          messages.push({ role: 'tool', content: tr.result });
        }

        toolRounds++;
      }

      // If we exhausted rounds without a final text response, request one
      if (!responseText) {
        const finalRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gemma4-legal:latest',
            messages,
            stream: false,
            keep_alive: getChatModelKeepAlive(),
            options: {
              temperature: 0.1,
              top_k: 20,
              top_p: 0.8,
              num_ctx: TOOL_NUM_CTX,
              num_predict: TOOL_NUM_PREDICT,
              repeat_penalty: 1.05,
            },
          }),
          signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
        });
        const finalData = finalRes.ok ? await finalRes.json() : null;
        if (finalData) {
          ollamaCallDiagnostics.push(collectOllamaDiagnostic('tool-final', finalData));
        }
        responseText =
          finalData?.message?.content ||
          'Tool calls completed but could not generate a final response.';
      }
    } else {
      // Simple mode: no tools, single Ollama call
      const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4-legal:latest',
          messages,
          stream: false,
          keep_alive: getChatModelKeepAlive(),
          options: {
            temperature: 0.1,
            top_k: 20,
            top_p: 0.8,
            num_ctx: SIMPLE_NUM_CTX,
            num_predict: SIMPLE_NUM_PREDICT,
            repeat_penalty: 1.05,
          },
        }),
        signal: AbortSignal.timeout(SIMPLE_TIMEOUT_MS),
      });

      if (!res.ok) {
        return json(
          { success: false, error: { message: 'AI service unavailable' } },
          { status: 502 }
        );
      }

      const data = await res.json();
      ollamaCallDiagnostics.push(collectOllamaDiagnostic('simple', data));
      responseText = data.message?.content || '';
    }

    const ollamaDiagnostics = summarizeOllamaDiagnostics(ollamaCallDiagnostics);
    const routeDurationMs = Math.round(performance.now() - requestStartedAt);

    // Update conversation history + HMM state in Redis
    try {
      const redis = getRedis();
      conversationHistory.push(
        { role: 'user', content: message },
        { role: 'assistant', content: responseText }
      );
      await redis.set(
        `contextual:history:${sessionId}`,
        JSON.stringify(conversationHistory.slice(-MAX_STORED_HISTORY)),
        'EX',
        3600
      );

      const stateIdx = inferHmmState(message, conversationHistory.length);
      const stateData = {
        hmmState: {
          currentState: stateIdx,
          stateHistory: conversationHistory
            .filter((m) => m.role === 'user')
            .map((_, i) => inferHmmState('', i)),
          transitionMatrix: [],
        },
        confidence: Math.min(0.5 + conversationHistory.length * 0.05, 0.95),
        extractedEntities: extractEntities(message),
        turnCount: Math.floor(conversationHistory.length / 2),
      };
      await redis.set(`contextual:state:${sessionId}`, JSON.stringify(stateData), 'EX', 3600);
    } catch {
      // Non-blocking
    }

    const queryHash = createHash('sha256').update(message).digest('hex').slice(0, 16);

    return json({
      success: true,
      data: {
        response: responseText,
        model: 'gemma4-legal:latest',
        sessionId,
        queryHash,
        ...(caseId ? { caseId } : {}),
        ...(toolResultsCtx.length > 0 && {
          toolResults: toolResultsCtx,
          _trace: {
            totalToolCalls: toolResultsCtx.length,
            toolLatencyMs: toolResultsCtx.reduce((s, r) => s + r.durationMs, 0),
          },
        }),
        _diagnostics: {
          routeDurationMs,
          ollama: ollamaDiagnostics,
        },
      },
    });
  } catch (err) {
    console.error('[/api/contextual/chat]', err);
    return json({ success: false, error: { message: 'Chat service error' } }, { status: 503 });
  }
};

/** Simple HMM state inference based on message content */
function inferHmmState(message: string, turnIndex: number): number {
	const lower = message.toLowerCase();
	if (turnIndex === 0 || lower.includes('hello') || lower.includes('hi')) return 0;
	if (lower.includes('case') || lower.includes('lawsuit')) return 1;
	if (lower.includes('document') || lower.includes('evidence') || lower.includes('file')) return 2;
	if (lower.includes('law') || lower.includes('statute') || lower.includes('precedent') || lower.includes('research')) return 3;
	if (lower.includes('risk') || lower.includes('liability') || lower.includes('assessment')) return 4;
	if (lower.includes('recommend') || lower.includes('suggest') || lower.includes('advice')) return 5;
	if (lower.includes('follow') || lower.includes('more') || lower.includes('also')) return 6;
	if (lower.includes('thank') || lower.includes('bye') || lower.includes('done')) return 7;
	return Math.min(turnIndex, 7);
}

/** Simple entity extraction from message text */
function extractEntities(text: string): Array<{ type: string; value: string }> {
	const entities: Array<{ type: string; value: string }> = [];
	const caseNums = text.match(/\d{4}-[A-Z]{2,}-\d+/g);
	if (caseNums) caseNums.forEach(v => entities.push({ type: 'CASE_NUMBER', value: v }));
	const dates = text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi);
	if (dates) dates.forEach(v => entities.push({ type: 'DATE', value: v }));
	const statutes = text.match(/\b\d+ U\.?S\.?C\.? ?\u00A7? ?\d+\b|\bSection \d+/gi);
	if (statutes) statutes.forEach(v => entities.push({ type: 'STATUTE', value: v }));
	const money = text.match(/\$[\d,]+(?:\.\d{2})?/g);
	if (money) money.forEach(v => entities.push({ type: 'MONEY', value: v }));
	return entities;
}
