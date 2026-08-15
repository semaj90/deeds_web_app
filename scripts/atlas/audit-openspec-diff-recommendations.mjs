#!/usr/bin/env node
/**
 * Read-only OpenSpec + git-diff recommendation audit.
 *
 * Reads current openspec/**/tasks.md files and the local git diff, then emits
 * deterministic Kanban recommendation drafts. It does not create/update
 * Kanban cards, write canonical stores, or infer missing evidence.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const OPENSPEC = resolve(ROOT, 'openspec/changes');
const OUTPUT = resolve(ROOT, 'docs/reports/openspec-diff-recommendations.json');

function sha(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function walkTasks(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walkTasks(full, out);
    else if (entry === 'tasks.md') out.push(full);
  }
  return out;
}

function gitLines(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function tokens(text) {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9_./-]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 4),
  );
}

function overlapScore(taskText, changedFiles) {
  const taskTokens = tokens(taskText);
  if (taskTokens.size === 0 || changedFiles.length === 0) return 0;
  let hits = 0;
  for (const file of changedFiles) {
    const fileTokens = tokens(file);
    for (const token of fileTokens) if (taskTokens.has(token)) hits += 1;
  }
  return Math.min(1, hits / 6);
}

const changedFiles = [...new Set([
  ...gitLines(['diff', '--name-only']),
  ...gitLines(['diff', '--name-only', '--cached']),
])].sort();

const taskFiles = walkTasks(OPENSPEC).sort();
const openTasks = [];
for (const file of taskFiles) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*-\s*\[ \]\s+(.+)$/);
    if (!match) continue;
    const text = match[1].trim();
    openTasks.push({
      specPath: rel,
      line: index + 1,
      task: text,
      diffAffinity: overlapScore(text, changedFiles),
    });
  }
}

const ranked = openTasks
  .map((task) => ({
    ...task,
    changedFileEvidence: changedFiles.filter((file) => overlapScore(task.task, [file]) > 0),
  }))
  .sort((a, b) => b.diffAffinity - a.diffAffinity || a.specPath.localeCompare(b.specPath) || a.line - b.line);

const recommendations = ranked.slice(0, 32).map((task, index) => ({
  schema: 'atlas.openspec-diff-recommendation.v1',
  rank: index + 1,
  recommendationId: `openspec:${sha([task.specPath, task.line, task.task]).slice(0, 20)}`,
  status: 'DRAFT_READ_ONLY',
  taskLabel: task.task,
  sourceRef: `${task.specPath}#L${task.line}`,
  evidenceRefs: [
    `${task.specPath}#L${task.line}`,
    ...task.changedFileEvidence.map((file) => `git-diff:${file}`),
  ],
  scoreComponents: {
    diffAffinity: Number(task.diffAffinity.toFixed(6)),
  },
  kanbanProjection: {
    allowed: true,
    applied: false,
    reason: 'Recommendation draft only; durable Kanban promotion requires existing receipt/policy owner.',
  },
}));

const report = {
  schema: 'atlas.openspec-diff-recommendation-report.v1',
  generatedAt: new Date().toISOString(),
  status: taskFiles.length > 0 ? 'PROVEN_READ_ONLY_AUDIT' : 'MISSING_OPENSPEC_TASKS',
  taskFilesScanned: taskFiles.length,
  openTaskCount: openTasks.length,
  changedFiles,
  recommendationCount: recommendations.length,
  canonicalWrites: false,
  kanbanWrites: false,
  recommendations,
};

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
