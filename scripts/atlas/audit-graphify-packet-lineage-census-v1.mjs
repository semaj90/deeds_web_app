#!/usr/bin/env node
/** Read-only atlas_packets -> graphify_files lineage coverage census. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const REPORT = resolve(ROOT, 'docs/reports/graphify-packet-lineage-census-v1.json');
const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

const hasColumn = (rows, table, column) => rows.some((row) => row.table_name === table && row.column_name === column);
const readJsonIfPresent = (filePath) => {
  try { return JSON.parse(readFileSync(filePath, 'utf8')); } catch { return null; }
};

async function main() {
  const columns = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('atlas_packets', 'graphify_files', 'codebase_chunk_index')
  `);
  const packetSource = hasColumn(columns.rows, 'atlas_packets', 'source_ref')
    ? 'NULLIF(btrim(ap.source_ref), \'\')' : 'NULLIF(btrim(ap.canonical_source_ref), \'\')';
  const packetHash = hasColumn(columns.rows, 'atlas_packets', 'content_hash') ? "NULLIF(lower(btrim(ap.content_hash)), '')" : 'NULL::text';
  const packetRevision = hasColumn(columns.rows, 'atlas_packets', 'source_revision') ? "NULLIF(btrim(ap.source_revision), '')" : 'NULL::text';
  const packetWorkspaceRevision = hasColumn(columns.rows, 'atlas_packets', 'workspace_revision') ? "NULLIF(btrim(ap.workspace_revision::text), '')" : 'NULL::text';
  const graphifyWorkspaceRevision = hasColumn(columns.rows, 'graphify_files', 'workspace_revision') ? "NULLIF(btrim(workspace_revision::text), '')" : 'NULL::text';
  const chunkTablePresent = columns.rows.some((row) => row.table_name === 'codebase_chunk_index');
  const chunkHashAvailable = hasColumn(columns.rows, 'codebase_chunk_index', 'content_hash');

  const result = await pool.query(`
    WITH graphify_by_source AS (
      SELECT source_ref,
             count(*)::integer AS graphify_rows,
             max(code_source_revision) AS code_source_revision,
             max(source_revision) AS source_revision,
             max(${graphifyWorkspaceRevision}) AS workspace_revision
      FROM public.graphify_files
      WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
      GROUP BY source_ref
    ), packet_rows AS (
      SELECT ${packetSource} AS source_ref,
             ${packetHash} AS content_hash,
             ${packetRevision} AS source_revision,
             ${packetWorkspaceRevision} AS workspace_revision
      FROM public.atlas_packets ap
      WHERE ap.packet_key IS NOT NULL
    ), joined AS (
      SELECT p.*, g.graphify_rows, g.code_source_revision,
             g.source_revision AS graphify_source_revision,
             g.workspace_revision AS graphify_workspace_revision
      FROM packet_rows p
      LEFT JOIN graphify_by_source g ON g.source_ref = p.source_ref
    )
    SELECT
      count(*)::integer AS packet_rows,
      count(*) FILTER (WHERE source_ref IS NOT NULL)::integer AS packet_rows_with_source_ref,
      count(*) FILTER (WHERE graphify_rows IS NOT NULL)::integer AS exact_source_ref,
      count(*) FILTER (WHERE graphify_rows IS NULL AND source_ref IS NOT NULL)::integer AS missing_graphify_source,
      count(*) FILTER (WHERE graphify_rows > 1)::integer AS duplicate_source_ref,
      count(*) FILTER (WHERE graphify_rows IS NOT NULL AND source_revision IS NOT NULL AND source_revision = graphify_source_revision)::integer AS source_revision_match,
      count(*) FILTER (WHERE graphify_rows IS NOT NULL AND workspace_revision IS NOT NULL AND workspace_revision <> graphify_workspace_revision)::integer AS stale_packet
    FROM joined
  `);
  const classificationResult = await pool.query(`
    WITH graphify_by_source AS (
      SELECT source_ref,
             count(*)::integer AS graphify_rows
      FROM public.graphify_files
      WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
      GROUP BY source_ref
    ), packet_rows AS (
      SELECT ${packetSource} AS source_ref,
             ${packetHash} AS content_hash
      FROM public.atlas_packets ap
      WHERE ap.packet_key IS NOT NULL
    )
    SELECT CASE
      WHEN p.source_ref IS NULL THEN 'IDENTITY_UNRESOLVED'
      WHEN g.graphify_rows IS NULL THEN 'MISSING_GRAPHIFY_SOURCE'
      WHEN g.graphify_rows > 1 THEN 'DUPLICATE_LOGICAL_SOURCE'
      WHEN p.content_hash IS NULL THEN 'PACKET_CONTENT_HASH_UNAVAILABLE'
      ELSE 'SOURCE_JOINED_PACKET_HASH_REQUIRES_CHUNK_GATE'
    END AS classification,
    count(*)::integer AS count
    FROM packet_rows p
    LEFT JOIN graphify_by_source g ON g.source_ref = p.source_ref
    GROUP BY 1
    ORDER BY 1
  `);
  const packetSamples = await pool.query(`
    SELECT source_ref, count(*)::integer AS count
    FROM public.atlas_packets
    WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
      AND source_ref NOT IN (SELECT source_ref FROM public.graphify_files)
    GROUP BY source_ref
    ORDER BY count(*) DESC, source_ref
    LIMIT 20
  `);
  const graphifySamples = await pool.query(`
    SELECT source_ref, count(*)::integer AS count
    FROM public.graphify_files
    WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
      AND source_ref NOT IN (SELECT source_ref FROM public.atlas_packets)
    GROUP BY source_ref
    ORDER BY count(*) DESC, source_ref
    LIMIT 20
  `);
  const packetChunkResult = chunkTablePresent && chunkHashAvailable
    ? await pool.query(`
      WITH chunk_by_source AS (
        SELECT source_ref,
               count(DISTINCT lower(content_hash))::integer AS distinct_chunk_hashes,
               max(content_hash) AS chunk_content_hash
        FROM public.codebase_chunk_index
        WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
        GROUP BY source_ref
      ), packet_rows AS (
        SELECT NULLIF(btrim(ap.source_ref), '') AS source_ref,
               ${packetHash} AS packet_content_hash
        FROM public.atlas_packets ap
        WHERE ap.packet_key IS NOT NULL
      )
      SELECT
        count(*) FILTER (WHERE p.source_ref IS NULL)::integer AS identity_unresolved,
        count(*) FILTER (WHERE p.source_ref IS NOT NULL AND c.source_ref IS NULL)::integer AS chunk_source_missing,
        count(*) FILTER (WHERE c.distinct_chunk_hashes > 1)::integer AS packet_chunk_hash_ambiguous,
        count(*) FILTER (WHERE p.packet_content_hash IS NULL AND c.distinct_chunk_hashes = 1)::integer AS packet_content_hash_unavailable,
        count(*) FILTER (WHERE p.packet_content_hash IS NOT NULL AND c.distinct_chunk_hashes = 1 AND lower(p.packet_content_hash) = lower(c.chunk_content_hash))::integer AS packet_chunk_hash_exact,
        count(*) FILTER (WHERE p.packet_content_hash IS NOT NULL AND c.distinct_chunk_hashes = 1 AND lower(p.packet_content_hash) <> lower(c.chunk_content_hash))::integer AS packet_chunk_hash_mismatch
      FROM packet_rows p
      LEFT JOIN chunk_by_source c ON c.source_ref = p.source_ref
    `)
    : { rows: [{ identity_unresolved: 0, chunk_source_missing: 0, packet_chunk_hash_ambiguous: 0, packet_content_hash_unavailable: 0, packet_chunk_hash_exact: 0, packet_chunk_hash_mismatch: 0 }] };
  const observationPath = resolve(ROOT, 'docs/reports/workspace-source-binding-observation.json');
  let observationBindings = new Map();
  try {
    const observation = JSON.parse(readFileSync(observationPath, 'utf8'));
    observationBindings = new Map((observation.bindings ?? []).map((binding) => [binding.sourceRef, binding]));
  } catch { /* observation availability is reported as a gate below */ }
  const graphifyRows = await pool.query(`
    SELECT source_ref, content_hash, source_revision, code_source_revision
    FROM public.graphify_files
    WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
  `);
  const graphifyTotals = await pool.query(`
    SELECT count(*)::integer AS total_rows,
           count(DISTINCT NULLIF(btrim(source_ref), ''))::integer AS distinct_source_refs
    FROM public.graphify_files
  `);
  const sourceIntegrity = graphifyRows.rows.reduce((acc, row) => {
    const observed = observationBindings.get(row.source_ref);
    if (!observed) { acc.observationMissing += 1; return acc; }
    acc.workspaceBindingMatches += 1;
    const graphHash = String(row.content_hash ?? '').replace(/^sha256:/i, '').toLowerCase();
    const observedHash = String(observed.contentDigest ?? '').replace(/^sha256:/i, '').toLowerCase();
    if (graphHash && observedHash && graphHash === observedHash) acc.hashExact += 1;
    else acc.hashMismatch += 1;
    if (String(row.code_source_revision ?? '').toLowerCase() === `sha256:${observedHash}`) acc.revisionExact += 1;
    else acc.revisionMismatch += 1;
    return acc;
  }, { workspaceBindingMatches: 0, hashExact: 0, hashMismatch: 0, observationMissing: 0, revisionExact: 0, revisionMismatch: 0 });
  const latestBatchPath = resolve(ROOT, '.tmp/atlas/graphify-source-inventory-batch-v1.json');
  const latestBatch = readJsonIfPresent(latestBatchPath);
  const latestReadbackPath = resolve(ROOT, 'docs/reports/graphify-source-inventory-batch-readback-v1.json');
  const latestReadback = readJsonIfPresent(latestReadbackPath);
  await pool.end();

  const row = result.rows[0] ?? {};
  const packetSourceRevisionAvailable = hasColumn(columns.rows, 'atlas_packets', 'source_revision');
  const packetWorkspaceRevisionAvailable = hasColumn(columns.rows, 'atlas_packets', 'workspace_revision');
  const report = {
    schema: 'atlas.graphify-packet-lineage-census-v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    postgresWrites: false,
    packetSourceColumn: hasColumn(columns.rows, 'atlas_packets', 'source_ref') ? 'source_ref' : 'canonical_source_ref',
    packetContentHashColumn: hasColumn(columns.rows, 'atlas_packets', 'content_hash') ? 'content_hash' : null,
    packetSourceRevisionColumn: packetSourceRevisionAvailable ? 'source_revision' : null,
    sourceRevisionAuthorityColumn: hasColumn(columns.rows, 'graphify_files', 'code_source_revision')
      ? 'code_source_revision'
      : 'source_revision',
    gitProvenanceColumn: 'graphify_files.source_revision',
    packetWorkspaceRevisionColumn: packetWorkspaceRevisionAvailable ? 'workspace_revision' : null,
    counts: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value ?? 0)])),
    classificationCounts: Object.fromEntries(
      classificationResult.rows.map((item) => [item.classification, Number(item.count ?? 0)]),
    ),
    packetContentIntegrity: packetChunkResult.rows[0],
    sourceContentIntegrity: {
      observedBindingPath: 'docs/reports/workspace-source-binding-observation.json',
      ...sourceIntegrity,
    },
    reconciliation: {
      graphify_files_total_rows: Number(graphifyTotals.rows[0]?.total_rows ?? 0),
      graphify_distinct_source_refs: Number(graphifyTotals.rows[0]?.distinct_source_refs ?? 0),
      workspace_binding_matches: sourceIntegrity.workspaceBindingMatches,
      source_digest_matches: sourceIntegrity.hashExact,
      latest_batch_selection_checksum: latestBatch?.selectionChecksum ?? latestReadback?.selectionChecksum ?? null,
      latest_batch_applied: latestBatch?.canonicalWriteAttempted === true && latestBatch?.durableMutationCommitted === true,
      latest_batch_readback_count: Number(latestBatch?.persistedSourceCount ?? latestReadback?.readbackRowCount ?? 0),
      latest_batch_report: latestBatch ? '.tmp/atlas/graphify-source-inventory-batch-v1.json' : null,
      latest_batch_readback_report: latestReadback ? 'docs/reports/graphify-source-inventory-batch-readback-v1.json' : null,
    },
    unmatchedSourceRefSamples: {
      packetOnly: packetSamples.rows,
      graphifyOnly: graphifySamples.rows,
    },
    gates: {
      sourceBinding: {
        exact: Number(row.exact_source_ref ?? 0),
        missing: Number(row.missing_graphify_source ?? 0),
        unresolved: Number(row.packet_rows ?? 0) - Number(row.packet_rows_with_source_ref ?? 0),
        duplicate: Number(row.duplicate_source_ref ?? 0),
        proven: Number(row.missing_graphify_source ?? 0) === 0 && Number(row.duplicate_source_ref ?? 0) === 0,
      },
      packetContentIntegrity: {
        exact: Number(packetChunkResult.rows[0]?.packet_chunk_hash_exact ?? 0),
        unavailable: Number(packetChunkResult.rows[0]?.packet_content_hash_unavailable ?? 0),
        ambiguous: Number(packetChunkResult.rows[0]?.packet_chunk_hash_ambiguous ?? 0),
        mismatch: Number(packetChunkResult.rows[0]?.packet_chunk_hash_mismatch ?? 0),
        proven: Number(packetChunkResult.rows[0]?.packet_chunk_hash_exact ?? 0) > 0,
      },
      sourceContentIntegrity: {
        exact: sourceIntegrity.hashExact,
        mismatch: sourceIntegrity.hashMismatch,
        observationMissing: sourceIntegrity.observationMissing,
        proven: sourceIntegrity.hashMismatch === 0 && sourceIntegrity.observationMissing === 0 && sourceIntegrity.hashExact > 0,
      },
      sourceRevisionBinding: {
        exact: sourceIntegrity.revisionExact,
        mismatch: sourceIntegrity.revisionMismatch,
        available: sourceIntegrity.revisionExact > 0,
        proven: sourceIntegrity.revisionMismatch === 0 && sourceIntegrity.revisionExact > 0,
      },
      exactSourceRefAvailable: Number(row.exact_source_ref ?? 0) > 0,
      exactContentHashAvailable: Number(packetChunkResult.rows[0]?.packet_chunk_hash_exact ?? 0) > 0,
      sourceRevisionMatchAvailable: sourceIntegrity.revisionExact > 0,
      sourceRevisionMatchStatus: packetSourceRevisionAvailable
        ? 'MEASURED'
        : sourceIntegrity.revisionExact > 0
          ? 'PACKET_LOCAL_FIELD_NOT_REQUIRED_JOIN_DERIVED_SOURCE_REVISION_PROVEN'
          : 'PACKET_LOCAL_FIELD_UNAVAILABLE_AND_JOIN_DERIVED_SOURCE_REVISION_NOT_PROVEN',
      workspaceRevisionStatus: packetWorkspaceRevisionAvailable ? 'MEASURED' : 'SCHEMA_FIELD_UNAVAILABLE',
      cleanForBackfill: Number(row.missing_graphify_source ?? 0) === 0 && Number(row.duplicate_source_ref ?? 0) === 0,
    },
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.gates.cleanForBackfill ? 'SOURCE_LINEAGE_CENSUS_CLEAN' : 'SOURCE_LINEAGE_CENSUS_GAPS', ...report.counts, gates: report.gates, report: REPORT }, null, 2));
  if (!report.gates.cleanForBackfill) process.exitCode = 2;
}

main().catch(async (error) => {
  await pool.end().catch(() => {});
  console.error(`[graphify-packet-lineage-census] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
