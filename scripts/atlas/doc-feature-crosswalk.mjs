#!/usr/bin/env node
/**
 * doc-feature-crosswalk.mjs
 *
 * Read-only doc-to-feature crosswalk.
 *
 * Uses rg -uu so ignored/generated surfaces are included in the scan surface.
 * The report groups docs by feature family and highlights the sourceRef/pathmap
 * spine used for quick multi-hop traversals.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..', '..');
const REPORTS = resolve(ROOT, 'docs', 'reports');

const OUTPUT_JSON = resolve(REPORTS, 'doc-feature-crosswalk-2026-06-01.json');
const OUTPUT_MD = resolve(REPORTS, 'doc-feature-crosswalk-2026-06-01.md');
const PATHMAP = resolve(ROOT, 'docs', 'graph', 'missing-features-path-map.json');
const CONSOLIDATION_MAP = resolve(ROOT, 'docs', 'reports', 'repo-consolidation-feature-map.json');
const PARENT_ATLAS = resolve(ROOT, 'memory', 'exports', 'parent-atlas', 'parent_atlas_index.json');

const DOC_ROOTS = [
  'docs',
  'sveltekit-frontend/docs',
  'memory/exports',
  '.tmp',
  'sveltekit-frontend/.tmp',
];

const FAMILIES = [
  {
    id: 'sourceRef_pathmap',
    label: 'SourceRef / pathmap spine',
    patterns: ['sourceRef', 'path-map', 'path map', 'stableKey', 'feature_id', 'title_id', 'mapreduce-path-join'],
    anchors: [
      'docs/graph/missing-features-path-map.md',
      'docs/reports/sourceRef-atlas-join-inventory.md',
      'docs/reports/qdrant-path-bridge-latest.md',
      'docs/reports/sourceRef-first-join-warmup.md',
    ],
  },
  {
    id: 'parent_atlas',
    label: 'Parent atlas / packet flow',
    patterns: ['parent atlas', 'parent_atlas', 'parent-atlas', 'NES chrom', 'NES/Glyph', 'packet', 'feature-command-atlas'],
    anchors: [
      'docs/reports/parent-atlas-compression-plan.md',
      'docs/reports/parent-atlas-feature-command-atlas.md',
      'docs/reports/parent-atlas-feature-command-atlas-postgres.md',
      'docs/reports/parent-atlas-rg-dump-organizer.md',
    ],
  },
  {
    id: 'neo4j_contextual_trees',
    label: 'Neo4j contextual trees / multi-hop traversal',
    patterns: ['neo4j', 'context tree', 'multi-hop', 'graphrag', 'kag', 'dag', 'contextTimeline'],
    anchors: [
      'docs/architecture/kanban-parent-atlas-alignment.md',
      'docs/graph/parent-atlas-feature-command-atlas.cypher',
      'docs/reports/sourceRef-first-hot-join-warmup.md',
    ],
  },
  {
    id: 'qdrant_semantic_analysis',
    label: 'Qdrant semantic analysis / clustering',
    patterns: ['qdrant', 'semantic', 'embedding', 'ann', 'cluster', 'payload', 'vector'],
    anchors: [
      'docs/reports/qdrant-path-bridge-latest.md',
      'docs/reports/parent-atlas-feature-command-atlas-qdrant.md',
      'docs/reports/missing-features-review-latest.md',
    ],
  },
  {
    id: 'redis_cache',
    label: 'Redis / Bitfrost cache lane',
    patterns: ['redis', 'bitfrost', 'cache', 'ttl', 'packet cache', 'hot cache', 'ace:packet'],
    anchors: [
      'docs/reports/sourceRef-first-hot-join-warmup.md',
      'docs/reports/sourceRef-first-nes-glyph-compress.md',
      'docs/reports/nes-chrom-packet-kag-dag-map.md',
    ],
  },
  {
    id: 'ae_centroids',
    label: 'AE centroids / TurboVec / SOM',
    patterns: ['centroid', 'som', 'autoencoder', 'vector64', 'TurboVec', 'turbovec', 'ae', 'centroids'],
    anchors: [
      'docs/reports/parent-atlas-compression-plan.md',
      'docs/reports/kanban-turbovec-consolidation-latest.md',
      'docs/reports/autoencoder-som-map.md',
    ],
  },
  {
    id: 'offline_processing',
    label: 'Offline processing / mapreduce / DuckDB',
    patterns: ['offline processing', 'mapreduce', 'DuckDB', 'duckdb', 'batch', 'synthesis', 'rg_turbovec', 'rg_napi'],
    anchors: [
      'docs/reports/rg-search-dump-index-report.md',
      'docs/reports/parent-atlas-rg-dump-organizer.md',
      'docs/reports/repo-organization-audit-2026-06-01.md',
    ],
  },
];

function rg(args) {
  const result = spawnSync('rg', args, {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`rg failed: ${String(result.stderr ?? result.stdout ?? '').trim()}`);
  }
  return String(result.stdout ?? '').trim();
}

function readJson(filePath, fallback = null) {
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

function rgFiles(patterns) {
  const args = ['-l', '-uu', '-g', '*.md', '-g', '*.json', '-g', '*.cypher', '-g', '*.svg', '-g', '*.mdx', '-g', '*.txt'];
  for (const pattern of patterns) {
    args.push('-e', pattern);
  }
  args.push(...DOC_ROOTS);
  return rg(args)
    .split(/\r?\n/)
    .filter(Boolean)
    .map(normalizePath)
    .sort((a, b) => a.localeCompare(b));
}

function sampleFiles(files, limit = 8) {
  return files.slice(0, limit);
}

const discoveredFiles = rgFiles([
  'sourceRef',
  'path-map',
  'path map',
  'stableKey',
  'feature_id',
  'title_id',
  'mapreduce-path-join',
  'parent atlas',
  'parent_atlas',
  'NES chrom',
  'NES/Glyph',
  'packet',
  'feature-command-atlas',
  'neo4j',
  'context tree',
  'multi-hop',
  'graphrag',
  'kag',
  'dag',
  'qdrant',
  'semantic',
  'embedding',
  'ann',
  'cluster',
  'payload',
  'vector',
  'redis',
  'bitfrost',
  'cache',
  'ttl',
  'centroid',
  'som',
  'autoencoder',
  'vector64',
  'TurboVec',
  'turbovec',
  'ae',
  'offline processing',
  'mapreduce',
  'DuckDB',
  'duckdb',
  'batch',
  'synthesis',
  'rg_turbovec',
  'rg_napi',
]);

function fileMatchesFamily(filePath, family) {
  const normalized = normalizePath(filePath).toLowerCase();
  const anchors = family.anchors.map((anchor) => anchor.toLowerCase());
  if (anchors.some((anchor) => normalized.endsWith(anchor))) return true;
  if (family.id === 'sourceRef_pathmap' && (normalized.includes('repo-root-atlas') || normalized.includes('missing-features-path-map') || normalized.includes('sourceRef'))) return true;
  if (family.id === 'parent_atlas' && (normalized.includes('parent-atlas') || normalized.includes('nes-chrom') || normalized.includes('packet'))) return true;
  if (family.id === 'neo4j_contextual_trees' && (normalized.includes('neo4j') || normalized.includes('graph') || normalized.includes('kag') || normalized.includes('dag'))) return true;
  if (family.id === 'qdrant_semantic_analysis' && (normalized.includes('qdrant') || normalized.includes('semantic') || normalized.includes('embedding') || normalized.includes('vector'))) return true;
  if (family.id === 'redis_cache' && (normalized.includes('redis') || normalized.includes('bitfrost') || normalized.includes('cache'))) return true;
  if (family.id === 'ae_centroids' && (normalized.includes('centroid') || normalized.includes('som') || normalized.includes('turbovec') || normalized.includes('autoencoder'))) return true;
  if (family.id === 'offline_processing' && (normalized.includes('mapreduce') || normalized.includes('duckdb') || normalized.includes('offline') || normalized.includes('rg-'))) return true;
  return family.patterns.some((pattern) => normalized.includes(pattern.toLowerCase().replace(/\s+/g, '-')));
}

function buildFamily(family) {
  const files = new Set();
  for (const file of discoveredFiles) {
    if (fileMatchesFamily(file, family)) {
      files.add(file);
    }
  }
  const sorted = [...files].sort((a, b) => a.localeCompare(b));
  return {
    id: family.id,
    label: family.label,
    patterns: family.patterns,
    anchors: family.anchors,
    files: sorted,
    fileCount: sorted.length,
    sampleFiles: sampleFiles(sorted),
  };
}

const pathmap = readJson(PATHMAP, {});
const consolidation = readJson(CONSOLIDATION_MAP, {});
const parentAtlas = readJson(PARENT_ATLAS, { entries: [] });

const families = FAMILIES.map(buildFamily);

const report = {
  generatedAt: new Date().toISOString(),
  repo: ROOT,
  inputs: {
    pathmap: relative(ROOT, PATHMAP),
    consolidationMap: relative(ROOT, CONSOLIDATION_MAP),
    parentAtlas: relative(ROOT, PARENT_ATLAS),
  },
  pathmapSpine: {
    roots: pathmap.roots ?? [],
    fieldAlignment: pathmap.fieldAlignment ?? {},
    targets: pathmap.targets ?? [],
  },
  parentAtlasSpine: {
    entries: Array.isArray(parentAtlas.entries) ? parentAtlas.entries.length : 0,
    sourceRefEntries: Array.isArray(parentAtlas.entries)
      ? parentAtlas.entries.filter((entry) => Array.isArray(entry?.sourceRefs) && entry.sourceRefs.length > 0).length
      : 0,
  },
  consolidationSignals: {
    canonicalProductionTables: consolidation.canonicalProductionTables ?? [],
    productionReadyCodePaths: consolidation.productionReadyCodePaths ?? [],
    plannedProduction: consolidation.plannedProduction ?? [],
    experimental: consolidation.experimental ?? [],
  },
  families,
  quickTraversalSpine: {
    docs: [
      'docs/graph/missing-features-path-map.md',
      'docs/reports/sourceRef-atlas-join-inventory.md',
      'docs/reports/parent-atlas-compression-plan.md',
      'docs/reports/qdrant-path-bridge-latest.md',
      'docs/reports/sourceRef-first-hot-join-warmup.md',
      'docs/reports/sourceRef-first-nes-glyph-compress.md',
      'docs/reports/sourceRef-first-parent-atlas-refresh.md',
      'docs/reports/nes-chrom-packet-kag-dag-map.md',
      'docs/reports/parent-atlas-rg-dump-organizer.md',
    ],
    useCase: 'Quick multi-hop traversal across sourceRef, parent atlas, Neo4j, Qdrant, Redis, and offline-processing docs.',
  },
  discoveredFileCount: discoveredFiles.length,
  notes: [
    'The sourceRef/pathmap spine is the canonical bridge for fast cross-store traversal.',
    'Parent atlas packets stay the durable evidence layer for multi-hop joins.',
    'Neo4j contextual trees are for traversal, not canonical storage.',
    'Qdrant handles semantic analysis and clustering; Redis/Bitfrost keep hot packets live.',
    'AE centroids / TurboVec are the compression and prefilter lane for offline processing.',
    'Raw rg search dumps remain evidence only until packetized and summarized.',
  ],
};

function renderMarkdown(data) {
  const lines = [];
  lines.push('# Doc-Feature Crosswalk');
  lines.push('');
  lines.push(`Generated: ${data.generatedAt}`);
  lines.push(`Repo: ${data.repo}`);
  lines.push('');
  lines.push('## Quick Traversal Spine');
  lines.push(`- SourceRef/pathmap: ${data.pathmapSpine.roots.join(', ')}`);
  lines.push(`- Parent atlas entries: ${data.parentAtlasSpine.entries}`);
  lines.push(`- Entries with sourceRefs: ${data.parentAtlasSpine.sourceRefEntries}`);
  lines.push(`- Discovered doc/report files: ${data.discoveredFileCount}`);
  lines.push(`- Use case: ${data.quickTraversalSpine.useCase}`);
  lines.push('');
  lines.push('## Families');
  for (const family of data.families) {
    lines.push(`### ${family.label}`);
    lines.push(`- Patterns: ${family.patterns.join(', ')}`);
    lines.push(`- Docs matched: ${family.fileCount}`);
    lines.push(`- Anchors:`);
    for (const anchor of family.anchors) {
      lines.push(`  - \`${anchor}\``);
    }
    lines.push(`- Sample docs:`);
    for (const file of family.sampleFiles) {
      lines.push(`  - \`${file}\``);
    }
    lines.push('');
  }
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
for (const family of families) {
  console.log(`${family.label}: ${family.fileCount}`);
}
