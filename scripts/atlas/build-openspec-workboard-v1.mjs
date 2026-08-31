#!/usr/bin/env node
/**
 * Build an evidence-backed OpenSpec workboard.
 *
 * This is a projection only. It never edits task ledgers or infers completion.
 * ETA is emitted only when a receipt-linked duration is available; otherwise
 * it remains UNKNOWN.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const changesRoot = join(root, 'openspec', 'changes');
const reportPath = join(root, 'docs', 'reports', 'openspec-workboard-v1.json');
const markdownPath = join(root, 'docs', 'OPENSPEC-WORKBOARD.md');

const progressBar = (fraction) => {
  if (fraction == null) return '[----------]';
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * 10);
  return `[${'#'.repeat(filled)}${'-'.repeat(10 - filled)}]`;
};

const pathOf = (file) => relative(root, file).split(sep).join('/');
const classifyKind = (text) => (/no canonical identity or source data changes|no projection occurs while model, identity, or parity gates fail/i.test(text) ? 'INVARIANT' : 'WORK_ITEM');
const priorityFor = (text) => {
  const value = text.toLowerCase();
  if (/identity|symbol.?version|candidateordinal|source.?revision|graph.?resolve/.test(value)) return 10;
  if (/canonical|eligibility|provenance|readback|lineage/.test(value)) return 20;
  if (/runtime|embedding|llama|8098|qdrant|pgvector|retrieval/.test(value)) return 30;
  if (/feature|contextmanifest|ace|ast|tree.?sitter|lsp|ontology/.test(value)) return 40;
  if (/workflow|jetstream|nats|receipt|agentic|openspec/.test(value)) return 50;
  if (/admin|kanban|document|toc|archive|supersed/.test(value)) return 60;
  if (/benchmark|experiment|challenger|pca|svd|tang|som|leiden/.test(value)) return 80;
  return 70;
};

const taskFiles = [];
if (existsSync(changesRoot)) {
  for (const change of readdirSync(changesRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!change.isDirectory()) continue;
    const file = join(changesRoot, change.name, 'tasks.md');
    if (existsSync(file)) taskFiles.push(file);
  }
}

const tasks = [];
for (const file of taskFiles) {
  const change = relative(changesRoot, file).split(sep)[0];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = line.match(/^\s*-\s*\[([ xX])\]\s+(.*)$/);
    if (!match) return;
    const done = match[1].toLowerCase() === 'x';
    const text = match[2].trim();
    tasks.push({
      taskKey: `${change}:${index + 1}`,
      change,
      source: pathOf(file),
      line: index + 1,
      text,
      state: done ? 'DONE' : 'OPEN',
      kind: classifyKind(text),
      priority: priorityFor(`${change} ${text}`),
      lastUpdatedAt: statSync(file).mtime.toISOString(),
      timestampMethod: 'FILESYSTEM_MTIME',
      eta: classifyKind(text) === 'INVARIANT'
        ? { status: 'NOT_APPLICABLE', method: 'PERMANENT_ACCEPTANCE_INVARIANT' }
        : { status: 'UNKNOWN', method: 'NO_RECEIPT_LINKED_THROUGHPUT' },
    });
  });
}

const openTasks = tasks.filter((task) => task.state === 'OPEN');
const completedTasks = tasks.length - openTasks.length;
const byPriority = [...openTasks].filter((task) => task.kind !== 'INVARIANT').sort((a, b) => a.priority - b.priority || b.lastUpdatedAt.localeCompare(a.lastUpdatedAt) || a.change.localeCompare(b.change) || a.line - b.line);
const invariants = tasks.filter((task) => task.kind === 'INVARIANT').map((task) => ({ taskKey: task.taskKey, change: task.change, source: task.source, line: task.line, text: task.text, state: task.state, lastUpdatedAt: task.lastUpdatedAt, timestampMethod: task.timestampMethod, eta: task.eta }));
const workPackages = [
  { id: 'P10-A', title: 'Migration ledger reconciliation', gates: ['migration baseline', 'owner manifest', 'pre-apply guard'], dependsOn: [], state: 'BLOCKED' },
  { id: 'P10-B', title: 'Canonical candidate identity', gates: ['feature identity', 'packet identity', 'CandidateOrdinal'], dependsOn: ['P10-A'], state: 'OPEN' },
  { id: 'P10-C', title: 'Symbol lineage', gates: ['stableSymbolId', 'symbolVersionId', 'treeNodeId'], dependsOn: ['P10-B'], state: 'OPEN' },
  { id: 'P10-D', title: 'Lexical identity', gates: ['source revision', 'FTS identity', 'cross-store lineage'], dependsOn: ['P10-B'], state: 'OPEN' },
  { id: 'P10-E', title: 'Top-K cross-store readback', gates: ['CandidateTopKV1', 'Qdrant parity', 'Go retrieval parity'], dependsOn: ['P10-C', 'P10-D'], state: 'OPEN' },
];
const changes = [...new Set(tasks.map((task) => task.change))].sort().map((change) => {
  const rows = tasks.filter((task) => task.change === change);
  const done = rows.filter((task) => task.state === 'DONE').length;
  return { change, completed: done, total: rows.length, progressFraction: rows.length ? done / rows.length : null, progressBar: progressBar(rows.length ? done / rows.length : null), open: rows.length - done };
});

const result = {
  schema: 'atlas.openspec.workboard.v1',
  generatedAt: new Date().toISOString(),
  source: 'openspec/changes/*/tasks.md',
  summary: { completedTasks, openTasks: openTasks.length, totalTasks: tasks.length, progressFraction: tasks.length ? completedTasks / tasks.length : null, progressBar: progressBar(tasks.length ? completedTasks / tasks.length : null), eta: { status: 'UNKNOWN', method: 'NO_RECEIPT_LINKED_THROUGHPUT' } },
  ordering: 'WORK_PACKAGES_THEN_WORK_ITEMS; PRIORITY_THEN_LAST_UPDATED_DESC; INVARIANTS_SEPARATE; ETA_SORT_WHEN_RECEIPT_THROUGHPUT_EXISTS',
  workPackages,
  invariants,
  changes,
  nextTasks: byPriority.slice(0, 100),
  writes: { taskLedgers: 0, sourceDocuments: 0 },
};

const markdown = [
  '# OpenSpec Workboard', '',
  '> Generated from OpenSpec task ledgers. This is a navigation/progress projection, not task authority.', '',
  `Overall progress: ${result.summary.progressBar} ${completedTasks}/${tasks.length} tasks`,
  'ETA: UNKNOWN — no receipt-linked throughput supports a defensible estimate.', '',
  '## P10 dependency work packages', '',
  ...workPackages.map((item) => `- **${item.id}** ${item.title} — ${item.state}; depends on ${item.dependsOn.join(', ') || 'none'}; gates: ${item.gates.join(', ')}`), '',
  '## Permanent acceptance invariants', '',
  ...invariants.map((item) => `- **INVARIANT** [${item.change}](${item.source}#L${item.line}) ${item.text} — last updated ${item.lastUpdatedAt} (${item.timestampMethod}); ETA N/A`), '',
  '## Highest-priority open tasks', '',
  ...byPriority.slice(0, 100).map((task) => `- [ ] **P${task.priority}** [${task.change}](${task.source}#L${task.line}) ${task.text} — last updated ${task.lastUpdatedAt} (${task.timestampMethod}); ETA UNKNOWN`), '',
  '## Change progress', '',
  ...changes.map((change) => `- [${change.change}](openspec/changes/${change.change}/) ${change.progressBar} ${change.completed}/${change.total} complete; ${change.open} open`), '',
].join('\n');

writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
writeFileSync(markdownPath, `${markdown}\n`, 'utf8');
console.log(`OPENSPEC_WORKBOARD_BUILT changes=${changes.length} tasks=${tasks.length} open=${openTasks.length}`);
console.log(`report=${reportPath}`);
