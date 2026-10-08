import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEvidenceReceiptV1, buildPortfolioCensus } from './audit-openspec-evidence-fabric-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const auditPath = path.join(root, 'docs', 'reports', 'graph-identity-contracts-audit-v1.json');
const outputPath = path.join(root, 'docs', 'reports', 'openspec-graph-retrieval-proof-identity-contracts-receipt-v1.json');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const checksumFile = (file) => sha256(fs.readFileSync(file));

if (!fs.existsSync(auditPath)) throw new Error('GRAPH_IDENTITY_CONTRACT_AUDIT_MISSING');
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
if (audit.status !== 'DEFINITION_CONTRACTS_PROVEN_POPULATION_UNPROVEN') throw new Error('GRAPH_IDENTITY_CONTRACT_DEFINITION_NOT_PROVEN');
const census = buildPortfolioCensus(root);
const task = census.tasks.find((candidate) => candidate.changeId === 'parent-atlas-graph-retrieval-proof' && candidate.taskId === 'GS1-10-IDENTITY-CONTRACTS-01');
if (!task) throw new Error('GRAPH_IDENTITY_CONTRACT_TASK_MISSING');
const receipt = buildEvidenceReceiptV1({
  schema: 'atlas.evidence-receipt.v1',
  evidenceId: 'receipt:parent-atlas-graph-retrieval-proof:GS1-10-IDENTITY-CONTRACTS-01:static-v1',
  evidenceType: 'STATIC',
  changeId: task.changeId,
  taskId: task.taskId,
  claim: 'Seven separate identity definitions exist for parse_node_id, symbol_id, symbol_version_id, chunk_id, packet_key, concept_id, and graph_node_key; this receipt proves definitions only, not live population or cross-revision continuity.',
  gitCommit: census.source.gitCommit,
  workspaceRevision: census.source.workspaceRevision,
  sourceRevision: checksumFile(path.join(root, task.tasksPath)),
  taskRevision: task.taskHash,
  sourceRefs: [{ file: task.tasksPath, lineStart: task.sourceLine, lineEnd: task.sourceLine, sourceRevision: checksumFile(path.join(root, task.tasksPath)) }],
  environmentFingerprint: census.source.environmentFingerprint,
  producer: 'scripts/atlas/audit-graph-identity-contracts-v1.mjs',
  command: 'npm run atlas:identity:contracts:audit',
  inputs: [{ kind: 'static_audit', uri: 'docs/reports/graph-identity-contracts-audit-v1.json', checksum: checksumFile(auditPath) }],
  observedAt: audit.generatedAt,
  expectedAssertions: [
    { id: 'seven-contracts', expected: 'all seven identity markers are present in their declared owners' },
    { id: 'supporting-contracts', expected: 'occurrence, symbol revision, and symbol audit support files exist' },
    { id: 'population-boundary', expected: 'the receipt does not promote live population or cross-revision continuity' },
  ],
  actualAssertions: [
    { id: 'seven-contracts', actual: `${audit.contracts.length} identity definitions found and all markers matched`, passed: audit.contracts.length === 7 && audit.contracts.every((contract) => contract.exists && contract.markerFound) },
    { id: 'supporting-contracts', actual: 'tree occurrence, symbol revision qualification, and symbol audit owners are present', passed: audit.support.every((entry) => entry.exists) },
    { id: 'population-boundary', actual: 'status is DEFINITION_CONTRACTS_PROVEN_POPULATION_UNPROVEN', passed: audit.status === 'DEFINITION_CONTRACTS_PROVEN_POPULATION_UNPROVEN' },
  ],
  outputs: [{ kind: 'identity_contract_audit', uri: 'docs/reports/graph-identity-contracts-audit-v1.json', checksum: checksumFile(auditPath) }],
  verifier: 'scripts/atlas/audit-graph-identity-contracts-v1.mjs',
  independentVerifier: 'node -e "const r=require(\'docs/reports/graph-identity-contracts-audit-v1.json\'); if(r.contracts.length!==7 || !r.contracts.every(c=>c.exists&&c.markerFound)) process.exit(1)"',
  readbackRequired: true,
  readbackPerformed: true,
  readbackCommand: 'node -e "const r=require(\'docs/reports/graph-identity-contracts-audit-v1.json\'); if(r.status!==\'DEFINITION_CONTRACTS_PROVEN_POPULATION_UNPROVEN\') process.exit(1)"',
  verdict: 'PROVEN',
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ evidenceId: receipt.evidenceId, verdict: receipt.verdict, workspaceRevision: receipt.workspaceRevision, outputPath }, null, 2));
