#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeFeatureId,
  normalizeFeatureLabel,
  normalizePathLike,
  normalizeSourceRef,
  normalizeSourceRefs,
  readJsonlFile,
  relativeDisplay,
} from './audit-jsonl.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'hidden-packet-pathmap-report.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'hidden-packet-pathmap-report.md');

const INPUTS = {
  featureLabels: path.join(REPO_ROOT, '.tmp', 'feature_labels.jsonl'),
  kanbanTasks: path.join(REPO_ROOT, '.tmp', 'kanban_tasks.jsonl'),
  missingFeatureTodos: path.join(REPO_ROOT, '.tmp', 'missing_feature_todos.jsonl'),
  parentAtlasToc: path.join(REPO_ROOT, 'docs', 'atlas', 'parent-atlas-table-of-contents.md'),
  docFeatureCrosswalk: path.join(REPO_ROOT, 'docs', 'reports', 'doc-feature-crosswalk-2026-06-01.md'),
};

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function loadSurfaces() {
  const surfaces = Object.entries({
    featureLabels: INPUTS.featureLabels,
    kanbanTasks: INPUTS.kanbanTasks,
    missingFeatureTodos: INPUTS.missingFeatureTodos,
  }).map(([key, filePath]) => ({
    key,
    filePath,
    relPath: relativeDisplay(REPO_ROOT, filePath),
    ...readJsonlFile(filePath),
  }));

  const missingOptional = [
    INPUTS.parentAtlasToc,
    INPUTS.docFeatureCrosswalk,
  ]
    .filter((filePath) => !fs.existsSync(filePath))
    .map((filePath) => relativeDisplay(REPO_ROOT, filePath));

  return { surfaces, missingOptional };
}

function buildFeatureLabelMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const featureId = normalizeFeatureId(row);
    if (!featureId) continue;
    const label = normalizeFeatureLabel(row) ?? normalizePathLike(row.feature ?? row.featureKey ?? row.tags?.[0]);
    if (!map.has(featureId)) map.set(featureId, new Set());
    if (label) map.get(featureId).add(label);
  }
  return map;
}

function buildSourceRefMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const sourceRef = normalizeSourceRef(row);
    if (!sourceRef) continue;
    if (!map.has(sourceRef)) map.set(sourceRef, []);
    map.get(sourceRef).push(row);
  }
  return map;
}

function buildPathCandidates(rows) {
  const map = new Map();
  for (const row of rows) {
    const candidates = normalizeSourceRefs(row);
    for (const candidate of candidates) {
      const normalized = normalizePathLike(candidate);
      if (!normalized) continue;
      if (!map.has(normalized)) map.set(normalized, []);
      map.get(normalized).push(row);
    }
  }
  return map;
}

function summarizeSurface(surface) {
  const sourceRefRows = surface.rows.filter((row) => Boolean(normalizeSourceRef(row)));
  const featureIdRows = surface.rows.filter((row) => Boolean(normalizeFeatureId(row)));
  const featureLabelRows = surface.rows.filter((row) => Boolean(normalizeFeatureLabel(row)));
  const pathOnlyRows = surface.rows.filter((row) => !normalizeSourceRef(row) && normalizePathLike(row.path ?? row.file_path ?? row.relative_path));
  const taskIdRows = surface.rows.filter((row) => Boolean(row.task_id ?? row.taskId));
  const runIdRows = surface.rows.filter((row) => Boolean(row.run_id ?? row.runId));

  return {
    filePath: surface.relPath,
    exists: surface.exists,
    lineCount: surface.lineCount,
    validRows: surface.validRows,
    invalidRows: surface.invalidRows.length,
    keySamples: surface.keySamples,
    sourceRefRows: sourceRefRows.length,
    featureIdRows: featureIdRows.length,
    featureLabelRows: featureLabelRows.length,
    pathOnlyRows: pathOnlyRows.length,
    taskIdRows: taskIdRows.length,
    runIdRows: runIdRows.length,
    sourceRefCoveragePct: surface.validRows > 0 ? Number(((sourceRefRows.length / surface.validRows) * 100).toFixed(2)) : 0,
    featureIdCoveragePct: surface.validRows > 0 ? Number(((featureIdRows.length / surface.validRows) * 100).toFixed(2)) : 0,
    featureLabelCoveragePct: surface.validRows > 0 ? Number(((featureLabelRows.length / surface.validRows) * 100).toFixed(2)) : 0,
    pathOnlyExamples: pathOnlyRows.slice(0, 10).map((row) => ({
      lineNumber: row.__lineNumber,
      path: normalizePathLike(row.path ?? row.file_path ?? row.relative_path),
      featureId: normalizeFeatureId(row),
      title: normalizeFeatureLabel(row) ?? normalizePathLike(row.title ?? row.label),
    })),
    invalidExamples: surface.invalidRows.slice(0, 10),
  };
}

function buildReport() {
  const { surfaces, missingOptional } = loadSurfaces();
  const allRows = surfaces.flatMap((surface) => surface.rows.map((row) => ({ ...row, __surface: surface.key, __filePath: surface.relPath })));
  const featureLabelMap = buildFeatureLabelMap(allRows);
  const sourceRefMap = buildSourceRefMap(allRows);
  const pathCandidates = buildPathCandidates(allRows);

  const summaries = surfaces.map(summarizeSurface);
  const totalRows = summaries.reduce((sum, surface) => sum + surface.validRows, 0);
  const invalidRows = surfaces.flatMap((surface) => surface.invalidRows.map((row) => ({ surface: surface.key, ...row })));
  const rowsWithSourceRef = allRows.filter((row) => Boolean(normalizeSourceRef(row)));
  const rowsWithFeatureId = allRows.filter((row) => Boolean(normalizeFeatureId(row)));
  const rowsWithFeatureLabel = allRows.filter((row) => Boolean(normalizeFeatureLabel(row) ?? featureLabelMap.get(normalizeFeatureId(row) || '')?.size));
  const rowsWithTaskId = allRows.filter((row) => Boolean(row.task_id ?? row.taskId));
  const rowsWithRunId = allRows.filter((row) => Boolean(row.run_id ?? row.runId));
  const pathOnlyRows = allRows.filter((row) => !normalizeSourceRef(row) && normalizePathLike(row.path ?? row.file_path ?? row.relative_path));
  const missingFeatureIdTodos = surfaces.find((surface) => surface.key === 'missingFeatureTodos')?.rows ?? [];
  const kanbanRows = surfaces.find((surface) => surface.key === 'kanbanTasks')?.rows ?? [];
  const featureRows = surfaces.find((surface) => surface.key === 'featureLabels')?.rows ?? [];

  const surfaceKeys = Object.fromEntries(summaries.map((surface) => [surface.filePath, surface.validRows]));
  const sourceRefSamples = [...sourceRefMap.entries()].slice(0, 20).map(([sourceRef, rows]) => ({
    sourceRef,
    rowCount: rows.length,
    featureIds: [...new Set(rows.map((row) => normalizeFeatureId(row)).filter(Boolean))].slice(0, 8),
    featureLabels: [...new Set(rows.map((row) => normalizeFeatureLabel(row)).filter(Boolean))].slice(0, 8),
  }));

  const featureLabelCoverage = [...featureLabelMap.entries()].map(([featureId, labels]) => ({
    featureId,
    labels: [...labels].slice(0, 10),
    rowCount: allRows.filter((row) => normalizeFeatureId(row) === featureId).length,
  }));

  const kanbanJoins = kanbanRows.slice(0, 20).map((row) => {
    const featureId = normalizeFeatureId(row);
    const sourceRef = normalizeSourceRef(row);
    return {
      lineNumber: row.__lineNumber,
      taskId: row.task_id ?? row.taskId ?? null,
      featureId,
      sourceRef,
      featureLabels: featureId ? [...(featureLabelMap.get(featureId) ?? [])] : [],
      sourceRefJoinCount: sourceRef ? (sourceRefMap.get(sourceRef)?.length ?? 0) : 0,
    };
  });

  const missingFeatureTodosSummary = missingFeatureIdTodos.slice(0, 20).map((row) => ({
    lineNumber: row.__lineNumber,
    sourceRef: normalizeSourceRef(row),
    path: normalizePathLike(row.path ?? row.file_path ?? row.relative_path),
    featureId: normalizeFeatureId(row),
    title: normalizeFeatureLabel(row) ?? normalizePathLike(row.title ?? row.label),
  }));

  const crosswalkStatus = {
    parentAtlasTocExists: fs.existsSync(INPUTS.parentAtlasToc),
    docFeatureCrosswalkExists: fs.existsSync(INPUTS.docFeatureCrosswalk),
    parentAtlasToc: relativeDisplay(REPO_ROOT, INPUTS.parentAtlasToc),
    docFeatureCrosswalk: relativeDisplay(REPO_ROOT, INPUTS.docFeatureCrosswalk),
    note: missingOptional.length > 0
      ? `WARN: optional doc crosswalk inputs missing: ${missingOptional.join(', ')}`
      : 'OK: optional doc crosswalk inputs present',
  };

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      featureLabels: relativeDisplay(REPO_ROOT, INPUTS.featureLabels),
      kanbanTasks: relativeDisplay(REPO_ROOT, INPUTS.kanbanTasks),
      missingFeatureTodos: relativeDisplay(REPO_ROOT, INPUTS.missingFeatureTodos),
      parentAtlasToc: relativeDisplay(REPO_ROOT, INPUTS.parentAtlasToc),
      docFeatureCrosswalk: relativeDisplay(REPO_ROOT, INPUTS.docFeatureCrosswalk),
    },
    summary: {
      packetSurfaceCounts: summaries,
      totalRows,
      invalidRowCount: invalidRows.length,
      rowsWithSourceRef: rowsWithSourceRef.length,
      rowsWithFeatureId: rowsWithFeatureId.length,
      rowsWithFeatureLabel: rowsWithFeatureLabel.length,
      rowsWithTaskId: rowsWithTaskId.length,
      rowsWithRunId: rowsWithRunId.length,
      pathOnlyRows: pathOnlyRows.length,
      featureLabelCoverage: {
        rowsWithFeatureLabel: rowsWithFeatureLabel.length,
        pct: totalRows > 0 ? Number(((rowsWithFeatureLabel.length / totalRows) * 100).toFixed(2)) : 0,
      },
      sourceRefCoverage: {
        rowsWithSourceRef: rowsWithSourceRef.length,
        pct: totalRows > 0 ? Number(((rowsWithSourceRef.length / totalRows) * 100).toFixed(2)) : 0,
      },
      featureIdCoverage: {
        rowsWithFeatureId: rowsWithFeatureId.length,
        pct: totalRows > 0 ? Number(((rowsWithFeatureId.length / totalRows) * 100).toFixed(2)) : 0,
      },
      invalidRows,
      pathOnlyExamples: pathOnlyRows.slice(0, 20).map((row) => ({
        surface: row.__surface,
        lineNumber: row.__lineNumber,
        path: normalizePathLike(row.path ?? row.file_path ?? row.relative_path),
        sourceRef: normalizeSourceRef(row),
        featureId: normalizeFeatureId(row),
        featureLabel: normalizeFeatureLabel(row),
      })),
      featureLabelCoverageById: featureLabelCoverage.slice(0, 40),
      sourceRefJoins: sourceRefSamples,
      missingFeatureTodos: missingFeatureTodosSummary,
      kanbanTaskJoins: kanbanJoins,
      crosswalkStatus,
      pathCandidates: [...pathCandidates.entries()].slice(0, 20).map(([candidate, rows]) => ({
        candidate,
        rowCount: rows.length,
      })),
      nextRepairActions: [
        'Backfill feature_id for any path-only rows.',
        'Normalize source_ref to the packet join key before replay.',
        'Join kanban tasks and missing feature todos to feature labels by feature_id.',
        'Treat missing doc crosswalk inputs as warnings in this checkout.',
      ],
    },
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const md = [
    '# Hidden Packet Pathmap Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Packet Surface Counts',
    '',
    ...summaries.map((surface) => [
      `- ${surface.filePath}`,
      `  - line count: ${surface.lineCount}`,
      `  - valid rows: ${surface.validRows}`,
      `  - invalid rows: ${surface.invalidRows}`,
      `  - sourceRef coverage: ${surface.sourceRefCoveragePct}%`,
      `  - featureId coverage: ${surface.featureIdCoveragePct}%`,
      `  - featureLabel coverage: ${surface.featureLabelCoveragePct}%`,
    ].join('\n')),
    '',
    '## Invalid JSONL Rows',
    '',
    ...(invalidRows.length > 0
      ? invalidRows.map((row) => `- ${row.surface}:${row.lineNumber} - ${row.message}`)
      : ['- none']),
    '',
    '## Feature Label Coverage',
    '',
    `- rows with feature_label: ${report.summary.featureLabelCoverage.rowsWithFeatureLabel}`,
    `- coverage pct: ${report.summary.featureLabelCoverage.pct}%`,
    '',
    '## SourceRef Coverage',
    '',
    `- rows with sourceRef: ${report.summary.sourceRefCoverage.rowsWithSourceRef}`,
    `- coverage pct: ${report.summary.sourceRefCoverage.pct}%`,
    '',
    '## FeatureId Coverage',
    '',
    `- rows with featureId: ${report.summary.featureIdCoverage.rowsWithFeatureId}`,
    `- coverage pct: ${report.summary.featureIdCoverage.pct}%`,
    '',
    '## Path-Only Rows Needing source_ref',
    '',
    ...(report.summary.pathOnlyExamples.length > 0
      ? report.summary.pathOnlyExamples.map((row) => `- ${row.surface}:${row.lineNumber} path=${row.path ?? 'n/a'} featureId=${row.featureId ?? 'n/a'} featureLabel=${row.featureLabel ?? 'n/a'}`)
      : ['- none']),
    '',
    '## Missing FeatureId Todos',
    '',
    ...(report.summary.missingFeatureTodos.length > 0
      ? report.summary.missingFeatureTodos.map((row) => `- line ${row.lineNumber}: sourceRef=${row.sourceRef ?? 'n/a'} title=${row.title ?? 'n/a'}`)
      : ['- none']),
    '',
    '## Kanban Task Joins',
    '',
    ...(report.summary.kanbanTaskJoins.length > 0
      ? report.summary.kanbanTaskJoins.map((row) => `- line ${row.lineNumber}: task=${row.taskId ?? 'n/a'} featureId=${row.featureId ?? 'n/a'} sourceRef=${row.sourceRef ?? 'n/a'} labels=${row.featureLabels.join(', ') || 'none'}`)
      : ['- none']),
    '',
    '## Parent Atlas Doc Crosswalk Joins',
    '',
    `- TOC present: ${report.summary.crosswalkStatus.parentAtlasTocExists}`,
    `- doc-feature crosswalk present: ${report.summary.crosswalkStatus.docFeatureCrosswalkExists}`,
    `- note: ${report.summary.crosswalkStatus.note}`,
    '',
    '## Next Repair Actions',
    '',
    ...report.summary.nextRepairActions.map((item) => `- ${item}`),
    '',
  ].join('\n');

  fs.writeFileSync(REPORT_MD, md, 'utf8');

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
}

buildReport();
