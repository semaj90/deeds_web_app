#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

function sha1(input) {
  return crypto.createHash('sha1').update(String(input ?? '')).digest('hex');
}

function slugify(input) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[`"'()[\]{}]/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'unknown';
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeJsonl(filePath, rows) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(
    filePath,
    `${rows.map((row) => JSON.stringify(row)).join('\n')}${rows.length ? '\n' : ''}`,
    'utf8'
  );
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractInlineRefs(text) {
  const refs = [];
  const backtickMatches = [...String(text ?? '').matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  for (const match of backtickMatches) {
    const trimmed = match.trim();
    if (/^(src|scripts|docs|memory|sveltekit-frontend)[\\/]/i.test(trimmed) || /[\\/].+\.(?:ts|js|mjs|md|json|svelte)$/i.test(trimmed)) {
      refs.push(trimmed.replace(/\\/g, '/'));
    }
  }
  return uniq(refs);
}

function deriveTodoSourceRefs(filePath, lineNumber, lineText) {
  const inlineRefs = extractInlineRefs(lineText);
  if (inlineRefs.length > 0) return inlineRefs;
  return [`todo:${filePath}#line:${lineNumber}`];
}

function deriveFeatureId(prefix, sourceRef, body) {
  return `${prefix}:${sha1(`${sourceRef}|${body}`).slice(0, 24)}`;
}

function deriveFeatureKey(text, sourceRefs) {
  const explicitPath = sourceRefs.find((value) => /[\\/]/.test(value) || value.startsWith('todo:'));
  if (explicitPath) return slugify(explicitPath.split('#')[0]);
  return slugify(text.split(/\s+/).slice(0, 6).join(' '));
}

function parseTodoLines(markdownPath, sourceTag) {
  const raw = readText(markdownPath);
  if (!raw) return [];
  const rows = [];
  let section = '';
  raw.split(/\r?\n/).forEach((line, index) => {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      section = heading[2].trim();
      return;
    }
    const todo = line.match(/^\s*[-*]\s+\[\s?\]\s+(.*)$/);
    if (!todo) return;
    const body = todo[1].trim();
    const sourceRefs = deriveTodoSourceRefs(markdownPath, index + 1, body);
    const sourceRef = sourceRefs[0];
    const featureId = deriveFeatureId('feature:todo', sourceRef, body);
    const featureKey = deriveFeatureKey(body, sourceRefs);
    rows.push({
      task_id: `kanban-${sha1(`${markdownPath}:${index + 1}:${body}`).slice(0, 12)}`,
      feature_id: featureId,
      featureKey,
      feature: featureKey,
      source_ref: sourceRef,
      sourceRefs,
      title: body.slice(0, 160),
      description: body,
      section,
      status: 'todo',
      source: sourceTag,
      line_number: index + 1,
    });
  });
  return rows;
}

function synthesizeInventoryLabels(invPath, limit) {
  const rows = [];
  const raw = readText(invPath);
  if (!raw) return rows;
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      const href = obj.path || obj.file || obj.source || (obj.source_ref && obj.source_ref.path) || obj.name || '';
      const pathRef = String(href || '').replace(/\\/g, '/');
      const body = JSON.stringify(obj);
      const featureId = deriveFeatureId('feature:file', pathRef || `row:${index + 1}`, body);
      const featureKey = deriveFeatureKey(pathRef || obj.title || obj.name || `row-${index + 1}`, [pathRef || `inventory:${index + 1}`]);
      const labels = uniq([
        ...(Array.isArray(obj.tags) ? obj.tags : []),
        featureKey,
      ]).slice(0, 24);
      rows.push({
        id: featureId,
        feature_id: featureId,
        featureKey,
        path: pathRef,
        source_ref: pathRef ? `local:${pathRef}` : `inventory:${index + 1}`,
        sourceRefs: pathRef ? [`local:${pathRef}`] : [`inventory:${index + 1}`],
        label: featureKey,
        tags: labels,
        source: 'inventory',
      });
      if (rows.length >= limit) break;
    } catch {
      continue;
    }
  }
  return rows;
}

async function main() {
  const argv = process.argv.slice(2);
  const limitIndex = argv.indexOf('--limit');
  let limit = 1000;
  if (limitIndex !== -1 && argv[limitIndex + 1]) {
    limit = parseInt(argv[limitIndex + 1], 10) || limit;
  } else {
    const inline = argv.find((arg) => arg.startsWith('--limit='));
    if (inline) limit = parseInt(inline.slice('--limit='.length), 10) || limit;
  }
  if (limit <= 0) limit = Infinity;

  const cwd = process.cwd();
  const root = path.resolve(cwd, '..');
  const outDir = path.join(cwd, '.tmp');
  const reportsDir = path.join(cwd, 'docs', 'reports');
  ensureDir(outDir);
  ensureDir(reportsDir);

  const featureLabelsOut = path.join(outDir, 'feature_labels.jsonl');
  const kanbanTasksOut = path.join(outDir, 'kanban_tasks.jsonl');
  const missingTodosOut = path.join(outDir, 'missing_feature_todos.jsonl');

  const todoCandidates = [
    path.join(root, 'MASTER-FEATURE-TODO-2026-05-20.md'),
    path.join(root, 'docs', 'architecture', 'kanban-parent-atlas-alignment.md'),
  ];
  const todoRows = todoCandidates.flatMap((candidate) => (fs.existsSync(candidate) ? parseTodoLines(candidate, path.relative(cwd, candidate).replace(/\\/g, '/')) : []));

  const inventoryCandidates = [
    path.join(cwd, '.tmp', 'ingest', 'atlas-data-files.jsonl'),
    path.join(cwd, '.tmp', 'atlas-data-files.jsonl'),
    path.join(root, '.tmp', 'atlas-data-files.jsonl'),
    path.join(root, '.tmp', 'feature_labels.ndjson'),
  ];

  const inventoryRows = [];
  for (const candidate of inventoryCandidates) {
    if (!fs.existsSync(candidate)) continue;
    inventoryRows.push(...synthesizeInventoryLabels(candidate, Number.isFinite(limit) ? limit : 1000));
    if (inventoryRows.length >= limit) break;
  }

  const todoLabels = todoRows.map((row) => ({
    id: row.feature_id,
    feature_id: row.feature_id,
    featureKey: row.featureKey,
    feature: row.featureKey,
    path: row.source_ref,
    source_ref: row.source_ref,
    sourceRefs: row.sourceRefs,
    label: row.featureKey,
    tags: uniq([row.section, 'todo', row.featureKey].filter(Boolean)),
    source: row.source,
  }));
  const featureLabels = [...todoLabels, ...inventoryRows];
  const kanbanTasks = [...todoRows, ...inventoryRows.map((row) => ({
    task_id: `kanban-${String(row.feature_id).slice(0, 12)}`,
    feature_id: row.feature_id,
    featureKey: row.featureKey,
    feature: row.featureKey,
    source_ref: row.source_ref,
    sourceRefs: row.sourceRefs,
    title: `Label ${row.featureKey}`,
    description: row.path || row.label || row.featureKey,
    status: 'todo',
    source: 'inventory',
  }))];

  writeJsonl(featureLabelsOut, featureLabels);
  writeJsonl(kanbanTasksOut, kanbanTasks);
  writeJsonl(missingTodosOut, todoRows);

  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      inventoryCandidates: inventoryCandidates.filter((candidate) => fs.existsSync(candidate)),
      todoCandidates: todoCandidates.filter((candidate) => fs.existsSync(candidate)),
    },
    counts: {
      featureLabels: featureLabels.length,
      kanbanTasks: kanbanTasks.length,
      missingTodos: todoRows.length,
      todoLabels: todoLabels.length,
      inventoryLabels: inventoryRows.length,
    },
    samples: {
      todo: todoRows.slice(0, 10),
      labels: featureLabels.slice(0, 10),
    },
    note: 'Parent Atlas feature labeling now emits todo-derived tasks with feature_id and sourceRefs for replayable joins.',
  };

  const jsonPath = path.join(reportsDir, 'feature-labelling-parent-atlas-report.json');
  const mdPath = path.join(reportsDir, 'feature-labelling-parent-atlas-report.md');
  writeJson(jsonPath, report);
  writeText(mdPath, [
    '# Feature Labelling Parent Atlas Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Feature labels: ${report.counts.featureLabels}`,
    `Kanban tasks: ${report.counts.kanbanTasks}`,
    `Missing todos: ${report.counts.missingTodos}`,
    '',
    '## Todo candidates',
    ...report.source.todoCandidates.map((candidate) => `- ${candidate}`),
    '',
    '## Inventory candidates',
    ...report.source.inventoryCandidates.map((candidate) => `- ${candidate}`),
    '',
    '## Missing todo samples',
    ...report.samples.todo.map((row) => `- ${row.feature_id} | ${row.source_ref} | ${row.title}`),
  ].join('\n'));

  console.log(JSON.stringify({
    ok: true,
    counts: report.counts,
    report: { jsonPath, mdPath },
    outputs: {
      featureLabelsOut,
      kanbanTasksOut,
      missingTodosOut,
    },
  }, null, 2));
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value, 'utf8');
}

main().catch((error) => {
  console.error(`[feature_labelling] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
