import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { planOpenSpecTaskRevisionSyncV1 } from './plan-openspec-task-revision-sync-v1.mjs';

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function seal(value) {
  const checksum = `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
  return { ...value, checksum };
}

function identityReport(mappings) {
  return seal({
    schema: 'atlas.openspec-task-identity-recovery.v1',
    source: { workspaceRevision: 'sha256:workspace-next' },
    mappings,
  });
}

function mapping(overrides = {}) {
  return {
    canonicalTaskKey: 'openspec://root/change-a/GS1.10',
    canonicalKeyAdmitted: true,
    sourceRef: 'openspec/changes/change-a/tasks.md#L12',
    authorityScope: 'openspec://root',
    changeId: 'change-a',
    identityKind: 'DECLARED_TASK_ID',
    normalizedClaimHash: 'sha256:claim-v1',
    aliasProposals: [],
    ...overrides,
  };
}

function previousState(records) {
  return seal({ schema: 'atlas.openspec-task-revision-state.v1', records });
}

test('keeps canonical identity fixed and increments only the claim revision', () => {
  const report = planOpenSpecTaskRevisionSyncV1(
    identityReport([mapping({ normalizedClaimHash: 'sha256:claim-v2' })]),
    previousState([{
      canonicalTaskKey: 'openspec://root/change-a/GS1.10',
      taskRevision: 4,
      claimHash: 'sha256:claim-v1',
      identityKind: 'DECLARED_TASK_ID',
      authorityScope: 'openspec://root',
      changeId: 'change-a',
    }]),
  );
  assert.equal(report.status, 'REVISION_SYNC_PLAN_READY');
  assert.equal(report.rows[0].canonicalTaskKey, 'openspec://root/change-a/GS1.10');
  assert.equal(report.rows[0].taskRevision, 5);
  assert.equal(report.rows[0].disposition, 'APPEND_CLAIM_REVISION');
  assert.equal(report.proposedNextState.records[0].taskRevision, 5);
  assert.equal(report.proposedNextState.revisionHistory[0].claimHash, 'sha256:claim-v2');
  assert.equal(report.writesPerformed, false);
});

test('does not bump revision when claim hash is unchanged', () => {
  const report = planOpenSpecTaskRevisionSyncV1(
    identityReport([mapping()]),
    previousState([{
      canonicalTaskKey: 'openspec://root/change-a/GS1.10',
      taskRevision: 4,
      claimHash: 'sha256:claim-v1',
      identityKind: 'DECLARED_TASK_ID',
      authorityScope: 'openspec://root',
      changeId: 'change-a',
    }]),
  );
  assert.equal(report.rows[0].taskRevision, 4);
  assert.equal(report.rows[0].disposition, 'UNCHANGED_TOUCH_LAST_SEEN');
});

test('requires review before replacing a derived identity with a declared key', () => {
  const report = planOpenSpecTaskRevisionSyncV1(
    identityReport([mapping({
      canonicalTaskKey: 'openspec://root/change-a/GS1.10',
      identityKind: 'DECLARED_TASK_ID',
      aliasProposals: [{ aliasKey: 'openspec://root/change-a/derived/oldhash', aliasKind: 'DERIVED_KEY', disposition: 'PROPOSAL_ONLY' }],
    })]),
    previousState([{
      canonicalTaskKey: 'openspec://root/change-a/derived/oldhash',
      taskRevision: 3,
      claimHash: 'sha256:claim-v1',
      identityKind: 'DERIVED',
      authorityScope: 'openspec://root',
      changeId: 'change-a',
    }]),
  );
  assert.equal(report.status, 'REVISION_SYNC_REVIEW_REQUIRED');
  assert.equal(report.rows[0].disposition, 'ALIAS_REVIEW_REQUIRED');
  assert.equal(report.rows[0].previousCanonicalTaskKey, 'openspec://root/change-a/derived/oldhash');
});

test('flags changed content-derived keys rather than silently treating them as new proof identity', () => {
  const report = planOpenSpecTaskRevisionSyncV1(
    identityReport([mapping({
      canonicalTaskKey: 'openspec://root/change-a/derived/newhash',
      identityKind: 'DERIVED',
      declaredId: null,
    })]),
    previousState([{
      canonicalTaskKey: 'openspec://root/change-a/derived/oldhash',
      taskRevision: 1,
      claimHash: 'sha256:claim-v1',
      identityKind: 'DERIVED',
      authorityScope: 'openspec://root',
      changeId: 'change-a',
    }]),
  );
  assert.equal(report.status, 'REVISION_SYNC_REVIEW_REQUIRED');
  assert.equal(report.rows[0].possibleDerivedIdentityDrift, true);
  assert.equal(report.blockedReasons.includes('DERIVED_IDENTITY_DRIFT_REVIEW_REQUIRED'), true);
});

test('rejects tampered identity and prior-state checksums', () => {
  const current = identityReport([mapping()]);
  current.mappings[0].normalizedClaimHash = 'sha256:tampered';
  const prior = previousState([]);
  prior.records.push({ canonicalTaskKey: 'bad', taskRevision: 1, claimHash: 'sha256:x' });
  const report = planOpenSpecTaskRevisionSyncV1(current, prior);
  assert.equal(report.status, 'REVISION_SYNC_REVIEW_REQUIRED');
  assert.deepEqual(report.blockedReasons, [
    'IDENTITY_REPORT_SCHEMA_OR_CHECKSUM_INVALID',
    'PREVIOUS_STATE_SCHEMA_OR_CHECKSUM_INVALID',
  ]);
});
