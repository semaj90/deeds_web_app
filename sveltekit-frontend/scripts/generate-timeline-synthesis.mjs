#!/usr/bin/env node
/**
 * generate-timeline-synthesis.mjs
 *
 * LLM synthesis of the agent timeline via:
 *   1. Embed the analysis query (Ollama embeddinggemma:latest → 768-dim)
 *   2. Qdrant semantic search on codebase_chunks_768 for agent_timeline_entry points
 *   3. pgvector semantic search on research_summaries (manifold4 cosine distance)
 *   4. Quaternion-manifold rerank: standardise → HMM bias → dot-product score
 *   5. KAG context: Redis wiki:note:dir:* for active directories
 *   6. Gemma4 streaming synthesis (Ollama /api/generate stream)
 *   7. Output: docs/agent_timeline_synthesis.md + Redis agent:synthesis:latest (6h TTL)
 *
 * Usage:
 *   node scripts/generate-timeline-synthesis.mjs
 *   node scripts/generate-timeline-synthesis.mjs --dry-run
 *   node scripts/generate-timeline-synthesis.mjs --stream        (stream to stdout)
 *   node scripts/generate-timeline-synthesis.mjs --query "fix oauth"
 *   node scripts/generate-timeline-synthesis.mjs --limit 30
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const DOCS      = join(ROOT, 'docs');

const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const STREAM_OUT  = args.includes('--stream');
const LIMIT       = parseInt(
  args.find(a => a.startsWith('--limit='))?.split('=')[1] ??
  (args.includes('--limit') ? args[args.indexOf('--limit') + 1] : '20')
) || 20;
const QUERY_ARG   = (() => {
  const qi = args.indexOf('--query');
  return qi !== -1 ? args[qi + 1] : null;
})();

const REDIS_URL   = process.env.REDIS_URL   ?? 'redis://127.0.0.1:6379';
const QDRANT_URL  = process.env.QDRANT_URL  ?? 'http://127.0.0.1:6333';
const OLLAMA_URL  = process.env.OLLAMA_URL  ?? 'http://127.0.0.1:11434';
const DB_URL      = process.env.DATABASE_URL ?? '';
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'embeddinggemma:latest';
const LLM_MODEL   = process.env.LLM_MODEL   ?? 'gemma4-legal-vlm:latest';
const COLLECTION  = 'codebase_chunks_768';
const CACHE_TTL   = 6 * 3600;

// ── Manifold4 constants (mirrors quaternion-manifold.ts) ─────────────────────
const SOM_GRID_MAX   = 40;
const SEMANTIC_MAX   = 1;
const GRPO_MAX       = 1;

function standardiseManifold4(m4) {
  return [
    Math.max(-1, Math.min(1, m4[0] / SOM_GRID_MAX)),  // som_x
    Math.max(-1, Math.min(1, m4[1] / SOM_GRID_MAX)),  // som_y
    Math.max(-1, Math.min(1, m4[2] / SEMANTIC_MAX)),   // semantic_z
    Math.max(-1, Math.min(1, m4[3] / GRPO_MAX)),       // grpo_w
  ];
}

function toUnitQuaternion(m4) {
  // manifold4 = [som_x, som_y, semantic_z, grpo_w]
  // quaternion = [w, x, y, z] where w=grpo_w, x=som_x, y=som_y, z=semantic_z
  const [sx, sy, sz, gw] = standardiseManifold4(m4);
  const norm = Math.sqrt(gw * gw + sx * sx + sy * sy + sz * sz) || 1;
  return [gw / norm, sx / norm, sy / norm, sz / norm];
}

function quaternionSimilarity(a, b) {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  return Math.abs(dot); // 0..1, 1 = same direction on S³
}

// ── Embed query ───────────────────────────────────────────────────────────────
async function embed(text) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(20_000),
    });
    const j = await res.json();
    return Array.isArray(j.embedding) ? j.embedding : null;
  } catch (e) {
    console.warn('[embed] failed:', e.message);
    return null;
  }
}

// ── Qdrant: search timeline entries ──────────────────────────────────────────
async function qdrantTimelineSearch(queryVec, limit) {
  try {
    const res = await fetch(
      `${QDRANT_URL}/collections/${COLLECTION}/points/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector: queryVec,
          limit,
          filter: { must: [{ key: 'kind', match: { value: 'agent_timeline_entry' } }] },
          with_payload: true,
        }),
        signal: AbortSignal.timeout(15_000),
      }
    );
    const j = await res.json();
    return Array.isArray(j.result) ? j.result : [];
  } catch (e) {
    console.warn('[qdrant] search failed:', e.message);
    return [];
  }
}

// ── pgvector: research_summaries manifold4 search ────────────────────────────
async function pgvectorSearch(queryM4, limit) {
  if (!DB_URL) return [];
  try {
    // Encode manifold4 as pgvector literal
    const vecLiteral = `'[${queryM4.join(',')}]'`;
    // Use postgres via pg package
    const { default: pg } = await import('pg').catch(() => ({ default: null }));
    if (!pg) return [];
    const client = new pg.Client({ connectionString: DB_URL });
    await client.connect();
    const result = await client.query(
      `SELECT id, title, summary, manifold4::text as manifold4_text,
              som_cluster, created_at,
              manifold4 <-> $1::vector(4) AS distance
       FROM research_summaries
       WHERE manifold4 IS NOT NULL
       ORDER BY manifold4 <-> $1::vector(4)
       LIMIT $2`,
      [vecLiteral, limit]
    );
    await client.end();
    return result.rows.map((r) => ({
      id: r.id,
      title: r.title ?? '',
      summary: r.summary ?? '',
      manifold4: r.manifold4_text ? JSON.parse(r.manifold4_text.replace(/[[\]]/g, m => m)) : null,
      som_cluster: r.som_cluster,
      created_at: r.created_at,
      distance: parseFloat(r.distance),
    }));
  } catch (e) {
    console.warn('[pgvector] search failed:', e.message);
    return [];
  }
}

// ── Redis KAG notes ───────────────────────────────────────────────────────────
async function loadKagNotes(redis, dirs) {
  const kagMap = {};
  try {
    for (const d of dirs.slice(0, 20)) {
      const key1 = `wiki:note:dir:${d.replace(/\//g, '_')}`;
      const key2 = `wiki:note:dir:${d}`;
      const raw  = await redis.get(key1) ?? await redis.get(key2);
      if (!raw) continue;
      try {
        const note = JSON.parse(raw);
        kagMap[d]  = note.gemma4Summary ?? note.summary ?? note.auditSummary ?? '';
      } catch { /* skip */ }
    }
  } catch { /* non-fatal */ }
  return kagMap;
}

// ── Quaternion rerank ─────────────────────────────────────────────────────────
function rerankByQuaternion(hits, queryM4) {
  if (!queryM4 || hits.length === 0) return hits;
  const queryQ = toUnitQuaternion(queryM4);
  return hits
    .map((h) => {
      const hm4 = h.payload?.manifold4 ?? h.m4 ?? null;
      const qsim = hm4 ? quaternionSimilarity(queryQ, toUnitQuaternion(hm4)) : 0.5;
      const baseSim = h.score ?? (1 - (h.distance ?? 0.5));
      const combined = 0.6 * baseSim + 0.4 * qsim;
      return { ...h, _qsim: qsim, _combined: combined };
    })
    .sort((a, b) => b._combined - a._combined);
}

// ── Default analysis query ────────────────────────────────────────────────────
function defaultQuery(timelineMd) {
  // Extract recent commit subjects for focused query
  const lines = timelineMd.split('\n').filter(l => l.startsWith('| 2026'));
  const subjects = lines.slice(0, 8).map(l => {
    const cols = l.split(' | ');
    return cols[3]?.trim() ?? '';
  }).filter(Boolean);
  return subjects.length
    ? `Recent codebase activity: ${subjects.slice(0, 4).join('; ')}`
    : 'codebase fix timeline analysis agent recommendations';
}

// ── Gemma4 streaming synthesis ────────────────────────────────────────────────
async function synthesize(prompt, onChunk) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt,
        stream: true,
        options: { temperature: 0.3, num_predict: 1200, stop: ['</analysis>'] },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const reader = res.body.getReader();
    const dec    = new TextDecoder();
    let full     = '';
    let streaming = true;
    while (streaming) {
      const { done, value } = await reader.read();
      if (done) { streaming = false; break; }
      const lines = dec.decode(value, { stream: true }).split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const j = JSON.parse(line);
          if (j.response) {
            full += j.response;
            onChunk(j.response);
          }
        } catch { /* partial JSON */ }
      }
    }
    return full;
  } catch (e) {
    console.warn('[llm] synthesis failed:', e.message);
    return null;
  }
}

// ── Build synthesis prompt ────────────────────────────────────────────────────
function buildPrompt(query, timelineSnippet, qdrantHits, pgHits, kagNotes) {
  const qdrantCtx = qdrantHits.slice(0, 10).map((h, i) => {
    const p    = h.payload ?? {};
    const type = p.type ?? '?';
    const ts   = p.ts ?? '';
    const subj = p.subject ?? h.chunkId ?? '';
    const dirs = (p.dirs ?? []).join(', ') || '—';
    const sim  = h._combined != null ? `(q=${h._combined.toFixed(3)})` : '';
    return `${i + 1}. [${type}] ${ts.slice(0, 10)} ${subj} → ${dirs} ${sim}`;
  }).join('\n');

  const pgCtx = pgHits.slice(0, 5).map((r, i) =>
    `${i + 1}. [research] ${r.title || r.id} — ${(r.summary ?? '').slice(0, 120)}`
  ).join('\n');

  const kagCtx = Object.entries(kagNotes).slice(0, 6).map(([d, s]) =>
    `### ${d}\n${String(s).slice(0, 200)}`
  ).join('\n\n');

  const timelineExcerpt = timelineSnippet.split('\n').slice(0, 60).join('\n');

  return `You are a codebase intelligence agent analyzing recent engineering activity.

## Query
${query}

## Recent Agent Timeline (git commits by type)
${timelineExcerpt}

## Semantically Relevant Commits (Qdrant + quaternion rerank)
${qdrantCtx || '(none retrieved)'}

## Related Research Summaries (pgvector manifold4 proximity)
${pgCtx || '(none retrieved)'}

## Directory KAG Context (Redis wiki notes)
${kagCtx || '(none available)'}

## Instructions
Write a structured analysis covering:
1. **Fix Pattern**: What categories of bugs are being fixed most? Which directories are unstable?
2. **Feature Momentum**: What features are being built? Are they wired end-to-end or shallow?
3. **Recommendations**: Top 3 actions to stabilize high-churn directories and close open feature loops.
4. **TODO Priority List**: Ordered list of items with timestamps from the timeline that need follow-up.

Format as Markdown. Be concise and specific. Reference actual commit hashes and timestamps.
<analysis>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('\n=== generate-timeline-synthesis ===');
console.log(`Limit: ${LIMIT} | dry-run: ${DRY_RUN} | stream: ${STREAM_OUT}`);

// Read existing timeline doc for context
const timelinePath = join(DOCS, 'agent_timeline.md');
const timelineMd   = existsSync(timelinePath)
  ? readFileSync(timelinePath, 'utf8')
  : '';
if (!timelineMd) {
  console.warn('[warn] agent_timeline.md not found — run: npm run agents:timeline:fast');
}

// Determine query
const query = QUERY_ARG ?? defaultQuery(timelineMd);
console.log(`[query] "${query.slice(0, 80)}..."`);

// ── Step 1: Embed query ───────────────────────────────────────────────────────
console.log('\n[1] Embedding query...');
const queryVec = await embed(query);
if (!queryVec) {
  console.warn('    Embedding unavailable — will use KAG + timeline only (no Qdrant search)');
}

// Derive a manifold4 proxy from the query vector for quaternion scoring
// Use a compact 4D projection: mean of 4 quadrant-averaged chunks of the 768-dim vec
let queryM4 = null;
if (queryVec) {
  const chunk = Math.floor(queryVec.length / 4);
  queryM4 = [
    queryVec.slice(0, chunk).reduce((a, v) => a + v, 0) / chunk,
    queryVec.slice(chunk, 2 * chunk).reduce((a, v) => a + v, 0) / chunk,
    queryVec.slice(2 * chunk, 3 * chunk).reduce((a, v) => a + v, 0) / chunk,
    queryVec.slice(3 * chunk).reduce((a, v) => a + v, 0) / chunk,
  ];
  // Scale to typical manifold4 ranges before standardisation
  queryM4[0] = (queryM4[0] + 1) * 20;  // som_x [0..40]
  queryM4[1] = (queryM4[1] + 1) * 20;  // som_y [0..40]
  // z and w are already in [-1, 1]
  console.log(`    Query manifold4 proxy: [${queryM4.map(v => v.toFixed(3)).join(', ')}]`);
}

// ── Step 2: Qdrant timeline search ────────────────────────────────────────────
console.log('[2] Qdrant timeline search...');
let qdrantHits = [];
if (queryVec) {
  qdrantHits = await qdrantTimelineSearch(queryVec, LIMIT * 2);
  console.log(`    ${qdrantHits.length} timeline hits from Qdrant`);
} else {
  console.log('    Skipped (no embedding)');
}

// ── Step 3: pgvector research_summaries search ────────────────────────────────
console.log('[3] pgvector research_summaries search...');
let pgHits = [];
if (queryM4) {
  pgHits = await pgvectorSearch(queryM4, Math.ceil(LIMIT / 2));
  console.log(`    ${pgHits.length} research_summaries hits from pgvector`);
} else {
  console.log('    Skipped (no manifold4 proxy)');
}

// ── Step 4: Quaternion rerank ─────────────────────────────────────────────────
console.log('[4] Quaternion rerank...');
const rerankedQdrant = rerankByQuaternion(qdrantHits, queryM4);
const topHits        = rerankedQdrant.slice(0, LIMIT);
console.log(`    Top ${topHits.length} after quaternion rerank`);
if (topHits.length) {
  const best = topHits[0];
  console.log(`    Best: [${best.payload?.type}] ${(best.payload?.subject ?? '').slice(0, 60)} combined=${best._combined?.toFixed(3)}`);
}

// ── Step 5: KAG notes for active directories ──────────────────────────────────
let redis   = null;
let kagNotes = {};
try {
  const { createClient } = await import('redis');
  redis = createClient({ url: REDIS_URL });
  await redis.connect();

  // Collect active dirs from Qdrant hits + timeline
  const activeDirs = new Set();
  for (const h of topHits) {
    for (const d of (h.payload?.dirs ?? [])) activeDirs.add(d);
  }
  // Also extract dirs from timeline markdown
  const dirMatches = timelineMd.matchAll(/`(src\/[^`]+)`/g);
  for (const m of dirMatches) activeDirs.add(m[1]);

  kagNotes = await loadKagNotes(redis, [...activeDirs]);
  console.log(`[5] KAG notes: ${Object.keys(kagNotes).length} dirs loaded`);

  // Check Redis synthesis cache
  const cached = await redis.get('agent:synthesis:latest');
  if (cached && !DRY_RUN && !QUERY_ARG) {
    const cacheAge = await redis.ttl('agent:synthesis:latest');
    if (cacheAge > CACHE_TTL - 600) {
      console.log(`    Cache hit (TTL: ${cacheAge}s) — use --query to force refresh`);
      process.stdout.write(cached.slice(0, 200) + '\n...[cached]\n');
      await redis.quit().catch(() => {});
      process.exit(0);
    }
  }
} catch (e) {
  console.warn(`[5] Redis unavailable (${e.message})`);
}

// ── Step 6: Build prompt + Gemma4 synthesis ───────────────────────────────────
console.log('[6] Building synthesis prompt...');
const prompt = buildPrompt(query, timelineMd, topHits, pgHits, kagNotes);
console.log(`    Prompt length: ${prompt.length} chars`);

if (DRY_RUN) {
  console.log('\n[dry-run] Prompt preview:');
  console.log(prompt.slice(0, 800));
  console.log('\n[dry-run] Would call Gemma4 and write docs/agent_timeline_synthesis.md');
  if (redis) await redis.quit().catch(() => {});
  process.exit(0);
}

console.log('[7] Gemma4 streaming synthesis...');
const chunks   = [];
let   charCount = 0;

if (STREAM_OUT) process.stdout.write('\n--- synthesis start ---\n');

const synthesis = await synthesize(prompt, (chunk) => {
  chunks.push(chunk);
  charCount += chunk.length;
  if (STREAM_OUT) process.stdout.write(chunk);
  else if (charCount % 200 < chunk.length) process.stdout.write('.');
});

if (!STREAM_OUT) process.stdout.write('\n');

if (!synthesis) {
  console.warn('\n[warn] LLM synthesis failed — writing KAG-only fallback');
}

// ── Step 7: Build output markdown ─────────────────────────────────────────────
const now = new Date().toISOString().slice(0, 19) + 'Z';

const header = [
  '# Agent Timeline Synthesis',
  '',
  `> Generated: ${now} | Query: "${query.slice(0, 80)}"`,
  `> Pipeline: Qdrant (${topHits.length} hits) + pgvector (${pgHits.length} hits) + quaternion rerank + Gemma4 synthesis`,
  `> Model: ${LLM_MODEL} | Embedding: ${EMBED_MODEL}`,
  '',
].join('\n');

const synthesisSection = synthesis
  ? `## LLM Analysis\n\n${synthesis}\n`
  : `## LLM Analysis\n\n_(synthesis unavailable — check Ollama)_\n`;

const qdrantSection = [
  '## Top Semantically Relevant Commits',
  '',
  '> Quaternion reranked — combined score = 0.6 × Qdrant cosine + 0.4 × manifold4 quaternion similarity',
  '',
  '| Score | Type | Date | Subject | Dirs |',
  '|-------|------|------|---------|------|',
  ...topHits.slice(0, 20).map((h) => {
    const p     = h.payload ?? {};
    const score = h._combined?.toFixed(3) ?? h.score?.toFixed(3) ?? '—';
    const type  = p.type ?? '?';
    const date  = (p.ts ?? '').slice(0, 10);
    const subj  = (p.subject ?? '').replace(/\|/g, '｜').slice(0, 80);
    const dirs  = (p.dirs ?? []).slice(0, 2).map(d => `\`${d.split('/').slice(-1)[0]}\``).join(', ') || '—';
    return `| ${score} | ${type} | ${date} | ${subj} | ${dirs} |`;
  }),
  '',
].join('\n');

const pgSection = pgHits.length ? [
  '## Related Research Summaries (pgvector manifold4)',
  '',
  '| Distance | Title | Summary |',
  '|----------|-------|---------|',
  ...pgHits.slice(0, 10).map((r) => {
    const dist  = r.distance?.toFixed(4) ?? '—';
    const title = (r.title ?? r.id ?? '').slice(0, 60);
    const summ  = (r.summary ?? '').replace(/\|/g, '｜').slice(0, 100);
    return `| ${dist} | ${title} | ${summ} |`;
  }),
  '',
].join('\n') : '';

const kagSection = Object.keys(kagNotes).length ? [
  '## Directory KAG Context',
  '',
  ...Object.entries(kagNotes).slice(0, 8).map(([d, s]) => [
    `### \`${d}\``,
    String(s).slice(0, 250),
    '',
  ].join('\n')),
].join('\n') : '';

const fullMd = [header, synthesisSection, qdrantSection, pgSection, kagSection].join('\n');

const outputPath = join(DOCS, 'agent_timeline_synthesis.md');
writeFileSync(outputPath, fullMd, 'utf8');
console.log(`\n✓ docs/agent_timeline_synthesis.md (${fullMd.length} chars)`);

if (redis) {
  try {
    await redis.setEx('agent:synthesis:latest', CACHE_TTL, fullMd.slice(0, 80_000));
    await redis.setEx('agent:synthesis:query',  CACHE_TTL, query);
    console.log('✓ Redis cached (6h TTL): agent:synthesis:latest + agent:synthesis:query');
  } catch { /* non-fatal */ }
  await redis.quit().catch(() => {});
}

console.log('\n✅ Done');
