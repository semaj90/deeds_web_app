/**
 * Gemma4 Tool-Calling Agent
 *
 * Runs an agentic loop against Ollama's native tool-calling API
 * (gemma4:e4b-it-q4_K_M supports structured tool_calls).
 *
 * Loop:
 *   1. Send messages + tool definitions to /api/chat
 *   2. If response.message.tool_calls → invoke each tool in-process
 *   3. Append role:"tool" result messages → re-send
 *   4. Repeat until final text response or MAX_ROUNDS exceeded
 *
 * All tool dispatch is in-process — no HTTP round-trip to localhost:
 *   rag_search      → Qdrant hybrid search (research_summaries + legal_documents)
 *   case_search     → Postgres full-text case search
 *   memory_recall   → selectAdaptiveMemory() — hyperedge X_prime similarity
 *   hyperedge_stats → queryTopHyperedges() — top Grade A/B knowledge clusters
 *
 * Timeline events are written to context_timeline for every agent run
 * (eventType: 'tool_call') so the RL loop can learn which tool chains
 * produce high-quality answers.
 */

import { ollamaFetch, VLM_MODELS, getOllamaEndpoint } from '$lib/server/ollama.js';
import { generateEmbedding }                           from '$lib/server/grpc/embedding-client.js';
import { qdrant }                                      from '$lib/server/vector/qdrant-manager.js';
import { selectAdaptiveMemory, queryTopHyperedges }    from '$lib/server/graph/hypergraph-4d.js';
import { db, pool }                                    from '$lib/server/db/client';
import { contextTimeline }                             from '$lib/server/db/schema-postgres.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_ROUNDS  = 5;   // max tool-call rounds before forcing a final answer
const TOOL_MODEL  = VLM_MODELS.gemma4;   // gemma4:e4b-it-q4_K_M
const TIMEOUT_MS  = 90_000;

// ── Ollama wire types ──────────────────────────────────────────────────────────

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaChatResponse {
  message: OllamaMessage;
  done: boolean;
}

// ── Tool definitions (Ollama function-calling schema) ─────────────────────────

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'rag_search',
      description:
        'Semantic search across legal research summaries and documents. ' +
        'Use this to retrieve relevant case law, statutes, or research on a topic.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language search query' },
          collection: {
            type: 'string',
            enum: ['research_summaries', 'legal_documents', 'evidence_items'],
            description: 'Which knowledge collection to search (default: research_summaries)',
          },
          topK: { type: 'number', description: 'Max results to return (default 5, max 20)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'case_search',
      description:
        'Search legal cases in the database by keyword or description. ' +
        'Returns case title, status, and summary.',
      parameters: {
        type: 'object',
        properties: {
          query:  { type: 'string', description: 'Search term or case description' },
          limit:  { type: 'number', description: 'Max results (default 5, max 20)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_recall',
      description:
        'Retrieve the most relevant hyperedge memory modules from the 4D knowledge graph. ' +
        'These are HGNN-enriched summaries of clusters of related research that the system ' +
        'has learned are high-quality for a given topic (Grade A/B hyperedges). ' +
        'Use this when you need background context or prior learned knowledge on a subject.',
      parameters: {
        type: 'object',
        properties: {
          query:  { type: 'string', description: 'Topic or question to recall memories for' },
          topK:   { type: 'number', description: 'Number of memory modules to return (default 3)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hyperedge_stats',
      description:
        'Get statistics about the top knowledge clusters (hyperedges) currently in the graph. ' +
        'Shows which topic clusters have the highest quality scores and how many summaries they contain. ' +
        'Use this to understand what the system knows well.',
      parameters: {
        type: 'object',
        properties: {
          minGrade: {
            type: 'string',
            enum: ['A', 'B', 'C'],
            description: 'Minimum grade threshold (default B)',
          },
          limit: { type: 'number', description: 'Number of hyperedges to return (default 5)' },
        },
      },
    },
  },
] as const;

// ── In-process tool dispatch ───────────────────────────────────────────────────

interface ToolResult {
  tool:    string;
  result:  unknown;
  errorMsg?: string;
}

async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    if (name === 'rag_search') {
      const query      = String(args.query ?? '');
      const collection = String(args.collection ?? 'research_summaries');
      const topK       = Math.min(Number(args.topK ?? 5), 20);

      const emb = await generateEmbedding(query);
      if (!emb) return { tool: name, result: [], errorMsg: 'Embedding unavailable' };

      const VALID = ['research_summaries', 'legal_documents', 'evidence_items'] as const;
      const col   = VALID.includes(collection as typeof VALID[number])
        ? (collection as typeof VALID[number])
        : 'research_summaries';

      const hits = await qdrant.hybridSearch({
        collection:     col,
        query,
        queryEmbedding: emb,
        limit:          topK,
      });

      return {
        tool: name,
        result: hits.results.map((h) => ({
          id:       h.id,
          score:    h.score,
          summary:  (h.payload?.['summary']  ?? h.payload?.['content'] ?? '') as string,
          title:    (h.payload?.['title']    ?? '') as string,
          source:   (h.payload?.['source']   ?? col) as string,
          pipeline: (h.payload?.['pipeline'] ?? '') as string,
        })),
      };
    }

    if (name === 'case_search') {
      const query = String(args.query ?? '');
      const limit = Math.min(Number(args.limit ?? 5), 20);

      const { rows } = await pool.query<{
        id: string; title: string; status: string; description: string | null;
      }>(
        `SELECT id, title, status, description
           FROM cases
          WHERE to_tsvector('english', title || ' ' || COALESCE(description, ''))
                  @@ plainto_tsquery('english', $1)
          ORDER BY ts_rank(to_tsvector('english', title || ' ' || COALESCE(description, '')),
                           plainto_tsquery('english', $1)) DESC
          LIMIT $2`,
        [query, limit],
      );

      return { tool: name, result: rows };
    }

    if (name === 'memory_recall') {
      const query = String(args.query ?? '');
      const topK  = Math.min(Number(args.topK ?? 3), 10);

      const emb = await generateEmbedding(query);
      if (!emb) return { tool: name, result: [], errorMsg: 'Embedding unavailable' };

      const modules = await selectAdaptiveMemory(emb, topK);
      return {
        tool: name,
        result: modules.map((m) => ({
          hash:        m.hyperedgeHash,
          grade:       m.gradeLabel,
          score:       m.gradeScore,
          pipeline:    m.pipeline,
          summary:     m.summary,
          members:     m.memberCount,
          similarity:  m.similarity,
          loraHint:    m.loraHint,
        })),
      };
    }

    if (name === 'hyperedge_stats') {
      const minGrade = (args.minGrade as 'A' | 'B' | 'C') ?? 'B';
      const limit    = Math.min(Number(args.limit ?? 5), 20);

      const edges = await queryTopHyperedges(minGrade, limit);
      return {
        tool: name,
        result: edges.map((e) => ({
          hash:      e.hash,
          grade:     e.gradeLabel,
          score:     e.gradeScore,
          pipeline:  e.pipeline,
          members:   e.memberIds.length,
          summary:   e.summary?.slice(0, 300) ?? '',
        })),
      };
    }

    return { tool: name, result: null, errorMsg: `Unknown tool: ${name}` };
  } catch (err) {
    return { tool: name, result: null, errorMsg: (err as Error).message };
  }
}

// ── Public result type ────────────────────────────────────────────────────────

export interface AgentRunResult {
  answer:     string;
  toolsUsed:  string[];
  rounds:     number;
  sources:    unknown[];
  durationMs: number;
}

// ── Agent loop ────────────────────────────────────────────────────────────────

export async function runGemma4Agent(
  query:       string,
  options?: {
    systemPrompt?: string;
    pipeline?:     string;
    userId?:       string;
    sessionId?:    string;
  },
): Promise<AgentRunResult> {
  const t0       = Date.now();
  const pipeline = options?.pipeline ?? 'ace';
  const toolsUsed: string[] = [];
  const sources:  unknown[] = [];

  const system = options?.systemPrompt ??
    'You are a legal research assistant with access to a knowledge graph and case database. ' +
    'Use the provided tools to gather information before answering. ' +
    'Be precise and cite your sources.';

  const messages: OllamaMessage[] = [
    { role: 'system',  content: system },
    { role: 'user',    content: query  },
  ];

  let finalAnswer = '';
  let round       = 0;

  while (round < MAX_ROUNDS) {
    round++;

    const body = JSON.stringify({
      model:    TOOL_MODEL,
      messages,
      tools:    AGENT_TOOLS,
      stream:   false,
      options:  { temperature: 0.2, num_predict: 2048 },
    });

    const res = await ollamaFetch(`${getOllamaEndpoint()}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal:  AbortSignal.timeout(TIMEOUT_MS),
    } as RequestInit);

    if (!res.ok) {
      throw new Error(`Ollama /api/chat ${res.status}: ${await res.text().catch(() => '')}`);
    }

    const data = (await res.json()) as OllamaChatResponse;
    const msg  = data.message;

    // Final answer — no tool calls
    if (!msg.tool_calls?.length) {
      finalAnswer = msg.content ?? '';
      break;
    }

    // Append the assistant's tool-call request to the conversation
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });

    // Execute each tool call in-process
    for (const tc of msg.tool_calls) {
      const { name, arguments: tArgs } = tc.function;
      toolsUsed.push(name);

      const result = await dispatchTool(name, tArgs ?? {});
      if (Array.isArray(result.result)) sources.push(...result.result);

      // Ollama expects role:"tool" messages with the result as content
      messages.push({
        role:    'tool',
        content: JSON.stringify(result.errorMsg
          ? { error: result.errorMsg }
          : result.result
        ),
      });
    }
  }

  // If we ran out of rounds without a final answer, ask for one explicitly
  if (!finalAnswer && round >= MAX_ROUNDS) {
    const body = JSON.stringify({
      model:    TOOL_MODEL,
      messages: [
        ...messages,
        { role: 'user', content: 'Please now provide a final answer based on what you found.' },
      ],
      stream:  false,
      options: { temperature: 0.2, num_predict: 2048 },
    });
    const res  = await ollamaFetch(`${getOllamaEndpoint()}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal:  AbortSignal.timeout(TIMEOUT_MS),
    } as RequestInit);
    if (res.ok) {
      const data = (await res.json()) as OllamaChatResponse;
      finalAnswer = data.message?.content ?? '';
    }
  }

  const durationMs = Date.now() - t0;

  // Fire-and-forget timeline record
  db.insert(contextTimeline).values({
    userId:    options?.userId    ?? undefined,
    sessionId: options?.sessionId ?? '',
    eventType: 'tool_call',
    pipeline,
    payload: {
      query,
      toolsUsed,
      rounds: round,
      durationMs,
    } as Record<string, unknown>,
  }).catch(() => { /* non-fatal */ });

  return { answer: finalAnswer, toolsUsed, rounds: round, sources, durationMs };
}
