import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { getRedis } from '$lib/server/redis.js';
import { z } from 'zod';

const contextualChatSchema = z.object({
	message: z.string().min(1).max(10000),
	sessionId: z.string().max(200).optional(),
	userId: z.string().max(200).optional(),
	enableFunctions: z.boolean().optional()
});

/** Tool definitions for Ollama native function calling */
const CONTEXTUAL_TOOLS = [
	{
		type: 'function' as const,
		function: {
			name: 'glossary_search',
			description: 'Search the legal glossary for term definitions and legal concepts. Use when the user asks "what is [term]?", "define [term]", or needs clarification on legal terminology.',
			parameters: {
				type: 'object',
				required: ['query'],
				properties: {
					query: { type: 'string', description: 'Legal term or concept to look up' },
					limit: { type: 'number', description: 'Max results (default: 5)' }
				}
			}
		}
	},
	{
		type: 'function' as const,
		function: {
			name: 'rag_search',
			description: 'Semantic search through legal documents using vector similarity. Use to find relevant evidence, case documents, or legal precedents.',
			parameters: {
				type: 'object',
				required: ['query'],
				properties: {
					query: { type: 'string', description: 'Semantic search query' },
					limit: { type: 'number', description: 'Max results (default: 5)' }
				}
			}
		}
	},
	{
		type: 'function' as const,
		function: {
			name: 'web_search',
			description: 'Search the web for legal research, case law, or documentation.',
			parameters: {
				type: 'object',
				required: ['query'],
				properties: {
					query: { type: 'string', description: 'Search query' },
					maxResults: { type: 'number', description: 'Max results (default: 5)' }
				}
			}
		}
	}
];

interface ContextualToolResult {
  ok: boolean;
  tool: string;
  result: string;
  durationMs: number;
}

const CONTEXTUAL_TOOL_TIMEOUT_MS: Record<string, number> = {
  glossary_search: 3_000,
  rag_search: 6_000,
  web_search: 8_000,
};

/** Execute a contextual tool call and return a normalised result */
async function executeContextualTool(
  name: string,
  args: Record<string, unknown>
): Promise<ContextualToolResult> {
  const start = Date.now();
  const timeout = CONTEXTUAL_TOOL_TIMEOUT_MS[name] ?? 5_000;
  try {
    switch (name) {
      case 'glossary_search': {
        const { fetchGlossaryMatches } = await import('$lib/server/ace/context-assembler.js');
        const matches = (await Promise.race([
          fetchGlossaryMatches(String(args.query || '')),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeout)
          ),
        ])) as Awaited<ReturnType<typeof fetchGlossaryMatches>>;
        if (!matches || matches.length === 0)
          return {
            ok: true,
            tool: name,
            result: 'No glossary matches found.',
            durationMs: Date.now() - start,
          };
        const result = matches
          .slice(0, Number(args.limit ?? 5))
          .map(
            (m: any) =>
              `**${m.term}**: ${m.definition.slice(0, 300)}${m.category ? ` (${m.category})` : ''}`
          )
          .join('\n\n');
        return { ok: true, tool: name, result, durationMs: Date.now() - start };
      }
      case 'rag_search': {
        const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');
        const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
        const queryText = String(args.query || '');
        const embResult = (await Promise.race([
          generateEmbeddings([queryText]),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeout)
          ),
        ])) as Awaited<ReturnType<typeof generateEmbeddings>>;
        if (!embResult.vectors[0]?.length)
          return {
            ok: false,
            tool: name,
            result: 'Failed to generate embedding.',
            durationMs: Date.now() - start,
          };
        const searchResult = await qdrant.hybridSearch({
          query: queryText,
          queryEmbedding: embResult.vectors[0],
          collection: 'documents' as any,
          // Contextual chat uses smaller top-k and trimmed snippets to stay within context budget
          limit: Number(args.limit ?? 3),
          scoreThreshold: 0.5,
        });
        const result =
          searchResult.results
            .map(
              (r: any, i: number) =>
                `${i + 1}. [${(r.score * 100).toFixed(0)}%] ${r.payload?.title || 'Untitled'}\n   ${(r.payload?.content || '').slice(0, 150)}`
            )
            .join('\n\n') || 'No relevant documents found.';
        return { ok: true, tool: name, result, durationMs: Date.now() - start };
      }
      case 'web_search': {
        const { webSearch, formatWebSearchResults } = await import(
          '$lib/server/agent/tools/web-search-searxng.js'
        );
        const searchResult = await Promise.race([
          webSearch({
            query: String(args.query || ''),
            maxResults: Number(args.maxResults ?? 5),
            searchType: 'general',
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeout)
          ),
        ]);
        return {
          ok: true,
          tool: name,
          result: formatWebSearchResults(searchResult as Awaited<ReturnType<typeof webSearch>>),
          durationMs: Date.now() - start,
        };
      }
      default:
        return {
          ok: false,
          tool: name,
          result: `Unknown tool: ${name}`,
          durationMs: Date.now() - start,
        };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return {
      ok: false,
      tool: name,
      result: `[${name} failed: ${msg}]`,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * POST /api/contextual/chat
 * Contextual chat with HMM state tracking + optional agentic tool calling
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const raw = await request.json();
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
      enableFunctions = false,
    } = parsed.data;

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

    // Build system prompt
    const systemPrompt = enableFunctions
      ? `You are a contextual legal AI assistant with agentic tool-calling capabilities.

Tool priority order (MUST follow):
1. **glossary_search** — ALWAYS try this first for legal term definitions, meanings, or concepts
2. **rag_search** — Use for relevant documents, evidence, or precedents; also fall back here if glossary returns no results
3. **web_search** — Use only for up-to-date external information that glossary and RAG cannot provide

Track conversation context and provide structured, well-cited responses.`
      : `You are a helpful legal AI assistant. Provide clear, accurate responses about legal topics. Track conversation context to give relevant follow-up responses.`;

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10),
      { role: 'user', content: message },
    ];

    let responseText = '';
    const toolResultsCtx: Array<ContextualToolResult> = [];

    if (enableFunctions) {
      // Agentic mode: Ollama native tool calling with iterative loop
      const MAX_TOOL_ROUNDS = 2;
      const MAX_TOTAL_TOOL_CALLS = 3;
      let toolRounds = 0;
      let totalToolCalls = 0;

      while (toolRounds < MAX_TOOL_ROUNDS) {
        const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gemma3-legal:latest',
            messages,
            stream: false,
            tools: CONTEXTUAL_TOOLS,
            options: {
              temperature: 0.1,
              top_k: 20,
              top_p: 0.8,
              num_ctx: 8192,
              repeat_penalty: 1.05,
            },
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (!res.ok) {
          return json(
            { success: false, error: { message: 'AI service unavailable' } },
            { status: 502 }
          );
        }

        const data = await res.json();
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

          const tr = await executeContextualTool(toolName, toolArgs);
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
            model: 'gemma3-legal:latest',
            messages,
            stream: false,
            options: {
              temperature: 0.1,
              top_k: 20,
              top_p: 0.8,
              num_ctx: 8192,
              repeat_penalty: 1.05,
            },
          }),
          signal: AbortSignal.timeout(30_000),
        });
        const finalData = finalRes.ok ? await finalRes.json() : null;
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
          model: 'gemma3-legal:latest',
          messages,
          stream: false,
          options: { temperature: 0.1, top_k: 20, top_p: 0.8, num_ctx: 8192, repeat_penalty: 1.05 },
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        return json(
          { success: false, error: { message: 'AI service unavailable' } },
          { status: 502 }
        );
      }

      const data = await res.json();
      responseText = data.message?.content || '';
    }

    // Update conversation history + HMM state in Redis
    try {
      const redis = getRedis();
      conversationHistory.push(
        { role: 'user', content: message },
        { role: 'assistant', content: responseText }
      );
      await redis.set(
        `contextual:history:${sessionId}`,
        JSON.stringify(conversationHistory.slice(-20)),
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

    return json({
      success: true,
      data: {
        response: responseText,
        model: 'gemma3-legal:latest',
        sessionId,
        ...(toolResultsCtx.length > 0 && {
          toolResults: toolResultsCtx,
          _trace: {
            totalToolCalls: toolResultsCtx.length,
            toolLatencyMs: toolResultsCtx.reduce((s, r) => s + r.durationMs, 0),
          },
        }),
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
