#!/usr/bin/env node
/**
 * nightly-summary.mjs — Phase 11I
 * Summarises daily activity: changed files, hot errors, hot sourceRefs.
 * Writes .opencode/summaries/nightly-{iso-date}.md + Redis cold key (30d TTL).
 *
 * Usage:
 *   node scripts/opencode/nightly-summary.mjs
 *   node scripts/opencode/nightly-summary.mjs --dry-run
 */

import fs from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import readline from 'readline';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const ROOT     = process.cwd();
const DRY_RUN  = process.argv.includes('--dry-run');
const ISO_DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR  = path.join(ROOT, '.opencode', 'summaries');
const OUT_FILE = path.join(OUT_DIR, `nightly-${ISO_DATE}.md`);
const TTL_COLD = 30 * 24 * 3600; // 30 days

async function loadRedis() {
  const candidates = [
    path.join(ROOT, 'sveltekit-frontend', 'node_modules', 'ioredis'),
    path.join(ROOT, 'node_modules', 'ioredis'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const mod = await import(pathToFileURL(path.join(p, 'built', 'index.js')).href);
      const Redis = mod.default ?? mod;
      const r = new Redis({ host: '127.0.0.1', port: 6379, lazyConnect: true,
        maxRetriesPerRequest: 1, enableOfflineQueue: false, retryStrategy: () => null });
      r.on('error', () => {});
      try { await r.connect(); await r.ping(); return r; } catch { r.disconnect(); }
    }
  }
  return null;
}

async function readNdjson(filePath) {
  const rows = [];
  if (!existsSync(filePath)) return rows;
  const rl = readline.createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return rows;
}

function gitChangedFiles() {
  try {
    const out = execSync('git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only HEAD', {
      cwd: ROOT, encoding: 'utf8', timeout: 5000
    });
    return out.trim().split('\n').filter(Boolean).slice(0, 30);
  } catch { return []; }
}

function gitRecentCommits() {
  try {
    const out = execSync('git log --oneline -5 2>/dev/null', { cwd: ROOT, encoding: 'utf8', timeout: 5000 });
    return out.trim().split('\n').filter(Boolean);
  } catch { return []; }
}

async function hotSourceRefs() {
  // Read from rerank diff (most-moved = hot) and ace-packet top cards
  const diff = JSON.parse(
    await fs.readFile(path.join(ROOT, '.tmp', 'rerank-diff.json'), 'utf8').catch(() => '{}')
  );
  const movers = (diff.movers || []).slice(0, 10).map(m => m.sourceRef).filter(Boolean);

  const packet = JSON.parse(
    await fs.readFile(path.join(ROOT, '.opencode', 'ace-packet.json'), 'utf8').catch(() => '{}')
  );
  const topCards = (packet.cards || []).slice(0, 10).map(c => c.sourceRef).filter(Boolean);

  return [...new Set([...movers, ...topCards])].slice(0, 15);
}

async function hotErrors() {
  // Read from bifrost smoke report if available
  const smoke = JSON.parse(
    await fs.readFile(path.join(ROOT, '.tmp', 'bifrost-trace-smoke.json'), 'utf8').catch(() => '{}')
  );
  const errors = [];
  for (const [key, val] of Object.entries(smoke.results || {})) {
    if (!val.ok) errors.push(`${key}: ${val.error || 'failed'}`);
  }

  // Also read task cards marked high risk
  const tasks = await readNdjson(path.join(ROOT, '.opencode', 'recommendations', 'tasks.ndjson'));
  for (const t of tasks.filter(t => t.risk === 'high').slice(0, 5)) {
    errors.push(`[HIGH] ${t.title.slice(0, 80)}`);
  }
  return errors.slice(0, 10);
}

async function main() {
  console.log('\n── Nightly Summary (Phase 11I) ───────────────────────────');
  console.log(`  date: ${ISO_DATE}${DRY_RUN ? '  [dry-run]' : ''}`);

  const [changedFiles, commits, srefs, errors] = await Promise.all([
    Promise.resolve(gitChangedFiles()),
    Promise.resolve(gitRecentCommits()),
    hotSourceRefs(),
    hotErrors(),
  ]);

  const tasks = await readNdjson(path.join(ROOT, '.opencode', 'recommendations', 'tasks.ndjson'));
  const todoTasks = tasks.filter(t => t.status === 'todo');

  console.log(`  changed files : ${changedFiles.length}`);
  console.log(`  hot sourceRefs: ${srefs.length}`);
  console.log(`  hot errors    : ${errors.length}`);
  console.log(`  open tasks    : ${todoTasks.length}`);

  const md = [
    `# Nightly Summary — ${ISO_DATE}`,
    ``,
    `> Generated: ${new Date().toISOString()}`,
    ``,
    `## Recent Commits`,
    ...commits.map(c => `- \`${c}\``),
    ``,
    `## Changed Files (${changedFiles.length})`,
    ...changedFiles.map(f => `- \`${f}\``),
    ``,
    `## Hot sourceRefs`,
    ...srefs.map(s => `- \`${s}\``),
    ``,
    `## Hot Errors / Blocked Lanes`,
    errors.length ? errors.map(e => `- ${e}`).join('\n') : '- None detected',
    ``,
    `## Open Tasks (${todoTasks.length})`,
    ...todoTasks.slice(0, 10).map(t =>
      `- [${t.risk.toUpperCase()}] \`${t.cluster}\` — ${t.title.slice(0, 70)}`
    ),
    ``,
    `## Cache Keys Written`,
    `- \`ace:summary:nightly:${ISO_DATE}\` (TTL 30d)`,
    `- \`.opencode/summaries/nightly-${ISO_DATE}.md\``,
  ].join('\n');

  if (!DRY_RUN) {
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(OUT_FILE, md, 'utf8');
    console.log(`\n  ✅ wrote ${OUT_FILE}`);

    const redis = await loadRedis();
    if (redis) {
      await redis.set(`ace:summary:nightly:${ISO_DATE}`, md, 'EX', TTL_COLD);
      console.log(`  ✅ ace:summary:nightly:${ISO_DATE} SET (TTL 30d)`);
      await redis.quit();
    } else {
      console.log('  ⚠️  Redis offline — disk only');
    }
  } else {
    console.log(`\n  dry-run: would write nightly-${ISO_DATE}.md + Redis cold key`);
  }

  console.log('──────────────────────────────────────────────────────────\n');
}

main().catch(e => { console.error(e); process.exit(1); });
