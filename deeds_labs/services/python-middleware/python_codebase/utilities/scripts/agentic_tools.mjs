import { getOllamaEndpoint, getOllamaEmbeddingModel } from "./ollama-endpoint.mjs";
import { OllamaFunctionsLLM } from "langchain/llms/ollama";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import pgPkg from "pg";

const { Client } = pgPkg;

// External service configuration
const PHASE45_ADAPTER_URL = process.env.PHASE45_ADAPTER_URL || "http://localhost:8085";
const DOC_INGEST_URL = (process.env.DOC_INGEST_URL || "http://localhost:8090").replace(/\/$/, "");
const PHASE46_ADAPTER_URL = (process.env.PHASE46_ADAPTER_URL || "http://localhost:8092").replace(/\/$/, "");
const DATABASE_URL = process.env.DATABASE_URL || null;
const PG_VECTOR_TABLE = process.env.PHASE46_PG_TABLE || "rag_document_chunks";
const VECTOR_SEARCH_LIMIT = Number(process.env.VECTOR_SEARCH_LIMIT || "5");

const TOOL_MODEL = process.env.AGENTIC_TOOL_MODEL || "gemma3-legal:latest";

const toolLlm = new OllamaFunctionsLLM({
  baseUrl: getOllamaEndpoint(),
  model: TOOL_MODEL,
});

const webSearch = async (query) => {
  console.log(chalk.yellow(`[Tool] Web search via Phase 45 Adapter: ${query}`));
  try {
    const res = await fetch(`${PHASE45_ADAPTER_URL}/query?q=${encodeURIComponent(query)}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    return (json.results || []).map(([key, score]) => ({
      key,
      score: Number(score ?? 0),
    }));
  } catch (error) {
    console.error(chalk.red(`[Tool] Phase 45 Adapter web search failed: ${error.message}`));
    return [];
  }
};

const localSearch = async (pattern, dir = ".") => {
  console.log(chalk.yellow(`[Tool] Local filesystem search for '${pattern}' in '${dir}'`));
  const matches = [];
  try {
    function walk(currentPath) {
      for (const entry of fs.readdirSync(currentPath)) {
        const entryPath = path.join(currentPath, entry);
        const stat = fs.statSync(entryPath);
        if (stat.isDirectory()) {
          walk(entryPath);
        } else {
          const content = fs.readFileSync(entryPath, "utf8");
          if (content.includes(pattern)) {
            matches.push({
              file: entryPath,
              snippet: extractSnippet(content, pattern),
            });
          }
        }
        if (matches.length >= 10) break;
      }
    }
    walk(dir);
  } catch (error) {
    console.error(chalk.red(`[Tool] Local search failed: ${error.message}`));
  }
  return matches;
};

function extractSnippet(text, needle) {
  const lower = text.toLowerCase();
  const index = lower.indexOf(needle.toLowerCase());
  if (index === -1) return text.slice(0, 140);
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + needle.length + 80);
  return text.slice(start, end).replace(/\s+/g, " ");
}

const summarizeText = async (text) => {
  console.log(chalk.yellow(`[Tool] Summarizing text (${text.length} chars).`));
  if (!text || !text.trim()) return "";
  try {
    return await toolLlm.call(`Summarize the following text concisely:\n\n${text}`);
  } catch (error) {
    console.error(chalk.red(`[Tool] Summarization failed: ${error.message}`));
    return `Summarization unavailable: ${error.message}`;
  }
};

const generateFix = async (errorCode, context) => {
  console.log(chalk.yellow(`[Tool] Generating fix for ${errorCode}.`));
  try {
    return await toolLlm.call(
      `Error code: ${errorCode}\nContext:\n${context}\n\nProvide a minimal TypeScript/Svelte fix suggestion.`,
    );
  } catch (error) {
    console.error(chalk.red(`[Tool] Fix generation failed: ${error.message}`));
    return `Fix generation failed: ${error.message}`;
  }
};

async function fetchEmbeddingVector(text) {
  const endpoint = getOllamaEndpoint();
  const url = endpoint.endsWith("/api/embeddings")
    ? endpoint
    : `${endpoint.replace(/\/$/, "")}/api/embeddings`;
  const model = getOllamaEmbeddingModel();

  const payloadCandidates = [
    { model, input: text },
    { model, prompt: text },
  ];

  for (const payload of payloadCandidates) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const vector =
        data?.embedding ||
        data?.data?.[0]?.embedding ||
        null;
      if (Array.isArray(vector) && vector.length) {
        return vector.map((v) => Number(v));
      }
    } catch (err) {
      console.warn(
        chalk.yellow(`[Tool] Embedding attempt failed (${payload.input ? "input" : "prompt"}): ${err.message}`),
      );
    }
  }
  throw new Error("Embedding request returned no vector.");
}

async function vectorLocalSearch(query, limit = VECTOR_SEARCH_LIMIT) {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL not configured; pgvector search unavailable.");
  }

  const trimmed = query?.trim();
  if (!trimmed) {
    return [];
  }

  const embedding = await fetchEmbeddingVector(trimmed);
  const vectorLiteral = `[${embedding.map((v) => Number(v).toFixed(6)).join(",")}]`;

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const sql = `
      SELECT
        doc_id,
        chunk_index,
        title,
        lang,
        content,
        fetched_at,
        1 - (embedding <=> '${vectorLiteral}') AS score
      FROM ${PG_VECTOR_TABLE}
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> '${vectorLiteral}'
      LIMIT $1;
    `;
    const { rows } = await client.query(sql, [limit]);
    return rows.map((row) => ({
      docId: row.doc_id,
      chunkIndex: row.chunk_index,
      title: row.title,
      lang: row.lang,
      fetchedAt: row.fetched_at,
      score: Number(row.score || 0),
      excerpt: (row.content || "").slice(0, 280),
    }));
  } finally {
    await client.end();
  }
}

async function docCacheSearch(substr) {
  if (!substr || !substr.trim()) {
    return [];
  }
  const target = `${DOC_INGEST_URL}/query?substr=${encodeURIComponent(substr)}`;
  try {
    const res = await fetch(target);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    return json.matches || [];
  } catch (error) {
    console.error(chalk.red(`[Tool] Doc cache search failed: ${error.message}`));
    return [];
  }
}

async function structureExtractRequest({ text, persist, title, source }) {
  const trimmed = text?.trim();
  if (!trimmed) {
    return { error: "structure_extract requires non-empty text input." };
  }
  const payload = {
    text: trimmed,
    persist: Boolean(persist),
    title,
    source,
  };

  const response = await fetch(`${PHASE46_ADAPTER_URL}/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Phase46 adapter extract failed (${response.status}): ${body}`);
  }

  return response.json();
}

function stringifyResult(label, payload) {
  try {
    return JSON.stringify(payload);
  } catch (error) {
    console.warn(`[agentic_tools] Failed to stringify ${label}: ${error.message}`);
    return String(payload);
  }
}

export async function buildTools() {
  return [
    {
      name: "web_search",
      description: "Search centralized documentation via Phase 45 Adapter.",
      func: async ({ query }) => {
        const results = await webSearch(query);
        console.log(chalk.yellow(`[Agentic:web_search] ${results.length} hits for "${query}".`));
        return stringifyResult("web_search", results);
      },
    },
    {
      name: "doc_cache_search",
      description: "Search cached ingestion documents by substring (doc_ingest service).",
      func: async ({ query }) => {
        const results = await docCacheSearch(query);
        console.log(chalk.yellow(`[Agentic:doc_cache_search] ${results.length} matches for "${query}".`));
        return stringifyResult("doc_cache_search", results);
      },
    },
    {
      name: "vector_local_search",
      description: "Semantic vector search against indexed document chunks (pgvector).",
      func: async ({ query, limit }) => {
        try {
          const rows = await vectorLocalSearch(query, Number(limit) || VECTOR_SEARCH_LIMIT);
          console.log(
            chalk.yellow(`[Agentic:vector_local_search] ${rows.length} pgvector results for "${query}".`),
          );
          return stringifyResult("vector_local_search", rows);
        } catch (error) {
          console.error(chalk.red(`[Agentic:vector_local_search] Failed: ${error.message}`));
          return `Vector search unavailable: ${error.message}`;
        }
      },
    },
    {
      name: "structure_extract",
      description:
        "Extract structured metadata (error_code, file_path, rule, suggested_fix) via Phase46 adapter + LangExtract.",
      func: async ({ text, persist, title, source }) => {
        const result = await structureExtractRequest({ text, persist, title, source });
        console.log(chalk.yellow("[Agentic:structure_extract] Extraction complete."));
        return stringifyResult("structure_extract", result);
      },
    },
    {
      name: "local_search",
      description: "Search the local repository for files that match the supplied pattern.",
      func: async ({ pattern, repoPath }) => {
        const results = await localSearch(pattern, repoPath || "sveltekit-frontend");
        console.log(
          chalk.yellow(
            `[Agentic:local_search] ${results.length} matches for "${pattern}" in ${
              repoPath || "sveltekit-frontend"
            }.`,
          ),
        );
        return stringifyResult("local_search", results);
      },
    },
    {
      name: "summarize",
      description: "Summarize a block of text or a documentation snippet.",
      func: async ({ text }) => {
        const summary = await summarizeText(text);
        console.log(chalk.yellow("[Agentic:summarize] Summary generated."));
        return summary;
      },
    },
    {
      name: "generate_fix",
      description: "Generate a TypeScript fix suggestion for the given error code and context.",
      func: async ({ errorCode, context }) => {
        const suggestion = await generateFix(errorCode, context);
        console.log(chalk.yellow(`[Agentic:generate_fix] Suggestion ready for ${errorCode}.`));
        return suggestion;
      },
    },
  ];
}
