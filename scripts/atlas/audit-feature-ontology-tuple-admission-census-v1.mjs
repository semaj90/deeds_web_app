import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const outputDir = path.resolve(REPO_ROOT, '.tmp/atlas');
const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
const outputPath = path.join(outputDir, `feature-ontology-tuple-admission-census-v1-${timestamp}.json`);
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 10_000,
});
const client = await pool.connect();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

try {
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout = '10s'");

  const relation = await client.query(`
    SELECT to_regclass('public.feature_ontology_tuples') IS NOT NULL AS present
  `);
  const tablePresent = relation.rows[0]?.present === true;
  const columnResult = tablePresent
    ? await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'feature_ontology_tuples'
        ORDER BY ordinal_position
      `)
    : { rows: [] };
  const columns = columnResult.rows.map((row) => row.column_name);
  const required = ['resolution_state', 'predicate', 'object_type'];
  const missingRequired = required.filter((column) => !columns.includes(column));
  let grouped = [];
  let totals = null;
  let evidenceShapes = [];
  let evidenceKeys = [];
  let linkedTupleAudit = { present: false, columns: [], indexes: [], rowCount: null, evidenceStates: [] };

  if (tablePresent && missingRequired.length === 0) {
    const evidenceExpr = columns.includes('evidence')
      ? "count(*) FILTER (WHERE evidence IS NOT NULL AND evidence <> '{}'::jsonb)::bigint AS rows_with_evidence"
      : 'NULL::bigint AS rows_with_evidence';
    const provenanceCols = ['source_ref', 'source_revision', 'extractor_version', 'ontology_version', 'evidence'];
    const selected = provenanceCols.filter((column) => columns.includes(column));
    const provenanceExpr = selected.length
      ? selected.map((column) => `count(*) FILTER (WHERE ${column} IS NOT NULL)::bigint AS with_${column}`).join(',\n')
      : 'NULL::bigint AS no_provenance_columns_available';

    grouped = (await client.query(`
      SELECT resolution_state, predicate, object_type, count(*)::bigint AS tuple_count,
             ${evidenceExpr}
      FROM public.feature_ontology_tuples
      GROUP BY resolution_state, predicate, object_type
      ORDER BY tuple_count DESC, resolution_state, predicate, object_type
    `)).rows;
    totals = (await client.query(`
      SELECT count(*)::bigint AS total_rows, ${provenanceExpr}
      FROM public.feature_ontology_tuples
    `)).rows[0];
    if (columns.includes('evidence')) {
      evidenceShapes = (await client.query(`
        SELECT jsonb_typeof(evidence) AS json_type, count(*)::bigint AS row_count
        FROM public.feature_ontology_tuples
        GROUP BY jsonb_typeof(evidence)
        ORDER BY json_type
      `)).rows;
      evidenceKeys = (await client.query(`
        SELECT key, count(*)::bigint AS row_count,
               count(*) FILTER (WHERE jsonb_typeof(evidence -> key) = 'string')::bigint AS string_values,
               count(*) FILTER (WHERE jsonb_typeof(evidence -> key) = 'object')::bigint AS object_values,
               count(*) FILTER (WHERE jsonb_typeof(evidence -> key) = 'array')::bigint AS array_values
        FROM public.feature_ontology_tuples
        CROSS JOIN LATERAL jsonb_object_keys(
          CASE WHEN jsonb_typeof(evidence) = 'object' THEN evidence ELSE '{}'::jsonb END
        ) AS key
        GROUP BY key
        ORDER BY key
      `)).rows;
    }
  }

  const linkedRelation = await client.query(`
    SELECT to_regclass('public.atlas_ontology_linked_tuples') IS NOT NULL AS present
  `);
  linkedTupleAudit.present = linkedRelation.rows[0]?.present === true;
  if (linkedTupleAudit.present) {
    const linkedColumns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'atlas_ontology_linked_tuples'
      ORDER BY ordinal_position
    `);
    linkedTupleAudit.columns = linkedColumns.rows.map((row) => row.column_name);
    linkedTupleAudit.indexes = (await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'atlas_ontology_linked_tuples'
      ORDER BY indexname
    `)).rows.map((row) => row.indexname);
    const requiredLinked = ['tuple_id', 'source_ref', 'evidence_refs', 'evidence_span', 'evidence_state', 'provenance'];
    const missingLinked = requiredLinked.filter((column) => !linkedTupleAudit.columns.includes(column));
    if (missingLinked.length === 0) {
      linkedTupleAudit.rowCount = (await client.query(`
        SELECT count(*)::bigint AS row_count FROM public.atlas_ontology_linked_tuples
      `)).rows[0]?.row_count ?? null;
      linkedTupleAudit.evidenceStates = (await client.query(`
        SELECT evidence_state, count(*)::bigint AS row_count
        FROM public.atlas_ontology_linked_tuples
        GROUP BY evidence_state ORDER BY evidence_state
      `)).rows;
      linkedTupleAudit.missingExpectedLineageColumns = ['source_revision', 'workspace_revision']
        .filter((column) => !linkedTupleAudit.columns.includes(column));
      if (linkedTupleAudit.columns.includes('source_revision') && linkedTupleAudit.columns.includes('workspace_revision')) {
        linkedTupleAudit.lineageCoverage = (await client.query(`
          SELECT count(*)::bigint AS total_rows,
                 count(*) FILTER (WHERE source_revision IS NOT NULL)::bigint AS with_source_revision,
                 count(*) FILTER (WHERE workspace_revision IS NOT NULL)::bigint AS with_workspace_revision,
                 count(*) FILTER (WHERE provenance ? 'sourceRevision')::bigint AS provenance_source_revision,
                 count(*) FILTER (WHERE provenance ? 'workspaceRevision')::bigint AS provenance_workspace_revision,
                 count(*) FILTER (WHERE evidence_span IS NOT NULL)::bigint AS with_evidence_span
          FROM public.atlas_ontology_linked_tuples
        `)).rows[0];
      }
    } else {
      linkedTupleAudit.missingCoreColumns = missingLinked;
    }
  }

  await client.query('ROLLBACK');
  const body = {
    schema: 'atlas.feature-ontology-tuple-admission-census.v1',
    status: !tablePresent ? 'TABLE_UNAVAILABLE' : missingRequired.length ? 'SCHEMA_INSUFFICIENT' : 'READ_ONLY_CENSUS_COMPLETE',
    relation: 'public.feature_ontology_tuples',
    columns,
    missingRequiredColumns: missingRequired,
    totals,
    grouped,
    evidenceShapes,
    evidenceKeys,
    existingGroundedTupleOwner: linkedTupleAudit,
    interpretation: {
      resolutionIsAdmission: false,
      evidencePresenceProvesGrounding: false,
      censusAuthorizesPromotion: false,
    },
    effects: {
      transaction: 'READ ONLY; rolled back',
      databaseWrites: false,
      cacheWrites: false,
      modelCalls: false,
    },
  };
  const report = { ...body, checksum: sha256(JSON.stringify(body)) };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    totalRows: totals?.total_rows ?? null,
    groups: grouped.length,
    linkedTupleOwnerPresent: linkedTupleAudit.present,
    linkedTupleOwnerRows: linkedTupleAudit.rowCount,
    linkedTupleOwnerMissingLineageColumns: linkedTupleAudit.missingExpectedLineageColumns ?? null,
    missingRequiredColumns: missingRequired,
    reportPath: path.relative(REPO_ROOT, outputPath).replaceAll('\\', '/'),
    writesPerformed: false,
  }, null, 2));
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}
