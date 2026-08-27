#!/usr/bin/env node
/** Read-only audit of the four-layer source-lineage model. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const REPORT = resolve(ROOT, 'docs/reports/source-lineage-model-v1.json');
const OBSERVATION = resolve(ROOT, 'docs/reports/workspace-source-binding-observation.json');
const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const text = (value) => String(value ?? '').trim();
const loadObservation = () => {
  try {
    const value = JSON.parse(readFileSync(OBSERVATION, 'utf8'));
    return { workspaceRevision: text(value.record?.workspaceRevision), bindings: value.bindings ?? [] };
  } catch { return { workspaceRevision: null, bindings: [] }; }
};

async function main() {
  const tableRows = await pool.query(`
    SELECT table_name, count(*)::integer AS columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('atlas_source_refs', 'atlas_source_aliases',
        'atlas_workspace_source_bindings', 'atlas_packets', 'graphify_files')
    GROUP BY table_name ORDER BY table_name
  `);
  const tables = new Set(tableRows.rows.map((row) => row.table_name));
  const observation = loadObservation();
  const registry = tables.has('atlas_source_refs')
    ? await pool.query(`SELECT count(*)::integer AS rows,
                               count(DISTINCT source_ref_key)::integer AS source_refs
                        FROM public.atlas_source_refs`)
    : { rows: [{ rows: 0, source_refs: 0 }] };
  const graphify = tables.has('graphify_files')
    ? await pool.query(`SELECT count(*)::integer AS rows,
                               count(DISTINCT source_ref)::integer AS source_refs,
                               count(*) FILTER (WHERE content_hash IS NOT NULL)::integer AS content_hash_present,
                               count(*) FILTER (WHERE code_source_revision IS NOT NULL)::integer AS source_revision_present,
                               count(*) FILTER (WHERE workspace_revision IS NOT NULL)::integer AS workspace_revision_present
                        FROM public.graphify_files`)
    : { rows: [{}] };
  const registryCoverage = tables.has('atlas_source_refs') && tables.has('graphify_files')
    ? await pool.query(`
        WITH registry AS (
          SELECT DISTINCT source_ref_key FROM public.atlas_source_refs
        ), graphify AS (
          SELECT DISTINCT source_ref FROM public.graphify_files
          WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
        )
        SELECT count(*)::integer AS graphify_source_refs,
               count(*) FILTER (WHERE r.source_ref_key IS NOT NULL)::integer AS graphify_refs_in_registry,
               count(*) FILTER (WHERE r.source_ref_key IS NULL)::integer AS graphify_refs_missing_registry
        FROM graphify g
        LEFT JOIN registry r ON r.source_ref_key = g.source_ref
      `)
    : { rows: [{}] };
  const projection = tables.has('atlas_packets') && tables.has('graphify_files')
    ? await pool.query(`
        WITH g AS (
          SELECT source_ref, max(code_source_revision) AS source_revision,
                 max(workspace_revision) AS workspace_revision
          FROM public.graphify_files
          WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
          GROUP BY source_ref
        )
        SELECT count(*)::integer AS packet_rows,
               count(*) FILTER (WHERE NULLIF(btrim(p.source_ref), '') IS NOT NULL)::integer AS packet_source_refs,
               count(*) FILTER (WHERE g.source_ref IS NOT NULL)::integer AS exact_current_projection,
               count(*) FILTER (WHERE g.source_ref IS NOT NULL AND g.source_revision IS NOT NULL)::integer AS source_revision_joined,
               count(*) FILTER (WHERE g.source_ref IS NOT NULL AND g.workspace_revision = $1)::integer AS current_workspace_joined
        FROM public.atlas_packets p
        LEFT JOIN g ON g.source_ref = NULLIF(btrim(p.source_ref), '')
      `, [observation.workspaceRevision || null])
    : { rows: [{}] };
  await pool.end();
  const layerStatus = {
    stableSourceIdentity: tables.has('atlas_source_refs') ? 'SCHEMA_PRESENT' : 'MISSING',
    sourceVersionObservation: tables.has('graphify_files') ? 'GRAPHIFY_BACKED_PROVEN' : 'MISSING',
    legacyAliasBinding: tables.has('atlas_source_aliases') ? 'SCHEMA_PRESENT_REQUIRES_APPROVAL_AUDIT' : 'MISSING',
    workspaceSourceBinding: tables.has('atlas_workspace_source_bindings') ? 'SCHEMA_PRESENT_REQUIRES_PRODUCER_AUDIT' : 'MISSING',
    currentProjection: 'READ_ONLY_QUERY_SHAPE_PROVEN_NOT_DURABLE_VIEW',
  };
  const report = {
    schema: 'atlas.source-lineage-model.v1', generatedAt: new Date().toISOString(),
    readOnly: true, postgresWrites: false,
    observation: { path: OBSERVATION, workspaceRevision: observation.workspaceRevision, bindingRows: observation.bindings.length },
    layers: layerStatus,
    tables: Object.fromEntries(tableRows.rows.map((row) => [row.table_name, Number(row.columns)])),
    stableSourceIdentity: registry.rows[0],
    sourceVersionObservation: graphify.rows[0],
    stableIdentityCoverage: registryCoverage.rows[0],
    currentProjection: projection.rows[0],
    projectionChecksum: sha256(JSON.stringify({ workspaceRevision: observation.workspaceRevision, projection: projection.rows[0] })),
    policy: {
      sourceRef: 'locator_only', canonicalSource: 'stable_identity', sourceRevision: 'content_version',
      workspaceRevision: 'observed_version_set', alias: 'evidence_backed_relation',
      normalizedMatch: 'review_only_until_explicit_alias_approval',
    },
    status: tables.has('atlas_source_refs') && tables.has('graphify_files')
      ? 'IDENTITY_AND_VERSION_LAYERS_AVAILABLE_BINDING_LAYER_MISSING'
      : 'SOURCE_LINEAGE_SCHEMA_INCOMPLETE',
    nextGate: 'PROVE_OR_INCUBATE_EXPLICIT_ALIAS_AND_WORKSPACE_SOURCE_BINDING_RELATIONS',
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    schema: report.schema, status: report.status, readOnly: true,
    layers: layerStatus, stableSourceIdentity: registry.rows[0],
    sourceVersionObservation: graphify.rows[0], currentProjection: projection.rows[0],
    stableIdentityCoverage: registryCoverage.rows[0],
    report: REPORT,
  }, null, 2));
}

main().catch(async (error) => {
  await pool.end().catch(() => {});
  console.error(`[source-lineage-model] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
