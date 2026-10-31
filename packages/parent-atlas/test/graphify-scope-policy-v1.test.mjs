import assert from 'node:assert/strict';
import test from 'node:test';
import { validateGraphifyScopePolicyV1 } from '../dist/index.js';

const sourceSha = 'a'.repeat(64);
const canonical = (scope = 'repo:root', overrides = {}) => ({
  scope,
  decision: 'CANONICAL_ADMITTED',
  membershipIncluded: true,
  pinnedCommit: '1'.repeat(40),
  currentHead: '1'.repeat(40),
  worktreeClean: false,
  decisionEvidenceRef: `operator-decision:${scope}`,
  sourceAuthorityRepoId: `registered:${scope}`,
  repositoryId: '01a13137-1378-7df9-9968-53738dbf0e48',
  sourceRevision: `sha256:${sourceSha}`,
  sourceBytesSha256: sourceSha,
  sourceBytesReceiptRef: `source-bytes:${scope}`,
  externalProvenanceRef: null,
  licensePolicyRef: null,
  exclusionPolicyRef: null,
  ...overrides,
});

test('scope policy supports canonical, reference-only, and excluded without auto-registering scopes', () => {
  const result = validateGraphifyScopePolicyV1({
    expectedScopes: ['repo:root', 'repo:third-party', 'repo:excluded'],
    decisions: [
      canonical(),
      canonical('repo:third-party', {
        decision: 'REFERENCE_ONLY', membershipIncluded: false,
        sourceAuthorityRepoId: null, repositoryId: null, sourceRevision: null,
        sourceBytesSha256: null, sourceBytesReceiptRef: null,
        externalProvenanceRef: 'git-provenance:third-party', licensePolicyRef: 'license-review:third-party',
      }),
      canonical('repo:excluded', {
        decision: 'EXCLUDED', membershipIncluded: false,
        sourceAuthorityRepoId: null, repositoryId: null, sourceRevision: null,
        sourceBytesSha256: null, sourceBytesReceiptRef: null,
        exclusionPolicyRef: 'scope-exclusion:excluded',
      }),
    ],
  });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.eligibleCanonicalScopes, ['repo:root']);
});

test('scope policy blocks unresolved decisions and incomplete inventory', () => {
  const result = validateGraphifyScopePolicyV1({
    expectedScopes: ['repo:root', 'repo:nested'],
    decisions: [canonical(), canonical('repo:nested', {
      decision: 'UNRESOLVED', membershipIncluded: false,
      sourceAuthorityRepoId: null, repositoryId: null, sourceRevision: null,
      sourceBytesSha256: null, sourceBytesReceiptRef: null,
    })],
  });

  assert.equal(result.status, 'FAIL');
  assert.ok(result.blockers.includes('SCOPE_DECISION_UNRESOLVED:repo:nested'));
  assert.deepEqual(result.eligibleCanonicalScopes, ['repo:root']);
});

test('reference-only and excluded scopes must be absent from canonical membership', () => {
  for (const decision of ['REFERENCE_ONLY', 'EXCLUDED']) {
    const result = validateGraphifyScopePolicyV1({
      expectedScopes: ['repo:nested'],
      decisions: [canonical('repo:nested', {
        decision,
        membershipIncluded: true,
        externalProvenanceRef: 'provenance',
        licensePolicyRef: 'license',
        exclusionPolicyRef: 'exclusion-policy',
      })],
    });
    assert.equal(result.status, 'FAIL');
    assert.ok(result.blockers.some((blocker) => blocker.startsWith(`${decision === 'EXCLUDED' ? 'EXCLUDED' : 'REFERENCE'}_SCOPE_PRESENT_IN_CANONICAL_MEMBERSHIP:`)));
  }
});

test('canonical admission requires identity approval and exact source-byte revision evidence', () => {
  const result = validateGraphifyScopePolicyV1({
    expectedScopes: ['repo:nested'],
    decisions: [canonical('repo:nested', {
      repositoryId: null,
      sourceBytesSha256: 'b'.repeat(64),
    })],
  });

  assert.equal(result.status, 'FAIL');
  assert.ok(result.blockers.includes('CANONICAL_REPOSITORY_IDENTITY_MISSING:repo:nested'));
  assert.ok(result.blockers.includes('CANONICAL_SOURCE_REVISION_MISMATCH:repo:nested'));
});

test('different canonical scopes cannot claim the same UUID or authority key', () => {
  const result = validateGraphifyScopePolicyV1({
    expectedScopes: ['repo:root', 'repo:nested'],
    decisions: [canonical(), canonical('repo:nested', { sourceAuthorityRepoId: 'registered:repo:root' })],
  });

  assert.equal(result.status, 'FAIL');
  assert.ok(result.blockers.includes('CANONICAL_REPOSITORY_ID_REUSED:repo:root:repo:nested'));
  assert.ok(result.blockers.includes('CANONICAL_AUTHORITY_KEY_REUSED:repo:root:repo:nested'));
});

test('duplicate, missing, and unexpected scope decisions fail closed', () => {
  const duplicate = validateGraphifyScopePolicyV1({
    expectedScopes: ['repo:root'],
    decisions: [canonical(), canonical()],
  });
  assert.ok(duplicate.blockers.includes('SCOPE_DECISION_DUPLICATE:repo:root'));

  const missing = validateGraphifyScopePolicyV1({ expectedScopes: ['repo:root'], decisions: [] });
  assert.ok(missing.blockers.includes('SCOPE_DECISION_MISSING:repo:root'));

  const unexpected = validateGraphifyScopePolicyV1({
    expectedScopes: ['repo:root'],
    decisions: [canonical(), canonical('repo:other')],
  });
  assert.ok(unexpected.blockers.includes('SCOPE_NOT_IN_EXPECTED_INVENTORY:repo:other'));
});
