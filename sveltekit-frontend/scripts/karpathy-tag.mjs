#!/usr/bin/env node
/**
 * karpathy-tag.mjs — LLM-based multi-tag enrichment with 20-atom vocabulary.
 *
 * For each chunk with content, calls Ollama to assign 1-5 tags from a fixed
 * 20-atom vocabulary. Writes tags back to Qdrant payload + Postgres
 * semantic_tags. Also derives extension/language if missing.
 *
 * Usage:
 *   node scripts/karpathy-tag.mjs [--dry-run] [--limit N] [--batch N] [--domain D]
 *
 * ENV:
 *   DATABASE_URL   (default postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db)
 *   QDRANT_URL     (default http://localhost:6333)
 *   OLLAMA_URL     (default http://localhost:11434)
 *   OLLAMA_MODEL   (default gemma4-legal-fast:latest)
 *   CONCURRENCY    (default 4 — parallel LLM slots)
 */

import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL   = process.env.QDRANT_URL   ?? 'http://localhost:6333';
const OLLAMA_URL   = process.env.OLLAMA_URL   ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4-legal-fast:latest';
const COLLECTION   = 'codebase_chunks_768';
const CONCURRENCY  = parseInt(process.env.CONCURRENCY ?? '4', 10);

const DRY_RUN    = process.argv.includes('--dry-run');
const LIMIT      = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0');
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1] ?? '50');
const DOMAIN_FILTER = process.argv.find(a => a.startsWith('--domain='))?.split('=')[1] ?? null;
// --turbo routes inference to llama-server (TurboQuant) at :8090 with strict-JSON system prompt
const USE_TURBO   = process.argv.includes('--turbo');
const TURBO_URL   = process.env.TURBO_URL ?? 'http://127.0.0.1:8090';

// ── 20-atom semantic vocabulary ──────────────────────────────────────────────
//
// Each atom is a single semantic concept. A chunk may have 1–5 atoms.
// These are designed to be orthogonal, composable, and unambiguous.
//
const ATOMS = [
  // AI / ML
  'retrieval',        // RAG, vector lookup, BM25, rerank
  'generation',       // LLM inference, text generation, streaming
  'embedding',        // encode text/code to vectors
  'fine-tuning',      // training, LoRA, GRPO, QLoRA
  'classification',   // label assignment, intent detection
  // Legal domain
  'evidence-handling',// upload, OCR, parsing, chain-of-custody
  'case-management',  // case CRUD, status, notes, POI
  'legal-reasoning',  // citation lookup, statute analysis, RAG answer
  // Data / persistence
  'schema',           // DB schema, Drizzle tables, migrations
  'querying',         // DB reads, search, filters, pagination
  'caching',          // Redis, LokiJS, IndexedDB, bifrost
  'vector-indexing',  // Qdrant upsert, HNSW, ivfflat, pgvector
  // Transport / infra
  'api-contract',     // route handler shape, request/response types
  'streaming',        // SSE, WebSocket, chunked transfer
  'queueing',         // RabbitMQ publish/consume, job scheduling
  // UI / client
  'ui-rendering',     // Svelte components, DOM, layout
  'state-management', // $state, stores, XState machines
  'form-validation',  // Superforms, Zod, input validation
  // Cross-cutting
  'authentication',   // JWT, sessions, auth guards
  'observability',    // logs, traces, metrics, Langfuse
];

// ── Language detection ───────────────────────────────────────────────────────
const EXT_LANG = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.svelte': 'Svelte',
  '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.py': 'Python', '.go': 'Go', '.rs': 'Rust',
  '.proto': 'Protobuf', '.sql': 'SQL',
  '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML',
  '.css': 'CSS', '.scss': 'SCSS', '.html': 'HTML',
  '.md': 'Markdown', '.toml': 'TOML',
  '.sh': 'Shell', '.bash': 'Shell',
  '.cpp': 'C++', '.cc': 'C++', '.c': 'C', '.h': 'C/C++',
  '.wgsl': 'WGSL', '.glsl': 'GLSL',
};

function detectLanguage(filePath) {
  if (!filePath) return null;
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) return null;
  return EXT_LANG[filePath.slice(dot).toLowerCase()] ?? null;
}

// ── Postgres ─────────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: DATABASE_URL });

async function fetchChunkBatch(offset, limit) {
  let q = `
    SELECT id, qdrant_id, relative_path, symbol, kind, domain, language,
           content, semantic_tags
    FROM codebase_chunk_index
    WHERE content IS NOT NULL AND length(content) > 50
  `;
  const params = [];
  if (DOMAIN_FILTER) {
    params.push(DOMAIN_FILTER);
    q += ` AND domain = $${params.length}`;
  }
  params.push(limit, offset);
  q += ` ORDER BY id LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const { rows } = await pool.query(q, params);
  return rows;
}

async function getTotalCount() {
  let q = `SELECT COUNT(*) AS cnt FROM codebase_chunk_index WHERE content IS NOT NULL AND length(content) > 50`;
  const params = [];
  if (DOMAIN_FILTER) {
    params.push(DOMAIN_FILTER);
    q += ` AND domain = $1`;
  }
  const { rows } = await pool.query(q, params);
  return parseInt(rows[0].cnt, 10);
}

// ── Ollama ────────────────────────────────────────────────────────────────────
function buildPrompt(chunk) {
  const loc = chunk.symbol
    ? `${chunk.relative_path} → ${chunk.symbol} (${chunk.kind ?? 'unknown'})`
    : chunk.relative_path;

  const snippet = (chunk.content ?? '').slice(0, 600).replace(/\s+/g, ' ');

  return `You are a semantic code tagger for a legal AI platform.

File: ${loc}
Domain: ${chunk.domain ?? 'unknown'}
Language: ${chunk.language ?? 'unknown'}

Code snippet:
${snippet}

Choose 1-5 tags from this EXACT vocabulary (use only these words, comma-separated, no extras):
${ATOMS.join(', ')}

Rules:
- Pick only tags that directly describe what this code DOES
- Be specific — prefer narrow tags over broad ones
- If the code has multiple clear concerns, list up to 5
- Output ONLY the comma-separated tags, nothing else

Tags:`;
}

async function callOllama(prompt) {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.1, num_predict: 60 }
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  return data.response ?? '';
}

// TurboQuant (llama-server :8090) — OpenAI-compatible /v1/chat/completions with strict JSON system prompt
async function callTurbo(prompt) {
  const sysPrompt = `Return STRICT JSON only matching this schema, no prose, no markdown fences:\n{"tags":["atom1","atom2"],"language":"typescript","confidence":0.0}\n\nValid tags (use only these, lowercase, exact match):\n${ATOMS.join(', ')}`;
  const res = await fetch(`${TURBO_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma4-legal',
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user',   content: prompt },
      ],
      max_tokens: 120,
      temperature: 0.1,
      stream: false,
      cache_prompt: true,    // TurboQuant KV cache reuse for the static system prompt
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`TurboQuant ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

// Permissive JSON extractor: handles markdown code fences, prose padding, partial JSON.
function extractJsonObject(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

function parseTags(raw) {
  // Path 1 — TurboQuant strict-JSON path: prefer the JSON envelope if present.
  const obj = extractJsonObject(raw);
  if (obj && Array.isArray(obj.tags)) {
    return obj.tags
      .map(t => String(t).trim().toLowerCase().replace(/[^a-z0-9\-]/g, ''))
      .filter(t => ATOMS.includes(t))
      .slice(0, 5);
  }
  // Path 2 — Ollama freeform comma-separated path (legacy).
  return raw
    .split(',')
    .map(t => t.trim().toLowerCase().replace(/[^a-z0-9\-]/g, ''))
    .filter(t => ATOMS.includes(t))
    .slice(0, 5);
}

// ── Qdrant write ──────────────────────────────────────────────────────────────
async function patchQdrantPayload(qdrantId, tags, language) {
  const payload = { semantic_tags: tags };
  if (language) payload.language = language;
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, points: [qdrantId] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Qdrant patch failed: ${res.status}`);
}

// ── Process a single chunk ────────────────────────────────────────────────────
async function processChunk(chunk, stats) {
  const language = chunk.language ?? detectLanguage(chunk.relative_path);

  let tags = [];
  try {
    const prompt = buildPrompt({ ...chunk, language });
    const raw = USE_TURBO ? await callTurbo(prompt) : await callOllama(prompt);
    tags = parseTags(raw);
    if (tags.length === 0) {
      stats.noTags++;
      return;
    }
  } catch (err) {
    stats.errors++;
    if (stats.errors <= 3) console.error(`  LLM error [${chunk.qdrant_id}]:`, err.message);
    return;
  }

  if (DRY_RUN) {
    if (stats.tagged <= 5) {
      console.log(`  [dry] ${chunk.relative_path} → [${tags.join(', ')}]`);
    }
    stats.tagged++;
    for (const t of tags) stats.tagDist[t] = (stats.tagDist[t] ?? 0) + 1;
    return;
  }

  // Write to Postgres
  try {
    await pool.query(
      `UPDATE codebase_chunk_index
       SET semantic_tags = $1, language = COALESCE(language, $2), updated_at = now()
       WHERE id = $3`,
      [tags, language, chunk.id]
    );
  } catch (err) {
    stats.errors++;
    return;
  }

  // Write to Qdrant
  if (chunk.qdrant_id) {
    try {
      await patchQdrantPayload(chunk.qdrant_id, tags, language);
    } catch {
      // Non-fatal — Postgres is source of truth
    }
  }

  stats.tagged++;
  for (const t of tags) stats.tagDist[t] = (stats.tagDist[t] ?? 0) + 1;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const total = await getTotalCount();
  const cap = LIMIT > 0 ? Math.min(LIMIT, total) : total;
  const transport = USE_TURBO
    ? `turbo→${TURBO_URL} (gemma4-legal, strict-JSON)`
    : `ollama→${OLLAMA_URL} (${OLLAMA_MODEL})`;
  console.log(`Karpathy tag: ${cap} chunks  ${transport}  concurrency=${CONCURRENCY}  dry=${DRY_RUN}`);
  console.log(`Vocabulary: ${ATOMS.length} atoms`);
  if (DOMAIN_FILTER) console.log(`Domain filter: ${DOMAIN_FILTER}`);

  const stats = { tagged: 0, errors: 0, noTags: 0, tagDist: {} };
  const start = Date.now();

  let offset = 0;
  while (offset < cap) {
    const batch = await fetchChunkBatch(offset, BATCH_SIZE);
    if (batch.length === 0) break;

    // Process CONCURRENCY chunks at a time
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const slot = batch.slice(i, i + CONCURRENCY);
      await Promise.all(slot.map(c => processChunk(c, stats)));
    }

    offset += batch.length;
    const pct = Math.round((offset / cap) * 100);
    process.stdout.write(`\r  ${offset}/${cap} (${pct}%) tagged=${stats.tagged} errors=${stats.errors}`);
  }

  console.log(`\nDone: ${stats.tagged} tagged, ${stats.noTags} no-tag, ${stats.errors} errors, ${Date.now() - start}ms`);

  // Top tags
  const sorted = Object.entries(stats.tagDist).sort((a, b) => b[1] - a[1]);
  console.log('Tag distribution:');
  for (const [tag, cnt] of sorted) {
    const bar = '█'.repeat(Math.round(cnt / (sorted[0]?.[1] ?? 1) * 20));
    console.log(`  ${tag.padEnd(20)} ${String(cnt).padStart(5)}  ${bar}`);
  }

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
