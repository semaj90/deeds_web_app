#!/usr/bin/env npx tsx
/**
 * Promotes the Aug-12 2026 cuGraph/NetworkX parity oracle's per-node PageRank output into
 * `atlas_graph_authority_scores` / `atlas_graph_authority_runs` as a new, independently-tracked
 * run — WITHOUT touching or superseding the existing runs in that table.
 *
 * Context (openspec/changes/parent-atlas-graph-analysis-contract/tasks.md, 2026-08-29 patches):
 * - The oracle pipeline (python/graph_snapshot_parity_cugraph_oracle.py +
 *   graph_snapshot_parity_networkx_oracle.py) already ran successfully on 2026-08-12 with
 *   independent cross-backend confirmation (pagerankCorrelation=1, maxDelta=4.9e-9) — see
 *   sveltekit-frontend/docs/reports/graph-snapshot-parity/receipt.json.
 * - Its per-node scores sat unpromoted in cugraph-scores.ndjson.
 * - `atlas_graph_authority_scores_v2`'s existing run, despite matching the same graph revision
 *   hash, was live-cross-checked this session and found to DISAGREE with the oracle at the top of
 *   the ranking (top-50 overlap = 0 despite pearson_corr≈1 — see the tasks.md patch for the full
 *   finding). Do not reuse or extend that run; this script promotes the oracle's own output
 *   directly instead.
 *
 * Run from sveltekit-frontend/ (module aliases require it):
 *   npx tsx scripts/atlas/promote-cugraph-pagerank-parity.mts             # dry-run (default)
 *   npx tsx scripts/atlas/promote-cugraph-pagerank-parity.mts --apply     # actually INSERT
 *
 * This is additive AND deliberately inert: the new run is inserted with status='passed', NOT
 * 'promoted'. src/lib/server/retrieval/feature-matrix.ts — a LIVE ranking consumer — queries
 * `atlas_graph_authority_scores JOIN atlas_graph_authority_runs WHERE r.status = 'promoted'`
 * with NO run_id pin, so a second row with status='promoted' would nondeterministically collide
 * with the existing live run for any overlapping packet_key/source_ref. Confirmed live before
 * writing this script (see tasks.md). Flipping this run's status to 'promoted' is a SEPARATE,
 * deliberate, explicit-operator-approved step — never done by this script.
 *
 * Schema note: atlas_graph_authority_runs.algorithm has CHECK (algorithm = 'pagerank') — there is
 * no column to carry an implementation/source tag (e.g. "cugraph" vs "neo4j-gds"). This script's
 * run is distinguishable only by its run_id/graph_snapshot_id/created_at — record the mapping to
 * ALGORITHM_TAG out-of-band (tasks.md) since the DB row itself can't carry it. Worth a future
 * migration (add a nullable `source_implementation` or `notes` column) if this table gains more
 * cross-implementation runs — not done here, out of scope for a promotion script.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { normalizePageRankL1 } from '../../src/lib/server/graph/graph-contract.js';
import { PageRankPromotionGate } from '../../src/lib/server/graph/pagerank-promotion-gate.js';

const PARITY_DIR = join(process.cwd(), 'docs', 'reports', 'graph-snapshot-parity');
const NODES_PARQUET = join(PARITY_DIR, 'nodes.parquet');
const SCORES_NDJSON = join(PARITY_DIR, 'cugraph-scores.ndjson');
const RECEIPT_JSON = join(PARITY_DIR, 'receipt.json');

const DUCKDB_BIN = process.env.DUCKDB_BIN || 'C:\\Users\\james\\AppData\\Local\\Programs\\DuckDB\\duckdb.exe';

const ALGORITHM = 'pagerank';
const ALGORITHM_TAG = 'cugraph-pagerank-parity-v1';
const NORMALIZATION_METHOD = 'L1Norm';
const NORMALIZATION_APPLIED_BY = 'atlas-postprocess';
const DAMPING_FACTOR = 0.85;
const MAX_ITERATIONS = 100;
const TOLERANCE = 1e-8;
// The oracle script (graph_snapshot_parity_cugraph_oracle.py) does not currently report an
// explicit per-run convergence flag in its stdout — inferred true from tight tolerance (1e-8)
// and generous max_iter (100) on real, non-pathological data, cross-confirmed by the receipt's
// networkx/cugraph agreement. NOT a value read directly off the oracle. Flagged, not fabricated
// silently: see the "not confirmed" note in tasks.md's third 2026-08-29 patch.
const DID_CONVERGE_INFERRED = true;
const RAN_ITERATIONS_UNKNOWN = MAX_ITERATIONS; // oracle doesn't report actual iterations used; upper bound recorded, not a real observed count

interface NodeKeyMapRow {
  gpu_node_id: number;
  node_key: string;
  source_ref: string | null;
  packet_key: string | null;
}

interface OracleScoreRow {
  gpuNodeId: number;
  pagerankRaw: number;
}

function exportNodeKeyMap(scratchDir: string): NodeKeyMapRow[] {
  const outPath = join(scratchDir, 'node-key-map.ndjson');
  const sql = `COPY (
    SELECT
      gpu_node_id,
      CASE WHEN node_kind = 'packet' AND packet_key IS NOT NULL THEN packet_key ELSE graph_node_key END AS node_key,
      source_ref,
      packet_key
    FROM read_parquet('${NODES_PARQUET.replace(/\\/g, '/')}')
  ) TO '${outPath.replace(/\\/g, '/')}' (FORMAT JSON, ARRAY false);`;
  execFileSync(DUCKDB_BIN, ['-c', sql], { stdio: 'pipe' });
  return readFileSync(outPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as NodeKeyMapRow);
}

function readOracleScores(): OracleScoreRow[] {
  return readFileSync(SCORES_NDJSON, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as OracleScoreRow);
}

async function main() {
  const apply = process.argv.includes('--apply');

  const receipt = JSON.parse(readFileSync(RECEIPT_JSON, 'utf8'));
  if (receipt.status !== 'PASS') {
    throw new Error(`Refusing to promote: receipt.json status is '${receipt.status}', not 'PASS'.`);
  }

  const scratchDir = mkdtempSync(join(tmpdir(), 'cugraph-pagerank-promote-'));
  let nodeKeyMap: NodeKeyMapRow[];
  try {
    nodeKeyMap = exportNodeKeyMap(scratchDir);
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }

  const nodeKeyByGpuId = new Map(nodeKeyMap.map((row) => [row.gpu_node_id, row]));
  const oracleScores = readOracleScores();

  const joined = oracleScores.map((score) => {
    const node = nodeKeyByGpuId.get(score.gpuNodeId);
    if (!node) throw new Error(`No node-key-map entry for gpuNodeId=${score.gpuNodeId}`);
    return { nodeKey: node.node_key, sourceRef: node.source_ref, packetKey: node.packet_key, pagerankRaw: score.pagerankRaw };
  });

  const duplicateCheck = new Set(joined.map((r) => r.nodeKey));
  if (duplicateCheck.size !== joined.length) {
    throw new Error(`node_key collisions after promotion mapping: ${joined.length - duplicateCheck.size} duplicates. Refusing to promote.`);
  }

  const normalized = normalizePageRankL1(joined.map((r) => ({ nodeKey: r.nodeKey, pagerankRaw: r.pagerankRaw })));
  const byNodeKey = new Map(joined.map((r) => [r.nodeKey, r]));

  const runId = randomUUID();
  const graphSnapshotId = randomUUID();
  const createdAt = new Date().toISOString();

  const l1Sum = normalized.reduce((sum, r) => sum + Math.abs(r.pagerankL1), 0);
  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    runId,
    graphSnapshotId,
    algorithm: ALGORITHM,
    algorithmTag: ALGORITHM_TAG,
    graphRevision: receipt.graphRevision,
    nodeCount: normalized.length,
    l1Sum,
    l1SumWithinTolerance: Math.abs(l1Sum - 1) <= 1e-6,
    sampleRow: normalized[0],
    receiptStatus: receipt.status,
    receiptPagerankCorrelation: receipt.pagerankCorrelation,
  }, null, 2));

  if (!apply) {
    console.log('\nDRY RUN — no writes performed. Re-run with --apply to insert.');
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // status='passed', NOT 'promoted' — see file header. algorithm must be the bare literal
      // 'pagerank' (CHECK constraint); ALGORITHM_TAG is recorded in this script's own output log
      // and in tasks.md, not in this row, since the schema has no column for it.
      await client.query(
        `INSERT INTO atlas_graph_authority_runs
          (run_id, graph_snapshot_id, algorithm, normalization_method, expected_l1_sum,
           observed_l1_sum, normalization_tolerance, did_converge, ran_iterations, node_count,
           status, created_at)
         VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, $9, 'passed', $10)`,
        [runId, graphSnapshotId, ALGORITHM, NORMALIZATION_METHOD, l1Sum,
         TOLERANCE, DID_CONVERGE_INFERRED, RAN_ITERATIONS_UNKNOWN, normalized.length, createdAt]
      );

      const insertText = `INSERT INTO atlas_graph_authority_scores
        (graph_snapshot_id, run_id, node_key, packet_key, source_ref, pagerank_raw, pagerank_l1,
         authority_percentile, authority_band, normalization_method, normalization_applied_by,
         damping_factor, max_iterations, tolerance, did_converge, ran_iterations,
         contract_version, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`;

      const BATCH = 500;
      for (let i = 0; i < normalized.length; i += BATCH) {
        const batch = normalized.slice(i, i + BATCH);
        for (const row of batch) {
          const src = byNodeKey.get(row.nodeKey)!;
          await client.query(insertText, [
            graphSnapshotId, runId, row.nodeKey, src.packetKey, src.sourceRef,
            row.pagerankRaw, row.pagerankL1, row.authorityPercentile, row.authorityBand,
            NORMALIZATION_METHOD, NORMALIZATION_APPLIED_BY, DAMPING_FACTOR, MAX_ITERATIONS,
            TOLERANCE, DID_CONVERGE_INFERRED, RAN_ITERATIONS_UNKNOWN,
            'atlas.pagerank-authority.v1', createdAt,
          ]);
        }
        console.log(`Inserted ${Math.min(i + BATCH, normalized.length)}/${normalized.length} score rows`);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const gate = new PageRankPromotionGate(pool);
    const gateResult = await gate.validateRun(runId, graphSnapshotId);
    console.log('\nPromotion gate result:');
    console.log(JSON.stringify(gateResult, null, 2));
    console.log(gateResult.passed ? '\nGATE PASS' : '\nGATE FAIL');
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  });
}
