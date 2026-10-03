import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const identityPath = path.resolve(ROOT, process.env.OPENSPEC_IDENTITY_RECOVERY_PATH
  ?? 'docs/reports/openspec-task-identity-recovery-v1.json');
const previousStatePath = process.env.OPENSPEC_TASK_REVISION_STATE_PATH
  ? path.resolve(ROOT, process.env.OPENSPEC_TASK_REVISION_STATE_PATH)
  : null;
const outputPath = path.resolve(ROOT, process.env.OPENSPEC_TASK_REVISION_PLAN_OUTPUT
  ?? 'docs/reports/openspec-task-revision-sync-plan-v1.json');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function verifyChecksum(report) {
  if (!report || typeof report !== 'object' || typeof report.checksum !== 'string') return false;
  const { checksum: received, ...unsigned } = report;
  return checksum(unsigned) === received;
}

function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);
  return groups;
}

function identityKindOf(mapping) {
  if (mapping.identityKind) return mapping.identityKind;
  if (mapping.declaredId) return 'DECLARED_TASK_ID';
  const basis = mapping.recoveryBasis ?? mapping.legacyCandidates?.[0]?.basis ?? '';
  if (/MIGRATION/i.test(basis) || mapping.migrationKey) return 'MIGRATION_KEY';
  if (/GATE/i.test(basis)) return 'GATE_ID';
  if (/REQUIREMENT/i.test(basis)) return 'REQUIREMENT_ID';
  if (/ANCHOR/i.test(basis)) return 'STABLE_ANCHOR';
  return 'DERIVED';
}

export function planOpenSpecTaskRevisionSyncV1(identityReport, previousState = null) {
  const identityValid = identityReport?.schema === 'atlas.openspec-task-identity-recovery.v1'
    && Array.isArray(identityReport.mappings)
    && typeof identityReport.source?.workspaceRevision === 'string'
    && verifyChecksum(identityReport);
  const previousValid = previousState === null
    || (previousState?.schema === 'atlas.openspec-task-revision-state.v1'
      && Array.isArray(previousState.records)
      && Array.isArray(previousState.revisionHistory ?? [])
      && Array.isArray(previousState.aliases ?? [])
      && previousState.records.every((record) => typeof record.canonicalTaskKey === 'string'
        && record.canonicalTaskKey.length > 0
        && Number.isSafeInteger(record.taskRevision)
        && record.taskRevision > 0
        && typeof record.claimHash === 'string'
        && record.claimHash.length > 0)
      && verifyChecksum(previousState));
  const mappings = identityValid
    ? (identityReport.mappings ?? []).filter((mapping) => mapping.canonicalKeyAdmitted && mapping.canonicalTaskKey)
    : [];
  const previousRecords = previousValid ? (previousState?.records ?? []) : [];
  const currentGroups = groupBy(mappings, (mapping) => mapping.canonicalTaskKey);
  const previousGroups = groupBy(previousRecords, (record) => record.canonicalTaskKey);
  const rows = [];
  const blockedReasons = [];

  if (!identityValid) blockedReasons.push('IDENTITY_REPORT_SCHEMA_OR_CHECKSUM_INVALID');
  if (!previousValid) blockedReasons.push('PREVIOUS_STATE_SCHEMA_OR_CHECKSUM_INVALID');
  if (previousValid && [...previousGroups.values()].some((group) => group.length > 1)) blockedReasons.push('PREVIOUS_STATE_KEY_COLLISION');

  for (const [canonicalTaskKey, currentGroup] of currentGroups) {
    if (currentGroup.length !== 1) {
      rows.push({ canonicalTaskKey, disposition: 'CANONICAL_KEY_COLLISION', sourceRefs: currentGroup.map((mapping) => mapping.sourceRef) });
      blockedReasons.push('CANONICAL_KEY_COLLISION');
      continue;
    }
    const current = currentGroup[0];
    const oldGroup = previousGroups.get(canonicalTaskKey) ?? [];
    if (oldGroup.length > 1) {
      rows.push({ canonicalTaskKey, disposition: 'PREVIOUS_STATE_KEY_COLLISION', sourceRef: current.sourceRef });
      blockedReasons.push('PREVIOUS_STATE_KEY_COLLISION');
      continue;
    }
    const previous = oldGroup[0] ?? null;
    if (!previous) {
      const aliasCandidate = previousRecords.find((record) =>
        (current.aliasProposals ?? []).some((alias) => alias.aliasKey === record.canonicalTaskKey));
      if (aliasCandidate) {
        rows.push({
          canonicalTaskKey,
          previousCanonicalTaskKey: aliasCandidate.canonicalTaskKey,
          sourceRef: current.sourceRef,
          disposition: 'ALIAS_REVIEW_REQUIRED',
          reason: 'A derived identity may be becoming authored; preserve the old key only after explicit alias review.',
        });
        blockedReasons.push('ALIAS_REVIEW_REQUIRED');
        continue;
      }
      const derivedDriftCandidates = previousRecords.filter((record) =>
        record.identityKind === 'DERIVED'
        && identityKindOf(current) === 'DERIVED'
        && record.authorityScope === current.authorityScope
        && record.changeId === current.changeId
        && record.canonicalTaskKey !== canonicalTaskKey);
      rows.push({
        canonicalTaskKey,
        sourceRef: current.sourceRef,
        disposition: 'NEW_TASK_REVISION_1',
        taskRevision: 1,
        claimHash: current.normalizedClaimHash,
        identityKind: identityKindOf(current),
        authorityScope: current.authorityScope,
        changeId: current.changeId,
        possibleDerivedIdentityDrift: derivedDriftCandidates.length > 0,
        possiblePriorKeys: derivedDriftCandidates.map((record) => record.canonicalTaskKey),
      });
      if (derivedDriftCandidates.length) blockedReasons.push('DERIVED_IDENTITY_DRIFT_REVIEW_REQUIRED');
      continue;
    }

    if (!Number.isSafeInteger(previous.taskRevision) || previous.taskRevision < 1 || !previous.claimHash) {
      rows.push({ canonicalTaskKey, sourceRef: current.sourceRef, disposition: 'PREVIOUS_REVISION_RECORD_INVALID' });
      blockedReasons.push('PREVIOUS_REVISION_RECORD_INVALID');
      continue;
    }
    if (previous.claimHash === current.normalizedClaimHash) {
      rows.push({
        canonicalTaskKey,
        sourceRef: current.sourceRef,
        disposition: 'UNCHANGED_TOUCH_LAST_SEEN',
        taskRevision: previous.taskRevision,
        claimHash: current.normalizedClaimHash,
        identityKind: identityKindOf(current),
        authorityScope: current.authorityScope,
        changeId: current.changeId,
      });
    } else {
      rows.push({
        canonicalTaskKey,
        sourceRef: current.sourceRef,
        disposition: 'APPEND_CLAIM_REVISION',
        taskRevision: previous.taskRevision + 1,
        previousTaskRevision: previous.taskRevision,
        previousClaimHash: previous.claimHash,
        claimHash: current.normalizedClaimHash,
        identityKind: identityKindOf(current),
        authorityScope: current.authorityScope,
        changeId: current.changeId,
      });
    }
  }

  const observedKeys = new Set([...currentGroups.keys()]);
  const notObserved = previousRecords
    .filter((record) => !observedKeys.has(record.canonicalTaskKey))
    .map((record) => ({ canonicalTaskKey: record.canonicalTaskKey, taskRevision: record.taskRevision, disposition: 'NOT_OBSERVED_NO_LIFECYCLE_CHANGE' }));
  const counts = Object.fromEntries([...new Set(rows.map((row) => row.disposition))]
    .sort().map((disposition) => [disposition, rows.filter((row) => row.disposition === disposition).length]));
  const blocked = blockedReasons.length > 0;
  const currentRecords = rows
    .filter((row) => ['NEW_TASK_REVISION_1', 'UNCHANGED_TOUCH_LAST_SEEN', 'APPEND_CLAIM_REVISION'].includes(row.disposition))
    .map((row) => ({
      canonicalTaskKey: row.canonicalTaskKey,
      taskRevision: row.taskRevision,
      claimHash: row.claimHash,
      identityKind: row.identityKind,
      authorityScope: row.authorityScope,
      changeId: row.changeId,
      sourceRef: row.sourceRef,
    }));
  const nextRecordsByKey = new Map(currentRecords.map((record) => [record.canonicalTaskKey, record]));
  for (const record of notObserved) {
    const previous = previousRecords.find((item) => item.canonicalTaskKey === record.canonicalTaskKey);
    if (previous) nextRecordsByKey.set(record.canonicalTaskKey, previous);
  }
  const revisionHistory = [
    ...(previousState?.revisionHistory ?? []),
    ...rows.filter((row) => ['NEW_TASK_REVISION_1', 'APPEND_CLAIM_REVISION'].includes(row.disposition)).map((row) => ({
      canonicalTaskKey: row.canonicalTaskKey,
      taskRevision: row.taskRevision,
      claimHash: row.claimHash,
      sourceRef: row.sourceRef,
      workspaceRevision: identityReport.source?.workspaceRevision ?? null,
    })),
  ];
  const proposedNextStateUnsigned = {
    schema: 'atlas.openspec-task-revision-state.v1',
    workspaceRevision: identityReport?.source?.workspaceRevision ?? null,
    records: [...nextRecordsByKey.values()].sort((left, right) => left.canonicalTaskKey.localeCompare(right.canonicalTaskKey)),
    revisionHistory,
    aliases: previousState?.aliases ?? [],
  };
  const proposedNextState = !blocked ? { ...proposedNextStateUnsigned, checksum: checksum(proposedNextStateUnsigned) } : null;
  const unsigned = {
    schema: 'atlas.openspec-task-revision-sync-plan.v1',
    mode: 'READ_ONLY_DRY_RUN',
    status: blocked ? 'REVISION_SYNC_REVIEW_REQUIRED' : previousState ? 'REVISION_SYNC_PLAN_READY' : 'BOOTSTRAP_PLAN_REQUIRES_REVIEW',
    workspaceRevision: identityReport?.source?.workspaceRevision ?? null,
    identityReportChecksum: identityValid ? identityReport.checksum : null,
    previousStateChecksum: previousState?.checksum ?? null,
    counts: {
      currentTasks: mappings.length,
      previousTasks: previousRecords.length,
      planned: rows.length,
      notObserved: notObserved.length,
      dispositions: counts,
      blockedReasonCounts: Object.fromEntries([...new Set(blockedReasons)].sort().map((reason) => [reason, blockedReasons.filter((item) => item === reason).length])),
    },
    blockedReasons: [...new Set(blockedReasons)].sort(),
    rows,
    notObserved,
    proposedNextState,
    authority: 'This report is a proposal only; PostgreSQL remains canonical after an authorized import and readback.',
    writesPerformed: false,
  };
  return { ...unsigned, checksum: checksum(unsigned) };
}

function main() {
  if (!fs.existsSync(identityPath)) throw new Error(`IDENTITY_REPORT_NOT_FOUND: ${identityPath}`);
  if (previousStatePath && !fs.existsSync(previousStatePath)) throw new Error(`PREVIOUS_STATE_NOT_FOUND: ${previousStatePath}`);
  const identityReport = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  const previousState = previousStatePath ? JSON.parse(fs.readFileSync(previousStatePath, 'utf8')) : null;
  const report = planOpenSpecTaskRevisionSyncV1(identityReport, previousState);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, counts: report.counts, writesPerformed: false, output: outputPath }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
