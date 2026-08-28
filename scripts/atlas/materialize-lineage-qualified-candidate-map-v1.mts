#!/usr/bin/env tsx

/**
 * V1 canary producer: exact packet/source/chunk lineage only.
 *
 * Default mode is read-only. The output is a rebuildable artifact, not a
 * canonical database write. No graph revision is manufactured when the
 * current relationship corpus is empty.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';
import { materializeCandidateOrdinalMap } from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });

const arg = (name: string, fallback: string | null = null): string | null => {
  const inline = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};

const limit = Math.max(1, Math.min(768, Number(arg('limit', '768'))));
const output = path.resolve(arg('output', '.tmp/atlas/lineage-qualified-candidate-map-v1.json')!);
const reportPath = path.resolve(arg('report', 'docs/reports/lineage-qualified-candidate-map-v1.json')!);
const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

type SourceRow = {
  packet_id: number;
  packet_key: string;
  source_ref: string;
  packet_content_hash: string;
  chunk_content_hash: string;
  workspace_revision: string;
  source_revision: string;
  semantic_revision: string | null;
};

const clean = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text || null;
};

async function main(): Promise<void> {
  const columns = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('atlas_packets', 'codebase_chunk_index', 'graphify_files')
  `);
  const has = (table: string, column: string): boolean => columns.rows.some((row) => row.table_name === table && row.column_name === column);
  if (!has('atlas_packets', 'packet_key') || !has('atlas_packets', 'source_ref')) throw new Error('CANARY_PACKET_IDENTITY_SCHEMA_REQUIRED');
  if (!has('atlas_packets', 'content_hash')) throw new Error('CANARY_PACKET_CONTENT_HASH_SCHEMA_REQUIRED');
  if (!has('atlas_packets', 'representation_revision')) throw new Error('CANARY_SEMANTIC_REVISION_SCHEMA_REQUIRED');
  if (!has('codebase_chunk_index', 'source_ref') || !has('codebase_chunk_index', 'content_hash')) throw new Error('CANARY_CHUNK_IDENTITY_SCHEMA_REQUIRED');
  if (!has('graphify_files', 'source_ref') || !has('graphify_files', 'workspace_revision') || !has('graphify_files', 'code_source_revision') || !has('graphify_files', 'content_hash')) throw new Error('CANARY_GRAPHIFY_LINEAGE_SCHEMA_REQUIRED');

  const result = await pool.query<SourceRow>(`
    WITH chunk_by_source AS (
      SELECT source_ref,
             count(DISTINCT lower(content_hash))::integer AS distinct_chunk_hashes,
             max(lower(content_hash)) AS chunk_content_hash
      FROM public.codebase_chunk_index
      WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
      GROUP BY source_ref
    ), graphify_by_source AS (
      SELECT source_ref,
             count(*)::integer AS graphify_rows,
             max(NULLIF(btrim(workspace_revision::text), '')) AS workspace_revision,
             max(NULLIF(btrim(code_source_revision::text), '')) AS source_revision,
             max(lower(content_hash)) AS source_content_hash
      FROM public.graphify_files
      WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
      GROUP BY source_ref
    )
    SELECT ap.packet_id,
           ap.packet_key,
           NULLIF(btrim(ap.source_ref), '') AS source_ref,
           lower(btrim(ap.content_hash)) AS packet_content_hash,
           c.chunk_content_hash,
           g.workspace_revision,
           g.source_revision,
           CASE
             WHEN NULLIF(btrim(ap.representation_revision::text), '') IN ('0', 'unknown', 'legacy') THEN NULL
             ELSE NULLIF(btrim(ap.representation_revision::text), '')
           END AS semantic_revision
    FROM public.atlas_packets ap
    JOIN graphify_by_source g ON g.source_ref = ap.source_ref AND g.graphify_rows = 1
    JOIN chunk_by_source c ON c.source_ref = ap.source_ref AND c.distinct_chunk_hashes = 1
    WHERE ap.packet_key IS NOT NULL
      AND NULLIF(btrim(ap.source_ref), '') IS NOT NULL
      AND NULLIF(btrim(ap.content_hash), '') IS NOT NULL
      AND lower(btrim(ap.content_hash)) = c.chunk_content_hash
      AND g.workspace_revision ~ '^sha256:[0-9a-fA-F]{64}$'
      AND g.source_revision ~ '^sha256:[0-9a-fA-F]{64}$'
    ORDER BY ap.packet_key ASC, ap.packet_id ASC
    LIMIT $1
  `, [limit]);

  const rows = result.rows;
  if (rows.length === 0) throw new Error('CANARY_EXACT_LINEAGE_COHORT_EMPTY');
  const workspaces = new Set(rows.map((row) => row.workspace_revision));
  if (workspaces.size !== 1) throw new Error('CANARY_MIXED_WORKSPACE_REVISIONS');
  const workspaceRevision = rows[0]!.workspace_revision;
  const semanticPresent = rows.filter((row) => Boolean(row.semantic_revision)).length;
  const candidates = rows.map((row) => ({
    canonicalId: row.packet_key,
    packetKey: row.packet_key,
    sourceRef: row.source_ref,
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision: row.workspace_revision,
    sourceRevision: row.source_revision,
    graphRevision: null,
    semanticRevision: row.semantic_revision,
    degradedIdentity: false,
    evidenceRefs: [
      `postgres:atlas_packets:${row.packet_id}`,
      `graphify:${row.source_ref}:${row.source_revision}`,
      `chunk:${row.source_ref}:${row.chunk_content_hash}`,
    ],
  }));
  const candidateSnapshotRevision = `lineage-qualified-canary:${workspaceRevision}:v1:${rows.length}`;
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision,
    workspaceRevision,
    producerRevision: 'lineage-qualified-candidate-map:v1',
    candidates,
  });
  const report = {
    schema: 'atlas.lineage-qualified-candidate-map-receipt.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_CANARY_ARTIFACT',
    postgresWrites: false,
    qdrantWrites: false,
    neo4jWrites: false,
    valkeyWrites: false,
    candidatePoolLimit: limit,
    actualCandidateCount: rows.length,
    lineage: {
      sourceRefEquality: true,
      packetChunkContentHashEquality: true,
      uniqueGraphifySourceRow: true,
      workspaceRevision,
      sourceRevisionAlgorithm: 'sha256:graphify_files.code_source_revision',
      syntheticRevisionFallbacks: false,
    },
    graph: { graphRevision: null, status: 'OPTIONAL_CURRENT_RELATIONSHIP_CORPUS_EMPTY', featurePresence: 0 },
    semantic: { representationId: 'semantic_768', dimensions: 768, rowsWithRepresentationRevision: semanticPresent },
    map: {
      schema: ordinalMap.schema,
      rowCount: ordinalMap.rowCount,
      candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
      ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
      identityAuthority: ordinalMap.identityAuthority,
    },
    candidates: rows.map((row) => ({ packetKey: row.packet_key, sourceRef: row.source_ref, sourceRevision: row.source_revision, semanticRevision: row.semantic_revision })),
    status: semanticPresent === rows.length ? 'LINEAGE_QUALIFIED_CANDIDATE_MAP_READY' : 'LINEAGE_QUALIFIED_MAP_SEMANTIC_PARTIAL',
    nextGate: semanticPresent === rows.length ? 'GOLDEN_RETRIEVAL_READ_ONLY_REPLAY' : 'SEMANTIC_768_CURRENT_COHORT_RECONCILIATION',
  };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(ordinalMap, null, 2)}\n`, 'utf8');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, rowCount: rows.length, candidatePoolLimit: limit, candidateSnapshotRevision, ordinalMapChecksum: ordinalMap.ordinalMapChecksum, graphRevision: null, output, reportPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
}).finally(() => pool.end().catch(() => {}));
