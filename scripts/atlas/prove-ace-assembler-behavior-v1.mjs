import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEvidenceReceiptV1, buildPortfolioCensus, verifyEvidenceReceiptV1 } from './audit-openspec-evidence-fabric-v1.mjs';
import { recoverOpenSpecTaskIdentitiesV1 } from './recover-openspec-task-identities-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHANGE_ID = 'parent-atlas-compute-rank-cache-eval-dspy-gepa';
const TASK_ID = 'ACE-ASSEMBLER-BEHAVIOR-01';
const IMPLEMENTATION = 'scripts/agent/ace-assembler-recommendations.mjs';
const TEST_FILE = 'scripts/atlas/lib/ace-assembler-behavior-v1.test.mjs';
const DEFAULT_SYMBOL_PROOF = '.tmp/atlas/live-packet-symbol-ast-observation-goal-refresh-20261009.json';
const HASH = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const RAW_HASH = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function sourceEvidence(file, needle, role) {
  const bytes = fs.readFileSync(path.join(ROOT, file));
  const needleBytes = Buffer.from(needle, 'utf8');
  const startByte = bytes.indexOf(needleBytes);
  if (startByte < 0 || bytes.indexOf(needleBytes, startByte + 1) >= 0) throw new Error(`SOURCE_EVIDENCE_NEEDLE_NOT_UNIQUE:${file}`);
  const span = bytes.subarray(startByte, startByte + needleBytes.length);
  return {
    role,
    file,
    sourceRevision: HASH(bytes),
    startByte,
    endByte: startByte + span.length,
    lineStart: bytes.subarray(0, startByte).toString('utf8').split(/\r\n|\r|\n/).length,
    lineEnd: bytes.subarray(0, startByte + span.length).toString('utf8').split(/\r\n|\r|\n/).length,
    expectedText: span.toString('utf8'),
    spanChecksum: HASH(span),
  };
}

const census = buildPortfolioCensus(ROOT);
const taskMatches = census.tasks.filter((task) => task.changeId === CHANGE_ID && task.taskId === TASK_ID);
if (taskMatches.length !== 1) throw new Error(`TASK_CARDINALITY_INVALID:${taskMatches.length}`);
const task = taskMatches[0];
const identity = recoverOpenSpecTaskIdentitiesV1(census).mappings.find((mapping) => mapping.sourceRef === task.taskRef);
if (!identity?.canonicalKeyAdmitted || !identity.canonicalTaskKey) throw new Error('TASK_CANONICAL_IDENTITY_NOT_ADMITTED');

const symbolProofArgument = process.argv.slice(2).find((argument) => argument.startsWith('--symbol-proof='))?.slice('--symbol-proof='.length)
  ?? DEFAULT_SYMBOL_PROOF;
const symbolProofPath = path.resolve(ROOT, symbolProofArgument);
const scratchRoot = `${path.resolve(ROOT, '.tmp', 'atlas')}${path.sep}`;
if (!symbolProofPath.startsWith(scratchRoot)) throw new Error('SYMBOL_PROOF_MUST_BE_UNDER_TMP_ATLAS');
const symbolProofBytes = fs.readFileSync(symbolProofPath);
const symbolProof = JSON.parse(symbolProofBytes.toString('utf8'));
const { checksum: symbolProofChecksum, ...symbolProofPayload } = symbolProof;
if (symbolProof.schema !== 'atlas.live-packet-symbol-ast-observation-proof.v1'
  || symbolProof.status !== 'READ_ONLY_SOURCE_AND_AST_OBSERVATION_MATCH'
  || symbolProofChecksum !== RAW_HASH(Buffer.from(JSON.stringify(symbolProofPayload), 'utf8'))
  || symbolProof.canonicalAuthority !== false
  || symbolProof.persistentStoreWritesPerformed !== false) throw new Error('LIVE_SYMBOL_PROOF_INVALID');
const symbolBinding = symbolProof.exactBinding;
const symbolSourceBytes = fs.readFileSync(path.join(ROOT, IMPLEMENTATION));
if (!symbolBinding?.packetKey || !symbolBinding.symbolVersionId || !symbolBinding.stableSymbolId
  || symbolBinding.sourceRef !== IMPLEMENTATION
  || symbolBinding.sourceRevision !== HASH(symbolSourceBytes)
  || symbolBinding.sourceBytesChecksum !== symbolBinding.sourceRevision
  || symbolBinding.workspaceRevision !== symbolProof.exactBinding.workspaceRevision
  || !/^sha256:[a-f0-9]{64}$/.test(String(symbolBinding.workspaceRevision ?? ''))
  || symbolBinding.admissionStatus !== 'PROPOSAL_ONLY'
  || symbolBinding.canonicalAuthority !== false) throw new Error('LIVE_SYMBOL_BINDING_MISMATCH');
const symbolSpan = symbolSourceBytes.subarray(symbolBinding.byteStart, symbolBinding.byteEnd);
if (!Number.isSafeInteger(symbolBinding.byteStart) || !Number.isSafeInteger(symbolBinding.byteEnd)
  || symbolBinding.byteStart < 0 || symbolBinding.byteEnd <= symbolBinding.byteStart
  || symbolBinding.byteEnd > symbolSourceBytes.length
  || RAW_HASH(symbolSpan) !== symbolBinding.spanChecksum
  || !symbolSpan.toString('utf8').includes(symbolBinding.qualifiedName)) throw new Error('LIVE_SYMBOL_SPAN_READBACK_MISMATCH');

const command = `node --test ${TEST_FILE}`;
const testOutput = execFileSync(process.execPath, ['--test', path.join(ROOT, TEST_FILE)], {
  cwd: ROOT,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
if (!/# tests 3\b/.test(testOutput) || !/# pass 3\b/.test(testOutput) || /# fail [1-9]/.test(testOutput)) {
  throw new Error('ACE_BEHAVIOR_TEST_RESULT_NOT_PROVEN');
}

const taskBytes = fs.readFileSync(path.join(ROOT, task.tasksPath));
const taskFileRevision = HASH(taskBytes);
const implementationSpan = sourceEvidence(
  IMPLEMENTATION,
  'return this.candidates.sort((a, b) => b.score - a.score).slice(0, this.options.maxCandidates);',
  'implementation',
);
const testSpan = sourceEvidence(
  TEST_FILE,
  "assert.deepEqual(ranked.map((candidate) => candidate.key), ['high', 'middle']);",
  'test',
);
const now = new Date().toISOString();
const runId = `${Date.now()}-${census.source.workspaceRevision.slice(7, 19)}`;
const runDirectory = path.join(ROOT, 'docs/reports/openspec-evidence', `ace-assembler-behavior-${runId}`);
fs.mkdirSync(runDirectory, { recursive: true });
const outputRelative = path.relative(ROOT, path.join(runDirectory, 'node-test-output.tap')).replaceAll(path.sep, '/');
const outputBytes = Buffer.from(testOutput, 'utf8');
fs.writeFileSync(path.join(ROOT, outputRelative), outputBytes, { flag: 'wx' });
const outputReadback = fs.readFileSync(path.join(ROOT, outputRelative));
if (!outputReadback.equals(outputBytes) || HASH(outputReadback) !== HASH(outputBytes)) throw new Error('TEST_OUTPUT_READBACK_MISMATCH');

const priorReceipts = fs.readdirSync(path.join(ROOT, 'docs/reports/openspec-evidence'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('ace-assembler-behavior-'))
  .flatMap((entry) => {
    const priorPath = path.join(ROOT, 'docs/reports/openspec-evidence', entry.name, 'evidence-receipt-v1.json');
    if (!fs.existsSync(priorPath)) return [];
    try {
      const prior = JSON.parse(fs.readFileSync(priorPath, 'utf8'));
      return prior.changeId === CHANGE_ID && prior.taskId === TASK_ID ? [prior] : [];
    } catch {
      return [];
    }
  })
  .sort((left, right) => String(right.observedAt).localeCompare(String(left.observedAt)));

const claimRef = task.canonicalTaskRef;
const expectedAssertions = [
  { id: 'descending-top-k', claimRef, expected: 'rankCandidates returns candidates ordered by descending score and capped at maxCandidates.' },
  { id: 'context-top-k', claimRef, expected: 'assembleContext includes selected candidates and evidence while excluding candidates below top-K.' },
  { id: 'recommendation-order', claimRef, expected: 'generateRecommendations preserves selected candidate order and assigns sequential ranks.' },
];
const actualAssertions = expectedAssertions.map((assertion) => ({
  ...assertion,
  actual: 'The corresponding node:test behavioral assertion passed in the captured execution; the three-test TAP output was independently reopened and checksum-matched.',
  passed: true,
}));
const receipt = buildEvidenceReceiptV1({
  schema: 'atlas.evidence-receipt.v1',
  evidenceId: `receipt:${CHANGE_ID}:${TASK_ID}:${runId}`,
  evidenceType: 'EXECUTION',
  changeId: CHANGE_ID,
  taskId: TASK_ID,
  canonicalTaskKey: identity.canonicalTaskKey,
  taskRef: task.taskRef,
  claim: task.taskText,
  gitCommit: null,
  workspaceRevision: census.source.workspaceRevision,
  sourceRevision: taskFileRevision,
  taskRevision: task.taskHash,
  sourceRefs: [
    { file: task.tasksPath, lineStart: task.sourceLine, lineEnd: task.sourceLine, sourceRevision: taskFileRevision },
    { file: IMPLEMENTATION, lineStart: implementationSpan.lineStart, lineEnd: implementationSpan.lineEnd, sourceRevision: implementationSpan.sourceRevision },
    { file: TEST_FILE, lineStart: testSpan.lineStart, lineEnd: testSpan.lineEnd, sourceRevision: testSpan.sourceRevision },
  ],
  environmentFingerprint: HASH(Buffer.from(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch }))),
  producer: 'scripts/atlas/prove-ace-assembler-behavior-v1.mjs',
  command,
  inputs: [
    { kind: 'implementation-span', uri: `${IMPLEMENTATION}#byte:${implementationSpan.startByte}-${implementationSpan.endByte}`, checksum: implementationSpan.spanChecksum },
    { kind: 'behavior-test-span', uri: `${TEST_FILE}#byte:${testSpan.startByte}-${testSpan.endByte}`, checksum: testSpan.spanChecksum },
    { kind: 'live-packet-symbol-ast-proof', uri: path.relative(ROOT, symbolProofPath).replaceAll(path.sep, '/'), checksum: HASH(symbolProofBytes) },
  ],
  symbolBinding: {
    packetKey: symbolBinding.packetKey,
    stableSymbolId: symbolBinding.stableSymbolId,
    symbolVersionId: symbolBinding.symbolVersionId,
    qualifiedName: symbolBinding.qualifiedName,
    sourceRef: symbolBinding.sourceRef,
    sourceRevision: symbolBinding.sourceRevision,
    symbolWorkspaceRevision: symbolBinding.workspaceRevision,
    byteStart: symbolBinding.byteStart,
    byteEnd: symbolBinding.byteEnd,
    spanChecksum: symbolBinding.spanChecksum,
    astObservationId: symbolBinding.astObservation?.observation_id ?? null,
    proofChecksum: symbolProofChecksum,
    proofStatus: symbolProof.status,
    canonicalAuthority: false,
  },
  ...(priorReceipts[0] ? { supersedesEvidenceId: priorReceipts[0].evidenceId } : {}),
  observedAt: now,
  expectedAssertions,
  actualAssertions,
  outputs: [{ kind: 'node-test-tap-output', uri: outputRelative, checksum: HASH(outputReadback) }],
  verifier: 'node --test plus independent TAP output readback and checksum verification',
  independentVerifier: 'scripts/atlas/prove-ace-assembler-behavior-v1.mjs',
  readbackRequired: true,
  readbackPerformed: true,
  verdict: 'PROVEN',
  sourceEvidenceChecks: [implementationSpan, testSpan].map(({ role, file, sourceRevision, startByte, endByte, spanChecksum }) => ({ role, file, sourceRevision, startByte, endByte, spanChecksum })),
  canonicalAuthority: false,
  writesPerformed: false,
});

const receiptPath = path.join(runDirectory, 'evidence-receipt-v1.json');
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
const readback = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
verifyEvidenceReceiptV1(readback);
if (JSON.stringify(readback) !== JSON.stringify(receipt)) throw new Error('EVIDENCE_RECEIPT_READBACK_MISMATCH');
process.stdout.write(`${JSON.stringify({
  status: 'BEHAVIOR_RECEIPT_PROVEN',
  taskRef: task.taskRef,
  canonicalTaskKey: identity.canonicalTaskKey,
  workspaceRevision: census.source.workspaceRevision,
  taskRevision: task.taskHash,
  evidenceId: receipt.evidenceId,
  receiptChecksum: receipt.checksum,
  packetKey: symbolBinding.packetKey,
  symbolVersionId: symbolBinding.symbolVersionId,
  symbolWorkspaceRevision: symbolBinding.workspaceRevision,
  assertionsPassed: actualAssertions.length,
  sourceEvidence: [implementationSpan, testSpan].map(({ role, file, sourceRevision, startByte, endByte, spanChecksum }) => ({ role, file, sourceRevision, startByte, endByte, spanChecksum })),
  tapOutput: outputRelative,
  receipt: path.relative(ROOT, receiptPath).replaceAll(path.sep, '/'),
  independentReadback: 'MATCH',
  canonicalAuthority: false,
  writesPerformed: false,
}, null, 2)}\n`);
