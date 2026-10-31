#!/usr/bin/env node
/**
 * G7-REGISTRATION-01 Phase C — disposable registration proof.
 *
 * Runs only against an explicitly named, loopback PostgreSQL 18 fixture container with required
 * disposable labels. It never creates or drops databases and refuses a nonempty public schema.
 *
 *   node scripts/atlas/prove-g7-registration-disposable-v1.mjs --url postgres://fixture:fixture@127.0.0.1:55440/atlas_scratch_g7
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { loadStableFileIdentityMintModuleV1 } from './lib/load-stable-file-identity-mint-v1.mjs';
import { resolveGraphifyScopeRepositoryMappingV1 } from './lib/packet-key-v2-admission-v1.mjs';
import { assertG7DisposableContainerV1, parseG7DisposableTargetV1 } from './lib/g7-disposable-target-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined);
if (process.argv.includes('--scratch-on-server')) throw new Error('G7_SCRATCH_ON_SERVER_DISABLED');
const target = parseG7DisposableTargetV1(arg('--url'));
const { url, ...targetReceipt } = target;
const dockerContainerIds = execFileSync('docker', [
  'ps', '--quiet', '--filter', `publish=${target.port}`,
  '--filter', 'label=atlas.disposable=true',
  '--filter', 'label=atlas.fixture=g7-registration',
], { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean);
if (dockerContainerIds.length !== 1) throw new Error(`G7_DISPOSABLE_CONTAINER_NOT_UNIQUE:${dockerContainerIds.length}`);
const containerInfo = JSON.parse(execFileSync('docker', ['inspect', dockerContainerIds[0]], { encoding: 'utf8' }))[0];
assertG7DisposableContainerV1(containerInfo, target.port, url);

const mod = await loadStableFileIdentityMintModuleV1();
const manifestMod = await import(pathToFileURL(path.join(root, 'sveltekit-frontend/src/lib/server/atlas/identity/nested-repository-registration-manifest-v1.ts')).href);
const { buildNestedRepositoryCandidateV1, buildApprovedMintRequestV1, detectRepositoryMetadataConflictV1 } = manifestMod;

const pool = new pg.Pool({ connectionString: url, max: 2 });
const results = [];
const record = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${detail ? ` -- ${detail}` : ''}`); };
const client = (c) => ({ query: (sql, params) => c.query(sql, params) });
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sha = (v) => `sha256:${crypto.createHash('sha256').update(v).digest('hex')}`;

let version = 'unknown';

try {
  // ---- schema: frozen identity DDL + the scope-map draft (without the registry ALTER) --------------
  const setup = await pool.connect();
  version = (await setup.query('show server_version')).rows[0].server_version;
  const identity = (await setup.query(`
    SELECT current_database() AS database_name, current_setting('server_version_num')::int AS server_version_num
  `)).rows[0];
  if (identity.database_name !== target.database || Math.floor(identity.server_version_num / 10000) !== 18) {
    throw new Error('G7_DISPOSABLE_DATABASE_IDENTITY_MISMATCH');
  }
  const relationCount = Number((await setup.query(`
    SELECT count(*)::int AS count
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  `)).rows[0].count);
  if (relationCount !== 0) throw new Error(`G7_DISPOSABLE_PUBLIC_SCHEMA_NOT_EMPTY:${relationCount}`);

  // Prerequisite stubs consumed by stable-file-schema-ddl-v1.sql foreign keys
  await setup.query(`
    CREATE TABLE IF NOT EXISTS public.atlas_source_refs (
      repo_id text NOT NULL,
      source_ref_key text NOT NULL,
      PRIMARY KEY (repo_id, source_ref_key)
    );
    CREATE TABLE IF NOT EXISTS public.atlas_workspace_source_bindings (
      repo_id text NOT NULL,
      canonical_source_ref text NOT NULL,
      source_revision text NOT NULL,
      workspace_revision text NOT NULL,
      PRIMARY KEY (repo_id, workspace_revision, canonical_source_ref),
      UNIQUE (repo_id, canonical_source_ref, source_revision, workspace_revision)
    );
  `);

  const ddl = fs.readFileSync(path.join(root, 'docs/reports/stable-file-schema-ddl-v1.sql'), 'utf8');
  await setup.query(ddl);
  const mapDraft = fs.readFileSync(path.join(root, 'sveltekit-frontend/drizzle/manual/20261027_atlas_graphify_scope_repository_map_v1_DRAFT.sql'), 'utf8');
  await setup.query(mapDraft.split('ALTER TABLE public.atlas_packet_identity_registry_v1')[0]);
  setup.release();

const insertMap = (c, scope, repositoryId, authority, kind) => c.query(
  `INSERT INTO public.atlas_graphify_scope_repository_map_v1 (membership_repository_scope, repository_id, source_authority_repo_id, mapping_kind, evidence_ref, evidence_digest)
   VALUES ($1,$2,$3,$4,$5,$6)`,
  [scope, repositoryId, authority, kind, 'disposable-proof', sha(scope)],
);
const expectError = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

// ---- synthetic root + facts -----------------------------------------------------------------------
const rootReq = { sourceAuthorityRepoId: 'synthetic-root', repositoryName: 'synthetic-root', repositoryPath: 'C:\\synthetic', repositoryKind: 'ROOT', originUrl: null };
let rootRow;
{
  const c = await pool.connect();
  try { await c.query('BEGIN'); rootRow = (await mod.mintOrReuseRepositoryIdentityV1(client(c), rootReq)).row; await c.query('COMMIT'); } finally { c.release(); }
}
const gitFacts = { gitmodulePath: 'synthetic-nested', gitmodulesUrl: 'https://example.test/org/synthetic-nested.git', pinnedGitlink: 'c'.repeat(40), worktreePresent: true, worktreeHead: 'c'.repeat(40), worktreeOriginUrl: 'https://example.test/org/synthetic-nested', dirtyEntryCount: 0 };
const rootRef = { repositoryId: rootRow.repository_id, sourceAuthorityRepoId: rootRow.source_authority_repo_id };
const candidate = buildNestedRepositoryCandidateV1({ facts: gitFacts, root: rootRef, existingRows: [] });
const approval = { membershipScope: candidate.membershipScope, sourceAuthorityRepoId: 'synthetic-nested', approvedBy: 'disposable-proof', approvalReceipt: 'disposable-receipt-1' };
const details = { repositoryName: 'synthetic-nested', repositoryPath: 'synthetic-nested', originUrl: 'https://example.test/org/synthetic-nested' };
const mintReq = buildApprovedMintRequestV1(candidate, approval, details);

// 1 + 2: register one synthetic nested repo; UUIDv7 and exact readback
let nested;
{
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await mod.mintOrReuseRepositoryIdentityV1(client(c), mintReq);
    await c.query('COMMIT');
    nested = out.row;
    const back = (await c.query('select * from atlas_repository_identity where repository_id=$1', [nested.repository_id])).rows[0];
    record('1.register-one-synthetic-nested', out.outcome === 'MINTED_NEW' && back.repository_kind === 'NESTED_GIT_REPOSITORY' && back.parent_repository_id === rootRow.repository_id, `outcome=${out.outcome}`);
    record('2.uuidv7-persisted-exact-readback', UUID_V7.test(back.repository_id) && back.source_authority_repo_id === 'synthetic-nested' && back.gitmodule_name === 'synthetic-nested' && back.origin_url === details.originUrl, back.repository_id);
  } finally { c.release(); }
}

// 3: re-register same key => reuse same identity
{
  const c = await pool.connect();
  try {
    const out = await mod.mintOrReuseRepositoryIdentityV1(client(c), mintReq);
    const count = (await c.query("select count(*)::int n from atlas_repository_identity where source_authority_repo_id='synthetic-nested'")).rows[0].n;
    record('3.reregister-same-key-reuses-identity', out.outcome === 'REUSED_EXISTING' && out.row.repository_id === nested.repository_id && count === 1, `rows=${count}`);
  } finally { c.release(); }
}

// 4: conflicting metadata under the same authority key is rejected by the owner and manifest guard.
{
  const c = await pool.connect();
  try {
    const conflicting = { ...mintReq, originUrl: 'https://example.test/fork/synthetic-nested', repositoryPath: 'vendor/synthetic-nested' };
    const ownerError = await expectError(() => mod.mintOrReuseRepositoryIdentityV1(client(c), conflicting));
    const persisted = (await c.query(`
      SELECT repository_name, repository_path, repository_kind, gitmodule_name, origin_url, parent_repository_id
      FROM atlas_repository_identity WHERE source_authority_repo_id = $1
    `, [conflicting.sourceAuthorityRepoId])).rows[0];
    const conflicts = detectRepositoryMetadataConflictV1(conflicting, persisted);
    record('4a.owner-rejects-conflicting-metadata', ownerError?.message?.startsWith('REPOSITORY_IDENTITY_METADATA_CONFLICT:') === true && persisted.origin_url === details.originUrl && persisted.repository_path === details.repositoryPath, ownerError?.message ?? 'conflict was not rejected');
    record('4b.manifest-layer-rejects-conflicting-metadata', conflicts.map((x) => x.field).sort().join(',') === 'originUrl,repositoryPath', JSON.stringify(conflicts.map((x) => x.field)));
  } finally { c.release(); }
}

// 5: duplicate / ambiguous scope mappings
{
  const c = await pool.connect();
  try {
    await insertMap(c, 'repo:synthetic-nested', nested.repository_id, 'synthetic-nested', 'NESTED_REPOSITORY');
    const dup = await expectError(() => insertMap(c, 'repo:synthetic-nested', nested.repository_id, 'synthetic-nested', 'NESTED_REPOSITORY'));
    record('5a.duplicate-scope-mapping-rejected', dup?.code === '23505', dup?.code ?? 'no error');
    const wrongKind = await expectError(() => insertMap(c, 'repo:wrong-kind', rootRow.repository_id, 'synthetic-root', 'NESTED_REPOSITORY'));
    record('5b.nested-mapping-to-root-identity-rejected', wrongKind?.code === '23514', wrongKind?.message ?? 'no error');
    const authMismatch = await expectError(() => insertMap(c, 'repo:auth-mismatch', nested.repository_id, 'someone-else', 'NESTED_REPOSITORY'));
    record('5c.source-authority-mismatch-rejected', authMismatch?.code === '23514', authMismatch?.message ?? 'no error');
    const rows = (await c.query("select * from public.atlas_graphify_scope_repository_map_v1 where membership_repository_scope='repo:synthetic-nested'")).rows;
    const admit = resolveGraphifyScopeRepositoryMappingV1('repo:synthetic-nested', rows.map((r) => ({ ...r, persisted_source_authority_repo_id: r.source_authority_repo_id, repository_kind: 'NESTED_GIT_REPOSITORY', parent_repository_id: rootRow.repository_id })));
    const ambiguous = resolveGraphifyScopeRepositoryMappingV1('repo:synthetic-nested', [rows[0], rows[0]].map((r) => ({ ...r, persisted_source_authority_repo_id: r.source_authority_repo_id, repository_kind: 'NESTED_GIT_REPOSITORY', parent_repository_id: rootRow.repository_id })));
    record('5d.admission-contract-accepts-exact-and-rejects-ambiguous', admit.ok === true && ambiguous.ok === false && ambiguous.code === 'SCOPE_MAPPING_AMBIGUOUS', `${admit.code}/${ambiguous.code}`);
    // Observed, not asserted as a pass: a second scope may map to the same nested repository.
    const second = await expectError(() => insertMap(c, 'repo:second-scope-same-repo', nested.repository_id, 'synthetic-nested', 'NESTED_REPOSITORY'));
    record('5e.second-scope-to-same-repository (OBSERVED)', true, second ? `rejected ${second.code}` : 'ALLOWED by schema (gap: no one-scope-per-nested-repository constraint)');
  } finally { c.release(); }
}

// 6: root identity preserved
{
  const c = await pool.connect();
  try {
    const after = (await c.query('select * from atlas_repository_identity where repository_id=$1', [rootRow.repository_id])).rows[0];
    record('6.root-identity-preserved', JSON.stringify(after) === JSON.stringify(rootRow), after.repository_id);
  } finally { c.release(); }
}

// 7: rollback + retry
{
  const c = await pool.connect();
  try {
    const req2 = buildApprovedMintRequestV1(
      buildNestedRepositoryCandidateV1({ facts: { ...gitFacts, gitmodulePath: 'synthetic-retry', gitmodulesUrl: 'https://example.test/org/synthetic-retry', worktreeOriginUrl: 'https://example.test/org/synthetic-retry' }, root: rootRef, existingRows: [] }),
      { membershipScope: 'repo:synthetic-retry', sourceAuthorityRepoId: 'synthetic-retry', approvedBy: 'disposable-proof', approvalReceipt: 'disposable-receipt-2' },
      { repositoryName: 'synthetic-retry', repositoryPath: 'synthetic-retry', originUrl: 'https://example.test/org/synthetic-retry' },
    );
    await c.query('BEGIN');
    const first = await mod.mintOrReuseRepositoryIdentityV1(client(c), req2);
    await c.query('ROLLBACK');
    const afterRollback = (await c.query("select count(*)::int n from atlas_repository_identity where source_authority_repo_id='synthetic-retry'")).rows[0].n;
    await c.query('BEGIN');
    const retry = await mod.mintOrReuseRepositoryIdentityV1(client(c), req2);
    await c.query('COMMIT');
    const afterCommit = (await c.query("select count(*)::int n from atlas_repository_identity where source_authority_repo_id='synthetic-retry'")).rows[0].n;
    record('7.rollback-leaves-nothing-and-retry-mints-once', first.outcome === 'MINTED_NEW' && afterRollback === 0 && retry.outcome === 'MINTED_NEW' && afterCommit === 1 && UUID_V7.test(retry.row.repository_id), `afterRollback=${afterRollback} afterCommit=${afterCommit} uuidReusedAfterRollback=${first.row.repository_id === retry.row.repository_id}`);
  } finally { c.release(); }
}

// 8: an unapproved key cannot be promoted
{
  const refusals = [];
  for (const [label, appr] of [['no-approval', null], ['blank-key', { ...approval, sourceAuthorityRepoId: ' ' }], ['wrong-scope', { ...approval, membershipScope: 'repo:other' }], ['no-receipt', { ...approval, approvalReceipt: '' }]]) {
    refusals.push([label, (await expectError(() => buildApprovedMintRequestV1(candidate, appr, details)))?.message?.split(':')[0] ?? 'NOT_REFUSED']);
  }
  record('8.unapproved-key-cannot-be-promoted', refusals.every(([, r]) => r === 'REGISTRATION_KEY_NOT_APPROVED') && candidate.sourceAuthorityRepoId === null && candidate.proposedSourceAuthorityRepoId.status === 'UNAPPROVED', JSON.stringify(refusals));
}
} finally {
  await pool.end();
}

const failed = results.filter((r) => !r.ok);
const receipt = {
  schema: 'atlas.g7-registration-disposable-receipt.v1',
  generatedAt: new Date().toISOString(),
  target: { ...targetReceipt, serverVersion: version, containerId: dockerContainerIds[0], disposable: true },
  liveDatabaseTouched: false,
  cleanup: { databaseDroppedByRunner: false, externalFixtureTeardownRequired: true },
  owner: 'mintOrReuseRepositoryIdentityV1',
  results,
  summary: { total: results.length, passed: results.length - failed.length, failed: failed.length },
};
const outPath = path.join(root, '.tmp/atlas/g7-registration-disposable-receipt-v1.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`receipt: ${path.relative(root, outPath)}  passed=${receipt.summary.passed}/${receipt.summary.total}`);
process.exit(failed.length ? 1 : 0);
