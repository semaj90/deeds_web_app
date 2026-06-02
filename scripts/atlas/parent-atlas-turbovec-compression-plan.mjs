#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..', '..');
const REPORTS = resolve(ROOT, 'docs', 'reports');
const MEMORY_EXPORTS = resolve(ROOT, 'memory', 'exports');

const INPUTS = {
  repoConsolidation: resolve(REPORTS, 'repo-consolidation-feature-map.json'),
  missingFeatures: resolve(REPORTS, 'missing-features-review-latest.json'),
  qdrantBridge: resolve(REPORTS, 'qdrant-path-bridge-latest.json'),
  sourceRefInventory: resolve(REPORTS, 'sourceRef-atlas-join-inventory.json'),
  parentAtlasReport: resolve(MEMORY_EXPORTS, 'parent-atlas-report.json'),
  allLanesParentAtlasReport: resolve(MEMORY_EXPORTS, 'all-lanes-parent-atlas-report.json'),
  vector64Metrics: resolve(MEMORY_EXPORTS, 'vector64-compression-metrics.json'),
  pg18RedisBifrost: resolve(MEMORY_EXPORTS, 'pg18-redis-bifrost-stack-report.json'),
  nextMoves: resolve(MEMORY_EXPORTS, 'next-moves-recommendation.json'),
};

const OUTPUT_JSON = join(REPORTS, 'parent-atlas-compression-plan.json');
const OUTPUT_MD = join(REPORTS, 'parent-atlas-compression-plan.md');
const OUTPUT_SVG = join(REPORTS, 'parent-atlas-compression-plan.svg');

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function count(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function ensureReportsDir() {
  if (!existsSync(REPORTS)) mkdirSync(REPORTS, { recursive: true });
}

function loadInputs() {
  return {
    repoConsolidation: readJson(INPUTS.repoConsolidation, {}),
    missingFeatures: readJson(INPUTS.missingFeatures, {}),
    qdrantBridge: readJson(INPUTS.qdrantBridge, {}),
    sourceRefInventory: readJson(INPUTS.sourceRefInventory, {}),
    parentAtlasReport: readJson(INPUTS.parentAtlasReport, {}),
    allLanesParentAtlasReport: readJson(INPUTS.allLanesParentAtlasReport, {}),
    vector64Metrics: readJson(INPUTS.vector64Metrics, {}),
    pg18RedisBifrost: readJson(INPUTS.pg18RedisBifrost, {}),
    nextMoves: readJson(INPUTS.nextMoves, {}),
  };
}

function loadArray(value, fallbackKey = null) {
  if (Array.isArray(value)) return value;
  if (fallbackKey && value && typeof value === 'object' && Array.isArray(value[fallbackKey])) {
    return value[fallbackKey];
  }
  return [];
}

function buildSummary(inputs) {
  const repoConsolidation = inputs.repoConsolidation ?? {};
  const missingFeatures = inputs.missingFeatures ?? {};
  const qdrantBridge = inputs.qdrantBridge ?? {};
  const sourceRefInventory = inputs.sourceRefInventory ?? {};
  const parentAtlasReport = inputs.parentAtlasReport ?? {};
  const vector64Metrics = inputs.vector64Metrics ?? {};
  const pg18RedisBifrost = inputs.pg18RedisBifrost ?? {};
  const nextMoves = inputs.nextMoves ?? {};

  const productionReadyCodePaths = loadArray(repoConsolidation.production_ready_code_paths);
  const plannedProduction = loadArray(repoConsolidation.planned_production);
  const experimental = loadArray(repoConsolidation.experimental);
  const archiveCandidates = loadArray(repoConsolidation.archive_candidates);
  const canonicalTables = loadArray(repoConsolidation.canonical_production_tables);
  const repoRootAtlas = missingFeatures?.summary?.repoRootAtlas ?? {};
  const registryPrefixClusters = loadArray(missingFeatures.registryPrefixClusters);
  const mapreducePrefixClusters = toNumber(missingFeatures?.summary?.mapreducePrefixClusterCount ?? 0);
  const duplicateSystemCount = toNumber(missingFeatures?.summary?.duplicateSystemCount ?? 0);
  const qdrantSummary = qdrantBridge?.summary ?? {};
  const qdrantPrefixCounts = loadArray(qdrantBridge.qdrantPrefixCounts);
  const sourceSpine = loadArray(sourceRefInventory.join_spine);
  const parentAtlasData = parentAtlasReport?.data ?? parentAtlasReport ?? {};
  const stackVerdict = pg18RedisBifrost?.verdict ?? {};
  const vector64Compression = vector64Metrics?.compression ?? {};
  const vector64Reconstruction = vector64Metrics?.reconstructionMetrics ?? {};
  const nextMovesTop = loadArray(nextMoves.topKanbanTasks).slice(0, 8);

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      repoConsolidation: INPUTS.repoConsolidation,
      missingFeatures: INPUTS.missingFeatures,
      qdrantBridge: INPUTS.qdrantBridge,
      sourceRefInventory: INPUTS.sourceRefInventory,
      parentAtlasReport: INPUTS.parentAtlasReport,
      allLanesParentAtlasReport: INPUTS.allLanesParentAtlasReport,
      vector64Metrics: INPUTS.vector64Metrics,
      pg18RedisBifrost: INPUTS.pg18RedisBifrost,
      nextMoves: INPUTS.nextMoves,
    },
    summary: {
      parentAtlasCardsLoaded: toNumber(parentAtlasData.cards_loaded ?? parentAtlasData.parent_atlas_entries ?? 0),
      parentAtlasClusters: toNumber(parentAtlasData.cluster_summaries ?? 0),
      canonicalTableCount: count(canonicalTables),
      productionReadyCodePathCount: productionReadyCodePaths.length,
      plannedProductionCount: plannedProduction.length,
      experimentalCount: experimental.length,
      archiveCandidateCount: archiveCandidates.length,
      registryPrefixClusterCount: count(registryPrefixClusters),
      mapreducePrefixClusterCount: mapreducePrefixClusters,
      duplicateSystemCount,
      qdrantPointCount: toNumber(qdrantSummary.qdrantPointCount ?? 0),
      qdrantBridgeRows: toNumber(qdrantSummary.bridgeRowCount ?? 0),
      qdrantFullMatchCount: toNumber(qdrantSummary.fullMatchCount ?? 0),
      qdrantMapreduceOnlyCount: toNumber(qdrantSummary.mapreduceOnlyCount ?? 0),
      qdrantUnmatchedCount: toNumber(qdrantSummary.unmatchedCount ?? 0),
      sourceSpineCount: sourceSpine.length,
      vectorCompressionRatio: toNumber(vector64Compression.compressionRatio ?? vector64Compression.memorySavingsPercent ?? 0),
      vectorFromDim: toNumber(vector64Compression.fromDim ?? 768),
      vectorToDim: toNumber(vector64Compression.toDim ?? 64),
      vectorAvgError: toNumber(vector64Reconstruction.avgError ?? 0),
      pg18Healthy: Boolean(stackVerdict.pg18Healthy),
      redisHealthy: Boolean(stackVerdict.redisHealthy),
      bifrostHealthy: Boolean(stackVerdict.bifrostHealthy),
      allPass: Boolean(stackVerdict.allPass),
      nextMovesTopCount: nextMovesTop.length,
    },
    reuseRules: [
      'Use sourceRef + feature_id as the dedupe spine.',
      'Use parent_atlas_card_id only after path/file joins are resolved.',
      'Use Qdrant tags and registry prefix clusters to coalesce near-duplicate summaries.',
      'Keep TurboVec 64d compression as the packet prefilter, not the canonical store.',
      'Do not restate archive-only or experimental artifacts in Gemma summary packets.',
    ],
    gemmaPacketRecipe: {
      maxChunks: 10,
      maxSourceRefs: 5,
      maxSummaryTokens: 128,
      preferredInputs: [
        'parent atlas feature rows',
        'repo consolidation feature map',
        'missing-features review clusters',
        'qdrant path bridge rows',
        'vector64 compression metrics',
      ],
    },
    keepSet: {
      productionReadyCodePaths,
      canonicalTables,
    },
    reportSignals: {
      qdrantPrefixCounts: qdrantPrefixCounts.slice(0, 8),
      registryPrefixClusters: registryPrefixClusters.slice(0, 8).map((cluster) => ({
        prefix: cluster.prefix,
        count: cluster.count,
        featureIds: cluster.featureIds ?? [],
      })),
      nextMovesTop,
    },
    sourceRefInventory: {
      joinSpine: sourceSpine,
      artifactCategories: Object.fromEntries(
        Object.entries(sourceRefInventory.existing_artifacts ?? {}).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.length : count(value),
        ])
      ),
    },
    qdrantBridge: {
      summary: qdrantSummary,
      qdrantPrefixCounts: qdrantPrefixCounts.slice(0, 8),
    },
    repoConsolidation,
  };
}

function buildMarkdown(report) {
  const s = report.summary;
  const lines = [
    '# Parent Atlas TurboVec Compression Plan',
    '',
    'This plan reuses the existing parent-atlas, Qdrant bridge, vector64, and repo-consolidation outputs.',
    '',
    '## What already exists',
    '',
    `- Parent atlas: ${s.parentAtlasCardsLoaded} cards, ${s.parentAtlasClusters} clusters`,
    `- TurboVec lane: ${s.vectorFromDim}d -> ${s.vectorToDim}d, ${s.vectorCompressionRatio}% compression, avg error ${s.vectorAvgError}`,
    `- Qdrant bridge sample: ${s.qdrantPointCount} points, ${s.qdrantBridgeRows} bridge rows, ${s.qdrantFullMatchCount} full matches, ${s.qdrantUnmatchedCount} unmatched`,
    `- Missing-features review: ${s.registryPrefixClusterCount} registry prefix clusters, ${s.mapreducePrefixClusterCount} mapreduce prefix clusters, ${s.duplicateSystemCount} duplicate-system pairs`,
    `- Stack health: pg18=${s.pg18Healthy ? 'healthy' : 'degraded'}, redis=${s.redisHealthy ? 'healthy' : 'degraded'}, bifrost=${s.bifrostHealthy ? 'healthy' : 'degraded'}`,
    '',
    '## Reuse rules',
    '',
    ...report.reuseRules.map((rule) => `- ${rule}`),
    '',
    '## Gemma summary packet',
    '',
    `- Max chunks: ${report.gemmaPacketRecipe.maxChunks}`,
    `- Max sourceRefs: ${report.gemmaPacketRecipe.maxSourceRefs}`,
    `- Max summary tokens: ${report.gemmaPacketRecipe.maxSummaryTokens}`,
    `- Preferred inputs: ${report.gemmaPacketRecipe.preferredInputs.join(', ')}`,
    '',
    '## Keep set',
    '',
    '### Production-ready code paths',
    ...report.keepSet.productionReadyCodePaths.map((p) => `- ${p}`),
    '',
    '### Canonical production tables',
    ...report.keepSet.canonicalTables.map((t) => `- ${t.table} (${t.status})`),
    '',
    '## Key clusters to reuse',
    '',
    ...report.reportSignals.registryPrefixClusters.map(
      (cluster) => `- ${cluster.prefix}: ${cluster.count} refs; featureIds=${cluster.featureIds.join(', ')}`
    ),
    '',
    '## Do not repeat',
    '',
    '- Archive-only snapshots',
    '- Experimental lanes (local-deep-research SQLite, cuVS/CAGRA, WSL2-only override)',
    '- Duplicate generated reports that already landed in docs/reports',
    '',
    '## Next step',
    '',
    'Generate compact Gemma packets from the existing parent-atlas and cluster signals instead of rebuilding summaries from raw files.',
  ];
  return `${lines.join('\n')}\n`;
}

function buildSvg(report) {
  const cards = [
    { label: 'ship', value: report.keepSet.productionReadyCodePaths.length, x: 90, y: 120, fill: '#1d4ed8' },
    { label: 'planned', value: report.repoConsolidation.planned_production.length, x: 290, y: 120, fill: '#0891b2' },
    { label: 'exp', value: report.repoConsolidation.experimental.length, x: 490, y: 120, fill: '#7c3aed' },
    { label: 'archive', value: report.repoConsolidation.archive_candidates.length, x: 690, y: 120, fill: '#dc2626' },
  ];

  const hexPoints = (cx, cy, r = 54) => [
    [cx - r * 0.5, cy - r * 0.866],
    [cx + r * 0.5, cy - r * 0.866],
    [cx + r, cy],
    [cx + r * 0.5, cy + r * 0.866],
    [cx - r * 0.5, cy + r * 0.866],
    [cx - r, cy],
  ]
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');

  const hexes = cards.map((card) => `
    <g>
      <polygon points="${hexPoints(card.x, card.y)}" fill="${card.fill}" fill-opacity="0.18" stroke="${card.fill}" stroke-width="3"/>
      <text x="${card.x}" y="${card.y - 8}" text-anchor="middle" font-family="Consolas, monospace" font-size="24" fill="#111827">${card.value}</text>
      <text x="${card.x}" y="${card.y + 18}" text-anchor="middle" font-family="Consolas, monospace" font-size="14" fill="#374151">${card.label}</text>
    </g>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="860" height="260" viewBox="0 0 860 260" role="img" aria-label="Parent atlas TurboVec compression plan">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <text x="40" y="38" font-family="Consolas, monospace" font-size="20" fill="#111827">Parent Atlas TurboVec Compression Plan</text>
  <text x="40" y="60" font-family="Consolas, monospace" font-size="12" fill="#475569">Use sourceRef + feature_id dedupe; keep Gemma packets compact and repeat-free.</text>
  ${hexes}
  <text x="40" y="214" font-family="Consolas, monospace" font-size="12" fill="#475569">Atlas cards: ${report.summary.parentAtlasCardsLoaded} | clusters: ${report.summary.parentAtlasClusters} | vector64: ${report.summary.vectorCompressionRatio}%</text>
  <text x="40" y="232" font-family="Consolas, monospace" font-size="12" fill="#475569">Qdrant bridge: ${report.summary.qdrantBridgeRows} rows | missing features: ${report.summary.mapreducePrefixClusterCount} prefix clusters</text>
</svg>
`;
}

function main() {
  const inputs = loadInputs();
  const report = buildSummary(inputs);

  ensureReportsDir();
  writeFileSync(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(OUTPUT_MD, buildMarkdown(report), 'utf8');
  writeFileSync(OUTPUT_SVG, buildSvg(report), 'utf8');

  console.log(`Wrote ${OUTPUT_JSON}`);
  console.log(`Wrote ${OUTPUT_MD}`);
  console.log(`Wrote ${OUTPUT_SVG}`);
  console.log(
    JSON.stringify(
      {
        parentAtlasCardsLoaded: report.summary.parentAtlasCardsLoaded,
        vectorCompressionRatio: report.summary.vectorCompressionRatio,
        qdrantBridgeRows: report.summary.qdrantBridgeRows,
        registryPrefixClusterCount: report.summary.registryPrefixClusterCount,
      },
      null,
      2
    )
  );
}

main();
