#!/usr/bin/env node
/**
 * karpathy-tag-parallel.mjs — Parallel LLM semantic tagging for codebase chunks.
 *
 * Scrolls codebase_chunks_768 filtering for content-bearing points,
 * classifies each via Ollama gemma4-legal-vlm, writes tags to Qdrant + Postgres.
 *
 * Concurrency: 4 parallel Ollama requests (configurable via --concurrency).
 * Speed: ~4x faster than sequential SSE endpoint (~60 chunks/min).
 *
 * Usage:
 *   node scripts/karpathy-tag-parallel.mjs [--concurrency N] [--limit N] [--dry-run]
 */

import pg from 'pg';
const { Pool } = pg;

const QDRANT_URL   = process.env.QDRANT_URL ?? 'http://localhost:6333';
const OLLAMA_URL   = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const MODEL        = process.env.OLLAMA_CHAT_MODEL ?? 'gemma4-legal-vlm:latest';
const COLLECTION   = 'codebase_chunks_768';
const PG_URL       = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const CONCURRENCY  = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] ?? '4');
const LIMIT        = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0');
const DRY_RUN      = process.argv.includes('--dry-run');

const pool = new Pool({ connectionString: PG_URL });

// ── Semantic tag vocabulary (Karpathy 20-atom) ─────────────────────────────

const SEMANTIC_TAGS = [
  'api-route', 'page-component', 'server-module', 'ui-component',
  'state-machine', 'database', 'vector-search', 'graph-db',
  'cache', 'rag-pipeline', 'auth', 'types', 'config', 'test',
  'utility', 'worker', 'sse', 'embedding', 'analytics', 'ml-inference',
];

// ── Qdrant scroll (content-bearing only) ───────────────────────────────────

async function scrollWithContent(offset, limit) {
  const body = {
    limit,
    with_payload: true,
    with_vectors: false,
    // Qdrant "must" filter: only points where content field is non-empty
    filter: {
      must: [
        { key: 'content', match: { except: [''] } },
      ],
    },
  };
  if (offset !== null && offset !== undefined) body.offset = offset;

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    // Fallback: scroll without filter (filter may not work on text fields)
    const body2 = { limit, with_payload: true, with_vectors: false };
    if (offset !== null && offset !== undefined) body2.offset = offset;
    const res2 = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body2),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res2.ok) throw new Error(`Qdrant scroll failed: ${res2.status}`);
    const data2 = await res2.json();
    // Manual filter
    const pts = (data2.result?.points ?? []).filter(p => p.payload?.content?.length > 20);
    return { points: pts, nextOffset: data2.result?.next_page_offset ?? null };
  }
  const data = await res.json();
  return {
    points:     data.result?.points ?? [],
    nextOffset: data.result?.next_page_offset ?? null,
  };
}

// ── LLM classification ─────────────────────────────────────────────────────

async function classifyOne(chunk) {
  const p    = chunk.payload ?? {};
  const code = (p.content ?? '').slice(0, 800);
  if (code.trim().length < 20) return [];

  const ext    = p.extension ?? ((p.relativePath ?? p.path ?? p.file_path ?? '').match(/\.([^.]+)$/)?.[1] ?? 'ts');
  const kind   = p.kind ?? '';
  const symbol = p.symbol ?? '';
  const path   = p.relativePath ?? p.path ?? p.file_path ?? '';

  const prompt = [
    `You are a code classifier. Given this ${ext} code chunk, reply ONLY with a comma-separated list of 1-4 tags from this vocabulary:`,
    `${SEMANTIC_TAGS.join(', ')}`,
    '',
    `File: ${path}`,
    `Context: kind=${kind}, symbol=${symbol}`,
    '',
    'Code:',
    `\`\`\`${ext}`,
    code,
    `\`\`\``,
    '',
    'Tags (comma-separated, no explanation):',
  ].join('\n');

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:   MODEL,
        prompt,
        stream:  false,
        options: { temperature: 0, num_predict: 60 },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return [];

    const data = await res.json();
    const raw  = (data.response ?? '').replace(/\n/g, ' ').trim();

    return [...new Set(
      raw.split(/[,\s]+/)
        .map(t => t.toLowerCase().replace(/[^a-z-]/g, '').trim())
        .filter(t => SEMANTIC_TAGS.includes(t))
    )];
  } catch {
    return [];
  }
}

// ── Write tags to Qdrant ───────────────────────────────────────────────────

async function patchQdrant(id, newTags) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ payload: { tags: newTags }, points: [id] }),
    signal:  AbortSignal.timeout(10_000),
  }).catch(() => null);
  return res?.ok ?? false;
}

// ── Write tags to Postgres ─────────────────────────────────────────────────

async function patchPostgres(qdrantId, tags) {
  try {
    await pool.query(
      `UPDATE codebase_chunk_index SET semantic_tags = $1, updated_at = now() WHERE qdrant_id = $2`,
      [tags, String(qdrantId)]
    );
  } catch { /* ignore */ }
}

// ── Parallel executor ──────────────────────────────────────────────────────

async function runParallel(items, fn, concurrency) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Karpathy parallel tagger (model=${MODEL}, concurrency=${CONCURRENCY}, limit=${LIMIT || 'all'}, dry=${DRY_RUN})`);

  let offset = null;
  let total = 0, tagged = 0, empty = 0, errors = 0;
  const tagDist = {};
  const start = Date.now();

  do {
    const { points, nextOffset } = await scrollWithContent(offset, 100);
    offset = nextOffset;

    // Filter to content-bearing chunks
    const batch = points.filter(p => (p.payload?.content ?? '').length > 20);
    if (batch.length === 0) {
      if (!nextOffset) break;
      continue;
    }

    // Classify in parallel
    const results = await runParallel(batch, async (chunk) => {
      const tags = await classifyOne(chunk);
      return { id: chunk.id, tags };
    }, CONCURRENCY);

    // Write results
    for (const { id, tags } of results) {
      total++;
      if (tags.length > 0) {
        tagged++;
        for (const t of tags) tagDist[t] = (tagDist[t] ?? 0) + 1;

        if (!DRY_RUN) {
          await patchQdrant(id, tags);
          await patchPostgres(id, tags);
        }
      } else {
        empty++;
      }
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const rate = (total / (elapsed || 1)).toFixed(1);
    process.stdout.write(`\r  ${total} processed, ${tagged} tagged, ${empty} empty, ${rate} chunks/s, ${elapsed}s`);

    if (LIMIT > 0 && total >= LIMIT) break;
  } while (offset);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\nDone: ${total} processed, ${tagged} tagged (${empty} empty), ${elapsed}s`);
  console.log('Tag distribution:', tagDist);

  // Verify
  if (!DRY_RUN && tagged > 0) {
    const { rows } = await pool.query(`
      SELECT unnest(semantic_tags) as tag, count(*) as cnt
      FROM codebase_chunk_index
      WHERE semantic_tags != '{}'
      GROUP BY tag ORDER BY cnt DESC LIMIT 20
    `);
    console.log('Postgres tag stats:', rows);
  }

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });