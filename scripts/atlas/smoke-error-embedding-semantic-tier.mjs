#!/usr/bin/env node
/** One-off smoke test for kag.recall_similar_fix's new semantic tier (openspec change
 * parent-atlas-error-embedding-768-migration, task 6.3). Reuses the same embed+ANN pattern
 * wired into trace-mcp-server.ts, standalone, to prove it without restarting the live MCP server. */
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const OLLAMA_URL = (env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
const MODEL = env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';

async function embed(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    body: JSON.stringify({ model: MODEL, prompt: text }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (!Array.isArray(data.embedding) || data.embedding.length !== 768) {
    throw new Error(`Bad embedding: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.embedding;
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });

const query = 'error pattern scripts/unsloth-training/COLAB_PACKAGE/MEGA_DATASET_EXPANSION.md\ntritonserver model-repository gemma3-legal SDXL access endpoint';
const vec = await embed(query);
const literal = `[${vec.join(',')}]`;

const result = await pool.query(
  `SELECT relative_path, symbol, error_embedding <=> $1::vector AS distance
   FROM codebase_chunk_index
   WHERE error_embedding IS NOT NULL
   ORDER BY error_embedding <=> $1::vector
   LIMIT 5`,
  [literal]
);

console.log(JSON.stringify({ status: result.rows.length > 0 ? 'PASS_NONEMPTY' : 'FAIL_EMPTY', rows: result.rows }, null, 2));
await pool.end();
