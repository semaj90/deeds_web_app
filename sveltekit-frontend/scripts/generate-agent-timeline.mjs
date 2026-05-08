#!/usr/bin/env node
/**
 * generate-agent-timeline.mjs
 *
 * Builds docs/agent_timeline.md + docs/agents_recommendations.md from:
 *  - git log (recent commits, ISO timestamps, conventional subjects)
 *  - KAG notes from Redis wiki:note:dir:*
 *  - Qdrant codebase_chunks_768 upsert (embedded commit subjects)
 *  - Ollama embeddinggemma:latest for semantic clustering
 *  - Redis KV cache  agent:timeline:latest  (6h TTL)
 *
 * Usage:
 *   node scripts/generate-agent-timeline.mjs
 *   node scripts/generate-agent-timeline.mjs --limit 30
 *   node scripts/generate-agent-timeline.mjs --skip-embed
 *   node scripts/generate-agent-timeline.mjs --dry-run
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const DOCS      = join(ROOT, 'docs');

const args       = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const SKIP_EMBED = args.includes('--skip-embed');
const LIMIT      = parseInt(
  args.find(a => a.startsWith('--limit='))?.split('=')[1] ??
  (args.includes('--limit') ? args[args.indexOf('--limit') + 1] : '60')
) || 60;

const REDIS_URL   = process.env.REDIS_URL   ?? 'redis://127.0.0.1:6379';
const QDRANT_URL  = process.env.QDRANT_URL  ?? 'http://127.0.0.1:6333';
const OLLAMA_URL  = process.env.OLLAMA_URL  ?? 'http://127.0.0.1:11434';
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'embeddinggemma:latest';
const COLLECTION  = 'codebase_chunks_768';
const CACHE_TTL   = 6 * 3600;

// ── helpers ───────────────────────────────────────────────────────────────────
function sha1(s) {
  return createHash('sha1').update(s).digest('hex').slice(0, 12);
}

function gitLog(limit) {
  const r = spawnSync(
    'git',
    ['log', `--max-count=${limit}`, '--format=%H|%ai|%s', '--no-merges'],
    { cwd: ROOT, encoding: 'utf8', timeout: 10_000 }
  );
  if (!r.stdout?.trim()) return [];
  return r.stdout.trim().split('\n').map(line => {
    const sep   = line.indexOf('|');
    const sep2  = line.indexOf('|', sep + 1);
    const hash  = line.slice(0, sep);
    const ts    = line.slice(sep + 1, sep2);
    const subject = line.slice(sep2 + 1).trim();
    const isoTs = ts?.slice(0, 19).replace(' ', 'T') + 'Z';
    const typeMatch = subject.match(/^(fix|feat|chore|refactor|test|docs|perf|build|ci|style|revert)\b/i);
    const type  = typeMatch?.[1]?.toLowerCase() ?? 'other';
    const scope = subject.match(/\(([^)]+)\)/)?.[1] ?? '';
    return { hash, ts: isoTs, subject, type, scope };
  }).filter(c => c.hash?.length === 40);
}

function gitFilesChanged(hash) {
  const r = spawnSync(
    'git',
    ['diff-tree', '--no-commit-id', '-r', '--name-only', hash],
    { cwd: ROOT, encoding: 'utf8', timeout: 5_000 }
  );
  return (r.stdout ?? '').trim().split('\n')
    .filter(f => f.startsWith('sveltekit-frontend/src/'))
    .map(f => f.replace('sveltekit-frontend/', ''));
}

function dirOf(filePath) {
  const parts = filePath.split('/');
  return parts.slice(0, -1).join('/');
}

async function embed(text) {
  if (SKIP_EMBED) return null;
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = await res.json();
    return Array.isArray(j.embedding) ? j.embedding : null;
  } catch { return null; }
}

async function qdrantUpsert(points) {
  if (!points.length) return;
  try {
    await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=false`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch { /* non-fatal */ }
}

// ── Redis KAG notes ───────────────────────────────────────────────────────────
async function loadKagNotes(redis) {
  try {
    const keys = await redis.keys('wiki:note:dir:*');
    const kagMap = {};
    for (const k of keys.slice(0, 200)) {
      const raw = await redis.get(k);
      if (!raw) continue;
      try {
        const note = JSON.parse(raw);
        const dir  = k.replace('wiki:note:dir:', '').replace(/_/g, '/');
        kagMap[dir] = note.summary ?? note.gemma4Summary ?? note.auditSummary ?? '';
      } catch { /* skip */ }
    }
    return kagMap;
  } catch { return {}; }
}

// ── Markdown generators ───────────────────────────────────────────────────────
const TYPE_EMOJI  = { fix: '🔧', feat: '✨', perf: '⚡', refactor: '♻️', chore: '🔩', test: '🧪', docs: '📝', other: '📌' };
const TYPE_ORDER  = ['fix', 'feat', 'perf', 'refactor', 'chore', 'test', 'docs', 'other'];

function buildTimeline(commits, filesMap, kagMap) {
  const byType = {};
  for (const c of commits) {
    if (!byType[c.type]) byType[c.type] = [];
    byType[c.type].push(c);
  }

  const lines = [
    '# Agent Timeline',
    '',
    `> Generated: ${new Date().toISOString().slice(0, 19)}Z | ${commits.length} commits`,
    '> Used by agents for temporal retrieval — correlate errors, fixes, and features with timestamps.',
    '> Source: git log + Redis KAG notes + Qdrant embedding index.',
    '',
  ];

  for (const type of TYPE_ORDER) {
    const group = byType[type];
    if (!group?.length) continue;
    const emoji = TYPE_EMOJI[type] ?? '•';
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    lines.push(`## ${emoji} ${label} (${group.length})`);
    lines.push('');
    lines.push('| Timestamp | Hash | Scope | Subject | Dirs |');
    lines.push('|-----------|------|-------|---------|------|');
    for (const c of group) {
      const files   = filesMap[c.hash] ?? [];
      const dirs    = [...new Set(files.map(dirOf))].filter(Boolean).slice(0, 3);
      const dirCell = dirs.map(d => `\`${d.split('/').slice(-2).join('/')}\``).join(', ') || '—';
      const scope   = c.scope ? `\`${c.scope}\`` : '—';
      const subj    = c.subject.replace(/\|/g, '｜').slice(0, 100);
      lines.push(`| ${c.ts} | \`${c.hash.slice(0, 7)}\` | ${scope} | ${subj} | ${dirCell} |`);
    }
    lines.push('');
  }

  // KAG context for active dirs
  const activeDirs = new Set();
  for (const files of Object.values(filesMap)) files.forEach(f => activeDirs.add(dirOf(f)));

  const kagEntries = [...activeDirs]
    .map(d => ({ dir: d, summary: kagMap[d.replace(/\//g, '_')] ?? kagMap[d] ?? '' }))
    .filter(e => e.summary)
    .slice(0, 20);

  if (kagEntries.length) {
    lines.push('## Directory Context (KAG Notes)');
    lines.push('');
    lines.push('> Summaries for directories with recent git activity.');
    lines.push('');
    for (const { dir, summary } of kagEntries) {
      lines.push(`### \`${dir}\``);
      lines.push(summary.slice(0, 300));
      lines.push('');
    }
  }

  return lines.join('\n');
}

function buildRecommendations(commits, filesMap, _kagMap) {
  const dirActivity = {};
  for (const c of commits) {
    for (const f of (filesMap[c.hash] ?? [])) {
      const d = dirOf(f);
      if (!d) continue;
      if (!dirActivity[d]) dirActivity[d] = { fixes: 0, feats: 0, total: 0, lastTs: '', hashes: [] };
      if (c.type === 'fix') dirActivity[d].fixes++;
      if (c.type === 'feat') dirActivity[d].feats++;
      dirActivity[d].total++;
      if (!dirActivity[d].lastTs || c.ts > dirActivity[d].lastTs) dirActivity[d].lastTs = c.ts;
      dirActivity[d].hashes.push(c.hash.slice(0, 7));
    }
  }

  const ranked = Object.entries(dirActivity)
    .sort((a, b) => b[1].fixes - a[1].fixes)
    .slice(0, 40);

  const lines = [
    '# Agent Recommendations',
    '',
    `> Generated: ${new Date().toISOString().slice(0, 19)}Z`,
    '> Ranked by error-fix churn — most fixes = most fragile. Use Fix Timeline in AGENTS.md for per-directory detail.',
    '',
    '## High-Churn Directories',
    '',
    '| Directory | Fixes | Feats | Last Activity | Action |',
    '|-----------|-------|-------|---------------|--------|',
  ];

  for (const [dir, stat] of ranked) {
    const action = stat.fixes >= 5
      ? '⚠️ Stabilize — add tests + circuit breaker'
      : stat.fixes >= 2
      ? '🟠 Review — add G26 tests'
      : '✅ Healthy';
    lines.push(`| \`${dir}\` | ${stat.fixes} | ${stat.feats} | ${stat.lastTs.slice(0, 10)} | ${action} |`);
  }
  lines.push('');

  // Feature implementation TODOs from recent feat commits
  lines.push('## Feature Implementation TODOs');
  lines.push('');
  lines.push('> Recent feat commits that may need wiring, tests, or documentation.');
  lines.push('');
  const featCommits = commits.filter(c => c.type === 'feat').slice(0, 25);
  for (const c of featCommits) {
    const dirs  = [...new Set((filesMap[c.hash] ?? []).map(dirOf))].slice(0, 2)
      .map(d => `\`${d}\``).join(', ') || 'root';
    lines.push(`- [ ] **${c.ts.slice(0, 10)}** ${c.subject} — dirs: ${dirs}`);
  }
  lines.push('');

  // Gate violations from existing TODO-enhancements.md
  const todoPath = join(DOCS, 'TODO-enhancements.md');
  if (existsSync(todoPath)) {
    lines.push('## Gate Violations (from enrich-agents-md)');
    lines.push('');
    lines.push('> Source: `docs/TODO-enhancements.md`. Refresh: `npm run agents:enrich`.');
    lines.push('');
    const content  = readFileSync(todoPath, 'utf8');
    const sections = content.split(/^## /m).slice(1, 4);
    for (const s of sections) {
      lines.push('## ' + s.slice(0, 2000));
    }
  }

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('\n=== generate-agent-timeline ===');
console.log(`Limit: ${LIMIT} | skip-embed: ${SKIP_EMBED} | dry-run: ${DRY_RUN}`);

console.log('\n[1] git log...');
const commits = gitLog(LIMIT);
console.log(`    ${commits.length} commits`);

console.log('[2] diff-tree per commit...');
const filesMap = {};
for (const c of commits) {
  filesMap[c.hash] = gitFilesChanged(c.hash);
}

let redis = null;
let kagMap = {};
try {
  const { createClient } = await import('redis');
  redis = createClient({ url: REDIS_URL });
  await redis.connect();
  kagMap = await loadKagNotes(redis);
  console.log(`[3] KAG notes: ${Object.keys(kagMap).length} dirs`);
} catch (e) {
  console.warn(`[3] Redis unavailable (${e.message})`);
}

if (!SKIP_EMBED) {
  console.log(`[4] Embedding ${commits.length} commit subjects → Qdrant...`);
  const points = [];
  for (const c of commits) {
    const vec = await embed(`${c.type}: ${c.subject}`);
    if (!vec) continue;
    const numId = Number(BigInt(`0x${sha1(c.hash)}`) % BigInt(2_147_483_647));
    points.push({
      id: numId,
      vector: vec,
      payload: {
        kind:      'agent_timeline_entry',
        hash:      c.hash,
        ts:        c.ts,
        type:      c.type,
        scope:     c.scope,
        subject:   c.subject,
        dirs:      [...new Set((filesMap[c.hash] ?? []).map(dirOf))].slice(0, 5),
        stableKey: `timeline:${c.hash}`,
      },
    });
  }
  await qdrantUpsert(points);
  if (points.length) console.log(`    Upserted ${points.length} timeline points to Qdrant`);
} else {
  console.log('[4] Skipping embed (--skip-embed)');
}

console.log('[5] Building markdown...');
const timelineMd  = buildTimeline(commits, filesMap, kagMap);
const recommendMd = buildRecommendations(commits, filesMap, kagMap);

const timelinePath  = join(DOCS, 'agent_timeline.md');
const recommendPath = join(DOCS, 'agents_recommendations.md');

if (!DRY_RUN) {
  writeFileSync(timelinePath, timelineMd, 'utf8');
  writeFileSync(recommendPath, recommendMd, 'utf8');
  console.log(`    ✓ ${relative(ROOT, timelinePath)} (${timelineMd.length} chars)`);
  console.log(`    ✓ ${relative(ROOT, recommendPath)} (${recommendMd.length} chars)`);

  if (redis) {
    try {
      await redis.setEx('agent:timeline:latest', CACHE_TTL, timelineMd.slice(0, 100_000));
      await redis.setEx('agent:recommendations:latest', CACHE_TTL, recommendMd.slice(0, 100_000));
      console.log('    ✓ Redis cached (6h TTL): agent:timeline:latest + agent:recommendations:latest');
    } catch { /* non-fatal */ }
  }
} else {
  console.log('[dry-run] Would write:');
  console.log(`  ${timelinePath} (${timelineMd.length} chars)`);
  console.log(`  ${recommendPath} (${recommendMd.length} chars)`);
  console.log('\n--- timeline preview ---');
  console.log(timelineMd.split('\n').slice(0, 50).join('\n'));
}

if (redis) await redis.quit().catch(() => {});
console.log('\n✅ Done');