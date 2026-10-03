#!/usr/bin/env node
// RANK-OPEN-TASKS-01: deterministic, read-only ranking of open Workboard tasks.
// Advisory only: the score is a transparent heuristic, never proof, priority authority or a
// task-state change. Reads the ledger and current tasks.md files; writes nothing.
//
//   node scripts/atlas/rank-open-tasks-v1.mjs [--in ledger.json] [--limit 10] [--offset 0]
//        [--ordering-checksum sha256:..] [--include-waiting] [--include-write-gated]
//        [--diversify-by-change] [--max-age-hours N] [--json]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RANK_SCHEMA = 'atlas.open-task-ranking.v1';
const SAFE_MUTATION = new Set(['CODE_ONLY', 'READ_ONLY']);
const THEMES = {
  nlp: /\bnlp\b|langextract|taxonom|ontolog|classif/i,
  centroid: /centroid|kmeans|k-means|cluster/i,
  valkey: /valkey|redis|bitfrost|bifrost/i,
  workers: /worker|rabbitmq|queue|\bcpu\b/i,
  simdjson: /simdjson|ndjson|arrow|mmap/i,
  graph: /pagerank|cugraph|networkx|\bppr\b/i,
  knn: /\bknn\b|top-?k|pagination|paginat|ordinal|candidate|feature matrix|cuvs|ann\b/i
};
const UNCHECKED = /^\s*[-*]\s*\[ \]/;

const sha256 = (text) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

/** Re-resolve the task's current line: the recorded line if it still matches, else a unique text match. */
export function resolveCurrentLine(task, lines) {
  if (!lines) return null;
  const needle = String(task.text ?? '').slice(0, 40);
  if (!needle) return null;
  const at = (n) => {
    const line = lines[n - 1];
    return line !== undefined && UNCHECKED.test(line) && line.includes(needle);
  };
  if (at(task.line)) return { line: task.line, moved: false };
  const hits = [];
  lines.forEach((line, index) => {
    if (UNCHECKED.test(line) && line.includes(needle)) hits.push(index + 1);
  });
  return hits.length === 1 ? { line: hits[0], moved: true } : null;
}

/**
 * Pure ranking. `readLines(sourcePath)` returns the current lines of a tasks.md or null.
 * Returns { ranked, rejected, funnel, orderingChecksum, workboardRevision }.
 */
export function rankOpenTasks(ledger, readLines, options = {}) {
  const { includeWaiting = false, includeWriteGated = false, diversifyByChange = false } = options;
  const inventory = Array.isArray(ledger.taskInventory) ? ledger.taskInventory : [];
  const funnel = { inventory: inventory.length };
  let pool = inventory.filter((t) => t.executionState === 'ACTIONABLE' || (includeWaiting && t.executionState === 'WAITING_ON_DEPENDENCY'));
  funnel.open = pool.length;
  pool = pool.filter((t) => t.gateState === 'READY' && (t.controllerState === 'ACTIONABLE' || (includeWaiting && t.executionState === 'WAITING_ON_DEPENDENCY')));
  funnel.gateReady = pool.length;
  if (!includeWriteGated) pool = pool.filter((t) => SAFE_MUTATION.has(t.mutationClass));
  funnel.mutationAllowed = pool.length;

  const cache = new Map();
  const lines = (source) => {
    if (!cache.has(source)) cache.set(source, readLines(source) ?? null);
    return cache.get(source);
  };
  const rejected = [];
  const scored = [];
  for (const t of pool) {
    const resolved = resolveCurrentLine(t, lines(t.source));
    if (!resolved) {
      rejected.push({ stableKey: t.stableKey ?? t.taskKey, source: t.source, reason: 'NOT_UNCHECKED_OR_UNRESOLVABLE' });
      continue;
    }
    const themes = Object.entries(THEMES).filter(([, re]) => re.test(`${t.change} ${t.text}`)).map(([k]) => k);
    const priority = Number.isFinite(t.priority) ? t.priority : 99;
    scored.push({
      stableKey: t.stableKey ?? t.taskKey,
      logicalTaskKey: t.taskKey,
      changeId: t.change,
      source: t.source,
      line: resolved.line,
      lineMoved: resolved.moved,
      currentLineVerified: true,
      lane: t.lane ?? null,
      mutationClass: t.mutationClass,
      text: String(t.text ?? '').replace(/\s+/g, ' ').slice(0, 230),
      score: { priority, themes, themeScore: themes.length, total: (100 - priority) * 10 + themes.length }
    });
  }
  funnel.stillUnchecked = scored.length;
  const cmp = (a, b) => b.score.total - a.score.total || a.stableKey.localeCompare(b.stableKey);
  scored.sort(cmp);

  let ordered = scored;
  if (diversifyByChange) {
    const byChange = new Map();
    for (const s of scored) byChange.set(s.changeId, [...(byChange.get(s.changeId) ?? []), s]);
    ordered = [];
    for (let round = 0; ordered.length < scored.length; round += 1) {
      const layer = [...byChange.values()].map((c) => c[round]).filter(Boolean).sort(cmp);
      if (!layer.length) break;
      ordered.push(...layer);
    }
  }
  const ranked = ordered.map((s, i) => ({ rank: i + 1, ...s }));
  return {
    schema: RANK_SCHEMA,
    workboardRevision: sha256(`${ledger.generatedAt ?? ''}|${inventory.length}|${JSON.stringify(ledger.sourceFileHashes ?? {})}`),
    ledgerGeneratedAt: ledger.generatedAt ?? null,
    options: { includeWaiting, includeWriteGated, diversifyByChange },
    orderingChecksum: sha256(ranked.map((r) => r.stableKey).join('\n')),
    funnel,
    ranked,
    rejected,
    advisory: true,
    writesPerformed: false
  };
}

/** Page without drift: offset is valid only against the ordering it was issued for. */
export function pageRanking(result, { offset = 0, limit = 10, orderingChecksum } = {}) {
  if (orderingChecksum && orderingChecksum !== result.orderingChecksum) {
    throw new Error('ORDERING_CHANGED: cursor was issued for a different ordering; restart from offset 0');
  }
  const items = result.ranked.slice(offset, offset + limit);
  const next = offset + items.length;
  return {
    items,
    offset,
    limit,
    total: result.ranked.length,
    nextOffset: next < result.ranked.length ? next : null,
    orderingChecksum: result.orderingChecksum
  };
}

function parseArgs(argv) {
  const a = { in: 'docs/reports/openspec-workboard-v1.json', limit: 10, offset: 0, json: false, includeWaiting: false, includeWriteGated: false, diversifyByChange: false, maxAgeHours: null, orderingChecksum: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    if (k === '--in') a.in = argv[++i];
    else if (k === '--limit') a.limit = Number(argv[++i]);
    else if (k === '--offset') a.offset = Number(argv[++i]);
    else if (k === '--ordering-checksum') a.orderingChecksum = argv[++i];
    else if (k === '--max-age-hours') a.maxAgeHours = Number(argv[++i]);
    else if (k === '--include-waiting') a.includeWaiting = true;
    else if (k === '--include-write-gated') a.includeWriteGated = true;
    else if (k === '--diversify-by-change') a.diversifyByChange = true;
    else if (k === '--json') a.json = true;
    else throw new Error(`unknown argument ${k}`);
  }
  if (!Number.isInteger(a.limit) || a.limit < 1 || a.limit > 200) throw new Error('--limit must be 1..200');
  if (!Number.isInteger(a.offset) || a.offset < 0) throw new Error('--offset must be >= 0');
  return a;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const ledger = JSON.parse(readFileSync(resolve(args.in), 'utf8'));
  const ageHours = ledger.generatedAt ? (Date.now() - Date.parse(ledger.generatedAt)) / 3_600_000 : Infinity;
  if (args.maxAgeHours !== null && !(ageHours <= args.maxAgeHours)) {
    console.error(`STALE_WORKBOARD: ledger is ${Number.isFinite(ageHours) ? ageHours.toFixed(1) : 'of unknown'} h old (max ${args.maxAgeHours}); regenerate first.`);
    process.exit(2);
  }
  const readLines = (source) => {
    try {
      return readFileSync(resolve(source), 'utf8').split(/\r?\n/);
    } catch {
      return null;
    }
  };
  const result = rankOpenTasks(ledger, readLines, args);
  const page = pageRanking(result, args);
  if (args.json) {
    console.log(JSON.stringify({ ...result, ranked: undefined, rejected: result.rejected.length, page }, null, 2));
    return;
  }
  console.error(`WARNING: advisory heuristic; ledger generated ${result.ledgerGeneratedAt} (${Number.isFinite(ageHours) ? ageHours.toFixed(0) : '?'} h old).`);
  console.log(`funnel ${JSON.stringify(result.funnel)} rejected ${result.rejected.length} ordering ${result.orderingChecksum.slice(0, 20)}`);
  for (const r of page.items) {
    console.log(`#${r.rank} P${r.score.priority} [${r.score.themes.join(',') || '-'}] ${r.changeId}:${r.line}${r.lineMoved ? ' (moved)' : ''} ${r.mutationClass}\n    ${r.text}`);
  }
  console.log(`showing ${page.items.length} of ${page.total}; next offset ${page.nextOffset ?? 'none'}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
