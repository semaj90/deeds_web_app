#!/usr/bin/env node
/**
 * consolidate-master-todo-to-kanban.mjs
 *
 * Parse MASTER-FEATURE-TODO-2026-05-20.md, extract every `- [ ]` open item,
 * verify if the file referenced exists, and emit kanban tasks for the gaps.
 *
 * Status policy:
 *   - File referenced exists + script is callable → DONE (auto-mark complete)
 *   - File referenced exists but script not in package.json → REVIEW
 *   - File referenced does not exist → BACKLOG with priority=MEDIUM
 *   - Phase headers (no file) → BACKLOG with priority=LOW (epic-level)
 *
 * Outputs:
 *   .tmp/master-todo-reconciliation.json
 *   .tmp/master-todo-kanban-tasks.jsonl
 *   docs/graph/kanban-board.json   (merged when --merge passed)
 *   memory/exports/master-todo-consolidation-report.json
 *
 * Usage:
 *   node scripts/atlas/consolidate-master-todo-to-kanban.mjs --apply
 *   node scripts/atlas/consolidate-master-todo-to-kanban.mjs --apply --merge
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const MERGE = argv.includes('--merge');

const MASTER_TODO = path.join(ROOT, 'MASTER-FEATURE-TODO-2026-05-20.md');
const KANBAN_TARGET = path.join(ROOT, 'docs', 'graph', 'kanban-board.json');
const SVELTEKIT_PKG = path.join(ROOT, 'sveltekit-frontend', 'package.json');
const FRONTEND_TMP = path.join(ROOT, 'sveltekit-frontend', '.tmp');
const OFFLINE_ANALYSIS_BOARD = path.join(ROOT, 'sveltekit-frontend', '.tmp', 'offline-analysis', 'docs-graph-kanban-board.json');

const RECONCILE_OUT = path.join(ROOT, '.tmp', 'master-todo-reconciliation.json');
const TASKS_NDJSON = path.join(ROOT, '.tmp', 'master-todo-kanban-tasks.jsonl');
const REPORT = path.join(ROOT, 'memory', 'exports', 'master-todo-consolidation-report.json');

function shortId(prefix, payload) {
  const h = createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 8).toUpperCase();
  return `${prefix}-${h}`;
}

// Match `script-name.mjs`, `scripts/path/file.mjs`, `npm run XYZ`, or backticked file paths.
function extractFileReferences(text) {
  const refs = new Set();
  const patterns = [
    /`([a-zA-Z0-9_./-]+\.(?:mjs|ts|js))`/g,
    /`(scripts\/[a-zA-Z0-9_./-]+)`/g,
    /\b([a-zA-Z0-9_./-]+\.(?:mjs|ts|js))\b/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) {
      const ref = m[1];
      if (ref.includes('/') || ref.endsWith('.mjs') || ref.endsWith('.ts')) refs.add(ref);
    }
  }
  return Array.from(refs);
}

function extractNpmScripts(text) {
  const out = new Set();
  const re = /`npm run ([a-zA-Z0-9_:-]+)`/g;
  let m;
  while ((m = re.exec(text))) out.add(m[1]);
  // bare backticked words that look like npm scripts (contain :)
  const re2 = /`([a-zA-Z0-9_-]+:[a-zA-Z0-9_:-]+)`/g;
  while ((m = re2.exec(text))) out.add(m[1]);
  return Array.from(out);
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function normalizeSourceRefs(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [values]).flatMap((value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return [String(value)];
  }).filter(Boolean)));
}

function normalizeBoardTask(task, fallback = {}) {
  const taskId = String(task.taskId || task.task_id || fallback.taskId || fallback.task_id || '');
  const featureId = String(task.feature_id || task.featureId || task.feature || task.featureKey || fallback.feature_id || fallback.featureId || '');
  const featureKey = String(task.featureKey || task.feature_key || fallback.featureKey || featureId || taskId || 'unknown');
  const feature = String(task.feature || task.feature_name || fallback.feature || featureKey || featureId || '');
  const sourceRef = String(task.source_ref || task.sourceRef || fallback.source_ref || fallback.sourceRef || '');
  const sourceRefs = normalizeSourceRefs(task.sourceRefs || task.source_refs || fallback.sourceRefs || fallback.source_refs || (sourceRef ? [sourceRef] : []));
  const status = String(task.status || fallback.status || 'todo');
  const kanbanStatus = String(task.kanbanStatus || task.kanban_status || fallback.kanbanStatus || 'BACKLOG').toUpperCase();
  return {
    ...fallback,
    ...task,
    taskId: taskId || `KANBAN-${featureKey || 'UNKNOWN'}`,
    feature: feature || undefined,
    featureId: featureId || undefined,
    feature_id: featureId || undefined,
    featureKey,
    sourceRef,
    source_ref: sourceRef || undefined,
    sourceRefs,
    status,
    kanbanStatus,
    priority: task.priority || fallback.priority || 'LOW',
  };
}

function createEmptyBoard() {
  const labels = ['BACKLOG', 'READY', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE'];
  return {
    generatedAt: new Date().toISOString(),
    repoName: path.basename(ROOT),
    totalTasks: 0,
    usedLlm: false,
    columns: Object.fromEntries(labels.map((label) => [label, { label, tasks: [] }])),
  };
}

function loadBoardSeed() {
  const candidates = [KANBAN_TARGET, OFFLINE_ANALYSIS_BOARD];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    } catch {
      continue;
    }
  }
  return createEmptyBoard();
}

function columnForStatus(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'DONE' || normalized === 'COMPLETED' || normalized === 'SHIPPED') return 'DONE';
  if (normalized === 'BLOCKED' || normalized === 'ENV_BLOCKED') return 'BLOCKED';
  if (normalized === 'IN_PROGRESS' || normalized === 'DOING' || normalized === 'RUNNING') return 'IN_PROGRESS';
  if (normalized === 'READY' || normalized === 'NEXT') return 'READY';
  if (normalized === 'REVIEW' || normalized === 'RECHECK') return 'REVIEW';
  return 'BACKLOG';
}

function upsertTaskIntoBoard(board, task, originLabel = 'task') {
  const normalized = normalizeBoardTask(task);
  const columnName = columnForStatus(normalized.kanbanStatus || normalized.status);
  board.columns[columnName] ||= { label: columnName, tasks: [] };
  const columns = Object.values(board.columns || {});
  for (const col of columns) {
    const tasks = Array.isArray(col.tasks) ? col.tasks : [];
    const existingIndex = tasks.findIndex((entry) => entry.taskId === normalized.taskId);
    if (existingIndex !== -1) {
      const existing = tasks[existingIndex];
      const mergedSourceRefs = normalizeSourceRefs([...(existing.sourceRefs || []), ...(normalized.sourceRefs || [])]);
      tasks[existingIndex] = {
        ...existing,
        ...normalized,
        feature: existing.feature || normalized.feature || normalized.featureKey || normalized.feature_id,
        sourceRefs: mergedSourceRefs,
        boardSources: normalizeSourceRefs([...(existing.boardSources || []), originLabel]),
      };
      return 'updated';
    }
  }
  board.columns[columnName].tasks ||= [];
  board.columns[columnName].tasks.push({
    ...normalized,
    feature: normalized.feature || normalized.featureKey || normalized.feature_id,
    boardSources: normalizeSourceRefs([originLabel]),
  });
  return 'added';
}

function normalizeBoard(board) {
  for (const col of Object.values(board.columns || {})) {
    if (!Array.isArray(col.tasks)) continue;
    col.tasks = col.tasks.map((task) => {
      const normalized = normalizeBoardTask(task);
      return {
        ...task,
        ...normalized,
        feature: normalized.feature || normalized.featureKey || normalized.feature_id,
      };
    });
  }
  return board;
}

function sortBoardColumns(board) {
  for (const col of Object.values(board.columns || {})) {
    if (!Array.isArray(col.tasks)) continue;
    col.tasks.sort((a, b) => {
      const aRank = `${a.priority || ''}|${a.featureKey || ''}|${a.taskId || ''}`;
      const bRank = `${b.priority || ''}|${b.featureKey || ''}|${b.taskId || ''}`;
      return aRank.localeCompare(bRank);
    });
  }
}

async function main() {
  console.log('\n══ Consolidate MASTER-TODO → Kanban ══════════════════════');
  console.log(`  Mode:  ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Merge: ${MERGE ? 'yes' : 'no'}`);

  if (!fs.existsSync(MASTER_TODO)) {
    console.error(`  ❌ Missing ${MASTER_TODO}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(MASTER_TODO, 'utf8').split('\n');
  const pkg = JSON.parse(fs.readFileSync(SVELTEKIT_PKG, 'utf8'));
  const npmScripts = new Set(Object.keys(pkg.scripts || {}));

  const openItems = [];
  let currentSection = 'Unknown';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^##+\s+(.+)$/);
    if (headerMatch) currentSection = headerMatch[1].trim();
    if (line.startsWith('- [ ]')) {
      openItems.push({
        section: currentSection,
        lineNo: i + 1,
        text: line.replace(/^- \[ \]\s*/, '').trim(),
      });
    }
  }
  console.log(`  ✅ Parsed ${openItems.length} open items across ${new Set(openItems.map(o => o.section)).size} sections`);

  // Reconcile each item
  const reconciled = openItems.map((item) => {
    const fileRefs = extractFileReferences(item.text);
    const scriptRefs = extractNpmScripts(item.text);

    const fileStatuses = fileRefs.map((rel) => {
      const candidates = [
        path.join(ROOT, rel),
        path.join(ROOT, 'sveltekit-frontend', rel),
        path.join(ROOT, 'sveltekit-frontend/src', rel),
      ];
      const found = candidates.find((p) => fs.existsSync(p));
      return { ref: rel, exists: !!found, foundAt: found ? path.relative(ROOT, found).replace(/\\/g, '/') : null };
    });

    const scriptStatuses = scriptRefs.map((s) => ({ ref: s, registered: npmScripts.has(s) }));

    const allFilesExist = fileStatuses.length > 0 && fileStatuses.every((f) => f.exists);
    const someFilesMissing = fileStatuses.some((f) => !f.exists);
    const allScriptsRegistered = scriptStatuses.length > 0 && scriptStatuses.every((s) => s.registered);

    let inferredStatus;
    let priority = 'MEDIUM';
    if (allFilesExist && (scriptStatuses.length === 0 || allScriptsRegistered)) {
      inferredStatus = 'REVIEW'; // file exists, possibly done — needs human verify
      priority = 'LOW';
    } else if (someFilesMissing) {
      inferredStatus = 'BACKLOG';
      priority = 'MEDIUM';
    } else if (fileStatuses.length === 0 && scriptStatuses.length === 0) {
      inferredStatus = 'BACKLOG'; // epic-level
      priority = 'LOW';
    } else {
      inferredStatus = 'BACKLOG';
      priority = 'MEDIUM';
    }

    return { ...item, fileStatuses, scriptStatuses, inferredStatus, priority };
  });

  // Build kanban tasks
  const tasks = reconciled.map((r) => {
    const id = shortId('MTODO', { section: r.section, line: r.lineNo, text: r.text.slice(0, 80) });
    const firstFile = r.fileStatuses[0]?.foundAt || r.fileStatuses[0]?.ref || '';
    const featureId = `master-todo.${r.section.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
    const sourceRef = `MASTER-FEATURE-TODO-2026-05-20.md:${r.lineNo}`;
    return {
      taskId: id,
      featureKey: featureId,
      feature_id: featureId,
      feature: featureId,
      source_ref: sourceRef,
      sourceRefs: r.fileStatuses.filter(f => f.exists).map(f => f.foundAt).slice(0, 5),
      title: r.text.length > 80 ? r.text.slice(0, 77) + '…' : r.text,
      description: `${r.section}\nLine ${r.lineNo} of MASTER-FEATURE-TODO-2026-05-20.md.\nFiles: ${r.fileStatuses.map(f => (f.exists ? '✅' : '❌') + f.ref).join(', ') || 'none'}\nNPM scripts: ${r.scriptStatuses.map(s => (s.registered ? '✅' : '❌') + s.ref).join(', ') || 'none'}`,
      kanbanStatus: r.inferredStatus,
      priority: r.priority,
      status: 'master-todo-derived',
      fileCount: r.fileStatuses.length,
      topFile: firstFile,
      dbTables: [],
      cacheKeys: [],
      mcpTools: [],
      routeTypes: [],
      hasLlmCall: false,
      files: r.fileStatuses.filter(f => f.exists).map(f => f.foundAt),
      master_todo_meta: {
        section: r.section,
        sourceLine: r.lineNo,
        fileStatuses: r.fileStatuses,
        scriptStatuses: r.scriptStatuses,
      },
      linkedReports: ['MASTER-FEATURE-TODO-2026-05-20.md'],
      createdAt: new Date().toISOString(),
    };
  });

  const featureLabelTasksPath = path.join(FRONTEND_TMP, 'kanban_tasks.jsonl');
  const missingFeatureTodosPath = path.join(FRONTEND_TMP, 'missing_feature_todos.jsonl');
  const featureLabelTasks = readJsonl(featureLabelTasksPath);
  const missingFeatureTodos = readJsonl(missingFeatureTodosPath);
  const featureLabelBoardTasks = featureLabelTasks.map((task) => normalizeBoardTask(task, { status: 'todo', kanbanStatus: 'BACKLOG' }));
  const missingFeatureTodoBoardTasks = missingFeatureTodos.map((task) => normalizeBoardTask(task, { status: 'todo', kanbanStatus: 'BACKLOG' }));

  if (APPLY) {
    fs.mkdirSync(path.dirname(RECONCILE_OUT), { recursive: true });
    fs.writeFileSync(RECONCILE_OUT, JSON.stringify(reconciled, null, 2), 'utf8');
    fs.writeFileSync(TASKS_NDJSON, tasks.map(t => JSON.stringify(t)).join('\n') + '\n', 'utf8');
    console.log(`  ✅ Reconcile → ${RECONCILE_OUT}`);
    console.log(`  ✅ Tasks     → ${TASKS_NDJSON}`);

    if (MERGE) {
      const board = loadBoardSeed();
      const counts = {
        masterTodo: { added: 0, updated: 0 },
        featureLabel: { added: 0, updated: 0 },
        missingFeatureTodo: { added: 0, updated: 0 },
      };

      for (const t of tasks) {
        const result = upsertTaskIntoBoard(board, t, 'master-todo');
        counts.masterTodo[result] += 1;
      }
      for (const t of featureLabelBoardTasks) {
        const result = upsertTaskIntoBoard(board, t, 'feature-label');
        counts.featureLabel[result] += 1;
      }
      for (const t of missingFeatureTodoBoardTasks) {
        const result = upsertTaskIntoBoard(board, t, 'missing-feature-todo');
        counts.missingFeatureTodo[result] += 1;
      }

      normalizeBoard(board);
      sortBoardColumns(board);
      const totalTasks = Object.values(board.columns || {}).reduce((sum, col) => sum + ((col.tasks || []).length), 0);
      board.totalTasks = totalTasks;
      board.generatedAt = new Date().toISOString();
      board.lastMasterTodoMerge = {
        mergedAt: new Date().toISOString(),
        masterTodo: counts.masterTodo,
        featureLabel: counts.featureLabel,
        missingFeatureTodo: counts.missingFeatureTodo,
        sourceFiles: {
          featureLabelTasksPath: fs.existsSync(featureLabelTasksPath) ? path.relative(ROOT, featureLabelTasksPath).replace(/\\/g, '/') : null,
          missingFeatureTodosPath: fs.existsSync(missingFeatureTodosPath) ? path.relative(ROOT, missingFeatureTodosPath).replace(/\\/g, '/') : null,
        },
      };
      fs.mkdirSync(path.dirname(KANBAN_TARGET), { recursive: true });
      fs.writeFileSync(KANBAN_TARGET, JSON.stringify(board, null, 2), 'utf8');
      console.log(`  ✅ Merged kanban board into ${KANBAN_TARGET} (totalTasks=${totalTasks})`);
    }

    const report = {
      timestamp: new Date().toISOString(),
      sourceDocument: 'MASTER-FEATURE-TODO-2026-05-20.md',
      openItems: openItems.length,
      tasksGenerated: tasks.length,
      featureLabelTasks: featureLabelTasks.length,
      missingFeatureTodos: missingFeatureTodos.length,
      byStatus: tasks.reduce((acc, t) => ({ ...acc, [t.kanbanStatus]: (acc[t.kanbanStatus] || 0) + 1 }), {}),
      byPriority: tasks.reduce((acc, t) => ({ ...acc, [t.priority]: (acc[t.priority] || 0) + 1 }), {}),
      fileResolution: {
        allRefsResolved: reconciled.filter(r => r.fileStatuses.length > 0 && r.fileStatuses.every(f => f.exists)).length,
        someRefsMissing: reconciled.filter(r => r.fileStatuses.some(f => !f.exists)).length,
        noFileRefs: reconciled.filter(r => r.fileStatuses.length === 0).length,
      },
      supplementalInputs: {
        featureLabelTasksPath: fs.existsSync(featureLabelTasksPath) ? path.relative(ROOT, featureLabelTasksPath).replace(/\\/g, '/') : null,
        missingFeatureTodosPath: fs.existsSync(missingFeatureTodosPath) ? path.relative(ROOT, missingFeatureTodosPath).replace(/\\/g, '/') : null,
      },
    };
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), 'utf8');
    console.log(`  📝 Report    → ${REPORT}`);
  }

  console.log('\n══ Summary ═══════════════════════════════════════════════');
  console.log(`  Open items:       ${openItems.length}`);
  console.log(`  Tasks generated:  ${tasks.length}`);
  const byStatus = tasks.reduce((acc, t) => ({ ...acc, [t.kanbanStatus]: (acc[t.kanbanStatus] || 0) + 1 }), {});
  for (const [k, v] of Object.entries(byStatus)) console.log(`    ${k.padEnd(12)} ${v}`);
  if (!APPLY) console.log('\n  [DRY-RUN] Use --apply to write.');
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
