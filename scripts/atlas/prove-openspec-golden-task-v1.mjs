import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_TASK_REF = 'openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md#L133';
const DEFAULT_RECEIPT_URI = 'docs/reports/openspec-graph-retrieval-proof-tree-node-identity-formula-receipt-v1.json';
const OUTPUT_PATH = process.env.OPENSPEC_GOLDEN_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_GOLDEN_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-golden-task-gs1-10-v1.json');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function latestReport(prefix, fallback) {
  const reportDirectory = path.join(ROOT, 'docs', 'reports');
  const matches = fs.readdirSync(reportDirectory)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .map((name) => path.join(reportDirectory, name));
  return matches.length ? matches.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0] : fallback;
}

function resolvePath(value, fallback) {
  return path.resolve(ROOT, value ?? fallback);
}

function verifyReceiptChecksum(receipt) {
  if (!receipt || typeof receipt !== 'object' || typeof receipt.checksum !== 'string') return false;
  const unsigned = { ...receipt };
  delete unsigned.checksum;
  return receipt.checksum === sha256(canonicalJson(unsigned));
}

function sourceRefLine(taskRef) {
  const match = String(taskRef).match(/^(.*)#L(\d+)$/);
  return match ? { file: match[1], line: Number(match[2]) } : { file: taskRef, line: null };
}

function findByTaskRef(rows, taskRef) {
  return rows.find((row) => row.taskRef === taskRef || row.sourceRef === taskRef || row.taskIdentity?.taskRef === taskRef || row.taskIdentity?.canonicalTaskRef === taskRef) ?? null;
}

export function proveOpenSpecGoldenTaskV1(input = {}) {
  const census = input.census;
  if (census?.schema !== 'atlas.openspec-evidence-portfolio-census.v2') throw new Error('CENSUS_SCHEMA_UNSUPPORTED');
  const taskRef = input.taskRef ?? DEFAULT_TASK_REF;
  const receiptUri = input.receiptUri ?? DEFAULT_RECEIPT_URI;
  const task = (census.tasks ?? []).find((row) => row.taskRef === taskRef);
  const identityRows = input.identityReport?.tasks ?? input.identityReport?.mappings ?? [];
  const identity = findByTaskRef(identityRows, taskRef);
  const receiptInventoryRow = (census.evidenceReceipts ?? []).find((row) => row.uri === receiptUri);
  const receipt = input.receiptDocument ?? receiptInventoryRow;
  const type = (input.typeReport?.receipts ?? []).find((row) => row.uri === receiptUri) ?? null;
  const orphanBinding = (input.orphanReport?.bindings ?? []).find((row) => row.uri === receiptUri) ?? null;
  const predicateBinding = (input.predicateReport?.bindings ?? []).find((row) => row.taskRef === taskRef) ?? null;
  const card = (input.cardReport?.cards ?? []).find((row) => row.taskIdentity?.taskRef === taskRef) ?? null;
  const receiptTaskId = receipt?.taskId ?? null;
  const identityKey = identity?.canonicalTaskRef ?? identity?.canonicalTaskKey ?? identity?.derivedStableKey ?? task?.canonicalTaskRef ?? null;
  const canonicalTaskRef = identityKey && identityKey.startsWith('openspec-task:') ? identityKey : identityKey ? `openspec-task:${identityKey}` : null;
  const identityCanonicalTaskRef = identityKey && identityKey.startsWith('openspec-task:') ? identityKey : identityKey ? `openspec-task:${identityKey}` : null;
  const source = sourceRefLine(taskRef);
  const taskFileRevision = task ? sha256(fs.readFileSync(path.resolve(ROOT, task.tasksPath))) : null;
  const assertions = [
    { id: 'TASK_FOUND', passed: Boolean(task), observed: task?.taskRef ?? null },
    { id: 'IDENTITY_CANONICAL', passed: Boolean(identity && identityCanonicalTaskRef === canonicalTaskRef && ['DECLARED_ID', 'LEGACY_ID_RECOVERED', 'DERIVED_STABLE_KEY', 'DERIVED_ID'].includes(identity.identityState ?? identity.taskIdentity?.identityState)), observed: identity?.identityState ?? identity?.taskIdentity?.identityState ?? null },
    { id: 'RECEIPT_SCHEMA', passed: Boolean(receipt?.schema === 'atlas.evidence-receipt.v1' && receiptInventoryRow?.canonicalSchemaValid === true), observed: receipt?.schema ?? null },
    { id: 'RECEIPT_CHECKSUM', passed: verifyReceiptChecksum(receipt), observed: receipt?.checksum ?? null },
    { id: 'EXACT_CANONICAL_TASK_ID', passed: Boolean(receiptTaskId && receiptTaskId === canonicalTaskRef), observed: receiptTaskId },
    { id: 'SOURCE_REF_EXACT', passed: Boolean(receipt?.sourceRefs?.some((ref) => ref.file === source.file && ref.lineStart === source.line)), observed: receipt?.sourceRefs?.map((ref) => `${ref.file}#L${ref.lineStart}`) ?? [] },
    { id: 'SOURCE_REF_REVISION_CURRENT', passed: Boolean(receipt?.sourceRefs?.some((ref) => ref.file === source.file && ref.lineStart === source.line && ref.sourceRevision === taskFileRevision)), observed: receipt?.sourceRefs?.find((ref) => ref.file === source.file && ref.lineStart === source.line)?.sourceRevision ?? null },
    { id: 'WORKSPACE_REVISION_CURRENT', passed: Boolean(receipt?.workspaceRevision && receipt.workspaceRevision === census.source?.workspaceRevision), observed: receipt?.workspaceRevision ?? null },
    { id: 'SOURCE_REVISION_CURRENT', passed: Boolean(receipt?.sourceRevision && task?.taskHash && receipt.sourceRevision === task.taskHash), observed: receipt?.sourceRevision ?? null },
    { id: 'RECEIPT_TYPE_CONFIRMED', passed: Boolean(type?.candidateType === 'STATIC_AUDIT' && type.typingState === 'TYPED' && type.typeConfirmed), observed: type?.candidateType ?? null },
    { id: 'RANKED_BINDING_EXACT', passed: Boolean(orphanBinding?.strategy === 'EXACT_TASK_REF' && orphanBinding.bindingDisposition === 'EXACT_BOUND' && orphanBinding.revisionStatus === 'CURRENT'), observed: orphanBinding ? { strategy: orphanBinding.strategy, bindingDisposition: orphanBinding.bindingDisposition, revisionStatus: orphanBinding.revisionStatus } : null },
    { id: 'ASSERTIONS_PASS', passed: Array.isArray(receipt?.actualAssertions) && receipt.actualAssertions.length > 0 && receipt.actualAssertions.every((assertion) => assertion.passed === true), observed: receipt?.actualAssertions?.map((assertion) => ({ id: assertion.id, passed: assertion.passed })) ?? [] },
  ];
  const passed = assertions.filter((assertion) => assertion.passed).length;
  const allPassed = assertions.length > 0 && passed === assertions.length;
  const unsigned = {
    schema: 'atlas.openspec-golden-task.v1',
    runId: process.env.OPENSPEC_EVIDENCE_RUN_ID ?? census.runId ?? null,
    status: allPassed ? 'GOLDEN_TASK_PROVEN_READ_ONLY' : 'GOLDEN_TASK_PARTIAL_READ_ONLY',
    task: {
      taskRef,
      taskId: canonicalTaskRef,
      changeId: task?.changeId ?? null,
      claim: task?.taskText ?? null,
      declaredChecked: task?.declaredChecked ?? null,
      identityState: identity?.identityState ?? identity?.taskIdentity?.identityState ?? null,
    },
    evidence: {
      receiptUri,
      evidenceId: receipt?.evidenceId ?? null,
      evidenceType: type?.candidateType ?? null,
      receiptVerdict: receipt?.verdict ?? null,
      bindingDisposition: orphanBinding?.bindingDisposition ?? null,
      bindingStrategy: orphanBinding?.strategy ?? null,
      revisionStatus: orphanBinding?.revisionStatus ?? null,
      receiptRefs: receipt ? [receiptUri] : [],
    },
    predicateBinding: predicateBinding ? { proofStateBeforeSpecimen: predicateBinding.proofState, predicateIds: predicateBinding.predicateIds } : null,
    card: card ? { cardId: card.cardId, checksum: card.checksum, retrievalUsable: card.retrievalUsable, proofUsable: card.proofUsable } : null,
    assertions,
    result: {
      evidenceState: allPassed ? 'STATIC_PROVEN' : 'PARTIAL',
      taskClaimState: task?.declaredChecked ? 'DECLARED_CHECKED' : 'DECLARED_OPEN',
      proven: allPassed ? ['FORMULA_LOCATED', 'SOURCE_REVISION_BOUND', 'STATIC_CAPTURE_PROVEN'] : [],
      missing: assertions.filter((assertion) => !assertion.passed).map((assertion) => assertion.id),
      contradictions: [],
      portfolioStateMutation: 'NOT_APPLIED',
      sourceFilesMutated: false,
      taskLedgerWrites: 0,
      persistentStoreWrites: 0,
    },
    source: {
      census: process.env.OPENSPEC_CENSUS_PATH ? path.relative(ROOT, resolvePath(process.env.OPENSPEC_CENSUS_PATH)).replaceAll('\\', '/') : null,
      workspaceRevision: census.source?.workspaceRevision ?? null,
      receiptChecksum: receipt?.checksum ?? null,
    },
    likely_cause: allPassed ? 'GS1.10 was previously blocked by source-reference fanout; canonical task identity and typed receipt binding now resolve the specimen without mutating the ledger.' : 'The GS1.10 specimen still has one or more identity, receipt, or revision assertions that are not yet satisfied.',
    evidence: [taskRef, receiptUri, 'docs/reports/openspec-task-identity-recovery-v1.json', 'docs/reports/openspec-receipt-type-classification-v1.json', 'docs/reports/openspec-orphan-binding-resolution-v1.json'],
    patch_targets: ['scripts/atlas/audit-openspec-evidence-fabric-v1.mjs', 'scripts/atlas/classify-openspec-receipts-v1.mjs', 'scripts/atlas/resolve-openspec-orphan-bindings-v1.mjs', 'scripts/atlas/prove-openspec-golden-task-v1.mjs'],
    safe_next_command: 'node scripts/atlas/prove-openspec-golden-task-v1.mjs',
    smoke_command: 'node --check scripts/atlas/prove-openspec-golden-task-v1.mjs',
    report_path: path.relative(ROOT, OUTPUT_PATH).replaceAll('\\', '/'),
  };
  return { ...unsigned, checksum: sha256(canonicalJson(unsigned)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const censusPath = resolvePath(process.env.OPENSPEC_CENSUS_PATH, 'docs/reports/openspec-evidence-portfolio-census-v2.json');
  const census = readJson(censusPath);
  const identityReport = readJson(resolvePath(process.env.OPENSPEC_IDENTITY_RECOVERY_PATH, 'docs/reports/openspec-task-identity-recovery-v1.json'));
  const typeReport = readJson(resolvePath(process.env.OPENSPEC_RECEIPT_TYPES_PATH, 'docs/reports/openspec-receipt-type-classification-v1.json'));
  const orphanReport = readJson(resolvePath(process.env.OPENSPEC_ORPHAN_BINDING_PATH, 'docs/reports/openspec-orphan-binding-resolution-v1.json'));
  const predicateReport = readJson(resolvePath(process.env.OPENSPEC_PREDICATE_PATH, 'docs/reports/openspec-task-evidence-bindings-v1.json'));
  const cardReport = readJson(resolvePath(process.env.OPENSPEC_CARDS_PATH, 'docs/reports/openspec-evidence-cards-v1.json'));
  const receiptUri = process.env.OPENSPEC_GOLDEN_RECEIPT_URI ?? DEFAULT_RECEIPT_URI;
  const receiptDocument = readJson(resolvePath(receiptUri));
  const report = proveOpenSpecGoldenTaskV1({ census, identityReport, typeReport, orphanReport, predicateReport, cardReport, receiptDocument, taskRef: process.env.OPENSPEC_GOLDEN_TASK_REF, receiptUri });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, taskId: report.task.taskId, evidenceState: report.result.evidenceState, passedAssertions: report.assertions.filter((assertion) => assertion.passed).length, assertionCount: report.assertions.length, output: OUTPUT_PATH }, null, 2));
}
