#!/usr/bin/env node
/**
 * S01-07 — CurrentSourceAuthorityV1 live proof. READ-ONLY (one REPEATABLE READ READ ONLY transaction, SELECTs only).
 * Authority chain: admission receipt -> sealed snapshot sources -> Graphify execution membership (v2) [+ registry bindings as evidence].
 * No Graphify run, no input_identity backfill, no reader cutover, no writes to any store. Blocker => census + stop; nothing is repaired here.
 * Receipts are versioned by content checksum and never overwritten; `current-source-authority-v1.json` is a mutable latest-pointer copy.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { loadAuthorityShadowModuleV1 } from './lib/load-authority-shadow-v1.mjs';
import { classifyCurrentSourcesV1, membershipSetChecksumV1, type MembershipRowV1, type RegistryBindingV1, type SnapshotSourceV1 } from '../../sveltekit-frontend/src/lib/server/atlas/identity/current-source-authority-v1.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (rel: string) => JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
const digest = (v: string | Buffer) => `sha256:${createHash('sha256').update(v).digest('hex')}`;

const admission = readJson('docs/reports/workspace-revision-tournament-admission-v1.json');
const workspaceRevision: string = admission.workspaceRevision;
const manifestRel = `docs/reports/workspace-source-snapshots/${String(admission.snapshotRevision).replace(/^sha256:/, '')}.json`;
if (!existsSync(resolve(ROOT, manifestRel))) throw new Error(`SNAPSHOT_MANIFEST_MISSING ${manifestRel}`);
const snapshotBytes = readFileSync(resolve(ROOT, manifestRel));
const snapshot = JSON.parse(snapshotBytes.toString('utf8'));

// Manifest self-digest, recomputed independently (same rule as capture: hash of the body without the sealed fields). Source bytes are NOT re-read from the working tree here.
const { schema: _schema, snapshotRevision: _snapshotRevision, workspaceRevision: _snapshotWorkspaceRevision, status: _snapshotStatus, canonicalAuthority: _snapshotAuthority, datastoreWritesPerformed: _snapshotWrites, ...snapshotBody } = snapshot;
const selfDigestValid = snapshot.schema === 'atlas.workspace-source-snapshot-capture.v1' && digest(JSON.stringify(snapshotBody)) === snapshot.snapshotRevision && snapshot.datastoreWritesPerformed === false;
const preflightRel = admission.preflightPath ? String(admission.preflightPath).split('\\').join('/').replace(/^.*\/docs\/reports\//, 'docs/reports/') : null;
const preflight = preflightRel && existsSync(resolve(ROOT, preflightRel)) ? readJson(preflightRel) : null;

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
const client = await pool.connect();
await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
try {
  const workspaceId: string = snapshot.workspaceId;
  // The owner execution for this admitted revision: the legacy canonical row, cross-checked against the authority table via the ONE shared shadow helper.
  const owners = (await client.query(`SELECT execution_id::text AS execution_id FROM public.graphify_executions WHERE workspace_id = $1::uuid AND workspace_revision = $2 AND canonical_authority IS TRUE AND status = 'COMPLETED'`, [workspaceId, workspaceRevision])).rows;
  const { loadAuthorityShadowV1 } = await loadAuthorityShadowModuleV1();
  const shadow = await loadAuthorityShadowV1(client as any, { workspaceId, workspaceRevision });
  const executionId: string | null = owners.length === 1 ? owners[0].execution_id : null;
  const ownerAgrees = executionId !== null && shadow.legacyExecutionId === executionId && shadow.authorityExecutionId === executionId && shadow.parityStatus === 'PARITY_PROVEN';

  const membership: MembershipRowV1[] = executionId === null ? [] : (await client.query(
    `SELECT repository_id, repository_relative_path, source_ref, workspace_revision, code_source_revision, content_hash, byte_length::text AS byte_length
       FROM public.graphify_execution_file_membership_v2 WHERE execution_id = $1::uuid`, [executionId])).rows.map((r: any) => ({
    repositoryId: r.repository_id, repositoryRelativePath: r.repository_relative_path, sourceRef: r.source_ref, workspaceRevision: r.workspace_revision,
    codeSourceRevision: r.code_source_revision, contentHash: r.content_hash, byteLength: r.byte_length === null ? null : Number(r.byte_length),
  }));
  const bindings: RegistryBindingV1[] = (await client.query(
    `SELECT repo_id, canonical_source_ref, workspace_revision, source_revision, content_digest, byte_length::text AS byte_length
       FROM public.atlas_workspace_source_bindings WHERE workspace_revision = $1`, [workspaceRevision])).rows.map((r: any) => ({
    repoId: r.repo_id, canonicalSourceRef: r.canonical_source_ref, workspaceRevision: r.workspace_revision, sourceRevision: r.source_revision,
    contentDigest: r.content_digest, byteLength: r.byte_length === null ? null : Number(r.byte_length),
  }));
  const registryRepoIds = [...new Set(bindings.map((b) => b.repoId))];
  const membershipRepoIds = [...new Set(membership.map((m) => m.repositoryId))];

  const snapshotSources: SnapshotSourceV1[] = (snapshot.sources as any[]).map((s) => ({
    sourceIdentityKey: s.sourceIdentityKey ?? `${s.repositoryId}:${s.repositoryRelativePath}`, repositoryId: s.repositoryId, repositoryRelativePath: s.repositoryRelativePath,
    sourceRef: s.sourceRef, sourceRevision: s.sourceRevision ?? null, contentDigest: s.contentDigest ?? null, byteLength: s.byteLength ?? null,
  }));

  // Registry repo namespace differs from Graphify's (`deeds-web-app` vs `repo:root`); the mapping is an ASSUMPTION verified empirically below, not proof.
  const repoIdMap: Record<string, string> = registryRepoIds.length === 1 && membershipRepoIds.includes('repo:root') ? { 'repo:root': registryRepoIds[0] } : {};
  const result = classifyCurrentSourcesV1({
    admitted: { workspaceId, workspaceRevision, snapshotRevision: admission.snapshotRevision, sourceCount: admission.sourceCount, membershipChecksum: admission.sourceSelectionChecksum, admissionStatus: admission.status, admissionAuthority: admission.authority === true },
    snapshot: { snapshotRevision: snapshot.snapshotRevision, selfDigestValid, workspaceRevisionClaim: snapshot.workspaceRevision ?? null, canonicalAuthorityClaim: snapshot.canonicalAuthority !== false, violations: (snapshot.violations ?? []).length, membershipChecksum: snapshot.sourceMembershipChecksum ?? null, sources: snapshotSources },
    preflight: preflight ? { workspaceRevisionCandidate: preflight.workspaceRevisionCandidate ?? null, snapshotRevision: preflight.snapshotRevision ?? null, sourceCount: preflight.sourceCount ?? null, membershipChecksum: preflight.sourceSelectionChecksum ?? null } : null,
    membership,
    registry: { repoIdMap, rows: bindings },
  });

  // ---- L4: independent recomputation from RAW rows, deliberately not using the helper or graphify-input-identity.ts ----
  const rawEntries = membership.map((m) => ({ k: Buffer.from(`${m.repositoryId}:${m.repositoryRelativePath}`, 'utf8'), r: m.codeSourceRevision, b: Number(m.byteLength) })).sort((x, y) => Buffer.compare(x.k, y.k));
  const independentJson = `[${rawEntries.map((e) => `{"sourceIdentityKey":${JSON.stringify(e.k.toString('utf8'))},"sourceRevision":${JSON.stringify(e.r)},"byteLength":${e.b}}`).join(',')}]`;
  const independentSelectionChecksum = digest(independentJson);
  const independentMembershipSet = digest(JSON.stringify(snapshotSources.map((s) => s.sourceIdentityKey).sort()));
  const independent = {
    selectionChecksum: independentSelectionChecksum,
    matchesHelper: independentSelectionChecksum === result.sourceSelectionChecksum,
    membershipSetChecksum: independentMembershipSet,
    membershipSetMatchesAdmission: independentMembershipSet === admission.sourceSelectionChecksum && membershipSetChecksumV1(snapshotSources.map((s) => s.sourceIdentityKey)) === independentMembershipSet,
  };

  // ---- blocker census ----
  const reasonCounts: Record<string, number> = {};
  for (const s of result.classified) for (const reason of s.reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  const byRepository: Record<string, { sources: number; registryExact: number; registryAbsent: number; registryMismatch: number }> = {};
  const repoOf = (key: string) => key.slice(0, key.indexOf(':', key.indexOf(':') + 1) === -1 ? undefined : key.indexOf(':', key.indexOf(':') + 1));
  for (const s of result.classified) {
    const repo = repoOf(s.sourceIdentityKey);
    const row = (byRepository[repo] ??= { sources: 0, registryExact: 0, registryAbsent: 0, registryMismatch: 0 });
    row.sources += 1;
    if (s.registryBinding === 'EXACT') row.registryExact += 1; else if (s.registryBinding === 'ABSENT') row.registryAbsent += 1; else if (s.registryBinding === 'MISMATCH') row.registryMismatch += 1;
  }
  const rootMembers = membership.filter((m) => repoIdMap[m.repositoryId] !== undefined).length;
  const blockers: string[] = [];
  if (executionId === null) blockers.push(`OWNER_EXECUTION_NOT_UNIQUE:${owners.length}`);
  if (!ownerAgrees) blockers.push('OWNER_EXECUTION_LEGACY_AUTHORITY_DISAGREE');
  if (!independent.matchesHelper) blockers.push('INDEPENDENT_CHECKSUM_DISAGREES');
  if (!independent.membershipSetMatchesAdmission) blockers.push('ADMISSION_MEMBERSHIP_CHECKSUM_NOT_REPRODUCED');
  for (const [k, v] of Object.entries(result.proof)) if (!v) blockers.push(`PROOF_FLAG_FALSE:${k}`);
  if (result.counts.qualified !== result.sourceCount) blockers.push(`NON_QUALIFIED_SOURCES:${result.sourceCount - result.counts.qualified}`);
  const status = blockers.length === 0 && result.status === 'CURRENT_SOURCE_AUTHORITY_PROVEN' ? 'CURRENT_SOURCE_AUTHORITY_PROVEN' : 'CURRENT_SOURCE_AUTHORITY_BLOCKED';

  const { classified, ...resultRest } = result;
  const body = {
    ...resultRest,
    status,
    generatedAt: new Date().toISOString(),
    blockers,
    owners: {
      admissionReceipt: { file: 'docs/reports/workspace-revision-tournament-admission-v1.json', status: admission.status, authority: admission.authority, sourceCount: admission.sourceCount },
      admissionChecksumSemantics: 'The admission field `sourceSelectionChecksum` hashes the SORTED IDENTITY KEYS ONLY (membership set = snapshot.sourceMembershipChecksum). It is NOT the content-bearing GraphifyInputIdentityV1 sourceSelectionChecksumV1 reported above; the two are different quantities that share a name.',
      snapshotManifest: { file: manifestRel, digest: digest(snapshotBytes), status: snapshot.status, snapshotRevision: snapshot.snapshotRevision, selfDigestValid, workspaceRevisionClaimedBySnapshot: snapshot.workspaceRevision ?? null, violations: (snapshot.violations ?? []).length },
      admissionPreflight: preflight ? { file: preflightRel, status: preflight.status, workspaceRevisionCandidate: preflight.workspaceRevisionCandidate, snapshotRevision: preflight.snapshotRevision } : null,
      workspaceRevisionDerivationRecomputed: false,
      graphifyExecution: { executionId, ownerAgreesWithAuthorityShadow: ownerAgrees, authorityState: shadow.authorityState, parityStatus: shadow.parityStatus, runtimeOwner: shadow.runtimeOwner },
      registry: { table: 'atlas_workspace_source_bindings', bindingRowsForRevision: bindings.length, registryRepoIds, membershipRepoIds, repoIdMapAssumed: repoIdMap, rootRepositoryMembers: rootMembers, note: 'Registry uses a different repo namespace than Graphify. The map is an assumption, supported (not proven) by exact binding count vs root member count.' },
    },
    independentRecomputation: independent,
    blockerCensus: { reasonCounts, byRepository, registryCoverage: result.registryCoverage, nonQualifiedSample: classified.filter((s) => s.cls !== 'QUALIFIED').slice(0, 50) },
    safety: { databaseWrites: 0, graphifyRun: false, inputIdentityBackfill: false, readerCutover: false, vectorWrites: 0, graphWrites: 0, cacheWrites: 0, acePromotion: false, cagraPromotion: false, transaction: 'REPEATABLE READ READ ONLY, ROLLBACK' },
  };
  const receiptChecksum = digest(JSON.stringify(body));
  const receipt = { ...body, receiptChecksum };
  const versioned = resolve(ROOT, `docs/reports/current-source-authority-v1.${receiptChecksum.slice(7, 19)}.json`);
  if (!existsSync(versioned)) writeFileSync(versioned, `${JSON.stringify(receipt, null, 2)}\n`);
  writeFileSync(resolve(ROOT, 'docs/reports/current-source-authority-v1.json'), `${JSON.stringify({ ...receipt, versionedReceipt: versioned.slice(ROOT.length + 1).replaceAll('\\', '/') }, null, 2)}\n`);
  console.log(JSON.stringify({ status, blockers, sourceCount: result.sourceCount, counts: result.counts, proof: result.proof, sourceSelectionChecksum: result.sourceSelectionChecksum, independent, registryCoverage: result.registryCoverage, versionedReceipt: versioned }, null, 2));
  process.exitCode = status === 'CURRENT_SOURCE_AUTHORITY_PROVEN' ? 0 : 1;
} finally {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
