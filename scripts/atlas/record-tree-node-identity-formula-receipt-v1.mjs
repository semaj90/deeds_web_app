import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditTreeNodeIdentityFormula } from './audit-tree-node-identity-formula-v1.mjs';
import { buildEvidenceReceiptV1, buildPortfolioCensus } from './audit-openspec-evidence-fabric-v1.mjs';
import { recoverOpenSpecTaskIdentitiesV1 } from './recover-openspec-task-identities-v1.mjs';
import { predicateIdForTaskClaim } from './resolve-openspec-predicates-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TASK_CLAIM = 'Capture the current `atlas_tree_nodes.node_id` formula as a revision-bound parse-occurrence identity.';

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

export function buildTreeNodeIdentityFormulaReceiptV1(census, audit, auditUri, root = ROOT, runId = process.env.OPENSPEC_EVIDENCE_RUN_ID ?? audit.generatedAt) {
  if (census?.schema !== 'atlas.openspec-evidence-portfolio-census.v2') throw new Error('CENSUS_SCHEMA_UNSUPPORTED');
  if (audit?.status !== 'STATIC_FORMULA_PROVEN_LIVE_POPULATION_UNPROVEN' || !audit.checksum) throw new Error('STATIC_FORMULA_AUDIT_NOT_PROVEN');
  const { checksum: auditChecksum, ...auditUnsigned } = audit;
  if (sha256(canonicalJson(auditUnsigned)) !== auditChecksum) throw new Error('STATIC_FORMULA_AUDIT_CHECKSUM_INVALID');
  const tasks = census.tasks.filter((candidate) => candidate.changeId === 'parent-atlas-graph-retrieval-proof' && candidate.taskText.trim() === TASK_CLAIM);
  if (tasks.length !== 1) throw new Error(`GS1_10_TASK_CARDINALITY_INVALID:${tasks.length}`);
  const task = tasks[0];
  if (/[;\r\n]/.test(task.taskText)) throw new Error('GS1_10_TASK_MUST_REMAIN_ONE_PREDICATE');
  const identity = recoverOpenSpecTaskIdentitiesV1(census).mappings.find((mapping) => mapping.sourceRef === task.taskRef);
  if (!identity?.canonicalKeyAdmitted || !identity.canonicalTaskKey) throw new Error('GS1_10_CANONICAL_IDENTITY_NOT_ADMITTED');
  const formulaSourcePath = audit.source.sourceRef;
  const formulaSourceRevision = audit.source.sourceRevision;
  const taskSourceRevision = sha256(fs.readFileSync(path.join(root, task.tasksPath)));
  const claimRef = predicateIdForTaskClaim(task.canonicalTaskRef, 0, task.taskText);
  const assertions = Object.entries(audit.checks).map(([id, passed]) => ({
    id,
    claimRef,
    expected: 'current treeNodeId formula satisfies the static identity contract',
    actual: passed ? 'static check passed' : 'static check failed',
    passed,
  }));
  return buildEvidenceReceiptV1({
    schema: 'atlas.evidence-receipt.v1',
    evidenceId: `receipt:parent-atlas-graph-retrieval-proof:tree-node-identity-formula:${census.source.workspaceRevision.slice(7, 19)}:${sha256(String(runId)).slice(7, 19)}`,
    evidenceType: 'STATIC',
    changeId: task.changeId,
    taskId: task.taskId ?? task.taskKey,
    canonicalTaskKey: identity.canonicalTaskKey,
    taskRef: task.taskRef,
    claim: task.taskText,
    workspaceRevision: census.source.workspaceRevision,
    sourceRevision: taskSourceRevision,
    taskRevision: task.taskHash,
    sourceRefs: [
      { file: task.tasksPath, lineStart: task.sourceLine, lineEnd: task.sourceLine, sourceRevision: sha256(fs.readFileSync(path.join(root, task.tasksPath))) },
      { file: formulaSourcePath, lineStart: audit.source.lineStart, lineEnd: audit.source.lineEnd, sourceRevision: formulaSourceRevision },
    ],
    environmentFingerprint: sha256(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch })),
    producer: 'scripts/atlas/record-tree-node-identity-formula-receipt-v1.mjs',
    command: 'node scripts/atlas/record-tree-node-identity-formula-receipt-v1.mjs',
    inputs: [
      { kind: 'source', uri: formulaSourcePath, sourceRef: `${formulaSourcePath}#L${audit.source.lineStart}-L${audit.source.lineEnd}`, checksum: formulaSourceRevision },
      { kind: 'task-ledger', uri: task.tasksPath, sourceRef: `${task.tasksPath}#L${task.sourceLine}`, checksum: taskSourceRevision },
    ],
    observedAt: audit.generatedAt,
    expectedAssertions: assertions.map(({ id, claimRef: assertionClaimRef, expected }) => ({ id, claimRef: assertionClaimRef, expected })),
    actualAssertions: assertions,
    outputs: [{ kind: 'audit-report', uri: auditUri, checksum: audit.checksum }],
    verifier: 'atlas-static-identity-audit',
    independentVerifier: 'audit-tree-node-identity-formula-v1',
    readbackRequired: false,
    readbackPerformed: false,
    verdict: 'PROVEN',
  });
}

function main() {
  const census = buildPortfolioCensus(ROOT);
  const audit = auditTreeNodeIdentityFormula(ROOT);
  if (audit.status !== 'STATIC_FORMULA_PROVEN_LIVE_POPULATION_UNPROVEN') throw new Error(`STATIC_FORMULA_AUDIT_NOT_PROVEN:${audit.status}`);
  const runId = process.env.OPENSPEC_EVIDENCE_RUN_ID ?? `${Date.now()}-${census.source.workspaceRevision.slice(7, 19)}`;
  const runDirectory = process.env.OPENSPEC_TREE_NODE_RECEIPT_RUN_DIR
    ? path.resolve(ROOT, process.env.OPENSPEC_TREE_NODE_RECEIPT_RUN_DIR)
    : path.join(ROOT, 'docs', 'reports', 'openspec-evidence', `gs1-10-${runId}`);
  const auditPath = path.join(runDirectory, 'graph-tree-node-identity-formula-audit-v1.json');
  const outputPath = path.join(runDirectory, 'tree-node-identity-formula-receipt-v1.json');
  const auditJson = `${JSON.stringify(audit, null, 2)}\n`;
  fs.mkdirSync(runDirectory, { recursive: true });
  fs.writeFileSync(auditPath, auditJson, { encoding: 'utf8', flag: 'wx' });
  const receipt = buildTreeNodeIdentityFormulaReceiptV1(census, audit, relative(auditPath), ROOT, runId);
  fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  console.log(JSON.stringify({ schema: receipt.schema, evidenceId: receipt.evidenceId, canonicalTaskKey: receipt.canonicalTaskKey, verdict: receipt.verdict, workspaceRevision: receipt.workspaceRevision, output: outputPath }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
