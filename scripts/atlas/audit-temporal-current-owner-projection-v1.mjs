#!/usr/bin/env node

/** Read-only projection audit over the existing semantic lifecycle ledger. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(root, 'docs/reports/temporal-current-owner-projection-v1.json');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
const report = {
  schema: 'atlas.temporal-current-owner-projection.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY',
  workspaceRevisionPolicy: 'NULL_ALLOWED_UNTIL_SNAPSHOT_TOURNAMENT_ADMISSION', writesPerformed: false,
  sourceTable: 'public.semantic_lifecycle_events', rows: [], summary: null, status: 'UNKNOWN', promotionAllowed: false,
};
try {
  const result = await pool.query(`SELECT id::text AS event_id, entity_type, entity_id::text AS entity_id,
      previous_state, new_state, reason, actor_type, actor_id, run_id::text AS run_id,
      proof_manifest_id::text AS proof_manifest_id, workspace_revision, created_at
    FROM public.semantic_lifecycle_events ORDER BY entity_type, entity_id, created_at, id`);
  const grouped = new Map();
  for (const event of result.rows) {
    const key = `${event.entity_type}:${event.entity_id}`;
    const list = grouped.get(key) ?? [];
    list.push(event);
    grouped.set(key, list);
  }
  const projections = [];
  for (const [key, events] of grouped) {
    const latest = events[events.length - 1];
    const activeEvents = events.filter((event) => String(event.new_state).toUpperCase() === 'ACTIVE');
    const terminal = ['SUPERSEDED', 'RETRACTED', 'ARCHIVED', 'TOMBSTONED', 'ORPHANED'].includes(String(latest.new_state).toUpperCase());
    const lifecycle = terminal ? String(latest.new_state).toUpperCase() : String(latest.new_state).toUpperCase();
    projections.push({ key, entityType: latest.entity_type, entityId: latest.entity_id, lifecycle, active: lifecycle === 'ACTIVE', eventCount: events.length, activeEventCount: activeEvents.length, latestEventId: latest.event_id, workspaceRevision: latest.workspace_revision ?? null, revisionBound: latest.workspace_revision !== null && latest.workspace_revision !== '', ambiguous: activeEvents.length > 1 && lifecycle === 'ACTIVE' });
  }
  const ambiguous = projections.filter((row) => row.ambiguous);
  const active = projections.filter((row) => row.active);
  report.rows = projections;
  report.summary = { eventCount: result.rowCount, entityCount: projections.length, activeCount: active.length, supersededOrTerminalCount: projections.filter((row) => !row.active).length, ambiguousActiveCount: ambiguous.length, revisionBoundCount: projections.filter((row) => row.revisionBound).length, revisionUnboundCount: projections.filter((row) => !row.revisionBound).length, nullWorkspaceRevisionAccepted: true };
  report.status = ambiguous.length ? 'CURRENT_OWNER_AMBIGUOUS' : result.rowCount === 0 ? 'CURRENT_OWNER_NOT_PROVEN_NO_EVENTS' : 'CURRENT_OWNER_PROJECTION_RECONSTRUCTED';
} catch (error) {
  report.status = 'PROJECTION_UNAVAILABLE';
  report.databaseError = error instanceof Error ? error.message : String(error);
} finally { await pool.end(); }
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, summary: report.summary, databaseError: report.databaseError ?? null, reportPath }, null, 2));
