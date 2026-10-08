import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recoverOpenSpecTaskIdentitiesV1 } from './recover-openspec-task-identities-v1.mjs';
import { classifyOpenSpecReceiptsV1 } from './classify-openspec-receipts-v1.mjs';
import { resolveOpenSpecOrphanBindingsV1 } from './resolve-openspec-orphan-bindings-v1.mjs';
import { buildPortfolioCensus, computeOpenSpecWorkspaceRevisionV1 } from './audit-openspec-evidence-fabric-v1.mjs';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCHEMA = 'atlas.openspec-task-evidence-reconciliation.v1';
const CURRENT_BINDING_TYPES = new Set(['BOUND_EXACT', 'BOUND_ALIAS', 'BOUND_SOURCE_REF']);

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function parseArgs(argv) {
  const options = { root: DEFAULT_ROOT, census: null, currentCensus: false, output: null, maxExamples: 12 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--root') options.root = path.resolve(argv[++index] ?? '');
    else if (argument === '--census') options.census = argv[++index];
    else if (argument === '--current-census') options.currentCensus = true;
    else if (argument === '--output') options.output = argv[++index];
    else if (argument === '--max-examples') options.maxExamples = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(options.maxExamples) || options.maxExamples < 0 || options.maxExamples > 100) {
    throw new Error('--max-examples must be an integer from 0 to 100');
  }
  if (options.currentCensus === Boolean(options.census)) {
    throw new Error('SELECT_EXACTLY_ONE_OF_--census_OR_--current-census');
  }
  return options;
}

function safeReportPath(root, requestedPath) {
  const output = path.resolve(root, requestedPath);
  const scratch = path.resolve(root, '.tmp');
  const relative = path.relative(scratch, output);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('--output must resolve to a file below the repository .tmp directory');
  }
  return output;
}

function countBy(items, selector) {
  const counts = new Map();
  for (const item of items) {
    const key = selector(item) ?? 'UNKNOWN';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function taskAction(card) {
  const reasons = new Set(card.rejectionReasons ?? []);
  if (card.proofUsable === true) return 'ALREADY_PROVEN_NO_INDEXING_ACTION';
  if (reasons.has('IDENTITY_AMBIGUOUS')) return 'REVIEW_RECEIPT_TASK_IDENTITY';
  if (reasons.has('CANDIDATE_ONLY_BINDING')) return 'ADD_EXPLICIT_CANONICAL_TASK_BINDING';
  if (reasons.has('WORKSPACE_REVISION_MISMATCH')) return 'REGENERATE_RECEIPT_FOR_TARGET_WORKSPACE';
  if (reasons.has('SOURCE_REVISION_OR_SPAN_MISMATCH')) return 'REGENERATE_RECEIPT_WITH_CURRENT_TASK_SOURCE_SPAN';
  if (reasons.has('NON_CANONICAL')) return 'MIGRATE_EVIDENCE_THROUGH_CANONICAL_RECEIPT_OWNER';
  if (reasons.has('NO_BOUND_RECEIPT')) return 'ACQUIRE_REAL_EXECUTION_EVIDENCE_NO_SYNTHETIC_RECEIPT';
  return 'INSPECT_EVIDENCE_OWNER_DIAGNOSTIC_ONLY';
}

export function buildTaskEvidenceReconciliationV1(census, inputDigest, maxExamples = 12, ownerResolution = null, currentWorkspaceRevision = null, censusSourceMode = 'SAVED_CENSUS') {
  if (!['atlas.openspec-evidence-portfolio-census.v2', 'atlas.openspec-evidence-fabric-census.v1'].includes(census?.schema)) {
    throw new Error(`Unsupported census schema: ${census?.schema ?? 'missing'}`);
  }
  if (!Array.isArray(census.tasks) || !Array.isArray(census.evidenceMatches) || !Array.isArray(census.evidenceCards)) {
    throw new Error('Census is missing tasks, evidenceMatches, or evidenceCards arrays');
  }

  const cardsByRef = new Map(census.evidenceCards.map((card) => [card.taskRef, card]));
  const tasks = census.tasks.map((task) => {
    const card = cardsByRef.get(task.taskRef);
    const evidenceState = card?.proofState ?? 'NO_CARD';
    return {
      taskRef: task.taskRef,
      canonicalTaskRef: task.canonicalTaskRef ?? null,
      changeId: task.changeId,
      taskIdStatus: task.taskIdStatus ?? null,
      declaredChecked: task.declaredChecked === true,
      evidenceState,
      evidenceIds: card?.evidenceIds ?? [],
      rejectionReasons: card?.rejectionReasons ?? ['NO_EVIDENCE_CARD'],
      nextAction: !task.declaredChecked && evidenceState !== 'PROVEN'
        ? 'DEFER_UNCHECKED_TASK_NO_PROOF_CLAIM'
        : card ? taskAction(card) : 'REBUILD_EVIDENCE_CENSUS_FOR_THIS_TASK',
    };
  });

  const bound = census.evidenceMatches.filter((match) => match.resolution === 'BOUND'
    && CURRENT_BINDING_TYPES.has(match.bindingType));
  const boundByTask = new Map();
  for (const match of bound) {
    const matches = boundByTask.get(match.canonicalTaskRef) ?? [];
    matches.push(match);
    boundByTask.set(match.canonicalTaskRef, matches);
  }

  const exactCurrent = bound.filter((match) => match.canonicalSchemaValid === true
    && match.workspaceCurrent === true
    && match.sourceCurrent === true
    && match.taskSpanMatched === true
    && match.sourceRefsCurrent === true
    && match.verdict === 'PROVEN');
  const receiptDisposition = census.evidenceMatches.map((match) => {
    let disposition;
    if (match.resolution === 'AMBIGUOUS') disposition = 'AMBIGUOUS_TASK_IDENTITY';
    else if (match.resolution === 'MISSING_TASK') disposition = 'NO_TASK_BINDING';
    else if (match.bindingType === 'CANDIDATE_ONLY' || match.resolution === 'CANDIDATE_ONLY') disposition = 'CANDIDATE_ONLY';
    else if (!match.canonicalSchemaValid) disposition = 'NON_CANONICAL_CANDIDATE';
    else if (match.workspaceCurrent !== true) disposition = 'WORKSPACE_REVISION_STALE_OR_UNKNOWN';
    else if (match.sourceCurrent !== true || match.taskSpanMatched !== true || match.sourceRefsCurrent !== true) disposition = 'TASK_SOURCE_OR_SPAN_STALE_OR_UNKNOWN';
    else if (!match.verdict) disposition = 'MISSING_VERDICT';
    else disposition = 'EXACT_CURRENT_RECEIPT_CANDIDATE';
    return {
      uri: match.uri,
      evidenceId: match.evidenceId ?? null,
      canonicalTaskRef: match.canonicalTaskRef ?? null,
      candidateTaskRefs: match.candidateTaskRefs ?? [],
      bindingType: match.bindingType ?? null,
      disposition,
      sourceRevision: match.sourceRevision ?? null,
      workspaceRevision: match.workspaceRevision ?? null,
      taskSpanMatched: match.taskSpanMatched ?? null,
      verdict: match.verdict ?? null,
    };
  });

  const taskSummary = {
    total: tasks.length,
    checked: tasks.filter((task) => task.declaredChecked).length,
    checkedWithExactCurrentReceiptCandidate: tasks.filter((task) => task.declaredChecked
      && (boundByTask.get(task.canonicalTaskRef) ?? []).some((match) => exactCurrent.includes(match))).length,
    evidenceStateCounts: countBy(tasks, (task) => task.evidenceState),
    nextActionCounts: countBy(tasks, (task) => task.nextAction),
  };
  const censusCounts = census.summary ?? {};

  return {
    schema: SCHEMA,
    status: 'DIAGNOSTIC_ONLY_NOT_PROMOTABLE',
    canonicalAuthority: false,
    promotionEligible: false,
    sourceCensus: {
      schema: census.schema,
      sourceMode: censusSourceMode,
      runId: census.runId ?? null,
      workspaceRevision: census.source?.workspaceRevision ?? census.workspaceRevision ?? null,
      currentWorkspaceRevision,
      workspaceRevisionCurrent: currentWorkspaceRevision === null
        ? null
        : currentWorkspaceRevision === (census.source?.workspaceRevision ?? census.workspaceRevision),
      sourceGitCommit: census.gitCommit ?? null,
      embeddedChecksum: census.checksum ?? null,
      inputFileSha256: inputDigest,
    },
    interpretation: 'A task without an admitted receipt is not evidence that source facts are absent. This report diagnoses receipt-to-task bindings only.',
    summary: {
      taskSummary,
      receiptCandidateCount: receiptDisposition.length,
      receiptDispositionCounts: countBy(receiptDisposition, (item) => item.disposition),
      exactCurrentReceiptCandidateCount: exactCurrent.length,
      canonicalReceiptCount: censusCounts.receiptCount ?? null,
      untypedReceiptCandidateCount: censusCounts.untypedReceiptCandidateCount ?? null,
      ambiguousReceiptCount: censusCounts.ambiguous_receipts ?? null,
      missingTaskReceiptCount: censusCounts.missing_task_receipts ?? null,
      missingRevisionReceiptCount: censusCounts.missing_revision_receipts ?? null,
      staleEvidenceCount: censusCounts.staleEvidenceCount ?? null,
      ownerDeterministicMatchCount: ownerResolution?.summary?.bindingReasonCounts?.DETERMINISTIC_MATCH ?? null,
      ownerResolutionDispositionCounts: ownerResolution?.summary?.bindingDispositionCounts ?? null,
      ownerResolutionReasonCounts: ownerResolution?.summary?.bindingReasonCounts ?? null,
      ownerExactBoundCount: ownerResolution?.summary?.exactBoundCount ?? null,
      ownerLegacyBoundCount: ownerResolution?.summary?.legacyBoundCount ?? null,
      ownerProofEligibleCount: ownerResolution?.summary?.proofEligibleCount ?? 0,
    },
    taskRemediation: tasks,
    receiptDisposition,
    ownerBindingReview: (ownerResolution?.bindings ?? [])
      .filter((binding) => ['EXACT_BOUND', 'LEGACY_BOUND', 'STALE_REVISION', 'MISSING_REVISION', 'AMBIGUOUS', 'PORTFOLIO_LEVEL', 'IDENTITY_QUARANTINED'].includes(binding.bindingDisposition))
      .slice(0, maxExamples)
      .map((binding) => ({
        uri: binding.uri,
        evidenceId: binding.evidenceId ?? null,
        sourceRef: binding.sourceRef ?? null,
        candidateTaskRefs: binding.candidateTaskRefs ?? [],
        bindingDisposition: binding.bindingDisposition,
        bindingReason: binding.bindingReason ?? null,
        revisionStatus: binding.revisionStatus ?? null,
        sourceReferenceDisposition: binding.sourceReferenceDisposition ?? [],
        artifactChecksums: binding.artifactChecksums ?? [],
        proofEligible: false,
      })),
    sideEffects: { sourceFilesMutated: false, persistentStoresMutated: false, embeddingsRequested: false },
    boundedExamples: tasks.filter((task) => task.nextAction !== 'ALREADY_PROVEN_NO_INDEXING_ACTION').slice(0, maxExamples),
  };
}

function printHelp() {
  console.log([
    'Read-only reconciliation of task/evidence bindings in an existing evidence-fabric census.',
    '',
    'Usage:',
    '  node scripts/atlas/reconcile-openspec-task-evidence-bindings-v1.mjs (--census <census-v1.json> | --current-census) [--output .tmp/<report>.json]',
    '',
    'The report is diagnostic only. It does not create receipts, change task cards, index embeddings, or write to stores.',
  ].join('\n'));
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.help) return printHelp();
  const root = options.root;
  const census = options.currentCensus
    ? buildPortfolioCensus(root)
    : JSON.parse(fs.readFileSync(path.resolve(root, options.census), 'utf8'));
  const inputDigest = sha256(Buffer.from(JSON.stringify(census), 'utf8'));
  const censusWorkspaceRevision = census.source?.workspaceRevision ?? census.workspaceRevision;
  const workspaceRevisionBefore = computeOpenSpecWorkspaceRevisionV1(root);
  if (censusWorkspaceRevision !== workspaceRevisionBefore) {
    throw new Error('CENSUS_WORKSPACE_REVISION_STALE: regenerate the read-only census before reconciliation');
  }
  const identityRecovery = recoverOpenSpecTaskIdentitiesV1(census);
  const receiptTypes = classifyOpenSpecReceiptsV1(census);
  const ownerResolution = resolveOpenSpecOrphanBindingsV1(census, identityRecovery, receiptTypes, { sourceArtifactRoot: root });
  const workspaceRevisionAfter = computeOpenSpecWorkspaceRevisionV1(root);
  if (workspaceRevisionAfter !== workspaceRevisionBefore) {
    throw new Error('OPEN_SPEC_WORKSPACE_CHANGED_DURING_RECONCILIATION: discard this run and recensus');
  }
  const report = buildTaskEvidenceReconciliationV1(
    census,
    inputDigest,
    options.maxExamples,
    ownerResolution,
    workspaceRevisionAfter,
    options.currentCensus ? 'CURRENT_IN_MEMORY_READ_ONLY' : 'SAVED_CENSUS',
  );
  if (options.output) {
    const outputPath = safeReportPath(root, options.output);
    report.reportPath = path.relative(root, outputPath).replaceAll('\\', '/');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  }
  console.log(JSON.stringify({
    schema: report.schema,
    status: report.status,
    canonicalAuthority: report.canonicalAuthority,
    promotionEligible: report.promotionEligible,
    workspaceRevision: report.sourceCensus.workspaceRevision,
    summary: report.summary,
    reportPath: report.reportPath ?? null,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
