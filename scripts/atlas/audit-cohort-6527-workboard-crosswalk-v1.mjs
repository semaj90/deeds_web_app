#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bindingPath = path.join(ROOT, '.tmp/atlas/openspec-cohort-6527-current-source-bindings-v1.jsonl');
const bindingReportPath = path.join(ROOT, 'docs/reports/openspec-cohort-6527-current-source-bindings-v1.json');
const option = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const workboardPath = path.resolve(ROOT, option('workboard', '.tmp/atlas/openspec-workboard-current-v1.json'));
const reportPath = path.resolve(ROOT, option('report', 'docs/reports/openspec-cohort-6527-workboard-crosswalk-v1.json'));
const bindings = readFileSync(bindingPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
const bindingReport = JSON.parse(readFileSync(bindingReportPath, 'utf8'));
const workboardBytes = readFileSync(workboardPath);
const workboard = JSON.parse(workboardBytes.toString('utf8'));
if (bindings.length !== 6527 || bindingReport.sourceBindings?.rowCount !== 6527 || workboard.schema !== 'atlas.openspec.workboard.v1') {
  throw new Error('CROSSWALK_INPUT_CONTRACT_MISMATCH');
}
if (new Set(bindings.map((row) => row.canonical_task_key)).size !== bindings.length) {
  throw new Error('CROSSWALK_SOURCE_KEYS_NOT_UNIQUE');
}
const normalizeSource = (source) => source.replace(/^sveltekit-frontend\//, '');
const byKey = new Map(workboard.taskInventory.map((task) => [task.stableKey, task]));
const logicalIdentityCounts = new Map();
for (const task of workboard.taskInventory) {
  if (task.logicalTaskKey) {
    logicalIdentityCounts.set(task.logicalTaskKey, (logicalIdentityCounts.get(task.logicalTaskKey) ?? 0) + 1);
  }
}
const byLocator = new Map();
const bySourceHash = new Map();
const byContentHash = new Map();
for (const task of workboard.taskInventory) {
  const source = normalizeSource(task.source);
  const locatorKey = `${source}#L${task.line}`;
  const locatorRows = byLocator.get(locatorKey) ?? [];
  locatorRows.push(task);
  byLocator.set(locatorKey, locatorRows);
  const hashKey = `${source}|${task.blockHash}`;
  const hashRows = bySourceHash.get(hashKey) ?? [];
  hashRows.push(task);
  bySourceHash.set(hashKey, hashRows);
  const contentRows = byContentHash.get(task.blockHash) ?? [];
  contentRows.push(task);
  byContentHash.set(task.blockHash, contentRows);
}

const counts = {
  EXACT_KEY_SOURCE_AND_HASH: 0,
  EXACT_SOURCE_LOCATOR_AND_HASH_KEY_DIFFERS: 0,
  EXACT_SOURCE_CONTENT_UNIQUE_RELOCATED_KEY_DIFFERS: 0,
  KEY_MATCH_SOURCE_OR_HASH_DRIFT: 0,
  UNMATCHED: 0,
  AMBIGUOUS_SOURCE_CONTENT: 0,
};
const unmatchedSourceRoots = {};
const crossRootContentCounts = { UNIQUE_CANDIDATE: 0, AMBIGUOUS_CANDIDATES: 0, NO_CONTENT_CANDIDATE: 0 };
const keyDifferenceIdentityCounts = {
  DECLARED_ID_UNIQUE: 0,
  DECLARED_ID_SECTION_QUALIFIED_UNIQUE: 0,
  MIGRATION_TITLE_HASH_REQUIRES_REVIEW: 0,
  LOGICAL_ID_COLLISION: 0,
};
const rows = [];
for (const binding of bindings) {
  const currentTask = byKey.get(binding.canonical_task_key);
  const [sourcePath, lineText] = binding.source_ref.split('#L');
  const locatorKey = `${normalizeSource(sourcePath)}#L${Number(lineText)}`;
  const locatorRows = byLocator.get(locatorKey) ?? [];
  const exactLocator = locatorRows.filter((task) => task.blockHash === binding.source_claim_hash);
  const expectedCheckboxState = binding.source_checkbox_state === 'x'
    ? 'DONE'
    : binding.source_checkbox_state === '~'
      ? 'IN_PROGRESS'
      : binding.source_checkbox_state === ' '
        ? 'OPEN'
        : null;
  let status;
  let candidate = null;
  let crossRootContent = { status: 'NOT_APPLICABLE', candidates: [] };
  if (currentTask && normalizeSource(currentTask.source) === normalizeSource(sourcePath)
    && currentTask.blockHash === binding.source_claim_hash
    && `${normalizeSource(currentTask.source)}#L${currentTask.line}` === locatorKey
    && currentTask.sourceCheckboxState === expectedCheckboxState) {
    status = 'EXACT_KEY_SOURCE_AND_HASH';
    candidate = currentTask;
  } else if (exactLocator.length === 1) {
    status = 'EXACT_SOURCE_LOCATOR_AND_HASH_KEY_DIFFERS';
    candidate = exactLocator[0];
  } else if (currentTask) {
    status = 'KEY_MATCH_SOURCE_OR_HASH_DRIFT';
    candidate = currentTask;
  } else {
    const hashRows = bySourceHash.get(`${normalizeSource(sourcePath)}|${binding.source_claim_hash}`) ?? [];
    if (hashRows.length === 1) {
      status = 'EXACT_SOURCE_CONTENT_UNIQUE_RELOCATED_KEY_DIFFERS';
      candidate = hashRows[0];
    } else {
      status = hashRows.length > 1 || exactLocator.length > 1 ? 'AMBIGUOUS_SOURCE_CONTENT' : 'UNMATCHED';
    }
  }
  if (status === 'UNMATCHED' || status === 'AMBIGUOUS_SOURCE_CONTENT') {
    const contentCandidates = (byContentHash.get(binding.source_claim_hash) ?? [])
      .filter((task) => normalizeSource(task.source) !== normalizeSource(sourcePath));
    if (contentCandidates.length === 1) {
      crossRootContentCounts.UNIQUE_CANDIDATE += 1;
      crossRootContent = {
        status: 'UNIQUE_CANDIDATE',
        candidates: contentCandidates.map((task) => ({
          taskKey: task.stableKey,
          sourceRef: `${task.source}#L${task.line}`,
          blockHash: task.blockHash,
        })),
      };
    } else if (contentCandidates.length > 1) {
      crossRootContentCounts.AMBIGUOUS_CANDIDATES += 1;
      crossRootContent = {
        status: 'AMBIGUOUS_CANDIDATES',
        candidates: contentCandidates.slice(0, 10).map((task) => ({
          taskKey: task.stableKey,
          sourceRef: `${task.source}#L${task.line}`,
          blockHash: task.blockHash,
        })),
      };
    } else {
      crossRootContentCounts.NO_CONTENT_CANDIDATE += 1;
      crossRootContent = { status: 'NO_CONTENT_CANDIDATE', candidates: [] };
    }
  }
  counts[status] += 1;
  if (status === 'UNMATCHED' || status === 'AMBIGUOUS_SOURCE_CONTENT') {
    const sourceRoot = sourcePath.startsWith('sveltekit-frontend/')
      ? 'sveltekit-frontend/openspec'
      : sourcePath.startsWith('parent-atlas-qas-bundle/')
        ? 'parent-atlas-qas-bundle/openspec'
        : sourcePath.startsWith('openspec/specs/')
          ? 'openspec/specs'
          : sourcePath.startsWith('parent-atlas-rtx-gpu-lab/')
            ? 'parent-atlas-rtx-gpu-lab/openspec'
            : sourcePath.split('/')[0];
    unmatchedSourceRoots[sourceRoot] = (unmatchedSourceRoots[sourceRoot] ?? 0) + 1;
  }
  let candidateIdentityReview = null;
  if (status === 'EXACT_SOURCE_LOCATOR_AND_HASH_KEY_DIFFERS') {
    const logicalTaskKey = candidate?.logicalTaskKey ?? null;
    const basis = candidate?.taskIdentity?.basis ?? 'MISSING';
    const uniqueLogicalKey = logicalTaskKey !== null && logicalIdentityCounts.get(logicalTaskKey) === 1;
    const identityStatus = !uniqueLogicalKey
      ? logicalTaskKey ? 'LOGICAL_ID_COLLISION' : 'MIGRATION_TITLE_HASH_REQUIRES_REVIEW'
      : basis === 'DECLARED_ID_SECTION_QUALIFIED'
        ? 'DECLARED_ID_SECTION_QUALIFIED_UNIQUE'
        : basis === 'DECLARED_ID'
          ? 'DECLARED_ID_UNIQUE'
          : 'MIGRATION_TITLE_HASH_REQUIRES_REVIEW';
    keyDifferenceIdentityCounts[identityStatus] += 1;
    candidateIdentityReview = {
      logicalTaskKey,
      basis,
      uniqueWithinWorkboard: uniqueLogicalKey,
      taskRevision: candidate?.taskIdentity?.taskRevision ?? null,
      status: identityStatus,
      canonicalAuthority: false,
    };
  }
  rows.push({
    canonicalTaskKey: binding.canonical_task_key,
    sourceRef: binding.source_ref,
    sourceClaimHash: binding.source_claim_hash,
    sourceMatch: binding.source_match,
    sourceCheckboxState: binding.source_checkbox_state,
    expectedWorkboardCheckboxState: expectedCheckboxState,
    status,
    candidateWorkboardKey: candidate?.stableKey ?? null,
    candidateSourceRef: candidate ? `${candidate.source}#L${candidate.line}` : null,
    candidateBlockHash: candidate?.blockHash ?? null,
    candidateIdentityReview,
    crossRootContent,
  });
}
const report = {
  schema: 'atlas.openspec-cohort-6527-workboard-crosswalk.v1',
  generatedAt: new Date().toISOString(),
  status: counts.EXACT_KEY_SOURCE_AND_HASH === bindings.length ? 'PASS_EXACT_CROSSWALK' : 'PARTIAL_CROSSWALK',
  sourceQualifiedStatus: counts.UNMATCHED === 0 && counts.AMBIGUOUS_SOURCE_CONTENT === 0 && counts.KEY_MATCH_SOURCE_OR_HASH_DRIFT === 0
    ? 'PASS_SOURCE_LOCATOR_AND_HASH'
    : 'PARTIAL_SOURCE_BINDING',
  canonicalTaskKeyStatus: counts.EXACT_KEY_SOURCE_AND_HASH === bindings.length
    ? 'PASS_CANONICAL_TASK_KEYS'
    : 'KEY_DIFFERENCES_REQUIRE_RECONCILIATION',
  sourceQualifiedRows: counts.EXACT_KEY_SOURCE_AND_HASH + counts.EXACT_SOURCE_LOCATOR_AND_HASH_KEY_DIFFERS + counts.EXACT_SOURCE_CONTENT_UNIQUE_RELOCATED_KEY_DIFFERS,
  canonicalAuthority: false,
  taskCompletionAuthorized: false,
  writesPerformed: false,
  sourceBindingRevision: bindingReport.sourceBindingRevision,
  sourceBindingStatus: bindingReport.status,
  workboardGeneratedAt: workboard.generatedAt,
  workboardSha256: createHash('sha256').update(workboardBytes).digest('hex'),
  sourceRows: bindings.length,
  workboardRows: workboard.taskInventory.length,
  counts,
  unmatchedSourceRoots,
  crossRootContentCounts,
  keyDifferenceIdentityCounts,
  rows,
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, sourceQualifiedStatus: report.sourceQualifiedStatus, canonicalTaskKeyStatus: report.canonicalTaskKeyStatus, sourceQualifiedRows: report.sourceQualifiedRows, counts, sourceRows: report.sourceRows, workboardRows: report.workboardRows, reportPath: path.relative(ROOT, reportPath) }, null, 2));
