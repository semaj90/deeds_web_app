#!/usr/bin/env node
/**
 * restore-llm-summaries.mjs
 *
 * Restore LLM summary artifacts from the Redis archive that
 * archive-llm-summaries.mjs snapshots daily. Mirrors restore-hypergraph-archive.mjs
 * — single-command recovery instead of manual `redis-cli HGET | jq`.
 *
 * Use cases:
 *   - Bad synthesis pass overwrites docs/agent_timeline_synthesis.md
 *   - Operator deletes next_steps/active/codebase-todo-recommendations.md
 *   - Compare today's atlas-latest against yesterday's snapshot
 *   - Rebuild a synthesis run dir from a captured day
 *
 * Recovery flow:
 *   1. List available archives                (default behavior)
 *   2. Inspect a specific day                  (--inspect <day>)
 *   3. Show one source's content               (--inspect <day> --source <id>)
 *   4. Restore one source to its original path (--restore <day> --source <id> --apply)
 *   5. Restore every file source for a day     (--restore <day> --apply)
 *
 * Usage:
 *   node scripts/restore-llm-summaries.mjs
 *   node scripts/restore-llm-summaries.mjs --inspect 2026-05-08
 *   node scripts/restore-llm-summaries.mjs --inspect 2026-05-08 --source codebase-todo
 *   node scripts/restore-llm-summaries.mjs --restore 2026-05-08 --source codebase-todo --apply
 *   node scripts/restore-llm-summaries.mjs --restore 2026-05-08 --apply
 *
 * Idempotent: --apply rewrites files only when content_hash differs from the
 * archived sha256. Existing files are backed up to <path>.bak-<timestamp>
 * before overwrite. screenshot-caption:NNN sources are skipped during restore
 * (they live in Postgres, not on disk).
 */

import { writeFile, mkdir, readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const REPO      = resolve(ROOT, '..');

const args   = process.argv.slice(2);
const APPLY  = args.includes('--apply');
const DRY    = !APPLY;
const argVal = (name) => {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split('=')[1];
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return null;
};
const RESTORE_DAY = argVal('--restore');
const INSPECT_DAY = argVal('--inspect');
const SOURCE_ID   = argVal('--source');

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const SKIP_RESTORE_PREFIXES = ['screenshot-caption']; // live in Postgres, not on disk

console.log(`\n📦 LLM summary archive restore${DRY ? ' [DRY]' : ''}`);

const { default: Redis } = await import('ioredis');
const redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
await redis.connect();

function bytes(n) { return `${(n / 1024).toFixed(1)} KB`; }
function sha16(s) { return createHash('sha256').update(s ?? '').digest('hex').slice(0, 16); }

async function listArchives() {
  const keys = await redis.keys('llm:summaries:archive:*');
  const dayKeys = keys.filter((k) => !k.endsWith(':meta')).sort().reverse();
  if (dayKeys.length === 0) {
    console.log('\n   No archives found. The archiver writes one per day.');
    console.log('   Run: npm run archive:llm\n');
    process.exit(0);
  }
  console.log(`\n   Available archives (newest first):\n`);
  for (const k of dayKeys) {
    const day  = k.split(':').pop();
    const n    = await redis.hlen(k);
    const ttl  = await redis.ttl(k);
    const meta = await redis.get(`${k}:meta`).catch(() => null);
    const m    = meta ? JSON.parse(meta) : null;
    const ttlD = ttl > 0 ? `${Math.round(ttl / 86400)}d` : 'expired';
    const sz   = m?.total_bytes != null ? bytes(m.total_bytes) : '?';
    const at   = m?.archived_at ? `  archived=${m.archived_at.slice(0, 19)}` : '';
    console.log(`   ${day}  ${String(n).padStart(3)} sources  ${sz.padStart(10)}  TTL=${ttlD}${at}`);
  }
  console.log(`\n   Inspect:  node scripts/restore-llm-summaries.mjs --inspect <day>`);
  console.log(`   Restore:  node scripts/restore-llm-summaries.mjs --restore <day> --apply\n`);
}

async function inspectDay(day) {
  const key  = `llm:summaries:archive:${day}`;
  const all  = await redis.hgetall(key);
  const meta = await redis.get(`${key}:meta`).catch(() => null);
  if (!Object.keys(all).length) {
    console.error(`❌ archive ${key} not found or empty`);
    process.exit(1);
  }

  // Single-source deep dive
  if (SOURCE_ID) {
    const raw = all[SOURCE_ID];
    if (!raw) {
      const peers = Object.keys(all).filter((f) => f.includes(SOURCE_ID));
      console.error(`❌ source '${SOURCE_ID}' not in ${key}`);
      if (peers.length) console.error(`   close matches: ${peers.join(', ')}`);
      process.exit(1);
    }
    const e = JSON.parse(raw);
    console.log(`\n   ${key} → ${SOURCE_ID}`);
    console.log(`   path:         ${e.path}`);
    console.log(`   bytes:        ${e.bytes}`);
    console.log(`   sha256:       ${e.sha256}`);
    console.log(`   generated_at: ${e.generated_at}`);
    console.log(`\n──── content (${e.content?.length ?? 0} chars) ────\n`);
    console.log(e.content ?? '(empty)');
    return;
  }

  // Day overview
  const entries = Object.entries(all).map(([f, v]) => [f, JSON.parse(v)]);
  console.log(`\n   ${key}: ${entries.length} sources`);
  if (meta) {
    const m = JSON.parse(meta);
    console.log(`   archived_at:  ${m.archived_at}`);
    console.log(`   total_bytes:  ${bytes(m.total_bytes ?? 0)}`);
    console.log(`   sources:      ${(m.sources ?? []).join(', ')}\n`);
  }
  for (const [field, e] of entries) {
    const restorable = !SKIP_RESTORE_PREFIXES.some((p) => field.startsWith(p));
    const flag = restorable ? '   ' : ' ⊘ ';
    console.log(`${flag}${field.padEnd(28)} ${String(e.bytes ?? 0).padStart(7)} bytes  sha=${e.sha256}  ${e.path}`);
  }
  console.log(`\n   ⊘ = lives in Postgres, skipped during restore`);
  console.log(`   Inspect one:  --inspect ${day} --source <field>`);
  console.log(`   Restore one:  --restore ${day} --source <field> --apply`);
  console.log(`   Restore all:  --restore ${day} --apply\n`);
}

async function restoreEntry(day, entry, field) {
  if (SKIP_RESTORE_PREFIXES.some((p) => field.startsWith(p))) {
    return { field, status: 'skip-postgres' };
  }
  if (!entry.path) return { field, status: 'skip-no-path' };

  const target = resolve(REPO, entry.path);

  // Compare to current on disk
  let currentSha = null;
  let exists     = false;
  try {
    const buf = await readFile(target, 'utf8');
    currentSha = sha16(buf);
    exists = true;
  } catch { /* missing on disk */ }

  if (exists && currentSha === entry.sha256) {
    return { field, status: 'unchanged', target };
  }

  if (DRY) {
    return { field, status: exists ? 'would-overwrite' : 'would-create', target };
  }

  // Backup existing file before overwrite
  if (exists) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bak   = `${target}.bak-${stamp}`;
    const buf   = await readFile(target, 'utf8');
    await writeFile(bak, buf, 'utf8');
  }

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, entry.content ?? '', 'utf8');
  return { field, status: exists ? 'overwrote' : 'created', target };
}

async function restoreDay(day) {
  const key = `llm:summaries:archive:${day}`;
  const all = await redis.hgetall(key);
  if (!Object.keys(all).length) {
    console.error(`❌ archive ${key} not found or empty`);
    process.exit(1);
  }

  const fields = SOURCE_ID ? [SOURCE_ID] : Object.keys(all);
  if (SOURCE_ID && !all[SOURCE_ID]) {
    console.error(`❌ source '${SOURCE_ID}' not in ${key}`);
    process.exit(1);
  }

  console.log(`\n   ${key}: restoring ${fields.length} source(s)${DRY ? ' (dry-run)' : ''}\n`);

  const out = [];
  for (const f of fields) {
    const e = JSON.parse(all[f]);
    const r = await restoreEntry(day, e, f);
    out.push(r);
    const tag = {
      'unchanged':       '·',
      'would-create':    '+',
      'would-overwrite': '~',
      'created':         '✓',
      'overwrote':       '✓',
      'skip-postgres':   '⊘',
      'skip-no-path':    '⊘',
    }[r.status] ?? '?';
    console.log(`   ${tag}  ${r.status.padEnd(16)} ${f.padEnd(28)} ${r.target ? r.target.replace(REPO, '<repo>') : ''}`);
  }

  const tally = out.reduce((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {});
  console.log(`\n   summary: ${Object.entries(tally).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  if (DRY) console.log(`\n   re-run with --apply to write\n`);
  else     console.log(`\n   note: existing files were backed up to <path>.bak-<timestamp> before overwrite\n`);
}

try {
  if (!RESTORE_DAY && !INSPECT_DAY) {
    await listArchives();
  } else if (INSPECT_DAY) {
    await inspectDay(INSPECT_DAY);
  } else {
    await restoreDay(RESTORE_DAY);
  }
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exitCode = 1;
} finally {
  await redis.quit().catch(() => {});
}
