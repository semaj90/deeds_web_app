/**
 * POST /api/v1/agentic/tool-loop
 *
 * Demo endpoint showing the explicit multi-step Gemma 4 + Ollama tool-calling loop:
 *
 *   1. Define tools (JSON Schema function defs)
 *   2. Send user query + tools → Ollama /api/chat
 *   3. Model emits tool_calls[] — execute each via local handlers
 *   4. Feed tool results back as role:"tool" messages
 *   5. Model generates final natural-language answer
 *
 * Body:
 *   { query: string, tools?: string[], systemPrompt?: string, responseSchema?: object }
 *
 * tools[]: which tools to make available (default: all)
 *   "codebase_search" | "knowledge_search" | "read_file" | "fix_recommend" | "wiki_generate" | "web_search" | "error_summarize"
 *
 * Returns:
 *   { answer, toolCallLog, iterations, model, totalDurationMs, history }
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import {
  callGemma4WithTools,
  makeWebSearchHandler,
  TOOL_CODEBASE_SEARCH,
  TOOL_KB_SEARCH,
  TOOL_READ_FILE,
  TOOL_FIX_RECOMMEND,
  TOOL_WIKI_GENERATE,
  TOOL_WEB_SEARCH,
  TOOL_ERROR_SUMMARIZE,
  type OllamaToolDef,
  type ToolHandler,
} from '$lib/server/llm/gemma4-tool-loop.js';

// ── Request schema ──────────────────────────────────────────────────────
const bodySchema = z.object({
  query: z.string().min(1).max(10_000),
  tools: z
    .array(z.enum(['codebase_search', 'knowledge_search', 'read_file', 'fix_recommend', 'wiki_generate', 'web_search', 'error_summarize']))
    .optional(),
  systemPrompt: z.string().max(5_000).optional(),
  responseSchema: z.record(z.string(), z.unknown()).optional(),
  model: z.string().max(100).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(64).max(16384).optional(),
  maxIterations: z.number().min(1).max(10).optional(),
  /** Explicitly allow web_search in this request (default: false) */
  allowWebSearch: z.boolean().optional(),
  /** Also allow web_search when no local results are found */
  deepResearch: z.boolean().optional(),
});

// ── Tool handler implementations ────────────────────────────────────────

/** Search codebase via Qdrant codebase_chunks_768 */
async function handleCodebaseSearch(args: Record<string, unknown>): Promise<unknown> {
  const query = String(args.query ?? '');
  const limit = Math.min(Number(args.limit ?? 5), 20);

  try {
    const { rerankChunks } = await import('$lib/server/retrieval/codebase-context.js');
    const reranked = await rerankChunks(query, { limit, caller: 'tool-loop' });
    return {
      results: reranked.results.slice(0, limit).map((r) => ({
        filePath: r.relativePath ?? r.path ?? 'unknown',
        score: r.score,
        content: (r.content ?? '').slice(0, 800),
        symbol: r.symbol,
        kind: r.kind,
        gpuCluster: r.gpuCluster ?? null,
        pageRankScore: r.pageRankScore ?? null,
        routeType: r.routeType ?? null,
      })),
      totalResults: reranked.results.length,
      timing: reranked.timing,
    };
  } catch (err) {
    return { error: `Codebase search failed: ${(err as Error).message}`, results: [] };
  }
}

/** Search knowledge base via Qdrant knowledge_base */
async function handleKnowledgeSearch(args: Record<string, unknown>): Promise<unknown> {
  const query = String(args.query ?? '');
  const limit = Math.min(Number(args.limit ?? 5), 20);
  const collection = String(args.collection ?? 'knowledge_base');

  try {
    const { ollamaFetch } = await import('$lib/server/ollama.js');
    const { ENV } = await import('$lib/server/env.server.js');

    // Generate query embedding
    const embedRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: query }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!embedRes.ok) {
      return { error: `Embedding failed: ${embedRes.status}`, results: [] };
    }

    const embedData = (await embedRes.json()) as { embedding: number[] };

    // Search Qdrant
    const qdrantRes = await fetch(`${ENV.QDRANT_URL}/collections/${collection}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: embedData.embedding,
        limit,
        with_payload: true,
        score_threshold: 0.3,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!qdrantRes.ok) {
      return { error: `Qdrant search failed: ${qdrantRes.status}`, results: [] };
    }

    const qdrantData = (await qdrantRes.json()) as {
      result: Array<{ id: string; score: number; payload: Record<string, unknown> }>;
    };

    return {
      results: qdrantData.result.map((r) => ({
        id: r.id,
        score: r.score,
        content: String(r.payload?.content ?? r.payload?.text ?? '').slice(0, 800),
        title: r.payload?.title ?? r.payload?.filename ?? null,
        source: r.payload?.source ?? null,
      })),
      totalResults: qdrantData.result.length,
      collection,
    };
  } catch (err) {
    return { error: `Knowledge search failed: ${(err as Error).message}`, results: [] };
  }
}

/** Read a file from the project */
async function handleReadFile(args: Record<string, unknown>): Promise<unknown> {
  const { readFile } = await import('fs/promises');
  const { resolve } = await import('path');

  const relPath = String(args.path ?? '');
  if (!relPath || relPath.includes('..') || relPath.startsWith('/')) {
    return { error: 'Invalid path: must be relative, no .. traversal' };
  }

  // Resolve from the sveltekit-frontend root
  const absPath = resolve(process.cwd(), relPath);
  const startLine = Number(args.startLine ?? 1);
  const endLine = Number(args.endLine ?? 0);

  try {
    const raw = await readFile(absPath, 'utf-8');
    const lines = raw.split('\n');

    if (endLine > 0 && startLine > 0) {
      const slice = lines.slice(startLine - 1, endLine);
      return {
        path: relPath,
        content: slice.join('\n'),
        totalLines: lines.length,
        showing: `${startLine}-${Math.min(endLine, lines.length)}`,
      };
    }

    // Default: return first 200 lines
    const maxLines = 200;
    return {
      path: relPath,
      content: lines.slice(0, maxLines).join('\n'),
      totalLines: lines.length,
      truncated: lines.length > maxLines,
    };
  } catch (err) {
    return { error: `Cannot read file: ${(err as Error).message}` };
  }
}

/** Recommend fixes for an error (uses the existing fix-suggestions pattern) */
async function handleFixRecommend(args: Record<string, unknown>): Promise<unknown> {
  const error = String(args.error ?? '');
  const filePath = String(args.filePath ?? '');
  const codeSnippet = String(args.codeSnippet ?? '');

  // Search for similar errors in the error brain
  try {
    const { ollamaFetch } = await import('$lib/server/ollama.js');
    const { ENV } = await import('$lib/server/env.server.js');

    const prompt = `Analyze this error and suggest fixes.
Error: ${error.slice(0, 2000)}
${filePath ? `File: ${filePath}` : ''}
${codeSnippet ? `Code:\n${codeSnippet.slice(0, 1000)}` : ''}

Return JSON: { "suggestions": [{ "fix": "...", "confidence": 0.0-1.0, "explanation": "..." }] }`;

    const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-rotorquant:latest',
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.2, num_predict: 512 },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      return { suggestions: [], error: `Fix generation failed: ${res.status}` };
    }

    const data = (await res.json()) as { response: string };
    try {
      return JSON.parse(data.response);
    } catch {
      return { suggestions: [{ fix: data.response, confidence: 0.5, explanation: 'Raw LLM output' }] };
    }
  } catch (err) {
    return { suggestions: [], error: `Fix recommend failed: ${(err as Error).message}` };
  }
}

/** Generate a wiki article stub */
async function handleWikiGenerate(args: Record<string, unknown>): Promise<unknown> {
  const topic = String(args.topic ?? '');
  const context = String(args.context ?? '');
  const maxLength = Math.min(Number(args.maxLength ?? 500), 2000);

  return {
    topic,
    status: 'generated',
    article: `# ${topic}\n\n_Generated wiki article placeholder._\n\n${context ? `Context: ${context}\n\n` : ''}This tool would generate a full wiki article using ACE context + Gemma 4 synthesis. Max length: ${maxLength} words.`,
    note: 'Full wiki generation requires the ACE context assembler (ace/context-assembler.ts).',
  };
}

// web_search handler: Redis cache → SearXNG → Qdrant research_summaries fallback
// Built from the canonical makeWebSearchHandler() in gemma4-tool-loop.ts
const handleWebSearch = makeWebSearchHandler();

/** Error summarization → KAG (Postgres + Qdrant + Redis) */
async function handleErrorSummarize(args: Record<string, unknown>): Promise<unknown> {
  const errorMsg = String(args.error ?? '');
  const query = String(args.query ?? '');
  const filePath = args.filePath ? String(args.filePath) : undefined;
  const pipeline = String(args.pipeline ?? 'ace');

  try {
    const { writeErrorToKag } = await import('$lib/server/ace/error-kag-writer.js');
    const result = await writeErrorToKag({
      query,
      errorMessage: errorMsg,
      filePath,
      pipeline,
    });

    return {
      stored: result.ok,
      summaryId: result.summaryId ?? null,
      summary: result.summary ?? null,
      entityTags: result.entityTags ?? [],
      embeddingDims: result.embeddingDims ?? null,
      durationMs: result.durationMs,
      message: result.ok
        ? 'Error context stored in KAG — future queries about similar errors will retrieve this summary.'
        : `KAG write failed: ${result.error}`,
    };
  } catch (err) {
    return { stored: false, error: `Error summarization failed: ${(err as Error).message}` };
  }
}

// ── Tool registry map ───────────────────────────────────────────────────

const ALL_TOOLS: Record<string, { def: OllamaToolDef; handler: ToolHandler }> = {
  codebase_search: { def: TOOL_CODEBASE_SEARCH, handler: handleCodebaseSearch },
  knowledge_search: { def: TOOL_KB_SEARCH, handler: handleKnowledgeSearch },
  read_file: { def: TOOL_READ_FILE, handler: handleReadFile },
  fix_recommend: { def: TOOL_FIX_RECOMMEND, handler: handleFixRecommend },
  wiki_generate: { def: TOOL_WIKI_GENERATE, handler: handleWikiGenerate },
  web_search: { def: TOOL_WEB_SEARCH, handler: handleWebSearch },
  error_summarize: { def: TOOL_ERROR_SUMMARIZE, handler: handleErrorSummarize },
};

// ── POST handler ────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);

  if (!parsed.success) {
    return json(
      { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { query, tools: toolNames, systemPrompt, responseSchema, model, temperature, maxTokens, maxIterations, allowWebSearch, deepResearch } =
    parsed.data;

  // Select tools
  const enabledNames = toolNames ?? Object.keys(ALL_TOOLS);
  const toolDefs: OllamaToolDef[] = [];
  const handlers = new Map<string, ToolHandler>();

  for (const name of enabledNames) {
    const entry = ALL_TOOLS[name];
    if (entry) {
      toolDefs.push(entry.def);
      handlers.set(entry.def.function.name, entry.handler);
    }
  }

  // web_search is gated: only active when explicitly requested or deepResearch=true
  // It is never on by default to avoid adding noise/latency to every loop.
  const webSearchAllowed = allowWebSearch === true || deepResearch === true;
  if (!webSearchAllowed) {
    handlers.delete('web_search');
    const wsIdx = toolDefs.findIndex(t => t.function.name === 'web_search');
    if (wsIdx !== -1) toolDefs.splice(wsIdx, 1);
  }

  try {
    const result = await callGemma4WithTools(query, toolDefs, handlers, {
      model,
      temperature,
      maxTokens,
      maxIterations,
      systemPromptOverride: systemPrompt,
      responseSchema,
    });

    return json({
      answer: result.answer,
      toolCallLog: result.toolCallLog,
      iterations: result.iterations,
      model: result.model,
      totalDurationMs: result.totalDurationMs,
      // Include full history for debugging (can be toggled off in production)
      history: result.history.map((m) => ({
        role: m.role,
        content: m.content.slice(0, 2000),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        ...(m.tool_name ? { tool_name: m.tool_name } : {}),
      })),
    });
  } catch (err) {
    console.error('[tool-loop] Error:', err);
    return json(
      { error: 'Tool loop failed', message: (err as Error).message },
      { status: 500 }
    );
  }
};

// ── GET: introspection — list available tools + API shape ───────────────

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  return json({
    endpoint: 'POST /api/v1/agentic/tool-loop',
    description: 'Gemma 4 multi-step tool-calling loop (define tools → model calls → execute → feed back → final answer)',
    availableTools: Object.entries(ALL_TOOLS).map(([key, { def }]) => ({
      id: key,
      name: def.function.name,
      description: def.function.description,
      parameters: def.function.parameters,
    })),
    exampleRequest: {
      query: 'How does the authentication middleware work in this codebase?',
      tools: ['codebase_search', 'read_file'],
      maxIterations: 3,
    },
    loopDiagram: [
      '1. Client sends { query, tools[] }',
      '2. Server builds messages[system, user] + tool definitions',
      '3. POST /api/chat → Ollama responds with tool_calls[]',
      '4. Server executes each tool_call via handler Map',
      '5. Server appends { role:"tool", content, tool_name } to messages',
      '6. Loop back to step 3 (model sees results, may call more tools)',
      '7. When model emits content without tool_calls → return final answer',
    ],
  });
};
