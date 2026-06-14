#!/usr/bin/env node
/**
 * Read-only live higher-hop enrichment audit.
 *
 * Extends the existing higher-hop summary with live Neo4j degree checks,
 * supernode thresholds, and join-hint guidance so traversal lanes stay
 * anchored on packet_key / source_ref_key roots.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '../..');
const MONO_ROOT = path.resolve(APP_ROOT, '..');
const REPORTS_DIR = path.join(APP_ROOT, 'docs', 'reports');
const OUT_JSON = path.join(REPORTS_DIR, 'higher-hop-enrichment-live-report.json');
const OUT_MD = path.join(REPORTS_DIR, 'higher-hop-enrichment-live-report.md');

const FEATURE_LINEAGE_JSON = path.join(APP_ROOT, 'docs', 'reports', 'feature-lineage-report.json');
const RUNTIME_COVERAGE_JSON = path.join(APP_ROOT, 'docs', 'reports', 'runtime-coverage-report.json');
const HIGHER_HOP_JSON = path.join(APP_ROOT, 'docs', 'reports', 'higher-hop-enrichment-report.json');
const RRF_BENCH_JSON = path.join(MONO_ROOT, 'docs', 'reports', 'rrf-20-query-benchmark.json');

const SUPERNODE_THRESHOLDS = {
  concept: 500,
  feature: 1000,
  community: 2000,
};

const SAFE_START_NODES = ['packet_key', 'source_ref_key', 'qdrant_point_id'];

loadAtlasEnv(APP_ROOT);

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

function buildJoinHintGuidance() {
  return [
    'Anchor traversals on bounded roots: packet_key, source_ref_key, or qdrant_point_id.',
    'Avoid starting from Concept / Feature / Community supernodes.',
    'Use USING JOIN ON p when joining separate packet and concept branches.',
    'Split fan-out traversals into subqueries when node degree is high.',
    'Keep Neo4j for explanation and topology; keep Postgres/Qdrant for truth and recall.',
  ];
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Higher-Hop Enrichment Live Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- feature-lineage sourceRef coverage: ${report.featureLineage.sourceRefCoveragePct}%`);
  lines.push(`- feature-lineage featureId coverage: ${report.featureLineage.featureIdCoveragePct}%`);
  lines.push(`- runtime selected_concepts coverage: ${report.runtime.selectedConceptCoveragePct}%`);
  lines.push(`- runtime retrieved_packets coverage: ${report.runtime.retrievedPacketCoveragePct}%`);
  lines.push(`- Neo4j available: ${report.neo4j.available ? 'yes' : 'no'}`);
  lines.push(`- supernode thresholds: concept>${SUPERNODE_THRESHOLDS.concept}, feature>${SUPERNODE_THRESHOLDS.feature}, community>${SUPERNODE_THRESHOLDS.community}`);
  if (Object.keys(report.queryErrors ?? {}).length > 0) {
    lines.push('- live supernode query errors present');
  }
  lines.push('');
  lines.push('## Join-Hint Guidance');
  lines.push('');
  for (const item of report.joinHintGuidance) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('## Safe Start Nodes');
  lines.push('');
  for (const item of report.safeStartNodes) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('## Supernodes');
  lines.push('');
  lines.push('| Label | Threshold | Count Above Threshold | Top Degree | State |');
  lines.push('|-------|-----------|-----------------------|------------|-------|');
  for (const item of report.supernodes) {
    lines.push(`| ${item.label} | ${item.threshold} | ${item.countAboveThreshold} | ${item.topDegree ?? 'n/a'} | ${item.state} |`);
  }
  if (Object.keys(report.queryErrors ?? {}).length > 0) {
    lines.push('');
    lines.push('### Query Errors');
    for (const [label, error] of Object.entries(report.queryErrors)) {
      lines.push(`- ${label}: ${error}`);
    }
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- This audit is read-only.');
  lines.push('- It complements the existing higher-hop coverage report by adding live graph risk guidance.');
  lines.push('- When the Neo4j graph is unavailable, the audit still writes a report with unavailable status.');
  lines.push('');
  return lines.join('\n');
}

async function probeNeo4j() {
  const uri = String(process.env.NEO4J_URI || process.env.NEO4J_URL || 'bolt://127.0.0.1:7687').trim();
  const user = String(process.env.NEO4J_USER || 'neo4j').trim() || 'neo4j';
  const password = String(process.env.NEO4J_PASSWORD || process.env.NEO4J_PASS || 'neo4j').trim() || 'neo4j';
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    disableLosslessIntegers: true,
    connectionTimeout: 5000,
    maxTransactionRetryTime: 0,
  });

  const session = driver.session({ database: 'neo4j' });
  try {
    await session.run('RETURN 1 AS ok');
    return { available: true, driver, uri };
  } catch (error) {
    await driver.close().catch(() => {});
    return { available: false, error: error instanceof Error ? error.message : String(error), uri };
  } finally {
    await session.close().catch(() => {});
  }
}

async function querySupernodes(driver, label, keyFields, threshold, limit = 25) {
  const session = driver.session({ database: 'neo4j' });
  try {
    const query = `
      MATCH (n:${label})
      WITH n, COUNT { (n)--() } AS degree
      WHERE degree >= $threshold
      RETURN
        coalesce(${keyFields.join(', ')}, '') AS id,
        degree
      ORDER BY degree DESC, id ASC
      LIMIT toInteger($limit)
    `;
    const result = await session.run(query, { threshold, limit });
    return result.records.map((record) => ({
      id: String(record.get('id') ?? ''),
      degree: Number(record.get('degree') ?? 0),
    }));
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      rows: [],
    };
  } finally {
    await session.close().catch(() => {});
  }
}

async function main() {
  const generatedAt = new Date().toISOString();
  const featureLineage = readJson(FEATURE_LINEAGE_JSON) ?? {};
  const runtimeCoverage = readJson(RUNTIME_COVERAGE_JSON) ?? {};
  const higherHopReport = readJson(HIGHER_HOP_JSON) ?? {};
  const rrf = readJson(RRF_BENCH_JSON) ?? {};

  const featureSummary = featureLineage.summary ?? {};
  const higherHopCoverage = featureSummary.higherHopCoverage ?? {};
  const lineages = Number(featureSummary.totalLineages ?? featureSummary.totalRows ?? 0);
  const joinHintGuidance = buildJoinHintGuidance();

  const neo4jProbe = await probeNeo4j();
  const supernodes = [];
  const queryErrors = {};

  if (neo4jProbe.available) {
    const conceptRows = await querySupernodes(
      neo4jProbe.driver,
      'Concept',
      ['n.id', 'n.concept_id', 'n.name'],
      SUPERNODE_THRESHOLDS.concept
    );
    const featureRows = await querySupernodes(
      neo4jProbe.driver,
      'Feature',
      ['n.id', 'n.feature_id', 'n.name'],
      SUPERNODE_THRESHOLDS.feature
    );
    const communityRows = await querySupernodes(
      neo4jProbe.driver,
      'Community',
      ['n.id', 'n.community_id', 'n.name'],
      SUPERNODE_THRESHOLDS.community
    );

    const buildItem = (label, threshold, rows) => {
      if (!Array.isArray(rows)) {
        queryErrors[label] = rows?.error ?? 'unknown query failure';
        return {
          label,
          threshold,
          countAboveThreshold: 0,
          topDegree: null,
          state: 'QUERY_ERROR',
          examples: [],
        };
      }

      return {
        label,
        threshold,
        countAboveThreshold: rows.length,
        topDegree: rows.length > 0 ? rows[0].degree : null,
        state: rows.length > 0 ? 'SUPERNODE_RISK' : 'OK',
        examples: rows.slice(0, 5),
      };
    };

    supernodes.push(buildItem('Concept', SUPERNODE_THRESHOLDS.concept, conceptRows));
    supernodes.push(buildItem('Feature', SUPERNODE_THRESHOLDS.feature, featureRows));
    supernodes.push(buildItem('Community', SUPERNODE_THRESHOLDS.community, communityRows));

    await neo4jProbe.driver.close().catch(() => {});
  } else {
    supernodes.push(
      { label: 'Concept', threshold: SUPERNODE_THRESHOLDS.concept, countAboveThreshold: 0, topDegree: null, state: 'NEO4J_UNAVAILABLE', examples: [] },
      { label: 'Feature', threshold: SUPERNODE_THRESHOLDS.feature, countAboveThreshold: 0, topDegree: null, state: 'NEO4J_UNAVAILABLE', examples: [] },
      { label: 'Community', threshold: SUPERNODE_THRESHOLDS.community, countAboveThreshold: 0, topDegree: null, state: 'NEO4J_UNAVAILABLE', examples: [] }
    );
  }

  const report = {
    generatedAt,
    sourceReports: {
      higherHop: path.relative(APP_ROOT, HIGHER_HOP_JSON).replace(/\\/g, '/'),
      featureLineage: path.relative(APP_ROOT, FEATURE_LINEAGE_JSON).replace(/\\/g, '/'),
      runtimeCoverage: path.relative(APP_ROOT, RUNTIME_COVERAGE_JSON).replace(/\\/g, '/'),
      rrf: path.relative(APP_ROOT, RRF_BENCH_JSON).replace(/\\/g, '/'),
    },
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
      routeRuntimePackets: runtimeCoverage?.routeRuntimePackets ?? {
        total: 0,
        lowDensityCount: 0,
        emptyPointersCount: 0,
        avgHydrationRatio: 'n/a',
      },
    },
    higherHop: higherHopReport?.hops ?? {},
    rrf: {
      avgNdcg: rrf?.summary?.rrf_default?.avgNdcg ?? null,
      avgMrr: rrf?.summary?.rrf_default?.avgMrr ?? null,
      avgRecall: rrf?.summary?.rrf_default?.avgRecall ?? null,
    },
    neo4j: neo4jProbe.available
      ? { available: true, uri: neo4jProbe.uri }
      : { available: false, uri: neo4jProbe.uri, error: neo4jProbe.error ?? 'unavailable' },
    safeStartNodes: SAFE_START_NODES,
    joinHintGuidance,
    supernodeThresholds: SUPERNODE_THRESHOLDS,
    supernodes,
    queryErrors,
    recommendations: [
      ...(
        Number(featureSummary.missingHigherHopRows ?? 0) > 0
          ? ['Seed bounded USED_CONCEPT / USED_PACKET edges from the trace spine']
          : []
      ),
      ...(
        supernodes.some((item) => item.state === 'SUPERNODE_RISK')
          ? ['Use packet_key / source_ref_key as join roots before expanding graph traversal']
          : []
      ),
    ],
    coverageState: {
      featureLineage: coverageState(featureSummary.sourceRefCoveragePct ?? 0),
      runtime: coverageState(runtimeCoverage?.agentTraces?.selectedConceptCoveragePct ?? 0),
    },
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
