// src/agents/tools.ts
import fetch from 'node-fetch';
import { ToolCall, ToolResult } from './types';
import { fetchAndParse, crawlOneLevel } from './webFetch';
import { getOllamaEndpoint, getOllamaEmbedModel, getOllamaFallbackEmbedModel } from '../lib/ai/ollama-config';

const OLLAMA_ENDPOINT = getOllamaEndpoint();
const EMBED_MODEL = getOllamaEmbedModel(); // embeddinggemma:latest by default
const FALLBACK_EMBED_MODEL = getOllamaFallbackEmbedModel();
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const CODEMOD_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codemod_memories';

// --- embedQuery with robust shape handling and fallback ---

async function embedQuery(text: string): Promise<number[]> {
  const models = [EMBED_MODEL, FALLBACK_EMBED_MODEL];

  for (const model of models) {
    try {
      const body = {
        model,
        // works for both /api/embed and /api/embeddings depending on your Ollama version
        input: [text],
      };

      const res = await fetch(`${OLLAMA_ENDPOINT}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Embed error: ${res.status} ${res.statusText} ${t}`);
      }

      const data = await res.json() as any;

      // Robust shape handling
      if (Array.isArray(data.embeddings)) {
        // /api/embed with batch → { embeddings: number[][] }
        if (!Array.isArray(data.embeddings[0])) {
          throw new Error('Embed response.embeddings[0] is not an array');
        }
        return data.embeddings[0];
      }

      if (Array.isArray(data.embedding)) {
        // some older /api/embeddings variants: { embedding: number[] }
        return data.embedding;
      }

      throw new Error(
        `Unexpected embed response shape: ${JSON.stringify(
          Object.keys(data),
        )} — expected "embeddings" or "embedding"`,
      );
    } catch (error) {
      console.warn(`Embedding with ${model} failed:`, error);
      if (model === FALLBACK_EMBED_MODEL) {
        throw error; // Both failed
      }
    }
  }

  throw new Error('All embedding models failed');
}async function qdrantSearchCodemods(
  vector: number[],
  topK: number,
): Promise<any[]> {
  const body = {
    vector,
    limit: topK,
    with_payload: true,
  };

  const res = await fetch(
    `${QDRANT_URL}/collections/${CODEMOD_COLLECTION}/points/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Qdrant search error: ${res.status} ${res.statusText} ${t}`);
  }

  const data = (await res.json()) as { result?: any[] };
  return data.result ?? [];
}

// --- web_search (stub) unchanged, or you can replace with real search API ---

async function toolWebSearch(args: { query: string }): Promise<any> {
  return {
    summary: `Web search not wired yet. Pretend we searched: "${args.query}"`,
    results: [],
  };
}

// --- real RAG lookup over codemod memories ---

async function toolRagLookup(args: { query: string; topK?: number }): Promise<any> {
  const { query, topK = 5 } = args;
  const vector = await embedQuery(query);
  const neighbors = await qdrantSearchCodemods(vector, topK);

  const matches = neighbors.map((n) => ({
    score: n.score,
    code: n.payload?.code,
    message: n.payload?.message,
    errorKey: n.payload?.errorKey,
    priority: n.payload?.priority,
    framework: n.payload?.framework,
    content: n.payload?.content,
    tags: n.payload?.tags,
    timestamp: n.payload?.timestamp,
  }));

  return {
    summary: `Retrieved ${matches.length} codemod memories for query: "${query}"`,
    matches,
  };
}

// --- NEW: web_crawl tool (fetch + optional shallow crawl) ---

async function toolWebCrawl(args: { url: string; depth?: number; maxLinks?: number }): Promise<any> {
  const { url, depth = 0, maxLinks = 5 } = args;

  if (depth <= 0) {
    const page = await fetchAndParse(url);
    return {
      url: page.url,
      status: page.status,
      text: page.text.slice(0, 40_000), // keep it manageable
    };
  }

  const { root, links } = await crawlOneLevel(url, maxLinks);
  return {
    root: {
      url: root.url,
      status: root.status,
      text: root.text.slice(0, 40_000),
    },
    links: links.map((p) => ({
      url: p.url,
      status: p.status,
      text: p.text.slice(0, 20_000),
    })),
  };
}

// --- OPTIONAL: "web_doc_summary" tool that uses Gemma to summarize a URL into README-ready markdown without full agent loop ---

async function toolWebDocSummary(args: { url: string; topic?: string }): Promise<any> {
  const { url, topic = 'SvelteKit / TypeScript codemods' } = args;
  const page = await fetchAndParse(url);

  const prompt = [
    `You are documenting a large TypeScript + SvelteKit 2 codebase with many automated codemods.`,
    `You are given the raw text of an external documentation page.`,
    ``,
    `Your job: produce a short README-ready section explaining what this page teaches that is useful for:`,
    `- fixing TypeScript errors (TS1005, TS1128, TS1434, etc.)`,
    `- writing or refining codemods`,
    `- integrating with our "YoRHa Legal AI" SvelteKit frontend.`,
    ``,
    `Constraints:`,
    `- Use markdown.`,
    `- Max ~300 tokens.`,
    `- Add a "Links" bullet that points back to the source URL.`,
    ``,
    `Topic: ${topic}`,
    `Source URL: ${url}`,
    `---`,
    `DOCUMENT TEXT (truncated):`,
    page.text.slice(0, 10_000),
  ].join('\n');

  const body = {
    model: process.env.OLLAMA_MODEL ?? 'gemma3-legal:latest',
    messages: [
      { role: 'system', content: 'You write concise technical README sections for a legal AI dev repo.' },
      { role: 'user', content: prompt },
    ],
    stream: false,
  };

  const res = await fetch(`${OLLAMA_ENDPOINT}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ollama README summary error: ${res.status} ${res.statusText} ${t}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  const summary = data.message?.content ?? '';

  return {
    url,
    topic,
    summary,
  };
}

// --- existing code_search stub or implementation ---

async function toolCodeSearch(args: { pattern: string; path?: string }): Promise<any> {
  const { pattern, path = '.' } = args;
  return {
    summary: `Code search not wired yet. Pretend we ran rg "${pattern}" in "${path}".`,
  };
}

export const TOOL_REGISTRY: Record<
  string,
  (args: Record<string, any>) => Promise<any>
> = {
  web_search: toolWebSearch,
  rag_lookup: toolRagLookup,
  web_crawl: toolWebCrawl,
  web_doc_summary: toolWebDocSummary,
  code_search: toolCodeSearch,
};

export async function executeToolCall(call: ToolCall): Promise<ToolResult> {
  const impl = TOOL_REGISTRY[call.tool];
  if (!impl) {
    throw new Error(`Unknown tool: ${call.tool}`);
  }
  const result = await impl(call.arguments ?? {});
  return {
    tool: call.tool,
    arguments: call.arguments,
    result,
  };
}