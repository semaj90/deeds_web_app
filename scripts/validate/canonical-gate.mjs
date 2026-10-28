#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCanonicalGateReceiptV2, classifyProcessResult, combineProcessAndPredicateResult, verifyCanonicalGateEvidenceV2, verifyCanonicalGateReceiptV2 } from './canonical-gate-core.mjs';
import { verifyNeo4jGraphCoverageReceiptV2 } from '../atlas/lib/neo4j-graph-coverage-v2.mjs';
import { reconcileOkfAudit } from './okf-reconciliation-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length) : null;
const runId = `${new Date().toISOString().replaceAll(':', '-')}-${crypto.randomUUID()}`;
const runDir = path.join(root, '.tmp', 'atlas', 'canonical-gate-runs', runId);
fs.mkdirSync(runDir, { recursive: true });

function parseJson(stdout) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { return JSON.parse(stdout.slice(start, end + 1)); } catch { return null; }
}

function readJsonFile(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function findFiles(rootDir, name) {
  if (!fs.existsSync(rootDir)) return [];
  const matches = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const candidate = path.join(rootDir, entry.name);
    if (entry.isDirectory()) matches.push(...findFiles(candidate, name));
    else if (entry.name === name) matches.push(candidate);
  }
  return matches;
}

function fileDigest(filePath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function runCheck(spec) {
  const outputPath = path.join(runDir, `${spec.id}.json`);
  const preparation = spec.prepare?.(outputPath) ?? null;
  const args = spec.args(outputPath);
  const startedAt = Date.now();
  const result = preparation && (preparation.status !== 0 || preparation.error)
    ? { ...preparation, stderr: preparation.stderr ?? '', stdout: preparation.stdout ?? '' }
    : spawnSync(process.execPath, args, {
      cwd: spec.cwd ?? root,
      encoding: 'utf8',
      timeout: 240000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
  const stdout = result.stdout ?? '';
  let outputJson = readJsonFile(spec.resultPath?.(outputPath) ?? outputPath);
  if (spec.id === 'service-health' && !fs.existsSync(outputPath)) {
    outputJson = {
      validator: spec.id,
      exitCode: result.status,
      stdoutSha256: `sha256:${crypto.createHash('sha256').update(stdout).digest('hex')}`,
      stderrSha256: `sha256:${crypto.createHash('sha256').update(result.stderr ?? '').digest('hex')}`,
    };
    fs.writeFileSync(outputPath, `${JSON.stringify(outputJson, null, 2)}\n`, { flag: 'wx' });
  }
  const parsed = outputJson ?? parseJson(stdout);
  const processState = classifyProcessResult({
    status: result.status,
    error: result.error?.message,
    timedOut: result.error?.code === 'ETIMEDOUT',
    parsed: spec.needsJson ? parsed : {},
  });
  const predicate = combineProcessAndPredicateResult(processState, parsed ? spec.evaluate(parsed) : null);
  const evidencePaths = spec.evidencePaths?.(outputPath) ?? [outputPath];
  const missingEvidence = evidencePaths.filter((filePath) => !fs.existsSync(filePath));
  const evidence = evidencePaths
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => ({ path: path.relative(root, filePath).replaceAll('\\', '/'), sha256: fileDigest(filePath) }));
  if (missingEvidence.length > 0 && processState.verdict === 'PASS') {
    predicate.verdict = 'FAIL';
    predicate.reasons = [...(predicate.reasons ?? []), ...missingEvidence.map((filePath) => `MISSING_REPORT:${path.relative(root, filePath).replaceAll('\\', '/')}`)];
  }
  return {
    id: spec.id,
    category: spec.category,
    validatorVersion: fileDigest(spec.validatorPath),
    required: true,
    verdict: predicate.verdict,
    reasons: predicate.reasons ?? [],
    executionStatus: predicate.executionStatus,
    promotionStatus: predicate.promotionStatus,
    exitCode: result.status,
    durationMs: Date.now() - startedAt,
    evidence,
  };
}

const tsx = (scriptPath, args = []) => ['node_modules/tsx/dist/cli.mjs', scriptPath, ...args];
const admittedRevision = readJsonFile(path.join(root, 'docs/reports/workspace-revision-tournament-admission-v1.json')) ?? {};
const packetAdmissionRootDir = path.join(root, 'docs/reports/packet-admission-v1');
const admissionRoots = fs.existsSync(packetAdmissionRootDir)
  ? fs.readdirSync(packetAdmissionRootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packetAdmissionRootDir, entry.name, 'root.json'))
    .map((filePath) => ({ filePath, root: readJsonFile(filePath) }))
    .filter(({ root: manifest }) => manifest?.workspaceRevision === admittedRevision.workspaceRevision)
    .map(({ filePath }) => filePath)
  : [];
const admissionRoot = admissionRoots.length === 1 ? path.basename(path.dirname(admissionRoots[0])) : null;
const packetAdmissionOutput = path.join(runDir, 'packet-identity');
fs.mkdirSync(packetAdmissionOutput, { recursive: true });
const packetAdmissionRoot = admissionRoot
  ? readJsonFile(path.join(root, 'docs/reports/packet-admission-v1', admissionRoot, 'root.json'))
  : null;

const specs = [
  {
    id: 'service-health', category: 'SERVICE_HEALTH', needsJson: false,
    validatorPath: 'scripts/validate-graphify-startup.mjs',
    args: () => ['scripts/validate-graphify-startup.mjs'],
    evaluate: () => ({ verdict: 'PASS', reasons: [] }),
  },
  {
    id: 'source-snapshot', category: 'SOURCE_SNAPSHOT', needsJson: true,
    validatorPath: 'scripts/atlas/audit-current-graphify-snapshot-authority-v1.mts',
    args: () => tsx('scripts/atlas/audit-current-graphify-snapshot-authority-v1.mts', [`--report-dir=${path.relative(root, runDir).replaceAll('\\', '/')}`]),
    resultPath: () => path.join(runDir, 'current-graphify-snapshot-authority-v1.json'),
    evidencePaths: () => [path.join(runDir, 'current-graphify-snapshot-authority-v1.json'), path.join(runDir, 'current-source-selection-input-v1.json')],
    evaluate: (json) => json.status === 'CURRENT_SNAPSHOT_PROVEN'
      && json.sourceSnapshot?.workspaceRevision === admittedRevision.workspaceRevision
      && json.sourceSnapshot?.snapshotRevision === admittedRevision.snapshotRevision
      ? { verdict: 'PASS', reasons: [] }
      : { verdict: 'PARTIAL', reasons: [`SNAPSHOT_STATUS_OR_REVISION_MISMATCH:${json.status ?? 'MISSING'}`] },
  },
  {
    id: 'packet-identity', category: 'PACKET_IDENTITY', needsJson: true,
    validatorPath: 'scripts/atlas/build-packet-key-v2-admission-manifest-v1.mts',
    args: () => admissionRoot
      ? tsx('scripts/atlas/build-packet-key-v2-admission-manifest-v1.mts', ['--admission-root', admissionRoot, '--repository-scope', 'repo:root', '--output-root', path.relative(root, packetAdmissionOutput).replaceAll('\\', '/')])
      : ['-e', 'process.exit(3)'],
    evidencePaths: () => {
      const found = findFiles(packetAdmissionOutput, 'packet-key-v2-admission-gate-v1.json');
      return found.length === 1 ? found : [path.join(packetAdmissionOutput, 'packet-key-v2-admission-gate-v1.json')];
    },
    resultPath: () => findFiles(packetAdmissionOutput, 'packet-key-v2-admission-gate-v1.json')[0] ?? path.join(packetAdmissionOutput, 'packet-key-v2-admission-gate-v1.json'),
    evaluate: (json) => json?.status === 'ADMISSION_READY'
      ? { verdict: 'PASS', reasons: [] }
      : { verdict: 'BLOCKED', reasons: [`IDENTITY_GATE:${json?.gate ?? 'MISSING'}`, ...(json?.gateBlockers ?? [])] },
  },
  {
    id: 'graph-integrity', category: 'GRAPH_INTEGRITY', needsJson: true,
    validatorPath: 'scripts/atlas/validate-graph-json-contract.mjs',
    prepare: () => {
      const outputRoot = path.join(root, '.tmp', 'atlas');
      const graphPath = path.join(runDir, 'neo4j-graph-export.json');
      const coveragePath = path.join(runDir, 'neo4j-export-coverage-v2.json');
      const relativeToOutputRoot = (filePath) => path.relative(outputRoot, filePath).replaceAll('\\', '/');
      return spawnSync(process.execPath, [
        'scripts/atlas/export-neo4j-graph-json.mjs',
        `--out=${relativeToOutputRoot(graphPath)}`,
        `--receipt=${relativeToOutputRoot(coveragePath)}`,
      ], { cwd: root, encoding: 'utf8', timeout: 240000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    },
    args: (out) => [
      'scripts/atlas/validate-graph-json-contract.mjs',
      `--in=${path.relative(root, path.join(runDir, 'neo4j-graph-export.json')).replaceAll('\\', '/')}`,
      `--report=${path.relative(root, out).replaceAll('\\', '/')}`,
    ],
    evidencePaths: (out) => [
      path.join(runDir, 'neo4j-graph-export.json'),
      path.join(runDir, 'neo4j-export-coverage-v2.json'),
      out,
    ],
    evaluate: (json) => {
      if (json.verdict === 'PASS') return { verdict: 'PASS', reasons: [] };
      const failedTests = Object.entries(json.validation_tests ?? {})
        .filter(([, result]) => result?.status === 'FAIL')
        .map(([name]) => `GRAPH_TEST_FAILED:${name.toUpperCase()}`);
      const coverageReasons = json.validation_tests?.export_coverage?.reasons ?? [];
      return {
        verdict: 'FAIL',
        reasons: [`GRAPH_CONTRACT:${json.verdict ?? 'MISSING'}`, ...failedTests, ...coverageReasons.map((reason) => `EXPORT_COVERAGE:${reason}`)],
      };
    },
  },
  {
    id: 'execution-authority', category: 'EXECUTION_AUTHORITY', needsJson: true,
    validatorPath: 'scripts/atlas/plan-current-graphify-execution-owner-resolution-v1.mjs',
    args: (out) => ['scripts/atlas/plan-current-graphify-execution-owner-resolution-v1.mjs', '--output', path.relative(root, out).replaceAll('\\', '/')],
    evaluate: (json) => {
      const candidate = json.candidates?.length === 1 ? json.candidates[0] : null;
      const exactReadback = Boolean(candidate)
        && candidate.status && ['COMPLETED', 'COMPLETED_REUSED'].includes(candidate.status)
        && candidate.workspace_revision === admittedRevision.workspaceRevision
        && candidate.sourceMembershipExact === true
        && candidate.sourceRefChecksum === candidate.expectedRefChecksum
        && candidate.identityChecksum === candidate.expectedIdentityChecksum
        && candidate.contentChecksum === candidate.expectedContentChecksum
        && candidate.execution_id === packetAdmissionRoot?.executionId
        && json.sourceSelectionChecksum === admittedRevision.sourceSelectionChecksum
        && json.equivalence?.distinctEvidenceSignatures === 1;
      const authorized = exactReadback && candidate.canonical_authority === true && json.existingCanonicalOwner?.executionId === candidate.execution_id;
      return {
        verdict: authorized ? 'PASS' : 'BLOCKED',
        executionStatus: exactReadback ? 'TERMINAL_READBACK_VERIFIED' : 'NOT_VERIFIED',
        promotionStatus: authorized ? 'CANONICAL_OWNER_VERIFIED' : 'NOT_PROMOTED',
        reasons: authorized ? [] : [exactReadback ? 'CANONICAL_AUTHORITY_NOT_ESTABLISHED' : 'EXECUTION_READBACK_PRECONDITIONS_FAILED'],
      };
    },
  },
  {
    id: 'ontology-schema', category: 'ONTOLOGY_SCHEMA', needsJson: true,
    validatorPath: 'scripts/atlas/audit-okf-v02-bundle-v1.mjs',
    args: (out) => ['scripts/atlas/audit-okf-v02-bundle-v1.mjs', '.okf', path.relative(root, out).replaceAll('\\', '/')],
    evaluate: (json) => {
      // Cause counts explain the verdict; they never relax it.
      const causes = Array.isArray(json.files)
        ? Object.entries(reconcileOkfAudit(json.files).byCause).filter(([, row]) => row.files > 0).map(([cause, row]) => `OKF_CAUSE:${cause}:${row.files}`)
        : ['OKF_CAUSE:UNAVAILABLE_NO_FILE_LIST'];
      return json.status === 'OKF_V02_PROFILE_PROVEN' && json.invalidFiles === 0 && json.excludedFiles === 0
        ? { verdict: 'PASS', reasons: [] }
        : json.invalidFiles > 0
          ? { verdict: 'FAIL', reasons: [`INVALID_OKF_FILES:${json.invalidFiles}`, `EXCLUDED_FILES:${json.excludedFiles ?? 'UNKNOWN'}`, ...causes] }
          : { verdict: 'PARTIAL', reasons: [`OKF_STATUS:${json.status ?? 'MISSING'}`, `EXCLUDED_FILES:${json.excludedFiles ?? 'UNKNOWN'}`, ...causes] };
    },
  },
  {
    id: 'graph-coverage', category: 'GRAPH_COVERAGE', needsJson: true,
    validatorPath: 'scripts/atlas/audit-neo4j-graph-coverage-v2.mjs',
    args: (out) => ['scripts/atlas/audit-neo4j-graph-coverage-v2.mjs', `--output=${path.relative(root, out).replaceAll('\\', '/')}`],
    evaluate: (json) => verifyNeo4jGraphCoverageReceiptV2(json)
      && Number.isSafeInteger(json.nodesConsidered) && json.nodesConsidered > 0
      && Number.isSafeInteger(json.relationshipsConsidered) && json.relationshipsConsidered > 0
      ? { verdict: 'PARTIAL', reasons: ['LIVE_CENSUS_ONLY_GRAPH_NOT_EXPORTED', 'COVERAGE_THRESHOLDS_NOT_DEFINED'] }
      : { verdict: 'FAIL', reasons: ['GRAPH_COVERAGE_RECEIPT_INVALID_OR_EMPTY'] },
  },
  {
    // Directory census of the admitted execution. A passing census never grants projection permission:
    // while any blocking predicate remains this check can be at most PARTIAL.
    id: 'repository-coverage', category: 'REPOSITORY_COVERAGE', needsJson: true,
    validatorPath: 'scripts/validate/repository-wide-coverage-v1.mjs',
    args: () => ['scripts/validate/repository-wide-coverage-v1.mjs', `--receipt=${path.relative(root, path.join(runDir, 'repository-wide-coverage-receipt-v1.json')).replaceAll('\\', '/')}`],
    evidencePaths: () => [path.join(runDir, 'repository-wide-coverage-receipt-v1.json')],
    evaluate: (json) => {
      if (json.finalStatus !== 'REPOSITORY_WIDE_COVERAGE_READ_ONLY_VERIFIED' || json.totalsReconcile?.exactlyReconciled !== true) {
        return { verdict: 'FAIL', reasons: ['COVERAGE_CENSUS_NOT_RECONCILED'] };
      }
      const violations = Object.entries(json.integrity ?? {}).filter(([, count]) => count > 0).map(([name, count]) => `${name}:${count}`);
      if (violations.length > 0) return { verdict: 'FAIL', reasons: violations.map((v) => `INTEGRITY_VIOLATION:${v}`) };
      if (json.safeToProject !== false) return { verdict: 'FAIL', reasons: ['PROJECTION_PERMISSION_MUST_NOT_BE_IMPLIED'] };
      const blockers = json.blockingPredicates ?? [];
      return blockers.length > 0
        ? { verdict: 'PARTIAL', reasons: blockers.map((b) => `COVERAGE_BLOCKER:${b}`) }
        : { verdict: 'PASS', reasons: [] };
    },
  },
];

if (only && !specs.some((spec) => spec.id === only)) {
  console.error(`Unknown check id: ${only}`);
  process.exit(2);
}
const checks = specs.map((spec) => only && spec.id !== only
  ? { id: spec.id, category: spec.category, validatorVersion: fileDigest(spec.validatorPath), required: true, verdict: 'SKIPPED', reasons: ['SUBSET_RUN'], exitCode: null, durationMs: 0, evidence: [] }
  : runCheck(spec));
for (const category of ['PROJECTION_ADMISSION']) {
  checks.push({
    id: category.toLowerCase().replaceAll('_', '-'),
    category,
    required: true,
    verdict: 'UNKNOWN',
    reasons: ['NO_CURRENT_OWNER_VALIDATOR_CONFIGURED'],
    exitCode: null,
    durationMs: null,
    evidence: [],
  });
}
const receipt = buildCanonicalGateReceiptV2({
  runId,
  createdAtUtc: new Date().toISOString(),
  workspaceRevision: admittedRevision.workspaceRevision ?? null,
  snapshotRevision: admittedRevision.snapshotRevision ?? null,
  graphifyExecutionId: packetAdmissionRoot?.executionId ?? null,
  checks,
});
if (!verifyCanonicalGateReceiptV2(receipt)) throw new Error('CANONICAL_GATE_RECEIPT_CHECKSUM_INVALID');
const evidenceVerification = verifyCanonicalGateEvidenceV2(receipt, { root });
if (!evidenceVerification.valid) throw new Error(`CANONICAL_GATE_EVIDENCE_INVALID:${evidenceVerification.reasons.join(';')}`);
const receiptPath = path.join(runDir, 'canonical-gate-receipt-v2.json');
const tempReceiptPath = `${receiptPath}.${process.pid}.tmp`;
const descriptor = fs.openSync(tempReceiptPath, 'wx');
try { fs.writeFileSync(descriptor, `${JSON.stringify(receipt, null, 2)}\n`); } finally { fs.closeSync(descriptor); }
fs.renameSync(tempReceiptPath, receiptPath);
for (const check of checks) console.log(`${check.verdict} ${check.category}/${check.id}: ${check.reasons.join('; ') || 'ok'}`);
console.log(`${receipt.overall} ${path.relative(root, receiptPath).replaceAll('\\', '/')}`);
process.exit(receipt.overall === 'PASS' ? 0 : 1);
