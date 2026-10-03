#!/usr/bin/env node

/**
 * CURRENT-EXECUTION-LINEAGE-CLOSURE-02
 *
 * Authority-oriented, read-only replacement for the legacy packet/chunk
 * census. The old implementation normalized large-table columns inside SQL
 * and incorrectly compared whole-source digests with per-chunk hashes.
 *
 * This implementation:
 *   1. requires an explicit/admitted workspace revision,
 *   2. requires one terminal Graphify execution for that revision,
 *   3. validates execution membership against exact workspace source bindings,
 *   4. fails fast if atlas_packet_chunk_lineage is not deployed,
 *   5. joins packet -> chunk only through atlas_packet_chunk_lineage,
 *   6. never compares source_content_digest to chunk_content_hash,
 *   7. executes in one REPEATABLE READ READ ONLY transaction.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { resolveCurrentWorkspaceFrameV1 } from './lib/current-workspace-frame-selector-v1.mjs';

const root = REPO_ROOT;
const reportPath = path.join(root, 'docs/reports/current-workspace-packet-chunk-join-v1.json');
const env = loadRepoEnv(process.env);

const arg = (name) => {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const clean = (value) => String(value ?? '').trim();
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};
const checksumRows = (rows) => digest(rows.map((row) => stableJson(row)).sort().join('\n'));
const normalizeDigest = (value) => clean(value).toLowerCase().replace(/^sha256:/, '');

const requestedLimit = Number(arg('--limit') ?? '52');
if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 5000) {
  throw new Error('--limit must be an integer between 1 and 5000');
}

const selectedFrame = resolveCurrentWorkspaceFrameV1({ root, argv: process.argv.slice(2), env: process.env });
const explicitWorkspaceRevision = clean(arg('--workspace-revision')) || null;
const workspaceRevision = explicitWorkspaceRevision || (selectedFrame.selectedAuthority ? selectedFrame.selectedWorkspaceRevision : null);
const requestedExecutionId = clean(arg('--execution-id')) || null;

if (!workspaceRevision) {
  const report = {
    schema: 'atlas.current-workspace-packet-chunk-join.v2',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_REPEATABLE_READ_AUTHORITY_AUDIT',
    status: 'CURRENT_WORKSPACE_REVISION_NOT_EXPLICIT_OR_ADMITTED',
    firstBlocker: 'EXPLICIT_OR_ADMITTED_WORKSPACE_REVISION_REQUIRED',
    selectedFrame,
    canonicalAuthority: false,
    writesPerformed: false,
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  process.exit(3);
}

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  statement_timeout: 120000,
  application_name: 'atlas-current-execution-lineage-closure-v2',
});

let client;
let pgSnapshot = null;
let executionCandidates = [];
let execution = null;
let members = [];
let bindings = [];
let lineageTablePresent = false;
let lineageRows = [];
let packetRows = [];
let plan = null;
let databaseError = null;

try {
  client = await pool.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query('SET LOCAL statement_timeout = 120000');
  pgSnapshot = (await client.query('SELECT pg_current_snapshot()::text AS snapshot')).rows[0]?.snapshot ?? null;

  executionCandidates = (await client.query(
    `SELECT execution_id::text, workspace_id::text, workspace_revision::text,
            status, canonical_authority, started_at, completed_at
       FROM public.graphify_executions
      WHERE workspace_revision::text = $1::text
        AND status IN ('COMPLETED', 'COMPLETED_REUSED')
      ORDER BY completed_at DESC NULLS LAST, execution_id`,
    [workspaceRevision],
  )).rows;

  if (requestedExecutionId) {
    execution = executionCandidates.find((row) => clean(row.execution_id) === requestedExecutionId) ?? null;
  } else if (executionCandidates.length === 1) {
    execution = executionCandidates[0];
  }

  if (execution) {
    members = (await client.query(
      `SELECT execution_id::text, repository_id::text, repository_relative_path::text,
              source_ref::text, code_source_revision::text, content_hash::text,
              byte_length::bigint, workspace_revision::text
         FROM public.graphify_execution_file_membership_v2
        WHERE execution_id = $1::uuid
        ORDER BY repository_id, repository_relative_path
        LIMIT $2`,
      [execution.execution_id, requestedLimit],
    )).rows;
  }

  const sourceRefs = [...new Set(members.map((row) => clean(row.source_ref)).filter(Boolean))];
  if (sourceRefs.length > 0) {
    bindings = (await client.query(
      `SELECT repo_id::text, workspace_revision::text, canonical_source_ref::text,
              source_revision::text, content_digest::text, byte_length::bigint,
              binding_checksum::text, observed_at
         FROM public.atlas_workspace_source_bindings
        WHERE workspace_revision::text = $1::text
          AND canonical_source_ref = ANY($2::text[])
        ORDER BY canonical_source_ref, observed_at DESC NULLS LAST`,
      [workspaceRevision, sourceRefs],
    )).rows;
  }

  lineageTablePresent = Boolean((await client.query(
    `SELECT to_regclass('public.atlas_packet_chunk_lineage') IS NOT NULL AS present`,
  )).rows[0]?.present);

  if (lineageTablePresent && sourceRefs.length > 0) {
    lineageRows = (await client.query(
      `SELECT l.packet_key::text, l.canonical_chunk_id::text, l.chunk_row_id::text,
              l.source_ref::text, l.source_namespace::text, l.source_revision::text,
              l.membership_status::text, l.revision_status::text,
              l.lineage_producer_revision::text, l.evidence_refs,
              c.id::text AS physical_chunk_row_id,
              c.chunk_id::text AS physical_chunk_id,
              c.source_ref::text AS physical_chunk_source_ref,
              c.content_hash::text AS chunk_content_hash
         FROM public.atlas_packet_chunk_lineage l
         LEFT JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id
        WHERE l.source_ref = ANY($1::text[])
          AND l.revision_status = 'PROVEN'
        ORDER BY l.source_ref, l.source_revision, l.canonical_chunk_id, l.chunk_row_id`,
      [sourceRefs],
    )).rows;

    const packetKeys = [...new Set(lineageRows.map((row) => clean(row.packet_key)).filter(Boolean))];
    if (packetKeys.length > 0) {
      packetRows = (await client.query(
        `SELECT packet_key::text, source_ref::text, source_revision::text, workspace_revision::text
           FROM public.atlas_packets
          WHERE packet_key = ANY($1::text[])
          ORDER BY packet_key`,
        [packetKeys],
      )).rows;
    }

    if (process.argv.includes('--explain-analyze')) {
      plan = (await client.query(
        `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, FORMAT JSON)
         SELECT l.packet_key, l.canonical_chunk_id, l.chunk_row_id
           FROM public.atlas_packet_chunk_lineage l
           JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id
          WHERE l.source_ref = ANY($1::text[])
            AND l.revision_status = 'PROVEN'`,
        [sourceRefs],
      )).rows[0]?.['QUERY PLAN'] ?? null;
    }
  }

  await client.query('ROLLBACK');
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
  if (client) {
    try { await client.query('ROLLBACK'); } catch {}
  }
} finally {
  client?.release();
  await pool.end();
}

const bindingByRef = new Map();
for (const row of bindings) {
  const ref = clean(row.canonical_source_ref);
  const list = bindingByRef.get(ref) ?? [];
  list.push(row);
  bindingByRef.set(ref, list);
}
const lineageBySourceRevision = new Map();
for (const row of lineageRows) {
  const key = `${clean(row.source_ref)}\0${clean(row.source_revision)}`;
  const list = lineageBySourceRevision.get(key) ?? [];
  list.push(row);
  lineageBySourceRevision.set(key, list);
}
const packetByKey = new Map(packetRows.map((row) => [clean(row.packet_key), row]));

const rows = members.map((member) => {
  const sourceRef = clean(member.source_ref);
  const sourceRevision = clean(member.code_source_revision);
  const sourceDigest = normalizeDigest(member.content_hash);
  const candidateBindings = bindingByRef.get(sourceRef) ?? [];
  const exactBindings = candidateBindings.filter((binding) => clean(binding.source_revision) === sourceRevision);
  const exactBinding = exactBindings.find((binding) => normalizeDigest(binding.content_digest) === sourceDigest) ?? null;
  const exactLineage = lineageBySourceRevision.get(`${sourceRef}\0${sourceRevision}`) ?? [];

  let validChunkRows = 0;
  let packetLineageMissing = 0;
  let chunkPhysicalMissing = 0;
  let chunkCanonicalMismatch = 0;
  let packetSourceMismatch = 0;

  for (const lineage of exactLineage) {
    const physicalPresent = clean(lineage.physical_chunk_row_id) === clean(lineage.chunk_row_id);
    const canonicalMatches = clean(lineage.canonical_chunk_id)
      && clean(lineage.canonical_chunk_id) === clean(lineage.physical_chunk_id);
    const packet = packetByKey.get(clean(lineage.packet_key)) ?? null;
    if (!packet) packetLineageMissing += 1;
    if (!physicalPresent) chunkPhysicalMissing += 1;
    if (physicalPresent && !canonicalMatches) chunkCanonicalMismatch += 1;
    if (packet && clean(packet.source_ref) !== sourceRef) packetSourceMismatch += 1;
    if (packet && clean(packet.source_ref) === sourceRef && physicalPresent && canonicalMatches) validChunkRows += 1;
  }

  let classification = 'CURRENT_EXACT';
  if (clean(member.workspace_revision) !== workspaceRevision) classification = 'SOURCE_WRONG_WORKSPACE';
  else if (candidateBindings.length === 0) classification = 'SOURCE_OBSERVATION_MISSING';
  else if (exactBindings.length === 0) classification = 'SOURCE_REVISION_MISMATCH';
  else if (!exactBinding) classification = 'SOURCE_CONTENT_MISMATCH';
  else if (!lineageTablePresent) classification = 'CHUNK_BRIDGE_MISSING';
  else if (exactLineage.length === 0) classification = 'CHUNK_LINEAGE_ROW_MISSING';
  else if (packetLineageMissing > 0) classification = 'PACKET_LINEAGE_MISSING';
  else if (chunkPhysicalMissing > 0) classification = 'CHUNK_PHYSICAL_ROW_MISSING';
  else if (chunkCanonicalMismatch > 0) classification = 'CHUNK_CANONICAL_ID_MISMATCH';
  else if (packetSourceMismatch > 0) classification = 'PACKET_AMBIGUOUS';
  else if (validChunkRows !== exactLineage.length) classification = 'CHUNK_AMBIGUOUS';

  return {
    repositoryId: clean(member.repository_id),
    repositoryRelativePath: clean(member.repository_relative_path),
    sourceRef,
    workspaceRevision: clean(member.workspace_revision),
    sourceRevision,
    sourceContentDigest: sourceDigest,
    sourceHashGrain: 'WHOLE_SOURCE_BYTES',
    bindingCandidates: candidateBindings.length,
    exactRevisionBindings: exactBindings.length,
    exactSourceBinding: Boolean(exactBinding),
    provenLineageRows: exactLineage.length,
    validChunkRows,
    packetLineageMissing,
    chunkPhysicalMissing,
    chunkCanonicalMismatch,
    packetSourceMismatch,
    classification,
  };
});

const classificationCounts = Object.fromEntries(
  [...new Set(rows.map((row) => row.classification))].sort().map((classification) => [
    classification,
    rows.filter((row) => row.classification === classification).length,
  ]),
);
const exactRows = rows.filter((row) => row.classification === 'CURRENT_EXACT');
const sourceMembershipChecksum = checksumRows(members.map((row) => ({
  repositoryId: clean(row.repository_id),
  repositoryRelativePath: clean(row.repository_relative_path),
  sourceRef: clean(row.source_ref),
  sourceRevision: clean(row.code_source_revision),
  sourceContentDigest: normalizeDigest(row.content_hash),
})));
const packetMembershipChecksum = checksumRows(lineageRows.map((row) => ({
  packetKey: clean(row.packet_key),
  sourceRef: clean(row.source_ref),
  sourceRevision: clean(row.source_revision),
})));
const chunkMembershipChecksum = checksumRows(lineageRows.map((row) => ({
  canonicalChunkId: clean(row.canonical_chunk_id),
  chunkRowId: clean(row.chunk_row_id),
  physicalChunkId: clean(row.physical_chunk_id),
})));

let status = 'CURRENT_EXECUTION_LINEAGE_CLOSURE_BLOCKED';
let firstBlocker = 'CURRENT_PACKET_CHUNK_LINEAGE_BRIDGE_INCOMPLETE';
if (databaseError) {
  status = 'CURRENT_EXECUTION_LINEAGE_AUDIT_FAILED';
  firstBlocker = databaseError;
} else if (!execution) {
  status = executionCandidates.length > 1 ? 'TERMINAL_EXECUTION_AMBIGUOUS' : 'TERMINAL_EXECUTION_MISSING';
  firstBlocker = status;
} else if (!lineageTablePresent) {
  status = 'CHUNK_BRIDGE_MISSING';
  firstBlocker = 'ATLAS_PACKET_CHUNK_LINEAGE_NOT_DEPLOYED';
} else if (rows.length > 0 && exactRows.length === rows.length) {
  status = 'CURRENT_EXECUTION_LINEAGE_CLOSURE_PROVEN';
  firstBlocker = null;
}

const report = {
  schema: 'atlas.current-workspace-packet-chunk-join.v2',
  gate: 'CURRENT-EXECUTION-LINEAGE-CLOSURE-02',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_REPEATABLE_READ_AUTHORITY_AUDIT',
  status,
  firstBlocker,
  selectedFrame,
  selectedWorkspaceRevision: workspaceRevision,
  selectedExecutionId: execution?.execution_id ?? requestedExecutionId,
  pgSnapshot,
  requestedLimit,
  executionCandidateCount: executionCandidates.length,
  lineageTablePresent,
  counts: {
    executionMembershipRowsAudited: members.length,
    sourceBindingRowsRead: bindings.length,
    provenLineageRowsRead: lineageRows.length,
    packetRowsRead: packetRows.length,
    exactCurrentRows: exactRows.length,
  },
  classificationCounts,
  hashGrain: {
    sourceContentDigest: 'whole-source-bytes',
    chunkContentHash: 'one-chunk-content',
    comparedDirectly: false,
  },
  joinContract: {
    sourceProof: 'execution.source_ref/source_revision/content_hash/workspace_revision -> exact workspace source binding',
    packetChunkProof: "binding.source_ref + binding.source_revision -> atlas_packet_chunk_lineage where revision_status='PROVEN'",
    physicalChunkProof: 'atlas_packet_chunk_lineage.chunk_row_id = codebase_chunk_index.id',
    canonicalChunkProof: 'atlas_packet_chunk_lineage.canonical_chunk_id = codebase_chunk_index.chunk_id',
    fuzzyJoinAllowed: false,
    inferredRevisionAllowed: false,
  },
  checksums: {
    sourceMembershipChecksum,
    packetMembershipChecksum,
    chunkMembershipChecksum,
  },
  indexPolicy: {
    existingWorkspaceBindingAccess: '(repo_id, workspace_revision) and (repo_id, canonical_source_ref, source_revision)',
    existingLineageAccess: 'source_ref plus revision_status indexes in unapplied lineage migration',
    futureCandidateOnlyAfterMigrationOwnerApproval: "partial composite index (source_ref, source_revision) WHERE revision_status='PROVEN'",
    expressionIndexesRequiredForThisAudit: false,
  },
  explainAnalyze: process.argv.includes('--explain-analyze') ? plan : null,
  rows,
  canonicalAuthority: false,
  writesPerformed: false,
  writes: { postgres: false, graphify: false, qdrant: false, neo4j: false, valkey: false },
  nextGate: status === 'CHUNK_BRIDGE_MISSING'
    ? 'PACKET-CHUNK-LINEAGE-MIGRATION-OWNER-01'
    : status === 'CURRENT_EXECUTION_LINEAGE_CLOSURE_PROVEN'
      ? 'CURRENT-PACKET-CHUNK-EXPECTED-SOURCE-SCOPE-01'
      : 'CURRENT-EXECUTION-LINEAGE-CLOSURE-02',
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const temporaryPath = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(temporaryPath, reportPath);
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  firstBlocker: report.firstBlocker,
  selectedWorkspaceRevision: report.selectedWorkspaceRevision,
  selectedExecutionId: report.selectedExecutionId,
  pgSnapshot: report.pgSnapshot,
  lineageTablePresent: report.lineageTablePresent,
  counts: report.counts,
  classificationCounts: report.classificationCounts,
  reportPath: path.relative(root, reportPath),
}, null, 2));
if (status !== 'CURRENT_EXECUTION_LINEAGE_CLOSURE_PROVEN') process.exitCode = 3;
