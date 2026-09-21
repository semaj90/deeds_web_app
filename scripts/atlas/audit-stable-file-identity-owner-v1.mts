#!/usr/bin/env node
/**
 * S01-08 — stable file identity owner audit (08A candidate census, 08B semantics, 08C nested-repository namespaces, 08D writer census, final verdict).
 * READ-ONLY: one REPEATABLE READ READ ONLY transaction (SELECTs) + a static source scan. It judges EXISTING candidates through the pure
 * predicates in stable-file-id-owner-audit-v1.ts. It creates no identity, generator, namespace, table, column or row, and repairs nothing.
 * Receipts are versioned by checksum (never overwritten). Each pointer file is refused if it is not ours.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { classifyCensusCandidateV1, evaluateStableFileIdOwnerV1, type CensusFactsV1 } from '../../sveltekit-frontend/src/lib/server/atlas/identity/stable-file-id-owner-audit-v1.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXECUTION_ID = '74d50c86-8194-45ea-8c3d-61aab737ef83';
const CENSUS_SCHEMA = 'atlas.stable-file-identity-candidate-census.v1';
const OWNER_SCHEMA = 'atlas.stable-file-identity-owner.v1';
const digest = (v: string | Buffer) => `sha256:${createHash('sha256').update(v).digest('hex')}`;
const rel = (f: string) => relative(ROOT, f).split('\\').join('/');
const readJson = (p: string) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
function emit(name: string, schema: string, body: object) {
  const pointer = resolve(ROOT, `docs/reports/${name}.json`);
  if (existsSync(pointer) && JSON.parse(readFileSync(pointer, 'utf8')).schema !== schema) throw new Error(`POINTER_PATH_OWNED_BY_ANOTHER_ARTIFACT ${name}`);
  const receiptChecksum = digest(JSON.stringify(body));
  const versioned = resolve(ROOT, `docs/reports/${name}.${receiptChecksum.slice(7, 19)}.json`);
  const receipt = { ...body, receiptChecksum };
  if (!existsSync(versioned)) writeFileSync(versioned, `${JSON.stringify(receipt, null, 2)}\n`);
  writeFileSync(pointer, `${JSON.stringify({ ...receipt, versionedReceipt: rel(versioned) }, null, 2)}\n`);
  return { pointer: rel(pointer), versioned: rel(versioned), receiptChecksum };
}

// ---- static scan ----
const walk = (dir: string, out: string[] = []) => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.svelte-kit' || name.startsWith('.tmp') || name === 'archive') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out); else if (/\.(mts|mjs|ts|sql)$/.test(name) && !/\.(spec|test)\./.test(name)) out.push(full);
  }
  return out;
};
const files = ['scripts', 'sveltekit-frontend/src', 'sveltekit-frontend/scripts/atlas', 'sveltekit-frontend/drizzle'].flatMap((d) => walk(resolve(ROOT, d)));
const text = new Map(files.map((f) => [rel(f), readFileSync(f, 'utf8')]));
const OWN = new Set(['scripts/atlas/audit-stable-file-identity-owner-v1.mts', 'sveltekit-frontend/src/lib/server/atlas/identity/stable-file-id-owner-audit-v1.ts', 'sveltekit-frontend/src/lib/server/atlas/identity/current-source-authority-v1.ts']);
const grep = (re: RegExp, exclude = OWN) => [...text].filter(([f, t]) => !exclude.has(f) && re.test(t)).map(([f]) => f);
const writersOf = (table: string) => grep(new RegExp(`(INSERT\\s+INTO|UPDATE)\\s+(public\\.)?${table}\\b`, 'i'));
const readersOf = (table: string, column: string) => grep(new RegExp(`\\b${table}\\b[\\s\\S]{0,400}\\b${column}\\b|\\b${column}\\b[\\s\\S]{0,400}\\b${table}\\b`, 'i')).filter((f) => !writersOf(table).includes(f));
const stableFileIdMentions = grep(/stableFileId|stable_file_id/);
const backfillPath = 'sveltekit-frontend/scripts/atlas/backfill-unified-id-hierarchy.mjs';
const backfillSrc = text.get(backfillPath) ?? '';
const packetFileIdRandom = /file_id:\s*randomUUID\(\)/.test(backfillSrc);
const backfillSaysRandomForNow = /using random for now/.test(backfillSrc);
const repoMappingConstants = grep(/REPO_ID\s*=\s*'deeds-web-app'/).filter((f) => /repo:root/.test(text.get(f) ?? ''));
const snapshotRel = `docs/reports/workspace-source-snapshots/${String(readJson('docs/reports/workspace-revision-tournament-admission-v1.json').snapshotRevision).replace(/^sha256:/, '')}.json`;
const snapshot = readJson(snapshotRel);

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
const client = await pool.connect();
await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
try {
  const one = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows[0];
  const many = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows;
  const col = async (table: string, column: string) => (await one(`SELECT data_type, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`, [table, column])) ?? { data_type: null, column_default: null };
  const constraints = async (table: string) => (await many(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = ('public.' || $1)::regclass AND contype IN ('p','u','f')`, [table])).map((r: any) => r.def as string);

  const workspaceRevision: string = readJson('docs/reports/workspace-revision-tournament-admission-v1.json').workspaceRevision;
  const admittedCount = (await one(`SELECT count(*)::int AS n FROM public.graphify_execution_file_membership_v2 WHERE execution_id = $1::uuid`, [EXECUTION_ID])).n;

  // graphify_files.file_id
  const gfSurv = await one(`SELECT count(*)::int AS observed, count(*) FILTER (WHERE n_ids = 1)::int AS preserved FROM (SELECT count(DISTINCT coalesce(code_source_revision, source_revision)) n_rev, count(DISTINCT file_id) n_ids FROM public.graphify_files GROUP BY source_ref HAVING count(DISTINCT coalesce(code_source_revision, source_revision)) > 1) x`);
  const gfIdsShared = (await one(`SELECT count(*)::int AS n FROM (SELECT file_id FROM public.graphify_files GROUP BY 1 HAVING count(DISTINCT source_ref) > 1) x`)).n;
  const gfStats = await one(`SELECT count(*)::int AS rows, count(DISTINCT file_id)::int AS ids, count(DISTINCT source_ref)::int AS refs FROM public.graphify_files`);
  const gsFk = (await constraints('graphify_symbols')).filter((d) => /file_id/.test(d) && /FOREIGN KEY/.test(d));

  // atlas_packets.file_id
  const pk = await one(`SELECT count(*)::int AS rows, count(file_id)::int AS populated, count(DISTINCT file_id)::int AS ids, count(DISTINCT source_ref) FILTER (WHERE file_id IS NOT NULL)::int AS refs FROM public.atlas_packets`);
  const pkOverlapGf = (await one(`SELECT count(*)::int AS n FROM public.atlas_packets p JOIN public.graphify_files g ON g.file_id = p.file_id`)).n;
  const pkFk = (await constraints('atlas_packets')).filter((d) => /file_id/.test(d) && /FOREIGN KEY/.test(d));
  const hier = await one(`SELECT count(*)::int AS rows, count(DISTINCT file_id)::int AS ids FROM public.atlas_id_hierarchy_metadata`);
  const hierUnique = (await constraints('atlas_id_hierarchy_metadata')).filter((d) => /UNIQUE/.test(d));

  // registry
  const srStats = await one(`SELECT count(*)::int AS rows, count(*) FILTER (WHERE source_ref_key = relative_path)::int AS file_level, count(*) FILTER (WHERE source_ref_key = relative_path OR starts_with(source_ref_key, relative_path || '#'))::int AS path_keyed, count(*) FILTER (WHERE effective_from IS NOT NULL OR effective_to IS NOT NULL)::int AS lifecycle_populated FROM public.atlas_source_refs`);
  const srRepos = await many(`SELECT repo_id, count(*)::int AS n FROM public.atlas_source_refs GROUP BY 1`);
  const bdRepos = await many(`SELECT repo_id, count(*)::int AS n FROM public.atlas_workspace_source_bindings GROUP BY 1`);
  const bdMultiRev = await one(`SELECT count(*)::int AS observed FROM (SELECT canonical_source_ref FROM public.atlas_workspace_source_bindings GROUP BY repo_id, canonical_source_ref HAVING count(DISTINCT source_revision) > 1) x`);
  const aliasRows = (await one(`SELECT count(*)::int AS n FROM public.atlas_source_aliases`)).n;
  const decisionKinds = (await one(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.atlas_identity_alias_decisions'::regclass AND conname = 'atlas_identity_alias_decisions_entity_kind_check'`)).def as string;
  const decisionRows = (await one(`SELECT count(*)::int AS n FROM public.atlas_identity_alias_decisions`)).n;

  // ---------- 08A candidate census ----------
  type Cand = { facts: CensusFactsV1; record: Record<string, unknown> };
  const mk = async (name: string, table: string, column: string, facts: Omit<CensusFactsV1, 'name'>, extra: Record<string, unknown>): Promise<Cand> => {
    const c = await col(table, column);
    const w = writersOf(table);
    return {
      facts: { name, ...facts },
      record: { candidateName: name, tableOrOwner: table, column, type: c.data_type, defaultOrGenerator: c.column_default, writerPaths: w, uniquenessConstraints: await constraints(table).catch(() => []), currentLiveReadersStaticCount: readersOf(table, column).length, currentLiveWritersStatic: w, note: 'reader/writer lists are a static source scan, not a live-caller proof', ...extra },
    };
  };
  const cands: Cand[] = [
    await mk('graphify_files.file_id', 'graphify_files', 'file_id',
      { opaque: true, derivedFrom: null, pathDerived: false, ephemeralRandom: false, packetLocal: false, projectionId: false, revisionSurvival: { observedLogicalFiles: gfSurv.observed, idPreserved: gfSurv.preserved }, moveSurvival: { mechanismAvailable: false, observedVerifiedMoves: 0, idPreserved: 0 } },
      { repositoryScope: 'none (workspace-scoped rows)', workspaceScope: 'workspace_id column', revisionScope: 'one row per (source_ref, revision, run): id is regenerated when the source revision changes', pathDependent: false, contentDependent: false, survivesMultipleSourceRevisions: false, aliasMoveSupport: false, evidence: { rows: gfStats.rows, distinctFileIds: gfStats.ids, distinctSourceRefs: gfStats.refs, logicalFilesWithMultipleRevisions: gfSurv.observed, ofWhichIdPreserved: gfSurv.preserved, fileIdsSharedByMultipleSourceRefs: gfIdsShared, referencedByForeignKeys: gsFk } }),
    await mk('graphify_symbols.file_id', 'graphify_symbols', 'file_id',
      { opaque: true, derivedFrom: null, pathDerived: false, ephemeralRandom: false, packetLocal: false, projectionId: false, revisionSurvival: { observedLogicalFiles: gfSurv.observed, idPreserved: gfSurv.preserved }, moveSurvival: null },
      { repositoryScope: 'none', workspaceScope: 'inherited from graphify_files', revisionScope: 'references the per-revision graphify_files row', pathDependent: false, contentDependent: false, survivesMultipleSourceRevisions: false, aliasMoveSupport: false, evidence: { foreignKeys: gsFk, inheritsFrom: 'graphify_files.file_id' } }),
    await mk('atlas_packets.file_id', 'atlas_packets', 'file_id',
      { opaque: true, derivedFrom: null, pathDerived: false, ephemeralRandom: packetFileIdRandom, packetLocal: packetFileIdRandom, projectionId: false, revisionSurvival: null, moveSurvival: null },
      { repositoryScope: 'none', workspaceScope: 'none', revisionScope: 'no history: one current row per source_ref', pathDependent: false, contentDependent: false, survivesMultipleSourceRevisions: null, aliasMoveSupport: false, evidence: { rows: pk.rows, populated: pk.populated, distinctFileIds: pk.ids, distinctSourceRefs: pk.refs, foreignKeysOnFileId: pkFk, overlapWithGraphifyFilesFileId: pkOverlapGf, mirrorTable: { name: 'atlas_id_hierarchy_metadata', rows: hier.rows, distinctFileIds: hier.ids, uniqueConstraints: hierUnique }, assignedByRandomUuidBackfill: packetFileIdRandom, backfillSourceSaysRandomForNow: backfillSaysRandomForNow, backfillScript: backfillPath, namespaceVerdict: pkOverlapGf === 0 && pkFk.length === 0 ? 'SEPARATE_NAMESPACE_NO_FK_NO_JOIN_TO_ANY_FILE_TABLE' : 'JOINS_PRESENT' } }),
    await mk('atlas_source_refs.source_ref_key', 'atlas_source_refs', 'source_ref_key',
      { opaque: false, derivedFrom: 'PATH', pathDerived: true, ephemeralRandom: false, packetLocal: false, projectionId: false, revisionSurvival: null, moveSurvival: { mechanismAvailable: false, observedVerifiedMoves: 0, idPreserved: 0 } },
      { repositoryScope: 'repo_id (one value in use: deeds-web-app)', workspaceScope: 'none', revisionScope: 'one row per key; content_hash updated in place', pathDependent: true, contentDependent: false, survivesMultipleSourceRevisions: 'constant only because the key IS the path', aliasMoveSupport: false, evidence: { rows: srStats.rows, fileLevelKeysEqualToPath: srStats.file_level, keysPathOrPathFragment: srStats.path_keyed, lifecycleColumnsPopulated: srStats.lifecycle_populated } }),
    await mk('atlas_workspace_source_bindings.canonical_source_ref', 'atlas_workspace_source_bindings', 'canonical_source_ref',
      { opaque: false, derivedFrom: 'PATH', pathDerived: true, ephemeralRandom: false, packetLocal: false, projectionId: false, revisionSurvival: null, moveSurvival: { mechanismAvailable: false, observedVerifiedMoves: 0, idPreserved: 0 } },
      { repositoryScope: 'repo_id', workspaceScope: 'workspace_revision (part of PK)', revisionScope: 'one row per (repo, workspace_revision, path)', pathDependent: true, contentDependent: false, survivesMultipleSourceRevisions: 'constant only because the key IS the path', aliasMoveSupport: false, evidence: { multiRevisionKeysObserved: bdMultiRev.observed, foreignKeyTo: 'atlas_source_refs(repo_id, source_ref_key)' } }),
    await mk('atlas_source_aliases (source identity columns)', 'atlas_source_aliases', 'canonical_source_ref',
      { opaque: false, derivedFrom: 'PATH', pathDerived: true, ephemeralRandom: false, packetLocal: false, projectionId: false, revisionSurvival: null, moveSurvival: { mechanismAvailable: true, observedVerifiedMoves: 0, idPreserved: 0 } },
      { repositoryScope: 'repo_id', workspaceScope: 'none', revisionScope: 'effective_from/effective_to', pathDependent: true, contentDependent: false, survivesMultipleSourceRevisions: null, aliasMoveSupport: 'schema only; 0 rows and no writer', evidence: { rows: aliasRows } }),
    {
      facts: { name: 'sourceIdentityKey (repository_id:repository_relative_path)', opaque: false, derivedFrom: 'PATH', pathDerived: true, ephemeralRandom: false, packetLocal: false, projectionId: false, revisionSurvival: null, moveSurvival: null },
      record: { candidateName: 'sourceIdentityKey (repository_id:repository_relative_path)', tableOrOwner: 'sveltekit-frontend/src/lib/server/atlas/identity/graphify-input-identity.ts', column: 'sourceIdentityKey', type: 'text (computed)', defaultOrGenerator: 'concatenation of repository_id and repository_relative_path', writerPaths: [], uniquenessConstraints: [], repositoryScope: 'repository_id is part of the key', workspaceScope: 'none', revisionScope: 'none', pathDependent: true, contentDependent: false, survivesMultipleSourceRevisions: 'constant only because the key IS the path', aliasMoveSupport: false, note: 'This is the selection identity for GraphifyInputIdentityV1, deliberately not a stable file identity.' },
    },
  ];
  const census = cands.map((c) => ({ ...c.record, ...classifyCensusCandidateV1(c.facts), classification: classifyCensusCandidateV1(c.facts).cls }));
  const qualified = census.filter((c) => c.classification === 'QUALIFIED_CANDIDATE');
  const evaluation = evaluateStableFileIdOwnerV1(cands.map((c) => c.facts));
  const safety = { databaseWrites: 0, registryWrites: 0, schemaChanges: 0, graphifyRun: false, readerCutover: false, inputIdentityBackfill: false, vectorWrites: 0, graphWrites: 0, cacheWrites: 0, newIdentityNamespaceCreated: false, idGeneratorAdded: false, transaction: 'REPEATABLE READ READ ONLY, ROLLBACK' };
  const generatedAt = new Date().toISOString();
  const censusReceipt = emit('stable-file-identity-candidate-census-v1', CENSUS_SCHEMA, {
    schema: CENSUS_SCHEMA, gate: 'S01-08A', generatedAt, prerequisite: 'S01-07 CURRENT_SOURCE_AUTHORITY_PROVEN', admittedSourceCount: admittedCount, workspaceRevision,
    stableFileIdMentionsOutsideThisGate: stableFileIdMentions,
    classificationCounts: Object.fromEntries([...new Set(census.map((c) => c.classification))].map((k) => [k, census.filter((c) => c.classification === k).length])),
    qualifiedCandidateCount: qualified.length, stopReason: qualified.length === 0 ? 'NO_QUALIFIED_CANDIDATE_EXISTS' : null,
    candidates: census, safety,
  });

  // ---------- 08B semantics (best-positioned registry candidate: atlas_source_refs path key) ----------
  const semantics08B = {
    candidate: 'atlas_source_refs.source_ref_key (+ atlas_workspace_source_bindings)',
    REVISION_STABILITY: { state: 'PROVEN', detail: `${bdMultiRev.observed} logical sources have multiple known revisions in the bindings and their key is constant across them`, caveat: 'constant only because the key IS the path; this does not make it a stable file identity' },
    PATH_ALIAS_STABILITY: { state: 'BLOCKED_NO_EVIDENCE', detail: `atlas_source_aliases has ${aliasRows} rows and no writer; atlas_identity_alias_decisions has ${decisionRows} rows and its entity_kind constraint is ${decisionKinds.replace(/^CHECK /, '')}`, caveat: 'absence of move evidence is not proof of move survival' },
    PATH_REUSE_SAFETY: { state: 'VIOLATED', detail: `identity is the path, so a deleted and recreated path inherits it; effective_from/effective_to populated on ${srStats.lifecycle_populated} of ${srStats.rows} rows (no lifecycle identity)`, caveat: 'structural, not observed reuse' },
    REPOSITORY_SCOPE: { state: 'BLOCKED_NO_EVIDENCE', detail: `registry repo_id values in use: ${srRepos.map((r: any) => r.repo_id).join(', ')} (one); identical relative paths in a second repository cannot be shown to resolve to different identities`, caveat: 'Graphify keys include repository_id, the registry does not carry the nested repositories at all' },
    ID_ASSIGNED_ONCE_OR_REGENERATED: { state: 'PROVEN', detail: 'no opaque id exists in these tables; the key is deterministic from the path' },
    CONTENT_HASH_SEPARATE: { state: 'PROVEN', detail: 'content_hash (registry) and source_revision/content_digest (bindings) are separate columns' },
    CURRENT_PATH_SEPARATE: { state: 'VIOLATED', detail: 'the key and the current path are the same string for file-level rows' },
  };

  // ---------- 08C nested repositories ----------
  const membership = await many(`SELECT repository_id, count(*)::int AS sources FROM public.graphify_execution_file_membership_v2 WHERE execution_id = $1::uuid GROUP BY 1 ORDER BY 2 DESC`, [EXECUTION_ID]);
  const snapshotRepos: any[] = snapshot.repositories ?? [];
  const repositories = [];
  for (const m of membership) {
    const isRoot = m.repository_id === 'repo:root';
    const byRoot = (await one(`SELECT count(*)::int AS n FROM public.graphify_execution_file_membership_v2 f WHERE f.execution_id = $1::uuid AND f.repository_id = $2 AND EXISTS (SELECT 1 FROM public.atlas_source_refs r WHERE r.relative_path = f.source_ref)`, [EXECUTION_ID, m.repository_id])).n;
    const byInner = (await one(`SELECT count(*)::int AS n FROM public.graphify_execution_file_membership_v2 f WHERE f.execution_id = $1::uuid AND f.repository_id = $2 AND EXISTS (SELECT 1 FROM public.atlas_source_refs r WHERE r.relative_path = f.repository_relative_path)`, [EXECUTION_ID, m.repository_id])).n;
    const bindings = (await one(`SELECT count(*)::int AS n FROM public.graphify_execution_file_membership_v2 f WHERE f.execution_id = $1::uuid AND f.repository_id = $2 AND EXISTS (SELECT 1 FROM public.atlas_workspace_source_bindings b WHERE b.canonical_source_ref = f.source_ref AND b.workspace_revision = $3)`, [EXECUTION_ID, m.repository_id, workspaceRevision])).n;
    const snapRepo = snapshotRepos.find((r) => (r.relativePath === '' ? 'repo:root' : `repo:${r.relativePath}`) === m.repository_id);
    const registryRepoId = isRoot && srRepos.some((r: any) => r.repo_id === 'deeds-web-app') ? 'deeds-web-app' : null;
    repositories.push({
      graphifyRepositoryIdentity: m.repository_id, registryRepositoryIdentity: registryRepoId, sourceCount: m.sources,
      sourceRefsPresent: byRoot, workspaceBindingsPresent: bindings, aliasesPresent: 0,
      coincidentalInnerPathMatchesNotIdentityEvidence: isRoot ? null : byInner,
      repositoryMappingEvidence: {
        exactRegistryKey: registryRepoId !== null,
        persistedMapping: false,
        sourceArtifact: snapRepo ? { file: snapshotRel, kind: snapRepo.kind, relativePath: snapRepo.relativePath, head: snapRepo.head ?? null } : null,
        configurationOwner: isRoot ? { kind: 'HARDCODED_CONSTANT_IN_WRITERS', constant: "REPO_ID = 'deeds-web-app'", files: repoMappingConstants, scope: "writers filter repositoryId === 'repo:root' only" } : null,
        countOrPathInferenceOnly: isRoot ? byRoot === m.sources : byInner > 0,
        rule: 'equal counts, matching paths, common parent directory and repo:root ancestry are NOT accepted as repository identity proof',
      },
      namespaceStatus: !isRoot ? 'REGISTRY_IDENTITY_MISSING' : (bindings === m.sources && registryRepoId ? 'NAMESPACE_AMBIGUOUS' : 'REGISTRY_PRESENT_BINDING_MISSING'),
      namespaceStatusReason: !isRoot ? 'no registry repo_id exists for this repository and the registry writers are scoped to repo:root only' : 'the repo:root -> deeds-web-app link is a constant inside writer scripts, not a persisted mapping; sources are bound but the namespace is not proven by a persisted key',
    });
  }
  const nested = repositories.filter((r) => r.graphifyRepositoryIdentity !== 'repo:root');
  const root = repositories.find((r) => r.graphifyRepositoryIdentity === 'repo:root')!;

  // ---------- 08D writer census (reduced: no QUALIFIED_CANDIDATE, so no canonical creator can be required) ----------
  const writerCensus = {
    scope: 'Informational: no candidate is QUALIFIED, so the canonical-creator requirements cannot be applied. Static scan only; liveness of each writer is UNKNOWN.',
    graphify_files: { assignedBy: 'column default gen_random_uuid() on INSERT', writers: writersOf('graphify_files'), classification: 'UNKNOWN', note: 'a new row (new id) per source revision, so the id is regenerated during revision ingest' },
    atlas_packets_file_id: { assignedBy: `randomUUID() in ${backfillPath}`, writers: grep(/file_id/, new Set([...OWN])).filter((f) => f === backfillPath), classification: 'LEGACY_DUPLICATE', note: 'a second, unrelated random file_id namespace (0 overlap with graphify_files.file_id); the script itself says random is a placeholder' },
    atlas_source_refs: { writers: writersOf('atlas_source_refs'), classification: 'UNKNOWN', createsIdentity: 'path key (not opaque)' },
    atlas_workspace_source_bindings: { writers: writersOf('atlas_workspace_source_bindings'), classification: 'UNKNOWN', createsIdentity: 'path key + revision rows' },
    atlas_source_aliases: { writers: writersOf('atlas_source_aliases'), classification: 'DEAD_WRITER', note: 'no writer exists' },
    atlas_identity_alias_decisions: { writers: writersOf('atlas_identity_alias_decisions'), classification: 'UNKNOWN', entityKindConstraint: decisionKinds },
  };

  // ---------- final verdict ----------
  const result = qualified.length === 1 ? 'STABLE_FILE_ID_OWNER_PROVEN' : qualified.length > 1 ? 'STABLE_FILE_ID_OWNER_AMBIGUOUS' : 'STABLE_FILE_ID_OWNER_MISSING';
  const unprovenNamespaceSources = admittedCount; // root is constant-inferred, nested has no registry identity
  const ownerReceipt = emit('stable-file-identity-owner-v1', OWNER_SCHEMA, {
    schema: OWNER_SCHEMA, gate: 'S01-08', generatedAt, workspaceRevision, admittedSourceCount: admittedCount,
    candidateCensusRef: censusReceipt,
    candidateCensus: census.map((c: any) => ({ candidate: c.candidateName, verdict: c.classification, reasons: c.reasons })),
    writerCensus,
    coverage: { exactStableIdentity: 0, missingStableIdentity: admittedCount, ambiguousStableIdentity: 0, missingWorkspaceBinding: nested.reduce((a, r) => a + r.sourceCount - r.workspaceBindingsPresent, 0), repositoryNamespaceUnproven: unprovenNamespaceSources,
      note: 'No opaque logical-file identity exists for any admitted source. For repo:root the registry holds PATH-keyed file-level rows (24,456) but those are path identity. The 1,086 nested-repository sources have no registry identity at all (CASE 2), by writer scope.' },
    semantics: { revisionStable: 'ONLY_AS_A_PATH_KEY', moveStable: 'BLOCKED_NO_EVIDENCE', pathReuseSafe: false, repositoryScoped: 'BLOCKED_NO_EVIDENCE', pathIndependent: false, contentIndependent: true, detail: semantics08B },
    repositories: { root, nested },
    proof: { ownerUnique: false, fullCohortCoverage: false, revisionSemantics: false, aliasSemantics: false, repositoryNamespace: false, writerOwnership: false },
    result, owner: evaluation.owner,
    blockers: [
      'NO_CANDIDATE_SATISFIES_ALL_REQUIREMENTS',
      ...(stableFileIdMentions.length === 0 ? ['NO_PRODUCER_OR_CONSUMER_OF_stableFileId_IN_SCRIPTS_OR_SRC'] : []),
      `NESTED_REPOSITORIES_HAVE_NO_REGISTRY_IDENTITY:${nested.length}_repos_${nested.reduce((a, r) => a + r.sourceCount, 0)}_sources`,
      ...(aliasRows === 0 ? ['atlas_source_aliases_EMPTY_NO_WRITER'] : []),
      ...(!/'file'/.test(decisionKinds) ? ['atlas_identity_alias_decisions_entity_kind_EXCLUDES_file'] : []),
      ...(packetFileIdRandom ? ['atlas_packets.file_id_IS_A_RANDOM_PLACEHOLDER_NAMESPACE'] : []),
    ],
    decisionRequired: 'A file identity owner would be a NEW registry (registry/aliases/versions following the atlas_symbol_registry pattern, enabling entity_kind=file in the alias-decision ledger, and covering the nested repositories). That is a schema change and a new identity owner. It is not done here; no generator, namespace, table, column or row was added. It needs its own explicitly designed and authorized gate.',
    safety,
  });
  console.log(JSON.stringify({
    census: { classificationCounts: Object.fromEntries([...new Set(census.map((c: any) => c.classification))].map((k) => [k, census.filter((c: any) => c.classification === k).length])), qualified: qualified.length, receipt: censusReceipt.versioned },
    candidates: census.map((c: any) => [c.candidateName, c.classification, c.reasons.join('|')]),
    graphifyFiles: { rows: gfStats.rows, ids: gfStats.ids, refs: gfStats.refs, multiRevisionFiles: gfSurv.observed, idPreserved: gfSurv.preserved },
    packets: { populated: pk.populated, ids: pk.ids, overlapWithGraphifyFiles: pkOverlapGf, fks: pkFk, random: packetFileIdRandom },
    repositories: repositories.map((r: any) => [r.graphifyRepositoryIdentity, r.sourceCount, r.sourceRefsPresent, r.workspaceBindingsPresent, r.namespaceStatus]),
    result, blockers: (readJson(ownerReceipt.pointer) as any).blockers, ownerReceipt: ownerReceipt.versioned,
  }, null, 2));
} finally {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
