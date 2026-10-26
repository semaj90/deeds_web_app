#!/usr/bin/env node
/**
 * SOURCE-BRIDGE-02 / CandidateOrdinal refresh, read-only and artifact-only.
 * Re-resolves the admitted root namespace bridge and exact source -> packet -> chunk
 * evidence in one repeatable-read transaction, then delegates ordinal construction to
 * the existing CandidateOrdinalMapV1 owner. No identity or projection writes occur.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapChecksum,
  materializeCandidateOrdinalMap,
  materializeRevisionQualifiedSourceChunkOrdinalMapV1,
  revisionQualifiedSourceChunkCohortV1Schema,
  type CanonicalCandidateIdentityInput,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import {
  assertCurrentSourceAuthorityReceiptV1,
  assertOneSourceRevisionPerRefV1,
  assertRootSourceBindingCensusV1,
  resolveSourceBatchLimitsV1,
} from './lib/candidate-ordinal-source-census-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
async function main() {
const PREVIEW_PATH = path.join(ROOT, 'docs/reports/stable-file-population-preview-v1.json');
const AUTHORITY_PATH = path.join(ROOT, 'docs/reports/current-source-authority-cohort-v1.json');
const args = process.argv.slice(2);
const getArg = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};
const { maxSourceFiles, maxSourceBytes } = resolveSourceBatchLimitsV1(
  getArg('--max-source-files'), getArg('--max-source-bytes'),
);
const digest = (value: string | Buffer) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
};

const preview = JSON.parse(fs.readFileSync(PREVIEW_PATH, 'utf8'));
const authority = JSON.parse(fs.readFileSync(AUTHORITY_PATH, 'utf8'));
const versionedAuthorityPath = authority.versionedReceipt
  ? path.resolve(ROOT, authority.versionedReceipt)
  : null;
if (!versionedAuthorityPath || !versionedAuthorityPath.startsWith(path.resolve(ROOT, 'docs/reports') + path.sep)) {
  throw new Error('VERSIONED_SOURCE_AUTHORITY_RECEIPT_PATH_INVALID');
}
const versionedAuthority = JSON.parse(fs.readFileSync(versionedAuthorityPath, 'utf8'));
const verifiedAuthority = assertCurrentSourceAuthorityReceiptV1(authority, versionedAuthority);
const bridgeProof = JSON.parse(fs.readFileSync(path.join(ROOT, '.tmp/atlas/repository-namespace-bridge-v1/bridge-root-proof-20260926.json'), 'utf8'));
const workspaceRevision = authority.workspaceRevision as string;
const executionId = bridgeProof.selectedExecutionId as string;
const sourceAuthorityRepoId = preview.liveDbContext?.graphifyToSourceAuthorityRepoIdBridge?.['repo:root'];
if (preview.status !== 'STABLE_FILE_POPULATION_PREVIEW_READY'
  || preview.readOnly !== true
  || preview.databaseWrites !== 0
  || preview.authority?.admittedWorkspaceRevision !== workspaceRevision
  || preview.authority?.sealedCohortStatus !== 'CURRENT_SOURCE_AUTHORITY_PROVEN'
  || bridgeProof.status !== 'CURRENT_PACKET_CHUNK_LINEAGE_BRIDGE_PARTIAL'
  || bridgeProof.repositoryNamespaceBridge?.graphifyRepositoryToSourceAuthority?.['repo:root'] !== 'deeds-web-app'
  || bridgeProof.repositoryNamespaceBridge?.canonicalAuthority !== false
  || bridgeProof.selectedWorkspaceRevision !== workspaceRevision
  || sourceAuthorityRepoId !== 'deeds-web-app') {
  throw new Error('ADMITTED_ROOT_NAMESPACE_BRIDGE_REQUIRED');
}
const stableFileTableCounts = preview.liveDbContext?.stableFileTableCountsAtRunTime ?? {};
if (Object.values(stableFileTableCounts).some((count) => Number(count) !== 0)) {
  throw new Error('STABLE_FILE_IDENTITY_STATE_CHANGED_REFRESH_PREVIEW');
}

const stamp = new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d+Z$/, 'Z');
const outDir = path.resolve(ROOT, getArg('--out-dir') ?? `.tmp/atlas/candidate-ordinal-bridged-v1/${stamp}`);
const tmpRoot = path.resolve(ROOT, '.tmp/atlas') + path.sep;
if (!outDir.startsWith(tmpRoot) || fs.existsSync(outDir)) throw new Error('OUTPUT_MUST_BE_NEW_DIRECTORY_UNDER_TMP_ATLAS');

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1, statement_timeout: 120_000,
  application_name: 'atlas-materialize-bridged-candidate-ordinal-v1' });

let sourceCounts: { membershipRows: number; mappedBindingRows: number; mismatchedWorkspaceRows: number };
let rawRows: Array<{
  packet_key: string; canonical_chunk_id: string; chunk_row_id: string; source_ref: string;
  source_revision: string; workspace_revision: string; packet_id: string; source_byte_length: string;
}>;
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const execution = (await client.query(`
      SELECT execution_id::text, workspace_revision::text, status
      FROM public.graphify_executions WHERE execution_id = $1::uuid
    `, [executionId])).rows[0];
    if (!execution || execution.workspace_revision !== workspaceRevision || !['COMPLETED', 'COMPLETED_REUSED'].includes(execution.status)) {
      throw new Error(`ADMITTED_GRAPHIFY_EXECUTION_REVISION_OR_STATUS_MISMATCH:${JSON.stringify(execution ?? null)}`);
    }

    const census = (await client.query(`
      WITH root_members AS (
        SELECT repository_id::text, repository_relative_path::text, source_ref::text,
               code_source_revision::text, content_hash::text, workspace_revision::text
        FROM public.graphify_execution_file_membership_v2
        WHERE execution_id = $1::uuid AND repository_id = 'repo:root'
      ), exact_bindings AS (
        SELECT m.*, b.repo_id::text AS source_authority_repo_id,
               b.canonical_source_ref::text, b.source_revision::text AS binding_source_revision,
               b.content_digest::text AS binding_content_digest,
               b.workspace_revision::text AS binding_workspace_revision
        FROM root_members m
        JOIN public.atlas_workspace_source_bindings b
          ON b.repo_id = $2
         AND b.canonical_source_ref = m.source_ref
         AND b.workspace_revision::text = $3
         AND b.source_revision::text = m.code_source_revision
         AND regexp_replace(lower(b.content_digest::text), '^sha256:', '')
             = regexp_replace(lower(m.content_hash), '^sha256:', '')
      )
      SELECT (SELECT count(*)::int FROM root_members) AS membership_rows,
             (SELECT count(*)::int FROM exact_bindings) AS mapped_binding_rows,
             (SELECT count(*)::int FROM root_members WHERE workspace_revision IS DISTINCT FROM $3) AS mismatched_workspace_rows
    `, [executionId, sourceAuthorityRepoId, workspaceRevision])).rows[0];
    sourceCounts = {
      membershipRows: Number(census.membership_rows),
      mappedBindingRows: Number(census.mapped_binding_rows),
      mismatchedWorkspaceRows: Number(census.mismatched_workspace_rows),
    };
    assertRootSourceBindingCensusV1(sourceCounts, verifiedAuthority.rootSourceCount);

    rawRows = (await client.query(`
      WITH exact_root AS (
        SELECT m.source_ref, m.repository_relative_path, m.code_source_revision,
               m.workspace_revision, b.byte_length::bigint AS source_byte_length
        FROM public.graphify_execution_file_membership_v2 m
        JOIN public.atlas_workspace_source_bindings b
          ON b.repo_id = $2
         AND b.canonical_source_ref = m.source_ref
         AND b.workspace_revision::text = $3
         AND b.source_revision::text = m.code_source_revision
         AND regexp_replace(lower(b.content_digest::text), '^sha256:', '')
             = regexp_replace(lower(m.content_hash), '^sha256:', '')
        WHERE m.execution_id = $1::uuid
          AND m.repository_id = 'repo:root'
          AND m.workspace_revision::text = $3
      ), eligible_files AS (
        SELECT DISTINCT source_ref, code_source_revision, workspace_revision, source_byte_length
        FROM exact_root
        WHERE source_byte_length BETWEEN 0 AND $5::bigint
          AND EXISTS (
            SELECT 1
            FROM public.atlas_packet_chunk_lineage l
            JOIN public.codebase_chunk_index c
              ON c.id = l.chunk_row_id
             AND c.chunk_id::text = l.canonical_chunk_id::text
            JOIN public.atlas_packets p
              ON p.packet_key::text = l.packet_key::text
             AND p.source_ref::text = l.source_ref::text
            WHERE l.source_ref::text = exact_root.source_ref
              AND l.source_revision::text = exact_root.code_source_revision
              AND l.revision_status = 'PROVEN'
          )
      ), bounded_files AS (
        SELECT *,
               row_number() OVER (ORDER BY convert_to(source_ref, 'UTF8'), code_source_revision) AS source_ordinal,
               sum(source_byte_length) OVER (
                 ORDER BY convert_to(source_ref, 'UTF8'), code_source_revision
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
               ) AS cumulative_bytes
        FROM eligible_files
      ), selected_files AS (
        SELECT * FROM bounded_files
        WHERE source_ordinal <= $4::int AND cumulative_bytes <= $5::bigint
      )
      SELECT p.packet_id::text, p.packet_key::text,
             l.canonical_chunk_id::text, l.chunk_row_id::text,
             l.source_ref::text, l.source_revision::text,
             $3::text AS workspace_revision, m.source_byte_length::text AS source_byte_length
      FROM selected_files m
      JOIN public.atlas_packet_chunk_lineage l
        ON l.source_ref::text = m.source_ref
       AND l.source_revision::text = m.code_source_revision
       AND l.revision_status = 'PROVEN'
      JOIN public.codebase_chunk_index c
        ON c.id = l.chunk_row_id
       AND c.chunk_id::text = l.canonical_chunk_id::text
      JOIN public.atlas_packets p
        ON p.packet_key::text = l.packet_key::text
       AND p.source_ref::text = m.source_ref
      ORDER BY l.canonical_chunk_id::text, l.chunk_row_id::text
    `, [executionId, sourceAuthorityRepoId, workspaceRevision, maxSourceFiles, maxSourceBytes])).rows;
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

if (rawRows.length === 0) throw new Error('EXACT_PACKET_CHUNK_COHORT_EMPTY');
const sourceRefs = new Set(rawRows.map((row) => row.source_ref));
if (sourceRefs.size > sourceCounts.mappedBindingRows) {
  throw new Error(`BRIDGE_SOURCE_COUNT_EXCEEDS_EXACT_BINDINGS:${sourceRefs.size}:${sourceCounts.mappedBindingRows}`);
}
const uniqueChunks = new Set(rawRows.map((row) => row.canonical_chunk_id));
if (uniqueChunks.size !== rawRows.length) throw new Error('CANONICAL_CHUNK_ID_NOT_UNIQUE_IN_EXACT_COHORT');
const selectedSourceBytes = [...new Map(rawRows.map((row) => [row.source_ref, Number(row.source_byte_length)])).values()]
  .reduce((total, byteLength) => total + byteLength, 0);
if (sourceRefs.size > maxSourceFiles || selectedSourceBytes > maxSourceBytes) {
  throw new Error(`SOURCE_BATCH_LIMIT_EXCEEDED:${sourceRefs.size}:${selectedSourceBytes}`);
}
assertOneSourceRevisionPerRefV1(rawRows);

const rawCandidates: CanonicalCandidateIdentityInput[] = rawRows.map((row) => ({
  canonicalId: row.canonical_chunk_id,
  packetKey: row.packet_key,
  sourceRef: row.source_ref,
  treeNodeId: null,
  symbolVersionId: null,
  workspaceRevision: row.workspace_revision,
  sourceRevision: row.source_revision,
  graphRevision: null,
  semanticRevision: null,
  degradedIdentity: false,
  evidenceRefs: [
    `atlas_packet_chunk_lineage:${row.chunk_row_id}`,
    `codebase_chunk_index:${row.chunk_row_id}`,
    `atlas_packets:${row.packet_id}`,
  ],
  representationBindings: [],
}));
const sourceRevisionSetChecksum = candidateOrdinalMapChecksum([...new Set(rawRows.map((row) => `${row.source_ref}\0${row.source_revision}`))].sort());
const cohortIdentity = {
  schema: 'atlas.revision-qualified-source-chunk-ordinal-input.v1',
  executionId,
  workspaceRevision,
  sourceAuthorityRepoId,
  mappingSource: 'STABLE_FILE_BACKFILL_CLASSIFIER_V1',
  sourceMembershipRows: sourceCounts.membershipRows,
  exactSourceBindingRows: sourceCounts.mappedBindingRows,
  exactBridgeSourceRefs: sourceRefs.size,
  exactCanonicalChunkCount: rawRows.length,
  selectionPolicy: {
    maxSourceFiles,
    maxSourceBytes,
    selectedSourceFiles: sourceRefs.size,
    selectedSourceBytes,
    order: 'source_ref_utf8_ascending',
  },
  sourceRevisionSetChecksum,
  candidates: rawCandidates,
};
const candidateSnapshotRevision = digest(stableJson(cohortIdentity));
const producerRevision = `materialize-bridged-candidate-ordinal-v1:${digest(fs.readFileSync(fileURLToPath(import.meta.url)))}`;
const seedMap = materializeCandidateOrdinalMap({ candidates: rawCandidates, candidateSnapshotRevision, workspaceRevision, producerRevision });
const cohort = revisionQualifiedSourceChunkCohortV1Schema.parse({
  status: 'REVISION_QUALIFIED', workspaceRevision, candidateSnapshotRevision,
  sourceRevisionSetChecksum, candidates: seedMap.candidates,
});
const ordinalMap = materializeRevisionQualifiedSourceChunkOrdinalMapV1({ cohort, producerRevision });
assertCandidateOrdinalMapIntegrityV1(ordinalMap);
if (ordinalMap.rowCount !== rawRows.length || ordinalMap.identityAuthority !== false) throw new Error('ORDINAL_MAP_COHORT_OR_AUTHORITY_MISMATCH');

const mapBody = `${JSON.stringify(ordinalMap, null, 2)}\n`;
const receiptBody = {
  schema: 'atlas.bridged-candidate-ordinal-receipt.v1',
  status: 'READ_ONLY_EXACT_LINEAGE_ORDINAL_MAP_READY',
  generatedAt: new Date().toISOString(),
  mode: 'REPEATABLE_READ_READ_ONLY_LOCAL_ARTIFACT',
  executionId,
  workspaceRevision,
  sourceAuthorityRepoId,
  repositoryNamespaceMapping: {
    graphifyRepositoryId: 'repo:root',
    sourceAuthorityRepoId,
    mappingSource: 'STABLE_FILE_BACKFILL_CLASSIFIER_V1',
    evidenceRefs: ['docs/reports/stable-file-population-preview-v1.json', 'docs/reports/current-source-authority-cohort-v1.json'],
    canonicalRepositoryIdentityAvailable: false,
    canonicalAuthority: false,
  },
  sourceCounts,
  exactBridgeSourceCount: sourceRefs.size,
  exactChunkCandidateCount: rawRows.length,
  revisionQualifiedChunkCount: rawRows.length,
  sourceBatch: {
    maxSourceFiles,
    maxSourceBytes,
    selectedSourceFiles: sourceRefs.size,
    selectedSourceBytes,
    order: 'source_ref_utf8_ascending',
  },
  ordinalMap: {
    path: 'candidate-ordinal-map-v1.json',
    sha256: digest(mapBody),
    schema: ordinalMap.schema,
    rowCount: ordinalMap.rowCount,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    sourceRevisionSetChecksum,
    identityAuthority: false,
  },
  boundaries: {
    nestedRepositoryRows: 1086,
    nestedRepositoryRowsIncluded: 0,
    semanticRepresentationBindings: 0,
    semanticVectorPromotion: false,
    canonicalWrites: 0,
    qdrantWrites: 0,
    neo4jWrites: 0,
    valkeyWrites: 0,
    rabbitmqPublishes: 0,
    graphifyRuns: 0,
  },
};
const receipt = { ...receiptBody, receiptChecksum: digest(stableJson(receiptBody)) };
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'candidate-ordinal-map-v1.json'), mapBody, { flag: 'wx' });
fs.writeFileSync(path.join(outDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({
  status: receipt.status,
  sourceCounts,
  exactBridgeSourceCount: sourceRefs.size,
  exactChunkCandidateCount: rawRows.length,
  selectedSourceFiles: sourceRefs.size,
  selectedSourceBytes,
  ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
  candidateSnapshotRevision,
  canonicalAuthority: false,
  writesPerformed: false,
  outDir: path.relative(ROOT, outDir).replaceAll('\\', '/'),
}, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const recommendations = message.includes('SOURCE_AUTHORITY')
    ? ['Refresh and independently verify both current and versioned source-authority receipts; do not bypass their checksum or scope checks.']
    : message.includes('ROOT_SOURCE_BINDING') || message.includes('EXACT_PACKET_CHUNK')
      ? ['Inspect exact workspace/source-revision packet and chunk-lineage joins; keep unmatched or ambiguous rows excluded.']
      : message.includes('SOURCE_BATCH_LIMIT')
        ? ['Reduce the requested bounded batch; never exceed 500 files or 64 MiB.']
        : message.includes('DATABASE') || message.includes('ECONN') || message.includes('timeout')
          ? ['Check the configured read-only database endpoint and service health, then retry into a fresh scratch directory.']
          : ['Inspect the failing owner and its revision-qualified inputs; do not infer packet identity or promote diagnostic output.'];
  console.error(JSON.stringify({
    schema: 'atlas.candidate-ordinal-materialization-failure.v1',
    status: 'BLOCKED',
    error: message,
    recommendations,
    writesPerformed: false,
    canonicalAuthority: false,
  }, null, 2));
  process.exitCode = 1;
});
