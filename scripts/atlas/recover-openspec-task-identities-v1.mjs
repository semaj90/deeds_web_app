import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const REPORTS = path.join(ROOT, 'docs', 'reports');
const OUTPUT_PATH = process.env.OPENSPEC_IDENTITY_RECOVERY_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_IDENTITY_RECOVERY_OUTPUT)
  : path.join(REPORTS, 'openspec-task-identity-recovery-v1.json');

const LEGACY_ID_RE = /\b(?:[A-Z]{2,}[A-Z0-9]*(?:[-_.][A-Z0-9]+)+|\d+(?:\.\d+)+[a-z]?)\b/g;
const LABELED_ID_RE = /\b(?:migration[_ -]?key|legacy(?:[_ -]?id|[_ -]?key)?|gate(?:[_ -]?id)?|requirement(?:[_ -]?id)?|phase(?:[_ -]?task)?(?:[_ -]?label)?)\s*[:=]\s*[`*]*([A-Za-z][A-Za-z0-9._-]*|\d+(?:\.\d+)+[a-z]?)/gi;
const STOP_IDS = new Set(['MD', 'API', 'HTTP', 'JSON', 'SQL', 'UUID', 'GPU', 'CPU', 'MCP', 'NLP', 'RRF', 'ACE', 'EVF']);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function latestCensusPath() {
  if (!process.env.OPENSPEC_CENSUS_PATH) throw new Error('OPENSPEC_CENSUS_PATH_REQUIRED');
  return path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH);
}

function normalize(value) {
  return String(value ?? '').replace(/[`*_()[\]{}:,;]/g, ' ').replace(/\s+/g, ' ').trim();
}

function scopedKey(task, key) {
  return `openspec://${task.authorityScope.replace(/^openspec:\/\//, '')}/${task.changeId}/${key}`;
}

function extractLegacyCandidates(task) {
  const taskText = normalize(task.taskText);
  const candidates = new Map();
  const add = (value, basis, sourceSpan) => {
    const normalized = String(value ?? '').trim().replace(/[`*_.,;:)]+$/g, '');
    if (!normalized || STOP_IDS.has(normalized.toUpperCase()) || normalized === task.taskId) return;
    if (!/[0-9]/.test(normalized)) return;
    const key = normalized.toUpperCase();
    candidates.set(key, { value: normalized, basis, sourceSpan });
  };
  const leading = taskText.match(/^(?:[`*]+)?([A-Z]{2,}[A-Z0-9]*(?:[-_.][A-Z0-9]+)+|\d+(?:\.\d+)+[a-z]?)(?:[`*]+)?(?:\s|$)/);
  if (leading) add(leading[1], 'LEADING_LEGACY_LABEL', `taskText#1-${leading[0].length}`);
  const labeled = [...taskText.matchAll(LABELED_ID_RE)];
  for (const match of labeled) add(match[1], 'EXPLICIT_LEGACY_FIELD', `taskText#${match.index + 1}-${match.index + match[0].length}`);
  if (!leading && !labeled.length) {
    const prefix = taskText.slice(0, 180);
    for (const match of prefix.matchAll(LEGACY_ID_RE)) {
      const value = match[0];
      if (/^(?:20|19)\d{2}(?:[-.]\d+)*$/.test(value)) continue;
      add(value, 'PREFIX_LEGACY_TOKEN', `taskText#${match.index + 1}-${match.index + value.length}`);
    }
  }
  return [...candidates.values()].sort((left, right) => left.value.localeCompare(right.value));
}

function recoveredDeclaredIdentity(task, recoveryBySourceRef) {
  return recoveryBySourceRef.get(task.taskRef) ?? null;
}

function buildDeclaredIdRecoveries(tasks) {
  const groups = groupBy(
    tasks.filter((task) => task.taskIdentity?.declaredTaskId),
    (task) => `${task.authorityScope}\0${task.changeId}\0${task.taskIdentity.declaredTaskId}`,
  );
  const recoveries = new Map();
  for (const group of groups.values()) {
    if (group.length === 1) {
      const task = group[0];
      const declaredId = task.taskIdentity.declaredTaskId;
      if (task.taskIdentity.logicalTaskKey === `${task.changeId}:${declaredId}`) {
        recoveries.set(task.taskRef, { identityKey: declaredId, recoveryBasis: 'UNIQUE_DECLARED_LOGICAL_KEY' });
      }
      continue;
    }
    const sectionSlugs = group.map((task) => task.taskIdentity?.sectionSlug).filter(Boolean);
    const sectionsAreUnique = sectionSlugs.length === group.length && new Set(sectionSlugs).size === group.length;
    const migrationKeys = group.map((task) => task.taskIdentity?.migrationKey ?? '');
    const migrationHashes = migrationKeys.map((key) => key.match(/^.+#([a-f0-9]{16})$/)?.[1] ?? null);
    const migrationKeysAreUnique = migrationHashes.every(Boolean) && new Set(migrationHashes).size === group.length;
    if (!sectionsAreUnique && !migrationKeysAreUnique) continue;
    for (let index = 0; index < group.length; index += 1) {
      const task = group[index];
      const claimHash = task.taskIdentity?.normalizedClaimHash?.replace(/^sha256:/, '') ?? null;
      const suffix = sectionsAreUnique
        ? `section-${task.taskIdentity.sectionSlug}-${claimHash ?? 'claim-hash-missing'}`
        : `migration-${migrationHashes[index]}`;
      recoveries.set(task.taskRef, {
        identityKey: `legacy-${task.taskIdentity.declaredTaskId}-${suffix}`,
        recoveryBasis: sectionsAreUnique ? 'DECLARED_ID_SECTION_QUALIFIED' : 'UNIQUE_MIGRATION_KEY',
      });
    }
  }
  return recoveries;
}

function buildSectionQualifiedDerivedKeys(tasks) {
  const groups = groupBy(
    tasks.filter((task) => task.taskIdentity?.derivedTaskKey),
    (task) => `${task.authorityScope}\0${task.changeId}\0${task.taskIdentity.derivedTaskKey}`,
  );
  const keys = new Map();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const tasksBySection = groupBy(group.filter((task) => task.taskIdentity?.sectionSlug), (task) => task.taskIdentity.sectionSlug);
    for (const [sectionSlug, sectionTasks] of tasksBySection) {
      if (sectionTasks.length === 1) {
        const task = sectionTasks[0];
        const claimHash = task.taskIdentity.normalizedClaimHash ?? task.taskIdentity.derivedTaskKey;
        const keyHash = checksum(`${task.authorityScope}\0${task.changeId}\0${sectionSlug}\0${claimHash}`).slice(7);
        keys.set(task.taskRef, `section-${sectionSlug}-${keyHash}`);
        continue;
      }
      const blockHashes = sectionTasks.map((task) => {
        const block = String(task.dependencySourceText ?? task.taskText ?? '')
          .replace(/^\s*[-*]\s+\[[ xX]\]\s+/m, '')
          .replace(/<!--\s*wfu:[\s\S]*?-->/gi, '')
          .replace(/[\t ]+/g, ' ')
          .replace(/\r?\n\s*/g, '\n')
          .trim()
          .toLowerCase();
        return block ? checksum(block) : null;
      });
      if (blockHashes.some((hash) => !hash) || new Set(blockHashes).size !== sectionTasks.length) continue;
      for (let index = 0; index < sectionTasks.length; index += 1) {
        const task = sectionTasks[index];
        const claimHash = task.taskIdentity.normalizedClaimHash ?? task.taskIdentity.derivedTaskKey;
        const keyHash = checksum(`${task.authorityScope}\0${task.changeId}\0${sectionSlug}\0${claimHash}\0${blockHashes[index]}`).slice(7);
        keys.set(task.taskRef, `section-${sectionSlug}-${keyHash}`);
      }
    }
  }
  return keys;
}

function buildMapping(task, recoveryBySourceRef, sectionQualifiedKeys) {
  const declaredId = task.taskId ?? task.taskIdentity?.declaredTaskId ?? null;
  const derivedStableKey = task.taskIdentity?.derivedTaskKey ?? null;
  const sectionQualifiedKey = sectionQualifiedKeys.get(task.taskRef) ?? null;
  const migrationKey = task.taskIdentity?.migrationKey ?? null;
  const declaredRecovery = recoveredDeclaredIdentity(task, recoveryBySourceRef);
  const candidates = extractLegacyCandidates(task);
  let identityState;
  let identityKey;
  if (declaredId && (task.taskIdentity?.identityState !== 'AMBIGUOUS' || declaredRecovery?.recoveryBasis === 'UNIQUE_DECLARED_LOGICAL_KEY')) {
    identityState = 'DECLARED_ID';
    identityKey = declaredId;
  } else if (declaredId && declaredRecovery) {
    identityState = 'LEGACY_ID_RECOVERED';
    identityKey = declaredRecovery.identityKey;
  } else if (declaredId) {
    identityState = 'CONFLICTING';
    identityKey = declaredId;
  } else if (candidates.length === 1 && ['LEADING_LEGACY_LABEL', 'EXPLICIT_LEGACY_FIELD'].includes(candidates[0].basis)) {
    identityState = 'LEGACY_ID_RECOVERED';
    identityKey = candidates[0].value;
  } else if (candidates.length > 1 && candidates.some((candidate) => ['LEADING_LEGACY_LABEL', 'EXPLICIT_LEGACY_FIELD'].includes(candidate.basis))) {
    identityState = sectionQualifiedKey ? 'DERIVED_STABLE_KEY' : 'AMBIGUOUS';
    identityKey = sectionQualifiedKey ?? derivedStableKey;
  } else if (sectionQualifiedKey) {
    identityState = 'DERIVED_STABLE_KEY';
    identityKey = sectionQualifiedKey;
  } else {
    identityState = 'DERIVED_STABLE_KEY';
    identityKey = derivedStableKey;
  }
  return {
    sourceRef: task.taskRef,
    declaredId,
    declaredIdConflict: Boolean(declaredId && task.taskIdentity?.resolverBasis === 'AMBIGUOUS_DECLARED_ID'),
    sourceIdentityState: task.taskIdentity?.identityState ?? null,
    recoveryBasis: declaredRecovery?.recoveryBasis ?? null,
    sectionSlug: task.taskIdentity?.sectionSlug ?? null,
    sectionQualifiedKey,
    migrationKey,
    legacyCandidates: candidates,
    canonicalTaskKey: identityKey ? scopedKey(task, identityKey) : null,
    derivedStableKey: derivedStableKey ? scopedKey(task, derivedStableKey) : null,
    aliasProposals: identityKey && derivedStableKey && identityKey !== derivedStableKey
      ? [{ aliasKey: scopedKey(task, derivedStableKey), aliasKind: 'DERIVED_KEY', disposition: 'PROPOSAL_ONLY' }]
      : [],
    authorityScope: task.authorityScope,
    changeId: task.changeId,
    archived: Boolean(task.archived),
    normalizedClaimHash: task.taskIdentity?.normalizedClaimHash ?? null,
    sourceRevision: task.taskHash,
    identityState,
    canonicalKeyAdmitted: false,
    canonicalKeyCollision: false,
  };
}

function classifyCollisionGroup(group) {
  const scopes = new Set(group.map((mapping) => mapping.authorityScope));
  const changes = new Set(group.map((mapping) => mapping.changeId));
  const declaredIds = group.map((mapping) => mapping.declaredId).filter(Boolean);
  const allDeclaredSame = declaredIds.length === group.length && new Set(declaredIds).size === 1;
  const allClaimsSame = group.every((mapping) => mapping.normalizedClaimHash && mapping.normalizedClaimHash === group[0].normalizedClaimHash);
  if (scopes.size > 1) return 'NAMESPACE_COLLISION';
  if (group.some((mapping) => mapping.archived)) return 'ARCHIVE_DUPLICATE';
  if (changes.size > 1) return allDeclaredSame ? 'DUPLICATE_DECLARED_ID_CROSS_CHANGE' : 'DUPLICATE_NORMALIZED_CLAIM_CROSS_CHANGE';
  if (allDeclaredSame) return 'DUPLICATE_DECLARED_ID_SAME_CHANGE';
  if (allClaimsSame) return 'DUPLICATE_NORMALIZED_CLAIM_SAME_CHANGE';
  return 'CANONICAL_KEY_COLLISION';
}

function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function groupedDuplicateDiagnostics(tasks) {
  const diagnostics = [];
  const add = (groups, classification, include = () => true) => {
    for (const [groupKey, group] of groups) {
      if (group.length < 2 || !include(group)) continue;
      const selected = group;
      diagnostics.push({
        classification,
        groupKey,
        count: selected.length,
        sourceRefs: selected.map((task) => task.taskRef).sort(),
        authorityScopes: [...new Set(selected.map((task) => task.authorityScope))].sort(),
        changeIds: [...new Set(selected.map((task) => task.changeId))].sort(),
      });
    }
  };
  const declared = tasks.filter((task) => task.taskIdentity?.declaredTaskId);
  add(groupBy(declared, (task) => `${task.authorityScope}\0${task.changeId}\0${task.taskIdentity.declaredTaskId}`), 'DUPLICATE_DECLARED_ID_SAME_CHANGE');
  add(groupBy(declared, (task) => `${task.authorityScope}\0${task.taskIdentity.declaredTaskId}`), 'DUPLICATE_DECLARED_ID_CROSS_CHANGE', (group) => new Set(group.map((task) => task.changeId)).size > 1);
  add(groupBy(declared, (task) => task.taskIdentity.declaredTaskId), 'NAMESPACE_COLLISION', (group) => new Set(group.map((task) => task.authorityScope)).size > 1);
  add(groupBy(tasks, (task) => `${task.authorityScope}\0${task.changeId}\0${task.taskIdentity?.normalizedClaimHash}`), 'DUPLICATE_NORMALIZED_CLAIM_SAME_CHANGE');
  add(groupBy(tasks, (task) => `${task.authorityScope}\0${task.taskIdentity?.normalizedClaimHash}`), 'DUPLICATE_NORMALIZED_CLAIM_CROSS_CHANGE', (group) => new Set(group.map((task) => task.changeId)).size > 1);
  add(groupBy(tasks, (task) => `${task.authorityScope}\0${task.taskIdentity?.derivedTaskKey}`), 'DUPLICATE_DERIVED_KEY');
  add(groupBy(tasks, (task) => `${task.authorityScope}\0${task.taskIdentity?.normalizedClaimHash}`), 'ARCHIVE_DUPLICATE', (group) => new Set(group.map((task) => task.archived)).size > 1);
  add(groupBy(tasks, (task) => `${task.changeId}\0${task.taskIdentity?.declaredTaskId ?? ''}\0${task.taskIdentity?.normalizedClaimHash}`), 'MIRROR_DUPLICATE', (group) => new Set(group.map((task) => task.authorityScope)).size > 1 && group.every((task) => task.taskIdentity?.declaredTaskId));
  return diagnostics;
}

export function recoverOpenSpecTaskIdentitiesV1(census) {
  if (census?.schema !== 'atlas.openspec-evidence-portfolio-census.v2') throw new Error('CENSUS_SCHEMA_UNSUPPORTED');
  const recoveryBySourceRef = buildDeclaredIdRecoveries(census.tasks ?? []);
  const sectionQualifiedKeys = buildSectionQualifiedDerivedKeys(census.tasks ?? []);
  const mappings = (census.tasks ?? []).map((task) => buildMapping(task, recoveryBySourceRef, sectionQualifiedKeys));
  const duplicateDiagnostics = groupedDuplicateDiagnostics(census.tasks ?? []);
  const duplicateClassCounts = Object.fromEntries([...new Set(duplicateDiagnostics.map((diagnostic) => diagnostic.classification))].sort().map((classification) => [classification, duplicateDiagnostics.filter((diagnostic) => diagnostic.classification === classification).length]));
  const groups = new Map();
  for (const mapping of mappings) {
    if (!mapping.canonicalTaskKey) continue;
    groups.set(mapping.canonicalTaskKey, [...(groups.get(mapping.canonicalTaskKey) ?? []), mapping]);
  }
  let collisionGroupCount = 0;
  let collisionTaskCount = 0;
  const collisionClassCounts = {};
  const collisionClasses = new Map();
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const classification = classifyCollisionGroup(group);
    collisionClassCounts[classification] = (collisionClassCounts[classification] ?? 0) + 1;
    collisionClasses.set(group[0].canonicalTaskKey, classification);
    collisionGroupCount += 1;
    collisionTaskCount += group.length;
    for (const mapping of group) {
      mapping.canonicalKeyCollision = true;
      mapping.canonicalKeyAdmitted = false;
      if (mapping.identityState === 'DECLARED_ID' || mapping.identityState === 'LEGACY_ID_RECOVERED' || mapping.identityState === 'DERIVED_STABLE_KEY') mapping.identityState = 'CONFLICTING';
    }
  }
  for (const mapping of mappings) {
    mapping.canonicalKeyAdmitted = Boolean(mapping.canonicalTaskKey)
      && !mapping.canonicalKeyCollision
      && ['DECLARED_ID', 'LEGACY_ID_RECOVERED', 'DERIVED_STABLE_KEY'].includes(mapping.identityState);
  }
  const counts = Object.fromEntries([...new Set(mappings.map((mapping) => mapping.identityState))].sort().map((state) => [state, mappings.filter((mapping) => mapping.identityState === state).length]));
  const unsigned = {
    schema: 'atlas.openspec-task-identity-recovery.v1',
    runId: process.env.OPENSPEC_EVIDENCE_RUN_ID ?? census.runId ?? null,
    milestone: 'EVF-03A',
    mode: 'READ_ONLY_IDENTITY_RECOVERY',
    status: collisionGroupCount === 0 && mappings.every((mapping) => mapping.canonicalKeyAdmitted) ? 'TASK_IDENTITY_COVERAGE_PASS' : 'TASK_IDENTITY_COVERAGE_NOT_PROVEN',
    source: {
      census: process.env.OPENSPEC_CENSUS_PATH ? relative(path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH)) : 'latest-run-census-v1.json',
      workspaceRevision: census.source?.workspaceRevision ?? null,
      authority: 'scripts/atlas/audit-openspec-evidence-fabric-v1.mjs + scripts/atlas/lib/wfu-metadata.mjs',
    },
    summary: {
      taskCount: mappings.length,
      identityStateCounts: counts,
      canonicalKeyCoverageCount: mappings.filter((mapping) => mapping.canonicalTaskKey).length,
      canonicalKeyAdmittedCount: mappings.filter((mapping) => mapping.canonicalKeyAdmitted).length,
      canonicalKeyCollisionGroupCount: collisionGroupCount,
      canonicalKeyCollisionTaskCount: collisionTaskCount,
      collisionClassCounts,
      duplicateDiagnosticGroupCount: duplicateDiagnostics.length,
      duplicateClassCounts,
      sourceFilesMutated: false,
      taskLedgerWrites: 0,
    },
    mappings,
    aliasProposals: mappings.flatMap((mapping) => mapping.aliasProposals.map((proposal) => ({
      ...proposal,
      canonicalTaskKey: mapping.canonicalTaskKey,
      sourceRef: mapping.sourceRef,
      authorityScope: mapping.authorityScope,
      changeId: mapping.changeId,
    }))),
    collisionSamples: [...groups.entries()].filter(([, group]) => group.length > 1).slice(0, 100).map(([canonicalTaskKey, group]) => ({ canonicalTaskKey, classification: collisionClasses.get(canonicalTaskKey) ?? 'CANONICAL_KEY_COLLISION', sourceRefs: group.map((mapping) => mapping.sourceRef) })),
    duplicateDiagnostics: duplicateDiagnostics.slice(0, 200),
    invariants: [
      'Declared IDs are preserved and never rewritten.',
      'Legacy IDs are recovered only from deterministic labeled or leading forms; incidental prose tokens remain diagnostic candidates.',
      'Duplicate declared IDs are identity-recovered only through unique section slugs or unique content migration keys; declared-ID receipt matching remains ambiguous.',
      'Derived stable keys are content-bound and remain non-authoritative when collisions exist.',
      'Ambiguous and conflicting identities cannot establish proof or authorize mutation.',
    ],
    likely_cause: 'Historical tasks mix declared IDs, legacy labels, repeated claims, and unlabeled rows; identity recovery must separate recoverable aliases from ambiguous collisions.',
    evidence: [process.env.OPENSPEC_CENSUS_PATH ? relative(path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH)) : 'latest-run-census-v1.json'],
    patch_targets: ['scripts/atlas/recover-openspec-task-identities-v1.mjs', 'scripts/atlas/audit-openspec-evidence-fabric-v1.mjs', 'scripts/atlas/lib/wfu-metadata.mjs'],
    safe_next_command: 'node scripts/atlas/recover-openspec-task-identities-v1.mjs',
    smoke_command: 'node --check scripts/atlas/recover-openspec-task-identities-v1.mjs',
    report_path: relative(OUTPUT_PATH),
  };
  return { ...unsigned, checksum: checksum(unsigned) };
}

function main() {
  const censusPath = latestCensusPath();
  const census = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  const report = recoverOpenSpecTaskIdentitiesV1(census);
  report.source.census = relative(censusPath);
  report.evidence = [relative(censusPath)];
  const { checksum: _checksum, ...unsigned } = report;
  report.checksum = checksum(unsigned);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, summary: report.summary, output: OUTPUT_PATH }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
