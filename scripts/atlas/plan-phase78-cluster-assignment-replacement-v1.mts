#!/usr/bin/env node

/**
 * PHASE78-CLUSTER-ASSIGNMENT-REPLACEMENT-PLAN-01
 *
 * Read-only plan for replacing the quarantined Phase 78 assignments. The
 * generated SQL is descriptive only; this file never executes UPDATE/DELETE
 * and cannot authorize a replacement run.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const root = path.resolve(import.meta.dirname, '..', '..');
const reportPath = path.join(root, 'docs', 'reports', 'phase78-cluster-assignment-replacement-plan-v1.json');
const sha256 = (value: string) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;

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
  const result = {
    schema: 'atlas.phase78-cluster-assignment-replacement-plan.v1',
    gate: 'PHASE78-CLUSTER-ASSIGNMENT-REPLACEMENT-PLAN-01',
    status: 'DATABASE_UNAVAILABLE',
    startedAt,
    finishedAt: new Date().toISOString(),
    safeToApply: false,
    writesPerformed: false,
    rollbackOccurred: false,
  };
  writeAtomic(result);
  console.log(JSON.stringify(result, null, 2));
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
        count(*) FILTER (WHERE cluster_id IS NOT NULL)::int AS assigned_events,
        count(DISTINCT cluster_id) FILTER (WHERE cluster_id IS NOT NULL)::int AS distinct_clusters
      FROM error_events
    `;
    const assigned = await transaction`
      SELECT cluster_id::text AS cluster_id, id::text AS event_id
      FROM error_events
      WHERE cluster_id IS NOT NULL
      ORDER BY cluster_id, event_id
    `;
    const missingParents = tables.error_clusters_table
      ? await transaction`
          SELECT ee.cluster_id::text AS cluster_id
          FROM error_events ee
          LEFT JOIN error_clusters ec ON ec.id = ee.cluster_id
          WHERE ee.cluster_id IS NOT NULL AND ec.id IS NULL
          GROUP BY ee.cluster_id
          ORDER BY ee.cluster_id
        `
      : [];
    return { tables, counts, assigned, missingParents };
  });

  const cohortRows = census.assigned.map((row) => `${row.cluster_id}\t${row.event_id}`).join('\n');
  const cohortChecksum = sha256(cohortRows);
  const result = {
    schema: 'atlas.phase78-cluster-assignment-replacement-plan.v1',
    gate: 'PHASE78-CLUSTER-ASSIGNMENT-REPLACEMENT-PLAN-01',
    status: census.counts.assigned_events > 0 && census.missingParents.length === 0
      ? 'REPLACEMENT_PLAN_READY_FOR_EXPLICIT_AUTHORIZATION'
      : 'REPLACEMENT_PLAN_BLOCKED',
    startedAt,
    finishedAt: new Date().toISOString(),
    databaseSnapshot: census.tables.database_snapshot,
    target: {
      table: 'error_events',
      predicate: 'cluster_id IS NOT NULL',
      assignedEvents: census.counts.assigned_events,
      distinctClusters: census.counts.distinct_clusters,
      exactCohortChecksum: cohortChecksum,
      parentClusterRows: census.tables.error_clusters_table ? 'error_clusters' : null,
      missingParentClusters: census.missingParents,
    },
    algorithm: {
      implementation: 'sveltekit-frontend/scripts/phase78-kmeans.ts',
      algorithmRevision: 'phase78-kmeans-deterministic-farthest-point-v1',
      targetClusterCount: 20,
      inputOrder: 'stable event id order',
    },
    proposedTransaction: {
      authorizationRequired: true,
      safeToApply: false,
      writesPerformed: false,
      rollbackRequired: true,
      steps: [
        'BEGIN ISOLATION LEVEL REPEATABLE READ',
        're-read predicate and require exactCohortChecksum before mutation',
        'archive exact affected rows and the parent cluster row',
        'clear cluster_id only for the checksum-bound affected event IDs',
        'recompute replacement assignments with the deterministic algorithm',
        'read back assignment distribution and verify no unrelated rows changed',
        'ROLLBACK unless a separately authorized apply receipt is present',
      ],
      forbiddenShortcuts: [
        'UPDATE error_events SET cluster_id = NULL without the exact cohort checksum',
        'DELETE all error_clusters',
        'treat the current single cluster as relevance or repair evidence',
        'authorize mutation from this plan alone',
      ],
    },
    evidenceRefs: [
      'docs/reports/phase78-cluster-assignment-cohort-v1.json',
      'sveltekit-frontend/scripts/phase78-kmeans.ts',
    ],
  };
  writeAtomic(result);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const result = {
    schema: 'atlas.phase78-cluster-assignment-replacement-plan.v1',
    gate: 'PHASE78-CLUSTER-ASSIGNMENT-REPLACEMENT-PLAN-01',
    status: 'PLAN_FAILED',
    startedAt,
    finishedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    safeToApply: false,
    writesPerformed: false,
    rollbackOccurred: false,
  };
  writeAtomic(result);
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 1 });
}
