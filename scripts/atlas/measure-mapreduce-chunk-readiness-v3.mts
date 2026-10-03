#!/usr/bin/env node
/**
 * MAPREDUCE-CHUNK-READINESS-03: read-only replay against the current
 * content_embedding_768 owner. Historical V2 receipts remain untouched.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { classifySemanticBindingV3, inspectSemanticVectorV3 } from './lib/mapreduce-readiness-v3-utils.mjs';
import {
  qualifyEvidenceV2,
  type CurrentSourceBindingV2,
  type IndexedChunkEvidenceV2,
  type PacketChunkMembershipV2,
  type PacketLineageIdentityV2,
} from '../../sveltekit-frontend/src/lib/server/atlas/identity/lineage-qualification-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = (value: string | Buffer) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const requiredPath = (name: string) => {
  const arg = process.argv.slice(2).find((item) => item.startsWith(`--${name}=`));
  if (!arg) throw new Error(`EXPLICIT_${name.toUpperCase().replaceAll('-', '_')}_REQUIRED`);
  const resolved = path.resolve(ROOT, arg.slice(name.length + 3));
  if (!resolved.startsWith(`${ROOT}${path.sep}`)) throw new Error(`PATH_OUTSIDE_REPOSITORY:${name}`);
  return resolved;
};
const manifestPath = requiredPath('manifest');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schema !== 'atlas.mapreduce-packet-chunk-evidence-overlay-manifest.v1'
  || manifest.status !== 'SEALED_NONCANONICAL_PACKET_CHUNK_EVIDENCE'
  || manifest.policy?.canonicalAuthority !== false || manifest.writes?.postgres !== 0) {
  throw new Error('INPUT_MANIFEST_NOT_ADMISSIBLE');
}
const overlayPath = path.resolve(ROOT, manifest.output.path);
if (!overlayPath.startsWith(`${ROOT}${path.sep}`)) throw new Error('OVERLAY_PATH_OUTSIDE_REPOSITORY');
const overlayBytes = fs.readFileSync(overlayPath);
if (sha(overlayBytes) !== manifest.output.sha256) throw new Error('OVERLAY_CHECKSUM_MISMATCH');
const inputRows = overlayBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
  try { return JSON.parse(line); } catch { throw new Error(`OVERLAY_JSONL_INVALID:${index + 1}`); }
});
if (inputRows.length !== manifest.output.rows || inputRows.length !== manifest.counts.chunkRows
  || new Set(inputRows.map((row) => row.chunkRowId)).size !== inputRows.length) {
  throw new Error('OVERLAY_ROW_CONSERVATION_FAILED');
}
const mapPath = path.resolve(ROOT, manifest.inputs.candidateMap);
if (!mapPath.startsWith(`${ROOT}${path.sep}`)) throw new Error('CANDIDATE_MAP_PATH_OUTSIDE_REPOSITORY');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
if (map.candidateSnapshotRevision !== manifest.candidateSnapshotRevision
  || map.ordinalMapChecksum !== manifest.ordinalMapChecksum) throw new Error('CANDIDATE_MAP_REVISION_MISMATCH');

const sourceDigestByRef = new Map<string, string | null>();
for (const row of inputRows) {
  const sourceRef = String(row.sourceRef ?? '');
  if (!sourceRef) throw new Error('SOURCE_REF_MISSING_IN_OVERLAY');
  if (sourceDigestByRef.has(sourceRef)) continue;
  const candidatePath = path.resolve(ROOT, sourceRef);
  if (!candidatePath.startsWith(`${ROOT}${path.sep}`)) throw new Error(`SOURCE_PATH_OUTSIDE_REPOSITORY:${sourceRef}`);
  try {
    const realPath = fs.realpathSync(candidatePath);
    if (!realPath.startsWith(`${ROOT}${path.sep}`)) throw new Error(`SOURCE_SYMLINK_OUTSIDE_REPOSITORY:${sourceRef}`);
    sourceDigestByRef.set(sourceRef, sha(fs.readFileSync(realPath)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') sourceDigestByRef.set(sourceRef, null);
    else throw error;
  }
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120_000 });
const client = await pool.connect();
let rows: any[] = [];
let availableColumns: string[] = [];
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const columns = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='codebase_chunk_index'
  `);
  availableColumns = columns.rows.map((row) => String(row.column_name));
  if (!availableColumns.includes('content_embedding_768')) throw new Error('CURRENT_SEMANTIC_OWNER_COLUMN_MISSING');
  const optionalColumns = [
    'representation_revision', 'embedding_model', 'embedding_version', 'embedding_dimension',
    'embedding_normalized', 'encoder_id', 'tokenizer_revision', 'input_digest', 'vector_checksum',
  ];
  const optionalSelect = optionalColumns.map((name) => availableColumns.includes(name)
    ? `(SELECT c.${name}::text FROM public.codebase_chunk_index c WHERE c.id=i."chunkRowId" LIMIT 1) AS ${name}`
    : `NULL::text AS ${name}`).join(',\n      ');
  const result = await client.query(`
    WITH input AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
        "candidateOrdinal" integer, "candidateSnapshotRevision" text, "ordinalMapChecksum" text,
        "packetKey" text, "sourceRef" text, "sourceRevision" text, "workspaceRevision" text,
        "chunkRowId" uuid, "canonicalChunkId" text
      )
    )
    SELECT i.*,
      (SELECT count(*)::int FROM public.atlas_workspace_source_bindings b
        WHERE b.repo_id='deeds-web-app' AND b.canonical_source_ref=i."sourceRef"
          AND b.source_revision=i."sourceRevision" AND b.workspace_revision=i."workspaceRevision") AS binding_count,
      (SELECT b.binding_checksum FROM public.atlas_workspace_source_bindings b
        WHERE b.repo_id='deeds-web-app' AND b.canonical_source_ref=i."sourceRef"
          AND b.source_revision=i."sourceRevision" AND b.workspace_revision=i."workspaceRevision" LIMIT 1) AS binding_checksum,
      (SELECT count(*)::int FROM public.atlas_packets p WHERE p.packet_key=i."packetKey"
        AND p.source_ref=i."sourceRef" AND p.source_revision=i."sourceRevision"
        AND p.workspace_revision_key=i."workspaceRevision") AS packet_count,
      (SELECT count(*)::int FROM public.atlas_packet_chunk_lineage l WHERE l.packet_key=i."packetKey"
        AND l.source_ref=i."sourceRef" AND l.source_revision=i."sourceRevision"
        AND l.chunk_row_id=i."chunkRowId" AND l.canonical_chunk_id=i."canonicalChunkId") AS lineage_count,
      (SELECT l.membership_status FROM public.atlas_packet_chunk_lineage l WHERE l.packet_key=i."packetKey"
        AND l.source_ref=i."sourceRef" AND l.source_revision=i."sourceRevision"
        AND l.chunk_row_id=i."chunkRowId" AND l.canonical_chunk_id=i."canonicalChunkId" LIMIT 1) AS membership_status,
      (SELECT l.revision_status FROM public.atlas_packet_chunk_lineage l WHERE l.packet_key=i."packetKey"
        AND l.source_ref=i."sourceRef" AND l.source_revision=i."sourceRevision"
        AND l.chunk_row_id=i."chunkRowId" AND l.canonical_chunk_id=i."canonicalChunkId" LIMIT 1) AS revision_status,
      (SELECT l.lineage_producer_revision FROM public.atlas_packet_chunk_lineage l WHERE l.packet_key=i."packetKey"
        AND l.source_ref=i."sourceRef" AND l.source_revision=i."sourceRevision"
        AND l.chunk_row_id=i."chunkRowId" AND l.canonical_chunk_id=i."canonicalChunkId" LIMIT 1) AS lineage_producer_revision,
      (SELECT count(*)::int FROM public.codebase_chunk_index c WHERE c.id=i."chunkRowId") AS chunk_count,
      (SELECT c.chunk_id FROM public.codebase_chunk_index c WHERE c.id=i."chunkRowId" LIMIT 1) AS indexed_canonical_chunk_id,
      (SELECT c.source_ref FROM public.codebase_chunk_index c WHERE c.id=i."chunkRowId" LIMIT 1) AS indexed_source_ref,
      (SELECT c.file_content_hash FROM public.codebase_chunk_index c WHERE c.id=i."chunkRowId" LIMIT 1) AS file_content_hash,
      (SELECT c.source_revision FROM public.codebase_chunk_index c WHERE c.id=i."chunkRowId" LIMIT 1) AS chunk_source_revision_mirror,
      (SELECT c.workspace_revision FROM public.codebase_chunk_index c WHERE c.id=i."chunkRowId" LIMIT 1) AS chunk_workspace_revision_mirror,
      (SELECT c.content_embedding IS NOT NULL FROM public.codebase_chunk_index c WHERE c.id=i."chunkRowId" LIMIT 1) AS historical_content_embedding_present,
      (SELECT c.content_embedding_768 IS NOT NULL FROM public.codebase_chunk_index c WHERE c.id=i."chunkRowId" LIMIT 1) AS current_vector_present,
      (SELECT c.content_embedding_768::text FROM public.codebase_chunk_index c WHERE c.id=i."chunkRowId" LIMIT 1) AS current_vector_text,
      (SELECT c.summary_text IS NOT NULL FROM public.codebase_chunk_index c WHERE c.id=i."chunkRowId" LIMIT 1) AS summary_text_present,
      (SELECT c.summary_embedding IS NOT NULL FROM public.codebase_chunk_index c WHERE c.id=i."chunkRowId" LIMIT 1) AS summary_embedding_present,
      (SELECT c.summary_provenance#>>'{admission,status}' FROM public.codebase_chunk_index c WHERE c.id=i."chunkRowId" LIMIT 1) AS summary_admission_status,
      (SELECT c.summary_provenance->>'summaryDigest' FROM public.codebase_chunk_index c WHERE c.id=i."chunkRowId" LIMIT 1) AS admitted_summary_digest,
      ${optionalSelect}
    FROM input i ORDER BY i."candidateOrdinal", i."chunkRowId"`, [JSON.stringify(inputRows)]);
  rows = result.rows;
} finally {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
if (rows.length !== inputRows.length) throw new Error(`DB_READBACK_ROW_COUNT_MISMATCH:${rows.length}/${inputRows.length}`);

const inputById = new Map(inputRows.map((row) => [String(row.chunkRowId), row]));
const results = rows.map((row) => {
  const input = inputById.get(String(row.chunkRowId));
  if (!input) throw new Error(`DB_READBACK_UNKNOWN_CHUNK_ROW:${String(row.chunkRowId)}`);
  for (const key of ['candidateOrdinal', 'candidateSnapshotRevision', 'ordinalMapChecksum', 'packetKey', 'sourceRef', 'sourceRevision', 'workspaceRevision', 'canonicalChunkId']) {
    if (String(row[key]) !== String(input[key])) throw new Error(`DB_READBACK_IDENTITY_TUPLE_MISMATCH:${String(row.chunkRowId)}:${key}`);
  }
  const binding: CurrentSourceBindingV2 | null = Number(row.binding_count) === 1 && row.binding_checksum
    ? { packetKey: input.packetKey, sourceRef: input.sourceRef, sourceRevision: input.sourceRevision, workspaceRevision: input.workspaceRevision, bindingChecksum: row.binding_checksum }
    : null;
  const packet: PacketLineageIdentityV2 | null = Number(row.packet_count) === 1
    ? { packetKey: input.packetKey, sourceRef: input.sourceRef, sourceRevision: input.sourceRevision, workspaceRevisionMirror: input.workspaceRevision }
    : null;
  const memberships: PacketChunkMembershipV2[] = Number(row.lineage_count) > 0 ? [{
    packetKey: input.packetKey, sourceRef: input.sourceRef, sourceRevision: input.sourceRevision,
    membershipStatus: row.membership_status, revisionStatus: row.revision_status,
    chunkRowId: input.chunkRowId, canonicalChunkId: input.canonicalChunkId,
    lineageProducerRevision: row.lineage_producer_revision, lineageBindingChecksum: null,
  }] : [];
  const vectorPresent = row.current_vector_present === true;
  const vectorCheck = inspectSemanticVectorV3(vectorPresent ? row.current_vector_text : null);
  const indexedChunks: IndexedChunkEvidenceV2[] = Number(row.chunk_count) > 0 ? [{
    id: input.chunkRowId, canonicalChunkId: row.indexed_canonical_chunk_id, sourceRef: row.indexed_source_ref,
    fileContentHash: row.file_content_hash, sourceRevisionMirror: row.chunk_source_revision_mirror,
    workspaceRevisionMirror: row.chunk_workspace_revision_mirror,
    contentEmbeddingPresent: vectorPresent,
    summaryTextPresent: row.summary_text_present === true,
    summaryEmbeddingPresent: row.summary_embedding_present === true,
    summaryEmbeddingAdmissionBound: row.summary_embedding_present === true && row.summary_admission_status === 'ADMITTED'
      && typeof row.admitted_summary_digest === 'string',
  }] : [];
  const verdict = qualifyEvidenceV2({ expectedWorkspaceRevision: input.workspaceRevision, expectedMembershipStatus: 'EXACT_MULTI_MEMBER',
    expectedChunkRowId: input.chunkRowId, expectedCanonicalChunkId: input.canonicalChunkId,
    sourceBinding: binding, packet, memberships, indexedChunks });
  const semanticBindingState = classifySemanticBindingV3({
    representationRevision: row.representation_revision,
    modelRevision: row.embedding_version,
    tokenizerRevision: row.tokenizer_revision,
    inputDigest: row.input_digest,
    vectorChecksum: row.vector_checksum,
  });
  return {
    candidateOrdinal: input.candidateOrdinal, packetKey: input.packetKey,
    sourceRef: input.sourceRef, sourceRevision: input.sourceRevision, workspaceRevision: input.workspaceRevision,
    chunkRowId: input.chunkRowId, canonicalChunkId: input.canonicalChunkId,
    liveBindingCount: Number(row.binding_count), livePacketCount: Number(row.packet_count),
    liveLineageCount: Number(row.lineage_count), liveChunkCount: Number(row.chunk_count),
    membershipStatus: row.membership_status ?? null, revisionStatus: row.revision_status ?? null,
    fileContentHashMatchesSourceRevision: row.file_content_hash === input.sourceRevision.slice('sha256:'.length),
    currentSourceBytesMatchSourceRevision: sourceDigestByRef.get(input.sourceRef) === input.sourceRevision,
    packetState: verdict.packetState, chunkState: verdict.chunkState, eligibility: verdict.eligibility,
    semantic768PhysicalState: vectorPresent ? 'PRESENT' : 'MISSING',
    semantic768QualityState: vectorCheck.state,
    vectorDimension: vectorCheck.dimension, vectorNorm: vectorCheck.norm,
    vectorTextChecksum: vectorCheck.textChecksum,
    historicalContentEmbeddingPresent: row.historical_content_embedding_present === true,
    semanticRepresentationBindingState: semanticBindingState,
    representationRevision: row.representation_revision ?? null,
    embeddingModel: row.embedding_model ?? null, embeddingVersion: row.embedding_version ?? null,
    embeddingDimension: row.embedding_dimension ?? null, embeddingNormalized: row.embedding_normalized ?? null,
    encoderId: row.encoder_id ?? null, tokenizerRevision: row.tokenizer_revision ?? null,
    inputDigest: row.input_digest ?? null, vectorChecksum: row.vector_checksum ?? null,
    summaryState: verdict.summaryState, summarySemanticState: verdict.summarySemanticState,
    summaryAdmissionStatus: row.summary_admission_status ?? null,
  };
});
const counts = (key: string) => Object.fromEntries([...new Set(results.map((row) => String((row as any)[key])))].sort()
  .map((state) => [state, results.filter((row) => String((row as any)[key]) === state).length]));
const generatedAt = new Date().toISOString();
const reportStamp = generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const details = `${results.map((row) => JSON.stringify(row)).join('\n')}\n`;
const detailDir = path.join(ROOT, '.tmp/atlas/mapreduce-chunk-readiness-v3', reportStamp);
fs.mkdirSync(detailDir, { recursive: true });
const detailPath = path.join(detailDir, 'readiness.ndjson');
fs.writeFileSync(detailPath, details, { flag: 'wx' });
const receipt: Record<string, any> = {
  schema: 'atlas.mapreduce-chunk-readiness-receipt.v3', generatedAt,
  status: results.length === inputRows.length ? 'READINESS_REPLAY_COMPLETE' : 'READINESS_REPLAY_PARTIAL',
  currentSemanticOwner: { table: 'codebase_chunk_index', column: 'content_embedding_768', storageType: 'vector(768)' },
  sourceManifest: path.relative(ROOT, manifestPath).replaceAll('\\', '/'), sourceManifestChecksum: sha(fs.readFileSync(manifestPath)),
  sourceOverlay: path.relative(ROOT, overlayPath).replaceAll('\\', '/'), sourceOverlayChecksum: sha(overlayBytes),
  candidateSnapshotRevision: manifest.candidateSnapshotRevision, ordinalMapChecksum: manifest.ordinalMapChecksum,
  candidateCount: new Set(inputRows.map((row) => row.packetKey)).size, chunkCount: inputRows.length,
  observedColumns: availableColumns.filter((column) => ['content_embedding_768', 'representation_revision', ...[
    'embedding_model', 'embedding_version', 'embedding_dimension', 'embedding_normalized', 'encoder_id',
    'tokenizer_revision', 'input_digest', 'vector_checksum',
  ]].includes(column)).sort(),
  measured: {
    packetStates: counts('packetState'), chunkStates: counts('chunkState'), eligibilityStates: counts('eligibility'),
    semantic768PhysicalStates: counts('semantic768PhysicalState'), semantic768QualityStates: counts('semantic768QualityState'),
    semanticRepresentationBindingStates: counts('semanticRepresentationBindingState'),
    summaryStates: counts('summaryState'), summarySemanticStates: counts('summarySemanticState'),
    historicalContentEmbeddingRows: results.filter((row) => row.historicalContentEmbeddingPresent).length,
    exactSourceFileDigestRows: results.filter((row) => row.fileContentHashMatchesSourceRevision).length,
    currentSourceBytesMatchRows: results.filter((row) => row.currentSourceBytesMatchSourceRevision).length,
    currentSourceFilesRehashed: [...sourceDigestByRef.values()].filter((value) => value !== null).length,
  },
  artifacts: {
    rowDetails: path.relative(ROOT, detailPath).replaceAll('\\', '/'),
    rowDetailsChecksum: sha(details),
  },
  writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, neo4j: 0, graphify: 0 },
  canonicalAuthority: false, receiptChecksum: null,
};
receipt.receiptChecksum = sha(JSON.stringify(receipt));
const reportPath = path.join(ROOT, 'docs/reports', `mapreduce-chunk-readiness-v3-${reportStamp}.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ status: receipt.status, candidateCount: receipt.candidateCount,
  chunkCount: receipt.chunkCount, measured: receipt.measured,
  report: path.relative(ROOT, reportPath).replaceAll('\\', '/'),
  details: receipt.artifacts.rowDetails }, null, 2)}\n`);
