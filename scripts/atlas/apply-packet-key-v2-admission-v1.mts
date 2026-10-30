#!/usr/bin/env node
/**
 * PACKET_KEY_V2 admission APPLY (rehearsal by default; every real write is gated).
 *
 * Consumes the manifest written by build-packet-key-v2-admission-manifest-v1.mts (read-only builder) and writes:
 *   atlas_packet_identity_registry_v1  one row per ADMISSION_READY entry (canonical PacketKeyV2)
 *   atlas_packet_identity_aliases_v1   one row per entry that has exactly one physical atlas_packets storage row
 *                                      (alias_key = that storage packet_key, alias_kind PACKET_KEY_V1_STORAGE_TO_V2)
 * It never touches atlas_packets, Qdrant, Redis or Neo4j.
 *
 * Default / --rehearse: the real transaction body runs, is read back, then ROLLED BACK. Nothing persists.
 * --apply additionally needs ALL of:
 *   ATLAS_AUTHORIZE_PACKET_KEY_V2_ADMISSION_APPLY=1
 *   --root-sha256 <manifest root sha256>   operator pin; must equal the manifest directory name
 *   --applied-by <operator> --apply-receipt <real receipt id>
 *
 * Run from sveltekit-frontend/:
 *   npx tsx ../scripts/atlas/apply-packet-key-v2-admission-v1.mts --manifest .tmp/atlas/<run>/packet-key-v2-admission-v1/<sha>/root.json
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { isCanonicalGraphifyExecution } from './lib/packet-key-v2-admission-v1.mjs';
import { planAdmissionApply, verifyAdmissionManifest } from './lib/packet-key-v2-admission-apply-v1.mjs';
import { computePacketKeyV2 } from '../../sveltekit-frontend/src/lib/server/atlas/identity/packet-key-v2';

const args = process.argv.slice(2);
const arg = (name: string): string | null => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] ?? null : null; };
const APPLY = args.includes('--apply');
const AUTHORIZED = process.env.ATLAS_AUTHORIZE_PACKET_KEY_V2_ADMISSION_APPLY === '1';
const MODE = APPLY && AUTHORIZED ? 'APPLY' : 'REHEARSAL_ROLLED_BACK';
const BATCH = 500;

const manifestArg = arg('--manifest');
if (!manifestArg) throw new Error('MANIFEST_REQUIRED: pass --manifest <path to root.json>');
const manifestPath = path.resolve(REPO_ROOT, manifestArg);
const allowedRoots = [path.join(REPO_ROOT, '.tmp/atlas'), path.join(REPO_ROOT, 'docs/reports')];
if (!allowedRoots.some((allowed) => { const rel = path.relative(allowed, manifestPath); return !rel.startsWith('..') && !path.isAbsolute(rel); })) {
  throw new Error('MANIFEST_MUST_BE_UNDER_TMP_ATLAS_OR_DOCS_REPORTS');
}
if (path.basename(manifestPath) !== 'root.json') throw new Error('MANIFEST_MUST_BE_root.json');
if (APPLY && !AUTHORIZED) throw new Error('APPLY_NOT_AUTHORIZED: set ATLAS_AUTHORIZE_PACKET_KEY_V2_ADMISSION_APPLY=1 (this run would only rehearse)');
if (APPLY) {
  if (!arg('--applied-by') || !arg('--apply-receipt')) throw new Error('APPLY_PROVENANCE_REQUIRED: pass --applied-by <operator> and --apply-receipt <real receipt id>; this script never invents either');
  if (arg('--root-sha256') !== path.basename(path.dirname(manifestPath))) throw new Error('ROOT_SHA256_PIN_MISMATCH: --root-sha256 must equal the manifest directory name');
}

const manifestDir = path.dirname(manifestPath);
const root = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const shards: Record<string, unknown> = {};
for (const shard of root.shards ?? []) shards[shard.name] = JSON.parse(fs.readFileSync(path.join(manifestDir, shard.name), 'utf8'));
const verified = verifyAdmissionManifest({ root, rootDirName: path.basename(manifestDir), shards });
if (!verified.ok) throw new Error(`MANIFEST_VERIFICATION_FAILED:\n${verified.errors.join('\n')}`);

const report: Record<string, unknown> = {
  schema: 'atlas.packet-key-v2-admission-apply.v1', generatedAt: new Date().toISOString(), mode: MODE,
  manifest: path.relative(REPO_ROOT, manifestPath).replaceAll('\\', '/'), rootSha256: path.basename(manifestDir),
  repositoryScope: root.repositoryScope, executionId: root.executionId, workspaceRevision: root.workspaceRevision,
  entryCount: verified.entries.length, writesPerformed: false,
};

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 2, application_name: 'apply-packet-key-v2-admission-v1' });
const chunk = <T,>(items: T[]): T[][] => { const out: T[][] = []; for (let i = 0; i < items.length; i += BATCH) out.push(items.slice(i, i + BATCH)); return out; };

try {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '120s'");

    // 1. Preconditions, read from the live database inside the transaction.
    const mapping = (await client.query(
      `SELECT repository_id::text AS repository_id, mapping_kind FROM public.atlas_graphify_scope_repository_map_v1 WHERE membership_repository_scope = $1`,
      [root.repositoryScope],
    )).rows;
    if (mapping.length !== 1) throw new Error(`SCOPE_MAPPING_NOT_UNIQUE:${root.repositoryScope}:${mapping.length}`);
    const repositoryId = mapping[0].repository_id;

    const execution = (await client.query(
      `SELECT e.status, e.canonical_authority, e.workspace_revision, a.execution_id::text AS owner_execution_id, a.authority_state
         FROM public.graphify_executions e
         LEFT JOIN public.graphify_execution_authority a ON a.workspace_id = e.workspace_id AND a.workspace_revision = e.workspace_revision
        WHERE e.execution_id = $1::uuid`,
      [root.executionId],
    )).rows[0];
    if (!execution || !isCanonicalGraphifyExecution(execution, root.workspaceRevision)
      || execution.owner_execution_id !== root.executionId || !['SELECTED', 'LEGACY_IMPORTED'].includes(execution.authority_state)) {
      throw new Error(`GRAPHIFY_EXECUTION_OWNER_NOT_PROVEN:${JSON.stringify(execution ?? null)}`);
    }

    // 2. Plan, re-deriving every key independently of the manifest.
    const plan = planAdmissionApply({
      entries: verified.entries, repositoryScope: root.repositoryScope, repositoryId, rootSha256: path.basename(manifestDir),
      deriveKey: (scope: string, sourceRef: string) => computePacketKeyV2({ repositoryScope: scope, sourceRef, packetKind: 'SOURCE_FILE' }),
    });
    if (plan.errors.length > 0) throw new Error(`PLAN_ERRORS:\n${plan.errors.slice(0, 50).join('\n')}`);

    // 3. Conflicts with existing rows: identical rows are skipped, anything different aborts.
    const existingRegistry = new Map<string, { repository_id: string; membership_repository_scope: string; source_ref: string }>();
    for (const rows of chunk(plan.registryRows)) {
      for (const row of (await client.query(
        `SELECT packet_key, repository_id::text AS repository_id, membership_repository_scope, source_ref FROM public.atlas_packet_identity_registry_v1 WHERE packet_key = ANY($1::text[])`,
        [rows.map((r) => r.packet_key)],
      )).rows) existingRegistry.set(row.packet_key, row);
    }
    const newRegistry = plan.registryRows.filter((row) => {
      const prior = existingRegistry.get(row.packet_key);
      if (!prior) return true;
      if (prior.repository_id !== row.repository_id || prior.membership_repository_scope !== row.membership_repository_scope || prior.source_ref !== row.source_ref) {
        throw new Error(`REGISTRY_ROW_CONFLICT:${row.packet_key}`);
      }
      return false;
    });
    const existingAliasKeys = new Set<string>();
    for (const rows of chunk(plan.aliasRows)) {
      for (const row of (await client.query(`SELECT alias_key, canonical_packet_key FROM public.atlas_packet_identity_aliases_v1 WHERE alias_key = ANY($1::text[])`, [rows.map((r) => r.alias_key)])).rows) {
        const wanted = plan.aliasRows.find((alias) => alias.alias_key === row.alias_key);
        if (wanted?.canonical_packet_key !== row.canonical_packet_key) throw new Error(`ALIAS_ROW_CONFLICT:${row.alias_key}`);
        existingAliasKeys.add(row.alias_key);
      }
    }
    const newAliases = plan.aliasRows.filter((row) => !existingAliasKeys.has(row.alias_key));

    // 4. Writes (the alias guard trigger re-checks source_ref equality per row).
    for (const rows of chunk(newRegistry)) {
      await client.query(
        `INSERT INTO public.atlas_packet_identity_registry_v1 (packet_key, repository_id, membership_repository_scope, source_ref, packet_kind)
         SELECT * FROM unnest($1::text[], $2::uuid[], $3::text[], $4::text[], $5::text[])`,
        [rows.map((r) => r.packet_key), rows.map((r) => r.repository_id), rows.map((r) => r.membership_repository_scope), rows.map((r) => r.source_ref), rows.map((r) => r.packet_kind)],
      );
    }
    for (const rows of chunk(newAliases)) {
      await client.query(
        `INSERT INTO public.atlas_packet_identity_aliases_v1 (alias_key, canonical_packet_key, storage_packet_key, alias_kind, evidence_ref, evidence_digest)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])`,
        [rows.map((r) => r.alias_key), rows.map((r) => r.canonical_packet_key), rows.map((r) => r.storage_packet_key), rows.map((r) => r.alias_kind), rows.map((r) => r.evidence_ref), rows.map((r) => r.evidence_digest)],
      );
    }

    // 5. Readback inside the transaction.
    const registryKeys = plan.registryRows.map((r) => r.packet_key);
    const aliasKeys = plan.aliasRows.map((r) => r.alias_key);
    const readback = (await client.query(
      `SELECT
         (SELECT count(*)::int FROM public.atlas_packet_identity_registry_v1 WHERE packet_key = ANY($1::text[])) AS registry_rows,
         (SELECT count(*)::int FROM public.atlas_packet_identity_aliases_v1 WHERE alias_key = ANY($2::text[])) AS alias_rows,
         (SELECT count(*)::int FROM public.atlas_packet_identity_aliases_v1 a
            JOIN public.atlas_packet_identity_registry_v1 r ON r.packet_key = a.canonical_packet_key
            JOIN public.atlas_packets p ON p.packet_key = a.storage_packet_key
           WHERE a.alias_key = ANY($2::text[]) AND r.source_ref = p.source_ref AND a.alias_key = a.storage_packet_key) AS alias_source_agreement`,
      [registryKeys, aliasKeys],
    )).rows[0];
    const expected = { registry_rows: plan.registryRows.length, alias_rows: plan.aliasRows.length, alias_source_agreement: plan.aliasRows.length };
    const readbackOk = readback.registry_rows === expected.registry_rows && readback.alias_rows === expected.alias_rows && readback.alias_source_agreement === expected.alias_source_agreement;
    Object.assign(report, {
      repositoryId, planned: { registry: plan.registryRows.length, aliases: plan.aliasRows.length }, inserted: { registry: newRegistry.length, aliases: newAliases.length },
      alreadyPresent: { registry: plan.registryRows.length - newRegistry.length, aliases: existingAliasKeys.size },
      skippedAliases: { noStoragePacket: plan.skipped.noStoragePacket, storageIsCanonical: plan.skipped.storageIsCanonical, ambiguousStorage: plan.skipped.ambiguousStorage.length, ambiguousStorageSample: plan.skipped.ambiguousStorage.slice(0, 20) },
      readbackInTransaction: readback, readbackExpected: expected, readbackVerified: readbackOk,
    });
    if (!readbackOk) throw new Error(`ADMISSION_APPLY_READBACK_MISMATCH:${JSON.stringify({ readback, expected })}`);

    if (MODE === 'APPLY') {
      await client.query('COMMIT');
      committed = true;
      report.writesPerformed = true;
      report.appliedBy = arg('--applied-by');
      report.applyReceipt = arg('--apply-receipt');
    } else {
      await client.query('ROLLBACK');
    }
  } catch (error) {
    if (!committed) await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  // 6. Independent post-transaction check (fresh connection from the pool).
  const registryKeys = verified.entries.map((e: { packetKeyV2: string }) => e.packetKeyV2);
  const after = (await pool.query(`SELECT count(*)::int AS n FROM public.atlas_packet_identity_registry_v1 WHERE packet_key = ANY($1::text[])`, [registryKeys])).rows[0].n;
  report.registryRowsForManifestAfter = after;
  report.postCheck = MODE === 'APPLY'
    ? (after === verified.entries.length ? 'COMMITTED_ROWS_PRESENT' : 'COMMITTED_ROW_COUNT_MISMATCH')
    : (after === 0 ? 'ROLLED_BACK_NO_RESIDUE' : 'ROLLBACK_LEFT_ROWS_OR_PRIOR_ROWS_EXIST');
} finally {
  await pool.end();
}

const outDir = path.join(REPO_ROOT, '.tmp/atlas');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `packet-key-v2-admission-apply-${MODE === 'APPLY' ? 'apply' : 'rehearsal'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ mode: MODE, writesPerformed: report.writesPerformed, planned: report.planned, inserted: report.inserted, skippedAliases: (report.skippedAliases as { noStoragePacket: number; storageIsCanonical: number; ambiguousStorage: number }), readbackVerified: report.readbackVerified, postCheck: report.postCheck, report: path.relative(REPO_ROOT, outPath).replaceAll('\\', '/') }, null, 2));
