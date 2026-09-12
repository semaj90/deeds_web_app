#!/usr/bin/env node
/**
 * RETRIEVAL-PROFILE-LIVE-READBACK-01 -- READ ONLY.
 *
 * Binds the selected Graphify execution to repository-qualified membership-v2,
 * proven packet/chunk lineage, canonical codebase_chunk_index rows, and existing
 * feature surfaces. Produces a bounded cohort suitable for replay through the
 * pure ChunkRetrievalProfileV2 adapter. It never writes PostgreSQL/Qdrant/etc.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readbackPath = path.join(root, 'docs/reports/graphify-snapshot-native-readback-v1.json');
const reportPath = path.join(root, 'docs/reports/chunk-retrieval-profile-live-readback-v1.json');
const noReport = process.argv.includes('--no-report');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Math.max(1, Math.min(Number.parseInt(limitArg?.split('=')[1] ?? '16', 10) || 16, 128));

if (!fs.existsSync(readbackPath)) throw new Error('SNAPSHOT_NATIVE_READBACK_RECEIPT_MISSING');
const receipt = JSON.parse(fs.readFileSync(readbackPath, 'utf8'));
if (receipt.status !== 'SNAPSHOT_NATIVE_READBACK_PROVEN') throw new Error(`SNAPSHOT_NATIVE_READBACK_NOT_PROVEN:${receipt.status}`);
if (!receipt.executionId || !receipt.workspaceRevision) throw new Error('SNAPSHOT_NATIVE_READBACK_IDENTITY_INCOMPLETE');

const pool = new Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv()),
  max: 1,
  statement_timeout: 120000,
  application_name: 'atlas-chunk-retrieval-profile-live-readback-v1',
});

let rows = [];
let error = null;
let diagnostics = null;
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const sql = `
      SELECT
        m.repository_id::text AS repository_id,
        m.repository_relative_path::text AS repository_relative_path,
        m.source_ref::text AS source_ref,
        m.workspace_revision::text AS workspace_revision,
        m.code_source_revision::text AS source_revision,
        l.packet_key::text AS packet_key,
        l.canonical_chunk_id::text AS canonical_chunk_id,
        l.chunk_row_id::text AS chunk_row_id,
        l.evidence_refs AS lineage_evidence_refs,
        c.language::text AS language,
        c.kind::text AS symbol_kind,
        c.symbol::text AS symbol_name,
        c.summary::text AS summary,
        c.semantic_tags,
        c.tags,
        c.ast_symbols,
        c.ast_imports,
        c.ast_exports,
        c.kmeans_cluster,
        c.cluster_margin,
        c.som_bmu_row,
        c.som_bmu_col,
        c.community_id,
        c.page_rank_score,
        c.manifold4,
        c.embedding_version::text AS representation_revision,
        c.embedding_model::text AS model_revision,
        c.kmeans_model_version::text AS topology_revision,
        f.used_concepts,
        f.entities,
        f.ast_language,
        f.ast_extraction_method,
        f.ast_hash,
        o.feature_revision::text AS observation_feature_revision,
        o.ontology_classes,
        o.evidence_refs AS observation_evidence_refs,
        o.kmeans_cluster_id,
        o.som_row,
        o.som_col,
        o.community_id AS observation_community_id,
        o.pagerank AS observation_pagerank,
        o.producer_revision::text AS observation_producer_revision
      FROM public.graphify_execution_file_membership_v2 m
      JOIN public.atlas_packet_chunk_lineage l
        ON l.source_ref = m.source_ref
       AND l.source_revision = m.code_source_revision
       AND l.revision_status = 'PROVEN'
      JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id
      LEFT JOIN public.atlas_packet_features f
        ON f.packet_key = l.packet_key
       AND (f.source_ref IS NULL OR f.source_ref = m.source_ref)
      LEFT JOIN public.atlas_observation_feature_rows o
        ON o.packet_key = l.packet_key
       AND o.source_ref = m.source_ref
       AND o.workspace_revision = m.workspace_revision
      WHERE m.execution_id = $1::uuid
        AND m.workspace_revision = $2::text
      ORDER BY m.repository_id, m.repository_relative_path, l.canonical_chunk_id
      LIMIT $3
    `;
    rows = (await client.query(sql, [receipt.executionId, receipt.workspaceRevision, limit])).rows;
    const diagnosticSql = `
      WITH members AS (
        SELECT DISTINCT source_ref::text AS source_ref, code_source_revision::text AS source_revision
        FROM public.graphify_execution_file_membership_v2
        WHERE execution_id = $1::uuid
          AND workspace_revision = $2::text
      ), proven_lineage AS (
        SELECT DISTINCT l.packet_key::text AS packet_key, l.chunk_row_id::text AS chunk_row_id,
          l.source_ref::text AS source_ref, l.source_revision::text AS source_revision
        FROM public.atlas_packet_chunk_lineage l
        JOIN members m ON m.source_ref = l.source_ref AND m.source_revision = l.source_revision
        WHERE l.revision_status = 'PROVEN'
      ), feature_sources AS (
        SELECT DISTINCT o.source_ref::text AS source_ref,
          o.feature_revision::text AS feature_revision,
          o.workspace_revision::text AS workspace_revision
        FROM public.atlas_observation_feature_rows o
        JOIN members m ON m.source_ref = o.source_ref
      )
      SELECT
        (SELECT count(*)::int FROM members) AS distinct_source_refs,
        (SELECT count(*)::int FROM proven_lineage) AS proven_lineage_rows,
        (SELECT count(DISTINCT packet_key)::int FROM proven_lineage) AS proven_packet_keys,
        (SELECT count(DISTINCT chunk_row_id)::int FROM proven_lineage) AS proven_chunk_rows,
        (SELECT count(DISTINCT source_ref)::int FROM feature_sources
          WHERE feature_revision IS NOT NULL) AS feature_source_refs,
        (SELECT count(DISTINCT feature_revision)::int FROM feature_sources
          WHERE feature_revision IS NOT NULL) AS feature_revision_count,
        (SELECT array_agg(DISTINCT feature_revision ORDER BY feature_revision)
          FROM feature_sources WHERE feature_revision IS NOT NULL) AS feature_revisions,
        (SELECT count(DISTINCT workspace_revision)::int FROM feature_sources
          WHERE workspace_revision IS NOT NULL) AS feature_workspace_revision_count,
        (SELECT array_agg(DISTINCT workspace_revision ORDER BY workspace_revision)
          FROM feature_sources WHERE workspace_revision IS NOT NULL) AS feature_workspace_revisions
    `;
    diagnostics = (await client.query(diagnosticSql, [receipt.executionId, receipt.workspaceRevision])).rows[0] ?? null;
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
} finally {
  await pool.end();
}

const projected = rows.map((row) => {
  const somX = row.som_bmu_col ?? row.som_col ?? null;
  const somY = row.som_bmu_row ?? row.som_row ?? null;
  const somCell = Number.isInteger(Number(somX)) && Number.isInteger(Number(somY))
    ? Number(somY) * 20 + Number(somX)
    : null;
  const featureRevision = row.observation_feature_revision || row.observation_producer_revision || null;
  const evidenceRefs = [
    ...(Array.isArray(row.lineage_evidence_refs) ? row.lineage_evidence_refs : []),
    ...(Array.isArray(row.observation_evidence_refs) ? row.observation_evidence_refs : []),
  ].filter(Boolean);
  return {
    schema: 'atlas.chunk-retrieval-profile-live-row.v1',
    identity: {
      canonicalChunkId: row.canonical_chunk_id,
      chunkRowId: row.chunk_row_id,
      packetKey: row.packet_key,
      repositoryId: row.repository_id,
      repositoryRelativePath: row.repository_relative_path,
      sourceRef: row.source_ref,
      workspaceRevision: row.workspace_revision,
      sourceRevision: row.source_revision,
    },
    featureRevision,
    lexicalStructural: row.language ? {
      language: row.language,
      symbolKind: row.symbol_kind || undefined,
      symbolName: row.symbol_name || undefined,
      keywords: Array.isArray(row.tags) ? row.tags : undefined,
      identifiers: Array.isArray(row.ast_symbols) ? row.ast_symbols : undefined,
      calls: undefined,
      imports: Array.isArray(row.ast_imports) ? row.ast_imports : undefined,
      exports: Array.isArray(row.ast_exports) ? row.ast_exports : undefined,
    } : undefined,
    semantic: row.representation_revision ? {
      summary: row.summary || undefined,
      semanticTags: Array.isArray(row.semantic_tags) ? row.semantic_tags : undefined,
      representationRevision: row.representation_revision,
      modelRevision: row.model_revision || undefined,
    } : undefined,
    topology: row.topology_revision ? {
      kmeansCluster: row.kmeans_cluster ?? row.kmeans_cluster_id ?? undefined,
      clusterMargin: row.cluster_margin ?? undefined,
      somX: somX == null ? undefined : Number(somX),
      somY: somY == null ? undefined : Number(somY),
      somCell: somCell == null ? undefined : somCell,
      communityId: row.community_id ?? row.observation_community_id ?? undefined,
      pageRank: row.page_rank_score ?? row.observation_pagerank ?? undefined,
      manifold4: Array.isArray(row.manifold4) && row.manifold4.length === 4 ? row.manifold4.map(Number) : undefined,
      topologyRevision: row.topology_revision,
    } : undefined,
    ontology: Array.isArray(row.ontology_classes) && row.ontology_classes.length > 0 && row.observation_producer_revision ? {
      conceptIds: row.ontology_classes,
      entityIds: Array.isArray(row.entities) ? row.entities : undefined,
      ontologyTupleIds: undefined,
      ontologyRevision: row.observation_producer_revision,
    } : undefined,
    evidenceRefs,
    sourceEvidence: {
      astLanguage: row.ast_language || null,
      astExtractionMethod: row.ast_extraction_method || null,
      astHash: row.ast_hash || null,
      usedConcepts: Array.isArray(row.used_concepts) ? row.used_concepts : [],
    },
  };
});

const blockers = [];
for (const row of projected) {
  if (!row.identity.canonicalChunkId || !row.identity.chunkRowId || !row.identity.packetKey) blockers.push('IDENTITY_INCOMPLETE');
  if (!row.identity.repositoryId || !row.identity.repositoryRelativePath) blockers.push('REPOSITORY_IDENTITY_INCOMPLETE');
  if (!row.identity.workspaceRevision || !row.identity.sourceRevision) blockers.push('REVISION_INCOMPLETE');
  if (!row.featureRevision) blockers.push('FEATURE_REVISION_MISSING');
  if (!row.evidenceRefs.length) blockers.push('EVIDENCE_REFS_MISSING');
  if (!row.lexicalStructural && !row.semantic && !row.topology && !row.ontology) blockers.push('NO_FEATURE_GROUPS');
}

const uniqueBlockers = [...new Set(blockers)];
const status = error
  ? 'PROFILE_LIVE_READBACK_ERROR'
  : projected.length === 0
    ? 'PROFILE_LIVE_READBACK_EMPTY'
    : uniqueBlockers.length
      ? 'PROFILE_LIVE_READBACK_BLOCKED'
      : 'PROFILE_LIVE_READBACK_READY_FOR_ADAPTER_REPLAY';

const report = {
  schema: 'atlas.chunk-retrieval-profile-live-readback.v1',
  generatedAt: new Date().toISOString(),
  gate: 'RETRIEVAL-PROFILE-LIVE-READBACK-01',
  status,
  selectedExecutionId: receipt.executionId,
  selectedWorkspaceRevision: receipt.workspaceRevision,
  boundedLimit: limit,
  rowCount: projected.length,
  blockers: uniqueBlockers,
  rows: projected,
  diagnostics,
  error,
  readOnly: true,
  writesPerformed: false,
  canonicalAuthorityChanged: false,
  nextGate: status === 'PROFILE_LIVE_READBACK_READY_FOR_ADAPTER_REPLAY'
    ? 'RETRIEVAL-PROFILE-LIVE-REPLAY-02'
    : 'REVIEW_PROFILE_LIVE_READBACK_BLOCKERS',
};

if (!noReport) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  status,
  rowCount: projected.length,
  blockers: uniqueBlockers,
  selectedExecutionId: receipt.executionId,
  reportPath: noReport ? null : path.relative(root, reportPath),
  writesPerformed: false,
  error,
}, null, 2));
if (error || projected.length === 0 || uniqueBlockers.length) process.exitCode = 2;
