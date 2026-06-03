#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPORTS = path.join(ROOT, 'docs', 'reports');
const TMP = path.join(ROOT, '.tmp');

const JOIN_REPORT_PATH = path.join(REPORTS, 'sourceRef-parent-join-dry-run.json');
const DIRTY_CLASSIFICATION_PATH = path.join(REPORTS, 'repo-dirty-tree-classification-2026-06-01.json');
const ARCHIVE_PLAN_PATH = path.join(REPORTS, 'sourceRef-parent-join-archive-plan.json');
const ARCHIVE_PLAN_MD_PATH = path.join(REPORTS, 'sourceRef-parent-join-archive-plan.md');

const ACTIVE_NOTES = new Set([
  'docs/reports/phase-101-closeout.md',
  'docs/reports/phase-102-handoff.md',
  'docs/architecture/kanban-parent-atlas-alignment.md',
  'docs/architecture/scheduler-gpu-bridge-roadmap.md',
  'docs/architecture/cold-warm-hot-packet-lifecycle.md',
  'docs/reports/sourceRef-parent-join-dry-run.json',
  'docs/reports/sourceRef-parent-join-dry-run.md',
  'docs/reports/sourceRef-parent-join-archive-plan.json',
  'docs/reports/sourceRef-parent-join-archive-plan.md',
  'docs/reports/sourceRef-atlas-join-inventory.json',
  'docs/reports/sourceRef-atlas-join-inventory.md',
  'docs/reports/repo-consolidation-feature-map.json',
  'docs/reports/repo-consolidation-feature-map.md',
  'docs/reports/repo-dirty-tree-classification-2026-06-01.json',
  'docs/reports/repo-dirty-tree-classification-2026-06-01.md',
]);

const INDEX_SURFACES = [
  'memory/exports/parent-atlas/',
  '.tmp/parent_atlas_packets/',
  'sveltekit-frontend/docs/obsidian-vault/Files/',
  'docs/graph/',
  'docs/atlas/',
];

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/').trim();
}

function relativePath(value) {
  const normalized = normalizePath(value);
  return normalized.startsWith(normalizePath(ROOT)) ? path.relative(ROOT, normalized).replace(/\\/g, '/') : normalized;
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function isActiveNote(candidate) {
  return ACTIVE_NOTES.has(normalizePath(candidate));
}

function isIndexSurface(candidate) {
  const normalized = normalizePath(candidate);
  return INDEX_SURFACES.some((prefix) => normalized.startsWith(prefix));
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# SourceRef Parent Join Archive Plan');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Mode: ${report.mode}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- packet manifests: ${report.summary.packetManifests}`);
  lines.push(`- sourceRef clusters: ${report.summary.sourceRefClusters}`);
  lines.push(`- path packets: ${report.summary.pathPackets}`);
  lines.push(`- archive candidates: ${report.summary.archiveCandidates}`);
  lines.push(`- keep active: ${report.summary.keepActive}`);
  lines.push(`- keep as index surface: ${report.summary.keepAsIndexSurface}`);
  lines.push('');
  lines.push('## Keep Active');
  for (const row of report.keepActive) {
    lines.push(`- ${row}`);
  }
  if (report.keepActive.length === 0) lines.push('- none');
  lines.push('');
  lines.push('## Keep as Index Surface');
  for (const row of report.keepAsIndexSurface) {
    lines.push(`- ${row}`);
  }
  if (report.keepAsIndexSurface.length === 0) lines.push('- none');
  lines.push('');
  lines.push('## Archive Candidates');
  for (const row of report.archiveCandidates) {
    lines.push(`- ${row}`);
  }
  if (report.archiveCandidates.length === 0) lines.push('- none');
  lines.push('');
  lines.push('## Notes');
  for (const note of report.notes) {
    lines.push(`- ${note}`);
  }
  lines.push('');
  lines.push('## Move Order');
  for (const step of report.moveOrder) {
    lines.push(`- ${step}`);
  }
  lines.push('');
  return lines.join('\n');
}

function buildArchiveCandidates(joinReport, dirtyReport) {
  const packetOutputs = unique([
    ...(joinReport?.top?.sourceRefClusters ?? []).flatMap((row) => [
      ...((row.sourceRefs ?? []).slice(0, 3)),
      ...((row.coldOriginals ?? []).slice(0, 3)),
    ]),
    ...(joinReport?.top?.pathPackets ?? []).flatMap((row) => [
      ...((row.sourceRefs ?? []).slice(0, 3)),
      ...((row.coldOriginals ?? []).slice(0, 3)),
    ]),
  ]);

  const dirtyGenerated = Array.isArray(dirtyReport?.buckets?.intentionalGeneratedArtifacts?.items)
    ? dirtyReport.buckets.intentionalGeneratedArtifacts.items.map((item) => normalizePath(item.path))
    : [];

  const summarizeThenArchive = unique([
    ...dirtyGenerated.filter((item) => !isActiveNote(item) && !isIndexSurface(item)),
    ...packetOutputs.filter((item) => !isIndexSurface(item)),
  ]);

  const keepAsIndexSurface = unique([
    ...packetOutputs.filter((item) => isIndexSurface(item)),
    'docs/reports/sourceRef-parent-join-dry-run.json',
    'docs/reports/sourceRef-parent-join-dry-run.md',
    'docs/reports/sourceRef-parent-join-archive-plan.json',
    'docs/reports/sourceRef-parent-join-archive-plan.md',
  ]);

  const keepActive = unique([
    'docs/reports/sourceRef-atlas-join-inventory.json',
    'docs/reports/sourceRef-atlas-join-inventory.md',
    'docs/atlas/parent-atlas-table-of-contents.md',
    'MASTER-FEATURE-TODO-2026-05-20.md',
    'IMPLEMENTATION_STATUS.md',
  ]);

  return { summarizeThenArchive, keepAsIndexSurface, keepActive };
}

async function main() {
  const joinReport = readJson(JOIN_REPORT_PATH, null);
  const dirtyReport = readJson(DIRTY_CLASSIFICATION_PATH, null);

  if (!joinReport) {
    throw new Error(`Missing join report: ${relativePath(JOIN_REPORT_PATH)}`);
  }
  if (!dirtyReport) {
    throw new Error(`Missing dirty tree classification: ${relativePath(DIRTY_CLASSIFICATION_PATH)}`);
  }

  const archiveBuckets = buildArchiveCandidates(joinReport, dirtyReport);
  const archiveCandidates = unique([
    ...archiveBuckets.summarizeThenArchive,
    ...archiveBuckets.keepAsIndexSurface,
  ]).filter((row) => !archiveBuckets.keepActive.includes(row));

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'dry-run',
    inputs: {
      joinReport: relativePath(JOIN_REPORT_PATH),
      dirtyClassification: relativePath(DIRTY_CLASSIFICATION_PATH),
    },
    summary: {
      packetManifests: Number(joinReport?.summary?.packetManifests ?? 0),
      sourceRefClusters: Number(joinReport?.summary?.sourceRefClusters ?? 0),
      pathPackets: Number(joinReport?.summary?.pathPackets ?? 0),
      archiveCandidates: archiveCandidates.length,
      keepActive: archiveBuckets.keepActive.length,
      keepAsIndexSurface: archiveBuckets.keepAsIndexSurface.length,
    },
    keepActive: archiveBuckets.keepActive,
    keepAsIndexSurface: archiveBuckets.keepAsIndexSurface,
    archiveCandidates,
    notes: [
      'Cold originals stay in archive storage; packet manifests point back to them.',
      'Do not move source files or live completion notes.',
      'Treat the packet report as a warm index surface, not a source-of-truth store.',
      'Archive candidates are summarize-then-archive only; no file moves occur in this report.',
    ],
    moveOrder: [
      'Keep active notes and the parent atlas TOC in place.',
      'Keep packet manifests and index surfaces in place.',
      'Archive raw/generated evidence only after content has been promoted to notes or packets.',
      'Leave submodule decisions for a separate review lane.',
    ],
    evidence: {
      packetManifests: joinReport?.top?.pathPackets?.slice(0, 8) ?? [],
      sourceRefClusters: joinReport?.top?.sourceRefClusters?.slice(0, 8) ?? [],
      dirtyTreeBuckets: {
        intentionalGeneratedArtifacts: dirtyReport?.buckets?.intentionalGeneratedArtifacts?.items?.slice(0, 8) ?? [],
        sourceChanges: dirtyReport?.buckets?.sourceChanges?.items?.slice(0, 8) ?? [],
        untrackedLargeBlobs: dirtyReport?.buckets?.untrackedLargeBlobs?.items?.slice(0, 8) ?? [],
        submoduleDirtiness: dirtyReport?.buckets?.submoduleDirtiness?.items?.slice(0, 8) ?? [],
      },
    },
  };

  fs.writeFileSync(ARCHIVE_PLAN_PATH, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(ARCHIVE_PLAN_MD_PATH, renderMarkdown(report), 'utf8');

  console.log('[sourceRef-parent-join-archive] dry-run report written');
  console.log(`  json: ${path.relative(ROOT, ARCHIVE_PLAN_PATH).replace(/\\/g, '/')}`);
  console.log(`  md:   ${path.relative(ROOT, ARCHIVE_PLAN_MD_PATH).replace(/\\/g, '/')}`);
  console.log(`  archiveCandidates: ${archiveCandidates.length}`);
  console.log(`  keepActive: ${archiveBuckets.keepActive.length}`);
  console.log(`  keepAsIndexSurface: ${archiveBuckets.keepAsIndexSurface.length}`);
}

main().catch((error) => {
  console.error('[sourceRef-parent-join-archive] fatal:', error?.message ?? error);
  process.exit(1);
});
