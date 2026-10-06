import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDomainClassifierHoldoutV1 } from './domain-classifier-evaluation-v1.mjs';

const d = (letter) => `sha256:${letter.repeat(64)}`;
const row = (sampleId, expectedLabel, inputChecksum, naiveBayesProbabilities, logisticRegressionProbabilities) => ({
  sampleId,
  expectedLabel,
  inputChecksum,
  evidenceRefs: [`postgres:atlas_packets:${sampleId}`],
  naiveBayesProbabilities,
  logisticRegressionProbabilities,
});
const cohort = (rows, patch = {}) => ({
  schema: 'atlas.domain-classifier-holdout.v1',
  cohortId: 'holdout-test',
  cohortRevision: 'sha256:cohort-v1',
  labelSource: 'HUMAN_REVIEWED',
  modelRevision: 'domain-classifier-test-v1',
  checkpointChecksum: d('f'),
  classLabels: ['a', 'b'],
  trainingMemberChecksums: [d('e')],
  rows,
  ...patch,
});

test('computes separate NB and LR metrics on a complete, disjoint holdout', () => {
  const result = evaluateDomainClassifierHoldoutV1(cohort([
    row('p1', 'a', d('a'), { a: 0.9, b: 0.1 }, { a: 0.6, b: 0.4 }),
    row('p2', 'b', d('b'), { a: 0.49, b: 0.51 }, { a: 0.1, b: 0.9 }),
  ]));
  assert.equal(result.status, 'DIAGNOSTIC_EVALUATION_COMPLETE');
  assert.equal(result.models.naiveBayes.accuracy, 1);
  assert.equal(result.models.logisticRegression.accuracy, 1);
  assert.notEqual(result.models.naiveBayes.multiclassBrier, result.models.logisticRegression.multiclassBrier);
  assert.equal(result.canonicalAuthority, false);
});

test('blocks weak labels and unproven training membership', () => {
  const missingMembership = evaluateDomainClassifierHoldoutV1(cohort([
    row('p1', 'a', d('e'), { a: 0.9, b: 0.1 }, { a: 0.8, b: 0.2 }),
    row('p2', 'b', d('b'), { a: 0.2, b: 0.8 }, { a: 0.1, b: 0.9 }),
  ], { labelSource: 'WEAK_LABEL', trainingMemberChecksums: [] }));
  assert.equal(missingMembership.status, 'BLOCKED');
  assert.ok(missingMembership.failures.includes('LABEL_SOURCE_NOT_INDEPENDENT'));
  assert.ok(missingMembership.failures.includes('TRAINING_MEMBERSHIP_UNPROVEN'));
  assert.equal(missingMembership.models, null);

  const overlap = evaluateDomainClassifierHoldoutV1(cohort([
    row('p1', 'a', d('e'), { a: 0.9, b: 0.1 }, { a: 0.8, b: 0.2 }),
    row('p2', 'b', d('b'), { a: 0.2, b: 0.8 }, { a: 0.1, b: 0.9 }),
  ]));
  assert.ok(overlap.failures.includes('TRAINING_HOLDOUT_OVERLAP'));
  assert.equal(overlap.models, null);
});

test('blocks invalid probability vectors and missing evidence references', () => {
  const result = evaluateDomainClassifierHoldoutV1(cohort([
    row('p1', 'a', d('a'), { a: 1.2, b: 0 }, { a: 0.8, b: 0.2 }),
    { ...row('p2', 'b', d('b'), { a: 0.2, b: 0.8 }, { a: 0.1, b: 0.9 }), evidenceRefs: [] },
  ]));
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.failures.includes('NAIVEBAYESPROBABILITIES_INVALID'));
  assert.ok(result.failures.includes('HOLDOUT_ROW_LINEAGE_INCOMPLETE'));
});
