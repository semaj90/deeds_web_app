#!/usr/bin/env node
/** Read-only audit for a revision-qualified CandidateOrdinal cohort. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const REPORT = resolve(ROOT, 'docs/reports/lineage-qualified-candidate-cohort-v1.json');
const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

const clean = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

async function main() {
  const columns = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('atlas_packets', 'codebase_chunk_index', 'graphify_files')
  `);
  const has = (table, column) => columns.rows.some((row) => row.table_name === table && row.column_name === column);
  const packetSource = has('atlas_packets', 'source_ref') ? 'ap.source_ref' : 'ap.canonical_source_ref';
  const packetContentHash = has('atlas_packets', 'content_hash') ? 'ap.content_hash' : 'NULL::text';
  const packetGraphRevision = has('atlas_packets', 'graph_revision') ? 'ap.graph_revision' : 'NULL::text';
  const packetSemanticRevision = has('atlas_packets', 'representation_revision') ? 'ap.representation_revision' : 'NULL::text';
  const packetFeatureId = has('atlas_packets', 'feature_id') ? 'ap.feature_id' : 'NULL::text';
  const packetTreeNodeId = has('atlas_packets', 'tree_node_id') ? 'ap.tree_node_id' : 'NULL::text';
  const chunkAvailable = has('codebase_chunk_index', 'source_ref') && has('codebase_chunk_index', 'content_hash');
  const chunkCte = chunkAvailable ? `
    chunk_by_source AS (
      SELECT source_ref,
             count(DISTINCT lower(content_hash))::integer AS distinct_chunk_hashes,
             max(lower(content_hash)) AS chunk_content_hash
      FROM public.codebase_chunk_index
      WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
      GROUP BY source_ref
    ),` : 'chunk_by_source AS (SELECT NULL::text AS source_ref, 0::integer AS distinct_chunk_hashes, NULL::text AS chunk_content_hash WHERE false),';
  const result = await pool.query(`
    WITH ${chunkCte}
    graphify_by_source AS (
      SELECT source_ref,
             count(*)::integer AS graphify_rows,
             max(workspace_revision::text) AS workspace_revision,
             max(code_source_revision) AS source_revision,
             max(content_hash) AS source_content_hash
      FROM public.graphify_files
      WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
      GROUP BY source_ref
    ), packet_rows AS (
      SELECT ap.packet_id, ap.packet_key,
             NULLIF(btrim(${packetSource}), '') AS source_ref,
             NULLIF(lower(btrim(${packetContentHash})), '') AS packet_content_hash,
             NULLIF(btrim(${packetGraphRevision}::text), '') AS graph_revision,
             NULLIF(btrim(${packetSemanticRevision}::text), '') AS semantic_revision,
             NULLIF(btrim(${packetFeatureId}::text), '') AS feature_id,
             NULLIF(btrim(${packetTreeNodeId}::text), '') AS tree_node_id
      FROM public.atlas_packets ap
      WHERE ap.packet_key IS NOT NULL
    ), joined AS (
      SELECT p.*, g.graphify_rows, g.workspace_revision, g.source_revision,
             g.source_content_hash, c.distinct_chunk_hashes, c.chunk_content_hash
      FROM packet_rows p
      LEFT JOIN graphify_by_source g ON g.source_ref = p.source_ref
      LEFT JOIN chunk_by_source c ON c.source_ref = p.source_ref
    )
    SELECT count(*)::integer AS total_packets,
      count(*) FILTER (WHERE source_ref IS NOT NULL)::integer AS packets_with_source_ref,
      count(*) FILTER (WHERE graphify_rows = 1)::integer AS exact_graphify_source,
      count(*) FILTER (WHERE graphify_rows = 1 AND workspace_revision IS NOT NULL)::integer AS workspace_revision_present,
      count(*) FILTER (WHERE graphify_rows = 1 AND source_revision IS NOT NULL)::integer AS source_revision_present,
      count(*) FILTER (WHERE graphify_rows = 1 AND distinct_chunk_hashes = 1 AND packet_content_hash = chunk_content_hash)::integer AS packet_chunk_exact,
      count(*) FILTER (WHERE graphify_rows = 1 AND distinct_chunk_hashes > 1)::integer AS packet_chunk_ambiguous,
      count(*) FILTER (WHERE graphify_rows = 1 AND graph_revision IS NOT NULL)::integer AS graph_revision_present,
      count(*) FILTER (WHERE graphify_rows = 1 AND semantic_revision IS NOT NULL)::integer AS semantic_revision_present,
      count(*) FILTER (WHERE graphify_rows = 1 AND workspace_revision IS NOT NULL AND source_revision IS NOT NULL
        AND distinct_chunk_hashes = 1 AND packet_content_hash = chunk_content_hash)::integer AS source_chunk_qualified,
      count(*) FILTER (WHERE graphify_rows = 1 AND workspace_revision IS NOT NULL AND source_revision IS NOT NULL
        AND distinct_chunk_hashes = 1 AND packet_content_hash = chunk_content_hash
        AND graph_revision IS NOT NULL AND semantic_revision IS NOT NULL)::integer AS fully_qualified
    FROM joined
  `);
  const samples = await pool.query(`
    SELECT ap.packet_key, NULLIF(btrim(${packetSource}), '') AS source_ref,
           gf.workspace_revision, gf.code_source_revision AS source_revision,
           NULLIF(btrim(${packetGraphRevision}::text), '') AS graph_revision,
           NULLIF(btrim(${packetSemanticRevision}::text), '') AS semantic_revision
    FROM public.atlas_packets ap
    JOIN public.graphify_files gf ON gf.source_ref = ${packetSource}
    WHERE ap.packet_key IS NOT NULL
    ORDER BY ap.packet_id ASC
    LIMIT 10
  `);
  await pool.end();
  const counts = Object.fromEntries(Object.entries(result.rows[0] ?? {}).map(([key, value]) => [key, Number(value ?? 0)]));
  const report = {
    schema: 'atlas.lineage-qualified-candidate-cohort-v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    postgresWrites: false,
    authority: {
      source: 'public.graphify_files.code_source_revision',
      workspace: 'public.graphify_files.workspace_revision',
      packetChunk: 'atlas_packets.(source_ref,content_hash) = codebase_chunk_index.(source_ref,content_hash)',
      graphRevision: 'packet graph_revision only when explicitly populated; no tree-node fallback',
      semanticRevision: 'atlas_packets.representation_revision only when explicitly populated',
    },
    fallbackPolicy: { workspaceRevision: false, sourceRevision: false, graphRevision: false, semanticRevision: false },
    counts,
    sampleExactJoins: samples.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, clean(value)]))),
    promotionStatus: counts.fully_qualified > 0 ? 'COHORT_AVAILABLE_FOR_REVIEW' : 'COHORT_BLOCKED',
    nextGate: counts.workspace_revision_present === 0
      ? 'WORKSPACE_REVISION_OWNER_REQUIRED'
      : counts.source_chunk_qualified > 0 && counts.fully_qualified === 0
        ? 'GRAPH_OR_SEMANTIC_REVISION_OWNER_REQUIRED'
        : 'FREEZE_LINEAGE_QUALIFIED_CANDIDATE_ORDINAL_SNAPSHOT',
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, readOnly: true, counts, promotionStatus: report.promotionStatus, nextGate: report.nextGate, report: REPORT }, null, 2));
}

main().catch(async (error) => {
  await pool.end().catch(() => {});
  console.error(`[lineage-qualified-candidate-cohort] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
