import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEvidenceReceiptV1, buildPortfolioCensus, verifyEvidenceReceiptV1 } from './audit-openspec-evidence-fabric-v1.mjs';
import { recoverOpenSpecTaskIdentitiesV1 } from './recover-openspec-task-identities-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HASH = /^sha256:[a-f0-9]{64}$/i;

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function resolveRepoFile(root, file) {
  if (typeof file !== 'string' || !file || path.isAbsolute(file)) throw new Error('PROOF_SOURCE_REF_INVALID');
  const resolved = path.resolve(root, file);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('PROOF_SOURCE_REF_OUTSIDE_REPO');
  return resolved;
}

function lineAtByteOffset(bytes, offset) {
  return bytes.subarray(0, offset).toString('utf8').split(/\r\n|\r|\n/).length;
}

export function buildTaskScopedSourceReceiptCandidateV1({ root, task, canonicalTaskKey, workspaceRevision, proof, proofChecksum, observedAt }) {
  if (!root || !task || !canonicalTaskKey || !HASH.test(String(workspaceRevision ?? ''))) throw new Error('TASK_SCOPE_REQUIRED');
  if (proof?.schema !== 'atlas.task-scoped-behavior-proof.v1') throw new Error('BEHAVIOR_PROOF_SCHEMA_INVALID');
  if (proof.changeId !== task.changeId || proof.taskId !== task.taskId || proof.taskRef !== task.taskRef) throw new Error('BEHAVIOR_PROOF_TASK_BINDING_MISMATCH');
  if (proof.taskRevision !== task.taskHash || proof.workspaceRevision !== workspaceRevision) throw new Error('BEHAVIOR_PROOF_REVISION_MISMATCH');
  if (!HASH.test(String(proofChecksum ?? '')) || proof.execution?.status !== 'SUCCEEDED' || proof.execution?.exitCode !== 0
    || !proof.execution?.command || !proof.execution?.producerRef || !proof.execution?.independentVerifierRef
    || !proof.execution?.outputRef || !HASH.test(String(proof.execution?.outputChecksum ?? ''))
    || !HASH.test(String(proof.execution?.producerRevision ?? ''))
    || !HASH.test(String(proof.execution?.independentVerifierRevision ?? ''))) throw new Error('BEHAVIOR_EXECUTION_NOT_VERIFIED');
  const outputBytes = fs.readFileSync(resolveRepoFile(root, proof.execution.outputRef));
  if (sha256(outputBytes) !== proof.execution.outputChecksum) throw new Error('BEHAVIOR_EXECUTION_OUTPUT_CHECKSUM_MISMATCH');
  if (sha256(fs.readFileSync(resolveRepoFile(root, proof.execution.producerRef))) !== proof.execution.producerRevision
    || sha256(fs.readFileSync(resolveRepoFile(root, proof.execution.independentVerifierRef))) !== proof.execution.independentVerifierRevision) {
    throw new Error('BEHAVIOR_EXECUTION_PRODUCER_REVISION_MISMATCH');
  }
  if (!Array.isArray(proof.expectedAssertions) || proof.expectedAssertions.length === 0 || !Array.isArray(proof.actualAssertions)) {
    throw new Error('BEHAVIOR_ASSERTIONS_REQUIRED');
  }
  const expectedIds = proof.expectedAssertions.map((assertion) => assertion?.id);
  const actualIds = proof.actualAssertions.map((assertion) => assertion?.id);
  if (expectedIds.some((id) => typeof id !== 'string' || !id.trim())
    || new Set(expectedIds).size !== expectedIds.length
    || expectedIds.length !== actualIds.length
    || expectedIds.some((id) => !actualIds.includes(id))
    || proof.expectedAssertions.some((assertion) => typeof assertion.expected !== 'string' || !assertion.expected.trim())
    || proof.actualAssertions.some((assertion) => typeof assertion.actual !== 'string' || typeof assertion.passed !== 'boolean')) {
    throw new Error('BEHAVIOR_ASSERTION_BINDING_INVALID');
  }
  if (!Array.isArray(proof.sourceEvidence) || proof.sourceEvidence.length < 2) throw new Error('IMPLEMENTATION_AND_TEST_EVIDENCE_REQUIRED');

  const sourceRefs = [];
  const sourceChecks = [];
  const sourceRoles = new Set();
  for (const evidence of proof.sourceEvidence) {
    if (!['implementation', 'test'].includes(evidence?.role)) throw new Error('SOURCE_EVIDENCE_ROLE_INVALID');
    if (!Number.isSafeInteger(evidence.startByte) || !Number.isSafeInteger(evidence.endByte)
      || evidence.startByte < 0 || evidence.endByte <= evidence.startByte
      || typeof evidence.expectedText !== 'string' || !evidence.expectedText) throw new Error('SOURCE_EVIDENCE_SPAN_INVALID');
    const sourcePath = resolveRepoFile(root, evidence.file);
    const bytes = fs.readFileSync(sourcePath);
    const sourceRevision = sha256(bytes);
    const spanBytes = bytes.subarray(evidence.startByte, evidence.endByte);
    if (evidence.sourceRevision !== sourceRevision || evidence.spanChecksum !== sha256(spanBytes)
      || spanBytes.toString('utf8') !== evidence.expectedText) throw new Error('SOURCE_EVIDENCE_READBACK_MISMATCH');
    const relativeFile = path.relative(root, sourcePath).replaceAll(path.sep, '/');
    const lineStart = lineAtByteOffset(bytes, evidence.startByte);
    const lineEnd = lineAtByteOffset(bytes, Math.max(evidence.startByte, evidence.endByte - 1));
    sourceRefs.push({ file: relativeFile, lineStart, lineEnd, sourceRevision });
    sourceChecks.push({ role: evidence.role, file: relativeFile, sourceRevision, startByte: evidence.startByte, endByte: evidence.endByte, spanChecksum: evidence.spanChecksum });
    sourceRoles.add(evidence.role);
  }
  if (!sourceRoles.has('implementation') || !sourceRoles.has('test')) throw new Error('IMPLEMENTATION_AND_TEST_EVIDENCE_REQUIRED');

  const taskBytes = fs.readFileSync(resolveRepoFile(root, task.tasksPath));
  const taskFileRevision = sha256(taskBytes);
  const assertions = proof.actualAssertions.map(({ id, actual, passed }) => ({
    id,
    claimRef: task.canonicalTaskRef,
    expected: proof.expectedAssertions.find((assertion) => assertion.id === id).expected,
    actual,
    passed: passed === true,
  }));
  const receipt = buildEvidenceReceiptV1({
    schema: 'atlas.evidence-receipt.v1',
    evidenceId: `receipt:${task.changeId}:${task.taskId}:scratch:${proofChecksum.slice(7, 31)}`,
    evidenceType: 'EXECUTION',
    changeId: task.changeId,
    taskId: task.taskId,
    canonicalTaskKey,
    taskRef: task.taskRef,
    claim: task.taskText,
    gitCommit: null,
    workspaceRevision,
    sourceRevision: taskFileRevision,
    taskRevision: task.taskHash,
    sourceRefs: [
      { file: task.tasksPath, lineStart: task.sourceLine, lineEnd: task.sourceLine, sourceRevision: taskFileRevision },
      ...sourceRefs,
    ],
    environmentFingerprint: proof.execution.environmentFingerprint ?? null,
    producer: proof.execution.producerRef,
    command: proof.execution.command,
    inputs: [{ kind: 'behavior-proof', uri: proof.execution.proofRef, checksum: proofChecksum }],
    observedAt: observedAt ?? proof.execution.completedAt,
    expectedAssertions: proof.expectedAssertions.map(({ id, expected }) => ({ id, claimRef: task.canonicalTaskRef, expected })),
    actualAssertions: assertions,
    outputs: [{ kind: 'behavior-test-output', uri: proof.execution.outputRef, checksum: proof.execution.outputChecksum }],
    verifier: 'scripts/atlas/prove-task-scoped-source-receipt-v1.mjs',
    independentVerifier: proof.execution.independentVerifierRef,
    readbackRequired: true,
    readbackPerformed: true,
    verdict: 'PARTIAL',
    sourceEvidenceChecks: sourceChecks,
    canonicalAuthority: false,
    writesPerformed: false,
    publicationScope: 'SCRATCH_ONLY',
  });
  return receipt;
}

export function verifyPublishedTaskEvidenceAdmissionV1({ auditReport, task, evidenceId, workspaceRevision }) {
  if (auditReport?.schema !== 'atlas.current-task-evidence-card-join-report.v1') throw new Error('CURRENT_TASK_ADMISSION_REPORT_SCHEMA_INVALID');
  if (auditReport.workspaceRevision !== workspaceRevision) throw new Error('CURRENT_TASK_ADMISSION_WORKSPACE_REVISION_MISMATCH');
  const admissions = auditReport.taskEvidenceAdmissions?.filter((entry) => entry.taskRef === task.taskRef) ?? [];
  if (admissions.length !== 1) throw new Error(`TASK_ADMISSION_CARDINALITY_INVALID:${admissions.length}`);
  const admission = admissions[0];
  const receiptDiscovered = auditReport.evidenceReceiptIds?.includes(evidenceId) === true
    || auditReport.taskEvidenceAdmissions.some((entry) => entry.evidenceRefs?.includes(evidenceId));
  return {
    status: admission.admitted === true && admission.evidenceRefs?.includes(evidenceId) && receiptDiscovered
      ? 'TASK_EVIDENCE_ADMITTED'
      : 'PUBLISHED_RECEIPT_NOT_ADMITTED',
    taskRef: task.taskRef,
    evidenceId,
    receiptDiscovered,
    admitted: admission.admitted === true && admission.evidenceRefs?.includes(evidenceId) === true,
    reasonCodes: admission.reasonCodes ?? [],
    workspaceRevision,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

function parseArgs(argv) {
  const options = { changeId: null, taskId: null, proofPath: null, outputPath: null, receiptId: null, verifyPublished: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--change-id') options.changeId = argv[++index] ?? null;
    else if (arg === '--task-id') options.taskId = argv[++index] ?? null;
    else if (arg === '--proof') options.proofPath = argv[++index] ?? null;
    else if (arg === '--output') options.outputPath = argv[++index] ?? null;
    else if (arg === '--receipt-id') options.receiptId = argv[++index] ?? null;
    else if (arg === '--verify-published') options.verifyPublished = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`UNKNOWN_ARGUMENT:${arg}`);
  }
  if (!options.help && (!options.changeId || !options.taskId || !options.outputPath
    || (options.verifyPublished ? !options.receiptId : !options.proofPath))) {
    throw new Error('REQUIRED: --change-id --task-id --output and either --proof or --verify-published --receipt-id');
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('Usage: node scripts/atlas/prove-task-scoped-source-receipt-v1.mjs --change-id <id> --task-id <id> --proof <proof.json> --output .tmp/<receipt.json>\n       node scripts/atlas/prove-task-scoped-source-receipt-v1.mjs --verify-published --change-id <id> --task-id <id> --receipt-id <id> --output .tmp/<admission.json>\n');
    return;
  }
  const census = buildPortfolioCensus(ROOT);
  const tasks = census.tasks.filter((task) => task.changeId === options.changeId && task.taskId === options.taskId);
  if (tasks.length !== 1) throw new Error(`CURRENT_TASK_CARDINALITY_INVALID:${tasks.length}`);
  const task = tasks[0];
  const identity = recoverOpenSpecTaskIdentitiesV1(census).mappings.find((mapping) => mapping.sourceRef === task.taskRef);
  if (!identity?.canonicalKeyAdmitted || !identity.canonicalTaskKey) throw new Error('CANONICAL_TASK_IDENTITY_NOT_ADMITTED');
  const outputPath = resolveRepoFile(ROOT, options.outputPath);
  const scratchPath = path.resolve(ROOT, '.tmp');
  const relativeOutput = path.relative(scratchPath, outputPath);
  if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) throw new Error('OUTPUT_MUST_BE_BELOW_TMP');

  if (options.verifyPublished) {
    const auditPath = `${outputPath}.task-evidence-audit.json`;
    execFileSync(process.execPath, [
      path.join(ROOT, 'scripts/atlas/audit-current-task-evidence-card-join-v1.mjs'),
      `--output=${path.relative(ROOT, auditPath).replaceAll(path.sep, '/')}`,
    ], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
    const auditReport = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    const result = verifyPublishedTaskEvidenceAdmissionV1({
      auditReport,
      task,
      evidenceId: options.receiptId,
      workspaceRevision: census.source.workspaceRevision,
    });
    const resultBytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`, 'utf8');
    fs.writeFileSync(outputPath, resultBytes, { flag: 'wx' });
    const readback = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    if (canonicalJson(readback) !== canonicalJson(result)) throw new Error('PUBLISHED_ADMISSION_READBACK_MISMATCH');
    process.stdout.write(`${JSON.stringify({ ...result, output: path.relative(ROOT, outputPath).replaceAll(path.sep, '/') }, null, 2)}\n`);
    return;
  }

  const proofPath = resolveRepoFile(ROOT, options.proofPath);
  const proofBytes = fs.readFileSync(proofPath);
  const proof = JSON.parse(proofBytes.toString('utf8'));
  const receipt = buildTaskScopedSourceReceiptCandidateV1({
    root: ROOT,
    task,
    canonicalTaskKey: identity.canonicalTaskKey,
    workspaceRevision: census.source.workspaceRevision,
    proof,
    proofChecksum: sha256(proofBytes),
  });
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, receiptBytes, { flag: 'wx' });
  const readback = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  verifyEvidenceReceiptV1(readback);
  if (canonicalJson(readback) !== canonicalJson(receipt)) throw new Error('RECEIPT_READBACK_MISMATCH');
  const censusAfterScratchReceipt = buildPortfolioCensus(ROOT);
  const censusDiscoveredScratchReceipt = censusAfterScratchReceipt.evidenceReceipts.some((entry) => entry.evidenceId === receipt.evidenceId);
  if (censusDiscoveredScratchReceipt) throw new Error('SCRATCH_RECEIPT_UNEXPECTEDLY_DISCOVERED_AS_CANONICAL_EVIDENCE');
  process.stdout.write(`${JSON.stringify({
    schema: 'atlas.task-scoped-source-receipt-proof.v1',
    status: 'SCRATCH_RECEIPT_READBACK_MATCH',
    evidenceId: receipt.evidenceId,
    receiptChecksum: receipt.checksum,
    taskRef: task.taskRef,
    taskRevision: task.taskHash,
    workspaceRevision: census.source.workspaceRevision,
    sourceEvidenceCount: receipt.sourceEvidenceChecks.length,
    scratchReceiptDiscoveredByCanonicalCensus: censusDiscoveredScratchReceipt,
    admission: 'NOT_EVALUATED_UNPUBLISHED_SCRATCH_RECEIPT',
    canonicalAuthority: false,
    writesPerformed: false,
    output: path.relative(ROOT, outputPath).replaceAll(path.sep, '/'),
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
