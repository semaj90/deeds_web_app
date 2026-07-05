#!/usr/bin/env node
/**
 * Read-only hidden packet pathmap auditor.
 *
 * Converts the feature-labeling JSONL packet surfaces from visible artifacts
 * into a replay/join surface report. It does not mutate stores or inputs.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAtlasPaths } from './lib/repo-paths.mjs';

const { repoRoot: ROOT, frontendTmpRoot: FRONTEND_TMP_ROOT } = resolveAtlasPaths(import.meta.url);
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'hidden-packet-pathmap-report.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'hidden-packet-pathmap-report.md');
const PATHMAP = path.join(ROOT, 'docs', 'graph', 'missing-features-path-map.json');

const INPUTS = [
  {
    key: 'feature_labels',
    requestedPath: '.tmp/feature_labels.jsonl',
    fallbacks: [path.relative(ROOT, path.join(FRONTEND_TMP_ROOT, 'feature_labels.jsonl')).replace(/\\/g, '/')],
  },
  {
    key: 'kanban_tasks',
    requestedPath: '.tmp/kanban_tasks.jsonl',
    fallbacks: [path.relative(ROOT, path.join(FRONTEND_TMP_ROOT, 'kanban_tasks.jsonl')).replace(/\\/g, '/')],
  },
  {
    key: 'missing_feature_todos',
    requestedPath: '.tmp/missing_feature_todos.jsonl',
    fallbacks: [path.relative(ROOT, path.join(FRONTEND_TMP_ROOT, 'missing_feature_todos.jsonl')).replace(/\\/g, '/')],
  },
];

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function resolveInput(input) {
  const candidates = [input.requestedPath, ...input.fallbacks].map((p) => path.join(ROOT, p));
  const selected = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).size > 0) ?? null;
  return {
    ...input,
    requestedAbs: path.join(ROOT, input.requestedPath),
    selectedAbs: selected,
    selectedPath: selected ? rel(selected) : null,
    exists: Boolean(selected),
    usedFallback: selected ? rel(selected) !== input.requestedPath.replace(/\\/g, '/') : false,
    bytes: selected ? fs.statSync(selected).size : 0,
  };
}

function normalizePathLike(value) {
  return String(value ?? '')
    .trim()
    .replace(/^file:\/\/\/?/i, '')
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):\/Users\/james\/Videos\/deeds-web-app\//, '')
    .replace(/^(\.\.\/)+/, '')
    .replace(/^\.\/+/, '')
    .replace(/^sveltekit-frontend\//, '')
    .replace(/#line:/, '#L');
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined && String(item).trim() !== '');
  if (value === null || value === undefined || String(value).trim() === '') return [];
  return [value];
}

function extractSourceRefs(row) {
  const refs = [
    ...asArray(row.sourceRefs),
    ...asArray(row.source_ref),
    ...asArray(row.sourceRef),
    ...asArray(row.source),
  ];
  if (row.file) refs.push(row.file);
  if (row.path) refs.push(row.path);
  return [...new Set(refs.map(normalizePathLike).filter(Boolean))];
}

function extractFeatureIds(row) {
  const features = [
    ...asArray(row.feature_id),
    ...asArray(row.featureId),
    ...asArray(row.featureKey),
    ...asArray(row.feature),
    ...asArray(row.topFeature),
  ];
  if (Array.isArray(row.features)) {
    for (const feature of row.features) {
      if (typeof feature === 'string') features.push(feature);
      else if (feature?.name) features.push(feature.name);
      else if (feature?.feature_id) features.push(feature.feature_id);
    }
  }
  return [...new Set(features.map((feature) => String(feature).trim()).filter(Boolean))];
}

function extractStableIds(row) {
  return [
    ...asArray(row.id),
    ...asArray(row.task_id),
    ...asArray(row.packet_id),
    ...asArray(row.alias_id),
  ].map((id) => String(id).trim()).filter(Boolean);
}

function bucketForSourceRef(sourceRef, roots = []) {
  const normalized = normalizePathLike(sourceRef);
  for (const root of roots.map(normalizePathLike)) {
    if (root && normalized.startsWith(root)) return root;
  }
  if (normalized.startsWith('todo:')) return 'todo';
  if (normalized.startsWith('src/')) return 'src/';
  if (normalized.startsWith('scripts/')) return 'scripts/';
  if (normalized.startsWith('docs/')) return 'docs/';
  if (normalized.startsWith('.tmp/')) return '.tmp/';
  return normalized.split('/')[0] || 'unknown';
}

function auditFile(input, pathmap) {
  const resolved = resolveInput(input);
  const out = {
    key: input.key,
    requestedPath: input.requestedPath,
    selectedPath: resolved.selectedPath,
    exists: resolved.exists,
    usedFallback: resolved.usedFallback,
    bytes: resolved.bytes,
    rows: 0,
    invalidJson: 0,
    withStableId: 0,
    withSourceRef: 0,
    withFeatureId: 0,
    withSourceRefAndFeatureId: 0,
    uniqueStableIds: 0,
    uniqueSourceRefs: 0,
    uniqueFeatureIds: 0,
    duplicateStableIds: 0,
    sourceRefBuckets: {},
    topFeatures: [],
    samples: [],
    errors: [],
  };

  const stableIds = new Map();
  const sourceRefs = new Set();
  const featureIds = new Map();

  if (!resolved.selectedAbs) {
    out.errors.push(`No non-empty input found for ${input.requestedPath}`);
    return { summary: out, rows: [] };
  }

  const rows = [];
  const text = fs.readFileSync(resolved.selectedAbs, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch (err) {
      out.invalidJson += 1;
      if (out.errors.length < 10) out.errors.push(`line ${index + 1}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    out.rows += 1;
    const rowSourceRefs = extractSourceRefs(row);
    const rowFeatureIds = extractFeatureIds(row);
    const rowStableIds = extractStableIds(row);

    if (rowStableIds.length) out.withStableId += 1;
    if (rowSourceRefs.length) out.withSourceRef += 1;
    if (rowFeatureIds.length) out.withFeatureId += 1;
    if (rowSourceRefs.length && rowFeatureIds.length) out.withSourceRefAndFeatureId += 1;

    for (const id of rowStableIds) stableIds.set(id, (stableIds.get(id) ?? 0) + 1);
    for (const sourceRef of rowSourceRefs) {
      sourceRefs.add(sourceRef);
      const bucket = bucketForSourceRef(sourceRef, pathmap.roots ?? []);
      out.sourceRefBuckets[bucket] = (out.sourceRefBuckets[bucket] ?? 0) + 1;
    }
    for (const featureId of rowFeatureIds) featureIds.set(featureId, (featureIds.get(featureId) ?? 0) + 1);

    const compact = {
      line: index + 1,
      stableIds: rowStableIds.slice(0, 3),
      sourceRefs: rowSourceRefs.slice(0, 3),
      featureIds: rowFeatureIds.slice(0, 5),
      title: row.title ?? null,
    };
    rows.push(compact);
    if (out.samples.length < 5) out.samples.push(compact);
  }

  out.uniqueStableIds = stableIds.size;
  out.uniqueSourceRefs = sourceRefs.size;
  out.uniqueFeatureIds = featureIds.size;
  out.duplicateStableIds = [...stableIds.values()].filter((count) => count > 1).length;
  out.topFeatures = [...featureIds.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([feature_id, count]) => ({ feature_id, count }));

  return { summary: out, rows };
}

function computeJoins(audits) {
  const get = (key) => audits[key]?.rows ?? [];
  const labels = get('feature_labels');
  const kanban = get('kanban_tasks');
  const missing = get('missing_feature_todos');

  const labelByStableId = new Set(labels.flatMap((row) => row.stableIds));
  const labelBySourceFeature = new Set(labels.flatMap((row) => row.sourceRefs.flatMap((sourceRef) => row.featureIds.map((featureId) => `${sourceRef}::${featureId}`))));

  let kanbanStableIdMatches = 0;
  let kanbanSourceFeatureMatches = 0;
  for (const row of kanban) {
    if (row.stableIds.some((id) => labelByStableId.has(id))) kanbanStableIdMatches += 1;
    if (row.sourceRefs.some((sourceRef) => row.featureIds.some((featureId) => labelBySourceFeature.has(`${sourceRef}::${featureId}`)))) {
      kanbanSourceFeatureMatches += 1;
    }
  }

  const missingWithTodoSource = missing.filter((row) => row.sourceRefs.some((sourceRef) => sourceRef.startsWith('todo:'))).length;
  return {
    feature_labels_to_kanban_tasks: {
      kanbanRows: kanban.length,
      stableIdMatches: kanbanStableIdMatches,
      sourceFeatureMatches: kanbanSourceFeatureMatches,
    },
    missing_feature_todos: {
      rows: missing.length,
      withTodoSourceRef: missingWithTodoSource,
    },
  };
}

function renderMarkdown(report) {
  const lines = [
    '# Hidden Packet Pathmap Audit',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Inputs requested: ${report.inputs.length}`,
    `- Inputs resolved: ${report.summary.inputsResolved}/${report.inputs.length}`,
    `- Total rows: ${report.summary.totalRows}`,
    `- Invalid JSON rows: ${report.summary.invalidJson}`,
    `- Rows with sourceRef/path: ${report.summary.withSourceRef}`,
    `- Rows with feature_id/feature: ${report.summary.withFeatureId}`,
    `- Rows with both sourceRef and feature_id: ${report.summary.withSourceRefAndFeatureId}`,
    '',
    '## Inputs',
    '',
    '| key | requested | selected | rows | sourceRefs | featureIds | invalidJson | fallback |',
    '|---|---|---|---:|---:|---:|---:|---|',
  ];

  for (const input of report.inputs) {
    lines.push(`| ${input.key} | ${input.requestedPath} | ${input.selectedPath ?? 'missing'} | ${input.rows} | ${input.withSourceRef} | ${input.withFeatureId} | ${input.invalidJson} | ${input.usedFallback} |`);
  }

  lines.push('');
  lines.push('## Join Checks');
  lines.push('');
  lines.push(`- Kanban rows matched to feature labels by stable id: ${report.joins.feature_labels_to_kanban_tasks.stableIdMatches}/${report.joins.feature_labels_to_kanban_tasks.kanbanRows}`);
  lines.push(`- Kanban rows matched to feature labels by sourceRef + feature: ${report.joins.feature_labels_to_kanban_tasks.sourceFeatureMatches}/${report.joins.feature_labels_to_kanban_tasks.kanbanRows}`);
  lines.push(`- Missing-feature todo rows with todo: sourceRef: ${report.joins.missing_feature_todos.withTodoSourceRef}/${report.joins.missing_feature_todos.rows}`);
  lines.push('');
  lines.push('## Pathmap Contract');
  lines.push('');
  lines.push(`- Pathmap: ${report.pathmap.path}`);
  lines.push(`- Roots: ${report.pathmap.roots.join(', ') || 'none'}`);
  lines.push(`- Field alignment: ${Object.entries(report.pathmap.fieldAlignment).map(([k, v]) => `${k}=${v}`).join('; ') || 'none'}`);
  lines.push('');
  lines.push('## Top Features By Input');
  lines.push('');
  for (const input of report.inputs) {
    lines.push(`### ${input.key}`);
    if (!input.topFeatures.length) {
      lines.push('');
      lines.push('_No feature ids detected._');
      lines.push('');
      continue;
    }
    lines.push('');
    lines.push('| feature_id | count |');
    lines.push('|---|---:|');
    for (const row of input.topFeatures.slice(0, 10)) lines.push(`| ${row.feature_id} | ${row.count} |`);
    lines.push('');
  }

  lines.push('## Notes');
  lines.push('');
  lines.push('- This audit is read-only. It does not mutate Postgres, Qdrant, Redis, Neo4j, DuckDB, or packet files.');
  lines.push('- Root `.tmp` inputs are preferred. `sveltekit-frontend/.tmp` is used only when the requested root file is missing or empty.');
  lines.push('- This turns hidden feature-labeling JSONL artifacts into a visible replay/join report for DuckDB mapreduce and Parent Atlas traversal.');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const pathmap = readJson(PATHMAP, { roots: [], fieldAlignment: {} });
  const audits = {};
  for (const input of INPUTS) audits[input.key] = auditFile(input, pathmap);

  const inputs = INPUTS.map((input) => audits[input.key].summary);
  const summary = inputs.reduce((acc, input) => {
    acc.inputsResolved += input.exists ? 1 : 0;
    acc.totalRows += input.rows;
    acc.invalidJson += input.invalidJson;
    acc.withSourceRef += input.withSourceRef;
    acc.withFeatureId += input.withFeatureId;
    acc.withSourceRefAndFeatureId += input.withSourceRefAndFeatureId;
    return acc;
  }, {
    inputsResolved: 0,
    totalRows: 0,
    invalidJson: 0,
    withSourceRef: 0,
    withFeatureId: 0,
    withSourceRefAndFeatureId: 0,
  });

  const report = {
    schema: 'hidden_packet_pathmap_audit.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    inputs,
    summary,
    joins: computeJoins(audits),
    pathmap: {
      path: rel(PATHMAP),
      exists: fs.existsSync(PATHMAP),
      roots: pathmap.roots ?? [],
      fieldAlignment: pathmap.fieldAlignment ?? {},
      targets: pathmap.targets ?? [],
    },
  };

  await fsp.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fsp.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  await fsp.writeFile(REPORT_MD, renderMarkdown(report), 'utf8');

  console.log('Hidden packet pathmap report written:');
  console.log(`  ${REPORT_JSON}`);
  console.log(`  ${REPORT_MD}`);
  console.log(`Inputs resolved: ${report.summary.inputsResolved}/${report.inputs.length}`);
  console.log(`Total rows: ${report.summary.totalRows}`);
  console.log(`Rows with sourceRef/path + feature_id: ${report.summary.withSourceRefAndFeatureId}`);
}

main().catch((err) => {
  console.error('[hidden-packet-pathmap] fatal:', err);
  process.exit(1);
});
