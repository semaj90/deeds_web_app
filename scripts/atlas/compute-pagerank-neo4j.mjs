#!/usr/bin/env node
/**
 * P4 Phase 2: Compute PageRank scores via Neo4j GDS
 *
 * Computes PageRank on the codebase graph and caches top-100 scores in Redis.
 *
 * Usage:
 *   node scripts/atlas/compute-pagerank-neo4j.mjs --dry-run
 *   node scripts/atlas/compute-pagerank-neo4j.mjs --apply
 */

import neo4j from 'neo4j-driver';
import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import crypto from 'node:crypto';
import { resolveAtlasRedisContext, runRedisCli } from './lib/redis-valkey.mjs';

config({ path: resolve('.', '.env') });

const driver = neo4j.default.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.default.auth.basic('neo4j', process.env.NEO4J_PASSWORD || 'password')
);

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const GRAPH_SNAPSHOT_ID = crypto.randomUUID();
const RUN_ID = crypto.randomUUID();

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  P4 Phase 2: Compute PageRank (Neo4j GDS)                     ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(56)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function deriveAuthorityPercentiles(rows) {
  const ordered = [...rows].sort((a, b) => a.pagerank_l1 - b.pagerank_l1);
  const denominator = Math.max(ordered.length - 1, 1);
  const percentiles = new Map();

  ordered.forEach((row, index) => {
    percentiles.set(row.source_ref, index / denominator);
  });

  return percentiles;
}

function deriveAuthorityBand(percentile) {
  if (percentile >= 0.99) return 'very-high';
  if (percentile >= 0.9) return 'high';
  if (percentile >= 0.5) return 'medium';
  if (percentile >= 0.1) return 'low';
  return 'very-low';
}

async function computePageRank() {
  const session = driver.session();
  const redisCtx = await resolveAtlasRedisContext(resolve('.'), process.env);
  const redisKey = 'bitfrost:pagerank:top-scores:v1';

  try {
    console.log('📊 Step 1: Create GDS projection\n');

    // Create graph projection (using only SIMILAR_TOPOLOGY which exists in the DB)
    const projRes = await session.run(`
      CALL gds.graph.project(
        'codebaseGraph',
        'Packet',
        {
          SIMILAR_TOPOLOGY: { orientation: 'NATURAL' }
        }
      )
      YIELD nodeCount, relationshipCount
      RETURN nodeCount, relationshipCount
    `);

    const proj = projRes.records[0].toObject();
    console.log(`   Projected graph: ${proj.nodeCount} nodes, ${proj.relationshipCount} relationships\n`);

    console.log('🔄 Step 2: Run PageRank algorithm\n');

    const rawRes = await session.run(`
      CALL gds.pageRank.stream('codebaseGraph', {
        maxIterations: 20,
        dampingFactor: 0.85,
        scaler: 'None'
      })
      YIELD nodeId, score
      RETURN gds.util.asNode(nodeId).path as path, score as pagerank_raw
      ORDER BY path
    `);

    const l1Res = await session.run(`
      CALL gds.pageRank.stream('codebaseGraph', {
        maxIterations: 20,
        dampingFactor: 0.85,
        scaler: 'L1Norm'
      })
      YIELD nodeId, score
      RETURN gds.util.asNode(nodeId).path as path, score as pagerank_l1
      ORDER BY path
    `);

    const rawByPath = new Map(
      rawRes.records.map((record) => {
        const { path, pagerank_raw } = record.toObject();
        return [path, toFiniteNumber(pagerank_raw)];
      }),
    );
    const l1ByPath = new Map(
      l1Res.records.map((record) => {
        const { path, pagerank_l1 } = record.toObject();
        return [path, toFiniteNumber(pagerank_l1)];
      }),
    );

    const mergedRows = [...rawByPath.entries()]
      .filter(([, raw]) => raw !== null)
      .map(([path, pagerank_raw]) => {
        const pagerank_l1 = l1ByPath.get(path);
        if (pagerank_l1 == null) {
          throw new Error(`Missing L1 PageRank for ${path}`);
        }
        return {
          path,
          pagerank_raw,
          pagerank_l1,
        };
      });

    const rawSum = mergedRows.reduce((sum, row) => sum + row.pagerank_raw, 0);
    const gdsL1Sum = mergedRows.reduce((sum, row) => sum + row.pagerank_l1, 0);
    const canonicalRows =
      Math.abs(gdsL1Sum - 1) <= 1e-6
        ? mergedRows
        : mergedRows.map((row) => ({
            ...row,
            pagerank_l1: rawSum > 0 ? row.pagerank_raw / rawSum : 0,
          }));
    const normalizationAppliedBy =
      Math.abs(gdsL1Sum - 1) <= 1e-6 ? 'neo4j-gds-pagerank-scaler' : 'atlas-postprocess';
    const canonicalL1Sum = canonicalRows.reduce((sum, row) => sum + row.pagerank_l1, 0);

    if (normalizationAppliedBy !== 'neo4j-gds-pagerank-scaler') {
      console.warn(`   ⚠️  GDS L1 sum=${gdsL1Sum.toFixed(6)}; deriving canonical L1 normalization in-process from raw scores`);
    }

    const percentiles = deriveAuthorityPercentiles(canonicalRows);
    const authorityRows = canonicalRows.map((row) => {
      const authority_percentile = percentiles.get(row.path) ?? 0;
      return {
        path: row.path,
        pagerank_raw: row.pagerank_raw,
        pagerank_l1: row.pagerank_l1,
        authority_percentile,
        authority_band: deriveAuthorityBand(authority_percentile),
      };
    });

    const rawMin = mergedRows.length ? Math.min(...mergedRows.map((row) => row.pagerank_raw)) : 0;
    const rawMax = mergedRows.length ? Math.max(...mergedRows.map((row) => row.pagerank_raw)) : 0;
    const l1Sum = mergedRows.reduce((sum, row) => sum + row.pagerank_l1, 0);
    console.log(`   Loaded ${mergedRows.length} scored nodes`);
    console.log(`   Raw scores: min=${rawMin.toFixed(6)}, max=${rawMax.toFixed(6)}`);
    console.log(`   GDS L1 sum: ${l1Sum.toFixed(6)}`);
    console.log(`   Canonical L1 sum: ${canonicalL1Sum.toFixed(6)}\n`);

    console.log('📝 Step 3: Sync PageRank scores to Postgres\n');

    if (DRY_RUN) {
      console.log(`   DRY-RUN: Would sync ${authorityRows.length} PageRank scores to Postgres`);
      const topScore = authorityRows[0]?.pagerank_l1;
      console.log(`   Top L1 score: ${topScore != null ? topScore.toFixed(6) : 'N/A'}`);
    } else {
      // Batch UPDATE via path → source_ref join (same pattern as Louvain sync)
      const BATCH_SIZE = 500;
      let synced = 0;
      let authorityUpserts = 0;

      for (let i = 0; i < authorityRows.length; i += BATCH_SIZE) {
        const batch = authorityRows.slice(i, i + BATCH_SIZE);
        const values = [];
        const placeholders = [];
        let paramIndex = 1;

        for (const record of batch) {
          const sourceRef = 'sveltekit-frontend/' + record.path;
          values.push(
            sourceRef,
            record.pagerank_raw,
            record.pagerank_l1,
            record.authority_percentile,
            record.authority_band,
          );
          placeholders.push(
            `($${paramIndex}, $${paramIndex + 1}::double precision, $${paramIndex + 2}::double precision, $${paramIndex + 3}::double precision, $${paramIndex + 4}::text)`,
          );
          paramIndex += 5;
        }

        const res = await pgPool.query(
          `
          WITH incoming(source_ref, pagerank_raw, pagerank_l1, authority_percentile, authority_band) AS (
            VALUES ${placeholders.join(', ')}
          ),
          node_rows AS (
            SELECT
              i.pagerank_raw,
              i.pagerank_l1,
              i.authority_percentile,
              i.authority_band,
              i.source_ref,
              p.packet_key
            FROM incoming i
            LEFT JOIN atlas_packets p ON p.source_ref = i.source_ref
          ),
          updated_packets AS (
            UPDATE atlas_packets AS p
            SET
              pagerank = node_rows.pagerank_raw::real,
              page_rank_score = node_rows.pagerank_l1::real,
              updated_at = NOW()
            FROM node_rows
            WHERE p.packet_key = node_rows.packet_key
            RETURNING 1
          ),
          upsert_authority AS (
            INSERT INTO atlas_graph_authority_scores (
              graph_snapshot_id,
              run_id,
              node_key,
              packet_key,
              source_ref,
              pagerank_raw,
              pagerank_l1,
              authority_percentile,
              authority_band,
              normalization_method,
              normalization_applied_by,
              damping_factor,
              max_iterations,
              tolerance,
              did_converge,
              ran_iterations,
              contract_version,
              created_at
            )
            SELECT
              $${paramIndex}::uuid,
              $${paramIndex + 1}::uuid,
              node_rows.source_ref,
              node_rows.packet_key,
              node_rows.source_ref,
              node_rows.pagerank_raw,
              node_rows.pagerank_l1,
              node_rows.authority_percentile,
              node_rows.authority_band,
              'L1Norm',
              $${paramIndex + 2}::text,
              0.85,
              20,
              1e-6,
              true,
              20,
              'atlas.pagerank-authority.v1',
              NOW()
            FROM node_rows
            ON CONFLICT (graph_snapshot_id, node_key)
            DO UPDATE SET
              packet_key = EXCLUDED.packet_key,
              source_ref = EXCLUDED.source_ref,
              pagerank_raw = EXCLUDED.pagerank_raw,
              pagerank_l1 = EXCLUDED.pagerank_l1,
              authority_percentile = EXCLUDED.authority_percentile,
              authority_band = EXCLUDED.authority_band,
              normalization_method = EXCLUDED.normalization_method,
              normalization_applied_by = EXCLUDED.normalization_applied_by,
              damping_factor = EXCLUDED.damping_factor,
              max_iterations = EXCLUDED.max_iterations,
              tolerance = EXCLUDED.tolerance,
              did_converge = EXCLUDED.did_converge,
              ran_iterations = EXCLUDED.ran_iterations,
              contract_version = EXCLUDED.contract_version,
              created_at = EXCLUDED.created_at
            RETURNING 1
          )
          SELECT
            (SELECT COUNT(*) FROM updated_packets) AS packet_updates,
            (SELECT COUNT(*) FROM upsert_authority) AS authority_updates
          `,
          [...values, GRAPH_SNAPSHOT_ID, RUN_ID, normalizationAppliedBy]
        );

        const packetUpdates = Number(res.rows[0]?.packet_updates || 0);
        const authorityUpdates = Number(res.rows[0]?.authority_updates || 0);
        synced += packetUpdates;
        authorityUpserts += authorityUpdates;
        if (i % 5000 === 0 && i > 0) {
          console.log(`   ✓ Synced ${synced}/${authorityRows.length} packet rows, ${authorityUpserts} authority rows...`);
        }
      }
      if (synced === 0 || authorityUpserts === 0) {
        throw new Error(`PageRank materialization failed: ${synced}/${authorityRows.length} packet rows updated, ${authorityUpserts} authority rows upserted`);
      }
      console.log(`   ✅ Synced ${synced} packet rows and ${authorityUpserts} authority rows to Postgres\n`);
    }

    console.log('💾 Step 4: Cache top-100 scores in Redis\n');

    // Fetch top-100 for Redis cache keyed by source_ref (canonical path)
    const topRes = authorityRows
      .slice()
      .sort((a, b) => b.pagerank_l1 - a.pagerank_l1)
      .slice(0, 100);

    if (!DRY_RUN) {
      const scoreMap = {};
      for (const record of topRes) {
        const key = record.path ? 'sveltekit-frontend/' + record.path : null;
        if (key) {
          scoreMap[key] = {
            pagerank_raw: record.pagerank_raw,
            pagerank_l1: record.pagerank_l1,
            authority_percentile: record.authority_percentile,
            authority_band: record.authority_band,
          };
        }
      }

      const topEntries = Object.entries(scoreMap).sort(([a], [b]) => a.localeCompare(b));
      const packetKey = `sha256:${crypto
        .createHash('sha256')
        .update(JSON.stringify({ limit: 100, topEntries }))
        .digest('hex')}`;
      const envelope = {
        packet_id: crypto.randomUUID(),
        packet_ulid: null,
        packet_key: packetKey,
        title_id: 'graph.authority.pagerank',
        feature_id: 'graph.authority',
        source_ref: 'neo4j://codebaseGraph',
        directory_path: 'neo4j',
        community_id: null,
        som_row: null,
        som_col: null,
        som_cluster: null,
        kmeans_cluster_id: null,
        latent_64: null,
        manifold_4d: null,
        qdrant_point_id: null,
        neo4j_neighbors: [],
        pagerank_raw: null,
        page_rank_score: null,
        summary: `PageRank top-100 cache for ${topEntries.length} packet keys.`,
        lexical_nouns: ['pagerank', 'score', 'packet', 'graph'],
        lexical_verbs: ['rank', 'score', 'cache'],
        lexical_adverbs_ly: ['graphically'],
        routing_hints: ['neo4j', 'bitfrost', 'pagerank', 'authority'],
        used_concepts: ['pagerank', 'graph authority', 'retrieval ranking'],
        supersedes: [],
        superseded_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        confidence: 1,
        extraction_method: 'neo4j-gds-pagerank',
        provenance: {
          node_count: authorityRows.length,
          top_score_count: topEntries.length,
          source: 'neo4j-gds',
        },
      };
      const payload = JSON.stringify({
        envelope,
        top_scores: scoreMap,
        authority_contract: {
          contractVersion: 'atlas.pagerank-authority.v1',
          graphSnapshotId: GRAPH_SNAPSHOT_ID,
          runId: RUN_ID,
          normalization: 'L1Norm',
        },
      });
      const cacheResult = runRedisCli(
        redisCtx.container,
        ['SETEX', redisKey, String(6 * 3600)],
        redisCtx.password,
        payload,
      );
      if (!cacheResult.ok) {
        console.warn(`   ⚠️  Failed to cache PageRank envelope: ${cacheResult.stderr || cacheResult.error || 'unknown error'}`);
      } else {
        console.log(`   ✅ Cached canonical PageRank envelope at ${redisKey}`);
        console.log(`   Expiry: 6 hours\n`);
      }

      console.log(`   ✅ Cached ${Object.keys(scoreMap).length} top scores to Redis`);
    } else {
      console.log(`   DRY-RUN: Would cache ${topRes.length} top scores to Redis\n`);
    }

    console.log('🧹 Step 5: Clean up GDS projection\n');

    await session.run(`CALL gds.graph.drop('codebaseGraph')`);
    console.log('   ✅ GDS projection dropped\n');

  } finally {
    await session.close();
    await pgPool.end();
  }
}

(async () => {
  try {
    await computePageRank();
    console.log('✅ P4 Phase 2 Complete\n');
    await driver.close();
  } catch (e) {
    console.error('Error:', e.message);
    await driver.close();
    process.exit(1);
  }
})();
