#!/usr/bin/env -S npx tsx

/**
 * SOURCE-CHUNK-MATERIALIZATION-BINDING-01 (read-only).
 *
 * Adapts and reuses the existing PKT-LINEAGE-08A receipts
 * (pkt-lineage-08-bounded-snapshot-v1.json + pkt-lineage-08a-chunk-preimage-proof-v1.json)
 * rather than adding a second chunk-preimage writer. For a source in that
 * already-authorized bounded cohort, this proves:
 *   - exact sourceRef, exact sourceRevision, exact whole-source contentDigest
 *   - stable source identity (real graphify_files row)
 *   - a revision-bound workspace/Graphify identity observation via the existing
 *     buildSourceNamespaceFromGraphifyFilesV1 owner (not stable repository
 *     namespace authority)
 *   - >=1 real codebase_chunk_index row per chunk (chunkRowId IS the real
 *     table's primary key -- verified live, not assumed)
 *   - per-chunk contentHash evidence (never whole-source digest compared to
 *     per-chunk hash -- that grain mismatch is exactly what broke the
 *     111-binding/registry-join track this gate does not repeat)
 *   - a deterministic chunk-set checksum
 *
 * IDENTITY-AUTHORITY DECISION (2026-09-05, operator-confirmed): the
 * atlas_source_refs registry does not cover this cohort's file types
 * (SOURCE-REGISTRY-OWNER-JOIN-01 found 0/50 exact matches; the registry's
 * 4,598-file coverage skews toward "src/lib" and "src/routes" TypeScript,
 * structurally different from this cohort's root-level docs/data/config
 * files). The operator explicitly accepted the workspace/Graphify identity
 * path (SourceNamespaceV1, provenance: REVISION_BOUND) as a physical
 * source-observation identity only. It is not stable repository namespace
 * authority, and this script must not report namespace authority as proven.
 *
 * Modes:
 *   (default / --source-ref=<ref>)  one source, verbose per-chunk detail
 *   --all                           every source in the bounded cohort,
 *                                   aggregate pass/fail counts
 *
 * Requires real Postgres queries only to (a) fetch each source's
 * graphify_files identity row for namespace construction, and (b)
 * spot-verify each chunkRowId is a real codebase_chunk_index row with a
 * matching content_hash -- it does not run the preimage proof again.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { buildSourceNamespaceFromGraphifyFilesV1 } from '../../sveltekit-frontend/src/lib/server/atlas/embedding/source-namespace-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const snapshotPath = path.join(root, 'docs', 'reports', 'pkt-lineage-08-bounded-snapshot-v1.json');
const preimageProofPath = path.join(root, 'docs', 'reports', 'pkt-lineage-08a-chunk-preimage-proof-v1.json');
const singleOutPath = path.join(root, 'docs', 'reports', 'source-chunk-materialization-binding-v1.json');
const cohortOutPath = path.join(root, 'docs', 'reports', 'source-chunk-materialization-binding-cohort-v1.json');
const repositoryId = process.env.ATLAS_REPOSITORY_ID ?? 'semaj90/deeds_web_app';
const sha256 = (value: string) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;

const IDENTITY_AUTHORITY_NOTE = 'IDENTITY-AUTHORITY STATUS (2026-09-05): atlas_source_refs registry has zero coverage for this cohort (SOURCE-REGISTRY-OWNER-JOIN-01: 0/50 exact matches). Workspace/Graphify identity (SourceNamespaceV1, provenance: REVISION_BOUND) proves a revision-bound physical source observation only; stable repository namespace authority remains unresolved.';

type Chunk = { chunkRowId: string; canonicalChunkId: string; chunkContentHash: string; sourceRef: string };
type Binding = { sourceRef: string; sourceRevision: string; contentDigest: string; chunks: Chunk[] };
type GraphifyFileRow = { source_ref: string; workspace_id: string; workspace_revision: string | null; code_source_revision: string | null; content_hash: string | null };
type ChunkRowSpotCheck = { chunkRowId: string; realRowExists: boolean; sourceRefMatches: boolean; contentHashMatchesChunkGrain: boolean };

const args = new Map(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [key, ...value] = a.slice(2).split('=');
  return [key, value.join('=') || 'true'];
}));
const runAll = args.has('all');

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const preimageProof = JSON.parse(fs.readFileSync(preimageProofPath, 'utf8'));
const bindings: Binding[] = snapshot.bindings ?? [];

const targetSourceRef = args.get('source-ref') ?? bindings[0]?.sourceRef;
const targetBindings = runAll ? bindings : bindings.filter((b) => b.sourceRef === targetSourceRef);

if (targetBindings.length === 0) {
  console.error(JSON.stringify({ status: 'TARGET_SOURCE_NOT_IN_BOUNDED_COHORT', targetSourceRef }, null, 2));
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 30000 });

let databaseError: string | null = null;
const graphifyRowBySourceRef = new Map<string, GraphifyFileRow>();
const chunkRowById = new Map<string, { id: string; source_ref: string; content_hash: string }>();

try {
  const allSourceRefs = targetBindings.map((b) => b.sourceRef);
  const graphifyRows = (await pool.query(
    `select source_ref, workspace_id::text as workspace_id, workspace_revision, code_source_revision, content_hash
     from public.graphify_files where source_ref = any($1::text[])`,
    [allSourceRefs],
  )).rows as GraphifyFileRow[];
  for (const row of graphifyRows) graphifyRowBySourceRef.set(row.source_ref, row);

  const allChunkRowIds = targetBindings.flatMap((b) => b.chunks.map((c) => c.chunkRowId));
  const chunkRows = (await pool.query(
    `select id::text as id, source_ref, content_hash from public.codebase_chunk_index where id = any($1::uuid[])`,
    [allChunkRowIds],
  )).rows;
  for (const row of chunkRows) chunkRowById.set(row.id, row);
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

function proveOneSource(binding: Binding) {
  const graphifyRow = graphifyRowBySourceRef.get(binding.sourceRef) ?? null;
  const preimageRowsForSource = (preimageProof.rows ?? []).filter((row: { sourceRef: string }) => row.sourceRef === binding.sourceRef);
  const allChunksPreimageProven = binding.chunks.length > 0
    && binding.chunks.every((chunk) => preimageRowsForSource.some((row: { chunkRowId: string; status: string }) => row.chunkRowId === chunk.chunkRowId && row.status === 'EXACT_CHUNK_PREIMAGE'));

  const chunkRowSpotCheck: ChunkRowSpotCheck[] = binding.chunks.map((chunk) => {
    const real = chunkRowById.get(chunk.chunkRowId);
    return {
      chunkRowId: chunk.chunkRowId,
      realRowExists: Boolean(real),
      sourceRefMatches: real?.source_ref === chunk.sourceRef,
      contentHashMatchesChunkGrain: real?.content_hash === chunk.chunkContentHash,
    };
  });

  const namespace = graphifyRow
    ? buildSourceNamespaceFromGraphifyFilesV1({
        workspaceId: graphifyRow.workspace_id,
        repositoryId,
        workspaceRevision: graphifyRow.workspace_revision,
      })
    : null;

  const identityProven = graphifyRow !== null
    && graphifyRow.code_source_revision === binding.sourceRevision
    && graphifyRow.content_hash === binding.contentDigest;
  const chunkRowsAllReal = chunkRowSpotCheck.length > 0 && chunkRowSpotCheck.every((row) => row.realRowExists && row.sourceRefMatches && row.contentHashMatchesChunkGrain);
  // A revision-bound Graphify namespace is useful provenance, but it is not the
  // stable repository namespace owner required by SOURCE-REGISTRY-OWNER-JOIN-01.
  const namespaceProven = false;
  const namespaceAuthorityStatus = 'SOURCE_REGISTRY_IDENTITY_UNPROVEN_FOR_COHORT';

  const chunkSetChecksum = sha256(JSON.stringify(
    [...binding.chunks]
      .map((chunk) => [chunk.chunkRowId, chunk.canonicalChunkId, chunk.chunkContentHash])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
  ));

  let status: string;
  if (databaseError) status = 'AUDIT_FAILED';
  else if (!identityProven) status = 'SOURCE_IDENTITY_UNPROVEN';
  else if (!allChunksPreimageProven || !chunkRowsAllReal) status = 'CHUNK_SET_UNPROVEN';
  else status = 'SOURCE_CHUNK_MATERIALIZATION_BINDING_PROVEN_NAMESPACE_UNRESOLVED';

  return {
    sourceRef: binding.sourceRef,
    sourceRevision: binding.sourceRevision,
    sourceContentDigest: binding.contentDigest,
    sourceIdentityRef: 'public.graphify_files',
    identityAuthorityPath: 'WORKSPACE_GRAPHIFY_IDENTITY',
    identityProven,
    namespace,
    namespaceProven,
    namespaceAuthorityStatus,
    physicalMaterializationProven: status.startsWith('SOURCE_CHUNK_MATERIALIZATION_BINDING_PROVEN'),
    materializerRevision: null,
    chunkPolicyRevision: null,
    chunkCount: binding.chunks.length,
    chunks: binding.chunks.map((chunk, index) => ({
      chunkRowId: chunk.chunkRowId,
      canonicalChunkId: chunk.canonicalChunkId,
      chunkContentHash: chunk.chunkContentHash,
      startByte: null,
      endByte: null,
      ordinal: index,
      spotCheck: chunkRowSpotCheck[index] ?? null,
    })),
    allChunksPreimageProven,
    chunkRowsAllReal,
    chunkSetChecksum,
    status,
  };
}

const perSource = targetBindings.map(proveOneSource);

if (!runAll) {
  const single = perSource[0];
  const report = {
    schema: 'atlas.source-chunk-materialization-binding.v1',
    gate: 'SOURCE-CHUNK-MATERIALIZATION-BINDING-01',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    canonicalAuthority: false,
    writesPerformed: false,
    identityAuthorityNote: IDENTITY_AUTHORITY_NOTE,
    reusedEvidence: [
      'docs/reports/pkt-lineage-08-bounded-snapshot-v1.json',
      'docs/reports/pkt-lineage-08a-chunk-preimage-proof-v1.json',
      'docs/reports/source-registry-owner-join-v1.json',
    ],
    databaseError,
    ...single,
  };
  const receipt = { ...report, receiptChecksum: sha256(JSON.stringify(report)) };
  fs.writeFileSync(singleOutPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status, sourceRef: report.sourceRef, identityProven: report.identityProven,
    namespaceProven: report.namespaceProven, allChunksPreimageProven: report.allChunksPreimageProven,
    chunkRowsAllReal: report.chunkRowsAllReal, chunkCount: report.chunkCount,
    chunkSetChecksum: report.chunkSetChecksum, out: singleOutPath,
  }, null, 2));
  if (!report.status.startsWith('SOURCE_CHUNK_MATERIALIZATION_BINDING_PROVEN')) process.exitCode = 1;
} else {
  const proven = perSource.filter((s) => s.status.startsWith('SOURCE_CHUNK_MATERIALIZATION_BINDING_PROVEN'));
  const notProven = perSource.filter((s) => !s.status.startsWith('SOURCE_CHUNK_MATERIALIZATION_BINDING_PROVEN'));
  const totalChunks = perSource.reduce((sum, s) => sum + s.chunkCount, 0);
  const cohortSetChecksum = sha256(JSON.stringify([...perSource].map((s) => [s.sourceRef, s.chunkSetChecksum]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))));

  const status = databaseError ? 'AUDIT_FAILED' : notProven.length === 0 ? 'COHORT_SOURCE_CHUNK_MATERIALIZATION_BINDING_PROVEN_NAMESPACE_UNRESOLVED' : 'COHORT_PARTIALLY_PROVEN';

  const report = {
    schema: 'atlas.source-chunk-materialization-binding-cohort.v1',
    gate: 'SOURCE-CHUNK-MATERIALIZATION-BINDING-01',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    canonicalAuthority: false,
    writesPerformed: false,
    identityAuthorityNote: IDENTITY_AUTHORITY_NOTE,
    status,
    cohortSize: perSource.length,
    provenCount: proven.length,
    notProvenCount: notProven.length,
    totalChunks,
    cohortSetChecksum,
    notProvenSources: notProven.map((s) => ({ sourceRef: s.sourceRef, status: s.status })),
    sources: perSource,
    reusedEvidence: [
      'docs/reports/pkt-lineage-08-bounded-snapshot-v1.json',
      'docs/reports/pkt-lineage-08a-chunk-preimage-proof-v1.json',
      'docs/reports/source-registry-owner-join-v1.json',
    ],
    databaseError,
  };
  const receipt = { ...report, receiptChecksum: sha256(JSON.stringify(report)) };
  fs.writeFileSync(cohortOutPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status, cohortSize: report.cohortSize, provenCount: report.provenCount,
    notProvenCount: report.notProvenCount, totalChunks: report.totalChunks,
    cohortSetChecksum: report.cohortSetChecksum, out: cohortOutPath,
  }, null, 2));
  if (!status.startsWith('COHORT_SOURCE_CHUNK_MATERIALIZATION_BINDING_PROVEN')) process.exitCode = 1;
}
