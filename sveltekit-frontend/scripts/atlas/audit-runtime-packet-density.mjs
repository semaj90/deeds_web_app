#!/usr/bin/env node

/**
 * Read-only auditor for route_runtime_packets density.
 * Measures how much semantic payload survived compared with structural pointers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const JSON_OUT = path.join(REPORTS_DIR, 'runtime-packet-density-report.json');
const MD_OUT = path.join(REPORTS_DIR, 'runtime-packet-density-report.md');

loadAtlasEnv(REPO_ROOT);

function parseLimit(argv) {
  const match = argv.find((arg) => arg.startsWith('--limit='));
  const envLimit = process.env.npm_config_limit;
  const value = Number.parseInt(match?.split('=')[1] ?? envLimit ?? '100', 10);
  return Number.isFinite(value) && value > 0 ? value : 100;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function stringifyOrEmpty(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function calculateDensity(packetStr, semanticStr, counts) {
  const packetBytes = Buffer.byteLength(packetStr, 'utf8');
  const semanticBytes = Buffer.byteLength(semanticStr, 'utf8');
  const structuralPointers =
    counts.sourceRefs + counts.featureIds + counts.qdrantHits + counts.redisKeys + counts.parentAtlasDocuments;
  const hydrationRatio = packetBytes > 0 ? (semanticBytes / packetBytes) * 100 : 0;

  let classification = 'optimal';
  if (structuralPointers === 0) classification = 'empty-pointers';
  else if (hydrationRatio < 15) classification = 'low-density';

  return {
    packetBytes,
    semanticBytes,
    hydrationRatio,
    classification,
  };
}

function getRepairSuggestion(counts, density) {
  if (density.classification === 'low-density') {
    if (counts.redisKeys > 0 && counts.parentAtlasDocuments === 0) {
      return 'Hydration miss: fallback to parent_atlas_documents is needed for LOD0 misses.';
    }
    if (counts.qdrantHits === 0 && counts.featureIds > 0) {
      return 'Hydration miss: topological evidence exists, but vector hits are absent.';
    }
    return 'Hydration miss: pointers resolved, but semantic text was stripped. Check context hydration.';
  }

  if (counts.sourceRefs === 0 && counts.featureIds > 0) {
    return 'Topology gap: join featureId against Neo4j to resolve sourceRefs.';
  }

  if (counts.qdrantHits === 0) {
    return 'Vector gap: ensure TurboVec/Qdrant threshold is yielding hits.';
  }

  return 'None';
}

async function main() {
  const limit = parseLimit(process.argv.slice(2));
  const dbUrl = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

  ensureDir(JSON_OUT);

  const pool = new Pool({ connectionString: dbUrl });
  try {
    console.log(`\nAuditing Runtime Packet Density (limit=${limit})...`);

    const query = `
      SELECT
        id,
        route,
        query_hash,
        query_preview,
        source_refs,
        feature_ids,
        lane_ids,
        cluster_id,
        som_cluster,
        qdrant_hits,
        redis_hot_keys,
        latency_ms,
        cache_hit,
        cache_tier,
        user_id,
        session_id,
        response_tokens,
        captured_at
      FROM route_runtime_packets
      ORDER BY captured_at DESC
      LIMIT $1
    `;

    const { rows } = await pool.query(query, [limit]);
    const allSourceRefs = [...new Set(rows.flatMap((row) => asArray(row.source_refs)).filter(Boolean).map((v) => String(v)))];
    const parentAtlasJoinSet = new Set();
    if (allSourceRefs.length > 0) {
      const joinResult = await pool.query(
        'SELECT DISTINCT source_ref FROM parent_atlas_documents WHERE source_ref = ANY($1::text[])',
        [allSourceRefs],
      );
      for (const row of joinResult.rows) {
        parentAtlasJoinSet.add(String(row.source_ref));
      }
    }

    const analysis = [];
    const summary = {
      totalAnalyzed: rows.length,
      lowDensityCount: 0,
      optimalCount: 0,
      emptyPointersCount: 0,
      avgHydrationRatio: '0%',
      missingFieldsTally: {},
    };

    let totalRatio = 0;

    for (const row of rows) {
      const sourceRefs = asArray(row.source_refs).map((value) => String(value));
      const featureIds = asArray(row.feature_ids).map((value) => String(value));
      const laneIds = asArray(row.lane_ids).map((value) => String(value));
      const redisHotKeys = asArray(row.redis_hot_keys).map((value) => String(value));
      const semanticPacket = {
        route: row.route,
        queryHash: row.query_hash,
        queryPreview: row.query_preview,
        sourceRefs,
        featureIds,
        laneIds,
        clusterId: row.cluster_id,
        somCluster: row.som_cluster,
        qdrantHits: row.qdrant_hits,
        redisHotKeys,
        latencyMs: row.latency_ms,
        cacheHit: row.cache_hit,
        cacheTier: row.cache_tier,
        userId: row.user_id,
        sessionId: row.session_id,
        responseTokens: row.response_tokens,
      };

      const counts = {
        sourceRefs: sourceRefs.length,
        featureIds: featureIds.length,
        qdrantHits: Number.isFinite(Number(row.qdrant_hits)) ? Number(row.qdrant_hits) : 0,
        redisKeys: redisHotKeys.length,
        parentAtlasDocuments: sourceRefs.filter((sourceRef) => parentAtlasJoinSet.has(sourceRef)).length,
        somCluster: row.som_cluster ? 1 : 0,
        glyphRecord: 0,
        neo4jNode: 0,
        rankedCards: 0,
      };

      for (const field of Object.keys(counts)) {
        if (counts[field] === 0) {
          summary.missingFieldsTally[field] = (summary.missingFieldsTally[field] ?? 0) + 1;
        }
      }

      const density = calculateDensity(
        stringifyOrEmpty(row),
        stringifyOrEmpty(semanticPacket),
        counts,
      );

      if (density.classification === 'low-density') summary.lowDensityCount += 1;
      if (density.classification === 'optimal') summary.optimalCount += 1;
      if (density.classification === 'empty-pointers') summary.emptyPointersCount += 1;

      totalRatio += density.hydrationRatio;

      analysis.push({
        packetId: row.id,
        timestamp: row.created_at,
        counts,
        byteMetrics: {
          packetBytes: density.packetBytes,
          semanticBytes: density.semanticBytes,
        },
        densityScore: `${density.hydrationRatio.toFixed(2)}%`,
        classification: density.classification,
        missingFields: Object.keys(counts).filter((key) => counts[key] === 0),
        suggestedRepair: getRepairSuggestion(counts, density),
      });
    }

    summary.avgHydrationRatio = rows.length > 0 ? `${(totalRatio / rows.length).toFixed(2)}%` : '0%';

    const reportData = {
      generatedAt: new Date().toISOString(),
      mode: 'dry-run',
      summary,
      details: analysis,
    };

    fs.writeFileSync(JSON_OUT, `${JSON.stringify(reportData, null, 2)}\n`, 'utf8');

    const md = [
      '# Runtime Packet Density Report',
      '',
      `Generated: ${reportData.generatedAt}`,
      `Analyzed Packets: ${summary.totalAnalyzed}`,
      '',
      '## Summary',
      '',
      `- Optimal Density: ${summary.optimalCount}`,
      `- Low Density (Hollow): ${summary.lowDensityCount}`,
      `- Empty Pointer Packets: ${summary.emptyPointersCount}`,
      `- Average Hydration Ratio: ${summary.avgHydrationRatio}`,
      '',
      '## Top Missing Fields',
      '',
      ...Object.entries(summary.missingFieldsTally)
        .sort((a, b) => b[1] - a[1])
        .map(([field, count]) => `- ${field}: missing in ${count} packets`),
      ...(Object.keys(summary.missingFieldsTally).length === 0 ? ['- none'] : []),
      '',
      '## Packet Details',
      '',
      '| Packet ID | Density Ratio | Classification | Pointers (Ref/Feat/Qdrant/Redis) | Suggested Repair |',
      '|-----------|---------------|----------------|----------------------------------|------------------|',
      ...analysis.map((item) => {
        const pointers = `${item.counts.sourceRefs}/${item.counts.featureIds}/${item.counts.qdrantHits}/${item.counts.redisKeys}`;
        return `| \`${String(item.packetId).split('-')[0]}...\` | ${item.densityScore} | ${item.classification} | ${pointers} | ${item.suggestedRepair} |`;
      }),
      '',
    ].join('\n');

    fs.writeFileSync(MD_OUT, md, 'utf8');

    console.log('Audit complete.');
    console.log(`Low-density packets: ${summary.lowDensityCount}/${summary.totalAnalyzed}`);
    console.log(`Average hydration ratio: ${summary.avgHydrationRatio}`);
    console.log(`Reports written to:`);
    console.log(`- ${JSON_OUT}`);
    console.log(`- ${MD_OUT}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error('Fatal error during density audit:', error);
  process.exit(1);
});
