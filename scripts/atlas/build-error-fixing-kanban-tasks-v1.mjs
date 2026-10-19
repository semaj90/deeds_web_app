#!/usr/bin/env node
/**
 * Bridges the read-only agentic-error-fixing plan
 * (docs/reports/agentic-error-fixing-v1.json, produced by
 * run-agentic-error-fixing-v1.mjs) onto the existing daily-graphify kanban
 * board (docs/reports/atlas/atlas-kanban-tasks.json), which is already the
 * diagnostic, wired board rendered at /admin/ai-dashboard
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
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const ERROR_FIXING_ORIGIN = 'agentic_error_fixing_v1';
const inputPath = path.resolve(ROOT, getArg('--input', 'docs/reports/agentic-error-fixing-v1.json'));
const boardPath = path.resolve(ROOT, getArg('--board', 'docs/reports/atlas/atlas-kanban-tasks.json'));
const mergeTasks = args.includes('--merge');
const dryRun = args.includes('--dry-run');
const receiptPath = getArg('--receipt', null);
const receiptTarget = receiptPath ? path.resolve(ROOT, receiptPath) : null;
if (inputPath === boardPath || (receiptTarget && [inputPath, boardPath].includes(receiptTarget))) {
  throw new Error('DIAGNOSTIC_ARTIFACT_PATH_COLLISION');
}
if (receiptTarget && existsSync(receiptTarget)) throw new Error('RECEIPT_ALREADY_EXISTS');

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
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

const CandidateSchema = z.object({
  fingerprint: z.string().regex(/^sha256:[a-f0-9]{16}$/),
  kind: z.enum(Object.keys(KIND_PRIORITY)),
  gateId: z.string().regex(/^[A-Z][A-Z0-9_]*$/).nullable().optional(),
  errorCode: z.string().nullable().optional(),
  owner: z.string().min(1).max(200),
  diagnostic: z.string().min(1).max(1000),
  proposedAction: z.string().min(1).max(1000),
  file: z.string().min(1).max(1000).nullable().optional(),
  status: z.literal('PROPOSED'),
  mutationAllowed: z.literal(false),
}).passthrough();

const PlanSchema = z.object({
  schema: z.literal('atlas.agentic-error-fixing.v1'),
  mode: z.literal('READ_ONLY_PROPOSAL'),
  status: z.enum(['PLAN_READY', 'VALIDATION_FAILED', 'NO_DIAGNOSTICS']),
  mutationAllowed: z.literal(false),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  candidates: z.array(CandidateSchema).max(1000),
}).passthrough();

const plan = readJson(inputPath);
if (!plan || plan.schema !== 'atlas.agentic-error-fixing.v1') {
  console.error(JSON.stringify({
    status: 'NO_PLAN',
    inputPath,
    reason: plan ? 'UNEXPECTED_SCHEMA' : 'FILE_MISSING_OR_UNPARSEABLE',
    hint: 'Run: node scripts/atlas/run-agentic-error-fixing-v1.mjs --file <diagnostics.txt>',
  }, null, 2));
  process.exit(1);
}

const candidates = Array.isArray(plan.candidates) ? plan.candidates : [];
PlanSchema.parse(plan);
if (new Set(candidates.map((candidate) => candidate.fingerprint)).size !== candidates.length) {
  throw new Error('DUPLICATE_DIAGNOSTIC_FINGERPRINT');
}
const planFileChecksum = `sha256:${createHash('sha256').update(readFileSync(inputPath)).digest('hex')}`;

const mappedTasks = candidates.map((candidate) => ({
  id: `err-fix:${candidate.fingerprint}`,
  priority: KIND_PRIORITY[candidate.kind] ?? 'P3',
  label: `[${candidate.owner ?? 'Operator review'}] ${candidate.file ? `${candidate.file}: ` : ''}${candidate.proposedAction ?? candidate.kind}`.slice(0, 200),
  status: 'PROPOSED',
  mutationAllowed: false,
  canonicalAuthority: false,
  dispatchable: false,
  diagnostic_plan_checksum: planFileChecksum,
  origin: ERROR_FIXING_ORIGIN,
  source_ref: candidate.file ?? null,
  evidence_refs: [candidate.diagnostic, candidate.proposedAction].filter(Boolean),
  reason_codes: [candidate.kind, candidate.gateId, candidate.errorCode].filter(Boolean),
  blockedBy: [],
}));

const boardBefore = existsSync(boardPath) ? readFileSync(boardPath, 'utf8') : null;
const existingBoard = boardBefore === null ? { generated: new Date().toISOString(), tasks: [] } : JSON.parse(boardBefore);
z.object({ tasks: z.array(z.object({ id: z.string().min(1) }).passthrough()) }).passthrough().parse(existingBoard);
const existingTasks = Array.isArray(existingBoard.tasks) ? existingBoard.tasks : [];
const incomingIds = new Set(mappedTasks.map((task) => task.id));
const incomingGates = new Set(mappedTasks.map((task) => task.reason_codes[1]).filter(Boolean));
const retainedTasks = existingTasks.filter((task) => mergeTasks
  ? task?.origin !== ERROR_FIXING_ORIGIN
    || (!incomingIds.has(task.id)
      && !task.reason_codes?.some((code) => incomingGates.has(code)))
  : task?.origin !== ERROR_FIXING_ORIGIN);

const nextBoard = {
  ...existingBoard,
  generated: new Date().toISOString(),
  tasks: [...retainedTasks, ...mappedTasks],
};

if (!dryRun) {
  mkdirSync(path.dirname(boardPath), { recursive: true });
  const currentBoard = existsSync(boardPath) ? readFileSync(boardPath, 'utf8') : null;
  if (currentBoard !== boardBefore) throw new Error('BOARD_CHANGED_DURING_PREPARATION');
  const temporaryPath = `${boardPath}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(nextBoard, null, 2)}\n`, { flag: 'wx' });
  renameSync(temporaryPath, boardPath);
  if (readFileSync(boardPath, 'utf8') !== `${JSON.stringify(nextBoard, null, 2)}\n`) {
    throw new Error('BOARD_WRITE_READBACK_MISMATCH');
  }
}

const receipt = {
  schema: 'atlas.error-fixing-board-preview.v1',
  status: dryRun ? 'BOARD_PREVIEW' : 'BOARD_UPDATED',
  boardPath,
  inputPath,
  planStatus: plan.status,
  candidateCount: candidates.length,
  tasksWritten: mappedTasks.length,
  tasksRetainedExisting: retainedTasks.length,
  mergeMode: mergeTasks,
  totalTasksOnBoard: nextBoard.tasks.length,
  writesPerformed: !dryRun,
  boardWritesPerformed: !dryRun,
  databaseWritesPerformed: false,
  dispatchPerformed: false,
  planFileChecksum,
  boardChecksumBefore: boardBefore === null ? null : `sha256:${createHash('sha256').update(boardBefore).digest('hex')}`,
  boardChecksumAfter: dryRun ? null : `sha256:${createHash('sha256').update(readFileSync(boardPath)).digest('hex')}`,
  canonicalAuthority: false,
  note: 'Diagnostic proposals only, separate from durable Kanban tasks. Optional receipt writes are local artifacts; no DB/Qdrant/Redis writes, agent dispatch, or llama-server calls.',
};
if (receiptTarget) {
  mkdirSync(path.dirname(receiptTarget), { recursive: true });
  writeFileSync(receiptTarget, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
}
console.log(JSON.stringify(receipt, null, 2));
