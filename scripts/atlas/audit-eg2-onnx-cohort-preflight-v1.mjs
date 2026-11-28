#!/usr/bin/env node
/**
 * Read-only PG18 preflight for a pinned EmbeddingGemma 2 ONNX challenger cohort.
 * This intentionally does not embed, write vectors, or alter the existing GGUF index.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const require = createRequire(path.join(REPO_ROOT, 'sveltekit-frontend', 'package.json'));
const { Client } = require('pg');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=') || true];
}));
for (const key of args.keys()) {
  if (key === 'apply' || key === 'embed') throw new Error('READ_ONLY_PREFLIGHT_DOES_NOT_ACCEPT_APPLY_OR_EMBED');
  if (key !== 'output' && key !== 'catalog-only') throw new Error(`UNSUPPORTED_ARGUMENT:${key}`);
}
if (args.has('catalog-only') && args.get('catalog-only') !== true) {
  throw new Error('CATALOG_ONLY_IS_A_FLAG');
}
const catalogOnly = args.has('catalog-only');

const OUT = String(args.get('output') ?? '.tmp/review/eg2-onnx-cohort-preflight-v1.json');
const HISTORICAL_REVISION = 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc';
const FRAME_RECEIPT = path.join(REPO_ROOT, '.tmp/review/current-workspace-frame-admission-v1.json');
const client = new Client({
  connectionString: resolveDatabaseUrl(loadRepoEnv()),
  connectionTimeoutMillis: 5000,
  statement_timeout: 60000,
  query_timeout: 65000,
  application_name: 'atlas-eg2-onnx-cohort-preflight-v1',
});

function readWorkspaceFrameDiagnostic() {
  try {
    const frame = JSON.parse(fs.readFileSync(FRAME_RECEIPT, 'utf8'));
    return {
      path: path.relative(REPO_ROOT, FRAME_RECEIPT).replaceAll('\\', '/'),
      generatedAt: frame.generatedAt ?? null,
      admittedWorkspaceRevision: frame.admittedWorkspaceRevision ?? null,
      admittedAuthority: frame.admittedAuthority === true,
      canonicalAuthority: frame.canonicalAuthority === true,
      promotionEligible: frame.promotionEligible === true,
      currentWorkspaceMatches: frame.currentWorkspaceMatches ?? null,
      sourceAuthorityStatus: frame.sourceAuthority?.status ?? null,
      sourceAuthoritySafeToPromote: frame.sourceAuthority?.safeToPromote === true,
      nextGate: frame.nextGate ?? null,
      usedAsAuthorization: false,
    };
  } catch {
    return { path: path.relative(REPO_ROOT, FRAME_RECEIPT).replaceAll('\\', '/'), readable: false, usedAsAuthorization: false };
  }
}

let transactionOpen = false;
try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  transactionOpen = true;
  await client.query("SET LOCAL statement_timeout = '60s'");

  const identity = await client.query(`
    SELECT current_database() AS database,
           current_setting('transaction_read_only')::boolean AS read_only,
           version() AS server_version
  `);
  if (identity.rows[0]?.read_only !== true) throw new Error('READ_ONLY_TRANSACTION_NOT_CONFIRMED');

  const source = catalogOnly ? null : await client.query(`
    SELECT count(*)::bigint AS total_rows,
           count(*) FILTER (WHERE content IS NOT NULL AND length(content) > 0)::bigint AS nonempty_content_rows,
           count(*) FILTER (WHERE content_hash ~* '^([0-9a-f]{64}|sha256:[0-9a-f]{64})$')::bigint AS hash_shaped_rows,
           count(*) FILTER (WHERE source_revision ~* '^sha256:[0-9a-f]{64}$')::bigint AS sha256_source_revision_rows,
           count(*) FILTER (WHERE workspace_revision ~* '^sha256:[0-9a-f]{64}$')::bigint AS sha256_workspace_revision_rows,
           count(*) FILTER (WHERE representation_revision IS NOT NULL AND btrim(representation_revision) <> '')::bigint AS representation_revision_rows,
           count(*) FILTER (WHERE workspace_revision = $1)::bigint AS historical_incident_revision_rows
      FROM public.codebase_chunk_index
  `, [HISTORICAL_REVISION]);

  const existing = catalogOnly ? null : await client.query(`
    SELECT representation_id, model_revision, count(*)::bigint AS rows,
           count(*) FILTER (WHERE embedding IS NOT NULL)::bigint AS embedded_rows,
           count(*) FILTER (WHERE vector_dims(embedding) = 768)::bigint AS dimension_768_rows
      FROM public.codebase_chunk_eg2_embeddings
     GROUP BY representation_id, model_revision
     ORDER BY representation_id, model_revision
  `);
  const key = await client.query(`
    SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public' AND t.relname = 'codebase_chunk_eg2_embeddings' AND c.contype = 'p'
  `);
  const schema = await client.query(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('codebase_chunk_index', 'atlas_workspace_source_bindings', 'atlas_packet_chunk_lineage', 'codebase_chunk_eg2_embeddings')
     ORDER BY table_name, ordinal_position
  `);
  const reusableOwners = await client.query(`
    WITH table_contracts AS (
      SELECT c.oid, n.nspname, c.relname,
             bool_or(a.attname = 'representation_id') AS has_representation_id,
             bool_or(a.attname = 'model_revision') AS has_model_revision,
             bool_or(a.attname IN ('source_id', 'source_ref', 'packet_key', 'chunk_id')) AS has_source_key,
             string_agg(format('%I %s', a.attname, t.typname), ', ' ORDER BY a.attnum)
               FILTER (WHERE t.typname IN ('vector', 'halfvec', 'sparsevec')) AS vector_columns
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        JOIN pg_type t ON t.oid = a.atttypid
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
       GROUP BY c.oid, n.nspname, c.relname
    )
    SELECT nspname AS schema_name, relname AS table_name,
           has_representation_id, has_model_revision, has_source_key, vector_columns,
           (SELECT pg_get_constraintdef(k.oid)
              FROM pg_constraint k WHERE k.conrelid = table_contracts.oid AND k.contype = 'p'
              LIMIT 1) AS primary_key
      FROM table_contracts
     WHERE vector_columns IS NOT NULL AND has_representation_id AND has_model_revision
     ORDER BY relname
  `);
  const lineage = catalogOnly ? null : await client.query(`
    SELECT count(*)::bigint AS total_rows,
           count(*) FILTER (WHERE revision_status = 'PROVEN')::bigint AS proven_revision_rows,
           count(*) FILTER (WHERE source_revision ~* '^sha256:[0-9a-f]{64}$')::bigint AS sha256_source_revision_rows,
           (SELECT coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
              FROM (SELECT coalesce(membership_status::text, '<null>') AS status, count(*)::bigint AS n
                      FROM public.atlas_packet_chunk_lineage GROUP BY membership_status) membership_counts) AS membership_status_counts,
           (SELECT coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
              FROM (SELECT coalesce(revision_status::text, '<null>') AS status, count(*)::bigint AS n
                      FROM public.atlas_packet_chunk_lineage GROUP BY revision_status) revision_counts) AS revision_status_counts
      FROM public.atlas_packet_chunk_lineage
  `);

  await client.query('COMMIT');
  transactionOpen = false;
  const sourceCounts = source ? Object.fromEntries(Object.entries(source.rows[0]).map(([k, v]) => [k, String(v)])) : null;
  const existingRows = existing ? existing.rows.map((row) => ({
    representationId: row.representation_id,
    modelRevision: row.model_revision,
    rows: String(row.rows),
    embeddedRows: String(row.embedded_rows),
    dimension768Rows: String(row.dimension_768_rows),
  })) : null;
  const frame = readWorkspaceFrameDiagnostic();
  const blockers = [
    'WORKSPACE_CURRENTNESS_NOT_PROVEN',
    'HISTORICAL_SOURCE_REVISION_BACKFILL_REQUIRES_ROW_LEVEL_RECOVERY_EVIDENCE',
    'EXISTING_EG2_TABLE_PRIMARY_KEY_IS_SOURCE_ID_ONLY',
    'NO_PINNED_ONNX_RECIPE_STORAGE_CONTRACT_FOR_THIS_TABLE',
    'NO_SOURCE_QUALIFIED_COHORT_ADMITTED_FOR_EMBEDDING',
  ];
  const receipt = {
    schema: 'atlas.eg2-onnx-cohort-preflight.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_REPEATABLE_READ',
    status: 'BLOCKED_NOT_ADMITTED',
    proofLevel: catalogOnly ? 'LIVE_CATALOG_READBACK_ONLY' : 'LIVE_CATALOG_AND_COUNT_READBACK_ONLY',
    writesPerformed: false,
    embeddingsPerformed: false,
    database: {
      name: identity.rows[0].database,
      version: identity.rows[0].server_version,
      transactionReadOnly: identity.rows[0].read_only,
    },
    currentnessDiagnostic: frame,
    sourceCensus: sourceCounts,
    incidentWorkspaceRevision: HISTORICAL_REVISION,
    lineageCensus: lineage ? {
      totalRows: String(lineage.rows[0].total_rows),
      provenRevisionRows: String(lineage.rows[0].proven_revision_rows),
      sha256SourceRevisionRows: String(lineage.rows[0].sha256_source_revision_rows),
      membershipStatusCounts: lineage.rows[0].membership_status_counts,
      revisionStatusCounts: lineage.rows[0].revision_status_counts,
    } : null,
    eg2ExistingRepresentations: existingRows,
    eg2PrimaryKey: key.rows[0] ?? null,
    reusableVersionedVectorOwners: reusableOwners.rows,
    inspectedColumns: schema.rows,
    admission: {
      selectedForEmbedding: 0,
      inferenceAllowed: false,
      storageWriteAllowed: false,
      reason: 'This report inspects storage contracts. No row-level source bytes, active workspace authority, approved ONNX recipe key, or target grant was materialized for admission.',
    },
    blockers,
  };
  const outputPath = path.resolve(REPO_ROOT, OUT);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
  console.log(JSON.stringify({ ...receipt, inspectedColumns: `${schema.rows.length} columns`, reportPath: path.relative(REPO_ROOT, outputPath).replaceAll('\\', '/') }, null, 2));
} finally {
  if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
  await client.end().catch(() => {});
}
