#!/usr/bin/env node
/**
 * RepositoryWideCoverageReceiptV1 (read-only).
 *
 * Reconciles every file admitted by the sealed Graphify execution membership to the admitted selection
 * manifest, and accounts for each file exactly once: directory, extension, parser applicability, binding,
 * legacy packet observation, revision qualification. It creates no identities and writes nothing but its
 * own receipt under .tmp/atlas. A passing census NEVER implies permission to write canonical projections.
 *
 * Graph coverage and OKF validation are owned elsewhere (neo4j-graph-coverage-v2, okf audits); this receipt
 * points to them and marks them delegated instead of recomputing or restating their results.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { accountMemberships } from './repository-wide-coverage-core.mjs';

import { resolveRepositoryScopes, ROOT_SCOPE } from './repository-scope-resolution-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '\t', '-c', sql], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

const EXECUTION_ID = '01a1763a-4355-71d7-9b81-2c7a1814a41f';


// 1. Admitted manifest and hygiene evidence.
const admission = readJson('docs/reports/workspace-revision-tournament-admission-v1.json');
const hygiene = readJson('.tmp/atlas/graphify-daily-selection-hygiene-v1.json');
const workspaceRevision = admission.workspaceRevision;

// 2. Authoritative cohort: membership rows of the admitted execution.
const memberships = psql(`select repository_id, repository_relative_path, source_ref, workspace_revision, code_source_revision, content_hash, byte_length from graphify_execution_file_membership_v2 where execution_id='${EXECUTION_ID}' order by repository_id, repository_relative_path`)
  .split('\n').filter(Boolean).map((line) => {
    const [scope, rel, sourceRef, wsRev, srcRev, hash, len] = line.split('\t');
    return { scope, rel, sourceRef, wsRev, srcRev, hash, len: Number(len) };
  });
const bound = new Set(psql(`select canonical_source_ref from atlas_workspace_source_bindings where workspace_revision='${workspaceRevision}'`).split('\n').filter(Boolean));
const legacyPacketRefs = new Set(psql('select distinct source_ref from atlas_packets').split('\n').filter(Boolean));
const registryPresent = psql("select coalesce(to_regclass('public.atlas_packet_identity_registry_v1')::text,'ABSENT')") !== 'ABSENT';
const identityRows = psql("select repository_id, source_authority_repo_id, repository_kind, coalesce(gitmodule_name,''), coalesce(parent_repository_id::text,'') from atlas_repository_identity order by repository_id")
  .split('\n').filter(Boolean).map((line) => {
    const [repository_id, source_authority_repo_id, repository_kind, gitmodule_name, parent_repository_id] = line.split('\t');
    return { repository_id, source_authority_repo_id, repository_kind, gitmodule_name: gitmodule_name || null, parent_repository_id: parent_repository_id || null };
  });
const scopeResolution = resolveRepositoryScopes({ scopes: memberships.map((m) => m.scope), identityRows });
const rootResolution = scopeResolution.find((entry) => entry.scope === ROOT_SCOPE);
const executionAuthority = psql(`select status||'|'||canonical_authority from graphify_executions where execution_id='${EXECUTION_ID}'`);

// 3. Account for every file exactly once (pure core; only lstat is injected).
const accounted = accountMemberships({
  memberships, bound, legacyPacketRefs, registryPresent, workspaceRevision, rootScope: ROOT_SCOPE,
  lstat: (rel) => { try { return fs.lstatSync(path.join(root, rel)); } catch { return null; } },
});
const { directories, parserCounts, unsupported, violations } = accounted;
const scopes = accounted.scopes.map((entry) => ({ ...entry, scopeResolution: scopeResolution.find((r) => r.scope === entry.scope) }));
const total = memberships.length;
const totalsReconcile = {
  membershipRows: total,
  directoryTotal: directories.reduce((n, d) => n + d.selected, 0),
  scopeTotal: scopes.reduce((n, s) => n + s.selected, 0),
  manifestSourceCount: admission.sourceCount,
  snapshotCandidates: admission.snapshotSourceCount,
  hygieneExclusions: hygiene.exclusions.length,
  exactlyReconciled: total === admission.sourceCount && total === directories.reduce((n, d) => n + d.selected, 0) && admission.snapshotSourceCount === total + hygiene.exclusions.length,
};

// 4. Gate verdict from the latest immutable Canonical Gate V2 run (delegated, not recomputed).
const runsDir = path.join(root, '.tmp', 'atlas', 'canonical-gate-runs');
const runs = fs.existsSync(runsDir) ? fs.readdirSync(runsDir).sort() : [];
let gate = { status: 'NO_GATE_V2_RUN_FOUND' };
if (runs.length > 0) {
  const gatePath = path.join(runsDir, runs[runs.length - 1], 'canonical-gate-receipt-v2.json');
  if (fs.existsSync(gatePath)) {
    const g = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
    gate = { receipt: path.relative(root, gatePath).replaceAll('\\', '/'), overall: g.overall, firstFailedMandatoryPredicate: g.firstFailedMandatoryPredicate, executionStatus: g.executionStatus, promotionStatus: g.promotionStatus, receiptSha256: g.receiptSha256 };
  }
}

const verdicts = {
  CURRENT_SNAPSHOT_PROVEN: admission.status ?? 'SEE_ADMISSION',
  EXECUTION_COMPLETED: executionAuthority.startsWith('COMPLETED'),
  REGISTRY_DDL_NOT_APPLIED: !registryPresent,
  GRAPH_COVERAGE_INCOMPLETE: 'DELEGATED_NOT_RECOMPUTED (see neo4j-graph-coverage-v2); no complete revision-qualified export exists',
  CANONICAL_AUTHORITY_NOT_GRANTED: executionAuthority.endsWith('|false'),
};
const blockers = [];
if (!registryPresent) blockers.push('REGISTRY_DDL_NOT_APPLIED');
if (rootResolution?.status !== 'MAPPED') blockers.push(`ROOT_SCOPE_${rootResolution?.status ?? 'UNRESOLVED'}`);
if (scopeResolution.some((r) => r.scope !== ROOT_SCOPE && r.status !== 'MAPPED')) blockers.push('NESTED_SCOPE_REPOSITORY_UNMAPPED');
if (executionAuthority.endsWith('|false')) blockers.push('CANONICAL_AUTHORITY_NOT_GRANTED');
blockers.push('GRAPH_COVERAGE_INCOMPLETE');

const body = {
  schema: 'atlas.repository-wide-coverage-receipt.v1',
  repository: { rootRepositoryId: rootResolution?.repositoryId ?? null, persistedIdentityRows: identityRows.length, scopeResolution, note: 'Scope labels are strings; a repository UUID appears only when resolved from a persisted atlas_repository_identity row.' },
  workspaceRevision,
  snapshotRevision: admission.snapshotRevision,
  admittedExecutionId: EXECUTION_ID,
  selectionManifest: { sourceSelectionChecksum: admission.sourceSelectionChecksum, manifestSha256: admission.manifestSha256, snapshotMembershipChecksum: admission.snapshotMembershipChecksum, sourceCount: admission.sourceCount, selectionChecksumRecomputed: 'NOT_REPRODUCED (formula not implemented here)' },
  membershipRowsSha256: sha256(memberships.map((m) => `${m.scope}\t${m.rel}\t${m.hash}\t${m.len}`).join('\n')),
  totalsReconcile,
  intentionalExclusions: { count: hygiene.exclusions.length, byReason: hygiene.excludedCountsByReason, note: 'Hygiene exclusions are not processing failures.' },
  scopes,
  parserApplicability: { basis: 'extension routing proposal in this script', byParser: parserCounts, unsupportedExtensions: unsupported, note: 'A file with no applicable parser is accounted for without claiming AST extraction.' },
  packetIdentity: { registryV1Tables: registryPresent ? 'PRESENT' : 'ABSENT', registryIdentityQualified: 0, legacyPacketObserved: scopes.reduce((n, s) => n + s.legacyPacketObserved, 0), note: 'Legacy packet observation is a historical locator, not canonical identity.' },
  graphCoverage: { status: 'DELEGATED_NOT_RECOMPUTED', owner: 'scripts/atlas/lib/neo4j-graph-coverage-v2.mjs' },
  okf: { status: 'DELEGATED_NOT_RECOMPUTED', owner: 'okf audit scripts', note: 'Reported 743-file cohort (387 checked invalid, 356 excluded) is not restated here.' },
  integrityViolations: { duplicatePathCount: violations.duplicatePaths.length, caseFoldCollisionCount: violations.caseFoldCollisions.length, unsafePathCount: violations.unsafePaths.length, symlinkCount: violations.symlinks.length, samples: { duplicatePaths: violations.duplicatePaths.slice(0, 5), caseFoldCollisions: violations.caseFoldCollisions.slice(0, 5), unsafePaths: violations.unsafePaths.slice(0, 5), symlinks: violations.symlinks.slice(0, 5) } },
  canonicalGate: gate,
  verdicts,
  blockingPredicates: blockers,
  firstBlockingPredicate: gate.firstFailedMandatoryPredicate ?? blockers[0],
  directories,
  canonicalAuthority: false,
  writesPerformed: false,
};
const censusVerified = totalsReconcile.exactlyReconciled && violations.duplicatePaths.length === 0 && violations.unsafePaths.length === 0;
body.finalStatus = censusVerified ? 'REPOSITORY_WIDE_COVERAGE_READ_ONLY_VERIFIED' : 'REPOSITORY_WIDE_COVERAGE_NOT_RECONCILED';
body.safeToProject = false;
const stable = JSON.stringify(body);
const receipt = { ...body, createdAtUtc: new Date().toISOString(), receiptSha256: sha256(stable) };
// --receipt=<path> writes an immutable per-run copy (used by Canonical Gate V2); the default is a dated
// scratch receipt whose previous version is preserved, never overwritten.
const receiptArg = process.argv.find((arg) => arg.startsWith("--receipt="));
const outPath = receiptArg ? path.resolve(root, receiptArg.slice("--receipt=".length)) : path.join(root, ".tmp", "atlas", "repository-wide-coverage-receipt-v1-20261027.json");
if (!outPath.startsWith(path.join(root, ".tmp") + path.sep) && !outPath.startsWith(path.join(root, "docs") + path.sep)) throw new Error("RECEIPT_OUTPUT_OUTSIDE_ALLOWED_ROOTS");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
if (!receiptArg && fs.existsSync(outPath)) fs.copyFileSync(outPath, outPath.replace(/.json$/, `.prev-${Date.now()}.json`));
fs.writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}
`, receiptArg ? { flag: "wx" } : undefined);
console.log(JSON.stringify({ finalStatus: body.finalStatus, safeToProject: body.safeToProject, totalsReconcile, integrity: { duplicatePathCount: body.integrityViolations.duplicatePathCount, caseFoldCollisionCount: body.integrityViolations.caseFoldCollisionCount, unsafePathCount: body.integrityViolations.unsafePathCount, symlinkCount: body.integrityViolations.symlinkCount }, scopeCount: scopes.length, nestedScopesUnmapped: scopeResolution.filter((r) => r.scope !== ROOT_SCOPE && r.status !== "MAPPED").length, directories: directories.length, unsupportedFileCount: Object.values(unsupported).reduce((n, v) => n + v, 0), blockingPredicates: body.blockingPredicates, verdicts: body.verdicts, firstBlockingPredicate: body.firstBlockingPredicate, receiptSha256: receipt.receiptSha256, receiptPath: path.relative(root, outPath).replaceAll("\\", "/") }, null, 1));
