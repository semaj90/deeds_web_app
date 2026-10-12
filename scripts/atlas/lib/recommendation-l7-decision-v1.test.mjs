import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideRecommendationActionV1, L7_PATCH_THRESHOLD, L7_PERMISSION_FLOOR } from './recommendation-l7-decision-v1.mjs';

const KNOWN = { packet_key: 'ace:packet:known' };
const LOW_RISK = { risk: 'low' };
const NO_MEMORY = { prior_fix: null };

function decide({ identity = KNOWN, score = 0.9, gemma4 = LOW_RISK, memory = NO_MEMORY } = {}) {
  return decideRecommendationActionV1({ identity, rerankResult: { top_score: score }, gemma4, memory });
}

describe('L7 decision branches', () => {
  it('asks a human when the identity has no packet_key', () => {
    assert.equal(decide({ identity: {} }), 'ask_permission');
  });

  it('asks a human when synthesis reports high risk, whatever the score', () => {
    assert.equal(decide({ gemma4: { risk: 'high' }, score: 0.99 }), 'ask_permission');
  });

  it('asks a human below the permission floor', () => {
    assert.equal(decide({ score: L7_PERMISSION_FLOOR - 0.001 }), 'ask_permission');
  });

  it('merges into an existing card when a prior fix exists and the score clears the floor', () => {
    assert.equal(decide({ memory: { prior_fix: 'fix-1' }, score: 0.5 }), 'merge_card');
  });

  it('patches an existing card at or above the patch threshold', () => {
    assert.equal(decide({ score: L7_PATCH_THRESHOLD }), 'patch_existing');
    assert.equal(decide({ score: 0.95 }), 'patch_existing');
  });

  it('creates a card between the floor and the patch threshold', () => {
    assert.equal(decide({ score: L7_PERMISSION_FLOOR }), 'create_card');
    assert.equal(decide({ score: L7_PATCH_THRESHOLD - 0.001 }), 'create_card');
  });
});

describe('L7 check order (part of the contract)', () => {
  it('checks identity before risk, risk before score, and score before prior fix', () => {
    assert.equal(decide({ identity: {}, gemma4: { risk: 'high' }, score: 0.99, memory: { prior_fix: 'x' } }), 'ask_permission');
    assert.equal(decide({ gemma4: { risk: 'high' }, score: 0.99, memory: { prior_fix: 'x' } }), 'ask_permission');
    assert.equal(decide({ score: 0.1, memory: { prior_fix: 'x' } }), 'ask_permission');
  });

  it('never returns patch_existing for a high-risk synthesis', () => {
    for (const score of [0.65, 0.8, 1]) {
      assert.notEqual(decide({ gemma4: { risk: 'high' }, score }), 'patch_existing');
    }
  });

  it('is deterministic for identical inputs', () => {
    assert.equal(decide({ score: 0.5 }), decide({ score: 0.5 }));
  });
});
