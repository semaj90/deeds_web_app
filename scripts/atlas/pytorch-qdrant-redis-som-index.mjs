#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'pytorch-qdrant-redis-som-index-2026-06-01.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'pytorch-qdrant-redis-som-index-2026-06-01.md');
const TOC_MD = path.join(REPO_ROOT, 'docs', 'atlas', 'parent-atlas-table-of-contents.md');

const INPUTS = {
  vector64: path.join(REPO_ROOT, 'memory', 'exports', 'vector64-compression-metrics.json'),
  somMetrics: path.join(REPO_ROOT, 'memory', 'exports', 'som-metrics.json'),
  cacheEffectiveness: path.join(REPO_ROOT, 'docs', 'reports', 'cache-effectiveness-report.json'),
  autoencoderSomMap: path.join(REPO_ROOT, 'docs', 'reports', 'autoencoder-som-map.md'),
  featureRegistry: path.join(REPO_ROOT, 'docs', 'atlas', 'feature-registry.json'),
  crosswalk: path.join(REPO_ROOT, 'docs', 'reports', 'doc-feature-crosswalk-2026-06-01.json'),
  parentAtlasIndex: path.join(REPO_ROOT, 'memory', 'exports', 'parent-atlas', 'parent_atlas_index.json'),
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

function sumBy(items, key) {
  return items.reduce((acc, item) => acc + Number(item?.[key] ?? 0), 0);
}

function uniqueCount(items, key) {
  return new Set(items.map((item) => item?.[key]).filter(Boolean)).size;
}

function summarizeInputs() {
  const vector64 = readJson(INPUTS.vector64);
  const somMetrics = readJson(INPUTS.somMetrics);
  const cacheEffectiveness = readJson(INPUTS.cacheEffectiveness);
  const autoencoderSomMap = readText(INPUTS.autoencoderSomMap);
  const featureRegistry = readJson(INPUTS.featureRegistry) ?? [];
  const crosswalk = readJson(INPUTS.crosswalk);
  const parentAtlasIndex = readJson(INPUTS.parentAtlasIndex);

  const allAssignments = somMetrics?.allAssignments ?? [];
  const centroids = vector64?.sampleResults ?? [];

  return {
    vector64: vector64
      ? {
          fromDim: vector64.compression?.fromDim ?? null,
          toDim: vector64.compression?.toDim ?? null,
          compressionRatio: vector64.compression?.compressionRatio ?? null,
          memorySavingsPercent: vector64.compression?.memorySavingsPercent ?? null,
          avgError: vector64.reconstructionMetrics?.avgError ?? null,
          sampleCount: centroids.length,
        }
      : null,
    somMetrics: somMetrics
      ? {
          gridSize: somMetrics.somGrid?.gridSize ?? null,
          totalNeurons: somMetrics.somGrid?.totalNeurons ?? null,
          embeddingDim: somMetrics.somGrid?.embeddingDim ?? null,
          iterations: somMetrics.somGrid?.iterations ?? null,
          backendUsed: somMetrics.somGrid?.backendUsed ?? null,
          assignedCards: somMetrics.assignments?.assignedCards ?? null,
          totalCards: somMetrics.assignments?.totalCards ?? null,
          topologyEdges: somMetrics.topologyEdges?.totalEdges ?? null,
          avgDistance: somMetrics.bmuDistance?.avg ?? null,
        }
      : null,
    cacheEffectiveness: cacheEffectiveness
      ? {
          totalRunsAnalyzed: cacheEffectiveness.total_runs_analyzed ?? null,
          hitRates: cacheEffectiveness.hit_rates ?? {},
          fallbackCount: cacheEffectiveness.fallback_count ?? null,
        }
      : null,
    featureRegistry: {
      total: featureRegistry.length,
      implemented: featureRegistry.filter((f) => f.status === 'implemented').length,
      partial: featureRegistry.filter((f) => f.status === 'partial').length,
      missing: featureRegistry.filter((f) => f.status === 'missing').length,
    },
    crosswalk: crosswalk
      ? {
          sourceRefPathmap: crosswalk.families?.find((f) => f.id === 'sourceRef_pathmap')?.fileCount ?? 0,
          parentAtlasPacketFlow: crosswalk.families?.find((f) => f.id === 'parent_atlas')?.fileCount ?? 0,
          neo4jContextualTrees: crosswalk.families?.find((f) => f.id === 'neo4j_contextual_trees')?.fileCount ?? 0,
          qdrantSemanticAnalysis: crosswalk.families?.find((f) => f.id === 'qdrant_semantic_analysis')?.fileCount ?? 0,
          redisBitfrostCache: crosswalk.families?.find((f) => f.id === 'redis_cache')?.fileCount ?? 0,
          aeCentroidsTurboVecSOM: crosswalk.families?.find((f) => f.id === 'ae_centroids')?.fileCount ?? 0,
          offlineProcessing: crosswalk.families?.find((f) => f.id === 'offline_processing')?.fileCount ?? 0,
        }
      : null,
    parentAtlasIndex: parentAtlasIndex
      ? {
          totalEntries: parentAtlasIndex.entries?.length ?? 0,
          totalNodes: sumBy(parentAtlasIndex.entries ?? [], 'reward_count'),
          totalReward: sumBy(parentAtlasIndex.entries ?? [], 'reward_total'),
          uniqueKinds: uniqueCount(parentAtlasIndex.entries ?? [], 'kind'),
          uniqueSources: uniqueCount(parentAtlasIndex.entries ?? [], 'sourceRef'),
        }
      : null,
    notes: [
      'PyTorch / LibTorch is the numeric lane.',
      'Qdrant remains the recall/search lane.',
      'Redis/Bitfrost stores hot centroid and packet pointers.',
      'SOM / AE outputs are treated as indexed JSON tree surfaces, not schema sources.',
    ],
    autoencoderSomMapLines: autoencoderSomMap ? autoencoderSomMap.split(/\r?\n/).filter(Boolean).length : 0,
    somAssignments: {
      total: allAssignments.length,
      uniqueCards: uniqueCount(allAssignments, 'cardId'),
      uniqueRows: uniqueCount(allAssignments, 'bmuRow'),
      uniqueCols: uniqueCount(allAssignments, 'bmuCol'),
      sampleCards: allAssignments.slice(0, 5).map((row) => row.cardId),
    },
    qdrantTags: [
      'feature:gpu',
      'feature:som',
      'feature:centroid',
      'feature:cluster',
      'feature:vector64',
    ],
  };
}

function ensureToc() {
  const existing = readText(TOC_MD) ?? '';
  const entry = '- [PyTorch / Qdrant / Redis / SOM index](../reports/pytorch-qdrant-redis-som-index-2026-06-01.md)';
  if (!existing.includes(entry)) {
    const updated = existing.replace(
      '- [Parent atlas doc indexing report](../reports/parent-atlas-doc-indexing-2026-06-01.md)',
      '- [Parent atlas doc indexing report](../reports/parent-atlas-doc-indexing-2026-06-01.md)\n' + entry,
    );
    fs.writeFileSync(TOC_MD, updated, 'utf8');
  }
}

function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      vector64: path.relative(REPO_ROOT, INPUTS.vector64),
      somMetrics: path.relative(REPO_ROOT, INPUTS.somMetrics),
      cacheEffectiveness: path.relative(REPO_ROOT, INPUTS.cacheEffectiveness),
      autoencoderSomMap: path.relative(REPO_ROOT, INPUTS.autoencoderSomMap),
      featureRegistry: path.relative(REPO_ROOT, INPUTS.featureRegistry),
      crosswalk: path.relative(REPO_ROOT, INPUTS.crosswalk),
      parentAtlasIndex: path.relative(REPO_ROOT, INPUTS.parentAtlasIndex),
    },
    summary: summarizeInputs(),
    activeEntryPoints: [
      'scripts/atlas/build-all-lanes-parent-atlas.mjs',
      'scripts/atlas/atlas-parent-indexing.mjs',
      'scripts/atlas/backfill-som-coordinates.mjs',
      'scripts/atlas/build-atlas-token-map.mjs',
      'sveltekit-frontend/src/lib/server/graph/som-topology-pipeline.ts',
      'sveltekit-frontend/src/lib/server/gpu/pytorch-graph.ts',
      'sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts',
      'sveltekit-frontend/src/lib/server/retrieval/encoded-cluster-prefilter.ts',
      'docs/reports/autoencoder-som-map.md',
      'docs/reports/cache-effectiveness-report.json',
    ],
    notes: [
      'The PyTorch lane is the experimental compression/training boundary.',
      'Qdrant carries semantic cluster recall and payload tagging.',
      'Redis/Bitfrost retains hot centroids and cache pointers for offline processing.',
      'The JSON tree artifacts are navigation surfaces for indexing, not a new source of truth.',
    ],
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const md = [
    '# PyTorch / Qdrant / Redis / SOM Index - 2026-06-01',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Vector64 compression: ${report.summary.vector64?.fromDim ?? 'n/a'} -> ${report.summary.vector64?.toDim ?? 'n/a'} (${report.summary.vector64?.compressionRatio ?? 'n/a'}%)`,
    `- Vector64 avg reconstruction error: ${report.summary.vector64?.avgError ?? 'n/a'}`,
    `- SOM grid size: ${report.summary.somMetrics?.gridSize ?? 'n/a'}`,
    `- SOM total neurons: ${report.summary.somMetrics?.totalNeurons ?? 'n/a'}`,
    `- SOM embedding dim: ${report.summary.somMetrics?.embeddingDim ?? 'n/a'}`,
    `- SOM backend: ${report.summary.somMetrics?.backendUsed ?? 'n/a'}`,
    `- SOM assigned cards: ${report.summary.somMetrics?.assignedCards ?? 'n/a'}/${report.summary.somMetrics?.totalCards ?? 'n/a'}`,
    `- SOM topology edges: ${report.summary.somMetrics?.topologyEdges ?? 'n/a'}`,
    `- Cache effectiveness runs: ${report.summary.cacheEffectiveness?.totalRunsAnalyzed ?? 'n/a'}`,
    `- Cache centroid hit rate: ${report.summary.cacheEffectiveness?.hitRates?.centroid ?? 'n/a'}`,
    `- Cache fallback count: ${report.summary.cacheEffectiveness?.fallbackCount ?? 'n/a'}`,
    `- Feature registry entries: ${report.summary.featureRegistry.total}`,
    `- Parent atlas total entries: ${report.summary.parentAtlasIndex?.totalEntries ?? 'n/a'}`,
    `- Parent atlas unique kinds: ${report.summary.parentAtlasIndex?.uniqueKinds ?? 'n/a'}`,
    `- Parent atlas unique sources: ${report.summary.parentAtlasIndex?.uniqueSources ?? 'n/a'}`,
    `- Autoencoder/SOM map lines: ${report.summary.autoencoderSomMapLines}`,
    `- SOM assignments: ${report.summary.somAssignments.total}`,
    `- Unique SOM card ids: ${report.summary.somAssignments.uniqueCards}`,
    '',
    '## Active Entry Points',
    '',
    ...report.activeEntryPoints.map((item) => `- ${item}`),
    '',
    '## Notes',
    '',
    ...report.notes.map((note) => `- ${note}`),
    '',
    '## Qdrant / Redis Tags',
    '',
    ...report.summary.qdrantTags.map((tag) => `- ${tag}`),
    '',
  ].join('\n');

  fs.writeFileSync(REPORT_MD, md, 'utf8');
  ensureToc();

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  console.log(`Updated ${TOC_MD}`);
}

main();
