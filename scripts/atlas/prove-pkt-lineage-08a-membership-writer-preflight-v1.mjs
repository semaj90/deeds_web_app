#!/usr/bin/env node

/**
 * PKT-LINEAGE-08A membership-writer preflight (read-only).
 *
 * This proves the database identity contract and compares the existing bounded
 * membership population with the frozen 08A source/chunk snapshot. It never
 * issues INSERT, UPDATE, DELETE, DDL, or transaction writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const snapshotPath = path.join(root, 'docs', 'reports', 'pkt-lineage-08-bounded-snapshot-v1.json');
const namespaceAuthorityPath = path.join(root, 'docs', 'reports', 'source-namespace-authority-v1.json');
const outPath = path.join(root, 'docs', 'reports', 'pkt-lineage-08a-membership-writer-preflight-v1.json');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const namespaceAuthority = JSON.parse(fs.readFileSync(namespaceAuthorityPath, 'utf8'));
const bindings = Array.isArray(snapshot.bindings) ? snapshot.bindings : [];
const sourceRefs = bindings.map((binding) => binding.sourceRef).sort();
const expectedChunks = bindings.flatMap((binding) => binding.chunks.map((chunk) => ({
  sourceRef: binding.sourceRef,
  packetSourceRef: binding.sourceRef,
  canonicalChunkId: chunk.canonicalChunkId,
  chunkRowId: chunk.chunkRowId,
  sourceRevision: binding.sourceRevision,
  sourceNamespace: String(snapshot.namespaceAuthorityRef ?? '').split('/')[0] || null,
}))).sort((a, b) => `${a.sourceRef}\0${a.canonicalChunkId}`.localeCompare(`${b.sourceRef}\0${b.canonicalChunkId}`));

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 30000,
});

let databaseError = null;
let constraintRows = [];
let packetRows = [];
let membershipRows = [];
try {
  const constraints = await pool.query(`
    SELECT tc.constraint_name, tc.constraint_type,
           COALESCE(string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position), '') AS columns
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_schema = tc.constraint_schema
     AND kcu.constraint_name = tc.constraint_name
     AND kcu.table_name = tc.table_name
    WHERE tc.constraint_schema = 'public'
      AND tc.table_name = 'atlas_packet_chunk_lineage'
    GROUP BY tc.constraint_name, tc.constraint_type
    ORDER BY tc.constraint_name
  `);
  constraintRows = constraints.rows;

  packetRows = (await pool.query(
    `SELECT packet_key, source_ref FROM public.atlas_packets WHERE source_ref = ANY($1::text[]) ORDER BY packet_key`,
    [sourceRefs],
  )).rows;

  membershipRows = (await pool.query(
    `SELECT packet_key, canonical_chunk_id, chunk_row_id::text AS chunk_row_id,
            source_ref, source_namespace, source_revision, membership_status, revision_status
       FROM public.atlas_packet_chunk_lineage
      WHERE source_ref = ANY($1::text[])
      ORDER BY packet_key, canonical_chunk_id`,
    [sourceRefs],
  )).rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const uniqueKey = constraintRows.find((row) =>
  row.constraint_type === 'UNIQUE' && row.columns === 'packet_key,canonical_chunk_id');
const packetBySource = new Map();
for (const row of packetRows) {
  const list = packetBySource.get(row.source_ref) ?? [];
  list.push(row.packet_key);
  packetBySource.set(row.source_ref, list);
}

const expectedPairs = expectedChunks.map((chunk) => ({
  packetKey: (packetBySource.get(chunk.packetSourceRef) ?? [])[0] ?? null,
  canonicalChunkId: chunk.canonicalChunkId,
  chunkRowId: chunk.chunkRowId,
  sourceRef: chunk.sourceRef,
  sourceRevision: chunk.sourceRevision,
}));
const expectedKey = (row) => `${row.packetKey}\0${row.canonicalChunkId}`;
const actualByKey = new Map(membershipRows.map((row) => [`${row.packet_key}\0${row.canonical_chunk_id}`, row]));
const missing = expectedPairs.filter((row) => !actualByKey.has(expectedKey(row)));
const conflicts = expectedPairs.filter((row) => {
  const actual = actualByKey.get(expectedKey(row));
  return actual && (actual.chunk_row_id !== row.chunkRowId || actual.source_ref !== row.sourceRef || actual.source_revision !== row.sourceRevision);
});
const duplicatePacketSources = [...packetBySource.entries()].filter(([, keys]) => keys.length !== 1);
const outOfScope = membershipRows.filter((row) => !expectedPairs.some((expected) =>
  expected.packetKey === row.packet_key && expected.canonicalChunkId === row.canonical_chunk_id));
const expectedNamespace = String(snapshot.namespaceAuthorityRef ?? '').split('/')[0] || null;
const namespaceMismatches = membershipRows.filter((row) => row.source_namespace !== expectedNamespace);
const namespaceAuthorityProven = namespaceAuthority.status === 'SOURCE_NAMESPACE_AUTHORITY_PROVEN'
  && namespaceAuthority.sourcePopulationCount === sourceRefs.length
  && namespaceAuthority.ambiguityCount === 0
  && namespaceAuthority.syntheticNamespaceCount === 0
  && JSON.stringify(namespaceAuthority.orderedSourceRefs) === JSON.stringify(sourceRefs);
const exactMemberships = expectedPairs.length - missing.length - conflicts.length;

const checks = {
  nonEmptySnapshot: bindings.length > 0 && expectedChunks.length > 0,
  expectedSourceCount: bindings.length === 50,
  expectedChunkCount: expectedChunks.length === 434,
  packetIdentityCount: packetRows.length === 50,
  onePacketPerSource: duplicatePacketSources.length === 0,
  physicalMembershipUniqueKey: Boolean(uniqueKey),
  sourceRegistryNamespaceAuthority: namespaceAuthorityProven,
  persistedNamespaceParity: namespaceMismatches.length === 0,
  exactMemberships: exactMemberships === 434,
  missingMemberships: missing.length === 0,
  conflictingMemberships: conflicts.length === 0,
  outOfScopeMemberships: outOfScope.length === 0,
};
const readyForAuthorization = !databaseError
  && Object.entries(checks).every(([key, value]) => key === 'sourceRegistryNamespaceAuthority' || value === true);
const report = {
  schema: 'atlas.pkt-lineage-08a-membership-writer-preflight.v1',
  gate: 'PKT-LINEAGE-08A-MEMBERSHIP-WRITER-PREFLIGHT-01',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  sourceSnapshot: 'docs/reports/pkt-lineage-08-bounded-snapshot-v1.json',
  sourceSetChecksum: snapshot.targetSourceSetChecksum,
  expectedSourceCount: bindings.length,
  expectedChunkCount: expectedChunks.length,
  packetCount: packetRows.length,
  membershipCount: membershipRows.length,
  exactMemberships,
  missingMembershipCount: missing.length,
  conflictingMembershipCount: conflicts.length,
  outOfScopeMembershipCount: outOfScope.length,
  duplicatePacketSourceCount: duplicatePacketSources.length,
  uniqueMembershipConstraint: uniqueKey ?? null,
  namespaceAuthorityStatus: namespaceAuthorityProven
    ? 'SOURCE_NAMESPACE_AUTHORITY_PROVEN'
    : 'SOURCE_REGISTRY_IDENTITY_UNPROVEN_FOR_COHORT',
  checks,
  status: databaseError ? 'AUDIT_FAILED' : readyForAuthorization ? 'ALREADY_APPLIED_EXACT' : 'BLOCKED_MEMBERSHIP_PRECONDITIONS',
  authorizationCandidate: false,
  canonicalAuthority: false,
  writesPerformed: false,
  databaseError,
  missing: missing.slice(0, 20),
  conflicts: conflicts.slice(0, 20),
  outOfScope: outOfScope.slice(0, 20),
  namespaceMismatches: namespaceMismatches.slice(0, 20),
  namespaceAuthorityReceipt: 'docs/reports/source-namespace-authority-v1.json',
};
report.receiptChecksum = sha256(JSON.stringify(report));
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  expectedSourceCount: report.expectedSourceCount,
  expectedChunkCount: report.expectedChunkCount,
  packetCount: report.packetCount,
  membershipCount: report.membershipCount,
  exactMemberships: report.exactMemberships,
  missingMembershipCount: report.missingMembershipCount,
  conflictingMembershipCount: report.conflictingMembershipCount,
  uniqueMembershipConstraint: report.uniqueMembershipConstraint?.constraint_name ?? null,
  namespaceAuthorityStatus: report.namespaceAuthorityStatus,
  out: outPath,
}, null, 2));
process.exitCode = databaseError || !readyForAuthorization ? 1 : 0;
