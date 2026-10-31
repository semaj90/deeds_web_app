import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRepairRankerEvaluationReceiptV1, verifyRepairRankerEvaluationReceiptV1 } from '../dist/index.js';

const sha = (character) => `sha256:${character.repeat(64)}`;
const candidate = (id, relevance, baselineScore, challengerScore, overrides = {}) => ({
  candidateId: id,
  sourceRevision: sha(id === 'target' ? 'c' : 'd'),
  relevance,
  judgmentEvidenceRef: `judgment:${id}`,
  judgmentSource: 'human_judgment',
  baselineScore,
  challengerScore,
  baselineProbability: relevance > 0 ? 0.7 : 0.2,
  challengerProbability: relevance > 0 ? 0.8 : 0.1,
  ...overrides,
});

function input(overrides = {}) {
  return {
    datasetChecksum: sha('a'),
    baselineModelRevision: sha('b'),
    challengerModelRevision: sha('e'),
    trainingSourceRevisions: [sha('f')],
    heldOutSourceRevisions: [sha('c'), sha('d')],
    k: 1,
    queries: [{
      queryId: 'query:compiler-error:1',
      candidates: [candidate('distractor', 0, 0.9, 0.1), candidate('target', 2, 0.2, 0.8)],
    }],
    baselinePerformance: { receiptRef: 'receipt:baseline:1', latencyMs: 10, peakMemoryBytes: 1024 },
    challengerPerformance: { receiptRef: 'receipt:challenger:1', latencyMs: 12, peakMemoryBytes: 2048 },
    ...overrides,
  };
}

test('evaluation compares baseline and challenger on frozen held-out candidates without promotion', () => {
  const receipt = buildRepairRankerEvaluationReceiptV1(input());
  assert.equal(receipt.baseline.recallAtK, 0);
  assert.equal(receipt.challenger.recallAtK, 1);
  assert.equal(receipt.challenger.mrr, 1);
  assert.equal(receipt.challenger.ndcgAtK, 1);
  assert.equal(receipt.baseline.brierScore, 0.065);
  assert.equal(receipt.challenger.brierScore, 0.025);
  assert.equal(receipt.sourceRevisionSplitDisjoint, true);
  assert.equal(receipt.trainingPerformed, false);
  assert.equal(receipt.promotionAuthorized, false);
  assert.equal(verifyRepairRankerEvaluationReceiptV1(receipt).checksum, receipt.checksum);
});

test('rejects train/held-out source leakage and candidates outside the frozen held-out set', () => {
  assert.throws(() => buildRepairRankerEvaluationReceiptV1(input({
    trainingSourceRevisions: [sha('c')],
  })), /HELD_OUT_SOURCE_REVISION_OVERLAP/);
  assert.throws(() => buildRepairRankerEvaluationReceiptV1(input({
    queries: [{ ...input().queries[0], candidates: [candidate('target', 1, 1, 1, { sourceRevision: sha('f') })] }],
  })), /CANDIDATE_NOT_IN_FROZEN_HELD_OUT_SPLIT/);
});

test('rejects missing judgments and duplicate candidates rather than fabricating relevance', () => {
  assert.throws(() => buildRepairRankerEvaluationReceiptV1(input({
    queries: [{ queryId: 'query:none', candidates: [candidate('none', 0, 1, 1)] }],
  })), /QUERY_REQUIRES_RELEVANT_JUDGMENT/);
  const same = candidate('same', 1, 1, 1);
  assert.throws(() => buildRepairRankerEvaluationReceiptV1(input({
    queries: [{ queryId: 'query:dup', candidates: [same, same] }],
  })), /DUPLICATE_CANDIDATE_ID/);
});

test('evaluation receipt checksum detects changed metric values', () => {
  const receipt = buildRepairRankerEvaluationReceiptV1(input());
  assert.throws(() => verifyRepairRankerEvaluationReceiptV1({ ...receipt, challenger: { ...receipt.challenger, mrr: 0 } }), /REPAIR_RANKER_EVALUATION_CHECKSUM_MISMATCH/);
});
