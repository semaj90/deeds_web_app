#!/usr/bin/env node
/** Read-only audit of the owner for revision-qualified graph evidence. */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const reportArgument = process.argv.slice(2).find((argument) => argument.startsWith('--output='));
const REPORT = resolve(ROOT, reportArgument?.slice('--output='.length) || 'docs/reports/graph-revision-owner-v1.json');
const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

const loadWorkspaceRevision = () => {
  try {
    const report = JSON.parse(readFileSync(resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
    if (report.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || report.authority !== true) return null;
    return report.workspaceRevision ?? null;
  } catch { return null; }
};

async function main() {
  const tables = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('atlas_hyperedges', 'atlas_relationships',
        'atlas_ontology_tuples', 'atlas_taxonomy_assignment_candidates',
        'graph_analysis_runs', 'atlas_graph_snapshots_v2', 'atlas_graph_nodes_v2',
        'atlas_graph_relation_events_v2', 'atlas_graph_relation_participants_v2', 'atlas_packets',
        'graphify_files', 'graphify_symbols', 'graphify_edges')
  `);
  const present = new Set(tables.rows.map((row) => row.table_name));
  const revisionTables = {};
  const revisionlessTables = {};
  const tableColumns = {};
  for (const table of present) {
    const columns = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `, [table]);
    const names = new Set(columns.rows.map((row) => row.column_name));
    tableColumns[table] = [...names].sort();
    if (!names.has('graph_revision')) {
      const count = await pool.query(`SELECT count(*)::integer AS rows FROM public.${table}`);
      revisionlessTables[table] = {
        rows: Number(count.rows[0]?.rows ?? 0),
        reason: 'GRAPH_REVISION_COLUMN_UNAVAILABLE',
      };
      continue;
    }
    const workspace = names.has('workspace_revision') ? 'workspace_revision' : 'NULL::text';
    const result = await pool.query(`
      SELECT count(*)::integer AS rows,
             count(*) FILTER (WHERE graph_revision IS NOT NULL)::integer AS graph_revision_present,
             count(DISTINCT graph_revision)::integer AS graph_revision_distinct,
             count(*) FILTER (WHERE ${workspace} IS NOT NULL)::integer AS workspace_revision_present,
             count(DISTINCT ${workspace})::integer AS workspace_revision_distinct
      FROM public.${table}
    `);
    const samples = await pool.query(`
      SELECT DISTINCT graph_revision::text AS graph_revision,
             ${workspace}::text AS workspace_revision
      FROM public.${table}
      WHERE graph_revision IS NOT NULL
      ORDER BY graph_revision::text, ${workspace}::text NULLS FIRST
      LIMIT 20
    `);
    revisionTables[table] = { ...result.rows[0], revisionSamples: samples.rows };
  }
  const workspaceRevision = loadWorkspaceRevision();
  const graphV2CrosswalkTables = [
    'atlas_graph_snapshots_v2', 'atlas_graph_nodes_v2', 'atlas_graph_relation_events_v2',
    'atlas_graph_relation_participants_v2', 'atlas_packets',
  ];
  const graphV2Crosswalk = graphV2CrosswalkTables.every((table) => present.has(table))
    ? await pool.query(`
      WITH validated_snapshots AS MATERIALIZED (
        SELECT snapshot_id, source_manifest->>'workspaceRevision' AS workspace_revision, topology_hash
        FROM atlas_graph_snapshots_v2
        WHERE status = 'VALIDATED'
          AND source_manifest->>'workspaceRevision' ~ '^sha256:[0-9a-f]{64}$'
          AND ($1::text IS NULL OR source_manifest->>'workspaceRevision' = $1)
      ), relation_participants AS MATERIALIZED (
        SELECT s.snapshot_id, s.workspace_revision, r.relation_id, r.relation_type,
               r.source_ref AS relation_source_ref, r.topology_hash,
               n.node_key, n.packet_key, n.source_ref AS participant_source_ref,
               n.properties->>'sourceRevision' AS participant_source_revision,
               n.properties->>'workspaceRevision' AS participant_workspace_revision
        FROM validated_snapshots s
        JOIN atlas_graph_relation_events_v2 r
          ON r.snapshot_id = s.snapshot_id AND r.topology_hash = s.topology_hash
         AND length(btrim(r.evidence_span)) > 0
        JOIN atlas_graph_relation_participants_v2 m
          ON m.snapshot_id = r.snapshot_id AND m.relation_id = r.relation_id
        JOIN atlas_graph_nodes_v2 n
          ON n.snapshot_id = m.snapshot_id AND n.node_key = m.node_key
        WHERE n.properties->>'workspaceRevision' = s.workspace_revision
          AND n.properties->>'sourceRevision' ~ '^sha256:[0-9a-f]{64}$'
      ), participant_bindings AS MATERIALIZED (
        SELECT rp.*,
               EXISTS (
                 SELECT 1 FROM atlas_packets p
                 WHERE p.source_ref = rp.participant_source_ref
                   AND p.source_revision = rp.participant_source_revision
                   AND p.workspace_revision_key = rp.workspace_revision
                   AND (rp.packet_key IS NULL OR p.packet_key = rp.packet_key)
               ) AS packet_bound
        FROM relation_participants rp
      ), relation_summary AS (
        SELECT snapshot_id, relation_id, relation_type,
               count(DISTINCT node_key)::integer AS participant_count,
               count(DISTINCT node_key) FILTER (WHERE packet_bound)::integer AS packet_bound_participant_count,
               bool_or(participant_source_ref = relation_source_ref AND packet_bound) AS evidence_source_bound
        FROM participant_bindings
        GROUP BY snapshot_id, relation_id, relation_type
      )
      SELECT
        (SELECT count(*)::integer FROM validated_snapshots) AS validated_snapshot_count,
        count(*)::integer AS relation_count_with_revision_qualified_participants,
        count(*) FILTER (WHERE participant_count >= 3)::integer AS nary_relation_count,
        count(*) FILTER (
          WHERE participant_count >= 3
            AND packet_bound_participant_count = participant_count
            AND evidence_source_bound
        )::integer AS fully_packet_qualified_nary_relation_count,
        coalesce(sum(participant_count), 0)::bigint AS participant_count,
        coalesce(sum(packet_bound_participant_count), 0)::bigint AS packet_bound_participant_count
      FROM relation_summary
    `, [workspaceRevision])
    : null;
  const snapshotOwner = revisionTables.atlas_graph_snapshots_v2 ?? null;
  const analysisOwner = revisionTables.graph_analysis_runs ?? null;
  const report = {
    schema: 'atlas.graph-revision-owner.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    postgresWrites: false,
    expectedWorkspaceRevision: workspaceRevision,
    presentTables: [...present].sort(),
    tableColumns,
    revisionlessTables,
    revisionTables,
    graphV2RelationParticipantCrosswalk: graphV2Crosswalk
      ? { status: 'MEASURED_READ_ONLY', ...graphV2Crosswalk.rows[0] }
      : { status: 'SCHEMA_UNAVAILABLE', requiredTables: graphV2CrosswalkTables },
    ownerCandidates: {
      atlasGraphSnapshotsV2: snapshotOwner ? 'SCHEMA_OWNER_CANDIDATE' : 'UNAVAILABLE',
      graphAnalysisRuns: analysisOwner ? 'ANALYSIS_OWNER_CANDIDATE' : 'UNAVAILABLE',
      relationshipRows: 'NOT_AN_OWNER_UNTIL_WRITER_BINDS_CURRENT_WORKSPACE',
    },
    status: snapshotOwner?.graph_revision_present > 0 || analysisOwner?.graph_revision_present > 0
      ? 'GRAPH_REVISION_OWNER_DATA_PRESENT_REQUIRES_CURRENT_BINDING_CHECK'
      : 'GRAPH_REVISION_OWNER_DATA_MISSING',
    nextGate: 'TRACE_GRAPH_SNAPSHOT_OR_ANALYSIS_WRITER_TO_CURRENT_WORKSPACE_REVISION',
  };
  report.checksum = `sha256:${createHash('sha256').update(JSON.stringify(report), 'utf8').digest('hex')}`;
  mkdirSync(dirname(REPORT), { recursive: true });
  const reportTemp = `${REPORT}.${process.pid}.tmp`;
  writeFileSync(reportTemp, `${JSON.stringify(report, null, 2)}\n`);
  renameSync(reportTemp, REPORT);
  await pool.end();
  console.log(JSON.stringify({
    schema: report.schema, status: report.status, readOnly: true,
    expectedWorkspaceRevision: workspaceRevision, revisionlessTables, revisionTables, report: REPORT,
    graphV2RelationParticipantCrosswalk: report.graphV2RelationParticipantCrosswalk,
  }, null, 2));
}

main().catch(async (error) => {
  await pool.end().catch(() => {});
  console.error(`[graph-revision-owner] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
