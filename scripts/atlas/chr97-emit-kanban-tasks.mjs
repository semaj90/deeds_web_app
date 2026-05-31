#!/usr/bin/env node
/**
 * chr97-emit-kanban-tasks.mjs
 *
 * Convert CHR97 eval + GRPO export reports into kanban tasks matching the
 * docs/graph/kanban-board.json schema so opencode can pick them up.
 *
 * Task generation policy:
 *   - DONE      : K-sweep complete (k=12,20,24 verified)
 *   - IN_PROGRESS: best-K rerun (highest spread) — auto when sprite count > 100
 *   - REVIEW    : strong (lane, cluster) pairs with winRate >= 0.85 — flag as
 *                 training-ready
 *   - BACKLOG   : weak (lane, cluster) pairs with winRate <= 0.45 — flag as
 *                 "discard from training dataset" tasks
 *
 * Each task carries:
 *   - taskId, featureKey, title, description
 *   - chr97_meta: { winRate, wins, total, cluster, lane }
 *   - linkedReports: ['chr97-eval-report.json', 'chr97-k-sweep-report.json']
 *
 * Output:
 *   .tmp/chr97-kanban-board.json    — merged into docs/graph/kanban-board.json
 *   .tmp/chr97-kanban-tasks.jsonl   — one task per line for streaming consumers
 *   memory/exports/chr97-kanban-emit-report.json
 *
 * Usage:
 *   node scripts/atlas/chr97-emit-kanban-tasks.mjs --apply
 *   node scripts/atlas/chr97-emit-kanban-tasks.mjs --apply --merge
 *     (also merges into docs/graph/kanban-board.json)
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const MERGE = argv.includes('--merge');

const EVAL_REPORT = path.join(ROOT, 'memory', 'exports', 'chr97-eval-report.json');
const SWEEP_REPORT = path.join(ROOT, 'memory', 'exports', 'chr97-k-sweep-report.json');
const GRPO_REPORT = path.join(ROOT, 'memory', 'exports', 'chr97-grpo-export-report.json');
const KANBAN_OUT = path.join(ROOT, '.tmp', 'chr97-kanban-board.json');
const KANBAN_NDJSON = path.join(ROOT, '.tmp', 'chr97-kanban-tasks.jsonl');
const MERGE_TARGET = path.join(ROOT, 'docs', 'graph', 'kanban-board.json');
const EMIT_REPORT = path.join(ROOT, 'memory', 'exports', 'chr97-kanban-emit-report.json');

function loadJSON(p, fallback = null) {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function taskId(prefix, payload) {
  const h = createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 8).toUpperCase();
  return `${prefix}-${h}`;
}

function makeTask({ status, priority, lane, cluster, winRate, wins, total, advantageAvg, extraDescription }) {
  const id = taskId('CHR97', { lane, cluster, status, winRate });
  return {
    taskId: id,
    featureKey: `chr97.${lane}.c${cluster}`,
    title: `CHR97 ${lane}|c${cluster} — ${(winRate * 100).toFixed(1)}% win`,
    description: extraDescription
      || `(${wins}/${total}) self-play wins; mean advantage ${advantageAvg?.toFixed(3) || 'n/a'}.`,
    kanbanStatus: status,
    priority,
    status: 'eval-derived',
    fileCount: 0,
    topFile: '',
    dbTables: [],
    cacheKeys: [`ace:engram:lesson:glyph_tile_*`, `ace:packet:*`],
    mcpTools: [],
    routeTypes: [],
    hasLlmCall: false,
    files: [],
    chr97_meta: {
      lane,
      cluster,
      winRate: parseFloat(winRate.toFixed(4)),
      wins,
      total,
    },
    linkedReports: [
      'memory/exports/chr97-eval-report.json',
      'memory/exports/chr97-k-sweep-report.json',
      'memory/exports/chr97-grpo-export-report.json',
    ],
    createdAt: new Date().toISOString(),
  };
}

async function main() {
  console.log('\n══ CHR97 → Kanban Tasks ══════════════════════════════════');
  console.log(`  Mode:  ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Merge: ${MERGE ? 'yes' : 'no'}`);

  const evalRep = loadJSON(EVAL_REPORT);
  const sweepRep = loadJSON(SWEEP_REPORT);
  const grpoRep = loadJSON(GRPO_REPORT);

  if (!evalRep) {
    console.error(`  ❌ Missing ${EVAL_REPORT} — run chr97-sprite-eval.mjs --apply`);
    process.exit(1);
  }

  console.log(`  ✅ Eval report: ${evalRep.eval?.totalBouts} bouts, ${evalRep.eval?.uniqueGroups} groups`);
  if (sweepRep) console.log(`  ✅ Sweep report: ${sweepRep.results?.length} K values tested`);
  if (grpoRep) console.log(`  ✅ GRPO report: ${grpoRep.filter?.validPairs} pairs exported`);

  const tasks = [];

  // 1. Top winners → REVIEW (training-ready candidates)
  for (const w of evalRep.topWinners || []) {
    if (w.winRate >= 0.85) {
      tasks.push(makeTask({
        status: 'REVIEW',
        priority: 'HIGH',
        lane: w.lane,
        cluster: w.cluster,
        winRate: w.winRate,
        wins: w.wins,
        total: w.total,
        extraDescription: `Training-ready: ${(w.winRate * 100).toFixed(1)}% win rate over ${w.total} bouts. Include in next Unsloth GRPO run.`,
      }));
    }
  }

  // 2. Bottom losers → BACKLOG (discard candidates)
  for (const l of evalRep.bottomLosers || []) {
    if (l.winRate <= 0.45) {
      tasks.push(makeTask({
        status: 'BACKLOG',
        priority: 'LOW',
        lane: l.lane,
        cluster: l.cluster,
        winRate: l.winRate,
        wins: l.wins,
        total: l.total,
        extraDescription: `Discard candidate: ${(l.winRate * 100).toFixed(1)}% win rate. Exclude from training dataset or investigate why cluster underperforms.`,
      }));
    }
  }

  // 3. K-sweep finding → DONE (verified milestone)
  if (sweepRep?.recommendation) {
    tasks.push({
      taskId: taskId('CHR97-SWEEP', { ks: sweepRep.params?.kValues }),
      featureKey: 'chr97.k-sweep',
      title: `CHR97 K-sweep verified: ${sweepRep.recommendation.split('—')[0].trim()}`,
      description: sweepRep.recommendation,
      kanbanStatus: 'DONE',
      priority: 'MEDIUM',
      status: 'milestone',
      fileCount: 0,
      topFile: '',
      dbTables: [],
      cacheKeys: [],
      mcpTools: [],
      routeTypes: [],
      hasLlmCall: false,
      files: [],
      chr97_meta: {
        kValuesTested: sweepRep.params?.kValues,
        rankedBySpread: sweepRep.rankedBySpread,
      },
      linkedReports: ['memory/exports/chr97-k-sweep-report.json'],
      createdAt: new Date().toISOString(),
    });
  }

  // 4. GRPO export → IN_PROGRESS (training input ready)
  if (grpoRep?.filter?.validPairs > 0) {
    tasks.push({
      taskId: taskId('CHR97-GRPO', { pairs: grpoRep.filter.validPairs }),
      featureKey: 'chr97.grpo-export',
      title: `Unsloth GRPO dataset ready: ${grpoRep.filter.validPairs} pairs`,
      description: `Pairs exported to training-datasets/chr97-grpo-pairs-latest.jsonl. Lane mix: ${Object.entries(grpoRep.distribution?.byLane || {}).map(([k, v]) => `${k}=${v}`).join(', ')}. Avg advantage ${grpoRep.advantageStats?.avg?.toFixed(3) || 'n/a'}.`,
      kanbanStatus: 'IN_PROGRESS',
      priority: 'HIGH',
      status: 'training-input',
      fileCount: 1,
      topFile: 'training-datasets/chr97-grpo-pairs-latest.jsonl',
      dbTables: [],
      cacheKeys: [],
      mcpTools: [],
      routeTypes: [],
      hasLlmCall: false,
      files: ['training-datasets/chr97-grpo-pairs-latest.jsonl'],
      chr97_meta: {
        pairCount: grpoRep.filter.validPairs,
        advantageStats: grpoRep.advantageStats,
        distribution: grpoRep.distribution,
      },
      linkedReports: ['memory/exports/chr97-grpo-export-report.json'],
      createdAt: new Date().toISOString(),
    });
  }

  // Group into columns
  const columns = { BACKLOG: { label: 'BACKLOG', tasks: [] }, IN_PROGRESS: { label: 'IN_PROGRESS', tasks: [] }, REVIEW: { label: 'REVIEW', tasks: [] }, DONE: { label: 'DONE', tasks: [] } };
  for (const t of tasks) {
    const col = columns[t.kanbanStatus] || columns.BACKLOG;
    col.tasks.push(t);
  }

  const board = {
    generatedAt: new Date().toISOString(),
    source: 'chr97-emit-kanban-tasks',
    totalTasks: tasks.length,
    columns,
  };

  if (APPLY) {
    fs.mkdirSync(path.dirname(KANBAN_OUT), { recursive: true });
    fs.writeFileSync(KANBAN_OUT, JSON.stringify(board, null, 2), 'utf8');
    fs.writeFileSync(KANBAN_NDJSON, tasks.map((t) => JSON.stringify(t)).join('\n') + '\n', 'utf8');
    console.log(`  ✅ Board   → ${KANBAN_OUT}`);
    console.log(`  ✅ Tasks   → ${KANBAN_NDJSON}`);

    if (MERGE && fs.existsSync(MERGE_TARGET)) {
      const existing = JSON.parse(fs.readFileSync(MERGE_TARGET, 'utf8'));
      const existingIds = new Set();
      for (const col of Object.values(existing.columns || {})) {
        for (const t of col.tasks || []) existingIds.add(t.taskId);
      }
      let added = 0;
      for (const t of tasks) {
        if (existingIds.has(t.taskId)) continue;
        const col = existing.columns[t.kanbanStatus] || (existing.columns[t.kanbanStatus] = { label: t.kanbanStatus, tasks: [] });
        col.tasks.push(t);
        added++;
      }
      existing.totalTasks = (existing.totalTasks || 0) + added;
      existing.generatedAt = new Date().toISOString();
      existing.lastChr97Merge = { addedTasks: added, mergedAt: new Date().toISOString() };
      fs.writeFileSync(MERGE_TARGET, JSON.stringify(existing, null, 2), 'utf8');
      console.log(`  ✅ Merged ${added} new tasks into ${MERGE_TARGET}`);
    }

    fs.mkdirSync(path.dirname(EMIT_REPORT), { recursive: true });
    fs.writeFileSync(EMIT_REPORT, JSON.stringify({
      timestamp: new Date().toISOString(),
      tasksGenerated: tasks.length,
      byStatus: Object.fromEntries(Object.entries(columns).map(([k, v]) => [k, v.tasks.length])),
      board: KANBAN_OUT,
      ndjson: KANBAN_NDJSON,
      mergedIntoDocs: MERGE,
    }, null, 2), 'utf8');
    console.log(`  📝 Report  → ${EMIT_REPORT}`);
  }

  console.log('\n══ Summary ═══════════════════════════════════════════════');
  for (const [col, c] of Object.entries(columns)) {
    console.log(`  ${col.padEnd(12)} ${c.tasks.length} tasks`);
  }
  console.log(`  Total:       ${tasks.length}`);
  if (!APPLY) console.log('\n  [DRY-RUN] Use --apply to write.');
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});