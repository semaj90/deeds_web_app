#!/usr/bin/env node

/**
 * PHASE78-CLUSTER-ASSIGNMENT-COHORT-01
 *
 * Read-only census of persisted Phase 78 error-cluster assignments. This is
 * intentionally separate from the replacement writer: it identifies the
 * affected cohort and referential gaps without clearing, reassigning, or
 * deleting any rows.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const reportPath = path.join(root, 'docs', 'reports', 'phase78-cluster-assignment-cohort-v1.json');

function writeAtomic(value: unknown): void {
  mkdirSync(path.dirname(reportPath), { recursive: true });
  const temporaryPath = `${reportPath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  if (existsSync(reportPath)) rmSync(reportPath, { force: true });
  renameSync(temporaryPath, reportPath);
}

const startedAt = new Date().toISOString();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  const report = {
    schema: 'atlas.phase78-cluster-assignment-cohort-receipt.v1',
    status: 'DATABASE_UNAVAILABLE',
    startedAt,
    finishedAt: new Date().toISOString(),
    error: 'DATABASE_URL is not configured',
    affectedCohort: null,
    writesPerformed: false,
    rollbackOccurred: false,
    safeToRepair: false,
  };
  writeAtomic(report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });
try {
  const census = await sql.begin(async (transaction) => {
    const [tables] = await transaction`
      SELECT
        to_regclass('public.error_events')::text AS error_events_table,
        to_regclass('public.error_clusters')::text AS error_clusters_table,
        pg_current_snapshot()::text AS database_snapshot
    `;
    if (!tables.error_events_table) throw new Error('ERROR_EVENTS_TABLE_MISSING');

    const [counts] = await transaction`
      SELECT
        count(*)::int AS total_events,
        count(*) FILTER (WHERE cluster_id IS NOT NULL)::int AS assigned_events,
        count(*) FILTER (WHERE cluster_id IS NULL)::int AS unassigned_events,
        count(DISTINCT cluster_id) FILTER (WHERE cluster_id IS NOT NULL)::int AS distinct_assigned_clusters
      FROM error_events
    `;
    const distribution = await transaction`
      SELECT cluster_id::text AS cluster_id, count(*)::int AS event_count
      FROM error_events
      WHERE cluster_id IS NOT NULL
      GROUP BY cluster_id
      ORDER BY event_count DESC, cluster_id
    `;
    const missingParents = tables.error_clusters_table
      ? await transaction`
          SELECT ee.cluster_id::text AS cluster_id, count(*)::int AS event_count
          FROM error_events ee
          LEFT JOIN error_clusters ec ON ec.id = ee.cluster_id
          WHERE ee.cluster_id IS NOT NULL AND ec.id IS NULL
          GROUP BY ee.cluster_id
          ORDER BY ee.cluster_id
        `
      : [];
    const clusterRows = tables.error_clusters_table
      ? await transaction`SELECT count(*)::int AS cluster_rows FROM error_clusters`
      : [{ cluster_rows: null }];

    return {
      tables,
      counts,
      distribution,
      missingParents,
      clusterRows: clusterRows[0],
    };
  });

  const result = {
    schema: 'atlas.phase78-cluster-assignment-cohort-receipt.v1',
    gate: 'PHASE78-CLUSTER-ASSIGNMENT-COHORT-01',
    status: 'READ_ONLY_COHORT_IDENTIFIED',
    startedAt,
    finishedAt: new Date().toISOString(),
    databaseSnapshot: census.tables.database_snapshot,
    tables: census.tables,
    affectedCohort: {
      totalEvents: census.counts.total_events,
      assignedEvents: census.counts.assigned_events,
      unassignedEvents: census.counts.unassigned_events,
      distinctAssignedClusters: census.counts.distinct_assigned_clusters,
      clusterRows: census.clusterRows.cluster_rows,
      clusterDistribution: census.distribution,
      missingParentClusters: census.missingParents,
    },
    classification: census.counts.assigned_events > 0
      ? (census.counts.distinct_assigned_clusters === 1 ? 'SINGLE_CLUSTER_ASSIGNMENT_SUSPECT' : 'ASSIGNMENTS_REQUIRE_ALGORITHM_REVIEW')
      : 'NO_PERSISTED_ASSIGNMENTS',
    safeToRepair: false,
    repairAuthorization: 'CLOSED',
    writesPerformed: false,
    rollbackOccurred: false,
    notes: [
      'This receipt inventories persisted assignments only; it does not identify which run created them unless the live schema provides that provenance.',
      'Existing assignments remain quarantined until a bounded replacement plan and explicit transaction authorization exist.',
    ],
  };
  writeAtomic(result);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const result = {
    schema: 'atlas.phase78-cluster-assignment-cohort-receipt.v1',
    gate: 'PHASE78-CLUSTER-ASSIGNMENT-COHORT-01',
    status: 'AUDIT_FAILED',
    startedAt,
    finishedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    safeToRepair: false,
    writesPerformed: false,
    rollbackOccurred: false,
  };
  writeAtomic(result);
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 1 });
}
