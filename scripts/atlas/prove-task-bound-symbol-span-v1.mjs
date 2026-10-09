import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEvidenceReceiptV1, buildPortfolioCensus } from './audit-openspec-evidence-fabric-v1.mjs';
import { recoverOpenSpecTaskIdentitiesV1 } from './recover-openspec-task-identities-v1.mjs';
import { predicateIdForTaskClaim } from './resolve-openspec-predicates-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_REPORT = '.tmp/atlas/live-langextract-grounding-goal-20261009.json';
const TASK_CLAIM = '**NLP-GROUND-SYMBOL-SPAN-READBACK-01:** independently reopen current source bytes and verify the reported Valkey mention\'s exact byte span and checksum; preserve proposal-only status. This proves source-byte alignment for the reported mention only—not extractor-response authenticity, a typed fact, ontology admission, runtime use, or persistence.';

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

export function verifyTaskBoundSymbolSpanV1(report, sourceBytes) {
  if (report?.schema !== 'atlas.live-langextract-source-grounding-receipt.v1') throw new Error('LANGEXTRACT_REPORT_SCHEMA_INVALID');
  if (!report.receiptChecksum || report.independentReadback?.receiptChecksum !== report.receiptChecksum) throw new Error('PRIOR_RECEIPT_REFERENCE_MISMATCH');
  if (report.proofReadback !== 'MATCH' || report.independentReadback?.status !== 'MATCH') throw new Error('PRIOR_SOURCE_READBACK_NOT_PROVEN');
  if (report.canonicalAuthority !== false || report.writesPerformed !== false || report.factAdmission !== 'NOT_PERFORMED') throw new Error('PROPOSAL_ONLY_BOUNDARY_INVALID');

  const source = report.source;
  const spans = report.extraction?.validation?.spanResults;
  if (!source?.sourceRef || !source?.sourceRevision || !Array.isArray(spans) || spans.length !== 1) throw new Error('SINGLE_BOUND_SPAN_REQUIRED');
  const currentSourceRevision = sha256(sourceBytes);
  if (currentSourceRevision !== source.sourceRevision || currentSourceRevision !== source.currentSourceRevision) throw new Error('SOURCE_REVISION_MISMATCH');

  const span = spans[0];
  if (span.status !== 'SOURCE_SPAN_READBACK_MATCH' || span.extractionClass !== 'CONCEPT') throw new Error('SPAN_NOT_PROPOSAL_CONCEPT');
  if (!Number.isSafeInteger(span.startByte) || !Number.isSafeInteger(span.endByte) || span.startByte < 0 || span.endByte <= span.startByte || span.endByte > sourceBytes.length) throw new Error('SOURCE_SPAN_OUT_OF_RANGE');
  const extracted = sourceBytes.subarray(span.startByte, span.endByte);
  if (extracted.toString('utf8') !== 'Valkey' || sha256(extracted) !== span.spanChecksum) throw new Error('SOURCE_SPAN_CONTENT_MISMATCH');
  if (source.sourceRef !== 'scripts/agent/ace-assembler-recommendations.mjs' || source.packetKey !== 'ace:packet:3d01c1df26b3') throw new Error('SELECTED_SYMBOL_BINDING_MISMATCH');

  return {
    schema: 'atlas.task-bound-symbol-span-readback.v1',
    status: 'SOURCE_SPAN_READBACK_MATCH',
    sourceRef: source.sourceRef,
    sourceRevision: currentSourceRevision,
    sourceByteLength: sourceBytes.length,
    packetKey: source.packetKey,
    symbolVersionId: source.symbolVersionId,
    span: { startByte: span.startByte, endByte: span.endByte, text: extracted.toString('utf8'), checksum: span.spanChecksum },
    extractorRevision: report.extraction.providerRevision,
    extractionResponseChecksum: report.extraction.responseChecksum,
    priorReceiptChecksum: report.receiptChecksum,
    historicalExtractorWorkspaceRevision: source.workspaceRevision,
    currentTaskCensusWorkspaceRevision: 'NOT_BOUND_BY_THIS_SPAN_PROOF',
    semanticFactAdmission: 'NOT_PERFORMED',
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

function main() {
  const reportPath = path.resolve(ROOT, process.argv[2] ?? DEFAULT_REPORT);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const sourceBytes = fs.readFileSync(path.join(ROOT, report.source.sourceRef));
  const result = verifyTaskBoundSymbolSpanV1(report, sourceBytes);
  const census = buildPortfolioCensus(ROOT);
  const task = census.tasks.filter((candidate) => candidate.changeId === 'parent-atlas-retrieval-lineage-dag-convergence' && candidate.taskText.trim() === TASK_CLAIM);
  if (task.length !== 1) throw new Error(`TASK_CLAIM_CARDINALITY_INVALID:${task.length}`);
  const taskRecord = task[0];
  const identity = recoverOpenSpecTaskIdentitiesV1(census).mappings.find((mapping) => mapping.sourceRef === taskRecord.taskRef);
  if (!identity?.canonicalKeyAdmitted || !identity.canonicalTaskKey) throw new Error('TASK_CANONICAL_IDENTITY_NOT_ADMITTED');

  const runId = `${Date.now()}-${census.source.workspaceRevision.slice(7, 19)}`;
  const runDirectory = path.join(ROOT, 'docs', 'reports', 'openspec-evidence', `nlp-symbol-span-${runId}`);
  fs.mkdirSync(runDirectory, { recursive: true });
  const proofPath = path.join(runDirectory, 'symbol-span-readback-v1.json');
  const receiptPath = path.join(runDirectory, 'symbol-span-evidence-receipt-v1.json');
  const proof = { ...result, generatedAt: new Date().toISOString() };
  const proofBytes = Buffer.from(`${JSON.stringify(proof, null, 2)}\n`, 'utf8');
  fs.writeFileSync(proofPath, proofBytes, { flag: 'wx' });

  const sourceLine = sourceBytes.subarray(0, report.extraction.validation.spanResults[0].startByte).toString('utf8').split('\n').length;
  const taskFileBytes = fs.readFileSync(path.join(ROOT, taskRecord.tasksPath));
  const taskFileRevision = sha256(taskFileBytes);
  const claimRef = predicateIdForTaskClaim(taskRecord.canonicalTaskRef, 0, taskRecord.taskText);
  const assertions = [
    ['source-revision-current', 'sourceRevision equals the independently recomputed full-file SHA-256'],
    ['span-bytes-match', 'the recorded UTF-8 byte range resolves exactly to Valkey and matches the span checksum'],
    ['proposal-only', 'the source-grounded mention remains non-authoritative and no admission or writes occur'],
  ].map(([id, expected]) => ({ id, claimRef, expected, actual: expected, passed: true }));
  const receipt = buildEvidenceReceiptV1({
    schema: 'atlas.evidence-receipt.v1',
    evidenceId: `receipt:${taskRecord.changeId}:${taskRecord.taskId}:${runId}`,
    evidenceType: 'STATIC',
    changeId: taskRecord.changeId,
    taskId: taskRecord.taskId,
    canonicalTaskKey: identity.canonicalTaskKey,
    taskRef: taskRecord.taskRef,
    claim: taskRecord.taskText,
    workspaceRevision: census.source.workspaceRevision,
    sourceRevision: taskFileRevision,
    taskRevision: taskRecord.taskHash,
    sourceRefs: [
      { file: taskRecord.tasksPath, lineStart: taskRecord.sourceLine, lineEnd: taskRecord.sourceLine, sourceRevision: taskFileRevision },
      { file: report.source.sourceRef, lineStart: sourceLine, lineEnd: sourceLine, sourceRevision: result.sourceRevision },
    ],
    environmentFingerprint: sha256(Buffer.from(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch }))),
    producer: 'scripts/atlas/prove-task-bound-symbol-span-v1.mjs',
    command: `node scripts/atlas/prove-task-bound-symbol-span-v1.mjs ${path.relative(ROOT, reportPath).replaceAll('\\', '/')}`,
    inputs: [
      { kind: 'source', uri: report.source.sourceRef, sourceRef: `${report.source.sourceRef}#byte:${result.span.startByte}-${result.span.endByte}`, checksum: result.sourceRevision },
      { kind: 'prior-observation', uri: path.relative(ROOT, reportPath).replaceAll('\\', '/'), checksum: report.receiptChecksum },
    ],
    observedAt: proof.generatedAt,
    expectedAssertions: assertions.map(({ id, claimRef: assertionClaimRef, expected }) => ({ id, claimRef: assertionClaimRef, expected })),
    actualAssertions: assertions,
    outputs: [{ kind: 'source-span-readback', uri: path.relative(ROOT, proofPath).replaceAll('\\', '/'), checksum: sha256(proofBytes) }],
    verifier: 'independent-source-byte-span-readback',
    independentVerifier: 'prove-task-bound-symbol-span-v1',
    readbackRequired: false,
    readbackPerformed: true,
    verdict: 'PROVEN',
  });
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ ...result, taskId: taskRecord.taskId, taskRevision: taskRecord.taskHash, currentTaskCensusWorkspaceRevision: census.source.workspaceRevision, proof: path.relative(ROOT, proofPath).replaceAll('\\', '/'), evidenceReceipt: path.relative(ROOT, receiptPath).replaceAll('\\', '/'), evidenceReceiptChecksum: receipt.checksum }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
