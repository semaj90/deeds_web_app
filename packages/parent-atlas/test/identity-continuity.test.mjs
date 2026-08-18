import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveReviewedAliasDecisionId,
  reviewedIdentityAliasSchema,
} from '../dist/core/reviewed-identity-alias.js';

function decision(overrides = {}) {
  const base = {
    entity_kind: 'test',
    stable_id: 'test:t1',
    old_key: 'test-key:old',
    new_key: 'test-key:new',
    transition: 'rename',
    old_source_ref: 'src/old.test.ts',
    new_source_ref: 'src/old.test.ts',
    old_revision: 'src-r1',
    new_revision: 'src-r2',
    evidence_refs: ['evidence:review-1'],
    reviewer_id: 'user:reviewer',
    workflow_action_id: 'action:review-1',
    reviewed_at: '2026-08-18T20:00:00.000Z',
    registry_revision: 'registry-r2',
    producer_revision: 'review-r1',
    ...overrides,
  };
  return { ...base, decision_id: deriveReviewedAliasDecisionId(base) };
}

test('reviewed alias decision ID is deterministic and auditable', () => {
  const first = decision();
  const second = decision();
  assert.equal(first.decision_id, second.decision_id);
  const parsed = reviewedIdentityAliasSchema.parse(first);
  assert.equal(parsed.entity_kind, 'test');
  assert.deepEqual(parsed.evidence_refs, ['evidence:review-1']);
});

test('review decision rejects unchanged identity key', () => {
  const raw = decision({ new_key: 'test-key:old' });
  assert.throws(() => reviewedIdentityAliasSchema.parse(raw), /changed key/);
});

test('move decision requires source path change', () => {
  const raw = decision({ transition: 'move', new_source_ref: 'src/old.test.ts' });
  assert.throws(() => reviewedIdentityAliasSchema.parse(raw), /source_ref change/);
  const moved = decision({ transition: 'move', new_source_ref: 'src/new.test.ts' });
  assert.equal(reviewedIdentityAliasSchema.parse(moved).transition, 'move');
});
