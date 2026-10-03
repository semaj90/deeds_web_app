#!/usr/bin/env node

/**
 * CURRENT-PACKET-CHUNK-LINEAGE-BRIDGE-01
 *
 * Read-only reconciliation from one admitted Graphify execution membership to
 * the repo's existing revision-qualified packet/chunk lineage owner.
 *
 * IMPORTANT HASH-GRAIN RULE:
 *   graphify_execution_file_membership_v2.content_hash and
 *   atlas_workspace_source_bindings.content_digest are WHOLE-SOURCE digests.
 *   codebase_chunk_index.content_hash is PER-CHUNK. They are never compared.
 *
 * Authoritative join path used here:
 *   selected execution membership
 *     -> atlas_workspace_source_bindings (repo + source_ref + workspace rev)
 *     -> exact source_revision parity
 *     -> atlas_packet_chunk_lineage (source_ref + source_revision,
 *        revision_status='PROVEN')
 *     -> codebase_chunk_index.id = lineage.chunk_row_id
 *     -> atlas_packets via exact packet_key, then optional canonical alias
 *
 * atlas_chunk_packet_identity_links is deliberately NOT used as authority here:
 * EXACT rows whose canonical_writes_allowed=false are candidate evidence only.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const root = path.resolve(import.meta.dirname, '../..');
const reportPath = path.join(root, 'docs/reports/current-packet-chunk-lineage-bridge-v1.json');
const currentnessPath = path.join(root, 'docs/reports/promotion-gate-receipt-currentness-v1.json');

const clean = (value) => String(value ?? '').trim();
const normalizePath = (value) => clean(value).replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
const normalizeDigest = (value) => clean(value).toLowerCase().replace(/^sha256:/, '');
const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const membershipIdentity = (row) => `${clean(row.repository_id)}:${normalizePath(row.repository_relative_path)}`;
const bindingKey = (repositoryId, sourceRef) => `${clean(repositoryId)}\0${normalizePath(sourceRef)}`;
const lineageKey = (sourceRef, sourceRevision) => `${normalizePath(sourceRef)}\0${clean(sourceRevision)}`;
const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};
const setChecksum = (rows) => `sha256:${sha256(rows.map((row) => stableJson(row)).sort().join('\n'))}`;

const selected = fs.existsSync(currentnessPath)
  ? JSON.parse(fs.readFileSync(currentnessPath, 'utf8'))
  : {};
const executionId = arg('--execution-id') ?? selected.admittedExecutionId ?? null;
const workspaceRevision = arg('--workspace-revision') ?? selected.admittedWorkspaceRevision ?? null;
if (!executionId || !workspaceRevision) {
  throw new Error('CURRENT_PACKET_CHUNK_LINEAGE_EXECUTION_OR_WORKSPACE_REVISION_MISSING');
}

const pool = new Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv()),
  max: 1,
  statement_timeout: 120000,
  application_name: 'atlas-current-packet-chunk-lineage-bridge-v1',
});

let client;
let execution = null;
let members = [];
let bindings = [];
let lineageRows = [];
let physicalChunkCounts = [];
let aliasTablePresent = false;
let error = null;

try {
  client = await pool.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query('SET LOCAL statement_timeout = 120000');

  execution = (await client.query(
    `SELECT execution_id::text, workspace_revision::text, status
       FROM public.graphify_executions
      WHERE execution_id = $1::uuid
      LIMIT 1`,
    [executionId],
  )).rows[0] ?? null;

  members = (await client.query(
    `SELECT execution_id::text, repository_id::text, repository_relative_path::text,
            source_ref::text, code_source_revision::text, content_hash::text,
            workspace_revision::text
       FROM public.graphify_execution_file_membership_v2
      WHERE execution_id = $1::uuid
      ORDER BY repository_id, repository_relative_path`,
    [executionId],
  )).rows;

  const sourceRefs = [...new Set(members.map((row) => normalizePath(row.source_ref)).filter(Boolean))];

  bindings = sourceRefs.length === 0 ? [] : (await client.query(
    `SELECT repo_id::text, workspace_revision::text, canonical_source_ref::text,
            source_revision::text, content_digest::text, binding_checksum::text,
            observed_at
       FROM public.atlas_workspace_source_bindings
      WHERE workspace_revision::text = $1::text
        AND canonical_source_ref::text = ANY($2::text[])
      ORDER BY repo_id, canonical_source_ref, observed_at DESC NULLS LAST`,
    [workspaceRevision, sourceRefs],
  )).rows;

  aliasTablePresent = Boolean((await client.query(
    `SELECT to_regclass('public.atlas_packet_identity_aliases') IS NOT NULL AS present`,
  )).rows[0]?.present);

  if (sourceRefs.length > 0) {
    const aliasSelect = aliasTablePresent
      ? `a.canonical_packet_key::text AS alias_target_packet_key,
         pa.packet_key::text AS alias_packet_key,
         pa.source_ref::text AS alias_packet_source_ref`
      : `NULL::text AS alias_target_packet_key,
         NULL::text AS alias_packet_key,
         NULL::text AS alias_packet_source_ref`;
    const aliasJoins = aliasTablePresent
      ? `LEFT JOIN public.atlas_packet_identity_aliases a ON a.alias_key = l.packet_key
         LEFT JOIN public.atlas_packets pa ON pa.packet_key = a.canonical_packet_key`
      : '';

    lineageRows = (await client.query(
      `SELECT l.packet_key::text, l.canonical_chunk_id::text, l.chunk_row_id::text,
              l.source_ref::text, l.source_namespace::text, l.source_revision::text,
              l.membership_status::text, l.revision_status::text,
              l.lineage_producer_revision::text, l.evidence_refs,
              c.id::text AS physical_chunk_row_id,
              c.chunk_id::text AS physical_chunk_id,
              c.source_ref::text AS physical_chunk_source_ref,
              c.content_hash::text AS chunk_content_hash,
              pd.packet_key::text AS direct_packet_key,
              pd.source_ref::text AS direct_packet_source_ref,
              ${aliasSelect}
         FROM public.atlas_packet_chunk_lineage l
         LEFT JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id
         LEFT JOIN public.atlas_packets pd ON pd.packet_key = l.packet_key
         ${aliasJoins}
        WHERE l.source_ref::text = ANY($1::text[])
          AND l.revision_status = 'PROVEN'
        ORDER BY l.source_ref, l.source_revision, l.canonical_chunk_id, l.chunk_row_id`,
      [sourceRefs],
    )).rows;

    physicalChunkCounts = (await client.query(
      `SELECT source_ref::text, count(*)::int AS row_count
         FROM public.codebase_chunk_index
        WHERE source_ref::text = ANY($1::text[])
        GROUP BY source_ref`,
      [sourceRefs],
    )).rows;
  }

  await client.query('ROLLBACK');
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
  if (client) {
    try { await client.query('ROLLBACK'); } catch {}
  }
} finally {
  client?.release();
  await pool.end();
}

const duplicateMembershipIdentities = [];
const seenMembership = new Set();
for (const member of members) {
  const identity = membershipIdentity(member);
  if (seenMembership.has(identity)) duplicateMembershipIdentities.push(identity);
  seenMembership.add(identity);
}

const selectedSourceRefOwners = new Map();
for (const member of members) {
  const ref = normalizePath(member.source_ref);
  const owner = `${clean(member.repository_id)}:${normalizePath(member.repository_relative_path)}`;
  const owners = selectedSourceRefOwners.get(ref) ?? new Set();
  owners.add(owner);
  selectedSourceRefOwners.set(ref, owners);
}

const bindingRowsByKey = new Map();
const bindingRowsBySourceRef = new Map();
for (const row of bindings) {
  const key = bindingKey(row.repo_id, row.canonical_source_ref);
  const byKey = bindingRowsByKey.get(key) ?? [];
  byKey.push(row);
  bindingRowsByKey.set(key, byKey);
  const ref = normalizePath(row.canonical_source_ref);
  const byRef = bindingRowsBySourceRef.get(ref) ?? [];
  byRef.push(row);
  bindingRowsBySourceRef.set(ref, byRef);
}

const lineageByExactSourceRevision = new Map();
const lineageBySourceRef = new Map();
for (const row of lineageRows) {
  const exactKey = lineageKey(row.source_ref, row.source_revision);
  const exact = lineageByExactSourceRevision.get(exactKey) ?? [];
  exact.push(row);
  lineageByExactSourceRevision.set(exactKey, exact);
  const ref = normalizePath(row.source_ref);
  const byRef = lineageBySourceRef.get(ref) ?? [];
  byRef.push(row);
  lineageBySourceRef.set(ref, byRef);
}

const physicalChunkCountBySourceRef = new Map(
  physicalChunkCounts.map((row) => [normalizePath(row.source_ref), Number(row.row_count)]),
);

function distinctBindingSignatures(rows) {
  return new Set(rows.map((row) => [
    clean(row.repo_id),
    normalizePath(row.canonical_source_ref),
    clean(row.workspace_revision),
    clean(row.source_revision),
    normalizeDigest(row.content_digest),
  ].join('|')));
}

function resolvePacket(lineage) {
  const directKey = clean(lineage.direct_packet_key);
  const aliasKey = clean(lineage.alias_packet_key);
  const aliasTarget = clean(lineage.alias_target_packet_key);
  if (directKey && aliasKey && directKey !== aliasKey) {
    return { status: 'PACKET_IDENTITY_CONFLICT', packetKey: null, sourceRef: null, via: null };
  }
  if (directKey) {
    return { status: 'PACKET_RESOLVED', packetKey: directKey, sourceRef: normalizePath(lineage.direct_packet_source_ref), via: 'DIRECT' };
  }
  if (aliasTarget && aliasKey) {
    return { status: 'PACKET_RESOLVED', packetKey: aliasKey, sourceRef: normalizePath(lineage.alias_packet_source_ref), via: 'ALIAS' };
  }
  return { status: 'PACKET_UNRESOLVED', packetKey: null, sourceRef: null, via: null };
}

const rows = members.map((member) => {
  const identity = membershipIdentity(member);
  const repositoryId = clean(member.repository_id);
  const sourceRef = normalizePath(member.source_ref);
  const sourceRevision = clean(member.code_source_revision);
  const sourceDigest = normalizeDigest(member.content_hash);
  const workspaceMatches = clean(member.workspace_revision) === clean(workspaceRevision);
  const refOwners = selectedSourceRefOwners.get(sourceRef) ?? new Set();
  const sourceRefAmbiguousAcrossSelectedRepositories = refOwners.size > 1;

  const exactBindingRows = bindingRowsByKey.get(bindingKey(repositoryId, sourceRef)) ?? [];
  const sourceRefBindingRows = bindingRowsBySourceRef.get(sourceRef) ?? [];
  const bindingSignatures = distinctBindingSignatures(exactBindingRows);
  const binding = exactBindingRows[0] ?? null;
  const bindingAmbiguous = bindingSignatures.size > 1;
  const bindingRepositoryMismatch = exactBindingRows.length === 0 && sourceRefBindingRows.length > 0;
  const bindingRevisionMatches = Boolean(binding) && clean(binding.source_revision) === sourceRevision;
  const bindingDigestMatches = Boolean(binding) && normalizeDigest(binding.content_digest) === sourceDigest;

  const exactLineage = lineageByExactSourceRevision.get(lineageKey(sourceRef, sourceRevision)) ?? [];
  const sameSourceOtherRevision = (lineageBySourceRef.get(sourceRef) ?? []).filter((row) => clean(row.source_revision) !== sourceRevision);

  let validLineageRows = 0;
  let aliasResolvedRows = 0;
  let physicalChunkMissingRows = 0;
  let canonicalChunkIdMismatchRows = 0;
  let packetUnresolvedRows = 0;
  let packetIdentityConflictRows = 0;
  let packetSourceMismatchRows = 0;

  for (const lineage of exactLineage) {
    const physicalChunkPresent = clean(lineage.physical_chunk_row_id) === clean(lineage.chunk_row_id);
    const canonicalChunkMatches = clean(lineage.canonical_chunk_id) !== ''
      && clean(lineage.canonical_chunk_id) === clean(lineage.physical_chunk_id);
    if (!physicalChunkPresent) physicalChunkMissingRows += 1;
    if (physicalChunkPresent && !canonicalChunkMatches) canonicalChunkIdMismatchRows += 1;

    const packet = resolvePacket(lineage);
    if (packet.status === 'PACKET_UNRESOLVED') packetUnresolvedRows += 1;
    if (packet.status === 'PACKET_IDENTITY_CONFLICT') packetIdentityConflictRows += 1;
    if (packet.via === 'ALIAS') aliasResolvedRows += 1;
    if (packet.status === 'PACKET_RESOLVED' && packet.sourceRef !== sourceRef) packetSourceMismatchRows += 1;

    if (physicalChunkPresent
      && canonicalChunkMatches
      && packet.status === 'PACKET_RESOLVED'
      && packet.sourceRef === sourceRef) {
      validLineageRows += 1;
    }
  }

  let classification = 'EXACT_CURRENT_PACKET_CHUNK_BRIDGE';
  if (!workspaceMatches) classification = 'WORKSPACE_REVISION_MISMATCH';
  else if (sourceRefAmbiguousAcrossSelectedRepositories) classification = 'SOURCE_REF_AMBIGUOUS_ACROSS_SELECTED_REPOSITORIES';
  else if (bindingAmbiguous) classification = 'CURRENT_SOURCE_BINDING_AMBIGUOUS';
  else if (!binding && bindingRepositoryMismatch) classification = 'CURRENT_SOURCE_BINDING_REPOSITORY_MISMATCH';
  else if (!binding) classification = 'CURRENT_SOURCE_BINDING_MISSING';
  else if (!bindingRevisionMatches) classification = 'CURRENT_SOURCE_BINDING_REVISION_MISMATCH';
  else if (!bindingDigestMatches) classification = 'CURRENT_SOURCE_BINDING_CONTENT_MISMATCH';
  else if (exactLineage.length === 0 && sameSourceOtherRevision.length > 0) classification = 'PROVEN_LINEAGE_REVISION_MISMATCH';
  else if (exactLineage.length === 0) classification = 'PROVEN_LINEAGE_MISSING';
  else if (physicalChunkMissingRows > 0) classification = 'LINEAGE_PHYSICAL_CHUNK_MISSING';
  else if (canonicalChunkIdMismatchRows > 0) classification = 'LINEAGE_CANONICAL_CHUNK_ID_MISMATCH';
  else if (packetIdentityConflictRows > 0) classification = 'LINEAGE_PACKET_IDENTITY_CONFLICT';
  else if (packetUnresolvedRows > 0) classification = 'LINEAGE_PACKET_UNRESOLVED';
  else if (packetSourceMismatchRows > 0) classification = 'LINEAGE_PACKET_SOURCE_MISMATCH';
  else if (validLineageRows !== exactLineage.length) classification = 'LINEAGE_VALIDATION_INCOMPLETE';

  return {
    identity,
    repositoryId,
    repositoryRelativePath: normalizePath(member.repository_relative_path),
    sourceRef,
    workspaceRevision: clean(member.workspace_revision) || null,
    sourceRevision: sourceRevision || null,
    sourceContentDigest: sourceDigest || null,
    sourceHashGrain: 'WHOLE_SOURCE_BYTES',
    observedPhysicalChunkRowsByExactSourceRef: physicalChunkCountBySourceRef.get(sourceRef) ?? 0,
    sourceRefAmbiguousAcrossSelectedRepositories,
    exactBindingRowCount: exactBindingRows.length,
    exactBindingDistinctSignatures: bindingSignatures.size,
    bindingRevisionMatches,
    bindingDigestMatches,
    exactProvenLineageRows: exactLineage.length,
    provenLineageRowsAtOtherRevisions: sameSourceOtherRevision.length,
    validLineageRows,
    aliasResolvedRows,
    physicalChunkMissingRows,
    canonicalChunkIdMismatchRows,
    packetUnresolvedRows,
    packetIdentityConflictRows,
    packetSourceMismatchRows,
    classification,
  };
});

const classificationCounts = Object.fromEntries(
  [...new Set(rows.map((row) => row.classification))]
    .sort()
    .map((classification) => [classification, rows.filter((row) => row.classification === classification).length]),
);

const exactRows = rows.filter((row) => row.classification === 'EXACT_CURRENT_PACKET_CHUNK_BRIDGE');
const workspaceRevisionMismatches = rows.filter((row) => row.classification === 'WORKSPACE_REVISION_MISMATCH').length;
const exactBindingMembers = rows.filter((row) => row.exactBindingRowCount > 0 && row.bindingRevisionMatches && row.bindingDigestMatches).length;
const membersWithExactProvenLineage = rows.filter((row) => row.exactProvenLineageRows > 0).length;
const membersWithoutExactProvenLineage = rows.filter((row) => row.exactProvenLineageRows === 0).length;
const totalExactProvenLineageRows = rows.reduce((sum, row) => sum + row.exactProvenLineageRows, 0);
const totalValidLineageRows = rows.reduce((sum, row) => sum + row.validLineageRows, 0);
const totalAliasResolvedRows = rows.reduce((sum, row) => sum + row.aliasResolvedRows, 0);

const membershipChecksum = setChecksum(members.map((row) => ({
  identity: membershipIdentity(row),
  workspaceRevision: clean(row.workspace_revision),
  sourceRef: normalizePath(row.source_ref),
  sourceRevision: clean(row.code_source_revision),
  sourceContentDigest: normalizeDigest(row.content_hash),
})));
const bridgedLineageChecksum = setChecksum(lineageRows.map((row) => {
  const packet = resolvePacket(row);
  return {
    sourceRef: normalizePath(row.source_ref),
    sourceRevision: clean(row.source_revision),
    canonicalChunkId: clean(row.canonical_chunk_id),
    chunkRowId: clean(row.chunk_row_id),
    resolvedPacketKey: packet.packetKey,
    packetResolution: packet.via,
  };
}));

const counts = {
  selectedMembershipRows: members.length,
  repositoryCount: new Set(members.map((row) => clean(row.repository_id))).size,
  duplicateMembershipIdentities: duplicateMembershipIdentities.length,
  workspaceRevisionMismatches,
  exactCurrentSourceBindingMembers: exactBindingMembers,
  membersWithExactProvenLineage,
  membersWithoutExactProvenLineage,
  exactCurrentPacketChunkBridgeMembers: exactRows.length,
  totalExactProvenLineageRows,
  totalValidLineageRows,
  aliasResolvedLineageRows: totalAliasResolvedRows,
};

let status = 'CURRENT_PACKET_CHUNK_LINEAGE_BRIDGE_PARTIAL';
let firstBlocker = 'CURRENT_PACKET_CHUNK_LINEAGE_BRIDGE_INCOMPLETE';
if (error) {
  status = 'CURRENT_PACKET_CHUNK_LINEAGE_BRIDGE_AUDIT_ERROR';
  firstBlocker = error;
} else if (!execution || clean(execution.workspace_revision) !== clean(workspaceRevision)) {
  status = 'CURRENT_PACKET_CHUNK_LINEAGE_EXECUTION_MISMATCH';
  firstBlocker = 'SELECTED_EXECUTION_WORKSPACE_REVISION_MISMATCH';
} else if (duplicateMembershipIdentities.length > 0) {
  status = 'CURRENT_PACKET_CHUNK_LINEAGE_DUPLICATE_MEMBERSHIP';
  firstBlocker = 'DUPLICATE_EXECUTION_MEMBERSHIP_IDENTITIES';
} else if (workspaceRevisionMismatches > 0) {
  status = 'CURRENT_PACKET_CHUNK_LINEAGE_WORKSPACE_MISMATCH';
  firstBlocker = 'EXECUTION_MEMBERSHIP_WORKSPACE_REVISION_MISMATCH';
} else if (members.length > 0 && exactRows.length === members.length) {
  status = 'CURRENT_PACKET_CHUNK_LINEAGE_BRIDGE_PROVEN';
  firstBlocker = null;
}

const report = {
  schema: 'atlas.current-packet-chunk-lineage-bridge.v1',
  gate: 'CURRENT-PACKET-CHUNK-LINEAGE-BRIDGE-01',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_REPEATABLE_READ_RECONCILIATION',
  status,
  firstBlocker,
  selectedExecutionId: executionId,
  selectedWorkspaceRevision: workspaceRevision,
  execution,
  identityContract: {
    selectedSource: 'repository_id + repository_relative_path',
    currentSourceBinding: 'repo_id + canonical_source_ref + workspace_revision with exact source_revision/content_digest parity',
    packetChunkLineage: "source_ref + source_revision where revision_status='PROVEN'",
    physicalChunk: 'atlas_packet_chunk_lineage.chunk_row_id = codebase_chunk_index.id',
    canonicalChunk: 'atlas_packet_chunk_lineage.canonical_chunk_id must equal codebase_chunk_index.chunk_id',
    packet: 'atlas_packet_chunk_lineage.packet_key -> atlas_packets.packet_key; optional exact alias resolution only',
  },
  hashGrain: {
    selectedSourceContentHash: 'WHOLE_SOURCE_BYTES',
    workspaceBindingContentDigest: 'WHOLE_SOURCE_BYTES',
    codebaseChunkIndexContentHash: 'PER_CHUNK',
    sourceDigestComparedToChunkDigest: false,
  },
  authorityRules: {
    atlasPacketChunkLineageRequiresRevisionStatusProven: true,
    atlasChunkPacketIdentityLinksUsedAsAuthority: false,
    fuzzyPathJoinAllowed: false,
    basenameJoinAllowed: false,
    inferredRevisionAllowed: false,
    qdrantPointIdAllowedAsCanonicalBridge: false,
  },
  counts,
  classificationCounts,
  checksums: {
    selectedMembershipChecksum: membershipChecksum,
    provenLineageCandidateChecksum: bridgedLineageChecksum,
  },
  rows: rows.slice(0, 2000),
  rowsTruncated: rows.length > 2000,
  unresolvedSamples: rows.filter((row) => row.classification !== 'EXACT_CURRENT_PACKET_CHUNK_BRIDGE').slice(0, 250),
  nextGate: status === 'CURRENT_PACKET_CHUNK_LINEAGE_BRIDGE_PROVEN'
    ? 'PROMOTION-RECEIPT-COHORT-01'
    : 'CURRENT-PACKET-CHUNK-EXPECTED-SOURCE-SCOPE-01',
  writesPerformed: false,
  postgresWrites: false,
  qdrantWrites: false,
  neo4jWrites: false,
  projectionWrites: false,
};
report.reportChecksum = `sha256:${sha256(stableJson(report))}`;

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  firstBlocker: report.firstBlocker,
  counts: report.counts,
  classificationCounts: report.classificationCounts,
  reportPath: 'docs/reports/current-packet-chunk-lineage-bridge-v1.json',
}, null, 2));
if (status !== 'CURRENT_PACKET_CHUNK_LINEAGE_BRIDGE_PROVEN') process.exitCode = 3;
