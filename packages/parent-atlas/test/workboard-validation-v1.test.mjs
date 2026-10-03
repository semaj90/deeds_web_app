import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFeatureValidationPlanV1,
  buildFeatureValidationReceiptV1,
  buildGepaShadowPolicyV1,
  compileMissingValidationTodosV1,
  verifyFeatureValidationPlanV1,
  verifyGepaShadowPolicyV1,
} from '../dist/core/workboard-validation-v1.js';

const plan = buildFeatureValidationPlanV1({
  taskId: 'WORKBOARD-UI-01',
  changeId: 'parent-atlas-workboard-feature-utility-fabric',
  taskRevision: 'sha256:task-revision',
  featureId: 'admin.atlas.workboard',
  sourceTaskRef: 'openspec/changes/parent-atlas-workboard-feature-utility-fabric/tasks.md#WORKBOARD-UI-01',
  requirements: [
    {
      kind: 'PLAYWRIGHT',
      required: true,
      command: 'npx playwright test tests/e2e/workboard.spec.ts --project=chromium',
      route: '/atlas/studio/openspec',
      readOnly: true,
    },
    {
      kind: 'SCREENSHOT',
      required: true,
      artifactRef: '.okf/evidence/workboard-mobile.png',
      viewport: { width: 390, height: 844 },
      readOnly: true,
    },
    {
      kind: 'DB_READBACK',
      required: true,
      command: 'GET /api/health/database',
      readOnly: true,
    },
  ],
});

test('validation plan is deterministic and checksum-verifiable', () => {
  assert.equal(verifyFeatureValidationPlanV1(plan), true);
  assert.equal(
    buildFeatureValidationPlanV1({
      taskId: 'WORKBOARD-UI-01',
      changeId: 'parent-atlas-workboard-feature-utility-fabric',
      taskRevision: 'sha256:task-revision',
      featureId: 'admin.atlas.workboard',
      sourceTaskRef: 'openspec/changes/parent-atlas-workboard-feature-utility-fabric/tasks.md#WORKBOARD-UI-01',
      requirements: plan.requirements,
    }).checksum,
    plan.checksum
  );
});

test('missing required validator makes receipt incomplete and emits TODO candidate', () => {
  const receipt = buildFeatureValidationReceiptV1(plan, [
    {
      kind: 'PLAYWRIGHT',
      status: 'PASS',
      evidenceRefs: ['playwright-report/workboard.json'],
    },
    {
      kind: 'DB_READBACK',
      status: 'PASS',
      evidenceRefs: ['docs/reports/pg18-readback.json'],
    },
  ]);

  assert.equal(receipt.status, 'INCOMPLETE');
  assert.deepEqual(receipt.missingRequiredValidators, ['SCREENSHOT']);

  const todos = compileMissingValidationTodosV1(plan, receipt);
  assert.equal(todos.length, 1);
  assert.equal(todos[0].validatorKind, 'SCREENSHOT');
  assert.match(todos[0].todoText, /TODO\(TEST_MISSING\)/);
  assert.equal(todos[0].mutationAuthorized, false);
});

test('required validation failure dominates missing state', () => {
  const receipt = buildFeatureValidationReceiptV1(plan, [
    {
      kind: 'PLAYWRIGHT',
      status: 'FAIL',
      evidenceRefs: ['test-results/workboard-failure.zip'],
    },
  ]);

  assert.equal(receipt.status, 'FAILED');
});

test('all required validators passing proves the validation receipt only', () => {
  const receipt = buildFeatureValidationReceiptV1(plan, [
    { kind: 'PLAYWRIGHT', status: 'PASS', evidenceRefs: ['pw.json'] },
    { kind: 'SCREENSHOT', status: 'PASS', evidenceRefs: ['.okf/evidence/workboard-mobile.png'] },
    { kind: 'DB_READBACK', status: 'PASS', evidenceRefs: ['pg18.json'] },
  ]);

  assert.equal(receipt.status, 'PROVEN');
  assert.equal(receipt.canonicalWrites, false);
  assert.equal(receipt.mutationAuthorized, false);
});

test('GEPA artifact stays shadow-only and checksummed', () => {
  const policy = buildGepaShadowPolicyV1({
    policyId: 'repair-policy-gepa-candidate-001',
    basePolicyRevision: 'repair-policy-v3',
    optimizerApiRevision: 'dspy.GEPA@3.1.2',
    trainingCorpusRevision: 'repair-outcomes@fixture-v1',
    metricRevision: 'repair-tournament-metric-v1',
    toolRegistryRevision: 'mcp-tool-registry-v5',
    instructions: 'Retrieve evidence before proposing a patch.',
    toolDescriptions: {
      'atlas.search.semantic': 'Search the canonical semantic lane.',
      'atlas.context.compile': 'Compile a revision-qualified context manifest.',
    },
    evaluationReceiptRef: 'docs/reports/gepa-shadow-eval-v1.json',
  });

  assert.equal(policy.optimizer, 'DSPY_GEPA');
  assert.equal(policy.toolOptimizationEnabled, true);
  assert.equal(policy.candidateSelectionStrategy, 'pareto');
  assert.equal(policy.canonicalAuthority, false);
  assert.equal(policy.mutationAuthorized, false);
  assert.equal(policy.tournamentEligible, false);
  assert.equal(verifyGepaShadowPolicyV1(policy), true);
});
