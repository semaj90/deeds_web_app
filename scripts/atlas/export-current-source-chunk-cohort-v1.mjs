#!/usr/bin/env node

/**
 * Read-only bounded export of the current source -> lineage -> physical chunk
 * join.  This is an offline projection input for NDJSON/DuckDB analysis; it is
 * not a materializer and it never promotes identity or writes a datastore.
 *
 * The two hash grains are deliberately kept separate:
 *   source_content_digest = whole source bytes
 *   chunk_content_hash    = one chunk's content
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(root, '.env') });
dotenv.config({ path: path.resolve(root, '.env.local'), override: true });
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env.local'), override: true });

const args = new Map();
const sourceRefs = [];
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--source-ref=')) sourceRefs.push(arg.slice('--source-ref='.length));
  else if (arg.startsWith('--')) {
    const separator = arg.indexOf('=');
    args.set(separator >= 0 ? arg.slice(2, separator) : arg.slice(2), separator >= 0 ? arg.slice(separator + 1) : 'true');
  }
}

const limit = Number(args.get('limit') ?? '1000');
if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
  throw new Error('--limit must be an integer between 1 and 10000');
}

const workspaceRevision = String(args.get('workspace-revision') ?? '').trim() || null;
const outputPath = path.resolve(root, String(args.get('out') ?? '.tmp/atlas/current-source-chunk-cohort-v1.ndjson'));
const reportPath = path.resolve(root, String(args.get('report') ?? 'docs/reports/current-source-chunk-cohort-v1.json'));
const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const digest = (value) => `sha256:${sha256(value)}`;
const relativePath = (value) => path.relative(root, value).replaceAll('\\', '/');
const text = (value) => value == null ? null : String(value);
const sortedJson = (value) => JSON.stringify(value, Object.keys(value).sort());

const cte = `
  WITH bound_sources AS (
    SELECT DISTINCT ON (b.canonical_source_ref, b.workspace_revision)
      b.repo_id::text AS workspace_id,
      b.workspace_revision::text AS workspace_revision,
      b.canonical_source_ref::text AS source_ref,
      b.source_revision::text AS source_revision,
      b.content_digest::text AS source_content_digest,
      b.binding_checksum::text AS binding_checksum
    FROM atlas_workspace_source_bindings b
    WHERE NULLIF(b.canonical_source_ref::text, '') IS NOT NULL
      AND NULLIF(b.source_revision::text, '') IS NOT NULL
      AND NULLIF(b.workspace_revision::text, '') IS NOT NULL
      AND ($1::text IS NULL OR b.workspace_revision::text = $1)
    ORDER BY b.canonical_source_ref, b.workspace_revision, b.observed_at DESC NULLS LAST
  )
`;

const joinSql = `
  ${cte}
  SELECT
    b.workspace_id,
    b.workspace_revision,
    b.source_ref,
    b.source_revision,
    b.source_content_digest,
    b.binding_checksum,
    l.packet_key::text AS packet_key,
    l.canonical_chunk_id::text AS canonical_chunk_id,
    l.chunk_row_id::text AS chunk_row_id,
    l.source_namespace::text AS source_namespace,
    l.membership_status::text AS membership_status,
    l.revision_status::text AS revision_status,
    l.chunk_ordinal,
    l.lineage_producer_revision::text AS lineage_producer_revision,
    l.evidence_refs,
    c.id::text AS physical_chunk_row_id,
    c.qdrant_id::text AS qdrant_id,
    c.relative_path::text AS relative_path,
    c.chunk_id::text AS chunk_id,
    c.content_hash::text AS chunk_content_hash,
    c.content::text AS content,
    c.metadata AS metadata,
    c.tags AS tags,
    c.semantic_tags AS semantic_tags,
    (c.content_embedding IS NOT NULL) AS semantic_embedding_present,
    (c.content_embedding_768 IS NOT NULL) AS semantic_768_embedding_present,
    (c.search_vector IS NOT NULL) AS lexical_search_vector_present
  FROM bound_sources b
  JOIN atlas_packet_chunk_lineage l
    ON l.source_ref::text = b.source_ref
   AND l.source_revision::text = b.source_revision
   AND l.revision_status = 'PROVEN'
  JOIN codebase_chunk_index c
    ON c.id = l.chunk_row_id
  WHERE ($2::text[] IS NULL OR b.source_ref = ANY($2::text[]))
  ORDER BY b.source_ref, l.canonical_chunk_id, l.chunk_row_id
  LIMIT $3
`;

const countSql = `
  ${cte}
  SELECT
    count(*)::int AS qualified_rows,
    count(DISTINCT b.source_ref)::int AS qualified_sources,
    count(DISTINCT b.workspace_revision)::int AS qualified_workspace_revisions
  FROM bound_sources b
  JOIN atlas_packet_chunk_lineage l
    ON l.source_ref::text = b.source_ref
   AND l.source_revision::text = b.source_revision
   AND l.revision_status = 'PROVEN'
  JOIN codebase_chunk_index c ON c.id = l.chunk_row_id
  WHERE ($2::text[] IS NULL OR b.source_ref = ANY($2::text[]))
`;

const pool = new pg.Pool({
  connectionString,
  max: 1,
  statement_timeout: 120000,
  application_name: 'atlas-current-source-chunk-cohort-export',
});

let client;
let rows = [];
let total = { qualified_rows: 0, qualified_sources: 0 };
try {
  client = await pool.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query('SET LOCAL statement_timeout = 120000');
  const params = [workspaceRevision, sourceRefs.length ? sourceRefs : null, limit];
  total = (await client.query(countSql, params.slice(0, 2))).rows[0] ?? total;
  rows = (await client.query(joinSql, params)).rows;
  await client.query('ROLLBACK');
} catch (error) {
  if (client) {
    try { await client.query('ROLLBACK'); } catch {}
  }
  throw error;
} finally {
  client?.release();
  await pool.end();
}

const projected = rows.map((row) => ({
  schema: 'atlas.current-source-chunk-cohort-row.v1',
  workspaceId: text(row.workspace_id),
  workspaceRevision: text(row.workspace_revision),
  sourceRef: text(row.source_ref),
  sourceRevision: text(row.source_revision),
  sourceContentDigest: text(row.source_content_digest),
  bindingChecksum: text(row.binding_checksum),
  packetKey: text(row.packet_key),
  canonicalChunkId: text(row.canonical_chunk_id),
  chunkRowId: text(row.chunk_row_id),
  sourceNamespace: text(row.source_namespace),
  membershipStatus: text(row.membership_status),
  revisionStatus: text(row.revision_status),
  chunkOrdinal: row.chunk_ordinal == null ? null : Number(row.chunk_ordinal),
  lineageProducerRevision: text(row.lineage_producer_revision),
  evidenceRefs: row.evidence_refs ?? [],
  physicalChunkRowId: text(row.physical_chunk_row_id),
  qdrantId: text(row.qdrant_id),
  relativePath: text(row.relative_path),
  chunkId: text(row.chunk_id),
  chunkContentHash: text(row.chunk_content_hash),
  content: text(row.content),
  metadata: row.metadata ?? null,
  tags: row.tags ?? null,
  semanticTags: row.semantic_tags ?? null,
  semanticEmbeddingPresent: row.semantic_embedding_present === true,
  semantic768EmbeddingPresent: row.semantic_768_embedding_present === true,
  lexicalSearchVectorPresent: row.lexical_search_vector_present === true,
  canonicalAuthority: false,
  writesPerformed: false,
}));

const violations = [];
if (Number(total.qualified_workspace_revisions ?? 0) > 1) violations.push('WORKSPACE_REVISION_MIXED');
for (const row of projected) {
  if (!row.sourceRef || !row.sourceRevision || !row.sourceContentDigest) violations.push('SOURCE_BINDING_INCOMPLETE');
  if (!row.chunkRowId || row.physicalChunkRowId !== row.chunkRowId) violations.push('PHYSICAL_CHUNK_ID_MISMATCH');
  if (!row.canonicalChunkId || !row.chunkId || !row.chunkContentHash) violations.push('CHUNK_IDENTITY_INCOMPLETE');
  if (row.sourceRef !== row.relativePath && row.relativePath) {
    // relative_path is a physical location and may be normalized differently;
    // it is diagnostic only, never an identity join.
  }
  if (row.revisionStatus !== 'PROVEN') violations.push('REVISION_STATUS_NOT_PROVEN');
}

const sourceIdentityRows = [...new Map(projected.map((row) => [
  `${row.sourceRef}\0${row.sourceRevision}`,
  { sourceRef: row.sourceRef, sourceRevision: row.sourceRevision, sourceContentDigest: row.sourceContentDigest },
])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const chunkIdentityRows = projected.map((row) => ({
  chunkRowId: row.chunkRowId,
  canonicalChunkId: row.canonicalChunkId,
  chunkId: row.chunkId,
  chunkContentHash: row.chunkContentHash,
})).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const sourceSetChecksum = digest(sourceIdentityRows.map((row) => sortedJson(row)).join('\n'));
const chunkSetChecksum = digest(chunkIdentityRows.map((row) => sortedJson(row)).join('\n'));
const ndjson = projected.map((row) => JSON.stringify(row)).join('\n') + (projected.length ? '\n' : '');
const ndjsonChecksum = digest(ndjson);
const bounded = Number(total.qualified_rows ?? 0) > projected.length;
const status = violations.length
  ? 'BLOCKED_INCONSISTENT_CURRENT_SOURCE_CHUNK_JOIN'
  : projected.length
    ? (bounded ? 'BOUNDED_CURRENT_SOURCE_CHUNK_COHORT_PROVEN' : 'CURRENT_SOURCE_CHUNK_COHORT_PROVEN')
    : 'BLOCKED_NO_QUALIFIED_CURRENT_SOURCE_CHUNKS';

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(outputPath, ndjson, 'utf8');

const report = {
  schema: 'atlas.current-source-chunk-cohort-export.v1',
  generatedAt: new Date().toISOString(),
  status,
  readOnly: true,
  canonicalAuthority: false,
  writesPerformed: false,
  databaseWrites: 0,
  selection: {
    workspaceRevision,
    sourceRefs: sourceRefs.length ? sourceRefs : null,
    limit,
    qualifiedRowsBeforeLimit: Number(total.qualified_rows ?? 0),
    qualifiedSourcesBeforeLimit: Number(total.qualified_sources ?? 0),
    exportedRows: projected.length,
    exportedSources: new Set(projected.map((row) => row.sourceRef)).size,
    qualifiedWorkspaceRevisionsBeforeLimit: Number(total.qualified_workspace_revisions ?? 0),
    truncated: bounded,
  },
  hashGrain: {
    sourceContentDigest: 'whole-source-bytes',
    chunkContentHash: 'one-chunk-content',
    comparedDirectly: false,
  },
  checksums: { sourceSetChecksum, chunkSetChecksum, ndjsonChecksum },
  validation: {
    violations: [...new Set(violations)],
    sourceRevisionJoin: violations.includes('SOURCE_BINDING_INCOMPLETE') ? 'FAIL' : 'PASS',
    physicalChunkRowJoin: violations.includes('PHYSICAL_CHUNK_ID_MISMATCH') ? 'FAIL' : 'PASS',
    chunkIdentity: violations.includes('CHUNK_IDENTITY_INCOMPLETE') ? 'FAIL' : 'PASS',
    revisionStatus: violations.includes('REVISION_STATUS_NOT_PROVEN') ? 'FAIL' : 'PASS',
    workspaceRevisionParity: violations.includes('WORKSPACE_REVISION_MIXED') ? 'FAIL' : 'PASS',
  },
  outputPath: relativePath(outputPath),
  sourceTables: [
    'atlas_workspace_source_bindings',
    'atlas_packet_chunk_lineage',
    'codebase_chunk_index',
  ],
  downstream: 'DuckDB/NDJSON offline analysis only; no online retrieval or projection admission',
  nextGate: status === 'CURRENT_SOURCE_CHUNK_COHORT_PROVEN' || status === 'BOUNDED_CURRENT_SOURCE_CHUNK_COHORT_PROVEN'
    ? 'SOURCE_CHUNK_MATERIALIZATION_BINDING_REVIEW'
    : 'CURRENT_SOURCE_OWNER_RECONCILIATION',
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
