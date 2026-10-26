#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import * as dotenv from 'dotenv';
import { tableFromIPC } from 'apache-arrow';
import { REPO_ROOT, loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { buildDirectoryEmbeddingCoverageV1 } from './lib/directory-embedding-coverage-v1.mjs';

dotenv.config({ path: path.join(REPO_ROOT, 'sveltekit-frontend', '.env'), quiet: true });
dotenv.config({ path: path.join(REPO_ROOT, 'sveltekit-frontend', '.env.local'), override: true, quiet: true });

const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const runId = arg('--run-id') ?? '';
if (!/^embedding-coverage-[a-z0-9-]{1,48}$/.test(runId)) throw new Error('RUN_ID_INVALID');
const root = path.resolve(REPO_ROOT);
const pathManifestPath = path.resolve(root, arg('--path-manifest') ?? '');
if (!pathManifestPath.startsWith(`${root}${path.sep}`)) throw new Error('PATH_MANIFEST_OUTSIDE_REPOSITORY');

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
function verifyReceipt(manifest, digestField, expectedSchema) {
  const body = { ...manifest };
  delete body[digestField];
  if (manifest.schema !== expectedSchema || hash(Buffer.from(canonical(body))) !== manifest[digestField]) {
    throw new Error(`INPUT_RECEIPT_INVALID:${expectedSchema}`);
  }
}
function resolveInside(relativePath, label) {
  const absolutePath = path.resolve(root, relativePath);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) throw new Error(`${label}_OUTSIDE_REPOSITORY`);
  return absolutePath;
}

const pathManifest = readJson(pathManifestPath);
verifyReceipt(pathManifest, 'receiptSha256', 'atlas.directory-intelligence-path-snapshot.v1');
if (pathManifest.sourceEnumerationStatus !== 'COMPLETE' || pathManifest.canonicalAuthority !== false) {
  throw new Error('PATH_SNAPSHOT_NOT_COMPLETE_ADVISORY');
}
const pathArtifactPath = resolveInside(pathManifest.artifactPath, 'PATH_ARTIFACT');
const pathBytes = readFileSync(pathArtifactPath);
if (pathBytes.length !== pathManifest.artifactBytes || hash(pathBytes) !== pathManifest.artifactSha256) {
  throw new Error('PATH_ARTIFACT_CHECKSUM_INVALID');
}
const pathTable = tableFromIPC(pathBytes);
if (pathTable.numRows !== pathManifest.rows) throw new Error('PATH_ARTIFACT_ROW_COUNT_INVALID');

const connectionString = resolveDatabaseUrl(loadRepoEnv());
const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 180000 });
let databaseSnapshot;
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '180s'");
    const identity = await client.query(`
      SELECT current_setting('transaction_read_only') AS read_only,
             current_setting('transaction_isolation') AS isolation,
             current_setting('server_version') AS server_version,
             txid_current_snapshot()::text AS snapshot_id
    `);
    if (identity.rows[0]?.read_only !== 'on' || identity.rows[0]?.isolation !== 'repeatable read') {
      throw new Error('DATABASE_TRANSACTION_NOT_READ_ONLY_REPEATABLE_READ');
    }
    const lineageCtes = `
      WITH lineage_by_chunk AS (
        SELECT chunk_row_id,
               count(DISTINCT ROW(source_ref, source_revision, packet_key, canonical_chunk_id))::int AS identity_count,
               count(DISTINCT source_ref)::int AS source_ref_count,
               count(DISTINCT source_revision)::int AS source_revision_count,
               min(source_ref) AS lineage_source_ref,
               min(source_revision) AS lineage_source_revision
        FROM public.atlas_packet_chunk_lineage
        WHERE revision_status = 'PROVEN'
        GROUP BY chunk_row_id
      ), binding_by_revision AS (
        SELECT canonical_source_ref, source_revision,
               count(DISTINCT workspace_revision)::int AS workspace_count,
               count(DISTINCT content_digest)::int AS digest_count,
               count(DISTINCT binding_checksum)::int AS checksum_count
        FROM public.atlas_workspace_source_bindings
        GROUP BY canonical_source_ref, source_revision
      ), joined_chunks AS (
        SELECT c.*, l.identity_count AS lineage_identity_count,
               l.source_ref_count AS lineage_source_ref_count,
               l.source_revision_count AS lineage_source_revision_count,
               l.lineage_source_ref, l.lineage_source_revision,
               b.workspace_count AS binding_workspace_count,
               b.digest_count AS binding_digest_count,
               b.checksum_count AS binding_checksum_count
        FROM public.codebase_chunk_index c
        LEFT JOIN lineage_by_chunk l ON l.chunk_row_id = c.id
        LEFT JOIN binding_by_revision b
          ON b.canonical_source_ref = l.lineage_source_ref
         AND b.source_revision = l.lineage_source_revision
      )
    `;
    const totals = await client.query(`${lineageCtes}
      SELECT count(*)::int AS chunk_rows,
             count(DISTINCT relative_path) FILTER (WHERE relative_path IS NOT NULL AND btrim(relative_path) <> '')::int AS distinct_paths,
             count(*) FILTER (WHERE relative_path IS NULL)::int AS chunks_null_path,
             count(*) FILTER (WHERE relative_path IS NOT NULL AND btrim(relative_path) = '')::int AS chunks_empty_path,
             count(*) FILTER (WHERE relative_path IS NULL OR btrim(relative_path) = '')::int AS chunks_missing_path,
             count(*) FILTER (WHERE content_embedding IS NOT NULL)::int AS content_embedding_chunks,
             count(*) FILTER (WHERE content_embedding IS NOT NULL AND relative_path IS NOT NULL AND btrim(relative_path) <> '')::int AS content_embedding_chunks_with_path,
             count(DISTINCT relative_path) FILTER (WHERE content_embedding IS NOT NULL AND relative_path IS NOT NULL AND btrim(relative_path) <> '')::int AS content_embedding_paths,
             count(*) FILTER (WHERE content_embedding_768 IS NOT NULL)::int AS embedding_768_chunks,
             count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND relative_path IS NOT NULL AND btrim(relative_path) <> '')::int AS embedding_768_chunks_with_path,
             count(DISTINCT relative_path) FILTER (WHERE content_embedding_768 IS NOT NULL AND relative_path IS NOT NULL AND btrim(relative_path) <> '')::int AS embedding_768_paths,
             count(*) FILTER (WHERE source_revision IS NOT NULL)::int AS source_revision_chunks,
             count(*) FILTER (WHERE workspace_revision IS NOT NULL)::int AS workspace_revision_chunks,
             count(*) FILTER (WHERE embedding_model IS NOT NULL)::int AS model_tagged_chunks,
             count(*) FILTER (WHERE embedding_version IS NOT NULL)::int AS embedding_version_tagged_chunks,
             count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND lineage_identity_count = 1
               AND lineage_source_ref_count = 1 AND lineage_source_revision_count = 1)::int AS proven_lineage_identity_embedding_768_chunks,
             count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND lineage_identity_count = 1
               AND lineage_source_ref_count = 1 AND lineage_source_revision_count = 1
               AND lineage_source_ref = source_ref)::int AS lineage_source_ref_match_embedding_768_chunks,
             count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND lineage_identity_count = 1
               AND lineage_source_ref_count = 1 AND lineage_source_revision_count = 1
               AND lineage_source_ref = source_ref AND binding_workspace_count = 1
               AND binding_digest_count = 1 AND binding_checksum_count = 1)::int AS unique_binding_snapshot_embedding_768_chunks,
             count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND lineage_identity_count = 1
               AND lineage_source_ref_count = 1 AND lineage_source_revision_count = 1
               AND lineage_source_ref = source_ref AND binding_workspace_count > 1)::int AS multiple_workspace_binding_embedding_768_chunks,
             count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND lineage_identity_count = 1
               AND lineage_source_ref_count = 1 AND lineage_source_revision_count = 1
               AND lineage_source_ref = source_ref AND binding_workspace_count IS NULL)::int AS missing_binding_embedding_768_chunks,
             count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND lineage_identity_count > 1)::int AS conflicting_lineage_embedding_768_chunks,
             count(*) FILTER (WHERE content_embedding IS NOT NULL AND EXISTS (
               SELECT 1 FROM public.atlas_packet_chunk_lineage l
               JOIN public.atlas_workspace_source_bindings b
                 ON b.canonical_source_ref = l.source_ref AND b.source_revision = l.source_revision
               WHERE l.chunk_row_id = joined_chunks.id
                 AND l.source_ref = joined_chunks.source_ref
                 AND l.source_revision = joined_chunks.source_revision
                 AND l.revision_status = 'PROVEN'
                 AND b.workspace_revision = joined_chunks.workspace_revision
             ))::int AS exact_proven_content_embedding_chunks,
             count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND EXISTS (
               SELECT 1 FROM public.atlas_packet_chunk_lineage l
               JOIN public.atlas_workspace_source_bindings b
                 ON b.canonical_source_ref = l.source_ref AND b.source_revision = l.source_revision
               WHERE l.chunk_row_id = joined_chunks.id
                 AND l.source_ref = joined_chunks.source_ref
                 AND l.source_revision = joined_chunks.source_revision
                 AND l.revision_status = 'PROVEN'
                 AND b.workspace_revision = joined_chunks.workspace_revision
             ))::int AS exact_proven_embedding_768_chunks
      FROM joined_chunks
    `);
    const pathRows = await client.query(`
      ${lineageCtes}, path_counts AS (
        SELECT relative_path,
               count(*)::int AS chunk_count,
               count(*) FILTER (WHERE content_embedding IS NOT NULL)::int AS content_embedding_chunk_count,
               count(*) FILTER (WHERE content_embedding_768 IS NOT NULL)::int AS embedding_768_chunk_count,
               count(*) FILTER (WHERE source_revision IS NOT NULL)::int AS source_revision_chunk_count,
               count(*) FILTER (WHERE workspace_revision IS NOT NULL)::int AS workspace_revision_chunk_count,
               count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND lineage_identity_count = 1
                 AND lineage_source_ref_count = 1 AND lineage_source_revision_count = 1)::int AS proven_lineage_identity_embedding_768_chunks,
               count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND lineage_identity_count = 1
                 AND lineage_source_ref_count = 1 AND lineage_source_revision_count = 1
                 AND lineage_source_ref = source_ref)::int AS lineage_source_ref_match_embedding_768_chunks,
               count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND lineage_identity_count = 1
                 AND lineage_source_ref_count = 1 AND lineage_source_revision_count = 1
                 AND lineage_source_ref = source_ref AND binding_workspace_count = 1
                 AND binding_digest_count = 1 AND binding_checksum_count = 1)::int AS unique_binding_snapshot_embedding_768_chunks,
               count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND lineage_identity_count = 1
                 AND lineage_source_ref_count = 1 AND lineage_source_revision_count = 1
                 AND lineage_source_ref = source_ref AND binding_workspace_count > 1)::int AS multiple_workspace_binding_embedding_768_chunks,
               count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND lineage_identity_count = 1
                 AND lineage_source_ref_count = 1 AND lineage_source_revision_count = 1
                 AND lineage_source_ref = source_ref AND binding_workspace_count IS NULL)::int AS missing_binding_embedding_768_chunks,
               count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND lineage_identity_count > 1)::int AS conflicting_lineage_embedding_768_chunks,
               count(*) FILTER (WHERE content_embedding IS NOT NULL AND EXISTS (
                 SELECT 1 FROM public.atlas_packet_chunk_lineage l
                 JOIN public.atlas_workspace_source_bindings b
                   ON b.canonical_source_ref = l.source_ref AND b.source_revision = l.source_revision
                 WHERE l.chunk_row_id = c.id AND l.source_ref = c.source_ref
                   AND l.source_revision = c.source_revision AND l.revision_status = 'PROVEN'
                   AND b.workspace_revision = c.workspace_revision
               ))::int AS exact_proven_content_embedding_chunks,
               count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND EXISTS (
                 SELECT 1 FROM public.atlas_packet_chunk_lineage l
                 JOIN public.atlas_workspace_source_bindings b
                   ON b.canonical_source_ref = l.source_ref AND b.source_revision = l.source_revision
                 WHERE l.chunk_row_id = c.id AND l.source_ref = c.source_ref
                   AND l.source_revision = c.source_revision AND l.revision_status = 'PROVEN'
                   AND b.workspace_revision = c.workspace_revision
               ))::int AS exact_proven_embedding_768_chunks
        FROM joined_chunks c
        WHERE relative_path IS NOT NULL AND btrim(relative_path) <> ''
        GROUP BY relative_path
      ), recipe_counts AS (
        SELECT relative_path, embedding_model, embedding_version,
               count(*) FILTER (WHERE content_embedding_768 IS NOT NULL)::int AS embedding_768_chunk_count
        FROM public.codebase_chunk_index
        WHERE relative_path IS NOT NULL AND btrim(relative_path) <> ''
        GROUP BY relative_path, embedding_model, embedding_version
      ), recipe_rows AS (
        SELECT relative_path,
               jsonb_agg(jsonb_build_object('embeddingModel', embedding_model,
                 'embeddingVersion', embedding_version,
                 'embedding768ChunkCount', embedding_768_chunk_count)
                 ORDER BY embedding_model NULLS FIRST, embedding_version NULLS FIRST) AS model_recipes
        FROM recipe_counts
        GROUP BY relative_path
      )
      SELECT jsonb_build_object(
        'relativePath', p.relative_path,
        'chunkCount', p.chunk_count,
        'contentEmbeddingChunkCount', p.content_embedding_chunk_count,
        'embedding768ChunkCount', p.embedding_768_chunk_count,
        'sourceRevisionChunkCount', p.source_revision_chunk_count,
        'workspaceRevisionChunkCount', p.workspace_revision_chunk_count,
        'exactProvenContentEmbeddingChunks', p.exact_proven_content_embedding_chunks,
        'exactProvenEmbedding768Chunks', p.exact_proven_embedding_768_chunks,
        'provenLineageIdentityEmbedding768Chunks', p.proven_lineage_identity_embedding_768_chunks,
        'lineageSourceRefMatchEmbedding768Chunks', p.lineage_source_ref_match_embedding_768_chunks,
        'uniqueBindingSnapshotEmbedding768Chunks', p.unique_binding_snapshot_embedding_768_chunks,
        'multipleWorkspaceBindingEmbedding768Chunks', p.multiple_workspace_binding_embedding_768_chunks,
        'missingBindingEmbedding768Chunks', p.missing_binding_embedding_768_chunks,
        'conflictingLineageEmbedding768Chunks', p.conflicting_lineage_embedding_768_chunks,
        'modelRecipes', coalesce(r.model_recipes, '[]'::jsonb)
      )::text AS row_json
      FROM path_counts p LEFT JOIN recipe_rows r USING (relative_path)
      ORDER BY p.relative_path
    `);
    await client.query('ROLLBACK');
    databaseSnapshot = {
      identity: identity.rows[0],
      totals: totals.rows[0],
      pathRows: pathRows.rows.map(row => JSON.parse(row.row_json)),
      transactionStatus: 'ROLLED_BACK_READ_ONLY',
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

const result = buildDirectoryEmbeddingCoverageV1(pathTable, databaseSnapshot.pathRows);
if (result.fileRows.length !== databaseSnapshot.totals.distinct_paths) throw new Error('DATABASE_PATH_GROUP_COUNT_MISMATCH');
const censusPathChunkCount = result.fileRows.reduce((sum, row) => sum + row.chunkCount, 0);
const censusPathContentEmbeddingChunkCount = result.fileRows.reduce((sum, row) => sum + row.contentEmbeddingChunkCount, 0);
const censusPathEmbedding768ChunkCount = result.fileRows.reduce((sum, row) => sum + row.embedding768ChunkCount, 0);
if (censusPathChunkCount !== databaseSnapshot.totals.chunk_rows - databaseSnapshot.totals.chunks_missing_path) {
  throw new Error('DATABASE_CHUNK_PATH_TOTAL_MISMATCH');
}
if (censusPathEmbedding768ChunkCount !== databaseSnapshot.totals.embedding_768_chunks_with_path
  || censusPathContentEmbeddingChunkCount !== databaseSnapshot.totals.content_embedding_chunks_with_path) {
  throw new Error('DATABASE_PATH_EMBEDDING_TOTAL_MISMATCH');
}

const outputDir = path.join(root, '.tmp', 'atlas', 'directory-intelligence', runId);
const estimatedBytes = result.fileArtifact.bytes.length + result.directoryArtifact.bytes.length
  + Buffer.byteLength(databaseSnapshot.pathRows.map(row => JSON.stringify(row)).join('\n')) + 2_000_000;
if (statfsSync(root).bavail * statfsSync(root).bsize < estimatedBytes * 2) throw new Error('INSUFFICIENT_OUTPUT_DISK_HEADROOM');
mkdirSync(outputDir, { recursive: false });
const files = [
  ['embedding-path-coverage.arrow', result.fileArtifact.bytes],
  ['directory-embedding-coverage.arrow', result.directoryArtifact.bytes],
  ['database-path-census.jsonl', Buffer.from(databaseSnapshot.pathRows.map(row => JSON.stringify(row)).join('\n') + '\n')],
];
const artifactReceipts = {};
for (const [name, bytes] of files) {
  const absolute = path.join(outputDir, name);
  writeFileSync(absolute, bytes, { flag: 'wx' });
  artifactReceipts[name] = { path: path.relative(root, absolute).replaceAll('\\', '/'), bytes: bytes.length, sha256: hash(bytes) };
}
const body = {
  schema: 'atlas.directory-embedding-coverage.v1',
  status: result.root.exactProvenEmbedding768Chunks > 0 || result.root.exactProvenContentEmbeddingChunks > 0
    ? 'PATH_COVERAGE_WITH_PARTIAL_LINEAGE'
    : 'PATH_COVERAGE_WITH_LINEAGE_GAP',
  canonicalAuthority: false,
  sourceQualified: false,
  productionAdmission: false,
  persistentWritesPerformed: false,
  localArtifactsWritten: true,
  pathSnapshot: {
    manifestPath: path.relative(root, pathManifestPath).replaceAll('\\', '/'),
    receiptSha256: pathManifest.receiptSha256,
    artifactSha256: pathManifest.artifactSha256,
    workspaceRevision: pathManifest.sourceWorkspaceRevision ?? null,
    rowCount: pathTable.numRows,
  },
  databaseSnapshot: {
    serverVersion: databaseSnapshot.identity.server_version,
    isolation: databaseSnapshot.identity.isolation,
    transactionReadOnly: databaseSnapshot.identity.read_only,
    snapshotId: databaseSnapshot.identity.snapshot_id,
    transactionStatus: databaseSnapshot.transactionStatus,
    totals: databaseSnapshot.totals,
  },
  joins: {
    physicalFileCount: result.physicalFileCount,
    directoryCount: result.directoryCount,
    databasePathRowCount: result.fileRows.length,
    matchedPhysicalFilePathCount: result.matchedDatabasePathCount,
    unmatchedPhysicalPathCount: result.unmatchedDatabasePathCount,
    ambiguousNormalizedPathCount: result.ambiguousDatabasePathCount,
    databasePathsMatchingNonFileEntries: result.nonFileDatabasePathCount,
    databasePathMissingPhysicalSamples: result.unmatchedSamples,
    rootPathMatchCoveragePercent: result.root.pathMatchCoveragePercent,
    rootEmbedding768PathCoveragePercent: result.root.embedding768PathCoveragePercent,
    rootPhysicalFileCount: result.root.physicalFileCount,
    rootDatabasePathMatchedCount: result.root.databasePathMatchedCount,
    rootEmbedding768PathCount: result.root.embedding768PathCount,
    rootEmbedding768ChunkCount: result.root.embedding768ChunkCount,
    rootContentEmbeddingPathCount: result.root.contentEmbeddingPathCount,
    rootContentEmbeddingChunkCount: result.root.contentEmbeddingChunkCount,
    databaseChunksWithNullPath: databaseSnapshot.totals.chunks_null_path,
    databaseChunksWithEmptyPath: databaseSnapshot.totals.chunks_empty_path,
    databaseChunksMissingUsablePath: databaseSnapshot.totals.chunks_missing_path,
    databaseContentEmbeddingChunksWithUsablePath: databaseSnapshot.totals.content_embedding_chunks_with_path,
    databaseEmbedding768ChunksWithUsablePath: databaseSnapshot.totals.embedding_768_chunks_with_path,
    censusPathChunkCount,
    censusPathContentEmbeddingChunkCount,
    censusPathEmbedding768ChunkCount,
    rootExactProvenEmbedding768Chunks: result.root.exactProvenEmbedding768Chunks,
    rootExactProvenContentEmbeddingChunks: result.root.exactProvenContentEmbeddingChunks,
    rootProvenLineageIdentityEmbedding768Chunks: result.root.provenLineageIdentityEmbedding768Chunks,
    rootLineageSourceRefMatchEmbedding768Chunks: result.root.lineageSourceRefMatchEmbedding768Chunks,
    rootUniqueBindingSnapshotEmbedding768Chunks: result.root.uniqueBindingSnapshotEmbedding768Chunks,
    rootMultipleWorkspaceBindingEmbedding768Chunks: result.root.multipleWorkspaceBindingEmbedding768Chunks,
    rootMissingBindingEmbedding768Chunks: result.root.missingBindingEmbedding768Chunks,
    rootConflictingLineageEmbedding768Chunks: result.root.conflictingLineageEmbedding768Chunks,
    databaseProvenLineageIdentityEmbedding768Chunks: databaseSnapshot.totals.proven_lineage_identity_embedding_768_chunks,
    databaseLineageSourceRefMatchEmbedding768Chunks: databaseSnapshot.totals.lineage_source_ref_match_embedding_768_chunks,
    databaseUniqueBindingSnapshotEmbedding768Chunks: databaseSnapshot.totals.unique_binding_snapshot_embedding_768_chunks,
    databaseMultipleWorkspaceBindingEmbedding768Chunks: databaseSnapshot.totals.multiple_workspace_binding_embedding_768_chunks,
    databaseMissingBindingEmbedding768Chunks: databaseSnapshot.totals.missing_binding_embedding_768_chunks,
    databaseConflictingLineageEmbedding768Chunks: databaseSnapshot.totals.conflicting_lineage_embedding_768_chunks,
  },
  artifacts: artifactReceipts,
  coverageCeiling: 'Exact normalized path match plus diagnostic external packet-lineage and workspace-binding counts; bindings are not selected as current authority, source bytes are not reverified, row-owned revisions remain absent, and no current-revision admission is established.',
};
body.receiptSha256 = hash(Buffer.from(canonical(body)));
const manifestPath = path.join(outputDir, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(body, null, 2)}\n`, { flag: 'wx' });
const readback = readJson(manifestPath);
const readbackBody = { ...readback };
delete readbackBody.receiptSha256;
if (hash(Buffer.from(canonical(readbackBody))) !== body.receiptSha256) throw new Error('OUTPUT_RECEIPT_CHECKSUM_INVALID');
for (const { path: artifactPath, sha256, bytes } of Object.values(artifactReceipts)) {
  const artifactBytes = readFileSync(resolveInside(artifactPath, 'OUTPUT_ARTIFACT'));
  if (artifactBytes.length !== bytes || hash(artifactBytes) !== sha256) throw new Error('OUTPUT_ARTIFACT_READBACK_INVALID');
}
console.log(JSON.stringify({
  status: body.status,
  manifestPath: path.relative(root, manifestPath).replaceAll('\\', '/'),
  receiptSha256: body.receiptSha256,
  physicalFileCount: result.physicalFileCount,
  directories: result.directoryCount,
  databasePaths: result.fileRows.length,
  matchedPhysicalPaths: result.matchedDatabasePathCount,
  unmatchedDatabasePaths: result.unmatchedDatabasePathCount,
  exactProvenEmbedding768Chunks: result.root.exactProvenEmbedding768Chunks,
  exactProvenContentEmbeddingChunks: result.root.exactProvenContentEmbeddingChunks,
  artifacts: artifactReceipts,
}));
