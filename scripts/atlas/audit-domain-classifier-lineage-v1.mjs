import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const REPORT = resolve(ROOT, 'docs/reports/domain-classifier-lineage-v1.json');
const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD || '123456',
  max: 1,
  connectionTimeoutMillis: 15000,
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const columns = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('atlas_packets', 'graphify_files', 'atlas_source_refs',
                           'atlas_workspace_source_bindings')
    `);
    const has = (table, column) => columns.rows.some(
      (row) => row.table_name === table && row.column_name === column,
    );
    const packetSourceNamespace = has('atlas_packets', 'source_namespace')
      ? 'NULLIF(btrim(ap.source_namespace::text), \'\')'
      : 'NULL::text';
    const graphSourceNamespace = has('graphify_files', 'source_namespace')
      ? 'NULLIF(btrim(gf.source_namespace::text), \'\')'
      : 'NULL::text';
    const graphWorkspaceId = has('graphify_files', 'workspace_id')
      ? 'NULLIF(btrim(gf.workspace_id::text), \'\')'
      : 'NULL::text';
    const packetWorkspace = has('atlas_packets', 'workspace_revision')
      ? 'NULLIF(btrim(ap.workspace_revision::text), \'\')'
      : 'NULL::text';
    const rows = await client.query(`
      WITH graphify AS (
        SELECT source_ref,
               max(NULLIF(btrim(code_source_revision::text), '')) AS source_revision,
               max(NULLIF(btrim(workspace_revision::text), '')) AS workspace_revision,
               max(${graphSourceNamespace}) AS source_namespace,
               max(${graphWorkspaceId}) AS workspace_id
        FROM public.graphify_files gf
        WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
        GROUP BY source_ref
      )
      SELECT count(*)::integer AS classifier_rows,
             count(*) FILTER (WHERE NULLIF(btrim(ap.source_ref), '') IS NOT NULL)::integer AS source_ref_present,
             count(*) FILTER (WHERE g.source_revision IS NOT NULL)::integer AS source_revision_available,
             count(*) FILTER (WHERE COALESCE(${packetWorkspace}, g.workspace_revision) IS NOT NULL)::integer AS workspace_revision_available,
             count(*) FILTER (WHERE COALESCE(${packetSourceNamespace}, g.source_namespace) IS NOT NULL)::integer AS source_namespace_available,
             count(*) FILTER (WHERE g.workspace_id IS NOT NULL)::integer AS workspace_id_namespace_candidate,
             count(*) FILTER (WHERE g.source_ref IS NOT NULL AND g.source_revision IS NOT NULL)::integer AS revision_qualified_join,
             count(*) FILTER (WHERE g.source_ref IS NULL)::integer AS missing_graphify_join
      FROM public.atlas_packets ap
      LEFT JOIN graphify g ON g.source_ref = NULLIF(btrim(ap.source_ref), '')
      WHERE ap.source_kind = 'codebase_chunk'
    `);
    const sample = await client.query(`
      SELECT ap.packet_key, ap.source_ref,
             g.source_revision, g.workspace_revision, g.source_namespace, g.workspace_id
      FROM public.atlas_packets ap
      LEFT JOIN (
        SELECT source_ref,
               max(NULLIF(btrim(code_source_revision::text), '')) AS source_revision,
               max(NULLIF(btrim(workspace_revision::text), '')) AS workspace_revision,
               max(${graphSourceNamespace}) AS source_namespace,
               max(${graphWorkspaceId}) AS workspace_id
        FROM public.graphify_files gf
        WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
        GROUP BY source_ref
      ) g ON g.source_ref = NULLIF(btrim(ap.source_ref), '')
      WHERE ap.source_kind = 'codebase_chunk'
      ORDER BY ap.packet_key
      LIMIT 10
    `);
    await client.query('ROLLBACK');
    const summary = rows.rows[0];
    const status = Number(summary.revision_qualified_join) === Number(summary.classifier_rows) &&
      Number(summary.source_namespace_available) === Number(summary.classifier_rows)
      ? 'CLASSIFIER_LINEAGE_READY_FOR_REVIEW'
      : 'CLASSIFIER_LINEAGE_BLOCKED';
    const report = {
      schema: 'atlas.domain-classifier-lineage.v1',
      generatedAt: new Date().toISOString(),
      readOnly: true,
      postgresWrites: false,
      tupleWrites: false,
      classifierApplyInvoked: false,
      status,
      owner: {
        sourceRevision: 'graphify_files.code_source_revision',
        workspaceRevision: 'graphify_files.workspace_revision',
        sourceNamespace: has('graphify_files', 'source_namespace')
          ? 'graphify_files.source_namespace'
          : 'NO_DECLARED_GRAPHIFY_SOURCE_NAMESPACE',
        namespaceCandidate: has('graphify_files', 'workspace_id')
          ? 'graphify_files.workspace_id (candidate only; semantic namespace proof required)'
          : 'NO_GRAPHIFY_WORKSPACE_ID',
      },
      summary,
      sample: sample.rows,
      nextGate: status === 'CLASSIFIER_LINEAGE_READY_FOR_REVIEW'
        ? 'ADMIT_BOUNDED_CLASSIFIER_TUPLE_DRY_RUN'
        : 'RESOLVE_SOURCE_NAMESPACE_AND_REVISION_COVERAGE_BEFORE_LIVE_TUPLE_WIRING',
    };
    mkdirSync(dirname(REPORT), { recursive: true });
    writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ schema: report.schema, status, readOnly: true, summary, report: REPORT }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  await pool.end().catch(() => {});
  console.error(`[domain-classifier-lineage] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
