#!/usr/bin/env npx tsx
/**
 * verify-graph-analysis-gates.mts — repeatable gate-validation check for
 * parent-atlas-graph-analysis-contract's Patches C–G (GA1, GA3, GA5, GA6).
 *
 * Formalizes the manual verification queries run ad hoc after each patch
 * this session (row counts, distinct packet_key counts, non-finite checks,
 * atlas_packets column-count-unchanged) into one repeatable check — same
 * intent as tasks.md's Gate 1 task 1.2 ("live Louvain persistence
 * verifier"), generalized to every proven algorithm instead of just Louvain.
 *
 * Checks, per algorithm, against its most recent 'succeeded' run:
 *   - graph_analysis_runs row exists, status='succeeded'
 *   - graph_node_metrics (or graph_communities, for louvain/leiden) has
 *     rows for that run_id
 *   - zero duplicate packet_key rows (row count == distinct packet_key count)
 *   - zero non-finite (NaN/Infinity) metric_value / member_count
 *   - atlas_packets column count is unchanged (140, the value confirmed at
 *     Patch B and every patch since)
 *
 * This does NOT re-run any algorithm — it only inspects already-persisted
 * data. Run scripts/atlas/run-<algorithm>-analysis.mts first if a gate has
 * no run yet.
 *
 * Usage: npx tsx scripts/atlas/verify-graph-analysis-gates.mts
 * Exit code 0 if all gates pass, 1 if any fail (for CI/task-runner use).
 */
import 'dotenv/config';
import { Pool } from 'pg';

const db = new Pool({
  host: process.env.POSTGRES_HOST ?? '127.0.0.1',
  port: Number(process.env.POSTGRES_PORT ?? 5434),
  user: process.env.POSTGRES_USER ?? 'legal_admin',
  password: process.env.POSTGRES_PASSWORD ?? '123456',
  database: process.env.POSTGRES_DB ?? 'legal_ai_db',
});

const EXPECTED_ATLAS_PACKETS_COLUMNS = 140;

interface GateResult {
  gate: string;
  algorithm: string;
  pass: boolean;
  details: Record<string, unknown>;
  failures: string[];
}

async function verifyMetricAlgorithm(algorithm: string, metricName: string): Promise<GateResult> {
  const failures: string[] = [];
  const { rows: runRows } = await db.query<{ run_id: string; status: string; projection_name: string }>(
    `SELECT run_id, status, projection_name FROM graph_analysis_runs
     WHERE algorithm = $1 AND status = 'succeeded' ORDER BY started_at DESC LIMIT 1`,
    [algorithm],
  );
  const run = runRows[0];
  if (!run) {
    return { gate: `GA-${algorithm}`, algorithm, pass: false, details: {}, failures: [`no succeeded graph_analysis_runs row for algorithm='${algorithm}'`] };
  }

  const { rows: statRows } = await db.query<{
    total_rows: string;
    distinct_packets: string;
    non_finite: string;
    min_score: string;
    max_score: string;
  }>(
    `SELECT count(*) AS total_rows, count(DISTINCT packet_key) AS distinct_packets,
       count(*) FILTER (WHERE metric_value IN ('NaN'::float8,'Infinity'::float8,'-Infinity'::float8)) AS non_finite,
       min(metric_value)::text AS min_score, max(metric_value)::text AS max_score
     FROM graph_node_metrics WHERE run_id = $1 AND metric_name = $2`,
    [run.run_id, metricName],
  );
  const stat = statRows[0];
  const totalRows = Number(stat?.total_rows ?? 0);
  const distinctPackets = Number(stat?.distinct_packets ?? 0);
  const nonFinite = Number(stat?.non_finite ?? 0);

  if (totalRows === 0) failures.push(`zero graph_node_metrics rows for run_id=${run.run_id}, metric_name='${metricName}'`);
  if (totalRows !== distinctPackets) failures.push(`duplicate packet_key rows: ${totalRows} rows but only ${distinctPackets} distinct packet_keys`);
  if (nonFinite > 0) failures.push(`${nonFinite} non-finite (NaN/Infinity) metric_value rows`);

  return {
    gate: `GA-${algorithm}`,
    algorithm,
    pass: failures.length === 0,
    details: { runId: run.run_id, projectionName: run.projection_name, totalRows, distinctPackets, minScore: stat?.min_score, maxScore: stat?.max_score },
    failures,
  };
}

async function verifyCommunityAlgorithm(algorithm: 'louvain' | 'leiden'): Promise<GateResult> {
  const failures: string[] = [];
  const { rows: runRows } = await db.query<{ run_id: string; status: string; projection_name: string }>(
    `SELECT run_id, status, projection_name FROM graph_analysis_runs
     WHERE algorithm = $1 AND status = 'succeeded' ORDER BY started_at DESC LIMIT 1`,
    [algorithm],
  );
  const run = runRows[0];
  if (!run) {
    return { gate: `GA3-${algorithm}`, algorithm, pass: false, details: {}, failures: [`no succeeded graph_analysis_runs row for algorithm='${algorithm}'`] };
  }

  const { rows: assignRows } = await db.query<{ total_rows: string; distinct_packets: string }>(
    `SELECT count(*) AS total_rows, count(DISTINCT packet_key) AS distinct_packets
     FROM graph_community_assignments WHERE run_id = $1`,
    [run.run_id],
  );
  const { rows: commRows } = await db.query<{ total_communities: string; non_finite_members: string }>(
    `SELECT count(*) AS total_communities,
       count(*) FILTER (WHERE member_count IN ('NaN'::numeric,'Infinity'::numeric)) AS non_finite_members
     FROM graph_communities WHERE run_id = $1`,
    [run.run_id],
  );
  const totalRows = Number(assignRows[0]?.total_rows ?? 0);
  const distinctPackets = Number(assignRows[0]?.distinct_packets ?? 0);
  const totalCommunities = Number(commRows[0]?.total_communities ?? 0);
  const nonFiniteMembers = Number(commRows[0]?.non_finite_members ?? 0);

  if (totalRows === 0) failures.push(`zero graph_community_assignments rows for run_id=${run.run_id}`);
  if (totalRows !== distinctPackets) failures.push(`duplicate packet_key rows: ${totalRows} rows but only ${distinctPackets} distinct packet_keys`);
  if (totalCommunities === 0) failures.push(`zero graph_communities rows for run_id=${run.run_id}`);
  if (nonFiniteMembers > 0) failures.push(`${nonFiniteMembers} non-finite member_count rows`);

  return {
    gate: `GA3-${algorithm}`,
    algorithm,
    pass: failures.length === 0,
    details: { runId: run.run_id, projectionName: run.projection_name, totalRows, distinctPackets, totalCommunities },
    failures,
  };
}

async function verifyAtlasPacketsUnchanged(): Promise<GateResult> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*) AS count FROM information_schema.columns WHERE table_name = 'atlas_packets'`,
  );
  const columnCount = Number(rows[0]?.count ?? 0);
  const pass = columnCount === EXPECTED_ATLAS_PACKETS_COLUMNS;
  return {
    gate: 'atlas_packets-identity-layer-unchanged',
    algorithm: 'n/a',
    pass,
    details: { columnCount, expected: EXPECTED_ATLAS_PACKETS_COLUMNS },
    failures: pass ? [] : [`atlas_packets has ${columnCount} columns, expected ${EXPECTED_ATLAS_PACKETS_COLUMNS} — identity layer may have been modified`],
  };
}

async function main() {
  const results: GateResult[] = await Promise.all([
    verifyMetricAlgorithm('pagerank', 'pagerank'),
    verifyCommunityAlgorithm('louvain'),
    verifyCommunityAlgorithm('leiden'),
    verifyMetricAlgorithm('cheirank', 'cheirank'),
    verifyMetricAlgorithm('kcore', 'kcore'),
    verifyAtlasPacketsUnchanged(),
  ]);

  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} gates PASS`);
  if (failed.length > 0) {
    console.log(`FAILED: ${failed.map((f) => f.gate).join(', ')}`);
  }

  await db.end();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
