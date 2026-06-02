#!/usr/bin/env node
/**
 * plan-archive-moves.mjs
 *
 * Read-only archive move planner.
 *
 * Inputs:
 *   - repo dirty tree classification report
 *   - repo organization audit
 *   - repo consolidation feature map
 *
 * Outputs:
 *   - docs/reports/repo-archive-move-plan-2026-06-01.json
 *   - docs/reports/repo-archive-move-plan-2026-06-01.md
 *
 * The report does not move files. It only separates:
 *   - keep active
 *   - summarize then archive
 *   - keep as derived index surfaces
 *   - externalize or relocate large blobs
 *   - review submodule dirtiness
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..', '..');
const REPORTS = resolve(ROOT, 'docs', 'reports');

const DIRTY_REPORT = resolve(REPORTS, 'repo-dirty-tree-classification-2026-06-01.json');
const ORG_AUDIT = resolve(REPORTS, 'repo-organization-audit-2026-06-01.json');
const CONSOLIDATION_MAP = resolve(REPORTS, 'repo-consolidation-feature-map.json');
const OUTPUT_JSON = resolve(REPORTS, 'repo-archive-move-plan-2026-06-01.json');
const OUTPUT_MD = resolve(REPORTS, 'repo-archive-move-plan-2026-06-01.md');

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

const INDEX_SURFACES = [
  'sveltekit-frontend/docs/obsidian-vault/Files/',
  'sveltekit-frontend/docs/obsidian-vault/Indexes/',
  'sveltekit-frontend/docs/obsidian-vault/index.md',
  'sveltekit-frontend/docs/obsidian-vault/codebase.canvas',
  'sveltekit-frontend/docs/obsidian-vault/agent-manifest.json',
];

const LARGE_BLOB_PREFIXES = [
  'models/',
  'backups/',
  'offline-data/',
  'docker/langgraph-synthesis/.venv/',
  '.venv-py313-backup/',
  'sveltekit-frontend/.venv/',
  'sveltekit-frontend/tmp/',
  'sveltekit-frontend/.cache/',
  'sveltekit-frontend/build/',
  'sveltekit-frontend/.svelte-kit/',
];

const RAW_EVIDENCE = [
  'docs/reports/rg_turbovec.txt',
  'docs/reports/rg_napi.txt',
];

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function relativeIfInside(pathValue) {
  const normalized = normalizePath(pathValue);
  return normalized.startsWith(normalizePath(ROOT)) ? relative(ROOT, normalized) : normalized;
}

const dirty = readJson(DIRTY_REPORT, null);
const audit = readJson(ORG_AUDIT, null);
const consolidation = readJson(CONSOLIDATION_MAP, null);

if (!dirty || !audit || !consolidation) {
  throw new Error('Required input report(s) are missing. Run the dirty-tree classifier and organization audit first.');
}

function bucketItems(name) {
  return Array.isArray(dirty?.buckets?.[name]?.items) ? dirty.buckets[name].items : [];
}

function isActiveNote(path) {
  return ACTIVE_NOTES.has(normalizePath(path));
}

function isIndexSurface(path) {
  const normalized = normalizePath(path);
  return INDEX_SURFACES.some((prefix) => normalized.startsWith(prefix));
}

function isRawEvidence(path) {
  return RAW_EVIDENCE.includes(normalizePath(path));
}

function isLargeBlobCandidate(path) {
  const normalized = normalizePath(path);
  return LARGE_BLOB_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    /\.(gguf|onnx|dump|tar|gz|sqlite|msgpack|dll|so|lib)$/i.test(normalized);
}

function summarizeItems(items, limit = 16) {
  return items.slice(0, limit).map((item) => ({
    path: item.path,
    status: item.status,
    reason: item.reason,
    sizeGB: item.sizeGB ?? null,
  }));
}

const generatedItems = bucketItems('intentionalGeneratedArtifacts');
const sourceItems = bucketItems('sourceChanges');
const largeItems = bucketItems('untrackedLargeBlobs');
const submoduleItems = bucketItems('submoduleDirtiness');

const summarizeThenArchive = unique([
  ...generatedItems
    .filter((item) => !isActiveNote(item.path))
    .filter((item) => !isIndexSurface(item.path))
    .map((item) => item.path),
  ...RAW_EVIDENCE,
]);

const keepAsIndexSurface = unique([
  ...generatedItems.filter((item) => isIndexSurface(item.path)).map((item) => item.path),
]);

const externalizeOrRelocate = unique([
  ...largeItems.filter((item) => isLargeBlobCandidate(item.path)).map((item) => item.path),
  ...audit.largeFiles
    .filter((item) => (Number(item.sizeGB ?? item.gb ?? 0) >= 0.1) && isLargeBlobCandidate(item.path))
    .map((item) => item.path),
]);

const activeSourceNotes = unique([
  ...sourceItems.map((item) => item.path),
  ...Array.from(ACTIVE_NOTES),
]);

const report = {
  generatedAt: new Date().toISOString(),
  repo: ROOT,
  inputs: {
    dirtyTreeReport: relativeIfInside(DIRTY_REPORT),
    orgAuditReport: relativeIfInside(ORG_AUDIT),
    consolidationMap: relativeIfInside(CONSOLIDATION_MAP),
  },
  summary: {
    activeSourceNotes: activeSourceNotes.length,
    summarizeThenArchive: summarizeThenArchive.length,
    keepAsIndexSurface: keepAsIndexSurface.length,
    externalizeOrRelocate: externalizeOrRelocate.length,
    submoduleReview: submoduleItems.length,
  },
  keepActive: activeSourceNotes.sort(),
  keepAsIndexSurface,
  summarizeThenArchive,
  externalizeOrRelocate,
  submoduleReview: submoduleItems.map((item) => ({
    path: item.path,
    status: item.status,
    reason: item.reason,
  })),
  notes: [
    'LangExtract should summarize source files, parent-atlas packets, and selected mirror summaries before archive moves.',
    'Obsidian-vault mirrors stay as downstream indexing surfaces, not canonical sources.',
    'Raw rg dumps are already chunked into parent-atlas packets; archive the raw dumps after promotion.',
    'Large model/backups/runtime blobs should be externalized or relocated before any trim decision is made.',
    'The dirty gitlink is turbovec; claude-mem is present as a gitlink but is not dirty in the current status snapshot.',
  ],
  moveOrder: [
    'Promote completion notes and canonical docs first.',
    'Archive raw search dumps after packetization.',
    'Archive redundant generated reports and mirror snapshots after the content is promoted.',
    'Externalize large blobs and backup trees outside the active ship set.',
    'Review submodule dirtiness last; do not move gitlinks until the target ownership is clear.',
  ],
  evidence: {
    dirtyTree: {
      intentionalGeneratedArtifacts: summarizeItems(generatedItems),
      sourceChanges: summarizeItems(sourceItems),
      untrackedLargeBlobs: summarizeItems(largeItems),
      submoduleDirtiness: summarizeItems(submoduleItems),
    },
    orgAudit: {
      topLevelBuckets: audit.topLevelBuckets?.slice(0, 12) ?? [],
      largestFiles: audit.largeFiles?.slice(0, 25) ?? [],
    },
  },
};

function renderMarkdown(data) {
  const lines = [];
  lines.push('# Repo Archive Move Plan');
  lines.push('');
  lines.push(`Generated: ${data.generatedAt}`);
  lines.push(`Repo: ${data.repo}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Active source notes: ${data.summary.activeSourceNotes}`);
  lines.push(`- Summarize then archive: ${data.summary.summarizeThenArchive}`);
  lines.push(`- Keep as index surface: ${data.summary.keepAsIndexSurface}`);
  lines.push(`- Externalize or relocate: ${data.summary.externalizeOrRelocate}`);
  lines.push(`- Submodule review items: ${data.summary.submoduleReview}`);
  lines.push('');
  lines.push('## Keep Active');
  for (const path of data.keepActive) {
    lines.push(`- \`${path}\``);
  }
  lines.push('');
  lines.push('## Keep as Derived Index Surfaces');
  for (const path of data.keepAsIndexSurface) {
    lines.push(`- \`${path}\``);
  }
  lines.push('');
  lines.push('## Summarize Then Archive');
  for (const path of data.summarizeThenArchive) {
    lines.push(`- \`${path}\``);
  }
  lines.push('');
  lines.push('## Externalize or Relocate Large Blobs');
  for (const path of data.externalizeOrRelocate) {
    lines.push(`- \`${path}\``);
  }
  lines.push('');
  lines.push('## Submodule Review');
  for (const item of data.submoduleReview) {
    lines.push(`- \`${item.path}\` - ${item.reason}`);
  }
  lines.push('');
  lines.push('## Move Order');
  for (const step of data.moveOrder) {
    lines.push(`- ${step}`);
  }
  lines.push('');
  lines.push('## Notes');
  for (const note of data.notes) {
    lines.push(`- ${note}`);
  }
  return lines.join('\n');
}

writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2));
writeFileSync(OUTPUT_MD, renderMarkdown(report));

console.log(`Wrote ${relative(ROOT, OUTPUT_JSON)}`);
console.log(`Wrote ${relative(ROOT, OUTPUT_MD)}`);
console.log(`Summarize then archive: ${report.summary.summarizeThenArchive}`);
console.log(`Keep as index surface: ${report.summary.keepAsIndexSurface}`);
console.log(`Externalize or relocate: ${report.summary.externalizeOrRelocate}`);
