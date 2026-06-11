#!/usr/bin/env node
/**
 * audit-ignored-directories.mjs
 *
 * Read-only sweep for hidden / gitignored / stale doc surfaces that should be
 * promoted into the temporal kanban board.
 *
 * It uses `rg --files -uu` as the source inventory, then groups directories and
 * files into audit buckets so startup can seed kanban tasks from actual hidden
 * packet surfaces instead of relying on stale markdown notes.
 *
 * Outputs:
 *   docs/reports/ignored-directory-audit.json
 *   docs/reports/ignored-directory-audit.md
 *   sveltekit-frontend/.tmp/hidden_directory_tasks.jsonl
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const FRONTEND_ROOT = path.join(ROOT, 'sveltekit-frontend');

const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'ignored-directory-audit.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'ignored-directory-audit.md');
const TASKS_JSONL = path.join(FRONTEND_ROOT, '.tmp', 'hidden_directory_tasks.jsonl');

const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.log', '.jsonl', '.ndjson']);
const RG_EXCLUDES = [
  '-g', '!**/node_modules/**',
  '-g', '!**/.git/**',
  '-g', '!**/.svelte-kit/**',
  '-g', '!**/.vite/**',
  '-g', '!**/.venv/**',
  '-g', '!**/dist/**',
  '-g', '!**/build/**',
];

const FOCUS_SEGMENTS = [
  'atlas',
  'nes',
  'chrom',
  'chr97',
  'packet',
  'qdrant',
  'redis',
  'duckdb',
  'engram',
  'kanban',
  'temporal',
  'startup',
  'graphify',
  'opencode',
  'tmp',
];

const GENERATED_CACHE_PREFIXES = [
  '.opencode/cards',
  '.opencode/embeddings',
];

const STALE_MARKERS = [
  { id: 'p0_nothing_required', label: 'P0: Nothing Required', re: /P0:\s*Nothing Required/i },
  { id: 'production_ready', label: 'Production-ready', re: /Production-ready/i },
  { id: 'all_systems_operational', label: 'All systems operational', re: /All systems operational/i },
  { id: 'complete_implementation', label: 'Complete implementation', re: /Complete implementation/i },
  { id: 'active_master_todo', label: 'active master TODO', re: /active master TODO/i },
  { id: 'source_of_truth_workspace_root', label: 'Source of truth: workspace root', re: /Source of truth:\s*workspace root/i },
  { id: 'historical_snapshot', label: 'Historical snapshot', re: /Historical snapshot/i },
  { id: 'canonical_open_work_surface', label: 'canonical open-work surface', re: /canonical open-work surface/i },
];

function normalizeRelPath(relPath) {
  return String(relPath ?? '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function shortHash(input, len = 12) {
  const normalized = typeof input === 'string'
    ? input
    : JSON.stringify(input ?? '');
  return createHash('sha1').update(normalized).digest('hex').slice(0, len);
}

function slug(input) {
  return String(input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown';
}

function readTextPreview(filePath, maxBytes = 512000) {
  const stat = fs.statSync(filePath);
  const bytes = Math.min(stat.size, maxBytes);
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const readBytes = fs.readSync(fd, buffer, 0, bytes, 0);
    return buffer.subarray(0, readBytes).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function runRgFiles() {
  const result = spawnSync(
    'rg',
    ['--files', '-uu', ...RG_EXCLUDES],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 64,
    },
  );

  if (result.status !== 0 && !result.stdout) {
    throw new Error(result.stderr?.trim() || `rg --files failed with exit ${result.status ?? 1}`);
  }

  return String(result.stdout ?? '')
    .split(/\r?\n/)
    .map((line) => normalizeRelPath(line))
    .filter(Boolean);
}

function isTextArtifact(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || /\.(md|txt|json|log|jsonl|ndjson)(?:\.tmp.*)?$/i.test(relPath);
}

function isInterestingPath(relPath) {
  const normalized = normalizeRelPath(relPath).toLowerCase();
  const segments = normalized.split('/');
  const hasHiddenSegment = segments.some((segment) => segment.startsWith('.'));
  const hasFocusSegment = segments.some((segment) => FOCUS_SEGMENTS.some((focus) => segment.includes(focus)));
  const hasFocusPath = FOCUS_SEGMENTS.some((focus) => normalized.includes(focus));
  const isWorkSurface = normalized.startsWith('reports/') || normalized.startsWith('docs/') || normalized.startsWith('next_steps/') || normalized.startsWith('.tmp/') || normalized.startsWith('memory/') || normalized.startsWith('scripts/');
  return hasHiddenSegment || hasFocusSegment || hasFocusPath || isWorkSurface;
}

function fileKind(relPath) {
  const normalized = normalizeRelPath(relPath).toLowerCase();
  if (normalized.startsWith('.tmp/')) return 'hidden-packet';
  if (normalized.includes('kanban') || normalized.includes('task') || normalized.includes('todo')) return 'kanban-doc';
  if (normalized.includes('atlas') || normalized.includes('parent-atlas') || normalized.includes('feature')) return 'atlas-doc';
  if (normalized.includes('chr97') || normalized.includes('neschrom')) return 'chr97-surface';
  if (normalized.includes('qdrant') || normalized.includes('redis') || normalized.includes('duckdb')) return 'semantic-store';
  return 'doc';
}

function isGeneratedCacheSurface(relPath) {
  const normalized = normalizeRelPath(relPath).toLowerCase();
  return GENERATED_CACHE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function detectStaleMarkers(text) {
  const hits = [];
  for (const marker of STALE_MARKERS) {
    if (marker.re.test(text)) hits.push(marker.label);
  }
  return hits;
}

function getFileSnippet(text, maxChars = 320) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

function readMissingTodoIndex() {
  const candidates = [
    path.join(FRONTEND_ROOT, '.tmp', 'missing_feature_todos.jsonl'),
    path.join(ROOT, '.tmp', 'missing_feature_todos.jsonl'),
  ];

  const index = new Set();
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    for (const line of fs.readFileSync(candidate, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        const refs = [
          parsed.source_ref,
          parsed.sourceRef,
          ...(Array.isArray(parsed.sourceRefs) ? parsed.sourceRefs : []),
          parsed.feature_id,
          parsed.featureId,
          parsed.file_path,
          parsed.path,
          parsed.relative_path,
        ]
          .flat()
          .filter(Boolean)
          .map((value) => normalizeRelPath(value));
        for (const ref of refs) index.add(ref);
      } catch {
        // ignore malformed historical rows
      }
    }
  }

  return index;
}

function buildTaskId(prefix, payload) {
  return `${prefix}-${shortHash(payload, 12)}`;
}

function buildTaskFromDirectory(directorySummary) {
  const relDir = normalizeRelPath(directorySummary.directory_path);
  const featureSlug = slug(relDir || '.');
  const featureId = `temporal.${directorySummary.stale_file_count > 0 ? 'stale-doc-dir' : 'hidden-dir'}.${featureSlug}`;
  const title = directorySummary.stale_file_count > 0
    ? `Consolidate stale docs in ${relDir || '.'}`
    : `Review hidden directory ${relDir || '.'}`;
  const description = [
    relDir || '.',
    'Directory candidate from rg --files -uu sweep.',
    `files: ${directorySummary.file_count}`,
    `stale files: ${directorySummary.stale_file_count}`,
    `missing-todo hits: ${directorySummary.missing_todo_hits}`,
    `extensions: ${Object.entries(directorySummary.extensions || {}).map(([ext, count]) => `${ext || '(none)'}:${count}`).join(', ') || 'none'}`,
    `samples: ${directorySummary.sample_files.join(', ') || 'none'}`,
    `stale signals: ${directorySummary.stale_signals.join(', ') || 'none'}`,
  ].join('\n');

  return {
    taskId: buildTaskId(directorySummary.stale_file_count > 0 ? 'STALE_DIR' : 'HIDIR', {
      relDir,
      staleSignals: directorySummary.stale_signals,
      sampleFiles: directorySummary.sample_files,
      fileCount: directorySummary.file_count,
    }),
    featureKey: featureId,
    feature_id: featureId,
    feature: featureId,
    source_ref: `dir:${relDir || '.'}`,
    sourceRefs: [relDir || '.'],
    title,
    description,
    kanbanStatus: directorySummary.stale_file_count > 0 ? 'REVIEW' : 'BACKLOG',
    priority: directorySummary.stale_file_count > 0 ? 'MEDIUM' : 'LOW',
    status: 'hidden-directory-audit',
    directory_path: relDir || '.',
    file_path: directorySummary.sample_files[0] || relDir || '.',
    hiddenDirectory: true,
    staleMarkers: directorySummary.stale_signals || [],
    missingTodoHit: directorySummary.missing_todo_hits > 0,
    createdAt: new Date().toISOString(),
  };
}

function main() {
  const allFiles = runRgFiles();
  const candidateFiles = allFiles.filter((relPath) => isInterestingPath(relPath) && isTextArtifact(relPath));
  const missingTodoIndex = readMissingTodoIndex();

  const fileSummaries = [];
  const directoryMap = new Map();
  const taskRows = [];

  for (const relPath of candidateFiles) {
    const absPath = path.join(ROOT, relPath);
    if (!fs.existsSync(absPath) || fs.statSync(absPath).isDirectory()) continue;

    const stat = fs.statSync(absPath);
    const preview = readTextPreview(absPath);
    const staleMarkers = detectStaleMarkers(preview);
    const relDir = normalizeRelPath(path.dirname(relPath));
    const hiddenDirectory = relDir.split('/').some((segment) => segment.startsWith('.')) || /(?:neschrom|chr97)/i.test(relDir);
    const missingTodoHit = missingTodoIndex.has(relPath) || missingTodoIndex.has(`todo:${relPath}`) || missingTodoIndex.has(`dir:${relDir}`);

    const summary = {
      path: relPath,
      directory_path: relDir || '.',
      extension: path.extname(relPath).toLowerCase(),
      file_kind: fileKind(relPath),
      size: stat.size,
      hiddenDirectory,
      staleMarkers,
      missingTodoHit,
      sample: getFileSnippet(preview),
    };
    fileSummaries.push(summary);

    const dirKey = relDir || '.';
    const directory = directoryMap.get(dirKey) || {
      directory_path: dirKey,
      hiddenDirectory: dirKey.split('/').some((segment) => segment.startsWith('.')) || /(?:neschrom|chr97)/i.test(dirKey),
      file_count: 0,
      stale_file_count: 0,
      missing_todo_hits: 0,
      extensions: {},
      sample_files: [],
      stale_signals: [],
    };

    directory.file_count += 1;
    directory.extensions[summary.extension] = (directory.extensions[summary.extension] ?? 0) + 1;
    if (staleMarkers.length > 0) directory.stale_file_count += 1;
    if (missingTodoHit) directory.missing_todo_hits += 1;
    if (directory.sample_files.length < 5) directory.sample_files.push(relPath);
    for (const marker of staleMarkers) {
      if (!directory.stale_signals.includes(marker)) directory.stale_signals.push(marker);
    }
    directoryMap.set(dirKey, directory);

  }

  const directorySummaries = [...directoryMap.values()]
    .sort((a, b) => {
      if (b.stale_file_count !== a.stale_file_count) return b.stale_file_count - a.stale_file_count;
      if (b.hiddenDirectory !== a.hiddenDirectory) return Number(b.hiddenDirectory) - Number(a.hiddenDirectory);
      return a.directory_path.localeCompare(b.directory_path);
    });

  const hiddenDirectoryCount = directorySummaries.filter((directory) => directory.hiddenDirectory).length;
  const staleFileCount = fileSummaries.filter((file) => file.staleMarkers.length > 0).length;
  const missingTodoHitCount = fileSummaries.filter((file) => file.missingTodoHit).length;

  for (const directory of directorySummaries) {
    if (isGeneratedCacheSurface(directory.directory_path)) continue;
    if (!directory.hiddenDirectory && directory.stale_file_count === 0 && directory.missing_todo_hits === 0) continue;
    taskRows.push(buildTaskFromDirectory(directory));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    roots: [ROOT, FRONTEND_ROOT],
    rg: {
      command: ['rg', '--files', '-uu', ...RG_EXCLUDES].join(' '),
      excluded: ['**/node_modules/**', '**/.git/**', '**/.svelte-kit/**', '**/.vite/**', '**/.venv/**', '**/dist/**', '**/build/**'],
    },
    summary: {
      fileCount: fileSummaries.length,
      hiddenDirectoryCount,
      staleFileCount,
      missingTodoHitCount,
      taskCount: taskRows.length,
    },
    directories: directorySummaries,
    files: fileSummaries,
    staleMarkerCatalog: STALE_MARKERS.map((marker) => ({ id: marker.id, label: marker.label })),
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const md = [
    '# Ignored Directory Audit',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- files scanned: ${report.summary.fileCount}`,
    `- hidden directories: ${report.summary.hiddenDirectoryCount}`,
    `- stale docs: ${report.summary.staleFileCount}`,
    `- missing-todo hits: ${report.summary.missingTodoHitCount}`,
    `- task candidates: ${report.summary.taskCount}`,
    '',
    '## Hidden / Relevant Directories',
    '',
    ...directorySummaries.map((directory) => [
      `- ${directory.directory_path}`,
      `  - hidden: ${directory.hiddenDirectory ? 'yes' : 'no'}`,
      `  - generated cache: ${isGeneratedCacheSurface(directory.directory_path) ? 'yes' : 'no'}`,
      `  - files: ${directory.file_count}`,
      `  - stale files: ${directory.stale_file_count}`,
      `  - missing-todo hits: ${directory.missing_todo_hits}`,
      `  - extensions: ${Object.entries(directory.extensions).map(([ext, count]) => `${ext || '(none)'}:${count}`).join(', ') || 'none'}`,
      `  - samples: ${directory.sample_files.join(', ') || 'none'}`,
      `  - stale signals: ${directory.stale_signals.join(', ') || 'none'}`,
    ].join('\n')),
    '',
    '## Stale Doc Candidates',
    '',
    ...fileSummaries
      .filter((file) => file.staleMarkers.length > 0)
      .map((file) => `- ${file.path} :: ${file.staleMarkers.join(', ')}`),
    ...(fileSummaries.some((file) => file.staleMarkers.length > 0) ? [] : ['- none']),
    '',
    '## Next Repair Actions',
    '',
    '- Merge stale markdown task sources into the canonical temporal board.',
    '- Seed kanban tasks from hidden directory discovery on startup.',
    '- Keep source_ref and feature_id canonical for any derived task rows.',
    '- Avoid promoting hidden vendor trees or node_modules as app source.',
    '',
  ].join('\n');

  fs.writeFileSync(REPORT_MD, md, 'utf8');
  fs.mkdirSync(path.dirname(TASKS_JSONL), { recursive: true });
  fs.writeFileSync(TASKS_JSONL, `${taskRows.map((task) => JSON.stringify(task)).join('\n')}\n`, 'utf8');

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  console.log(`Wrote ${TASKS_JSONL}`);
}

main();
