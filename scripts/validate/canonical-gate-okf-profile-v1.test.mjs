import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { classifyOkfProfileEvidence } from './canonical-gate-okf-profile-core-v1.mjs';

const seal = (body) => ({
  ...body,
  receiptSha256: `sha256:${crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')}`,
});

const profile = (overrides = {}) => seal({
  schema: 'atlas.canonical-gate-okf-profile-evidence.v1',
  status: 'PARTIAL',
  broadProfileDiagnostic: { invalidUnderBroadProfile: 387, sha256: 'sha256:broad' },
  profileReconciliation: {
    status: 'OKF_PROFILE_RECONCILIATION_INCOMPLETE',
    firstBlocker: 'OKF_INTENDED_PROFILE_OWNER_VALIDATION_MISSING',
    counts: { reconciled: true, unclassified: 0 },
    sha256: 'sha256:profile',
  },
  canonicalAuthority: false,
  writesPerformed: false,
  ...overrides,
});

test('broad-profile invalid count is diagnostic, not a false gate failure', () => {
  assert.deepEqual(classifyOkfProfileEvidence(profile()), {
    verdict: 'PARTIAL',
    reasons: ['OKF_INTENDED_PROFILE_OWNER_VALIDATION_MISSING'],
  });
});

test('verified complete profile reconciliation passes independently of broad audit', () => {
  const evidence = profile({
    status: 'PASS',
    profileReconciliation: {
      status: 'OKF_PROFILE_RECONCILIATION_READ_ONLY_VERIFIED',
      firstBlocker: null,
      counts: { reconciled: true, unclassified: 0 },
      sha256: 'sha256:profile',
    },
  });
  assert.deepEqual(classifyOkfProfileEvidence(evidence), { verdict: 'PASS', reasons: [] });
});

test('malformed or unreconciled evidence fails closed', () => {
  assert.equal(classifyOkfProfileEvidence(null).verdict, 'FAIL');
  assert.equal(classifyOkfProfileEvidence(profile({ profileReconciliation: { status: 'OKF_PROFILE_RECONCILIATION_INCOMPLETE', counts: { reconciled: false, unclassified: 1 } } })).verdict, 'FAIL');
  const stale = profile();
  stale.receiptSha256 = 'sha256:stale';
  assert.equal(classifyOkfProfileEvidence(stale).verdict, 'FAIL');
});
