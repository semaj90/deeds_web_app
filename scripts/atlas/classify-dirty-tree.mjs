#!/usr/bin/env node
/**
 * classify-dirty-tree.mjs
 *
 * Classify the current git dirty tree into:
 *   - intentional generated artifacts
 *   - source changes
 *   - untracked large blobs
 *   - submodule dirtiness
 *
 * The script is read-only. It writes a JSON + Markdown report that can be used
 * to decide archive/move actions after LangExtract summary promotion lands.
 */

import { statSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..', '..');
const REPORTS = resolve(ROOT, 'docs', 'reports');
const OUTPUT_JSON = resolve(REPORTS, 'repo-dirty-tree-classification-2026-06-01.json');
const OUTPUT_MD = resolve(REPORTS, 'repo-dirty-tree-classification-2026-06-01.md');

const GENERATED_ROOTS = [
  '.tmp/',
  '.cache/',
  '.opencode/',
  '.svelte-kit/',
  'docs/reports/',
  'sveltekit-frontend/docs/reports/',
  'sveltekit-frontend/docs/obsidian-vault/Files/',
  'sveltekit-frontend/docs/obsidian-vault/Indexes/',
  'sveltekit-frontend/memory/',
  'memory/exports/',
  'memory/graphify/',
  '.rag-metrics/',
  '.error-brain/',
  '.svelte-error-fixes-backup/',
  'sveltekit-frontend/tmp/',
  'sveltekit-frontend/.cache/',
  'sveltekit-frontend/.svelte-kit/',
];

const ACTIVE_NOTES = new Set([
  'docs/reports/phase-101-closeout.md',
  'docs/reports/phase-102-handoff.md',
  'docs/architecture/kanban-parent-atlas-alignment.md',
  'docs/architecture/scheduler-gpu-bridge-roadmap.md',
  'docs/reports/repo-consolidation-feature-map.md',
  'docs/reports/repo-consolidation-feature-map.json',
  'docs/reports/postgres-17-18-schema-audit.md',
  'docs/reports/postgres-17-18-schema-audit.json',
  'docs/reports/repo-dirty-tree-classification-2026-06-01.md',
  'docs/reports/repo-dirty-tree-classification-2026-06-01.json',
]);

const SOURCE_ROOTS = [
  'scripts/',
  'sveltekit-frontend/src/',
  'sveltekit-frontend/drizzle/',
  'sveltekit-frontend/src/routes/',
  'docs/architecture/',
  'docs/graph/',
  'docs/atlas/',
  'docs/reports/phase-',
  'docs/reports/repo-consolidation-feature-map',
  'docs/reports/postgres-17-18-schema-audit',
  'package.json',
  'opencode.json',
  'sveltekit-frontend/package.json',
  '.vscode/',
];

const LARGE_BLOB_PATTERNS = [
  /\.gguf$/i,
  /\.onnx$/i,
  /\.dump$/i,
  /\.tar$/i,
  /\.tar\.gz$/i,
  /\.zip$/i,
  /\.sqlite$/i,
  /\.msgpack$/i,
  /\.dll$/i,
  /\.so$/i,
  /\.lib$/i,
  /rg_turbovec\.txt$/i,
  /rg_napi\.txt$/i,
];

const SIZE_THRESHOLD_BYTES = 100 * 1024 * 1024;

function runGit(args) {
  const result = spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim();
    const stdout = String(result.stdout ?? '').trim();
    throw new Error(`git ${args.join(' ')} failed: ${stderr || stdout || `exit ${result.status}`}`);
  }
  return String(result.stdout ?? '').trim();
}

function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function safeStat(filePath) {
  try {
    return statSync(resolve(ROOT, filePath));
  } catch {
    return null;
  }
}

function fileSizeBytes(filePath) {
  const stats = safeStat(filePath);
  return stats ? stats.size : null;
}

function looksGenerated(filePath) {
  const normalized = normalizePath(filePath);
  return GENERATED_ROOTS.some((prefix) => normalized.startsWith(prefix)) ||
    normalized.endsWith('/LLMS.md') ||
    normalized.endsWith('.report.md') ||
    normalized.endsWith('.report.json') ||
    normalized.endsWith('summary.md') ||
    normalized.endsWith('summary.json') ||
    normalized.endsWith('.md.report');
}

function looksLikeSource(filePath) {
  const normalized = normalizePath(filePath);
  if (ACTIVE_NOTES.has(normalized)) return true;
  return SOURCE_ROOTS.some((prefix) => normalized.startsWith(prefix)) ||
    /(^|\/)(package\.json|opencode\.json|tsconfig\.json|CMakeLists\.txt)$/i.test(normalized) ||
    /\.(ts|tsx|js|mjs|cjs|json|svelte|sql|md|cypher|py|ipynb)$/i.test(normalized) && !looksGenerated(normalized);
}

function looksLargeBlob(filePath, statusCode, sizeBytes) {
  const normalized = normalizePath(filePath);
  if (sizeBytes != null && sizeBytes >= SIZE_THRESHOLD_BYTES) return true;
  if (LARGE_BLOB_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  if (statusCode === '??' && (
    normalized.startsWith('models/') ||
    normalized.startsWith('backups/') ||
    normalized.startsWith('offline-data/') ||
    normalized.startsWith('docker/langgraph-synthesis/.venv/') ||
    normalized.startsWith('sveltekit-frontend/tmp/') ||
    normalized.startsWith('sveltekit-frontend/.cache/')
  )) {
    return true;
  }
  return false;
}

function classifyEntry(entry, gitlinks) {
  const statusCode = entry.status;
  const path = normalizePath(entry.path);
  const sizeBytes = fileSizeBytes(path);
  const sizeGB = sizeBytes == null ? null : Number((sizeBytes / (1024 ** 3)).toFixed(2));
  const isGitlink = gitlinks.has(path);

  if (isGitlink && statusCode !== '??') {
    return {
      bucket: 'submoduleDirtiness',
      reason: 'gitlink modified in working tree',
    };
  }

  if (ACTIVE_NOTES.has(path)) {
    return {
      bucket: 'sourceChanges',
      reason: 'active completion note',
    };
  }

  if (looksLargeBlob(path, statusCode, sizeBytes)) {
    return {
      bucket: 'untrackedLargeBlobs',
      reason: sizeBytes != null && sizeBytes >= SIZE_THRESHOLD_BYTES
        ? `size=${sizeBytes} bytes`
        : 'pattern-matched large blob',
    };
  }

  if (looksGenerated(path)) {
    return {
      bucket: 'intentionalGeneratedArtifacts',
      reason: 'derived/generated surface',
    };
  }

  if (looksLikeSource(path)) {
    return {
      bucket: 'sourceChanges',
      reason: 'source or active-note surface',
    };
  }

  return {
    bucket: 'intentionalGeneratedArtifacts',
    reason: 'defaulted to generated/mirror surface',
  };
}

function parseGitStatus() {
  const out = runGit(['status', '--porcelain=v1', '-uall']);
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2);
      const rest = line.slice(3);
      if (status.startsWith('R')) {
        const [from, to] = rest.split(' -> ');
        return { status, path: normalizePath(to ?? from), originalPath: normalizePath(from ?? to) };
      }
      return { status, path: normalizePath(rest) };
    });
}

function getGitlinks() {
  const out = runGit(['ls-files', '--stage', 'turbovec', 'claude-mem']);
  const links = new Set();
  for (const line of out.split(/\r?\n/).filter(Boolean)) {
    const [mode, , , file] = line.split(/\s+/);
    if (mode === '160000' && file) links.add(normalizePath(file));
  }
  return links;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function summarizeEntries(entries, gitlinks) {
  const byBucket = {
    intentionalGeneratedArtifacts: [],
    sourceChanges: [],
    untrackedLargeBlobs: [],
    submoduleDirtiness: [],
  };

  for (const entry of entries) {
    const classified = classifyEntry(entry, gitlinks);
    const normalized = {
      status: entry.status,
      path: entry.path,
      originalPath: entry.originalPath ?? null,
      bucket: classified.bucket,
      reason: classified.reason,
      sizeBytes: fileSizeBytes(entry.path),
      sizeGB: fileSizeBytes(entry.path) == null ? null : Number((fileSizeBytes(entry.path) / (1024 ** 3)).toFixed(2)),
    };
    if (!byBucket[classified.bucket]) continue;
    byBucket[classified.bucket].push(normalized);
  }
  return byBucket;
}

function topExamples(items, limit = 20) {
  return items.slice(0, limit).map((item) => ({
    path: item.path,
    status: item.status,
    sizeGB: item.sizeGB,
    reason: item.reason,
    originalPath: item.originalPath ?? undefined,
  }));
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Repo Dirty Tree Classification');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Repo: ${report.repo}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Total dirty entries: ${report.summary.totalDirtyEntries}`);
  lines.push(`- Intentional generated artifacts: ${report.summary.counts.intentionalGeneratedArtifacts}`);
  lines.push(`- Source changes: ${report.summary.counts.sourceChanges}`);
  lines.push(`- Untracked large blobs: ${report.summary.counts.untrackedLargeBlobs}`);
  lines.push(`- Submodule dirtiness: ${report.summary.counts.submoduleDirtiness}`);
  lines.push('');
  lines.push('## Buckets');
  for (const [bucketName, bucket] of Object.entries(report.buckets)) {
    lines.push(`### ${bucketName}`);
    lines.push(`- Count: ${bucket.count}`);
    lines.push(`- Sample paths:`);
    for (const item of topExamples(bucket.items, 10)) {
      lines.push(`  - \`${item.path}\` (${item.status}${item.sizeGB != null ? `, ${item.sizeGB} GB` : ''}) - ${item.reason}`);
    }
    lines.push('');
  }
  lines.push('## Notes');
  lines.push('- Obsidian-vault mirrors remain derived indexing surfaces, not canonical sources.');
  lines.push('- LangExtract summarization should run before archive moves on generated evidence.');
  lines.push('- The dirty submodule is `turbovec`; `claude-mem` is a gitlink but not currently dirty.');
  lines.push('- Raw rg search dumps should be chunked into parent-atlas packets before archive decisions.');
  return lines.join('\n');
}

function main() {
  const gitlinks = getGitlinks();
  const entries = parseGitStatus();
  const classified = summarizeEntries(entries, gitlinks);
  const report = {
    generatedAt: new Date().toISOString(),
    repo: ROOT,
    summary: {
      totalDirtyEntries: entries.length,
      counts: {
        intentionalGeneratedArtifacts: classified.intentionalGeneratedArtifacts.length,
        sourceChanges: classified.sourceChanges.length,
        untrackedLargeBlobs: classified.untrackedLargeBlobs.length,
        submoduleDirtiness: classified.submoduleDirtiness.length,
      },
    },
    gitlinks: uniqueSorted([...gitlinks]),
    buckets: {
      intentionalGeneratedArtifacts: {
        count: classified.intentionalGeneratedArtifacts.length,
        items: classified.intentionalGeneratedArtifacts,
      },
      sourceChanges: {
        count: classified.sourceChanges.length,
        items: classified.sourceChanges,
      },
      untrackedLargeBlobs: {
        count: classified.untrackedLargeBlobs.length,
        items: classified.untrackedLargeBlobs,
      },
      submoduleDirtiness: {
        count: classified.submoduleDirtiness.length,
        items: classified.submoduleDirtiness,
      },
    },
    recommendedNextSteps: [
      'Summarize generated artifacts with LangExtract and parent atlas before moving any archive candidates.',
      'Keep source changes active until the completion notes reflect them.',
      'Chunk and stream rg_turbovec.txt and rg_napi.txt into parent-atlas packets, then archive the raw dumps.',
      'Treat Obsidian-vault mirrors as downstream indexing input only.',
    ],
  };

  const md = renderMarkdown(report);
  writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(OUTPUT_MD, md);

  console.log(`Wrote ${relative(ROOT, OUTPUT_JSON)}`);
  console.log(`Wrote ${relative(ROOT, OUTPUT_MD)}`);
  console.log(`Dirty entries: ${report.summary.totalDirtyEntries}`);
  console.log(`Generated artifacts: ${report.summary.counts.intentionalGeneratedArtifacts}`);
  console.log(`Source changes: ${report.summary.counts.sourceChanges}`);
  console.log(`Large blobs: ${report.summary.counts.untrackedLargeBlobs}`);
  console.log(`Submodule dirtiness: ${report.summary.counts.submoduleDirtiness}`);
}

main();
