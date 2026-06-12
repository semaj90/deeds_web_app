#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OPENCODE_DIR = path.join(ROOT, '.opencode');
const TASKS_DIR = path.join(OPENCODE_DIR, 'tasks');
const INDEX_PATH = path.join(TASKS_DIR, '_index.json');
const TASK_STATE_JSON = path.join(TASKS_DIR, 'task-state.json');
const TASK_STATE_MD = path.join(TASKS_DIR, 'task-state.md');

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function countByStatus(index) {
  const tasks = index?.tasks_by_status ?? {};
  const todo = Array.isArray(tasks.todo) ? tasks.todo : [];
  const doing = Array.isArray(tasks.doing) ? tasks.doing : [];
  const blocked = Array.isArray(tasks.blocked) ? tasks.blocked : [];
  const done = Array.isArray(tasks.done) ? tasks.done : [];
  return {
    todo: todo.length,
    doing: doing.length,
    blocked: blocked.length,
    done: done.length,
    open: todo.length + doing.length + blocked.length,
    total: todo.length + doing.length + blocked.length + done.length,
  };
}

function renderMarkdown(index, counts) {
  const todo = Array.isArray(index?.tasks_by_status?.todo) ? index.tasks_by_status.todo : [];
  const lines = [
    '# OpenCode Task State',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Workspace: ${index?.workspace_id ?? 'unknown'}`,
    '',
    '## Summary',
    '',
    `- Open: ${counts.open}`,
    `- Todo: ${counts.todo}`,
    `- Doing: ${counts.doing}`,
    `- Blocked: ${counts.blocked}`,
    `- Done: ${counts.done}`,
    `- Total: ${counts.total}`,
    `- Feature labels: ${index?.feature_label_count ?? 0}`,
    '',
    '## Next Ready Task',
    '',
    `- ${index?.next_ready_task_id ?? 'none'}`,
    '',
    '## Open Tasks',
    '',
  ];

  for (const task of todo.slice(0, 20)) {
    lines.push(`- ${task.id} — ${task.title} (${task.priority ?? 'n/a'})`);
  }

  if (!todo.length) lines.push('- None');
  lines.push('', '## Notes', '', 'This file is a derived snapshot from .opencode/tasks/_index.json.');
  return lines.join('\n') + '\n';
}

function main() {
  const index = readJson(INDEX_PATH, null);
  if (!index) {
    console.error(`Missing task index: ${INDEX_PATH}`);
    process.exit(1);
  }

  const counts = countByStatus(index);
  const state = {
    generatedAt: new Date().toISOString(),
    workspace_id: index.workspace_id ?? 'unknown',
    version: index.version ?? 1,
    total_tasks: index.total_tasks ?? counts.total,
    counts,
    next_ready_task_id: index.next_ready_task_id ?? null,
    feature_label_count: index.feature_label_count ?? 0,
    tasks_by_status: index.tasks_by_status ?? {},
    source: path.relative(ROOT, INDEX_PATH),
  };

  fs.mkdirSync(TASKS_DIR, { recursive: true });
  fs.writeFileSync(TASK_STATE_JSON, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.writeFileSync(TASK_STATE_MD, renderMarkdown(index, counts), 'utf8');

  console.log(JSON.stringify({
    ok: true,
    generatedAt: state.generatedAt,
    taskStateJson: path.relative(ROOT, TASK_STATE_JSON),
    taskStateMd: path.relative(ROOT, TASK_STATE_MD),
    openCount: counts.open,
    doneCount: counts.done,
    totalCount: counts.total,
    nextReadyTaskId: state.next_ready_task_id,
  }, null, 2));
}

main();
