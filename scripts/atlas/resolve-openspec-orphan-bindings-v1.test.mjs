import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

import { resolveOpenSpecOrphanBindingsV1 } from './resolve-openspec-orphan-bindings-v1.mjs';

test('excludes taskless Atlas-wide reports from OpenSpec orphan counts', () => {
  const receipt = {
    uri: 'docs/reports/general-atlas-audit.json',
    scopeDisposition: 'ATLAS_UNSCOPED',
    fields: {},
  };
  const report = resolveOpenSpecOrphanBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks: [],
    evidenceReceipts: [],
    historicalReceiptCandidates: [receipt],
  }, { mappings: [] }, { receipts: [{ ...receipt, candidateType: 'STATIC_AUDIT' }] });

  assert.equal(report.bindings[0].bindingDisposition, 'OUT_OF_SCOPE');
  assert.equal(report.bindings[0].bindingReason, 'OUTSIDE_OPENSPEC_EVIDENCE_SCOPE');
  assert.equal(report.summary.outOfScopeCount, 1);
  assert.equal(report.summary.trueOrphanCount, 0);
});

test('does not treat command and revision metadata as task identity hints', () => {
  const receipt = {
    uri: 'docs/reports/openspec-command-only-check.json',
    scopeDisposition: 'OPENSPEC_SCOPED',
    fields: {
      commands: ['npm test'],
      workspaceRevisions: ['sha256:workspace'],
      sourceRevisions: ['sha256:source'],
    },
  };
  const report = resolveOpenSpecOrphanBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks: [],
    evidenceReceipts: [],
    historicalReceiptCandidates: [receipt],
  }, { mappings: [] }, { receipts: [{ ...receipt, candidateType: 'UNIT_TEST' }] });

  assert.equal(report.bindings[0].bindingDisposition, 'TRUE_ORPHAN');
  assert.equal(report.bindings[0].bindingReason, 'NO_SUPPORTED_IDENTITY_HINTS');
});

test('does not bind a task merely because it mentions the same implementation file', () => {
  const taskRef = 'openspec/changes/demo/tasks.md#L10';
  const receipt = {
    uri: 'docs/reports/general-implementation-audit.json',
    scopeDisposition: 'OPENSPEC_SCOPED',
    fields: { sourceRefs: ['src/lib/example.ts'] },
  };
  const report = resolveOpenSpecOrphanBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks: [{
      taskRef,
      tasksPath: 'openspec/changes/demo/tasks.md',
      authorityScope: 'openspec://root',
      changeId: 'demo',
      taskId: null,
      sourceLine: 10,
      taskHash: 'sha256:task-source',
      taskText: 'Inspect src/lib/example.ts.',
      dependencySourceText: 'The implementation lives in src/lib/example.ts.',
      taskIdentity: { normalizedClaimHash: 'sha256:claim' },
    }],
    evidenceReceipts: [],
    historicalReceiptCandidates: [receipt],
  }, { mappings: [] }, { receipts: [{ ...receipt, candidateType: 'STATIC_AUDIT' }] });

  assert.equal(report.bindings[0].strategy, null);
  assert.equal(report.bindings[0].bindingDisposition, 'CANDIDATE_ONLY');
  assert.equal(report.bindings[0].bindingReason, 'SOURCE_REF_NOT_TASK_IDENTITY');
});

test('binds a change-line legacy alias without promoting proof', () => {
  const workspaceRevision = 'sha256:workspace';
  const sourceRevision = 'sha256:source';
  const taskRef = 'openspec/changes/demo/tasks.md#L10';
  const census = {
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision },
    tasks: [{
      taskRef,
      tasksPath: 'openspec/changes/demo/tasks.md',
      authorityScope: 'openspec://root',
      changeId: 'demo',
      taskId: null,
      sourceLine: 10,
      taskHash: sourceRevision,
      taskText: 'Capture the deterministic result.',
      taskIdentity: { normalizedClaimHash: 'sha256:claim' },
      canonicalTaskRef: 'openspec-task:openspec://root/demo/sha256:task',
    }],
  };
  const identityReport = {
    mappings: [{
      sourceRef: taskRef,
      canonicalTaskKey: 'openspec://root/demo/sha256:task',
      declaredId: null,
      canonicalKeyAdmitted: true,
      migrationKey: null,
      legacyCandidates: [],
    }],
  };
  const typeReport = { checksum: 'sha256:type' };
  const receipt = {
    uri: 'docs/reports/demo-receipt.json',
    fields: {
      taskIds: ['demo:10'],
      changeIds: ['demo'],
      workspaceRevisions: [workspaceRevision],
      sourceRevisions: [sourceRevision],
    },
  };
  const report = resolveOpenSpecOrphanBindingsV1({
    ...census,
    historicalReceiptCandidates: [receipt],
    evidenceReceipts: [],
  }, identityReport, typeReport);

  assert.equal(report.summary.receiptCount, 1);
  assert.equal(report.bindings[0].strategy, 'LEGACY_CHANGE_LINE');
  assert.equal(report.bindings[0].bindingDisposition, 'LEGACY_BOUND');
  assert.equal(report.bindings[0].revisionStatus, 'CURRENT');
  assert.equal(report.bindings[0].proofEligible, false);
});

test('reads historical taskKey and evidenceRef aliases deterministically', () => {
  const workspaceRevision = 'sha256:workspace';
  const sourceRevision = 'sha256:source';
  const taskRef = 'openspec/changes/demo/tasks.md#L10';
  const census = {
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision },
    tasks: [{
      taskRef,
      tasksPath: 'openspec/changes/demo/tasks.md',
      authorityScope: 'openspec://root',
      changeId: 'demo',
      taskId: null,
      sourceLine: 10,
      taskHash: sourceRevision,
      taskText: 'Capture the deterministic result.',
      taskIdentity: { normalizedClaimHash: 'sha256:claim' },
      canonicalTaskRef: 'openspec-task:openspec://root/demo/sha256:task',
    }],
  };
  const identityReport = {
    mappings: [{
      sourceRef: taskRef,
      canonicalTaskKey: 'openspec://root/demo/sha256:task',
      migrationKey: null,
      legacyCandidates: [],
    }],
  };
  const receipt = {
    uri: 'docs/reports/demo-task-key-receipt.json',
    taskKey: 'demo:10',
    evidenceRefs: [taskRef],
    workspaceRevision,
    sourceRevision,
  };
  const report = resolveOpenSpecOrphanBindingsV1({
    ...census,
    historicalReceiptCandidates: [receipt],
    evidenceReceipts: [],
  }, identityReport, { receipts: [] });

  assert.equal(report.summary.receiptCount, 1);
  assert.equal(report.bindings[0].strategy, 'FILENAME_HINT');
  assert.equal(report.bindings[0].bindingDisposition, 'HEURISTIC_ONLY');
  assert.equal(report.bindings[0].bindingReason, 'FILENAME_ONLY_CANDIDATE');
  assert.equal(report.bindings[0].proofEligible, false);
});

test('keeps multi-task audit reports portfolio-level instead of binding them to one task', () => {
  const tasks = ['alpha', 'beta'].map((changeId, index) => ({
    taskRef: `openspec/changes/${changeId}/tasks.md#L${index + 1}`,
    tasksPath: `openspec/changes/${changeId}/tasks.md`,
    authorityScope: 'openspec://root',
    changeId,
    taskId: `GATE-${index + 1}`,
    sourceLine: index + 1,
    taskHash: `sha256:source-${index}`,
    taskText: `Validate gate ${index + 1}.`,
    taskIdentity: { normalizedClaimHash: `sha256:claim-${index}` },
  }));
  const receipt = {
    uri: 'docs/reports/openspec-portfolio-audit.json',
    scopeDisposition: 'OPENSPEC_SCOPED',
    fields: { taskIds: ['GATE-1', 'GATE-2'], changeIds: ['alpha', 'beta'] },
  };
  const report = resolveOpenSpecOrphanBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks,
    evidenceReceipts: [],
    historicalReceiptCandidates: [receipt],
  }, { mappings: [] }, { receipts: [{ ...receipt, candidateType: 'STATIC_AUDIT' }] });

  assert.equal(report.bindings[0].bindingDisposition, 'PORTFOLIO_LEVEL');
  assert.equal(report.bindings[0].proofEligible, false);
  assert.equal(report.summary.portfolioLevelCount, 1);
});

test('keeps multi-change whole-file references portfolio-level when no exact task matches', () => {
  const receipt = {
    uri: 'docs/reports/openspec-six-change-scan.json',
    scopeDisposition: 'OPENSPEC_SCOPED',
    fields: {
      taskRefs: [
        'openspec/changes/alpha/tasks.md',
        'openspec/changes/beta/tasks.md',
      ],
      changeIds: ['alpha', 'beta'],
    },
  };
  const report = resolveOpenSpecOrphanBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks: ['alpha', 'beta'].map((changeId, index) => ({
      taskRef: `openspec/changes/${changeId}/tasks.md#L${index + 1}`,
      tasksPath: `openspec/changes/${changeId}/tasks.md`,
      authorityScope: 'openspec://root',
      changeId,
      taskId: `GATE-${index + 1}`,
      sourceLine: index + 1,
      taskHash: `sha256:source-${index}`,
      taskText: `Validate gate ${index + 1}.`,
      taskIdentity: { normalizedClaimHash: `sha256:claim-${index}` },
    })),
    evidenceReceipts: [],
    historicalReceiptCandidates: [receipt],
  }, { mappings: [] }, { receipts: [{ ...receipt, candidateType: 'STATIC_AUDIT' }] });

  assert.equal(report.bindings[0].strategy, null);
  assert.equal(report.bindings[0].bindingDisposition, 'PORTFOLIO_LEVEL');
  assert.equal(report.summary.portfolioLevelCount, 1);
});

test('binds legacy change and task fields without promoting proof', () => {
  const workspaceRevision = 'sha256:workspace';
  const sourceRevision = 'sha256:source';
  const taskRef = 'openspec/changes/demo/tasks.md#L20';
  const taskRow = {
    taskRef,
    tasksPath: 'openspec/changes/demo/tasks.md',
    authorityScope: 'openspec://root',
    changeId: 'demo',
    taskId: 'AFC-17',
    sourceLine: 20,
    taskHash: sourceRevision,
    taskText: 'Validate the compiler barrier.',
    taskIdentity: { normalizedClaimHash: 'sha256:claim' },
    canonicalTaskRef: 'openspec-task:openspec://root/demo/AFC-17',
  };
  const report = resolveOpenSpecOrphanBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision },
    tasks: [taskRow],
    historicalReceiptCandidates: [{
      uri: 'docs/reports/legacy-change-task-receipt.json',
      change: 'demo',
      task: 'AFC-17',
      workspaceRevision,
      sourceRevision,
    }],
    evidenceReceipts: [],
  }, { mappings: [{ sourceRef: taskRef, canonicalTaskKey: 'openspec://root/demo/AFC-17', declaredId: 'AFC-17', canonicalKeyAdmitted: true }] }, {});

  assert.equal(report.bindings[0].strategy, 'DECLARED_ID_CHANGE');
  assert.equal(report.bindings[0].bindingDisposition, 'LEGACY_BOUND');
  assert.equal(report.bindings[0].sourceRef, taskRef);
  assert.equal(report.bindings[0].proofEligible, false);
});

test('does not let a source-path match bind a task without an admitted authored ID', () => {
  const taskRef = 'openspec/changes/demo/tasks.md#L10';
  const receipt = { uri: 'docs/reports/source-path.json', fields: { sourceRefs: [taskRef] } };
  const report = resolveOpenSpecOrphanBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks: [{ taskRef, authorityScope: 'openspec://root', changeId: 'demo', taskId: null, sourceLine: 10, taskHash: 'sha256:source', taskText: 'Do work.', canonicalTaskRef: `openspec-task:openspec://root/demo/derived` }],
    evidenceReceipts: [],
    historicalReceiptCandidates: [receipt],
  }, { mappings: [{ sourceRef: taskRef, canonicalTaskKey: 'openspec://root/demo/derived', declaredId: null, canonicalKeyAdmitted: true }] }, {});

  assert.equal(report.bindings[0].bindingDisposition, 'CANDIDATE_ONLY');
  assert.equal(report.bindings[0].sourceReferenceDisposition[0].disposition, 'UNRESOLVED_SOURCE_REF');
});

test('resolves a source line only when it carries one admitted declared task ID', () => {
  const taskRef = 'openspec/changes/demo/tasks.md#L10';
  const task = { taskRef, authorityScope: 'openspec://root', changeId: 'demo', taskId: 'AFC-17', sourceLine: 10, taskHash: 'sha256:source', taskText: 'Do work.', canonicalTaskRef: 'openspec-task:openspec://root/demo/AFC-17' };
  const receipt = { uri: 'docs/reports/source-line-proof.json', fields: { sourceRefs: [taskRef], workspaceRevisions: ['sha256:workspace'], sourceRevisions: ['sha256:source'] } };
  const report = resolveOpenSpecOrphanBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks: [task], evidenceReceipts: [], historicalReceiptCandidates: [receipt],
  }, { mappings: [{ sourceRef: taskRef, canonicalTaskKey: 'openspec://root/demo/AFC-17', declaredId: 'AFC-17', canonicalKeyAdmitted: true }] }, {});

  assert.equal(report.bindings[0].strategy, 'EXACT_TASK_SOURCE_REF');
  assert.equal(report.bindings[0].bindingDisposition, 'LEGACY_BOUND');
  assert.equal(report.bindings[0].sourceReferenceDisposition[0].disposition, 'EXACT_TASK_SOURCE_REF');
});

test('resolves evidenceRef only through a checksummed artifact carrying one explicit task identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-evidence-ref-'));
  try {
    const artifactPath = path.join(root, 'evidence', 'receipt.json');
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, JSON.stringify({ changeId: 'demo', taskId: 'AFC-17' }));
    const taskRef = 'openspec/changes/demo/tasks.md#L10';
    const task = { taskRef, authorityScope: 'openspec://root', changeId: 'demo', taskId: 'AFC-17', sourceLine: 10, taskHash: 'sha256:source', taskText: 'Do work.', canonicalTaskRef: 'openspec-task:openspec://root/demo/AFC-17' };
    const receipt = { uri: 'docs/reports/artifact-ref.json', evidenceRefs: ['evidence/receipt.json'], workspaceRevision: 'sha256:workspace', sourceRevision: 'sha256:source' };
    const report = resolveOpenSpecOrphanBindingsV1({
      schema: 'atlas.openspec-evidence-portfolio-census.v2',
      source: { workspaceRevision: 'sha256:workspace' },
      tasks: [task], evidenceReceipts: [], historicalReceiptCandidates: [receipt],
    }, { mappings: [{ sourceRef: taskRef, canonicalTaskKey: 'openspec://root/demo/AFC-17', declaredId: 'AFC-17', canonicalKeyAdmitted: true }] }, {}, { sourceArtifactRoot: root });

    assert.equal(report.bindings[0].strategy, 'EXACT_EVIDENCE_ARTIFACT');
    assert.equal(report.bindings[0].bindingDisposition, 'LEGACY_BOUND');
    assert.match(report.bindings[0].artifactChecksums[0].checksum, /^sha256:[a-f0-9]{64}$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('keeps multi-task evidence artifacts ambiguous', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-multi-evidence-ref-'));
  try {
    const artifactPath = path.join(root, 'evidence', 'receipt.json');
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, JSON.stringify({ tasks: [{ changeId: 'demo', taskId: 'AFC-17' }, { changeId: 'demo', taskId: 'AFC-18' }] }));
    const tasks = ['AFC-17', 'AFC-18'].map((taskId, index) => ({
      taskRef: `openspec/changes/demo/tasks.md#L${10 + index}`,
      authorityScope: 'openspec://root', changeId: 'demo', taskId, sourceLine: 10 + index,
      taskHash: `sha256:source-${index}`, taskText: 'Do work.', canonicalTaskRef: `openspec-task:openspec://root/demo/${taskId}`,
    }));
    const receipt = { uri: 'docs/reports/multi-artifact.json', evidenceRefs: ['evidence/receipt.json'] };
    const identityReport = { mappings: tasks.map((task) => ({ sourceRef: task.taskRef, canonicalTaskKey: `openspec://root/demo/${task.taskId}`, declaredId: task.taskId, canonicalKeyAdmitted: true })) };
    const report = resolveOpenSpecOrphanBindingsV1({
      schema: 'atlas.openspec-evidence-portfolio-census.v2', source: { workspaceRevision: 'sha256:workspace' },
      tasks, evidenceReceipts: [], historicalReceiptCandidates: [receipt],
    }, identityReport, {}, { sourceArtifactRoot: root });

    assert.equal(report.bindings[0].bindingDisposition, 'AMBIGUOUS');
    assert.equal(report.bindings[0].bindingReason, 'MULTI_TASK_ARTIFACT');
    assert.equal(report.bindings[0].sourceReferenceDisposition[0].disposition, 'MULTI_TASK_ARTIFACT');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('change-only receipt resolves only one admitted task and quarantined identities never bind', () => {
  const singleTask = { taskRef: 'openspec/changes/demo/tasks.md#L10', authorityScope: 'openspec://root', changeId: 'demo', taskId: 'AFC-17', sourceLine: 10, taskHash: 'sha256:source', taskText: 'Do work.', canonicalTaskRef: 'openspec-task:openspec://root/demo/AFC-17' };
  const unique = resolveOpenSpecOrphanBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2', source: { workspaceRevision: 'sha256:workspace' }, tasks: [singleTask],
    evidenceReceipts: [], historicalReceiptCandidates: [{ uri: 'docs/reports/change-only.json', changeId: 'demo', workspaceRevision: 'sha256:workspace', sourceRevision: 'sha256:source' }],
  }, { mappings: [{ sourceRef: singleTask.taskRef, canonicalTaskKey: 'openspec://root/demo/AFC-17', canonicalKeyAdmitted: true }] }, {});
  assert.equal(unique.bindings[0].strategy, 'CHANGE_ONLY_UNIQUE_TASK');
  assert.equal(unique.bindings[0].bindingDisposition, 'LEGACY_BOUND');

  const quarantined = resolveOpenSpecOrphanBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2', source: { workspaceRevision: 'sha256:workspace' }, tasks: [singleTask],
    evidenceReceipts: [], historicalReceiptCandidates: [{ uri: 'docs/reports/quarantined.json', taskId: 'AFC-17', changeId: 'demo' }],
  }, { mappings: [{ sourceRef: singleTask.taskRef, canonicalTaskKey: 'openspec://root/demo/AFC-17', declaredId: 'AFC-17', canonicalKeyAdmitted: false }] }, {});
  assert.equal(quarantined.bindings[0].bindingDisposition, 'IDENTITY_QUARANTINED');
});

test('classifies invalid task and change tokens without promoting them to bindings', () => {
  const task = { taskRef: 'openspec/changes/demo/tasks.md#L1', authorityScope: 'openspec://root', changeId: 'demo', taskId: 'AFC-17', sourceLine: 1, taskHash: 'sha256:source', taskText: 'Do work.', canonicalTaskRef: 'openspec-task:openspec://root/demo/AFC-17' };
  const report = resolveOpenSpecOrphanBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2', source: { workspaceRevision: 'sha256:workspace' }, tasks: [task],
    evidenceReceipts: [], historicalReceiptCandidates: [
      { uri: 'docs/reports/invalid-task-token.json', taskId: '353f2205-89bc-4391-8108-163f25ce7244' },
      { uri: 'docs/reports/invalid-change-token.json', change: 'family-keyed projector resolution requirements' },
    ],
  }, { mappings: [{ sourceRef: task.taskRef, canonicalTaskKey: 'openspec://root/demo/AFC-17', declaredId: 'AFC-17', canonicalKeyAdmitted: true }] }, {});

  assert.deepEqual(report.bindings.map((binding) => binding.bindingReason), ['EXPLICIT_TASK_TOKEN_INVALID', 'EXPLICIT_CHANGE_TOKEN_INVALID']);
  assert.deepEqual(report.bindings.map((binding) => binding.bindingDisposition), ['MISSING_TASK', 'MISSING_TASK']);
  assert.equal(report.bindings.some((binding) => binding.proofEligible), false);
});

test('resolves scoped OpenSpec gate aliases and keeps multi-task gates ambiguous', () => {
  const tasks = ['AFC-17', 'AFC-18'].map((taskId, index) => ({
    taskRef: `openspec/changes/demo/tasks.md#L${10 + index}`,
    authorityScope: 'openspec://root',
    changeId: 'demo',
    taskId,
    sourceLine: 10 + index,
    taskHash: `sha256:source-${index}`,
    taskText: `GATE-01 implementation slice ${index}`,
    canonicalTaskRef: `openspec-task:openspec://root/demo/${taskId}`,
  }));
  const report = resolveOpenSpecOrphanBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks,
    evidenceReceipts: [],
    historicalReceiptCandidates: [{
      uri: 'docs/reports/gate-receipt.json',
      openSpecChange: 'demo',
      gate: 'GATE-01',
      workspaceRevision: 'sha256:workspace',
      sourceRevision: 'sha256:source-0',
    }],
  }, {
    mappings: tasks.map((task) => ({
      sourceRef: task.taskRef,
      canonicalTaskKey: `openspec://root/demo/${task.taskId}`,
      declaredId: task.taskId,
      canonicalKeyAdmitted: true,
    })),
  }, {});

  assert.equal(report.bindings[0].strategy, 'EXACT_GATE_ID_CHANGE');
  assert.equal(report.bindings[0].bindingDisposition, 'AMBIGUOUS');
  assert.equal(report.bindings[0].bindingReason, 'MULTIPLE_DETERMINISTIC_MATCHES');
  assert.equal(report.bindings[0].proofEligible, false);
});

test('binds a gate alias only when the explicit change contains one admitted match', () => {
  const task = {
    taskRef: 'openspec/changes/demo/tasks.md#L10',
    authorityScope: 'openspec://root',
    changeId: 'demo',
    taskId: 'AFC-17',
    sourceLine: 10,
    taskHash: 'sha256:source',
    taskText: 'GATE-01 implementation slice',
    canonicalTaskRef: 'openspec-task:openspec://root/demo/AFC-17',
  };
  const report = resolveOpenSpecOrphanBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks: [task],
    evidenceReceipts: [],
    historicalReceiptCandidates: [{ uri: 'docs/reports/gate.json', changeId: 'demo', gateId: 'GATE-01' }],
  }, {
    mappings: [{ sourceRef: task.taskRef, canonicalTaskKey: 'openspec://root/demo/AFC-17', canonicalKeyAdmitted: true }],
  }, {});

  assert.equal(report.bindings[0].strategy, 'EXACT_GATE_ID_CHANGE');
  assert.equal(report.bindings[0].bindingDisposition, 'MISSING_REVISION');
  assert.equal(report.bindings[0].proofEligible, false);
});

test('keeps unscoped declared-ID collisions ambiguous across authority scopes', () => {
  const tasks = ['openspec://root', 'openspec://frontend'].map((authorityScope, index) => ({
    taskRef: `${index === 0 ? 'openspec' : 'sveltekit-frontend/openspec'}/changes/demo/tasks.md#L${index + 1}`,
    tasksPath: `${index === 0 ? 'openspec' : 'sveltekit-frontend/openspec'}/changes/demo/tasks.md`,
    authorityScope,
    changeId: 'demo',
    taskId: 'TASK-1',
    sourceLine: index + 1,
    taskHash: `sha256:source-${index}`,
    taskText: 'Capture the same declared task identifier.',
    taskIdentity: { normalizedClaimHash: `sha256:claim-${index}` },
  }));
  const receipt = {
    uri: 'docs/reports/demo-identity-collision.json',
    scopeDisposition: 'OPENSPEC_SCOPED',
    fields: { taskIds: ['TASK-1'], changeIds: ['demo'] },
  };
  const report = resolveOpenSpecOrphanBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks,
    historicalReceiptCandidates: [receipt],
    evidenceReceipts: [],
  }, { mappings: [] }, { receipts: [] });

  assert.equal(report.bindings[0].strategy, 'DECLARED_ID_CHANGE');
  assert.equal(report.bindings[0].bindingDisposition, 'AMBIGUOUS');
  assert.equal(report.bindings[0].matchedTaskCount, 2);
});
