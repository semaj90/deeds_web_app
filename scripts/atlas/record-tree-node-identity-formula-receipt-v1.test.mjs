import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildPortfolioCensus } from './audit-openspec-evidence-fabric-v1.mjs';
import { predicateIdForTaskClaim } from './resolve-openspec-predicates-v1.mjs';
import { buildTreeNodeIdentityFormulaReceiptV1 } from './record-tree-node-identity-formula-receipt-v1.mjs';

const taskClaim = 'Capture the current `atlas_tree_nodes.node_id` formula as a revision-bound parse-occurrence identity.';

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

test('builds a current GS1.10 receipt whose assertions bind to its sole predicate', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-gs1-10-receipt-'));
  const tasksPath = path.join(root, 'openspec', 'changes', 'parent-atlas-graph-retrieval-proof', 'tasks.md');
  const sourcePath = path.join(root, 'src', 'tree-node-identity.mjs');
  fs.mkdirSync(path.dirname(tasksPath), { recursive: true });
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(tasksPath, `- [ ] ${taskClaim}\n`);
  fs.writeFileSync(sourcePath, 'export const nodeIdentity = true;\n');
  const census = buildPortfolioCensus(root);
  const sourceRevision = sha256(fs.readFileSync(sourcePath));
  const auditUnsigned = {
    schema: 'atlas.graph-tree-node-identity-formula-audit.v1',
    generatedAt: '2026-10-01T12:00:00Z',
    status: 'STATIC_FORMULA_PROVEN_LIVE_POPULATION_UNPROVEN',
    source: { sourceRef: 'src/tree-node-identity.mjs', sourceRevision, lineStart: 1, lineEnd: 1 },
    checks: { formulaPresent: true, sourceBound: true },
  };
  const audit = { ...auditUnsigned, checksum: sha256(canonicalJson(auditUnsigned)) };
  const receipt = buildTreeNodeIdentityFormulaReceiptV1(census, audit, 'run/graph-tree-node-identity-formula-audit-v1.json', root);
  const predicateId = predicateIdForTaskClaim(census.tasks[0].canonicalTaskRef, 0, taskClaim);

  assert.equal(receipt.canonicalTaskKey.startsWith('openspec://root/parent-atlas-graph-retrieval-proof/'), true);
  assert.equal(receipt.actualAssertions.every((assertion) => assertion.claimRef === predicateId && assertion.passed), true);
  assert.equal(receipt.workspaceRevision, census.source.workspaceRevision);
  assert.equal(receipt.sourceRefs.some((sourceRef) => sourceRef.file === 'src/tree-node-identity.mjs' && sourceRef.sourceRevision === sourceRevision), true);
  fs.rmSync(root, { recursive: true, force: true });
});
