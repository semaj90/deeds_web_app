#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const QDRANT_COLLECTION = 'codebase_chunks_768';
const SAMPLE_LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 500);
const STEP_TIMEOUT_MS = Number(process.argv.find((arg) => arg.startsWith('--timeout='))?.split('=')[1] ?? 15000);

console.log('[topology-report] boot');
loadAtlasEnv(REPO_ROOT);

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function withTimeout(promise, label, timeoutMs = STEP_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function collectSomClusterStats(qdrantUrl) {
  const counts = new Map();
  let sampled = 0;
  let offset = null;

  while (sampled < SAMPLE_LIMIT) {
    const body = {
      limit: Math.min(100, SAMPLE_LIMIT - sampled),
      with_payload: ['som_cluster', 'feature_id', 'source_ref'],
      with_vector: false,
      ...(offset ? { offset } : {}),
    };

    const response = await fetch(`${qdrantUrl}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (!response?.ok) break;

    const data = await response.json().catch(() => ({}));
    const points = data?.result?.points ?? [];
    if (!points.length) break;

    for (const point of points) {
      sampled += 1;
      const payload = point.payload ?? {};
      const somCluster = payload.som_cluster ?? payload.somCluster ?? payload.cluster_id ?? null;
      if (somCluster === null || somCluster === undefined || somCluster === '') continue;
      const key = String(somCluster);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    offset = data?.result?.next_page_offset ?? null;
    if (!offset) break;
  }

  const sorted = [...counts.entries()]
    .map(([cluster, count]) => ({ cluster, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    sampled,
    withSomCluster: [...counts.values()].reduce((a, b) => a + b, 0),
    topClusters: sorted,
  };
}

async function main() {
  await fs.mkdir(REPORTS_DIR, { recursive: true });

  const { Pool } = await import('pg');
  const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
  const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 1,
    statement_timeout: 5000,
    connectionTimeoutMillis: 5000,
  });

  console.log('[topology-report] loading graph functions...');
  const { getGdsStatus, getTopAuthorityNodes } = await withTimeout(
    import('../../src/lib/server/graph/neo4j-gds.ts'),
    'neo4j-gds-import',
    10000
  );

  console.log('[topology-report] probing GDS status...');
  const gdsStatus = await withTimeout(
    getGdsStatus().catch((err) => ({ apocAvailable: false, gdsAvailable: false, projectionExists: false, error: String(err) })),
    'gds-status'
  );

  console.log('[topology-report] loading top authority nodes...');
  const topAuthorityNodes = await withTimeout(
    getTopAuthorityNodes(10).catch(() => []),
    'top-authority-nodes'
  );

  console.log('[topology-report] sampling Qdrant SOM labels...');
  const somStats = await withTimeout(
    collectSomClusterStats(QDRANT_URL).catch(() => ({ sampled: 0, withSomCluster: 0, topClusters: [] })),
    'som-cluster-stats'
  );

  console.log('[topology-report] querying retrieval telemetry...');
  const telemetryCounts = await withTimeout(
    pool.query(
      `SELECT
         COUNT(*)::int AS total_rows,
         COUNT(*) FILTER (WHERE cache_hit)::int AS cache_hits,
         COUNT(*) FILTER (WHERE retrieval_strategy = 'fusion')::int AS fusion_rows,
         COUNT(*) FILTER (WHERE retrieval_strategy = 'cold_neschrom')::int AS cold_rows,
         COALESCE(AVG(latency_ms), 0)::float AS avg_latency_ms
       FROM retrieval_telemetry`
    ).then((r) => r.rows[0]).catch(() => ({ total_rows: 0, cache_hits: 0, fusion_rows: 0, cold_rows: 0, avg_latency_ms: 0 })),
    'retrieval-telemetry'
  );

  const report = {
    generated_at: new Date().toISOString(),
    qdrant_collection: QDRANT_COLLECTION,
    qdrant_url: QDRANT_URL,
    structural: {
      gdsAvailable: gdsStatus.gdsAvailable ?? false,
      apocAvailable: gdsStatus.apocAvailable ?? false,
      projectionExists: gdsStatus.projectionExists ?? false,
      pageRankNodeCount: 0,
      louvainCommunityCount: 0,
      knnRelationshipCount: 0,
      unclassifiedFileCount: 0,
    },
    qdrant: {
      qdrantTopoByteCoverage: null,
      qdrantManifold4Coverage: null,
      qdrantAuthorityCoverage: null,
      somSampleSize: somStats.sampled,
      somClusterRows: somStats.withSomCluster,
      topSomClusters: somStats.topClusters,
    },
    authority: {
      topNodes: topAuthorityNodes.map((node) => ({
        stableKey: node.stableKey,
        path: node.path ?? null,
        graphPageRank: node.graphPageRank,
        louvainCommunity: node.louvainCommunity ?? null,
      })),
    },
    telemetry: {
      totalRows: Number(telemetryCounts?.total_rows ?? 0),
      cacheHits: Number(telemetryCounts?.cache_hits ?? 0),
      fusionRows: Number(telemetryCounts?.fusion_rows ?? 0),
      coldRows: Number(telemetryCounts?.cold_rows ?? 0),
      avgLatencyMs: Number(telemetryCounts?.avg_latency_ms ?? 0),
    },
  };

  const md = `# Topology Report

Generated: ${report.generated_at}

## Structural

- GDS available: ${report.structural.gdsAvailable ? 'yes' : 'no'}
- APOC available: ${report.structural.apocAvailable ? 'yes' : 'no'}
- Projection exists: ${report.structural.projectionExists ? 'yes' : 'no'}
- PageRank nodes updated: ${report.structural.pageRankNodeCount}
- Louvain communities: ${report.structural.louvainCommunityCount}
- KNN relationships: ${report.structural.knnRelationshipCount}
- Unclassified files: ${report.structural.unclassifiedFileCount}

## Qdrant / SOM

- Qdrant topo_byte coverage: ${report.qdrant.qdrantTopoByteCoverage ?? 'n/a'}
- Qdrant manifold4 coverage: ${report.qdrant.qdrantManifold4Coverage ?? 'n/a'}
- Qdrant authority coverage: ${report.qdrant.qdrantAuthorityCoverage ?? 'n/a'}
- SOM sample size: ${report.qdrant.somSampleSize}
- SOM-backed rows in sample: ${report.qdrant.somClusterRows}

### Top SOM clusters

${report.qdrant.topSomClusters.length > 0
    ? report.qdrant.topSomClusters.map((row) => `- ${row.cluster}: ${row.count}`).join('\n')
    : '- none found'}

## Authority

${report.authority.topNodes.length > 0
    ? report.authority.topNodes.map((node) => `- ${node.stableKey} (PR=${node.graphPageRank.toFixed(4)}, Louvain=${node.louvainCommunity ?? 'n/a'})`).join('\n')
    : '- no authority nodes returned'}

## Retrieval Telemetry

- Rows: ${report.telemetry.totalRows}
- Cache hits: ${report.telemetry.cacheHits}
- Fusion rows: ${report.telemetry.fusionRows}
- Cold rows: ${report.telemetry.coldRows}
- Average latency ms: ${report.telemetry.avgLatencyMs.toFixed(2)}
`;

  await fs.writeFile(path.join(REPORTS_DIR, 'topology-report.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(REPORTS_DIR, 'topology-report.md'), md);

  console.log(`Wrote ${path.join(REPORTS_DIR, 'topology-report.json')}`);
  console.log(`Wrote ${path.join(REPORTS_DIR, 'topology-report.md')}`);
  await pool.end().catch(() => {});
}

await main();
