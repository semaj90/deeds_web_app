#!/usr/bin/env node
/**
 * ingest-codebase-tasker.mjs
 *
 * Stage 2 of the unified codebase pipeline.
 * Reads .tmp/codebase-feature-map.json and generates Kanban-ready task cards
 * for each feature area using a Gemma4 local LLM for semantic enrichment.
 *
 * Kanban columns:
 *   BACKLOG      — candidate/stub areas with no active implementation
 *   TODO         — partial areas needing work
 *   IN_PROGRESS  — areas actively being built (recent git changes)
 *   DONE         — implemented areas with full coverage
 *   BLOCKED      — areas with unresolved errors or missing deps
 *
 * Usage:
 *   node scripts/atlas/ingest-codebase-tasker.mjs
 *   node scripts/atlas/ingest-codebase-tasker.mjs --dry-run
 *   node scripts/atlas/ingest-codebase-tasker.mjs --no-llm        # skip Gemma4
 *   node scripts/atlas/ingest-codebase-tasker.mjs --limit 20      # top N features
 *   node scripts/atlas/ingest-codebase-tasker.mjs --feature ace   # single feature
 *
 * Outputs:
 *   .tmp/kanban-tasks.jsonl        — one JSON task card per line
 *   .tmp/kanban-board.json         — full board (columns → cards)
 *   docs/graph/kanban-board.json   — committed snapshot
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadConfig, resolveRepoPath, readJson, writeJson, writeMarkdown, REPO_ROOT } from './_atlas-utils.mjs';

const __dir  = path.dirname(fileURLToPath(import.meta.url));
const argv   = process.argv.slice(2);
const DRY_RUN   = argv.includes('--dry-run');
const NO_LLM    = argv.includes('--no-llm');
const VERBOSE   = argv.includes('--verbose');
const LIMIT_I   = argv.indexOf('--limit');
const LIMIT     = LIMIT_I >= 0 ? Number(argv[LIMIT_I + 1]) : null;
const FEATURE_I = argv.indexOf('--feature');
const FEATURE   = FEATURE_I >= 0 ? argv[FEATURE_I + 1] : null;

const config = loadConfig();

// ── LLM config ────────────────────────────────────────────────────────────────
const TURBO_BASE  = process.env.TURBOQUANT_BASE_URL ?? 'http://127.0.0.1:8090';
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL     ?? 'http://127.0.0.1:11434';
// Resolved at runtime via /v1/models — falls back to the first listed model
const TURBO_MODEL  = process.env.TURBO_MODEL  ?? 'gemma4-legal.gguf';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4-rotorquant:latest';
const TIMEOUT_MS  = 45_000;

async function callGemma4(prompt) {
  const endpoints = [
    {
      url:  `${TURBO_BASE}/v1/chat/completions`,
      body: { model: TURBO_MODEL, messages: [{ role: 'user', content: prompt }], stream: false, max_tokens: 512 },
      extract: (d) => d.choices?.[0]?.message?.content ?? '',
    },
    {
      url:  `${OLLAMA_BASE}/api/generate`,
      body: { model: OLLAMA_MODEL, prompt, stream: false, options: { temperature: 0.2, num_predict: 512 } },
      extract: (d) => d.response ?? '',
    },
  ];
  for (const { url, body, extract } of endpoints) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) {
        if (VERBOSE) console.warn(`  [llm] ${url} → HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      // Guard: server may return {error:...} with HTTP 200
      if (data.error) { if (VERBOSE) console.warn(`  [llm] ${url} error:`, data.error); continue; }
      const text = extract(data);
      if (text.trim()) return text.trim();
    } catch (e) { if (VERBOSE) console.warn(`  [llm] ${url} threw:`, e.message); }
  }
  return null;
}

// ── Kanban status mapping ──────────────────────────────────────────────────────

function mapStatusToKanban(status, fa) {
  if (status === 'implemented' && fa.fileCount > 10) return 'DONE';
  if (status === 'implemented') return 'IN_PROGRESS';
  if (status === 'partial') return 'TODO';
  if (status === 'stub') return 'BACKLOG';
  return 'BACKLOG';
}

function computePriority(fa) {
  // High priority: has DB tables + routes but errors or incomplete
  if (fa.dbTables?.length > 0 && fa.routeTypes?.length > 0 && fa.status !== 'implemented') return 'HIGH';
  // Medium: has MCP tools or LLM integration
  if (fa.mcpTools?.length > 0 || fa.hasLlmCall) return 'MEDIUM';
  // High: many files but still stub
  if (fa.fileCount > 20 && fa.status !== 'implemented') return 'HIGH';
  return 'LOW';
}

// ── Task card builder ─────────────────────────────────────────────────────────

async function buildTaskCard(featureKey, fa, index) {
  const taskId = `TASK-${crypto.createHash('sha256').update(featureKey).digest('hex').slice(0, 8).toUpperCase()}`;
  const kanbanStatus = mapStatusToKanban(fa.status, fa);
  const priority = computePriority(fa);

  // Build context for Gemma4
  let gemma4Summary = null;
  if (!NO_LLM) {
    const prompt = `You are a senior software architect reviewing a codebase feature area.

Feature: ${featureKey}
Files: ${fa.fileCount} files (${fa.totalLines?.toLocaleString() ?? '?'} total lines)
Status: ${fa.status}
DB tables used: ${fa.dbTables?.join(', ') || 'none'}
Cache keys: ${fa.cacheKeys?.slice(0, 5).join(', ') || 'none'}
MCP tools: ${fa.mcpTools?.join(', ') || 'none'}
Route types: ${fa.routeTypes?.join(', ') || 'none'}
Top file: ${fa.topScoreFile || 'unknown'}

Write a 1-2 sentence Kanban task description (what needs to be done or verified for this feature area to be production-ready). 
Focus on actionable next steps. Be specific and technical. No bullet points.`;

    gemma4Summary = await callGemma4(prompt);
    if (VERBOSE && gemma4Summary) console.log(`  [${featureKey}] Gemma4: ${gemma4Summary.slice(0, 80)}...`);
  }

  // Fallback description
  const fallbackDesc = (() => {
    const parts = [];
    if (fa.status === 'implemented') parts.push(`Verify ${featureKey} is fully tested and monitored.`);
    else if (fa.status === 'partial') parts.push(`Complete ${featureKey} implementation — ${fa.fileCount} files started.`);
    else parts.push(`Scaffold ${featureKey} — currently ${fa.fileCount} candidate files.`);
    if (fa.dbTables?.length) parts.push(`DB: ${fa.dbTables.slice(0, 3).join(', ')}.`);
    if (fa.mcpTools?.length) parts.push(`MCP: ${fa.mcpTools.slice(0, 2).join(', ')}.`);
    return parts.join(' ');
  })();

  return {
    taskId,
    featureKey,
    title: featureKey.replace(/\./g, ' › ').replace(/_/g, ' '),
    description: gemma4Summary ?? fallbackDesc,
    kanbanStatus,
    priority,
    status: fa.status,
    fileCount: fa.fileCount,
    topFile: fa.topScoreFile ?? '',
    dbTables: fa.dbTables ?? [],
    cacheKeys: (fa.cacheKeys ?? []).slice(0, 5),
    mcpTools: fa.mcpTools ?? [],
    routeTypes: fa.routeTypes ?? [],
    hasLlmCall: fa.hasLlmCall ?? false,
    files: (fa.files ?? []).slice(0, 10),
    sourceRefs: (fa.files ?? []).slice(0, 3).map(f => `local:${f}#L1`),
    generatedAt: new Date().toISOString(),
    usedLlm: !!gemma4Summary,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const FEATURE_MAP_PATH = resolveRepoPath('.tmp/codebase-feature-map.json');
if (!fs.existsSync(FEATURE_MAP_PATH)) {
  console.error(`[tasker] Missing feature map: ${FEATURE_MAP_PATH}`);
  console.error(`[tasker] Run first: node scripts/atlas/build-codebase-feature-map.mjs`);
  process.exit(1);
}

const featureMapData = readJson(FEATURE_MAP_PATH);
let features = Object.entries(featureMapData.features ?? {});

// Filter by --feature arg
if (FEATURE) {
  features = features.filter(([key]) => key.includes(FEATURE));
  console.log(`[tasker] Filtered to ${features.length} features matching "${FEATURE}"`);
}

// Sort by priority heuristic (status + file count)
features.sort(([, a], [, b]) => {
  const statusOrder = { partial: 0, stub: 1, candidate: 2, implemented: 3 };
  const sa = statusOrder[a.status] ?? 99;
  const sb = statusOrder[b.status] ?? 99;
  if (sa !== sb) return sa - sb;
  return b.fileCount - a.fileCount;
});

if (LIMIT) features = features.slice(0, LIMIT);

console.log(`[tasker] Building ${features.length} task cards (dry=${DRY_RUN} llm=${!NO_LLM})`);

const tasks = [];
for (let i = 0; i < features.length; i++) {
  const [key, fa] = features[i];
  process.stdout.write(`\r[tasker] ${i + 1}/${features.length} ${key.padEnd(40)}`);
  const card = await buildTaskCard(key, fa, i);
  tasks.push(card);
}
console.log();

// ── Board structure ───────────────────────────────────────────────────────────

const COLUMNS = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'];
const board = {
  generatedAt: new Date().toISOString(),
  repoName: config.repoName,
  totalTasks: tasks.length,
  usedLlm: !NO_LLM,
  columns: Object.fromEntries(COLUMNS.map(col => [col, {
    label: col.replace(/_/g, ' '),
    tasks: tasks.filter(t => t.kanbanStatus === col),
  }])),
};

// ── Kanban markdown board ─────────────────────────────────────────────────────

function buildBoardMarkdown(board) {
  const lines = [
    `# Codebase Kanban Board`,
    ``,
    `Generated: ${board.generatedAt}  |  Tasks: ${board.totalTasks}  |  LLM: ${board.usedLlm ? 'Gemma4' : 'none'}`,
    ``,
  ];
  for (const [col, { label, tasks }] of Object.entries(board.columns)) {
    lines.push(`## ${label} (${tasks.length})`);
    lines.push('');
    for (const t of tasks) {
      lines.push(`### [${t.taskId}] ${t.title}`);
      lines.push(`> ${t.description}`);
      lines.push(`- **Priority**: ${t.priority}  |  **Files**: ${t.fileCount}  |  **Status**: ${t.status}`);
      if (t.dbTables.length) lines.push(`- DB: ${t.dbTables.join(', ')}`);
      if (t.mcpTools.length) lines.push(`- MCP: ${t.mcpTools.join(', ')}`);
      if (t.routeTypes.length) lines.push(`- Routes: ${t.routeTypes.join(', ')}`);
      lines.push(`- Top file: \`${t.topFile}\``);
      lines.push('');
    }
  }
  return lines.join('\n');
}

// ── Write outputs ─────────────────────────────────────────────────────────────

const OUT_JSONL  = resolveRepoPath('.tmp/kanban-tasks.jsonl');
const OUT_BOARD  = resolveRepoPath('.tmp/kanban-board.json');
const OUT_MD     = resolveRepoPath('.tmp/kanban-board.md');
const DOCS_BOARD = resolveRepoPath('docs/graph/kanban-board.json');

if (DRY_RUN) {
  console.log(`\n[tasker] DRY RUN — would write:`);
  console.log(`  ${OUT_JSONL}  (${tasks.length} tasks)`);
  console.log(`  ${OUT_BOARD}`);
  console.log(`  ${OUT_MD}`);
  console.log(`  ${DOCS_BOARD}`);
  console.log(`\nBoard summary:`);
  for (const [col, { tasks: ct }] of Object.entries(board.columns)) {
    console.log(`  ${col}: ${ct.length} tasks`);
  }
} else {
  fs.mkdirSync(path.dirname(OUT_JSONL), { recursive: true });
  fs.writeFileSync(OUT_JSONL, tasks.map(t => JSON.stringify(t)).join('\n') + '\n', 'utf8');
  writeJson(OUT_BOARD, board);
  writeMarkdown(OUT_MD, buildBoardMarkdown(board));
  writeJson(DOCS_BOARD, board);
  console.log(`[tasker] Written → ${OUT_JSONL}`);
  console.log(`[tasker] Written → ${OUT_BOARD}`);
  console.log(`[tasker] Written → ${OUT_MD}`);
  console.log(`[tasker] Written → ${DOCS_BOARD}`);
}

console.log(`\n[tasker] Board summary:`);
for (const [col, { tasks: ct }] of Object.entries(board.columns)) {
  const highs = ct.filter(t => t.priority === 'HIGH').length;
  console.log(`  ${col.padEnd(14)}: ${ct.length} tasks (${highs} HIGH priority)`);
}
