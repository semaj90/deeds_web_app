#!/usr/bin/env node
/**
 * Refresh the summary topology export + feature recommendation lane.
 *
 * Order:
 *   1. Export summary topology pages in a resumable batch
 *   2. Materialize feature recommendation index for the same slice
 *   3. Generate feature TODOs from the refreshed recommendation index
 *
 * Defaults:
 *   - dry-run unless --apply is explicit
 *   - resumable batches with --limit and --offset
 *   - optional --max-pages to cap the export loop
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;

function argValue(name, fallback = null) {
  const direct = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const envKey = `npm_config_${name.replace(/-/g, '_')}`;
  const fromEnv = process.env[envKey];
  return fromEnv !== undefined && String(fromEnv).length > 0 ? fromEnv : fallback;
}

const LIMIT = Number(argValue('limit', '2000'));
const OFFSET = Number(argValue('offset', '0'));
const MAX_PAGES = Number(argValue('max-pages', DRY_RUN ? '1' : '0'));
const TOP_K = Number(argValue('top-k', '20'));
const TODO_LIMIT = Number(argValue('todo-limit', '200'));

const EXPORT = path.join(ROOT, 'scripts', 'atlas', 'export-summary-topology-pages.mjs');
const MATERIALIZE = path.join(ROOT, 'scripts', 'atlas', 'materialize-feature-recommendation-index.mjs');
const TODOS = path.join(ROOT, 'scripts', 'atlas', 'generate-feature-todos.mjs');
const TODO_REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'feature-todo-recommendations.json');
const BOARD_MD = path.join(ROOT, 'docs', 'reports', 'spec-driven-kanban-task-board.md');
const BOARD_JSONL = path.join(ROOT, '.tmp', 'kanban-topology-slice.jsonl');

function log(...args) {
  console.log('[summary-topology-refresh]', ...args);
}

function runNode(script, args = []) {
  return execFileSync('node', [script, ...args], {
    cwd: ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function print(out) {
  process.stdout.write(String(out ?? ''));
  if (out && !String(out).endsWith('\n')) process.stdout.write('\n');
}

function renderBoardSlice(report) {
  const topTasks = Array.isArray(report?.top_tasks) ? report.top_tasks : [];
  const gapSummary = report?.gap_summary ?? {};
  const rows = [
    '',
    '## Topology Recommendation Slice',
    '',
    `Generated: ${report?.generated_at ?? new Date().toISOString()}`,
    `Total features indexed: ${gapSummary.total_features ?? 'n/a'}`,
    `Total packets: ${gapSummary.total_packets ?? 'n/a'}`,
    `Summarized packets: ${gapSummary.total_summarized ?? 'n/a'}`,
    `Tree-linked features: ${gapSummary.features_with_tree_gaps !== undefined ? `missing ${gapSummary.features_with_tree_gaps}` : 'n/a'}`,
    `Qdrant-bridged features: ${gapSummary.features_with_qdrant_gaps !== undefined ? `missing ${gapSummary.features_with_qdrant_gaps}` : 'n/a'}`,
    '',
    '| priority | gap | feature | packets | tree linked | qdrant keyed | todo score | command |',
    '|---:|---|---|---:|---:|---:|---:|---|',
    ...topTasks.slice(0, 20).map((task) => `| ${task.priority ?? ''} | ${task.gap ?? ''} | ${task.feature_label ?? task.feature_id ?? ''} | ${task.packet_count ?? ''} | ${task.tree_linked_count ?? ''} | ${task.qdrant_keyed_count ?? ''} | ${task.todo_score ?? ''} | ${task.command ?? ''} |`),
    '',
  ];
  return rows.join('\n');
}

async function main() {
  log(`mode=${APPLY ? 'apply' : 'dry-run'} limit=${LIMIT} offset=${OFFSET} max-pages=${MAX_PAGES || 'all'} top-k=${TOP_K}`);

  const exportArgs = [
    APPLY ? '--apply' : '--dry-run',
    `--limit=${LIMIT}`,
    `--offset=${OFFSET}`,
    `--max-pages=${MAX_PAGES}`,
    `--top-k=${TOP_K}`,
  ];
  log('1/3 exporting summary topology pages...');
  print(runNode(EXPORT, exportArgs));

  const materializeArgs = [
    APPLY ? '--apply' : '--dry-run',
    `--limit=${LIMIT}`,
    `--offset=${OFFSET}`,
  ];
  log('2/3 materializing feature recommendation index...');
  print(runNode(MATERIALIZE, materializeArgs));

  const todoArgs = [
    APPLY ? '--apply' : '--verbose',
    `--limit=${TODO_LIMIT}`,
  ];
  log('3/3 generating feature TODOs...');
  print(runNode(TODOS, todoArgs));

  try {
    const todoReport = JSON.parse(await fs.readFile(TODO_REPORT_JSON, 'utf8'));
    await fs.mkdir(path.dirname(BOARD_JSONL), { recursive: true });
    await fs.writeFile(
      BOARD_JSONL,
      `${(todoReport.top_tasks ?? []).slice(0, 50).map((row) => JSON.stringify(row)).join('\n')}${(todoReport.top_tasks ?? []).length ? '\n' : ''}`,
      'utf8',
    );

    const existing = await fs.readFile(BOARD_MD, 'utf8').catch(() => '# Spec-Driven Kanban Task Board\n');
    const base = existing.replace(/\n## Topology Recommendation Slice[\s\S]*$/m, '').trimEnd();
    await fs.writeFile(BOARD_MD, `${base}\n${renderBoardSlice(todoReport)}`, 'utf8');
    log('board updated');
  } catch (error) {
    log(`board update skipped: ${error?.message ?? error}`);
  }

  log('complete');
}

main().catch((error) => {
  console.error('[summary-topology-refresh] fatal:', error?.stdout || error?.message || error);
  process.exit(1);
});
