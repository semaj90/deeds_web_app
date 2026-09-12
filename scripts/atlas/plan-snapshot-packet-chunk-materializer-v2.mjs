#!/usr/bin/env node
/**
 * CURRENT-PACKET-CHUNK-MATERIALIZER-PLAN-02 -- READ ONLY.
 *
 * Bounded planner over the selected SNAPSHOT_NATIVE_READBACK_PROVEN execution.
 * It proves or classifies the source -> existing canonical chunk -> existing
 * file packet -> atlas_packet_chunk_lineage seam without minting identity.
 *
 * Hard invariants:
 * - current receipt supplies execution/workspace/snapshot revision
 * - graphify_executions supplies workspace_id namespace authority
 * - membership_v2 supplies exact source revision + whole-source digest
 * - repository_id + repository_relative_path is the selected source identity;
 *   source_ref-only downstream lookups are allowed only when source_ref is
 *   unique across repositories in the selected execution
 * - sidecar observations never mint canonical chunk identity
 * - canonical chunk IDs come only from codebase_chunk_index
 * - atlas_packets is file-granularity; packet content_hash is not compared to
 *   the membership whole-source digest
 * - duplicate sidecar observations resolving to one canonical chunk block
 * - no Postgres/Qdrant/Neo4j/Valkey/Graphify writes
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import {
  classifyPacketRows,
  classifySourceMaterializerPlan,
  languageForSourceRef,
  matchObservationToCanonicalChunkRows,
  normalizeText,
  sourceDigestMatches,
} from './lib/snapshot-packet-chunk-materializer-v1.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const ROOT = path.resolve(import.meta.dirname, '../..');
const READBACK_PATH = path.join(ROOT, 'docs/reports/graphify-snapshot-native-readback-v1.json');
const REPORT_PATH = path.join(ROOT, 'docs/reports/snapshot-packet-chunk-materializer-plan-v2.json');
const SIDECAR_URL = (process.env.ATLAS_NLP_SIDECAR_URL || 'http://127.0.0.1:8095').replace(/\/$/, '');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = Math.max(1, Math.min(Number.parseInt(limitArg?.split('=')[1] ?? '8', 10) || 8, 64));
const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
const ONLY_SOURCE = sourceArg ? sourceArg.slice('--source='.length).replaceAll('\\', '/') : null;
const noReport = process.argv.includes('--no-report');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function die(message) {
  console.error(message);
  process.exit(2);
}

if (!fs.existsSync(READBACK_PATH)) die('SNAPSHOT_NATIVE_READBACK_RECEIPT_MISSING');
const readback = JSON.parse(fs.readFileSync(READBACK_PATH, 'utf8'));
if (readback.status !== 'SNAPSHOT_NATIVE_READBACK_PROVEN') die(`SNAPSHOT_NATIVE_READBACK_NOT_PROVEN:${readback.status}`);
if (!readback.executionId || !readback.workspaceRevision || !readback.snapshotRevision) die('SNAPSHOT_NATIVE_READBACK_IDENTITY_INCOMPLETE');
if (Number(readback.membershipV2Count) !== Number(readback.selectedSourceCount)) die('SNAPSHOT_NATIVE_READBACK_MEMBERSHIP_COUNT_MISMATCH');
if (Number(readback.missingMembershipCount ?? 0) !== 0 || Number(readback.workspaceRevisionMismatchCount ?? 0) !== 0) {
  die('SNAPSHOT_NATIVE_READBACK_NOT_CLEAN');
}

const materializedRoot = path.join(ROOT, '.tmp', 'workspace-source-snapshots', String(readback.snapshotRevision).replace(/^sha256:/, ''));
if (!fs.existsSync(materializedRoot)) die(`MATERIALIZED_SNAPSHOT_ROOT_MISSING:${materializedRoot}`);

const pool = new Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv()),
  max: 2,
  statement_timeout: 120000,
  application_name: 'atlas-snapshot-packet-chunk-materializer-plan-v2',
});

async function postAst(source, language, filePath, sourceRevision) {
  const response = await fetch(`${SIDECAR_URL}/ast/chunk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source, language, filePath, sourceRevision }),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error(`SIDECAR_NON_JSON:${response.status}:${text.slice(0, 200)}`); }
  if (!response.ok) throw new Error(`SIDECAR_HTTP_${response.status}:${text.slice(0, 200)}`);
  if (payload?.schema !== 'atlas.ast.evidence.v1' || !Array.isArray(payload?.chunks)) throw new Error('SIDECAR_AST_CONTRACT_INVALID');
  return payload;
}

let memberships = [];
let error = null;
const plans = [];
let executionSourceRefCollisions = [];
try {
  const executionResult = await pool.query(
    `select execution_id::text, workspace_id::text, workspace_revision::text, status
       from public.graphify_executions
      where execution_id = $1::uuid`,
    [readback.executionId],
  );
  if (executionResult.rows.length !== 1) throw new Error('SELECTED_GRAPHIFY_EXECUTION_NOT_UNIQUE');
  const execution = executionResult.rows[0];
  if (!normalizeText(execution.workspace_id)) throw new Error('SELECTED_GRAPHIFY_WORKSPACE_ID_MISSING');
  if (normalizeText(execution.workspace_revision) !== normalizeText(readback.workspaceRevision)) throw new Error('SELECTED_GRAPHIFY_WORKSPACE_REVISION_MISMATCH');
  if (normalizeText(execution.status) !== 'COMPLETED') throw new Error(`SELECTED_GRAPHIFY_EXECUTION_NOT_COMPLETED:${execution.status}`);

  const collisionResult = await pool.query(
    `select source_ref,
            count(distinct repository_id)::int as repository_count,
            array_agg(distinct repository_id order by repository_id) as repository_ids
       from public.graphify_execution_file_membership_v2
      where execution_id = $1::uuid
      group by source_ref
     having count(distinct repository_id) > 1
      order by source_ref`,
    [readback.executionId],
  );
  executionSourceRefCollisions = collisionResult.rows.map((row) => ({
    sourceRef: normalizeText(row.source_ref).replaceAll('\\', '/'),
    repositoryCount: Number(row.repository_count),
    repositoryIds: Array.isArray(row.repository_ids) ? row.repository_ids.map(normalizeText) : [],
  }));
  const collisionBySourceRef = new Map(executionSourceRefCollisions.map((row) => [row.sourceRef, row]));

  const { rows } = await pool.query(
    `select m.execution_id::text, m.repository_id, m.repository_relative_path, m.source_ref,
            m.code_source_revision, m.content_hash, m.workspace_revision,
            e.workspace_id::text as workspace_id
       from public.graphify_execution_file_membership_v2 m
       join public.graphify_executions e on e.execution_id = m.execution_id
      where m.execution_id = $1::uuid
        and ($2::text is null or m.source_ref = $2::text)
      order by m.repository_id, m.repository_relative_path
      limit $3`,
    [readback.executionId, ONLY_SOURCE, LIMIT * 8],
  );
  memberships = rows.filter((row) => languageForSourceRef(row.source_ref)).slice(0, LIMIT);

  for (const membership of memberships) {
    const sourceRef = normalizeText(membership.source_ref).replaceAll('\\', '/');
    const sourceRefCollision = collisionBySourceRef.get(sourceRef) ?? null;
    if (sourceRefCollision) {
      plans.push({
        sourceRef,
        repositoryId: normalizeText(membership.repository_id),
        repositoryRelativePath: normalizeText(membership.repository_relative_path),
        classification: 'BLOCKED_MULTI_REPOSITORY_SOURCE_REF_COLLISION',
        blockers: ['MULTI_REPOSITORY_SOURCE_REF_COLLISION'],
        repositoryCount: sourceRefCollision.repositoryCount,
        repositoryIds: sourceRefCollision.repositoryIds,
      });
      continue;
    }

    const sourcePath = path.resolve(materializedRoot, sourceRef.replaceAll('/', path.sep));
    if (!sourcePath.startsWith(path.resolve(materializedRoot) + path.sep) || !fs.existsSync(sourcePath)) {
      plans.push({ sourceRef, classification: 'BLOCKED_MATERIALIZED_SOURCE_MISSING', blockers: ['MATERIALIZED_SOURCE_MISSING'] });
      continue;
    }

    const sourceBuffer = fs.readFileSync(sourcePath);
    const digestEvidence = sourceDigestMatches(sourceBuffer, membership);
    if (!digestEvidence.contentHashMatches || !digestEvidence.sourceRevisionMatches) {
      plans.push({ sourceRef, classification: 'BLOCKED_SOURCE_BYTES_MISMATCH', blockers: ['SOURCE_BYTES_MISMATCH'], digestEvidence });
      continue;
    }

    const language = languageForSourceRef(sourceRef);
    const ast = await postAst(sourceBuffer.toString('utf8'), language, sourceRef, membership.code_source_revision);

    const chunkResult = await pool.query(
      `select id::text, chunk_id::text, source_ref, relative_path, content, content_hash,
              line_start, line_end
         from public.codebase_chunk_index
        where source_ref = $1 or relative_path = $1
        order by id`,
      [sourceRef],
    );
    const packetResultRows = await pool.query(
      `select packet_key::text, source_ref, canonical_source_ref, source_revision, content_hash, sha256
         from public.atlas_packets
        where source_ref = $1 or canonical_source_ref = $1
        order by updated_at desc nulls last, created_at desc nulls last`,
      [sourceRef],
    );
    const lineageResult = await pool.query(
      `select packet_key::text, canonical_chunk_id::text, chunk_row_id::text, source_ref,
              source_namespace, source_revision, membership_status, revision_status
         from public.atlas_packet_chunk_lineage
        where source_ref = $1`,
      [sourceRef],
    );

    const observationMatches = ast.chunks.map((chunk, observationOrdinal) =>
      matchObservationToCanonicalChunkRows(sourceBuffer, chunk, chunkResult.rows, observationOrdinal),
    );
    const packetResult = classifyPacketRows(membership, packetResultRows.rows);
    const plan = classifySourceMaterializerPlan({
      membership,
      packetResult,
      observationMatches,
      existingLineageRows: lineageResult.rows,
    });
    plans.push({
      ...plan,
      language,
      sourceByteLength: sourceBuffer.length,
      sourceDigest: digestEvidence.digest,
      packetCandidatesObserved: packetResult.candidates,
      sidecar: {
        schema: ast.schema,
        engine: ast.engine ?? null,
        engineVersion: ast.engine_version ?? null,
        syntaxStatus: ast.syntax_status ?? null,
      },
      canonicalChunkRowsObserved: chunkResult.rows.length,
      filePacketRowsObserved: packetResultRows.rows.length,
      existingLineageRowsObserved: lineageResult.rows.length,
      observationMatches: observationMatches.map((row) => ({
        evidence: row.evidence,
        classification: row.classification,
        candidates: row.candidates,
      })),
    });
  }
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
} finally {
  await pool.end();
}

const counts = {
  selectedSources: plans.length,
  executionSourceRefCollisionCount: executionSourceRefCollisions.length,
  boundedMultiRepositorySourceRefCollisions: plans.filter((row) => row.classification === 'BLOCKED_MULTI_REPOSITORY_SOURCE_REF_COLLISION').length,
  readyLineageFill: plans.filter((row) => row.classification === 'READY_LINEAGE_FILL_EXISTING_PACKET_EXISTING_CHUNKS').length,
  alreadyComplete: plans.filter((row) => row.classification === 'ALREADY_COMPLETE_FOR_OBSERVED_CHUNKS').length,
  needsChunkMaterializer: plans.filter((row) => row.classification === 'NEEDS_CURRENT_CHUNK_MATERIALIZER').length,
  needsPacketMaterializer: plans.filter((row) => row.classification === 'NEEDS_CURRENT_PACKET_MATERIALIZER').length,
  ambiguousOrBlocked: plans.filter((row) => String(row.classification).startsWith('BLOCKED')).length,
  exactCurrentFilePacket: plans.filter((row) => row.packetClassification === 'EXACT_CURRENT_FILE_PACKET').length,
  uniqueLegacyFilePacketRevisionUnproven: plans.filter((row) => row.packetClassification === 'UNIQUE_FILE_PACKET_REVISION_UNPROVEN').length,
  duplicateProposedChunkIdentities: plans.reduce((sum, row) => sum + Number(row.duplicateProposedChunkIdentityCount || 0), 0),
  proposedMissingLineageRows: plans.reduce((sum, row) => sum + Number(row.missingLineageCount || 0), 0),
  existingLineageConflicts: plans.reduce((sum, row) => sum + Number(row.existingConflictCount || 0), 0),
};

let status = 'PACKET_CHUNK_MATERIALIZER_PLAN_BLOCKED';
let nextGate = 'REVIEW_BLOCKERS';
if (!error && counts.selectedSources > 0) {
  if (counts.readyLineageFill > 0 && counts.needsChunkMaterializer === 0 && counts.needsPacketMaterializer === 0 && counts.ambiguousOrBlocked === 0 && counts.duplicateProposedChunkIdentities === 0 && counts.existingLineageConflicts === 0) {
    status = 'LINEAGE_FILL_CANARY_READY';
    nextGate = 'EXPLICIT_BOUNDED_LINEAGE_FILL_AUTHORIZATION';
  } else if (counts.needsChunkMaterializer > 0) {
    status = 'CURRENT_CHUNK_MATERIALIZER_REQUIRED';
    nextGate = 'CURRENT_CHUNK_MATERIALIZER_DRY_RUN';
  } else if (counts.needsPacketMaterializer > 0) {
    status = 'CURRENT_PACKET_MATERIALIZER_REQUIRED';
    nextGate = 'CURRENT_PACKET_MATERIALIZER_DRY_RUN';
  } else if (counts.alreadyComplete === counts.selectedSources) {
    status = 'BOUNDED_PACKET_CHUNK_LINEAGE_ALREADY_COMPLETE';
    nextGate = 'EXPAND_BOUNDED_COHORT';
  }
}

const deterministic = {
  schema: 'atlas.snapshot-packet-chunk-materializer-plan.v2',
  gate: 'CURRENT-PACKET-CHUNK-MATERIALIZER-PLAN-02',
  mode: 'READ_ONLY_BOUNDED_PLAN',
  selectedExecutionId: readback.executionId,
  selectedWorkspaceRevision: readback.workspaceRevision,
  selectedSnapshotRevision: readback.snapshotRevision,
  selectedMembershipV2Count: readback.membershipV2Count,
  selectedRepositoryCount: readback.repositoryCount,
  sidecarUrl: SIDECAR_URL,
  materializedRoot,
  limit: LIMIT,
  onlySource: ONLY_SOURCE,
  executionSourceRefCollisions,
  counts,
  status,
  nextGate,
  plans,
  error,
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false, graphify: false },
  canonicalAuthority: false,
  materializationAuthorized: false,
  lineageFillAuthorized: false,
};
const report = {
  ...deterministic,
  generatedAt: new Date().toISOString(),
  reportChecksum: `sha256:${sha256(JSON.stringify(deterministic))}`,
};
if (!noReport) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify({
  status,
  nextGate,
  counts,
  selectedExecutionId: readback.executionId,
  selectedMembershipV2Count: readback.membershipV2Count,
  reportPath: noReport ? null : path.relative(ROOT, REPORT_PATH),
  writesPerformed: false,
}, null, 2));
if (error || counts.selectedSources === 0) process.exitCode = 2;
