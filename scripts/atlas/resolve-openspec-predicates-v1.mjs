import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CENSUS_PATH = process.env.OPENSPEC_CENSUS_PATH
  ? path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-portfolio-census-v2.json');
const CENSUS_REF = path.relative(ROOT, CENSUS_PATH).replaceAll('\\', '/');
const OUTPUT_PATH = process.env.OPENSPEC_PREDICATE_RESOLUTION_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_PREDICATE_RESOLUTION_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-task-evidence-bindings-v1.json');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function splitClaim(text) {
  const parts = String(text ?? '').split(/\s*;\s*|\r?\n+/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [''];
}

export function predicateIdForTaskClaim(canonicalTaskRef, ordinal, claim) {
  return sha256(`${canonicalTaskRef}\0${ordinal}\0${claim}`);
}

function assertionStatus(assertion, receiptVerdict) {
  const verdict = String(assertion.verdict ?? '').toUpperCase();
  if (verdict === 'BLOCKED') return 'BLOCKED';
  if (verdict === 'FAIL' || verdict === 'FAILED' || assertion.passed === false) return 'FAILED';
  if (verdict === 'NOT_OBSERVED') return 'CLAIM_ONLY';
  if (verdict === 'PASS' || verdict === 'PROVEN' || assertion.passed === true) {
    return receiptVerdict === 'PROVEN' ? 'PROVEN' : receiptVerdict === 'PARTIAL' ? 'PARTIAL' : 'CLAIM_ONLY';
  }
  return 'CLAIM_ONLY';
}

function aggregateProofState(predicateStatuses, taskVerdicts, staleMatches, hasBlockers, unallocatedProof) {
  if (predicateStatuses.includes('BLOCKED') || hasBlockers) return 'BLOCKED';
  if (predicateStatuses.includes('FAILED') || taskVerdicts.includes('FAILED')) return 'FAILED';
  if (staleMatches.length && !taskVerdicts.length) return 'STALE';
  if (predicateStatuses.length && predicateStatuses.every((status) => status === 'PROVEN')) return 'PROVEN';
  if (predicateStatuses.some((status) => ['PROVEN', 'PARTIAL'].includes(status)) || taskVerdicts.includes('PARTIAL') || unallocatedProof) return 'PARTIAL';
  if (staleMatches.length) return 'STALE';
  return 'CLAIM_ONLY';
}

export function buildOpenSpecTaskEvidenceBindingsV1(census) {
  if (census?.schema !== 'atlas.openspec-evidence-portfolio-census.v2') throw new Error('CENSUS_SCHEMA_UNSUPPORTED');
  const matchesByTask = new Map();
  for (const match of census.evidenceMatches ?? []) {
    if (!match.canonicalTaskRef) continue;
    const rows = matchesByTask.get(match.canonicalTaskRef) ?? [];
    rows.push(match);
    matchesByTask.set(match.canonicalTaskRef, rows);
  }
  const dependencyRefsByTask = new Map();
  for (const edge of census.dependencies ?? []) {
    const rows = dependencyRefsByTask.get(edge.from) ?? [];
    rows.push({ taskRef: edge.to, relation: edge.relation, sourceRef: edge.sourceRef });
    dependencyRefsByTask.set(edge.from, rows);
  }
  const blockerRefsByTask = new Map();
  for (const blocker of census.missingTaskReferences ?? []) {
    const rows = blockerRefsByTask.get(blocker.fromTaskKey) ?? [];
    rows.push({ reference: blocker.reference, status: blocker.status, detail: blocker.detail, sourceRef: blocker.taskRef });
    blockerRefsByTask.set(blocker.fromTaskKey, rows);
  }
  const bindings = [];
  const predicates = [];
  for (const task of census.tasks ?? []) {
    const matches = matchesByTask.get(task.canonicalTaskRef) ?? [];
    const eligibleMatches = matches.filter((match) => match.proofEligible === true
      && match.resolution === 'BOUND'
      && match.workspaceCurrent !== false
      && match.sourceCurrent !== false);
    const verdicts = [...new Set(eligibleMatches.map((match) => match.verdict).filter(Boolean))];
    const contradictions = verdicts.includes('PROVEN') && verdicts.some((verdict) => ['FAILED', 'BLOCKED'].includes(verdict))
      ? [{ type: 'CONFLICTING_RECEIPT_VERDICTS', verdicts, evidenceIds: eligibleMatches.map((match) => match.evidenceId).filter(Boolean) }]
      : [];
    const claimParts = splitClaim(task.taskText);
    const predicateIds = claimParts.map((claim, index) => predicateIdForTaskClaim(task.canonicalTaskRef, index, claim));
    const taskBlockers = blockerRefsByTask.get(task.canonicalTaskRef) ?? [];
    const ambiguousBinding = matches.some((match) => match.resolution === 'AMBIGUOUS');
    const staleMatches = matches.filter((match) => match.resolution === 'BOUND'
      && (match.workspaceCurrent === false || match.sourceCurrent === false || match.verdict === 'STALE'));
    const predicateRows = claimParts.map((claim, index) => {
      const predicateId = predicateIds[index];
      const assertionMatches = eligibleMatches.flatMap((match) => (match.actualAssertions ?? [])
        .filter((assertion) => assertion.predicateId === predicateId || assertion.claimRef === predicateId)
        .map((assertion) => ({ assertion, match })));
      const staleAssertionMatches = staleMatches.flatMap((match) => (match.actualAssertions ?? [])
        .filter((assertion) => assertion.predicateId === predicateId || assertion.claimRef === predicateId)
        .map((assertion) => ({ assertion, match })));
      const assertionVerdicts = assertionMatches.map(({ assertion, match }) => assertionStatus(assertion, match.verdict));
      const positiveAndNegative = assertionVerdicts.includes('PROVEN') && assertionVerdicts.some((status) => ['FAILED', 'BLOCKED'].includes(status));
      const contradictionsForPredicate = positiveAndNegative
        ? [{ type: 'CONFLICTING_PREDICATE_ASSERTIONS', predicateId, evidenceIds: assertionMatches.map(({ match }) => match.evidenceId).filter(Boolean) }]
        : [];
      let status = assertionVerdicts.includes('BLOCKED') || contradictionsForPredicate.length ? 'BLOCKED'
        : assertionVerdicts.includes('FAILED') ? 'FAILED'
          : assertionVerdicts.length && assertionVerdicts.every((item) => item === 'PROVEN') ? 'PROVEN'
            : assertionVerdicts.some((item) => ['PROVEN', 'PARTIAL'].includes(item)) ? 'PARTIAL'
              : staleAssertionMatches.length ? 'STALE' : 'CLAIM_ONLY';
      return {
        schema: 'atlas.openspec-predicate.v1',
        predicateId,
        taskRef: task.taskRef,
        taskId: task.taskId ?? task.taskKey,
        ordinal: index,
        predicateKind: 'TASK_CLAIM_SEGMENT',
        text: claim,
        status,
        resolutionMode: 'DETERMINISTIC_CLAIM_SEGMENT',
        sourceRef: task.taskRef,
        workspaceRevision: census.source?.workspaceRevision ?? null,
        evidenceIds: [...new Set([...assertionMatches, ...staleAssertionMatches].map(({ match }) => match.evidenceId).filter(Boolean))],
        contradictions: contradictionsForPredicate,
      };
    });
    const unallocatedProof = eligibleMatches.some((match) => match.verdict === 'PROVEN'
      && !predicateRows.some((predicate) => predicate.evidenceIds.includes(match.evidenceId)));
    const proofState = contradictions.length
      ? 'BLOCKED'
      : aggregateProofState(predicateRows.map((predicate) => predicate.status), verdicts, staleMatches, taskBlockers.length > 0 || ambiguousBinding, unallocatedProof);
    claimParts.forEach((claim, index) => {
      predicates.push(predicateRows[index]);
    });
    const binding = {
      schema: 'atlas.task-evidence-binding.v1',
      taskRef: task.taskRef,
      taskId: task.taskId ?? task.taskKey,
      changeId: task.changeId,
      predicateIds,
      proofState,
      evidenceIds: [...new Set(matches.map((match) => match.evidenceId).filter(Boolean))],
      dependencyRefs: dependencyRefsByTask.get(task.canonicalTaskRef) ?? [],
      blockers: [
        ...taskBlockers,
        ...(ambiguousBinding ? [{ type: 'AMBIGUOUS_RECEIPT_BINDING' }] : []),
        ...(unallocatedProof ? [{ type: 'TASK_LEVEL_PROOF_NOT_BOUND_TO_PREDICATES' }] : []),
      ],
      contradictions: [...contradictions, ...predicateRows.flatMap((predicate) => predicate.contradictions)],
      workspaceRevision: census.source?.workspaceRevision ?? null,
      sourceRevision: task.taskHash,
      claimOnlyReason: proofState === 'CLAIM_ONLY' ? 'No current canonical receipt satisfies the exact task/source/workspace identity gate.' : null,
    };
    bindings.push({ ...binding, checksum: sha256(canonicalJson(binding)) });
  }
  const unsigned = {
    schema: 'atlas.openspec-task-evidence-bindings.v1',
    runId: process.env.OPENSPEC_EVIDENCE_RUN_ID ?? census.runId ?? null,
    generatedAt: new Date().toISOString(),
    source: {
      census: CENSUS_REF,
      workspaceRevision: census.source?.workspaceRevision ?? null,
      identityAuthority: 'scripts/atlas/audit-openspec-evidence-fabric-v1.mjs',
      receiptAuthority: 'scripts/atlas/audit-openspec-receipt-binding-v1.mjs',
      canonicalAuthority: false,
    },
    summary: {
      taskCount: bindings.length,
      predicateCount: predicates.length,
      proofStateCounts: Object.fromEntries([...new Set(bindings.map((binding) => binding.proofState))].sort().map((state) => [state, bindings.filter((binding) => binding.proofState === state).length])),
      contradictionTaskCount: bindings.filter((binding) => binding.contradictions.length > 0).length,
      blockedTaskCount: bindings.filter((binding) => binding.proofState === 'BLOCKED').length,
      tasksWithDependencies: bindings.filter((binding) => binding.dependencyRefs.length > 0).length,
      tasksWithBlockers: bindings.filter((binding) => binding.blockers.length > 0).length,
      heuristicPromotionCount: 0,
    },
    predicates,
    bindings,
    invariants: [
      'Predicate segmentation is deterministic and proposal-safe; unresolved prose is not promoted by this resolver.',
      'Receipt identity and revision checks remain prerequisites for PROVEN; a checkbox never changes proof state.',
      'Contradictory current receipts become BLOCKED and require independent reconciliation.',
    ],
    sideEffects: { taskLedgersMutated: false, receiptsMutated: false, persistentStoresMutated: false },
    likely_cause: 'Task claims contain multiple prose clauses while evidence receipts bind at task grain, leaving predicate-level proof unresolved.',
    evidence: [`${CENSUS_REF}#tasks`, `${CENSUS_REF}#evidenceMatches`, `${CENSUS_REF}#dependencies`],
    patch_targets: ['scripts/atlas/resolve-openspec-predicates-v1.mjs'],
    safe_next_command: 'node scripts/atlas/resolve-openspec-predicates-v1.mjs',
    smoke_command: 'node --check scripts/atlas/resolve-openspec-predicates-v1.mjs',
    report_path: path.relative(ROOT, OUTPUT_PATH).replaceAll('\\', '/'),
  };
  return { ...unsigned, checksum: sha256(canonicalJson(unsigned)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const census = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf8'));
  const report = buildOpenSpecTaskEvidenceBindingsV1(census);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, summary: report.summary, workspaceRevision: report.source.workspaceRevision, checksum: report.checksum, output: OUTPUT_PATH }, null, 2));
}
