import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, open, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportRelativePath = 'docs/reports/openspec-evidence-disposition-v1.json';
const handoffRelativePath = 'docs/reports/openspec-evidence-disposition-20261003.md';
const reportRelativePathArg = process.argv[2] ?? reportRelativePath;
const outputPath = path.resolve(root, reportRelativePathArg);
const sizeLimitBytes = 10_000_000;
const excludedPaths = new Set([
  reportRelativePath,
  handoffRelativePath,
  'docs/reports/openspec-evidence/README.md',
]);

function gitLines(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split(/\r?\n/)
    .filter(Boolean);
}

function readTrackedPaths() {
  return new Set(gitLines(['ls-files', '--full-name', '--', 'docs/reports']));
}

function readStatusByPath() {
  const rows = gitLines([
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--ignored=matching',
    '--',
    'docs/reports',
  ]);
  return new Map(rows.map((row) => [row.slice(3), row.slice(0, 2).trim()]));
}

async function collectReportPaths() {
  const reportsRoot = path.join(root, 'docs', 'reports');
  const results = [];
  const topLevel = await readdir(reportsRoot, { withFileTypes: true });

  for (const entry of topLevel) {
    if (entry.isFile() && /^openspec-[^/]+$/.test(entry.name)) {
      results.push(`docs/reports/${entry.name}`);
    }
  }

  const evidenceRoot = path.join(reportsRoot, 'openspec-evidence');
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        results.push(path.relative(root, absolutePath).replaceAll(path.sep, '/'));
      }
    }
  }

  await walk(evidenceRoot);
  return results.filter((relativePath) => !excludedPaths.has(relativePath)).sort();
}

async function readMetadata(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const file = await open(absolutePath, 'r');
  try {
    const buffer = Buffer.alloc(64 * 1024);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const prefix = buffer.toString('utf8', 0, bytesRead);
    const value = (key) => prefix.match(new RegExp(`"${key}"\\s*:\\s*"([^"\\r\\n]{1,512})"`))?.[1] ?? null;
    return {
      schema: value('schema'),
      generatedAt: value('generatedAt'),
      sourceCommit: value('gitCommit'),
      workspaceRevision: value('workspaceRevision'),
      runId: value('runId'),
      pipelineId: value('pipelineId'),
      sourceRun: value('sourceRun'),
    };
  } finally {
    await file.close();
  }
}

async function checksum(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const before = await lstat(absolutePath);
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(absolutePath)) digest.update(chunk);
  const after = await lstat(absolutePath);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new Error(`File changed during inventory: ${relativePath}`);
  }
  return { digest: `sha256:${digest.digest('hex')}`, stat: after };
}

function getDisposition(relativePath, bytes) {
  const isRunScoped = relativePath.startsWith('docs/reports/openspec-evidence/');
  return {
    artifactClass: isRunScoped ? 'RAW_OR_INTERMEDIATE_EVIDENCE' : 'DERIVED_OPENSPEC_REPORT',
    disposition: 'RETAIN_LOCAL',
    reason: isRunScoped
      ? 'Run-scoped evidence is preserved at its current path; replay, complete content review, and sensitivity review were not performed.'
      : 'Derived report is preserved at its current path until its producer, source revision, complete content, and sensitivity are reviewed.',
    proposedDestination: relativePath,
    repeatability: isRunScoped
      ? 'RUN_SCOPED_OUTPUT_NOT_REPLAYED'
      : 'PRODUCER_AND_REPLAY_NOT_CONFIRMED',
    durability: isRunScoped ? 'RAW_OR_INTERMEDIATE' : 'DERIVED_SNAPSHOT_CANDIDATE',
    sensitivity: 'NOT_ASSESSED_CONTENT_MAY_INCLUDE_SOURCE_EXCERPTS',
    over10MB: bytes > sizeLimitBytes,
  };
}

const trackedPaths = readTrackedPaths();
const statusByPath = readStatusByPath();
const currentHead = gitLines(['rev-parse', 'HEAD'])[0];
const reportPaths = await collectReportPaths();
const files = [];
let totalBytes = 0;

for (let index = 0; index < reportPaths.length; index += 1) {
  const relativePath = reportPaths[index];
  const absolutePath = path.join(root, relativePath);
  const initialStat = await lstat(absolutePath);
  if (!initialStat.isFile()) continue;

  const metadata = await readMetadata(relativePath);
  const result = await checksum(relativePath);
  let gitStatus = statusByPath.get(relativePath);
  if (!gitStatus) {
    const parentStatuses = [...statusByPath]
      .filter(([statusPath]) => relativePath.startsWith(`${statusPath.replace(/\/$/, '')}/`))
      .sort(([left], [right]) => right.length - left.length);
    gitStatus = parentStatuses[0]?.[1] ?? (trackedPaths.has(relativePath) ? 'CLEAN' : 'UNREPORTED');
  }
  const runDirectory = relativePath.match(/^docs\/reports\/openspec-evidence\/([^/]+)\//)?.[1] ?? null;

  files.push({
    path: relativePath,
    bytes: result.stat.size,
    modifiedAt: result.stat.mtime.toISOString(),
    sha256: result.digest,
    gitStatus,
    tracked: trackedPaths.has(relativePath),
    sourceRun: runDirectory ?? metadata.sourceRun ?? metadata.pipelineId ?? metadata.runId,
    metadata,
    sourceRevisionDiffersFromAuditHead: metadata.sourceCommit
      ? metadata.sourceCommit !== currentHead
      : null,
    ...getDisposition(relativePath, result.stat.size),
  });
  totalBytes += result.stat.size;

  if ((index + 1) % 50 === 0 || index + 1 === reportPaths.length) {
    process.stderr.write(
      `OpenSpec report inventory: ${index + 1}/${reportPaths.length} files, ${Math.round(totalBytes / 1024 ** 3)} GiB hashed\n`
    );
  }
}

const statusCounts = Object.fromEntries(
  [...new Set(files.map((file) => file.gitStatus))].sort().map((status) => [
    status,
    files.filter((file) => file.gitStatus === status).length,
  ])
);
const duplicateGroups = new Map();
for (const file of files) {
  const paths = duplicateGroups.get(file.sha256) ?? [];
  paths.push(file.path);
  duplicateGroups.set(file.sha256, paths);
}
const duplicates = [...duplicateGroups.values()].filter((paths) => paths.length > 1);
const report = {
  schema: 'atlas.openspec-report-disposition.v1',
  generatedAt: new Date().toISOString(),
  auditHead: currentHead,
  scope: [
    'all files under docs/reports/openspec-evidence/',
    'top-level docs/reports/openspec-* files',
  ],
  method: {
    checksum: 'SHA-256 streamed over every complete file',
    metadata: 'first 64 KiB only; full report contents were not parsed or reviewed',
    sizeLimitBytes,
    noFilesMovedOrDeleted: true,
  },
  summary: {
    fileCount: files.length,
    totalBytes,
    over10MBCount: files.filter((file) => file.over10MB).length,
    uniqueChecksumCount: duplicateGroups.size,
    duplicateChecksumGroupCount: duplicates.length,
    duplicateFileCount: duplicates.reduce((count, paths) => count + paths.length, 0),
    trackedCount: files.filter((file) => file.tracked).length,
    untrackedCount: files.filter((file) => file.gitStatus === '??').length,
    ignoredCount: files.filter((file) => file.gitStatus === '!!').length,
    modifiedTrackedCount: files.filter((file) => file.tracked && file.gitStatus !== 'CLEAN').length,
    statusCounts,
    dispositionCounts: { RETAIN_LOCAL: files.length },
    contentReview: 'NOT_PERFORMED; no source report is approved for promotion by this inventory alone',
  },
  duplicateChecksumGroups: duplicates,
  files,
  auditOutputs: [
    {
      path: reportRelativePath,
      disposition: 'PROMOTE',
      reason: 'Checksummed disposition inventory; small, reproducible audit metadata and no copied source excerpts.',
    },
    {
      path: handoffRelativePath,
      disposition: 'PROMOTE',
      reason: 'Human-readable summary of the inventory and the next review gates.',
    },
    {
      path: 'docs/reports/openspec-evidence/README.md',
      disposition: 'PROMOTE',
      reason: 'Curated report index documents evidence authority, limits, and the safe refresh command.',
    },
    {
      path: 'scripts/atlas/audit-openspec-report-disposition-v1.mjs',
      disposition: 'PROMOTE',
      reason: 'Re-runnable inventory generator produces checksummed audit metadata without modifying source reports.',
    },
    {
      path: 'next_steps/10_3_26.md',
      disposition: 'PROMOTE',
      reason: 'Reusable audit prompt now records the verified checkpoint and remaining gates.',
    },
  ],
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(
  `Wrote ${path.relative(root, outputPath)}: ${files.length} files, ${totalBytes} bytes, ${report.summary.over10MBCount} over 10 MB\n`
);
