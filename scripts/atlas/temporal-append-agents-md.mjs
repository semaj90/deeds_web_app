#!/usr/bin/env node
/**
 * temporal-append-agents-md.mjs
 *
 * Append timestamped activity logs to AGENTS.md / LLMS.md files across every
 * directory in the codebase. NEVER deletes, NEVER mutates existing content —
 * only appends new sections delimited by HTML comment fences so future runs
 * can locate (and not duplicate) prior entries.
 *
 * Sources of activity:
 *   - .tmp/ingest/gemma4-tasks.ndjson   (per-directory affected nodes)
 *   - .tmp/ingest/gemma4-fixes.ndjson   (per-directory fix proposals)
 *   - memory/exports/parent-atlas-redis-warmup.json (cache build timestamp)
 *   - memory/exports/all-lanes-parent-atlas-report.json (lane counts)
 *
 * Append envelope (idempotent — same RUN_ID skipped):
 *   <!-- atlas-append:RUN_ID:2026-05-30T07:50:00Z -->
 *   ## Atlas Activity — 2026-05-30T07:50:00Z
 *   - Parent atlas rebuild: 10,732 nodes (8 lanes)
 *   - 2 tasks targeting this directory (1 high, 1 medium)
 *   - Top cluster heat: som:0:0 (316 cards)
 *   <!-- /atlas-append:RUN_ID -->
 *
 * Usage:
 *   node scripts/atlas/temporal-append-agents-md.mjs --dry-run
 *   node scripts/atlas/temporal-append-agents-md.mjs --apply
 *   node scripts/atlas/temporal-append-agents-md.mjs --apply --files agents
 *   node scripts/atlas/temporal-append-agents-md.mjs --apply --files llms
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
const fileFlag = argv[argv.indexOf('--files') + 1];
const TARGET_FILES = ['agents', 'llms'].includes(fileFlag)
  ? [fileFlag === 'agents' ? 'AGENTS.md' : 'LLMS.md']
  : ['AGENTS.md', 'LLMS.md'];

// ─── Build the activity record ─────────────────────────────────────────

function loadJSON(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function loadNDJSON(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function buildActivityRecord() {
  const tasks = loadNDJSON(path.join(ROOT, '.tmp', 'ingest', 'gemma4-tasks.ndjson'));
  const fixes = loadNDJSON(path.join(ROOT, '.tmp', 'ingest', 'gemma4-fixes.ndjson'));
  const lanes = loadJSON(path.join(ROOT, 'memory', 'exports', 'all-lanes-parent-atlas-report.json'), {});
  const redis = loadJSON(path.join(ROOT, 'memory', 'exports', 'parent-atlas-redis-warmup.json'), {});
  const couch = loadJSON(path.join(ROOT, 'memory', 'exports', 'parent-atlas-couchdb-archive.json'), {});

  // Group tasks/fixes by directory derived from sourceRef
  const byDir = new Map();
  for (const t of tasks) {
    const ref = t.sourceRef || '';
    if (!ref) continue;
    const dir = path.dirname(ref).replace(/\\/g, '/');
    if (!byDir.has(dir)) byDir.set(dir, { tasks: [], fixes: [] });
    byDir.get(dir).tasks.push(t);
  }
  for (const f of fixes) {
    const ref = f.sourceRef || '';
    if (!ref) continue;
    const dir = path.dirname(ref).replace(/\\/g, '/');
    if (!byDir.has(dir)) byDir.set(dir, { tasks: [], fixes: [] });
    byDir.get(dir).fixes.push(f);
  }

  return {
    timestamp: new Date().toISOString(),
    parentAtlas: {
      totalNodes: lanes.totalNodes || 0,
      totalEdges: lanes.totalEdges || 0,
      lanes: Object.keys(lanes.lanes || {}).length,
    },
    redis: {
      cachedAt: redis.timestamp || null,
      ttlSeconds: redis.ttl_seconds || 0,
      nodes: redis.written?.nodes || 0,
    },
    couchdb: {
      archivedAt: couch.timestamp || null,
      totalArchived: couch.total_archived || 0,
    },
    tasksTotal: tasks.length,
    fixesTotal: fixes.length,
    byDir,
  };
}

// ─── Format a section for a single file ────────────────────────────────

function formatSection(record, dirRel, runId) {
  const dirActivity = record.byDir.get(dirRel) || { tasks: [], fixes: [] };
  const tasksHere = dirActivity.tasks;
  const fixesHere = dirActivity.fixes;

  const lines = [
    '',
    `<!-- atlas-append:${runId}:${record.timestamp} -->`,
    `## Atlas Activity — ${record.timestamp}`,
    '',
    `- **Parent atlas rebuild**: ${record.parentAtlas.totalNodes.toLocaleString()} nodes / ${record.parentAtlas.totalEdges.toLocaleString()} edges across ${record.parentAtlas.lanes} lanes`,
    `- **Redis cache**: ${record.redis.nodes.toLocaleString()} nodes warmed (${Math.round(record.redis.ttlSeconds / 3600)}h TTL)`,
    `- **CouchDB archive**: ${record.couchdb.totalArchived.toLocaleString()} docs durably persisted`,
  ];

  if (tasksHere.length > 0) {
    lines.push(`- **Tasks targeting this directory**: ${tasksHere.length}`);
    const byPri = tasksHere.reduce((acc, t) => { acc[t.priority || 'P3'] = (acc[t.priority || 'P3'] || 0) + 1; return acc; }, {});
    for (const [pri, n] of Object.entries(byPri).sort()) {
      lines.push(`  - ${pri}: ${n}`);
    }
    // Show first 3 task titles
    for (const t of tasksHere.slice(0, 3)) {
      lines.push(`  - \`${t.id}\` ${t.reason || t.suggested_action || t.title || ''}`);
    }
  }

  if (fixesHere.length > 0) {
    lines.push(`- **Fix proposals targeting this directory**: ${fixesHere.length} (operator review required — never auto-applied)`);
    for (const f of fixesHere.slice(0, 3)) {
      lines.push(`  - \`${f.id}\` ${f.diagnosis || ''}`);
    }
  }

  if (tasksHere.length === 0 && fixesHere.length === 0) {
    lines.push(`- **This directory**: no tasks or fixes in current run`);
  }

  lines.push('');
  lines.push(`<!-- /atlas-append:${runId} -->`);
  lines.push('');
  return lines.join('\n');
}

// ─── Walk and append ───────────────────────────────────────────────────

function findTargetFiles() {
  const found = [];
  const IGNORE = new Set(['node_modules', '.git', '.svelte-kit', 'dist', 'build', 'coverage', '.cache', 'tmp', '.tmp', 'target']);

  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (IGNORE.has(ent.name) || ent.name.startsWith('.')) continue;
        walk(path.join(dir, ent.name));
      } else if (TARGET_FILES.includes(ent.name)) {
        found.push(path.join(dir, ent.name));
      }
    }
  }
  walk(ROOT);
  return found;
}

function alreadyHasRun(filePath, runId) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.includes(`atlas-append:${runId}:`);
}

// ─── Main ──────────────────────────────────────────────────────────────

function main() {
  console.log('\n══ Temporal Append — AGENTS.md / LLMS.md ══════════════════');
  console.log(`  Mode:    ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Targets: ${TARGET_FILES.join(', ')}`);

  const record = buildActivityRecord();
  const runId = createHash('sha1').update(record.timestamp).digest('hex').slice(0, 12);

  console.log(`  Run ID:  ${runId}`);
  console.log(`  Atlas:   ${record.parentAtlas.totalNodes} nodes, ${record.parentAtlas.totalEdges} edges`);
  console.log(`  Tasks:   ${record.tasksTotal}`);
  console.log(`  Fixes:   ${record.fixesTotal}`);
  console.log(`  Dirs with activity: ${record.byDir.size}`);

  console.log('\n  Step 1: Find target files...');
  const targets = findTargetFiles();
  console.log(`  ✅ Found ${targets.length} files`);

  console.log('\n  Step 2: Append activity records...');
  let appended = 0;
  let skipped = 0;
  let failed = 0;

  for (const fp of targets) {
    try {
      if (alreadyHasRun(fp, runId)) {
        skipped++;
        if (VERBOSE) console.log(`    [skip dup] ${path.relative(ROOT, fp)}`);
        continue;
      }
      const dirRel = path.relative(ROOT, path.dirname(fp)).replace(/\\/g, '/');
      const section = formatSection(record, dirRel, runId);

      if (APPLY) {
        fs.appendFileSync(fp, section, 'utf8');
      }
      appended++;
      if (VERBOSE && appended <= 5) console.log(`    ✅ ${path.relative(ROOT, fp)}`);
    } catch (e) {
      failed++;
      if (VERBOSE) console.log(`    ❌ ${path.relative(ROOT, fp)}: ${e.message}`);
    }
  }

  // Report
  const report = {
    timestamp: record.timestamp,
    runId,
    mode: APPLY ? 'apply' : 'dry-run',
    targets: TARGET_FILES,
    counts: {
      filesFound: targets.length,
      appended,
      skipped,
      failed,
    },
    activity: {
      parentAtlasNodes: record.parentAtlas.totalNodes,
      parentAtlasEdges: record.parentAtlas.totalEdges,
      tasksTotal: record.tasksTotal,
      fixesTotal: record.fixesTotal,
      dirsWithActivity: record.byDir.size,
    },
  };

  if (APPLY) {
    const reportPath = path.join(ROOT, 'memory', 'exports', 'temporal-append-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\n  📝 Report → ${reportPath}`);
  }

  console.log('\n══ Summary ═══════════════════════════════════════════════');
  console.log(`  Files found:    ${targets.length}`);
  console.log(`  Appended:       ${appended} ${APPLY ? '' : '(preview)'}`);
  console.log(`  Skipped (dup):  ${skipped}`);
  console.log(`  Failed:         ${failed}`);
  console.log(`  Run ID:         ${runId}`);

  if (!APPLY) {
    console.log('\n  [DRY-RUN] No files modified. Use --apply to append.');
  }
}

main();
