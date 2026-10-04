#!/usr/bin/env node
// RANK-OPEN-TASKS-01: deterministic, read-only advisory task ranking.
// --retrieval-result ranks exactly the selector output; raw-ledger mode is legacy compatibility.
//
//   node scripts/atlas/rank-open-tasks-v1.mjs --retrieval-result selected.json [--limit 10] [--offset 0]
//   node scripts/atlas/rank-open-tasks-v1.mjs [--in ledger.json] [--limit 10] [--offset 0] [legacy]
//        [--ordering-checksum sha256:..] [--include-waiting] [--include-write-gated]
//        [--diversify-by-change] [--max-age-hours N] [--cohort file | --cohort-from-corpus task-cards.json] [--json]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindCohortToLedgerV1, buildTaskCardCohortV1, locatorKey } from './lib/task-card-cohort-v1.mjs';

export const RANK_SCHEMA = 'atlas.open-task-ranking.v1';
export const TASK_CARD_RANK_SCHEMA = 'atlas.openspec-task-card-ranking.v1';
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
const taskCardCandidateChecksum = (cards) => sha256(JSON.stringify(cards));

/** Preserve the selector set; until revision-bound features exist, use only stable identity ordering. */
export function rankSelectedOpenSpecTaskCardsV1(retrievalResult) {
  if (retrievalResult?.schema !== 'atlas.openspec-task-retrieval-result.v1') throw new Error('TASK_CARD_RETRIEVAL_SCHEMA_UNSUPPORTED');
  if (typeof retrievalResult.workspaceHead !== 'string' || !retrievalResult.workspaceHead
    || typeof retrievalResult.taskPopulationRevision !== 'string' || !retrievalResult.taskPopulationRevision
    || !Array.isArray(retrievalResult.cards)) throw new Error('TASK_CARD_RETRIEVAL_BINDING_MISSING');
  if (retrievalResult.returnedCount !== retrievalResult.cards.length) throw new Error('TASK_CARD_RETRIEVAL_COUNT_MISMATCH');
  const candidateChecksum = taskCardCandidateChecksum(retrievalResult.cards);
  if (retrievalResult.candidateChecksum !== candidateChecksum) throw new Error('TASK_CARD_CANDIDATE_CHECKSUM_MISMATCH');

  const ranked = retrievalResult.cards.map((card) => {
    if (!card || typeof card.stableKey !== 'string' || !card.stableKey || typeof card.taskRevision !== 'string' || !card.taskRevision) {
      throw new Error('TASK_CARD_RANK_IDENTITY_MISSING');
    }
    return { card, stableKey: card.stableKey, taskRevision: card.taskRevision };
  });
  ranked.sort((left, right) => left.stableKey.localeCompare(right.stableKey)
    || left.taskRevision.localeCompare(right.taskRevision)
    || JSON.stringify(left.card).localeCompare(JSON.stringify(right.card)));
  const ordered = ranked.map((item, index) => ({
    rank: index + 1,
    stableKey: item.stableKey,
    taskRevision: item.taskRevision,
    score: {},
    taskCard: item.card,
    selected: false,
    canonicalAuthority: false,
  }));
  return {
    schema: TASK_CARD_RANK_SCHEMA,
    inputSchema: retrievalResult.schema,
    workspaceHead: retrievalResult.workspaceHead,
    taskPopulationRevision: retrievalResult.taskPopulationRevision,
    candidateChecksum,
    rankingMode: 'NEUTRAL_IDENTITY_ORDER',
    rankingFeatureBlocker: 'NO_REVISION_BOUND_TASKCARD_RANK_FEATURES',
    candidateCount: retrievalResult.cards.length,
    orderingChecksum: sha256(ordered.map((item) => `${item.stableKey}\0${item.taskRevision}`).join('\n')),
    ranked: ordered,
    canonicalAuthority: false,
    selected: false,
    writesPerformed: false,
  };
}

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

/** Legacy raw-ledger compatibility ranker. Prefer rankSelectedOpenSpecTaskCardsV1 for selected cards. */
export function rankOpenTasksLegacyV1(ledger, readLines, options = {}) {
  const { includeWaiting = false, includeWriteGated = false, diversifyByChange = false } = options;
  const inventory = Array.isArray(ledger.taskInventory) ? ledger.taskInventory : [];
  const funnel = { inventory: inventory.length };
  let pool = inventory.filter((t) => t.executionState === 'ACTIONABLE' || (includeWaiting && t.executionState === 'WAITING_ON_DEPENDENCY'));
  funnel.open = pool.length;
  // WB-TASKCARD-OWNER-01: when a frozen task-card cohort is supplied, LIFECYCLE admission comes from
  // it and the ranker does not redefine it. Execution gating (gate / controller / mutation class)
  // stays here because task cards do not carry those Workboard attributes.
  let cohortBinding = null;
  if (options.cohort) {
    cohortBinding = bindCohortToLedgerV1(options.cohort, ledger);
    const before = pool.length;
    pool = pool.filter((t) => cohortBinding.locatorKeys.has(locatorKey(t.source, t.line)));
    funnel.cohortAdmitted = pool.length;
    funnel.cohortExcluded = before - pool.length;
  }
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
    eligibilitySource: cohortBinding ? 'FROZEN_TASK_CARD_COHORT' : 'RAW_WORKBOARD_INVENTORY',
    cohort: cohortBinding
      ? { checksum: cohortBinding.cohortChecksum, workspaceRevision: cohortBinding.cohortWorkspaceRevision, staleFiles: cohortBinding.staleFiles, missingFiles: cohortBinding.missingFiles }
      : null,
    orderingChecksum: sha256(ranked.map((r) => r.stableKey).join('\n')),
    funnel,
    ranked,
    rejected,
    advisory: true,
    writesPerformed: false
  };
}

/** @deprecated Legacy raw-ledger compatibility alias; new task-card flows must use the selector result API. */
export const rankOpenTasks = rankOpenTasksLegacyV1;

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
    else if (k === '--retrieval-result') a.retrievalResultFile = argv[++i];
    else if (k === '--cohort') a.cohortFile = argv[++i];
    else if (k === '--cohort-from-corpus') a.cohortFromCorpus = argv[++i];
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
  if (args.retrievalResultFile) {
    const retrievalResult = JSON.parse(readFileSync(resolve(args.retrievalResultFile), 'utf8'));
    const result = rankSelectedOpenSpecTaskCardsV1(retrievalResult);
    const page = pageRanking(result, args);
    if (args.json) {
      console.log(JSON.stringify({ ...result, ranked: undefined, page }, null, 2));
      return;
    }
    console.error(`WARNING: advisory task-card ranker; ${result.candidateCount} selector candidates, no selection or writes.`);
    console.log(`candidates ${result.candidateCount} ordering ${result.orderingChecksum.slice(0, 20)}`);
    for (const item of page.items) console.log(`#${item.rank} ${item.stableKey}@${item.taskRevision}\n    ${String(item.taskCard.claim ?? '').replace(/\s+/g, ' ').slice(0, 230)}`);
    console.log(`showing ${page.items.length} of ${page.total}; next offset ${page.nextOffset ?? 'none'}`);
    return;
  }
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
  // A frozen cohort file is the contract; --cohort-from-corpus builds it with the reference exporter
  // (CURRENT cards in lifecycle state OPEN) for convenience and parity checks.
  if (args.cohortFile) args.cohort = JSON.parse(readFileSync(resolve(args.cohortFile), 'utf8'));
  else if (args.cohortFromCorpus) {
    const corpus = JSON.parse(readFileSync(resolve(args.cohortFromCorpus), 'utf8'));
    args.cohort = buildTaskCardCohortV1(corpus);
  }
  const result = rankOpenTasksLegacyV1(ledger, readLines, args);
  const page = pageRanking(result, args);
  if (args.json) {
    console.log(JSON.stringify({ ...result, ranked: undefined, rejected: result.rejected.length, page }, null, 2));
    return;
  }
  console.error(`WARNING: LEGACY raw-ledger compatibility ranker; advisory only. Ledger generated ${result.ledgerGeneratedAt} (${Number.isFinite(ageHours) ? ageHours.toFixed(0) : '?'} h old).`);
  console.log(`funnel ${JSON.stringify(result.funnel)} rejected ${result.rejected.length} ordering ${result.orderingChecksum.slice(0, 20)}`);
  for (const r of page.items) {
    console.log(`#${r.rank} P${r.score.priority} [${r.score.themes.join(',') || '-'}] ${r.changeId}:${r.line}${r.lineMoved ? ' (moved)' : ''} ${r.mutationClass}\n    ${r.text}`);
  }
  console.log(`showing ${page.items.length} of ${page.total}; next offset ${page.nextOffset ?? 'none'}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
