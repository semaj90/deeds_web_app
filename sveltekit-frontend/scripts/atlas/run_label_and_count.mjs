#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const cwd = path.resolve(process.cwd());
const limit = process.argv[2] || '4000';

console.log('Running feature_labelling with limit=', limit);
const r = spawnSync('node', ['scripts/atlas/feature_labelling.mjs', '--limit', limit], { cwd, stdio: 'inherit' });
if (r.error) {
  console.error('Error running labeling:', r.error);
  process.exit(1);
}

function countLines(p) {
  try {
    if (!fs.existsSync(p)) return 'MISSING';
    const cnt = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).length;
    return cnt;
  } catch (e) { return 'ERR'; }
}

const labels = countLines(path.join(cwd, '.tmp', 'feature_labels.jsonl'));
const tasks = countLines(path.join(cwd, '.tmp', 'kanban_tasks.jsonl'));
const missingTodos = countLines(path.join(cwd, '.tmp', 'missing_feature_todos.jsonl'));
console.log('LABELS', labels, 'KANBAN', tasks, 'MISSING_TODOS', missingTodos);

process.exit(0);
