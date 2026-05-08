#!/usr/bin/env node
/**
 * archive-llm-summaries.mjs
 *
 * Daily snapshot of every LLM-generated summary into Redis with 30-day TTL.
 * Mirrors the seed-hypergraph-edges.mjs archive pattern so the operator can
 * recover from a bad synthesis pass without re-running the 20+ min upstream
 * chain (AST + GPU + embedding + Gemma4 rerank).
 *
 * Sources captured (whichever exist):
 *   - next_steps/active/codebase-todo-recommendations.md  (skill:codebase-todo)
 *   - next_steps/active/karpathy-gpu-recommendations.md   (karpathy:gpu)
 *   - docs/agent_timeline_synthesis.md                    (graph:synthesize)
 *   - memory/runs/<latest>/synthesis_summary.json         (graph:synthesize)
 *   - memory/runs/<latest>/next_actions.md                (graph:synthesize)
 *   - memory/atlas/codebase-atlas.latest.md               (atlas:build)
 *   - Postgres screenshot_artifacts.caption (last 24h)    (gemma4 VLM)
 *
 * Output:
 *   Redis HASH  llm:summaries:archive:{YYYY-MM-DD}
 *     field = source identifier (e.g. 'codebase-todo')
 *     value = JSON { source, path, sha256, generated_at, content }
 *   Redis KEY   llm:summaries:archive:{YYYY-MM-DD}:meta  (30d TTL)
 *
 * Idempotent: same key per day = atomic replace.
 *
 * Usage:
 *   node scripts/archive-llm-summaries.mjs              # apply
 *   node scripts/archive-llm-summaries.mjs --dry-run    # preview only
 *   node scripts/archive-llm-summaries.mjs --list       # show existing archives
 *   node scripts/archive-llm-summaries.mjs --inspect 2026-05-08
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const REPO      = resolve(ROOT, '..');

const args     = process.argv.slice(2);
const DRY      = args.includes('--dry-run');
const LIST     = args.includes('--list');
const inspectIdx = args.indexOf('--inspect');
const INSPECT  = inspectIdx !== -1 ? args[inspectIdx + 1] : null;

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const TTL_SEC   = 30 * 24 * 3600;  // 30 days — matches hypergraph archive

const SOURCES = [
  { id: 'codebase-todo',   path: resolve(ROOT, 'next_steps/active/codebase-todo-recommendations.md') },
  { id: 'karpathy-gpu',    path: resolve(ROOT, 'next_steps/active/karpathy-gpu-recommendations.md') },
  { id: 'agent-timeline',  path: resolve(REPO, 'sveltekit-frontend/docs/agent_timeline_synthesis.md') },
  { id: 'atlas-latest',    path: resolve(ROOT, 'memory/atlas/codebase-atlas.latest.md') },
];

async function fileEntry(id, path) {
  try {
    const s    = await stat(path);
    const buf  = await readFile(path, 'utf8');
    const sha  = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    return {
      source:       id,
      path:         path.replace(REPO + '\\', '').replace(REPO + '/', '').replace(/\\/g, '/'),
      sha256:       sha,
      bytes:        s.size,
      generated_at: s.mtime.toISOString(),
      content:      buf,
    };
  } catch {
    return null;
  }
}

async function latestSynthesisRun() {
  const runsDir = resolve(ROOT, 'memory/runs');
  try {
    const entries = await readdir(runsDir);
    const dirs = entries.filter(e => /^\d{4}-\d{2}-\d{2}T/.test(e)).sort().reverse();
    return dirs[0] ? resolve(runsDir, dirs[0]) : null;
  } catch {
    return null;
  }
}

async function postgresCaptions() {
  // Best-effort grab of last-24h screenshot captions — VLM output that costs
  // ~250s for 30 baselines, worth archiving.
  let pg;
  try { ({ default: pg } = await import('pg')); } catch { return []; }
  const url = process.env.DATABASE_URL;
  if (!url) return [];
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    const { rows } = await client.query(`
      SELECT image_uri, caption, length(caption) AS bytes, updated_at
      FROM screenshot_artifacts
      WHERE caption IS NOT NULL
        AND updated_at > now() - interval '24 hours'
      ORDER BY updated_at DESC
    `).catch(() => ({ rows: [] }));
    return rows.map(r => ({
      source:       'screenshot-caption',
      path:         r.image_uri,
      sha256:       createHash('sha256').update(r.caption ?? '').digest('hex').slice(0, 16),
      bytes:        parseInt(r.bytes, 10) || 0,
      generated_at: r.updated_at?.toISOString?.() ?? null,
      content:      r.caption,
    }));
  } finally {
    await client.end().catch(() => {});
  }
}

async function listArchives(redis) {
  const keys = await redis.keys('llm:summaries:archive:*:meta');
  const days = keys.map(k => k.replace(/^llm:summaries:archive:/, '').replace(/:meta$/, '')).sort().reverse();
  for (const day of days) {
    const meta = await redis.get(`llm:summaries:archive:${day}:meta`).catch(() => null);
    const m = meta ? JSON.parse(meta) : {};
    console.log(`  ${day}  sources=${m.source_count ?? '?'}  bytes=${m.total_bytes ?? '?'}  archived_at=${m.archived_at ?? '?'}`);
  }
  if (!days.length) console.log('  (no archives yet)');
}

async function inspectArchive(redis, day) {
  const key  = `llm:summaries:archive:${day}`;
  const all  = await redis.hgetall(key);
  const meta = await redis.get(`${key}:meta`).catch(() => null);
  console.log(`\n${key}:`);
  if (meta) console.log(`  meta: ${meta}`);
  for (const [field, value] of Object.entries(all)) {
    try {
      const v = JSON.parse(value);
      console.log(`  ${field.padEnd(22)} ${v.bytes} bytes  sha=${v.sha256}  ${v.generated_at}`);
    } catch {
      console.log(`  ${field.padEnd(22)} (unparseable)`);
    }
  }
}

async function main() {
  let Redis;
  try { ({ default: Redis } = await import('ioredis')); }
  catch { console.error('❌ ioredis not installed'); process.exit(1); }

  const redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
  await redis.connect().catch(() => {});

  if (LIST) {
    console.log(`\n📦 LLM summary archives:`);
    await listArchives(redis);
    await redis.quit();
    return;
  }
  if (INSPECT) {
    await inspectArchive(redis, INSPECT);
    await redis.quit();
    return;
  }

  console.log(`\n📦 Archive LLM summaries${DRY ? ' [DRY]' : ''}\n`);

  // Collect every available source
  const entries = [];
  for (const s of SOURCES) {
    const e = await fileEntry(s.id, s.path);
    if (e) entries.push(e);
  }
  // Latest synthesis run sub-files
  const runDir = await latestSynthesisRun();
  if (runDir) {
    for (const sub of ['synthesis_summary.json', 'next_actions.md', 'audit_gates.json']) {
      const e = await fileEntry(`synthesis-${sub.replace(/\.[^.]+$/, '')}`, resolve(runDir, sub));
      if (e) entries.push(e);
    }
  }
  // Postgres screenshot captions (one row per captioned screenshot)
  const captions = await postgresCaptions();
  entries.push(...captions);

  const totalBytes = entries.reduce((s, e) => s + (e.bytes ?? 0), 0);
  console.log(`   ${entries.length} source(s), total ${(totalBytes / 1024).toFixed(1)} KB`);
  for (const e of entries.slice(0, 8)) {
    console.log(`     ${e.source.padEnd(22)} ${(e.bytes ?? 0).toString().padStart(7)} bytes  sha=${e.sha256}`);
  }
  if (entries.length > 8) console.log(`     … and ${entries.length - 8} more`);

  if (DRY) {
    console.log(`\n   [dry] would write llm:summaries:archive:${new Date().toISOString().slice(0, 10)} (TTL ${TTL_SEC}s)`);
    await redis.quit();
    return;
  }

  if (entries.length === 0) {
    console.log(`\n   no sources found — nothing to archive`);
    await redis.quit();
    return;
  }

  const day = new Date().toISOString().slice(0, 10);
  const key = `llm:summaries:archive:${day}`;

  const pipe = redis.pipeline();
  pipe.del(key);  // atomic replace — same-day re-runs overwrite
  // Use a counter for screenshot captions so duplicate `image_uri` paths don't collide
  const seen = new Map();
  for (const e of entries) {
    let field = e.source;
    if (e.source === 'screenshot-caption') {
      const n = (seen.get('screenshot-caption') ?? 0) + 1;
      seen.set('screenshot-caption', n);
      field = `screenshot-caption:${String(n).padStart(3, '0')}`;
    }
    pipe.hset(key, field, JSON.stringify(e));
  }
  pipe.expire(key, TTL_SEC);
  pipe.set(`${key}:meta`,
           JSON.stringify({
             archived_at:  new Date().toISOString(),
             source_count: entries.length,
             total_bytes:  totalBytes,
             sources:      [...new Set(entries.map(e => e.source))],
           }),
           'EX', TTL_SEC);
  await pipe.exec();

  console.log(`\n   ✅ archived → ${key}  (${entries.length} sources, ${(totalBytes / 1024).toFixed(1)} KB, 30d TTL)`);
  console.log(`   recovery: node scripts/archive-llm-summaries.mjs --inspect ${day}`);

  await redis.quit();
}

main().catch(err => {
  console.error('✗ archive-llm-summaries failed:', err.message);
  process.exit(1);
});
