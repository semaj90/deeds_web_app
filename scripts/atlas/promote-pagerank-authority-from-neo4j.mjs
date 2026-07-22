#!/usr/bin/env node
/**
 * Promote Packet node PageRank properties from Neo4j into the canonical
 * Postgres authority ledger.
 *
 * Source:
 *   (:Packet { path, pagerank, pageRankScore })
 *
 * Canonical output:
 *   atlas_graph_authority_scores
 *   atlas_packets compatibility columns pagerank / page_rank_score
 *
 * Contract:
 *   - pagerank_raw is derived from Neo4j Packet.pagerank
 *   - pagerank_l1 is derived by canonical L1 normalization over the snapshot
 *   - authority_percentile and authority_band are derived from pagerank_l1
 *
 * Usage:
 *   node scripts/atlas/promote-pagerank-authority-from-neo4j.mjs --dry-run
 *   node scripts/atlas/promote-pagerank-authority-from-neo4j.mjs --apply
 */

import neo4j from 'neo4j-driver';
import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import crypto from 'node:crypto';
import { resolveAtlasRedisContext, runRedisCli } from './lib/redis-valkey.mjs';

config({ path: resolve('.', '.env') });

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const driver = neo4j.default.driver(
  NEO4J_URI,
  neo4j.default.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
);

const pgPool = new pg.Pool({ connectionString: DATABASE_URL });

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toSourceRef(path) {
  if (!path) return null;
  return path.startsWith('sveltekit-frontend/') ? path : `sveltekit-frontend/${path}`;
}

function deriveAuthorityBand(percentile) {
  if (percentile >= 0.99) return 'very-high';
  if (percentile >= 0.9) return 'high';
  if (percentile >= 0.5) return 'medium';
  if (percentile >= 0.1) return 'low';
  return 'very-low';
}

function derivePercentiles(rows) {
  const ordered = [...rows].sort((a, b) => a.pagerank_l1 - b.pagerank_l1);
  const denominator = Math.max(ordered.length - 1, 1);
  const percentiles = new Map();

  ordered.forEach((row, index) => {
    percentiles.set(row.path, index / denominator);
  });

  return percentiles;
}

async function main() {
  const session = driver.session();
  const redisCtx = await resolveAtlasRedisContext(resolve('.'), process.env);
  const runId = crypto.randomUUID();
  const graphSnapshotId = crypto.randomUUID();

  try {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  Promote Neo4j Packet PageRank to Postgres Authority Ledger   ║');
    console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(56)}║`);
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const rowsRes = await session.run(`
      MATCH (p:Packet)
      WHERE p.path IS NOT NULL
        AND p.pagerank IS NOT NULL
      RETURN
        p.path AS path,
        p.pagerank AS pagerank_raw,
        coalesce(p.pageRankScore, p.pagerank) AS legacy_score
      ORDER BY path
    `);

    const rows = rowsRes.records
      .map((record) => {
        const row = record.toObject();
        return {
          path: row.path,
          pagerank_raw: toFiniteNumber(row.pagerank_raw),
          legacy_score: toFiniteNumber(row.legacy_score),
        };
      })
      .filter((row) => row.path && row.pagerank_raw !== null);

    if (rows.length === 0) {
      throw new Error('No Packet PageRank rows found in Neo4j');
    }

    const dedupedByPath = new Map();
    let duplicatePaths = 0;
    for (const row of rows) {
      const current = dedupedByPath.get(row.path);
      if (!current) {
        dedupedByPath.set(row.path, row);
        continue;
      }
      duplicatePaths += 1;
      if (row.pagerank_raw > current.pagerank_raw) {
        dedupedByPath.set(row.path, row);
      }
    }

    const canonicalSourceRows = [...dedupedByPath.values()];
    const rawSum = canonicalSourceRows.reduce((sum, row) => sum + row.pagerank_raw, 0);
    const canonicalRows = canonicalSourceRows.map((row) => ({
      ...row,
      pagerank_l1: rawSum > 0 ? row.pagerank_raw / rawSum : 0,
    }));
    const percentiles = derivePercentiles(canonicalRows);

    const authorityRows = canonicalRows.map((row) => {
      const authority_percentile = percentiles.get(row.path) ?? 0;
      return {
        node_key: row.path,
        source_ref: toSourceRef(row.path),
        packet_key: toSourceRef(row.path),
        pagerank_raw: row.pagerank_raw,
        pagerank_l1: row.pagerank_l1,
        authority_percentile,
        authority_band: deriveAuthorityBand(authority_percentile),
      };
    });

    const canonicalL1Sum = authorityRows.reduce((sum, row) => sum + row.pagerank_l1, 0);
    const rawMin = Math.min(...authorityRows.map((row) => row.pagerank_raw));
    const rawMax = Math.max(...authorityRows.map((row) => row.pagerank_raw));
    console.log(`   Loaded ${authorityRows.length} Packet nodes`);
    console.log(`   Deduplicated ${duplicatePaths} duplicate path rows`);
    console.log(`   Raw scores: min=${rawMin.toFixed(6)}, max=${rawMax.toFixed(6)}`);
    console.log(`   Canonical L1 sum: ${canonicalL1Sum.toFixed(6)}\n`);

    if (DRY_RUN) {
      console.log(`   DRY-RUN: Would write ${authorityRows.length} authority rows to Postgres`);
      console.log(`   DRY-RUN: Would update atlas_packets compatibility columns where source_ref joins\n`);
    } else {
      const BATCH_SIZE = 500;
      let syncedAuthority = 0;
      let syncedPackets = 0;

      for (let i = 0; i < authorityRows.length; i += BATCH_SIZE) {
        const batch = authorityRows.slice(i, i + BATCH_SIZE);
        const values = [];
        const placeholders = [];
        let paramIndex = 1;

        for (const row of batch) {
          values.push(
            row.node_key,
            row.packet_key,
            row.source_ref,
            row.pagerank_raw,
            row.pagerank_l1,
            row.authority_percentile,
            row.authority_band,
          );
          placeholders.push(
            `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}::double precision, $${paramIndex + 4}::double precision, $${paramIndex + 5}::double precision, $${paramIndex + 6}::text)`,
          );
          paramIndex += 7;
        }

        const res = await pgPool.query(
          `
          WITH incoming(node_key, packet_key, source_ref, pagerank_raw, pagerank_l1, authority_percentile, authority_band) AS (
            VALUES ${placeholders.join(', ')}
          ),
          resolved AS (
            SELECT
              incoming.node_key,
              incoming.source_ref,
              incoming.pagerank_raw,
              incoming.pagerank_l1,
              incoming.authority_percentile,
              incoming.authority_band,
              p.packet_key
            FROM incoming
            LEFT JOIN atlas_packets p ON p.source_ref = incoming.source_ref
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
              resolved.node_key,
              resolved.packet_key,
              resolved.source_ref,
              resolved.pagerank_raw,
              resolved.pagerank_l1,
              resolved.authority_percentile,
              resolved.authority_band,
              'L1Norm',
              'atlas-postprocess',
              0.85,
              20,
              1e-6,
              true,
              20,
              'atlas.pagerank-authority.v1',
              NOW()
            FROM resolved
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
          ),
          packet_updates AS (
            UPDATE atlas_packets AS p
            SET
              pagerank = resolved.pagerank_raw::real,
              page_rank_score = resolved.pagerank_l1::real,
              updated_at = NOW()
            FROM resolved
            WHERE p.packet_key = resolved.packet_key
            RETURNING 1
          )
          SELECT
            (SELECT COUNT(*) FROM upsert_authority) AS authority_rows,
            (SELECT COUNT(*) FROM packet_updates) AS packet_rows
          `,
          [...values, graphSnapshotId, runId],
        );

        syncedAuthority += Number(res.rows[0]?.authority_rows ?? 0);
        syncedPackets += Number(res.rows[0]?.packet_rows ?? 0);
      }

      if (syncedAuthority === 0) {
        throw new Error('PageRank authority promotion failed: 0 authority rows written');
      }

      console.log(`   ✅ Synced ${syncedAuthority} authority rows`);
      console.log(`   ✅ Synced ${syncedPackets} packet compatibility rows\n`);

      const topRows = authorityRows
        .slice()
        .sort((a, b) => b.pagerank_l1 - a.pagerank_l1)
        .slice(0, 100);

      const envelope = {
        packet_id: crypto.randomUUID(),
        packet_ulid: null,
        packet_key: `sha256:${crypto.createHash('sha256').update(JSON.stringify({ graphSnapshotId, runId })).digest('hex')}`,
        title_id: 'graph.authority.pagerank',
        feature_id: 'graph.authority',
        source_ref: 'neo4j://Packet',
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
        summary: `PageRank authority cache for ${topRows.length} packet keys.`,
        lexical_nouns: ['pagerank', 'authority', 'packet', 'graph'],
        lexical_verbs: ['rank', 'cache'],
        lexical_adverbs_ly: [],
        routing_hints: ['neo4j', 'pagerank', 'authority'],
        used_concepts: ['pagerank', 'graph authority'],
        supersedes: [],
        superseded_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        confidence: 1,
        extraction_method: 'neo4j-graph-authority-promotion',
        provenance: {
          node_count: authorityRows.length,
          source: 'neo4j',
          graph_snapshot_id: graphSnapshotId,
          run_id: runId,
        },
      };

      const scoreMap = Object.fromEntries(
        topRows.map((row) => [
          row.source_ref,
          {
            pagerank_raw: row.pagerank_raw,
            pagerank_l1: row.pagerank_l1,
            authority_percentile: row.authority_percentile,
            authority_band: row.authority_band,
          },
        ]),
      );

      const redisPayload = JSON.stringify({
        envelope,
        authority_contract: {
          contractVersion: 'atlas.pagerank-authority.v1',
          normalization: 'L1Norm',
          graphSnapshotId,
          runId,
        },
        top_scores: scoreMap,
      });

      const cacheResult = runRedisCli(
        redisCtx.container,
        ['SETEX', 'bitfrost:pagerank:top-scores:v1', String(6 * 3600)],
        redisCtx.password,
        redisPayload,
      );
      if (!cacheResult.ok) {
        console.warn(`   ⚠️  Failed to cache PageRank envelope: ${cacheResult.stderr || cacheResult.error || 'unknown error'}`);
      } else {
        console.log('   ✅ Cached canonical PageRank envelope at bitfrost:pagerank:top-scores:v1');
      }
    }
  } finally {
    await session.close();
    await pgPool.end();
    await driver.close();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
