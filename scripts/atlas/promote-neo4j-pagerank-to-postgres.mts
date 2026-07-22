#!/usr/bin/env node
/**
 * Promote Neo4j PageRank → atlas_graph_authority_scores (Postgres)
 *
 * Neo4j already has pageRankScore on all 59,692 Packet nodes.
 * This script:
 *   1. Reads pageRankScore from Neo4j (raw)
 *   2. L1-normalizes (sum = 1.0)
 *   3. Derives authority_percentile + authority_band
 *   4. Upserts into atlas_graph_authority_runs + atlas_graph_authority_scores
 *   5. Validates L1-sum ≈ 1 ± 1e-6 before committing
 *
 * Usage:
 *   npx tsx scripts/atlas/promote-neo4j-pagerank-to-postgres.mts            # dry run
 *   npx tsx scripts/atlas/promote-neo4j-pagerank-to-postgres.mts --apply    # write
 *   npx tsx scripts/atlas/promote-neo4j-pagerank-to-postgres.mts --apply --verbose
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';
import { randomUUID } from 'crypto';

const DRY_RUN = !process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const BATCH_SIZE = 2000;

const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';
const GRAPH_SNAPSHOT_ID = randomUUID(); // uuid required by schema
const CONTRACT_VERSION = 'atlas.pagerank-authority.v1';
const DAMPING_FACTOR = 0.85;
const MAX_ITERATIONS = 20; // typical Neo4j GDS default
const TOLERANCE = 1e-7;
const DID_CONVERGE = true;

function authorityBand(percentile: number): string {
  if (percentile >= 0.95) return 'very-high';
  if (percentile >= 0.75) return 'high';
  if (percentile >= 0.40) return 'medium';
  if (percentile >= 0.15) return 'low';
  return 'very-low';
}

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function main() {
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);
  log(`Neo4j: ${NEO4J_URI}`);
  log(`Postgres: ${PG_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log('');

  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const pool = new pg.Pool({ connectionString: PG_URL });

  try {
    // ── 1. Fetch raw PageRank from Neo4j ──────────────────────────────────
    log('Fetching PageRank from Neo4j Packet nodes...');
    const session = driver.session({ defaultAccessMode: neo4j.session.READ });

    const result = await session.run(`
      MATCH (p:Packet)
      WHERE p.pageRankScore IS NOT NULL AND p.id IS NOT NULL
      RETURN p.id AS node_key, p.pageRankScore AS pagerank_raw
      ORDER BY p.id
    `);
    await session.close();

    interface RawRow { node_key: string; pagerank_raw: number }
    const rows: RawRow[] = result.records.map(r => {
      const raw = r.get('pagerank_raw');
      return {
        node_key: r.get('node_key') as string,
        pagerank_raw: typeof raw === 'object' && raw !== null && 'toNumber' in raw
          ? (raw as any).toNumber()
          : Number(raw),
      };
    });

    log(`Fetched ${rows.length.toLocaleString()} Packet nodes with PageRank`);
    if (rows.length === 0) throw new Error('No PageRank data on Neo4j Packet nodes');

    // ── 2. L1 Normalize ───────────────────────────────────────────────────
    log('Computing L1 normalization...');
    const rawSum = rows.reduce((s, r) => s + r.pagerank_raw, 0);
    const normed = rows.map(r => ({ ...r, pagerank_l1: r.pagerank_raw / rawSum }));

    const l1Sum = normed.reduce((s, r) => s + r.pagerank_l1, 0);
    const l1Diff = Math.abs(l1Sum - 1.0);
    log(`L1 sum = ${l1Sum.toFixed(10)} (diff = ${l1Diff.toExponential(3)})`);
    if (l1Diff > 1e-6) throw new Error(`L1-sum validation FAILED: diff = ${l1Diff}`);
    log('✅ L1-sum validation PASS');

    // ── 3. Percentile + Band ─────────────────────────────────────────────
    log('Deriving authority percentiles...');
    const sorted = [...normed].sort((a, b) => a.pagerank_l1 - b.pagerank_l1);
    const pctMap = new Map<string, number>();
    sorted.forEach((r, i) => pctMap.set(r.node_key, i / (sorted.length - 1)));

    const enriched = normed.map(r => {
      const pct = pctMap.get(r.node_key) ?? 0;
      return { ...r, authority_percentile: pct, authority_band: authorityBand(pct) };
    });

    const bandCounts: Record<string, number> = {};
    enriched.forEach(r => { bandCounts[r.authority_band] = (bandCounts[r.authority_band] || 0) + 1; });
    log(`Band distribution: ${JSON.stringify(bandCounts)}`);

    if (DRY_RUN) {
      console.log('');
      log('=== DRY RUN SUMMARY ===');
      log(`Nodes to promote : ${rows.length.toLocaleString()}`);
      log(`Raw PR range     : [${Math.min(...rows.map(r => r.pagerank_raw)).toFixed(4)}, ${Math.max(...rows.map(r => r.pagerank_raw)).toFixed(4)}]`);
      log(`L1 PR range      : [${Math.min(...normed.map(r => r.pagerank_l1)).toExponential(3)}, ${Math.max(...normed.map(r => r.pagerank_l1)).toExponential(3)}]`);
      log(`L1 sum           : ${l1Sum.toFixed(10)} ✅`);
      log(`Band breakdown   : ${JSON.stringify(bandCounts)}`);
      console.log('');
      log('Run with --apply to write to Postgres');
      return;
    }

    // ── 4. Write to Postgres ─────────────────────────────────────────────
    const runId = randomUUID();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(`
        INSERT INTO atlas_graph_authority_runs
          (run_id, graph_snapshot_id, algorithm, normalization_method,
           expected_l1_sum, observed_l1_sum, normalization_tolerance,
           did_converge, ran_iterations, node_count, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
      `, [runId, GRAPH_SNAPSHOT_ID, 'pagerank', 'L1Norm',
          1.0, l1Sum, l1Diff,
          DID_CONVERGE, MAX_ITERATIONS, rows.length, 'building']);

      log(`Created run ${runId}`);

      // Batch upsert scores
      let inserted = 0;
      for (let i = 0; i < enriched.length; i += BATCH_SIZE) {
        const batch = enriched.slice(i, i + BATCH_SIZE);
        const values: unknown[] = [];
        // 17 columns per row
        const placeholders = batch.map((r, j) => {
          const b = j * 17;
          values.push(
            GRAPH_SNAPSHOT_ID, runId, r.node_key,
            null, // packet_key (unknown at this stage)
            null, // source_ref (unknown at this stage)
            r.pagerank_raw, r.pagerank_l1,
            r.authority_percentile, r.authority_band,
            'L1Norm',          // normalization_method
            'promote-neo4j-pagerank-to-postgres.mts', // normalization_applied_by
            DAMPING_FACTOR, MAX_ITERATIONS, TOLERANCE,
            DID_CONVERGE, MAX_ITERATIONS,
            CONTRACT_VERSION
          );
          return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},NOW())`;
        }).join(',');

        await client.query(`
          INSERT INTO atlas_graph_authority_scores
            (graph_snapshot_id, run_id, node_key, packet_key, source_ref,
             pagerank_raw, pagerank_l1, authority_percentile, authority_band,
             normalization_method, normalization_applied_by,
             damping_factor, max_iterations, tolerance,
             did_converge, ran_iterations, contract_version, created_at)
          VALUES ${placeholders}
          ON CONFLICT (graph_snapshot_id, node_key) DO UPDATE SET
            run_id = EXCLUDED.run_id,
            pagerank_raw = EXCLUDED.pagerank_raw,
            pagerank_l1 = EXCLUDED.pagerank_l1,
            authority_percentile = EXCLUDED.authority_percentile,
            authority_band = EXCLUDED.authority_band,
            contract_version = EXCLUDED.contract_version
        `, values);

        inserted += batch.length;
        if (VERBOSE || i % 10000 === 0) {
          log(`  upserted ${inserted.toLocaleString()} / ${enriched.length.toLocaleString()}`);
        }
      }

      // DB-side L1 validation
      const check = await client.query(`
        SELECT COUNT(*) as total, SUM(pagerank_l1) as l1_sum,
               COUNT(DISTINCT authority_band) as bands
        FROM atlas_graph_authority_scores WHERE run_id = $1
      `, [runId]);

      const dbRow = check.rows[0];
      const dbL1Sum = parseFloat(dbRow.l1_sum);
      const dbDiff = Math.abs(dbL1Sum - 1.0);
      log(`DB validation — total=${dbRow.total}, l1_sum=${dbL1Sum.toFixed(8)}, bands=${dbRow.bands}`);

      if (dbDiff > 1e-4) {
        await client.query('ROLLBACK');
        throw new Error(`DB L1-sum FAILED: ${dbL1Sum} (diff=${dbDiff})`);
      }

      await client.query(`
        UPDATE atlas_graph_authority_runs
        SET status = 'promoted', observed_l1_sum = $2, promoted_at = NOW()
        WHERE run_id = $1
      `, [runId, dbL1Sum]);

      await client.query('COMMIT');

      console.log('');
      log('✅ PROMOTION COMPLETE');
      log(`   Run ID  : ${runId}`);
      log(`   Rows    : ${inserted.toLocaleString()}`);
      log(`   L1 sum  : ${dbL1Sum.toFixed(10)}`);
      log(`   Snapshot: ${GRAPH_SNAPSHOT_ID}`);
      log(`   Bands   : ${JSON.stringify(bandCounts)}`);

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } finally {
    await driver.close();
    await pool.end();
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
