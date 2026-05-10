#!/usr/bin/env node
/**
 * graphify-cluster-summaries.mjs
 *
 * For each directory that has representativeFiles in its Redis wiki note,
 * call Gemma4 to generate a semantic summary, embed it via embeddinggemma,
 * then upsert a glyph-like Qdrant point into codebase_chunks_768 so ACE
 * can search directory-level context semantically.
 *
 * Also writes the Gemma4 summary back to the Redis wiki note so ACE KAG
 * notes include an LLM-generated description alongside the raw audit data.
 *
 * Usage:
 *   node scripts/graphify-cluster-summaries.mjs               # all dirs with files
 *   node scripts/graphify-cluster-summaries.mjs --limit 20    # first 20 (test run)
 *   node scripts/graphify-cluster-summaries.mjs --dir src/lib/server/ace  # single dir
 *   node scripts/graphify-cluster-summaries.mjs --skip-llm    # embed existing summaries only
 *   node scripts/graphify-cluster-summaries.mjs --force       # ignore cached summaries
 *
 * Outputs:
 *   Redis wiki:note:dir:* — adds gemma4Summary + embeddingId fields
 *   Qdrant codebase_chunks_768 — upserts directory glyph points
 */

import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name, def) { const i = args.indexOf(name); return i === -1 ? def : args[i + 1]; }
function has(name) { return args.includes(name); }

const LIMIT      = parseInt(flag('--limit', '0'), 10);   // 0 = unlimited
const DIR_FILTER = flag('--dir', '');                      // single directory filter
const SKIP_LLM   = has('--skip-llm');                     // embed only, no Gemma4 call
const FORCE      = has('--force');                         // ignore cached summaries
const QUIET      = has('--quiet');

const OLLAMA     = process.env.OLLAMA_BASE_URL   ?? 'http://127.0.0.1:11434';
const QDRANT_URL = process.env.QDRANT_URL        ?? 'http://127.0.0.1:6333';
const REDIS_URL  = process.env.REDIS_URL         ?? 'redis://127.0.0.1:6379';
const COLLECTION = 'codebase_chunks_768';
const LLM_MODEL  = process.env.OLLAMA_CHAT_MODEL ?? 'gemma4-legal-vlm:latest';
const EMBED_MODEL= 'embeddinggemma:latest';

const WIKI_NOTE_TTL = 24 * 3600;
const SUMMARY_TTL   = 6  * 3600;  // Qdrant glyph TTL (not supported in Qdrant, but tracked)

const log = QUIET ? () => {} : (...a) => console.log(...a);

// ── Redis ─────────────────────────────────────────────────────────────────────

const { default: Redis } = await import('ioredis');
const redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 1 });
try {
  await redis.ping();
  log('✅ Redis connected');
} catch {
  console.error('❌ Redis unavailable — aborting');
  process.exit(1);
}

async function rget(key) {
  try { const v = await redis.get(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
async function rset(key, val, ttl = WIKI_NOTE_TTL) {
  try { await redis.setex(key, ttl, JSON.stringify(val)); } catch { /* non-fatal */ }
}

// ── Load all wiki notes with representativeFiles ──────────────────────────────

log('🔍 Scanning Redis for wiki notes with representative files…');
const allKeys = await redis.keys('wiki:note:dir:*');
const candidates = [];

for (const key of allKeys) {
  const note = await rget(key);
  if (!note || !note.representativeFiles?.length) continue;
  if (DIR_FILTER && note.directoryPath !== DIR_FILTER) continue;
  if (!FORCE && note.gemma4Summary) {
    // Already summarised — skip unless --force
    continue;
  }
  candidates.push({ key, note });
}

const targets = LIMIT > 0 ? candidates.slice(0, LIMIT) : candidates;
log(`📂 ${targets.length} directories to summarise (${allKeys.length} total notes, ${candidates.length} with files and no cached summary)`);

if (targets.length === 0) {
  log('✅ Nothing to do. Use --force to re-summarise or --limit N to test.');
  await redis.quit();
  process.exit(0);
}

// ── Helpers: Ollama LLM + embed ──────────────────────────────────────────────

async function callGemma4(prompt) {
  const res = await fetch(`${OLLAMA}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:  LLM_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.2, num_predict: 200 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return (d.response ?? '').trim();
}

async function embed(text) {
  const res = await fetch(`${OLLAMA}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`embed ${res.status}`);
  const d = await res.json();
  if (!d.embedding?.length) throw new Error('empty embedding');
  return d.embedding;
}

// ── Qdrant upsert ─────────────────────────────────────────────────────────────

async function upsertGlyph(id, vector, payload) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [{ id, vector: { content: vector }, payload }],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Qdrant upsert ${res.status}: ${txt}`);
  }
}

// ── Deterministic Qdrant point ID from directory path ─────────────────────────
// Qdrant needs either a UUID or unsigned int. We hash the dir path to a uint64
// but JS doesn't support true uint64 — use a 31-bit int (safe for Qdrant).
function dirToPointId(dir) {
  const h = createHash('sha1').update(`dir-glyph:${dir}`).digest('hex');
  // Use first 7 hex chars as a positive 28-bit int (fits Qdrant unsigned int)
  return parseInt(h.slice(0, 7), 16);
}

// ── Build prompt from wiki note ───────────────────────────────────────────────

function buildPrompt(note) {
  const files = (note.representativeFiles ?? []).join('\n  - ');
  const warnings = (note.warnings ?? []).join('; ') || 'none';
  const tags = (note.dominantTags ?? []).join(', ') || 'none';
  const metrics = note.auditMetrics ?? {};
  return `You are analysing a software directory for a legal AI platform (SvelteKit + TypeScript).

Directory: ${note.directoryPath}
Type: ${note.purpose}
Files (${metrics.fileCount ?? 0} total, top by import count):
  - ${files}

Metrics:
  - API handlers: ${metrics.apiCount ?? 0}, Auth coverage: ${metrics.authCount ?? 0}
  - Zod validation: ${metrics.zodCount ?? 0}, SSR-unsafe: ${metrics.ssrUnsafeCount ?? 0}
  - Routes without tests: ${metrics.noTestCount ?? 0}, TypeScript errors: ${metrics.tsErrors ?? 0}
  - Svelte 4 legacy patterns: ${metrics.sv4LegacyCount ?? 0}
Tags: ${tags}
Warnings: ${warnings}
Audit score: ${note.auditScore ?? '?'}/100

Write a 2-3 sentence technical summary of what this directory does and what its key responsibilities are in the codebase. Focus on purpose and data flow, not on the audit warnings.`;
}

// ── Main loop ─────────────────────────────────────────────────────────────────

let ok = 0, failed = 0, skippedEmbed = 0;

for (let i = 0; i < targets.length; i++) {
  const { key, note } = targets[i];
  const dir = note.directoryPath ?? key.replace('wiki:note:dir:dir:', '').replace(/_/g, '/');
  const shortDir = dir.replace('src/', '');

  log(`[${i + 1}/${targets.length}] ${shortDir}`);

  try {
    // Step 1: Generate Gemma4 summary
    let summary = note.gemma4Summary;
    if (!summary || FORCE) {
      if (SKIP_LLM) {
        // Fallback: use the existing audit summary
        summary = note.summary ?? `Directory: ${dir}`;
        skippedEmbed++;
      } else {
        const prompt = buildPrompt(note);
        summary = await callGemma4(prompt);
        log(`   💬 ${summary.slice(0, 80)}…`);
      }
    } else {
      log(`   ⏭️  Using cached summary`);
    }

    // Step 2: Embed the summary
    const vector = await embed(`${dir}: ${summary}`);

    // Step 3: Upsert to Qdrant as a directory glyph
    const pointId = dirToPointId(dir);
    await upsertGlyph(pointId, vector, {
      kind:               'directory-cluster',
      dir,
      summary,
      representativeFiles: note.representativeFiles ?? [],
      dominantTags:        note.dominantTags ?? [],
      auditScore:          note.auditScore ?? 0,
      clusterId:           note.clusterId ?? -1,
      clusterType:        'directory-glyph',
      warnings:            note.warnings ?? [],
      auditMetrics:        note.auditMetrics ?? {},
      generatedAt:         new Date().toISOString(),
    });

    // Step 4: Write summary back to Redis wiki note
    const updatedNote = {
      ...note,
      gemma4Summary: summary,
      embeddingId:   pointId,
      summaryUpdatedAt: new Date().toISOString(),
    };
    await rset(key, updatedNote);

    ok++;
  } catch (err) {
    console.warn(`   ❌ ${shortDir}: ${err.message}`);
    failed++;
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

log('');
log(`✅ Done: ${ok} glyph(s) upserted to Qdrant ${COLLECTION}`);
if (skippedEmbed > 0) log(`   ⏭️  ${skippedEmbed} used fallback summary (--skip-llm)`);
if (failed > 0)        log(`   ❌ ${failed} failed`);
log(`   Qdrant: ${QDRANT_URL}/collections/${COLLECTION}`);

await redis.quit();
