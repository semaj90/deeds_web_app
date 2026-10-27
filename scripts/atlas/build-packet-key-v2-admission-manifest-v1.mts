#!/usr/bin/env node
/**
 * PACKET_KEY_V2 admission target manifest (read-only; no INSERT/UPDATE/DDL).
 *
 * Derives a NEW manifest from the frozen keyless source-evidence manifest (which is never modified),
 * adds repository scope + PacketKeyV2, and classifies every entry against live state.
 *
 * Run from sveltekit-frontend/:  npx tsx ../scripts/atlas/build-packet-key-v2-admission-manifest-v1.mts \
 *   --admission-root <sha256> --repository-scope repo:root
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { canonicalJson, sha256Of, CHECKSUM_RECIPE } from './lib/packet-source-revision-repair-v1.mjs';
import { classifyV2AdmissionLiveState, isCanonicalGraphifyExecution } from './lib/packet-key-v2-admission-v1.mjs';
import { classifyGraphifyMembershipScopeV1 } from './lib/graphify-scope-admission-v1.mjs';
import { computePacketKeyV2, PacketKeyV2InputError, PACKET_KEY_V2_PATTERN } from '../../sveltekit-frontend/src/lib/server/atlas/identity/packet-key-v2';
import { legacyPacketKeyV1, PacketAliasConflictError, assignLegacyAliasV2, legacyAliasPairV2 } from '../../sveltekit-frontend/src/lib/server/atlas/identity/packet-key-legacy-alias-v1';

const arg = (name: string): string | null => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const admissionRoot = arg('--admission-root');
const repositoryScope = arg('--repository-scope');
const outputRootArg = arg('--output-root');
if (!/^[0-9a-f]{64}$/.test(admissionRoot ?? '')) throw new Error('EXPLICIT_ADMISSION_ROOT_SHA256_REQUIRED');
if (!/^repo:.+$/.test(repositoryScope ?? '')) throw new Error('EXPLICIT_MEMBERSHIP_REPOSITORY_SCOPE_REQUIRED');

const reports = path.join(REPO_ROOT, 'docs/reports');
const diagnosticRoot = path.resolve(REPO_ROOT, '.tmp/atlas');
const outputRoot = outputRootArg ? path.resolve(REPO_ROOT, outputRootArg) : reports;
if (outputRootArg) {
  const relative = path.relative(diagnosticRoot, outputRoot);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('OUTPUT_ROOT_MUST_REMAIN_UNDER_TMP_ATLAS');
}
const sourceDir = path.join(reports, 'packet-admission-v1', admissionRoot!);
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sourceRoot = readJson(path.join(sourceDir, 'root.json'));

// 1. Frozen source manifest integrity (never modified here).
interface SourceEntry { sourceRef: string; sourceRevision: string; membershipCodeSourceRevision: string; workspaceRevision: string; bindingChecksum: string; contentDigest: string }
const sourceEntries: SourceEntry[] = [];
for (const shard of sourceRoot.shards) {
  const body = readJson(path.join(sourceDir, shard.name));
  if (sha256Of(body) !== shard.sha256) throw new Error(`SOURCE_SHARD_CHECKSUM_MISMATCH:${shard.name}`);
  sourceEntries.push(...(body.entries ?? body));
}
if (sourceEntries.length !== sourceRoot.entryCount) throw new Error('SOURCE_ENTRY_COUNT_MISMATCH');
const { executionId, workspaceRevision } = sourceRoot;

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 120000 });
const client = await pool.connect();
const rejections: Array<{ sourceRef: string; code: string; detail: string }> = [];
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const refs = sourceEntries.map((e) => e.sourceRef);
  const executionRows = (await client.query(
    `SELECT status, canonical_authority, workspace_revision::text AS workspace_revision
       FROM public.graphify_executions
      WHERE execution_id = $1::uuid AND workspace_revision::text = $2`,
    [executionId, workspaceRevision],
  )).rows;
  const canonicalExecution = executionRows.length === 1
    && isCanonicalGraphifyExecution(executionRows[0], workspaceRevision);

  // 2. Membership must agree with the frozen entry and supply exactly one repository scope.
  const membership = await client.query(
    `SELECT source_ref, repository_id AS membership_repository_scope, lower(code_source_revision::text) AS code_source_revision
       FROM public.graphify_execution_file_membership_v2
      WHERE execution_id = $1::uuid AND workspace_revision::text = $2 AND source_ref = ANY($3::text[])`,
    [executionId, workspaceRevision, refs],
  );
  const membershipByRef = new Map<string, Array<{ membership_repository_scope: string; code_source_revision: string }>>();
  for (const row of membership.rows) {
    const list = membershipByRef.get(row.source_ref) ?? [];
    list.push(row);
    membershipByRef.set(row.source_ref, list);
  }
  const scopeMapPresent = (await client.query(`SELECT to_regclass('public.atlas_graphify_scope_repository_map_v1') IS NOT NULL AS present`)).rows[0].present === true;
  const scopeMappings = scopeMapPresent
    ? (await client.query(
      `SELECT m.membership_repository_scope, m.repository_id::text AS repository_id,
              m.source_authority_repo_id, m.mapping_kind,
              r.source_authority_repo_id AS persisted_source_authority_repo_id,
              r.repository_kind, r.parent_repository_id::text AS parent_repository_id
         FROM public.atlas_graphify_scope_repository_map_v1 m
         JOIN public.atlas_repository_identity r ON r.repository_id = m.repository_id
        WHERE m.membership_repository_scope = $1`,
      [repositoryScope],
    )).rows
    : [];
  const scopeMapping = scopeMappings.length === 1 ? scopeMappings[0] : null;

  // 3. Existing packets for the same source_ref; existing keys/aliases that would collide with a legacy key.
  const existingBySourceRef = new Map<string, string[]>();
  for (const row of (await client.query(`SELECT source_ref, packet_key FROM public.atlas_packets WHERE source_ref = ANY($1::text[])`, [refs])).rows) {
    existingBySourceRef.set(row.source_ref, [...(existingBySourceRef.get(row.source_ref) ?? []), row.packet_key]);
  }
  const v2Keys = refs.flatMap((ref) => { try { return [computePacketKeyV2({ repositoryScope: repositoryScope!, sourceRef: ref, packetKind: 'SOURCE_FILE' })]; } catch { return []; } });
  const storedV2 = new Map<string, string>();
  const storedRepositoryByV2 = new Map<string, string>();
  const aliasByV2 = new Map<string, string[]>();
  const legacyKeys = refs.map(legacyPacketKeyV1);
  const storedLegacy = new Map<string, string>();
  for (const row of (await client.query(`SELECT packet_key, source_ref FROM public.atlas_packets WHERE packet_key = ANY($1::text[])`, [legacyKeys])).rows) storedLegacy.set(row.packet_key, row.source_ref);
  const existingAliases = new Map<string, string>();
  const relationState = (await client.query(`
    SELECT to_regclass('public.atlas_packet_identity_registry_v1') IS NOT NULL AS registry_present,
           to_regclass('public.atlas_packet_identity_aliases_v1') IS NOT NULL AS aliases_present,
           to_regclass('public.atlas_graphify_scope_repository_map_v1') IS NOT NULL AS scope_map_present
  `)).rows[0];
  const registryPresent = relationState.registry_present === true;
  const aliasesPresent = relationState.aliases_present === true;
  const persistedScopeMapPresent = relationState.scope_map_present === true;
  let registryConstraints: string[] = [];
  let aliasConstraints: string[] = [];
  let scopeMapConstraints: string[] = [];
  let aliasIntegrityTriggerApplied = false;
  let scopeMapGuardApplied = false;
  if (registryPresent) {
    for (const row of (await client.query(`SELECT packet_key, source_ref, repository_id::text AS repository_id FROM public.atlas_packet_identity_registry_v1 WHERE packet_key = ANY($1::text[])`, [v2Keys])).rows) {
      storedV2.set(row.packet_key, row.source_ref);
      storedRepositoryByV2.set(row.packet_key, row.repository_id);
    }
    registryConstraints = (await client.query(`SELECT conname FROM pg_constraint WHERE conrelid = 'public.atlas_packet_identity_registry_v1'::regclass ORDER BY conname`)).rows.map((row) => row.conname);
  }
  if (aliasesPresent) {
    for (const row of (await client.query(`SELECT alias_key, canonical_packet_key FROM public.atlas_packet_identity_aliases_v1 WHERE canonical_packet_key = ANY($1::text[]) AND alias_kind = 'PACKET_KEY_V1_STORAGE_TO_V2'`, [v2Keys])).rows) aliasByV2.set(row.canonical_packet_key, [...(aliasByV2.get(row.canonical_packet_key) ?? []), row.alias_key]);
    for (const row of (await client.query(`SELECT alias_key, canonical_packet_key FROM public.atlas_packet_identity_aliases_v1 WHERE alias_key = ANY($1::text[])`, [legacyKeys])).rows) existingAliases.set(row.alias_key, row.canonical_packet_key);
    aliasConstraints = (await client.query(`SELECT conname FROM pg_constraint WHERE conrelid = 'public.atlas_packet_identity_aliases_v1'::regclass ORDER BY conname`)).rows.map((row) => row.conname);
    aliasIntegrityTriggerApplied = (await client.query(`
      SELECT 1
        FROM pg_trigger t
        JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE t.tgname = 'trg_atlas_packet_identity_aliases_v1_guard'
         AND t.tgrelid = 'public.atlas_packet_identity_aliases_v1'::regclass
         AND NOT t.tgisinternal AND t.tgenabled <> 'D'
         AND p.proname = 'atlas_packet_identity_aliases_v1_guard_fn'
    `)).rowCount === 1;
  }
  if (persistedScopeMapPresent) {
    scopeMapConstraints = (await client.query(`SELECT conname FROM pg_constraint WHERE conrelid = 'public.atlas_graphify_scope_repository_map_v1'::regclass ORDER BY conname`)).rows.map((row) => row.conname);
    scopeMapGuardApplied = (await client.query(`
      SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE t.tgname = 'trg_atlas_graphify_scope_repository_map_v1_guard'
         AND t.tgrelid = 'public.atlas_graphify_scope_repository_map_v1'::regclass
         AND NOT t.tgisinternal AND t.tgenabled <> 'D'
         AND p.proname = 'atlas_graphify_scope_repository_map_v1_guard_fn'
    `)).rowCount === 1;
  }
  const registryContractApplied = registryPresent && aliasesPresent && persistedScopeMapPresent
    && registryConstraints.includes('atlas_packet_identity_registry_v1_scope_repository_fk')
    && scopeMapConstraints.includes('atlas_graphify_scope_repository_map_v1_pkey')
    && scopeMapConstraints.includes('atlas_graphify_scope_repository_map_v1_repository_id_fkey')
    && scopeMapConstraints.includes('atlas_graphify_scope_repository_map_v1_root_scope_kind_check')
    && scopeMapConstraints.includes('atlas_graphify_scope_repository_map_v1_scope_repository_key')
    && scopeMapGuardApplied
    && registryConstraints.includes('atlas_packet_identity_registry_v1_pkey')
    && registryConstraints.includes('atlas_packet_identity_registry_v1_repository_source_kind_key')
    && registryConstraints.includes('atlas_packet_identity_registry_v1_scope_source_kind_key')
    && aliasConstraints.includes('atlas_packet_identity_aliases_v1_pkey')
    && aliasConstraints.includes('atlas_packet_identity_aliases_v1_canonical_packet_key_fkey')
    && aliasConstraints.includes('atlas_packet_identity_aliases_v1_storage_packet_key_fkey')
    && aliasConstraints.includes('atlas_packet_identity_aliases_v1_storage_locator_check')
    && aliasIntegrityTriggerApplied;

  // 4. Registry-v1 infrastructure facts (structure only).
  const fkRows = registryPresent && aliasesPresent
    ? (await client.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.atlas_packet_identity_aliases_v1'::regclass AND contype = 'f'`)).rows
    : [];
  const aliasPkRows = registryPresent && aliasesPresent
    ? (await client.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.atlas_packet_identity_aliases_v1'::regclass AND contype = 'p'`)).rows
    : [];
  const packetsTotal = (await client.query(`SELECT count(*)::integer AS n FROM public.atlas_packets`)).rows[0].n;
  const packetsWithV2 = registryPresent
    ? (await client.query(`SELECT count(*)::integer AS n FROM public.atlas_packet_identity_registry_v1 WHERE packet_key ~ '^packet:[0-9a-f]{8}-[0-9a-f]{4}-5'`)).rows[0].n
    : 0;
  await client.query('ROLLBACK');

  // 5. Build entries.
  const classes: Record<string, number> = { ADMISSION_READY: 0, PACKET_NOW_EXISTS_VIA_V2: 0, PACKET_NOW_EXISTS_VIA_LEGACY_ALIAS: 0, PACKET_KEY_CANONICAL_COLLISION: 0, IDENTITY_CONFLICT: 0, GRAPHIFY_EXECUTION_NOT_CANONICAL: 0 };
  const seenKeys = new Map<string, string>();
  const entries = sourceEntries.map((source) => {
    const reject = (code: string, detail: string) => { rejections.push({ sourceRef: source.sourceRef, code, detail }); classes.IDENTITY_CONFLICT += 1; return null; };
    if (!canonicalExecution) {
      rejections.push({ sourceRef: source.sourceRef, code: 'GRAPHIFY_EXECUTION_NOT_CANONICAL', detail: executionRows.length === 1 ? `${executionRows[0].status}/${executionRows[0].canonical_authority}` : `execution_rows=${executionRows.length}` });
      classes.GRAPHIFY_EXECUTION_NOT_CANONICAL += 1;
      return { source, out: null };
    }
    const members = membershipByRef.get(source.sourceRef) ?? [];
    const membershipScope = classifyGraphifyMembershipScopeV1({ membershipRows: members, repositoryScope: repositoryScope!, scopeMapPresent, scopeMappings });
    if (!membershipScope.ok) return { source, out: reject(membershipScope.code, `scope=${repositoryScope}; membership_rows=${members.length}; map_rows=${scopeMappings.length}`) };
    if (members[0].code_source_revision !== source.membershipCodeSourceRevision || source.sourceRevision !== source.membershipCodeSourceRevision) return { source, out: reject('SOURCE_REVISION_MISMATCH', source.sourceRef) };
    let packetKeyV2: string;
    try { packetKeyV2 = computePacketKeyV2({ repositoryScope: repositoryScope!, sourceRef: source.sourceRef, packetKind: 'SOURCE_FILE' }); }
    catch (error) { return { source, out: reject(error instanceof PacketKeyV2InputError ? error.code : 'KEY_DERIVATION_FAILED', String(error)) }; }
    if (!PACKET_KEY_V2_PATTERN.test(packetKeyV2)) return { source, out: reject('KEY_SHAPE_INVALID', packetKeyV2) };
    const prior = seenKeys.get(packetKeyV2);
    if (prior !== undefined) { rejections.push({ sourceRef: source.sourceRef, code: 'PACKET_KEY_CANONICAL_COLLISION', detail: `${prior} vs ${source.sourceRef}` }); classes.PACKET_KEY_CANONICAL_COLLISION += 1; return { source, out: null }; }
    seenKeys.set(packetKeyV2, source.sourceRef);

    const legacyKey = legacyPacketKeyV1(source.sourceRef);
    const legacyStoredFor = storedLegacy.get(legacyKey) ?? null;
    const v2StoredFor = storedV2.get(packetKeyV2) ?? null;
    if (v2StoredFor !== null && storedRepositoryByV2.get(packetKeyV2) !== scopeMapping.repository_id) {
      return { source, out: reject('CANONICAL_REPOSITORY_ID_MISMATCH', `stored=${storedRepositoryByV2.get(packetKeyV2)} mapped=${scopeMapping.repository_id}`) };
    }
    const existing = existingBySourceRef.get(source.sourceRef) ?? [];
    const aliasedStorage = aliasByV2.get(packetKeyV2) ?? [];
    try { assignLegacyAliasV2(existingAliases, legacyAliasPairV2(source.sourceRef, packetKeyV2)); }
    catch (error) { return { source, out: reject(error instanceof PacketAliasConflictError ? error.code : 'ALIAS_CONFLICT', String(error)) }; }
    const verdict = classifyV2AdmissionLiveState({ sourceRef: source.sourceRef, packetKeyV2, legacyKey, live: { v2StoredFor, aliasedStorageKeys: aliasedStorage, existingStorageKeys: existing, legacyStoredFor } });
    if (verdict.status === 'PACKET_KEY_CANONICAL_COLLISION' || verdict.status === 'IDENTITY_CONFLICT') {
      rejections.push({ sourceRef: source.sourceRef, code: verdict.code ?? verdict.status, detail: verdict.detail ?? '' });
      classes[verdict.status] += 1;
      return { source, out: null };
    }
    const status = verdict.status;
    classes[status] += 1;
    return {
      source,
      out: {
        repositoryScope, canonicalSourceRef: source.sourceRef, sourceRevision: source.sourceRevision, packetKind: 'SOURCE_FILE', packetKeyV2,
        workspaceRevision, executionId, lineageBindingChecksum: source.bindingChecksum, sourceEvidenceChecksum: sha256Of(source),
        legacyCompatibilityKey: { key: legacyKey, canonical: false, storedInAtlasPackets: legacyStoredFor !== null, existingAliasTarget: existingAliases.get(legacyKey) ?? null },
        storageDisposition: { physicalRowExists: existing.length > 0 || v2StoredFor !== null, existingStorageKeys: existing, aliasRecorded: aliasedStorage.length > 0, willStoreAs: status === 'ADMISSION_READY' ? packetKeyV2 : null },
        status,
      },
    };
  });

  const built = entries.flatMap((item) => (item.out ? [item.out] : [])).sort((a, b) => a.packetKeyV2.localeCompare(b.packetKeyV2));
  const failClosed = classes.IDENTITY_CONFLICT + classes.PACKET_KEY_CANONICAL_COLLISION + classes.GRAPHIFY_EXECUTION_NOT_CANONICAL > 0;
  const shards: Array<{ name: string; sha256: string; entryCount: number }> = [];
  const shardBodies: Array<{ name: string; body: unknown }> = [];
  const SHARD_SIZE = 2000;
  for (let i = 0; i < built.length; i += SHARD_SIZE) {
    const body = { schema: 'atlas.packet-key-v2-admission-shard.v1', entries: built.slice(i, i + SHARD_SIZE) };
    const name = `shard-${String(i / SHARD_SIZE).padStart(4, '0')}.json`;
    shards.push({ name, sha256: sha256Of(body), entryCount: body.entries.length });
    shardBodies.push({ name, body });
  }
  const aliasFk = fkRows.map((row) => row.def);
  const registryMigrationRequired = !registryContractApplied;
  const rootBody = {
    schema: 'atlas.packet-key-v2-admission-manifest.v1', checksumRecipe: CHECKSUM_RECIPE,
    packetKeyRecipe: 'PACKET_KEY_V2_UUIDV5_REPOSITORY_SCOPED_SOURCE_FILE', writesAuthorized: false,
    sourceEvidence: { manifest: 'atlas.packet-admission-manifest.v1', rootSha256: admissionRoot, entryCount: sourceRoot.entryCount, modified: false, graphifyExecutionCanonical: canonicalExecution },
    repositoryScope, executionId, workspaceRevision, entryCount: built.length, shards,
    accounting: { sourceEntries: sourceEntries.length, accountedEntries: built.length + rejections.length, classes, rejections: rejections.length, uniquePacketKeysV2: seenKeys.size },
  };
  const rootSha = sha256Of(rootBody);
  const outDir = path.join(outputRoot, 'packet-key-v2-admission-v1', rootSha);
  fs.mkdirSync(outDir, { recursive: true });
  for (const { name, body } of shardBodies) fs.writeFileSync(path.join(outDir, name), `${canonicalJson(body)}\n`, 'utf8');
  fs.writeFileSync(path.join(outDir, 'root.json'), `${canonicalJson(rootBody)}\n`, 'utf8');
  if (rejections.length) fs.writeFileSync(path.join(outDir, 'rejections.json'), `${JSON.stringify(rejections, null, 1)}\n`, 'utf8');

  const gate = classes.GRAPHIFY_EXECUTION_NOT_CANONICAL > 0 ? 'GRAPHIFY_EXECUTION_NOT_CANONICAL'
    : failClosed ? 'FAIL_CLOSED_IDENTITY_CONFLICT_OR_CANONICAL_COLLISION'
    : registryMigrationRequired ? 'PACKET_IDENTITY_REGISTRY_V1_DDL_REQUIRED' : 'PACKET_KEY_CANONICAL_OWNER_PROVEN';
  const receipt = {
    schema: 'atlas.packet-key-v2-admission-gate.v1', mode: 'READ_ONLY', writesPerformed: false, generatedAt: new Date().toISOString(),
    gate, nextGate: gate === 'PACKET_KEY_CANONICAL_OWNER_PROVEN' ? 'PACKET_ADMISSION_APPLY_AUTHORIZATION_REQUIRED' : gate === 'PACKET_IDENTITY_REGISTRY_V1_DDL_REQUIRED' ? 'REGISTRY_V1_SCHEMA_REVIEW_AND_AUTHORIZATION' : gate === 'GRAPHIFY_EXECUTION_NOT_CANONICAL' ? 'EXPLICIT_GRAPHIFY_EXECUTION_OWNER_DECISION' : 'STOP_AT_GATE',
    manifest: { path: path.relative(REPO_ROOT, path.join(outDir, 'root.json')).replaceAll('\\', '/'), rootSha256: rootSha, entryCount: built.length, accounting: rootBody.accounting },
    aliasInfrastructure: {
      primaryKey: aliasPkRows.map((row) => row.def), foreignKeys: aliasFk,
      oneLegacyKeyToAtMostOneCanonical: aliasPkRows.some((row) => /PRIMARY KEY \(alias_key\)/.test(row.def)),
      canonicalMustBeRegistryRow: aliasFk.some((def) => /REFERENCES atlas_packet_identity_registry_v1\(packet_key\)/.test(def)),
      registryPresent, aliasesPresent, registryConstraints, aliasConstraints, aliasIntegrityTriggerApplied,
      atlasPacketsTotal: packetsTotal, registryEntriesWithV2Key: packetsWithV2,
      finding: !registryPresent || !aliasesPresent
        ? 'The selected registry-v1 and alias-v1 relations are absent; the legacy alias migration is not a substitute.'
        : !registryContractApplied
          ? 'Registry-v1 relations exist, but required uniqueness, storage-locator, or source-identity guard proof is missing.'
          : 'Registry-v1 identity and storage-locator structures are present; exact cohort evidence and independent readback remain required.',
    },
    aliasModel: { kind: 'PACKET_KEY_V1_STORAGE_TO_V2', ddl: 'sveltekit-frontend/drizzle/manual/20261020_atlas_packet_identity_registry_v1_DRAFT.sql', ddlApplied: registryContractApplied, canonicalOwner: 'atlas_packet_identity_registry_v1', aliasOwner: 'atlas_packet_identity_aliases_v1', legacyPopulationCensus: 'docs/reports/packet-key-v2-legacy-population-census-v1.json' },
    fixedContracts: { dynamicMintFromSourceRef: false, legacyKeyCanonical: false },
    rejections: rejections.slice(0, 50),
  };
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(outputRoot, 'packet-key-v2-admission-gate-v1.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ gate, nextGate: receipt.nextGate, rootSha256: rootSha, accounting: rootBody.accounting, alias: receipt.aliasInfrastructure }, null, 2));
} finally {
  client.release();
  await pool.end();
}
