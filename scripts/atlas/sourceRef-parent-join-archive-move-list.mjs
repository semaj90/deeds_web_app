#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPORTS = path.join(ROOT, 'docs', 'reports');

const ARCHIVE_PLAN_PATH = path.join(REPORTS, 'sourceRef-parent-join-archive-plan.json');
const MOVE_LIST_JSON = path.join(REPORTS, 'sourceRef-parent-join-archive-move-list.json');
const MOVE_LIST_MD = path.join(REPORTS, 'sourceRef-parent-join-archive-move-list.md');

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function normalize(value) {
  return String(value ?? '').replace(/\\/g, '/').trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function classifyDestination(filePath) {
  const normalized = normalize(filePath);
  const lower = normalized.toLowerCase();

  if (lower.includes('rg_turbovec.txt') || lower.includes('rg_napi.txt')) {
    return {
      bucket: 'raw-search-dumps',
      destination: 'archive/raw-search-dumps/',
      reason: 'raw evidence dump that is already packetized',
    };
  }
  if (lower.startsWith('.opencode/') || lower.startsWith('opencode/')) {
    return {
      bucket: 'opencode-generated',
      destination: 'archive/opencode-generated/',
      reason: 'generated OpenCode surface after completion notes are promoted',
    };
  }
  if (lower.startsWith('docs/reports/') || lower.startsWith('sveltekit-frontend/docs/reports/')) {
    return {
      bucket: 'generated-reports',
      destination: 'archive/generated-reports/',
      reason: 'generated report surface that can be archived after the summary is promoted',
    };
  }
  if (lower.includes('obsidian-vault/files/') || lower.includes('obsidian-vault/indexes/') || lower.endsWith('codebase.canvas')) {
    return {
      bucket: 'mirror-surface',
      destination: 'archive/obsidian-vault-mirror/',
      reason: 'downstream mirror/index surface only',
    };
  }
  if (lower.startsWith('memory/exports/') || lower.startsWith('sveltekit-frontend/memory/') || lower.startsWith('memory/graphify/')) {
    return {
      bucket: 'memory-exports',
      destination: 'archive/memory-exports/',
      reason: 'derived export surface that should move after packet promotion',
    };
  }
  if (lower.startsWith('models/') || lower.startsWith('granite-docling') || lower.includes('.gguf') || lower.includes('.onnx')) {
    return {
      bucket: 'model-blob',
      destination: 'archive/model-blobs/',
      reason: 'large model artifact to externalize or relocate',
    };
  }
  if (lower.startsWith('sveltekit-frontend/.tmp/') || lower.startsWith('.tmp/') || lower.startsWith('sveltekit-frontend/tmp/') || lower.startsWith('.cache/') || lower.startsWith('sveltekit-frontend/.cache/') || lower.startsWith('.svelte-kit/') || lower.startsWith('sveltekit-frontend/.svelte-kit/')) {
    return {
      bucket: 'scratch',
      destination: 'archive/scratch-and-cache/',
      reason: 'scratch/cache output that should not remain in the active ship set',
    };
  }
  if (lower.startsWith('docs/6_1_26')) {
    return {
      bucket: 'legacy-doc-bundle',
      destination: 'archive/legacy-doc-bundles/',
      reason: 'legacy bundled doc surface',
    };
  }
  if (lower.startsWith('simd-bridge/cpp/build-x64-cuda/')) {
    return {
      bucket: 'build-artifact',
      destination: 'archive/build-artifacts/',
      reason: 'native build artifact or configure log',
    };
  }
  return {
    bucket: 'review-needed',
    destination: 'archive/review-needed/',
    reason: 'no explicit archive bucket matched',
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# SourceRef Parent Join Archive Move List');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Mode: ${report.mode}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- archive candidates: ${report.summary.archiveCandidates}`);
  lines.push(`- move entries: ${report.summary.moveEntries}`);
  lines.push(`- destinations: ${report.summary.destinations}`);
  lines.push('');
  lines.push('## Destinations');
  for (const [destination, items] of Object.entries(report.destinations)) {
    lines.push(`### ${destination}`);
    lines.push(`- items: ${items.length}`);
    for (const item of items.slice(0, 24)) {
      lines.push(`- \`${item.source}\` -> \`${item.destination}\` (${item.reason})`);
    }
    if (items.length > 24) lines.push(`- ... ${items.length - 24} more`);
    lines.push('');
  }
  lines.push('## Notes');
  for (const note of report.notes) {
    lines.push(`- ${note}`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const archivePlan = readJson(ARCHIVE_PLAN_PATH, null);
  if (!archivePlan) {
    throw new Error(`Missing archive plan: ${ARCHIVE_PLAN_PATH}`);
  }

  const archiveCandidates = unique([
    ...(archivePlan.archiveCandidates ?? []),
    ...(archivePlan.keepAsIndexSurface ?? []),
  ]);

  const moveEntries = archiveCandidates.map((source) => {
    const classification = classifyDestination(source);
    return {
      source: normalize(source),
      bucket: classification.bucket,
      destination: classification.destination,
      reason: classification.reason,
    };
  });

  const grouped = {};
  for (const entry of moveEntries) {
    if (!grouped[entry.destination]) grouped[entry.destination] = [];
    grouped[entry.destination].push(entry);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'dry-run',
    inputs: {
      archivePlan: path.relative(ROOT, ARCHIVE_PLAN_PATH).replace(/\\/g, '/'),
    },
    summary: {
      archiveCandidates: archiveCandidates.length,
      moveEntries: moveEntries.length,
      destinations: Object.keys(grouped).length,
    },
    destinations: grouped,
    notes: [
      'This is a read-only move list only.',
      'Do not move source files, live completion notes, or active atlas navigation docs.',
      'Packet manifests and index surfaces can stay live if they are needed for traversal.',
      'Use the move list to externalize cold originals and redundant generated evidence after promotion.',
    ],
    keepActive: [
      'docs/atlas/parent-atlas-table-of-contents.md',
      'MASTER-FEATURE-TODO-2026-05-20.md',
      'IMPLEMENTATION_STATUS.md',
      'docs/reports/sourceRef-atlas-join-inventory.json',
      'docs/reports/sourceRef-atlas-join-inventory.md',
    ],
  };

  fs.writeFileSync(MOVE_LIST_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(MOVE_LIST_MD, renderMarkdown(report), 'utf8');

  console.log('[sourceRef-parent-join-move-list] dry-run report written');
  console.log(`  json: ${path.relative(ROOT, MOVE_LIST_JSON).replace(/\\/g, '/')}`);
  console.log(`  md:   ${path.relative(ROOT, MOVE_LIST_MD).replace(/\\/g, '/')}`);
  console.log(`  archiveCandidates: ${report.summary.archiveCandidates}`);
  console.log(`  moveEntries: ${report.summary.moveEntries}`);
  console.log(`  destinations: ${report.summary.destinations}`);
}

main().catch((error) => {
  console.error('[sourceRef-parent-join-move-list] fatal:', error?.message ?? error);
  process.exit(1);
});
