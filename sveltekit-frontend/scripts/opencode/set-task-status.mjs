#!/usr/bin/env node

import { PATHS, appendJsonl, readJson, statusChangeEvent } from './task-registry-helpers.mjs';

function argValue(name, fallback = null) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const taskId = argValue('--task-id', positional[0] ?? null);
const nextStatus = String(argValue('--status', positional[1] ?? '')).toUpperCase();
const reason = argValue('--reason', positional[2] ?? 'Explicit task status transition');
const runId = argValue('--run-id', positional[3] ?? `task-status-${new Date().toISOString().slice(0, 10)}`);
const allowedStatuses = new Set(['TODO', 'IN_PROGRESS', 'BLOCKED', 'VALIDATING', 'DONE', 'ARCHIVED']);

if (!taskId) throw new Error('--task-id is required');
if (!allowedStatuses.has(nextStatus)) {
  throw new Error(`--status must be one of: ${[...allowedStatuses].join(', ')}`);
}

const state = await readJson(PATHS.taskStateJson);
const task = (state.tasks ?? []).find((row) => row.task_id === taskId);
if (!task) throw new Error(`Task not found: ${taskId}`);

const previousStatus = String(task.status ?? 'TODO').toUpperCase();
if (previousStatus === nextStatus) {
  console.log(JSON.stringify({ ok: true, skipped: true, taskId, status: nextStatus }, null, 2));
  process.exit(0);
}

await appendJsonl(PATHS.taskEvents, [
  statusChangeEvent(taskId, previousStatus, nextStatus, reason, runId),
]);

console.log(JSON.stringify({
  ok: true,
  skipped: false,
  taskId,
  previousStatus,
  nextStatus,
  reason,
}, null, 2));
