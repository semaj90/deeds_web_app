#!/usr/bin/env node
/**
 * Read-only audit of explicit validation commands in extracted nextsteps tasks.
 * A command is only an advisory candidate until its source binding, Kanban row,
 * declared package script, and dependency state all match exactly.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXPECTED_DB = 'legal_ai_live_integration_scratch';
const EXPECTED_PORT = 5434;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const args = new Map(process.argv.slice(2).map((arg) => {
  const index = arg.indexOf('=');
  return index < 0 ? [arg.replace(/^--/, ''), 'true'] : [arg.slice(2, index), arg.slice(index + 1)];
}));
const outputArg = args.get('report') ?? '.tmp/atlas/nextsteps-validation-command-bindings-v1.json';
const outputPath = path.resolve(ROOT, outputArg);
if (!outputPath.startsWith(`${path.resolve(ROOT, '.tmp')}${path.sep}`)) {
  throw new Error('REPORT_PATH_MUST_BE_UNDER_REPO_TMP');
}

async function resolveTaskFile() {
  const explicit = args.get('tasks');
  if (explicit) {
    const file = path.resolve(ROOT, explicit);
    const allowedRoot = path.resolve(ROOT, '.tmp/atlas/next-steps-task-extract-v1');
    if (!file.startsWith(`${allowedRoot}${path.sep}`) || path.basename(file) !== 'tasks.jsonl') {
      throw new Error('TASK_INPUT_MUST_BE_CANONICAL_EXTRACT_JSONL');
    }
    return file;
  }
  const parent = path.resolve(ROOT, '.tmp/atlas/next-steps-task-extract-v1');
  const dirs = (await fs.readdir(parent, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const dir of dirs) {
    const candidate = path.join(parent, dir, 'tasks.jsonl');
    try { await fs.access(candidate); return candidate; } catch { /* continue */ }
  }
  throw new Error('CANONICAL_NEXTSTEPS_TASK_EXTRACT_NOT_FOUND');
}

const taskPath = await resolveTaskFile();
const taskRows = (await fs.readFile(taskPath, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
if (taskRows.length === 0 || new Set(taskRows.map((row) => row.taskKey)).size !== taskRows.length) {
  throw new Error('TASK_EXTRACT_EMPTY_OR_DUPLICATE_IDENTITIES');
}

const commandPattern = /`((?:npm\s+(?:run|exec)\b|node\s+--test\b|python(?:3)?\s+-m\s+(?:pytest|unittest)\b|pytest\b|cargo\s+test\b|go\s+test\b|ctest\b)[^`]*)`/gi;
function classifyValidationCommand(command) {
  if (/^npm\s+run\s+(?:check|typecheck|lint)(?::[\w:-]+)?(?:\s|$)/i.test(command)) return 'CHECK';
  if (/^npm\s+run\s+[\w:-]*test[\w:-]*(?:\s|$)/i.test(command)
      || /^npm\s+exec\s+(?:--\s+)?(?:vitest|playwright)\b/i.test(command)
      || /^(?:node\s+--test|python(?:3)?\s+-m\s+(?:pytest|unittest)|pytest|cargo\s+test|go\s+test|ctest)\b/i.test(command)) return 'TEST';
  if (/^npm\s+run\s+[\w:-]*build[\w:-]*(?:\s|$)/i.test(command)) return 'BUILD';
  if (/^npm\s+run\s+[\w:-]*audit[\w:-]*(?:\s|$)/i.test(command)) return 'AUDIT_REVIEW_REQUIRED';
  return 'OPERATIONAL_OR_UNCLASSIFIED';
}
const packageCache = new Map();
const candidates = [];
for (const task of taskRows) {
  if (task.status !== 'open') continue;
  const commands = [...String(task.text ?? '').matchAll(commandPattern)].map((match) => match[1].trim());
  if (commands.length === 0) continue;
  const sourcePath = path.resolve(ROOT, task.docPath);
  if (!sourcePath.startsWith(`${ROOT}${path.sep}`)) throw new Error(`SOURCE_PATH_ESCAPE:${task.taskKey}`);
  const sourceBytes = await fs.readFile(sourcePath);
  const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
  const sourceLines = sourceBytes.toString('utf8').split(/\r?\n/);
  const sourceLine = sourceLines[Number(task.line) - 1] ?? '';
  const sourceRef = `${task.docPath}#L${task.line}`;
  const sourceBound = sourceRevision === task.sourceRevision && sourceLine.includes(task.text);
  const cwd = task.docPath.startsWith('sveltekit-frontend/')
    ? path.join(ROOT, 'sveltekit-frontend')
    : ROOT;
  const packagePath = path.join(cwd, 'package.json');
  let packageJson = packageCache.get(packagePath);
  if (!packageJson) {
    try { packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8')); }
    catch { packageJson = null; }
    packageCache.set(packagePath, packageJson);
  }
  for (const command of commands) {
    const runMatch = command.match(/^npm\s+run\s+([a-zA-Z0-9:_-]+)/);
    const scriptBody = runMatch ? packageJson?.scripts?.[runMatch[1]] ?? null : null;
    const validationCommandClass = classifyValidationCommand(command);
    candidates.push({
      taskId: task.taskKey,
      featureId: task.featureId,
      taskStatusInSource: task.status,
      sourceRef,
      sourceRevision,
      recordedSourceRevision: task.sourceRevision,
      sourceBound,
      command,
      validationCommandClass,
      commandSource: sourceBound ? sourceRef : null,
      declaredNpmScript: runMatch?.[1] ?? null,
      scriptDefined: runMatch ? scriptBody !== null : null,
      scriptBody,
      cwd: path.relative(ROOT, cwd) || '.',
      taskText: task.text,
      exactKanbanRow: null,
      reviewableCheckCandidate: false,
      blockers: [],
    });
  }
}

const url = new URL(process.env.SCRATCH_DATABASE_URL ?? resolveDatabaseUrl(loadRepoEnv(process.env)));
url.pathname = `/${EXPECTED_DB}`;
if (!LOOPBACK.has(url.hostname) || Number(url.port || 5432) !== EXPECTED_PORT) {
  throw new Error('SCRATCH_ENDPOINT_MUST_BE_LOOPBACK_PORT_5434');
}
const pool = new pg.Pool({
  connectionString: url.toString(),
  max: 1,
  connectionTimeoutMillis: 5000,
  options: '-c default_transaction_read_only=on',
});

const report = {
  schema: 'atlas.nextsteps-validation-command-binding-audit.v1',
  generatedAt: new Date().toISOString(),
  status: 'NOT_RUN',
  database: null,
  serverVersionNum: null,
  taskExtract: path.relative(ROOT, taskPath),
  extractedTaskCount: taskRows.length,
  explicitOpenCommandCandidates: candidates.length,
  exactSourceBoundCandidates: 0,
  exactKanbanTaskMatches: 0,
  reviewableCheckCandidates: 0,
  candidates,
  canonicalAuthority: false,
  writesPerformed: false,
};

try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = (await client.query(`
      SELECT current_database() AS database,
             current_setting('server_version_num')::int AS server_version_num,
             inet_server_port() AS server_port
    `)).rows[0];
    if (identity.database !== EXPECTED_DB || Number(identity.server_version_num) < 180000) {
      throw new Error('SCRATCH_DATABASE_IDENTITY_OR_PG18_CHECK_FAILED');
    }
    report.database = identity.database;
    report.serverVersionNum = Number(identity.server_version_num);
    report.clientPort = EXPECTED_PORT;
    report.serverPort = Number(identity.server_port);
    const taskIds = candidates.map((candidate) => candidate.taskId);
    const rows = taskIds.length === 0 ? [] : (await client.query(`
      SELECT t.task_id, t.feature_id, t.source_revision, t.source_refs,
             t.lane, t.status, t.validation_command, t.claim_token,
             (SELECT count(*)::int FROM public.kanban_task_dependencies d
               WHERE d.child_task_id = t.task_id) AS dependency_count
        FROM public.kanban_tasks t
       WHERE t.task_id = ANY($1::text[])
    `, [taskIds])).rows;
    const rowById = new Map(rows.map((row) => [row.task_id, row]));
    for (const candidate of candidates) {
      const blockers = [];
      const row = rowById.get(candidate.taskId);
      candidate.exactKanbanRow = row ? {
        featureId: row.feature_id,
        sourceRevision: row.source_revision,
        sourceRefs: row.source_refs,
        lane: row.lane,
        status: row.status,
        validationCommand: row.validation_command,
        dependencyCount: Number(row.dependency_count),
      } : null;
      if (!candidate.sourceBound) blockers.push('SOURCE_REVISION_OR_LINE_MISMATCH');
      if (!row) blockers.push('KANBAN_TASK_ID_NOT_FOUND');
      else {
        if (row.feature_id !== candidate.featureId) blockers.push('KANBAN_FEATURE_ID_MISMATCH');
        if (row.source_revision !== candidate.sourceRevision) blockers.push('KANBAN_SOURCE_REVISION_MISMATCH');
        const refs = Array.isArray(row.source_refs) ? row.source_refs : [];
        if (!refs.includes(candidate.sourceRef)) blockers.push('KANBAN_SOURCE_REF_MISMATCH');
        if (row.lane !== 'todo' || row.status !== 'pending' || row.claim_token) blockers.push('KANBAN_TASK_NOT_PENDING_UNCLAIMED');
        if (Number(row.dependency_count) !== 0) blockers.push('KANBAN_DEPENDENCIES_PRESENT');
      }
      if (candidate.declaredNpmScript && !candidate.scriptDefined) blockers.push('NPM_SCRIPT_NOT_DEFINED');
      if (!candidate.declaredNpmScript) blockers.push('COMMAND_REQUIRES_MANUAL_RESOLUTION');
      if (!['CHECK', 'TEST'].includes(candidate.validationCommandClass)) blockers.push('COMMAND_IS_NOT_AN_ADMITTED_CHECK_OR_TEST');
      candidate.blockers = blockers;
      candidate.reviewableCheckCandidate = blockers.length === 0;
    }
    report.exactSourceBoundCandidates = candidates.filter((candidate) => candidate.sourceBound).length;
    report.exactKanbanTaskMatches = candidates.filter((candidate) => candidate.exactKanbanRow !== null).length;
    report.reviewableCheckCandidates = candidates.filter((candidate) => candidate.reviewableCheckCandidate).length;
    report.status = 'READ_ONLY_CANDIDATES_AUDITED';
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
} catch (error) {
  report.status = 'READ_ONLY_AUDIT_FAILED';
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  schema: report.schema,
  status: report.status,
  database: report.database,
  extractedTaskCount: report.extractedTaskCount,
  explicitOpenCommandCandidates: report.explicitOpenCommandCandidates,
  exactSourceBoundCandidates: report.exactSourceBoundCandidates,
  exactKanbanTaskMatches: report.exactKanbanTaskMatches,
  reviewableCheckCandidates: report.reviewableCheckCandidates,
  writesPerformed: false,
  reportPath: path.relative(ROOT, outputPath),
}, null, 2)}\n`);
if (report.status !== 'READ_ONLY_CANDIDATES_AUDITED') process.exitCode = 1;
