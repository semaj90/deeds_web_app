#!/usr/bin/env node
/**
 * audit-artifact-bloat.mjs
 *
 * Read-only classification of large generated artifacts and duplicates.
 * Produces a compact report for canonical retention vs cold-storage move.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFiles, REPO_ROOT, toPosixPath } from './_atlas-utils.mjs';
import { resolveAtlasPaths } from './lib/repo-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { frontendRoot: FRONTEND_ROOT } = resolveAtlasPaths(import.meta.url);
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const OUT_JSON = path.join(REPORTS_DIR, 'artifact-bloat-report.json');
const OUT_MD = path.join(REPORTS_DIR, 'artifact-bloat-report.md');
const JSON_OUT = process.argv.includes('--json');

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.svelte-kit',
  '.turbo',
  'dist',
  'build',
  'coverage',
  '.next',
  '.python311',
  '.venv',
  'venv',
  'env',
]);

const KIND_ORDER = [
  'raw_json',
  'ndjson',
  'msgpack',
  'duckdb',
  'parquet',
  'embedding_checkpoint',
  'som_checkpoint',
  'report',
  'duplicate',
];

function classifyKind(relPath, sizeBytes) {
  const lower = relPath.toLowerCase();
  const ext = path.extname(lower);

  if (lower.includes('/docs/reports/') || lower.includes('/reports/')) return 'report';
  if (lower.includes('checkpoint') || lower.includes('embeddinggemma') || lower.includes('model') && sizeBytes > 5 * 1024 * 1024) {
    if (lower.includes('som')) return 'som_checkpoint';
    return 'embedding_checkpoint';
  }
  if (ext === '.duckdb') return 'duckdb';
  if (ext === '.parquet') return 'parquet';
  if (ext === '.msgpack' || ext === '.mpack' || ext === '.mspack') return 'msgpack';
  if (ext === '.ndjson' || ext === '.jsonl') return 'ndjson';
  if (ext === '.json') return 'raw_json';
  return null;
}

function recommendAction(kind, sizeBytes, relPath, duplicate = false) {
  if (duplicate) return 'ignore_generated';
  const lower = relPath.toLowerCase();
  const sizeMB = sizeBytes / 1048576;
  if (kind === 'report') return 'keep_canonical';
  if (kind === 'duckdb' || kind === 'parquet' || kind === 'msgpack') {
    return sizeMB > 10 || lower.includes('.tmp/') ? 'move_cold' : 'keep_manifest_only';
  }
  if (kind === 'embedding_checkpoint' || kind === 'som_checkpoint') return 'move_cold';
  if (kind === 'ndjson' || kind === 'raw_json') {
    if (lower.includes('.tmp/') || lower.includes('/generated/') || lower.includes('/out/')) return sizeMB > 1 ? 'compress_zstd' : 'keep_manifest_only';
    return 'keep_canonical';
  }
  return 'keep_manifest_only';
}

async function fileSha256(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function main() {
  const startedAt = new Date().toISOString();
  const scanRoots = [
    'docs',
    'reports',
    '.tmp',
    'models',
    'turbovec',
    'granite-docling-258M',
    path.relative(REPO_ROOT, path.join(FRONTEND_ROOT, 'docs')).replace(/\\/g, '/'),
    path.relative(REPO_ROOT, path.join(FRONTEND_ROOT, '.tmp')).replace(/\\/g, '/'),
    path.relative(REPO_ROOT, path.join(FRONTEND_ROOT, 'tmp')).replace(/\\/g, '/'),
  ];

  const files = [];
  for (const root of scanRoots) {
    const absRoot = path.join(REPO_ROOT, root);
    collectFiles(absRoot, IGNORE_DIRS, () => true, files);
  }
  const artifactPaths = [];

  for (const filePath of files) {
    const relPath = toPosixPath(path.relative(REPO_ROOT, filePath));
    const statInfo = await stat(filePath);
    artifactPaths.push({
      absPath: filePath,
      relPath,
      sizeBytes: statInfo.size,
      kind: classifyKind(relPath, statInfo.size),
    });
  }

  artifactPaths.sort((a, b) => b.sizeBytes - a.sizeBytes || a.relPath.localeCompare(b.relPath));

  const withHashes = [];
  const hashGroups = new Map();
  const maxHashBytes = 50 * 1024 * 1024;

  for (const entry of artifactPaths) {
    let sha256 = null;
    if (entry.sizeBytes <= maxHashBytes) {
      try {
        sha256 = await fileSha256(entry.absPath);
      } catch {
        sha256 = null;
      }
    }
    const duplicate = sha256 ? hashGroups.has(sha256) : false;
    if (sha256 && !hashGroups.has(sha256)) hashGroups.set(sha256, []);
    if (sha256) hashGroups.get(sha256).push(entry.relPath);
    const kind = entry.kind ?? classifyKind(entry.relPath, entry.sizeBytes) ?? 'raw_json';
    withHashes.push({
      ...entry,
      sha256,
      duplicate,
      recommendation: recommendAction(kind, entry.sizeBytes, entry.relPath, duplicate),
      kind: duplicate ? 'duplicate' : kind,
    });
  }

  const summary = {
    totalFiles: withHashes.length,
    totalSizeMB: Number((withHashes.reduce((sum, item) => sum + item.sizeBytes, 0) / 1048576).toFixed(2)),
    byKind: Object.fromEntries(KIND_ORDER.map((kind) => [kind, withHashes.filter((item) => item.kind === kind).length])),
    duplicateFiles: withHashes.filter((item) => item.duplicate).length,
    largestFiles: withHashes.slice(0, 25).map((item) => ({
      path: item.relPath,
      kind: item.kind,
      sizeMB: Number((item.sizeBytes / 1048576).toFixed(2)),
      recommendation: item.recommendation,
    })),
  };

  const report = {
    generatedAt: startedAt,
    summary,
    artifacts: withHashes.map(({ absPath, ...rest }) => rest),
    duplicateGroups: [...hashGroups.entries()]
      .filter(([, paths]) => paths.length > 1)
      .map(([sha256, paths]) => ({ sha256, paths })),
  };

  await mkdir(REPORTS_DIR, { recursive: true });
  await writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(
    OUT_MD,
    [
      '# Artifact Bloat Audit',
      '',
      `Generated: ${startedAt}`,
      '',
      '## Summary',
      '',
      `- total files: ${summary.totalFiles}`,
      `- total size MB: ${summary.totalSizeMB}`,
      `- duplicate files: ${summary.duplicateFiles}`,
      '',
      '## By Kind',
      ...KIND_ORDER.map((kind) => `- ${kind}: ${summary.byKind[kind] ?? 0}`),
      '',
      '## Largest Files',
      '',
      '| Path | Kind | Size (MB) | Recommendation |',
      '|------|------|-----------|-----------------|',
      ...summary.largestFiles.map((item) => `| \`${item.path}\` | ${item.kind} | ${item.sizeMB} | ${item.recommendation} |`),
      '',
      '## Duplicate Groups',
      '',
      ...(report.duplicateGroups.length
        ? report.duplicateGroups.slice(0, 25).map((group) => `- ${group.sha256.slice(0, 12)}: ${group.paths.join(', ')}`)
        : ['- none']),
      '',
    ].join('\n'),
    'utf8',
  );

  if (JSON_OUT) {
    console.log(JSON.stringify({ ok: true, report }, null, 2));
  } else {
    console.log([
      'Artifact bloat audit complete.',
      `Files: ${summary.totalFiles}`,
      `SizeMB: ${summary.totalSizeMB}`,
      `Duplicate files: ${summary.duplicateFiles}`,
      `Report: ${toPosixPath(path.relative(REPO_ROOT, OUT_JSON))}`,
    ].join(' '));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
