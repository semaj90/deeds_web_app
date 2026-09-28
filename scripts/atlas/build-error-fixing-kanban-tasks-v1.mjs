#!/usr/bin/env node
/**
 * Bridges the read-only agentic-error-fixing plan
 * (docs/reports/agentic-error-fixing-v1.json, produced by
 * run-agentic-error-fixing-v1.mjs) onto the existing daily-graphify kanban
 * board (docs/reports/atlas/atlas-kanban-tasks.json), which is already the
 * canonical, wired board rendered at /admin/ai-dashboard
 * (loadDailyGraphifyBoard() in sveltekit-frontend/src/lib/server/atlas/board/
 * daily-graphify-board.ts). This does NOT create a new board, new column
 * type, or new UI surface — it only appends board-shaped task rows so
 * error-fixing candidates become visible inside the existing P0-P3 columns.
 *
 * This script never mutates source files, never resolves/claims tasks, never
 * calls llama-server, and never touches Postgres/Qdrant/Redis. It is a pure
 * read-JSON -> transform -> write-JSON bridge, re-runnable and idempotent
 * (re-running replaces only the rows this script previously wrote, tagged by
 * origin = 'agentic_error_fixing_v1').
 *
 * Usage:
 *   node scripts/atlas/run-agentic-error-fixing-v1.mjs --file some-diagnostics.txt
 *   node scripts/atlas/build-error-fixing-kanban-tasks-v1.mjs
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const ERROR_FIXING_ORIGIN = 'agentic_error_fixing_v1';
const inputPath = path.resolve(ROOT, getArg('--input', 'docs/reports/agentic-error-fixing-v1.json'));
const boardPath = path.resolve(ROOT, getArg('--board', 'docs/reports/atlas/atlas-kanban-tasks.json'));

const KIND_PRIORITY = {
  AUTHORIZATION: 'P0',
  LINEAGE_ADMISSION: 'P0',
  DATABASE_SCHEMA: 'P1',
  RETRIEVAL_OR_PROJECTION: 'P1',
  GRAPH_OR_GPU: 'P1',
  TYPECHECK_OR_SCHEMA: 'P2',
  TIMEOUT: 'P2',
  UNKNOWN: 'P3',
};

function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

const plan = readJson(inputPath);
if (!plan || plan.schema !== 'atlas.agentic-error-fixing.v1') {
  console.error(JSON.stringify({
    status: 'NO_PLAN',
    inputPath,
    reason: plan ? 'UNEXPECTED_SCHEMA' : 'FILE_MISSING_OR_UNPARSEABLE',
    hint: 'Run: node scripts/atlas/run-agentic-error-fixing-v1.mjs --file <diagnostics.txt>',
  }, null, 2));
  process.exit(plan ? 1 : 0);
}

const candidates = Array.isArray(plan.candidates) ? plan.candidates : [];

// NOTE: run-agentic-error-fixing-v1.mjs's persisted report deliberately drops
// the raw diagnostic line (it keeps only fingerprint/errorCode/kind/file/
// owner/proposedAction/status/mutationAllowed, for a stable/deterministic
// checksum) — so `proposedAction` + `errorCode` + `file` are the only text
// available downstream, not the original error text.
const mappedTasks = candidates.map((candidate) => ({
  id: `err-fix:${candidate.fingerprint}`,
  priority: KIND_PRIORITY[candidate.kind] ?? 'P3',
  label: `[${candidate.owner ?? 'Operator review'}] ${candidate.file ? `${candidate.file}: ` : ''}${candidate.proposedAction ?? candidate.kind}`.slice(0, 200),
  status: candidate.status ?? 'PROPOSED',
  origin: ERROR_FIXING_ORIGIN,
  source_ref: candidate.file ?? null,
  evidence_refs: [candidate.proposedAction].filter(Boolean),
  reason_codes: [candidate.kind, candidate.errorCode].filter(Boolean),
  blockedBy: [],
}));

const existingBoard = readJson(boardPath) ?? { generated: new Date().toISOString(), tasks: [] };
const existingTasks = Array.isArray(existingBoard.tasks) ? existingBoard.tasks : [];
const retainedTasks = existingTasks.filter((task) => task?.origin !== ERROR_FIXING_ORIGIN);

const nextBoard = {
  ...existingBoard,
  generated: new Date().toISOString(),
  tasks: [...retainedTasks, ...mappedTasks],
};

mkdirSync(path.dirname(boardPath), { recursive: true });
writeFileSync(boardPath, `${JSON.stringify(nextBoard, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  status: 'BOARD_UPDATED',
  boardPath,
  inputPath,
  planStatus: plan.status,
  candidateCount: candidates.length,
  tasksWritten: mappedTasks.length,
  tasksRetainedFromOtherOrigins: retainedTasks.length,
  totalTasksOnBoard: nextBoard.tasks.length,
  writesPerformed: true,
  canonicalAuthority: false,
  note: 'This writes only the JSON file already read by loadDailyGraphifyBoard(); no DB/Qdrant/Redis writes, no agent dispatch, no llama-server calls.',
}, null, 2));
