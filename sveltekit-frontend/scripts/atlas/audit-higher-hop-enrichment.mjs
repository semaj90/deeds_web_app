#!/usr/bin/env node
/**
 * Higher-hop enrichment audit.
 *
 * Read-only summary of the remaining lineage gaps after sourceRef / featureId
 * coverage is green. This is intentionally a report-only lane.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '../..');
const MONO_ROOT = path.resolve(APP_ROOT, '..');
const REPORTS_DIR = path.join(APP_ROOT, 'docs', 'reports');
const OUT_JSON = path.join(REPORTS_DIR, 'higher-hop-enrichment-report.json');
const OUT_MD = path.join(REPORTS_DIR, 'higher-hop-enrichment-report.md');

const FEATURE_LINEAGE_JSON = path.join(APP_ROOT, 'docs', 'reports', 'feature-lineage-report.json');
const RUNTIME_COVERAGE_JSON = path.join(APP_ROOT, 'docs', 'reports', 'runtime-coverage-report.json');
const RRF_BENCH_JSON = path.join(MONO_ROOT, 'docs', 'reports', 'rrf-20-query-benchmark.json');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function pct(part, total) {
  if (!total) return 0;
  return Number(((Number(part) / Number(total)) * 100).toFixed(2));
}

function coverageState(pctValue) {
  if (pctValue >= 90) return 'READY';
  if (pctValue > 0) return 'PARTIAL';
  return 'MISSING';
}

function buildRecommendations(hops) {
  const order = ['somCluster', 'glyphRecord', 'qdrantHit', 'redisHotKey', 'neo4jNode'];
  const labels = {
    somCluster: 'Re-derive som_cluster from topology / cluster join',
    glyphRecord: 'Materialize glyph_record from SOM / glyph lane',
    qdrantHit: 'Backfill qdrant_point_id / Qdrant payload join',
    redisHotKey: 'Replay runtime packets and restore Redis hot keys',
    neo4jNode: 'Relink or materialize Neo4j node mapping',
  };

  return order
    .filter((hop) => hops[hop]?.missingRows > 0 || hops[hop]?.state !== 'READY')
    .map((hop) => ({
      hop,
      state: hops[hop]?.state ?? 'MISSING',
      missingRows: hops[hop]?.missingRows ?? 0,
      coveragePct: hops[hop]?.coveragePct ?? 0,
      recommendation: labels[hop],
    }));
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Higher-Hop Enrichment Report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- feature-lineage sourceRef coverage: ${report.featureLineage.sourceRefCoveragePct}%`);
  lines.push(`- feature-lineage featureId coverage: ${report.featureLineage.featureIdCoveragePct}%`);
  lines.push(`- selected_concepts coverage: ${report.runtime.selectedConceptCoveragePct}%`);
  lines.push(`- runtime packet rows: ${report.runtime.routeRuntimePackets.total}`);
  lines.push(`- RRF avgNDCG@10: ${report.rrf.avgNdcg ?? 'n/a'}`);
  lines.push('');
  lines.push('## Hop Coverage');
  lines.push('');
  lines.push('| Hop | Coverage | State | Missing Rows |');
  lines.push('|-----|----------|-------|--------------|');
  for (const hop of Object.values(report.hops)) {
    lines.push(`| ${hop.name} | ${hop.coveragePct}% | ${hop.state} | ${hop.missingRows} |`);
  }
  lines.push('');
  lines.push('## Recommended Next Actions');
  lines.push('');
  if (report.recommendations.length === 0) {
    lines.push('- No higher-hop enrichments are currently required.');
  } else {
    for (const rec of report.recommendations) {
      lines.push(`- ${rec.recommendation} (${rec.coveragePct}%, ${rec.missingRows} missing rows)`);
    }
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- This is a report-only lane.');
  lines.push('- The gap rows are higher-hop lineage fields, not base sourceRef/featureId coverage.');
  lines.push('- Use the existing backfill scripts only after the report indicates a concrete fill path.');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const generatedAt = new Date().toISOString();
  const featureLineage = readJson(FEATURE_LINEAGE_JSON) ?? {};
  const runtimeCoverage = readJson(RUNTIME_COVERAGE_JSON) ?? {};
  const rrf = readJson(RRF_BENCH_JSON) ?? {};

  const featureSummary = featureLineage.summary ?? {};
  const higherHopCoverage = featureSummary.higherHopCoverage ?? {};
  const lineages = Number(featureSummary.totalLineages ?? featureSummary.totalRows ?? 0);

  const hops = {
    somCluster: {
      name: 'somCluster',
      coveragePct: pct(higherHopCoverage.somClusterRows ?? 0, lineages),
      missingRows: Number(featureSummary.missingHigherHopRows ?? 0),
      state: coverageState(pct(higherHopCoverage.somClusterRows ?? 0, lineages)),
    },
    glyphRecord: {
      name: 'glyphRecord',
      coveragePct: pct(higherHopCoverage.glyphRecordRows ?? 0, lineages),
      missingRows: Number(featureSummary.missingHigherHopRows ?? 0),
      state: coverageState(pct(higherHopCoverage.glyphRecordRows ?? 0, lineages)),
    },
    qdrantHit: {
      name: 'qdrantHit',
      coveragePct: pct(higherHopCoverage.qdrantHitRows ?? 0, lineages),
      missingRows: Number(featureSummary.missingHigherHopRows ?? 0),
      state: coverageState(pct(higherHopCoverage.qdrantHitRows ?? 0, lineages)),
    },
    redisHotKey: {
      name: 'redisHotKey',
      coveragePct: pct(higherHopCoverage.redisHotKeyRows ?? 0, lineages),
      missingRows: Number(featureSummary.missingHigherHopRows ?? 0),
      state: coverageState(pct(higherHopCoverage.redisHotKeyRows ?? 0, lineages)),
    },
    neo4jNode: {
      name: 'neo4jNode',
      coveragePct: pct(higherHopCoverage.neo4jNodeRows ?? 0, lineages),
      missingRows: Number(featureSummary.missingHigherHopRows ?? 0),
      state: coverageState(pct(higherHopCoverage.neo4jNodeRows ?? 0, lineages)),
    },
  };

  const report = {
    generatedAt,
    featureLineage: {
      totalLineages: lineages,
      sourceRefCoveragePct: featureSummary.sourceRefCoveragePct ?? 0,
      featureIdCoveragePct: featureSummary.featureIdCoveragePct ?? 0,
      featureLabelCoveragePct: featureSummary.featureLabelCoveragePct ?? 0,
      missingHigherHopRows: featureSummary.missingHigherHopRows ?? 0,
    },
    runtime: {
      selectedConceptCoveragePct: runtimeCoverage?.agentTraces?.selectedConceptCoveragePct ?? 0,
      retrievedPacketCoveragePct: runtimeCoverage?.agentTraces?.retrievedPacketCoveragePct ?? 0,
      toolCallCoveragePct: runtimeCoverage?.agentTraces?.toolCallCoveragePct ?? 0,
      routeRuntimePackets: runtimeCoverage?.routeRuntimePackets ?? { total: 0, lowDensityCount: 0, emptyPointersCount: 0, avgHydrationRatio: 'n/a' },
    },
    rrf: {
      avgNdcg: rrf?.summary?.rrf_default?.avgNdcg ?? null,
      avgMrr: rrf?.summary?.rrf_default?.avgMrr ?? null,
      avgRecall: rrf?.summary?.rrf_default?.avgRecall ?? null,
    },
    hops,
    recommendations: buildRecommendations(hops),
  };

  await fsp.mkdir(REPORTS_DIR, { recursive: true });
  await fsp.writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsp.writeFile(OUT_MD, buildMarkdown(report), 'utf8');

  console.log(JSON.stringify({ ok: true, report }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
