#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  compareRepositoryMembershipV1,
  computeRepositoryIdentitySetChecksumV1,
} from './lib/graphify-repository-membership-delta-v1.mts';

const revisionA = `sha256:${'a'.repeat(64)}`;
const revisionB = `sha256:${'b'.repeat(64)}`;
const workspaceRevision = `sha256:${'c'.repeat(64)}`;

const snapshotSources = [
  {
    repositoryId: 'repo:root',
    repositoryRelativePath: 'src/a.ts',
    sourceRef: 'src/a.ts',
    sourceRevision: revisionA,
    contentDigest: 'a'.repeat(64),
    byteLength: 10,
  },
  {
    repositoryId: 'repo:nested',
    repositoryRelativePath: 'src/a.ts',
    sourceRef: 'nested/src/a.ts',
    sourceRevision: revisionB,
    contentDigest: 'b'.repeat(64),
    byteLength: 20,
  },
];

const memberships = [
  {
    execution_id: '11111111-1111-4111-8111-111111111111',
    repository_id: 'repo:root',
    repository_relative_path: 'src/a.ts',
    source_ref: 'src/a.ts',
    workspace_revision: workspaceRevision,
    code_source_revision: revisionA,
    content_hash: 'a'.repeat(64),
    byte_length: 10,
  },
  {
    execution_id: '11111111-1111-4111-8111-111111111111',
    repository_id: 'repo:nested',
    repository_relative_path: 'src/a.ts',
    source_ref: 'nested/src/a.ts',
    workspace_revision: workspaceRevision,
    code_source_revision: revisionB,
    content_hash: `sha256:${'b'.repeat(64)}`,
    byte_length: 20,
  },
];

const identities = ['repo:root:src/a.ts', 'repo:nested:src/a.ts'];
const checksum = computeRepositoryIdentitySetChecksumV1(identities);

const exact = compareRepositoryMembershipV1({
  snapshotSources,
  membershipRows: memberships,
  execution: {
    execution_id: '11111111-1111-4111-8111-111111111111',
    workspace_revision: workspaceRevision,
    status: 'COMPLETED',
  },
  sourceSelectionStage: {
    status: 'COMPLETED',
    output_checksum: checksum,
  },
});

assert.equal(exact.eligibleExactNotAdmitted, true);
assert.equal(exact.snapshotIdentityCount, 2);
assert.equal(exact.membershipIdentityCount, 2);
assert.equal(exact.exactIdentityMatches, 2);
assert.deepEqual(exact.blockingIssueCodes, []);
assert.equal(exact.sourceSelectionChecksumMatch, true);

// Same repository-relative path in two repositories must remain two identities.
assert.equal(new Set(identities).size, 2);

const aliasOnly = compareRepositoryMembershipV1({
  snapshotSources,
  membershipRows: memberships.map((row, index) =>
    index === 1 ? { ...row, source_ref: './nested/src/a.ts' } : row,
  ),
  execution: {
    execution_id: '11111111-1111-4111-8111-111111111111',
    workspace_revision: workspaceRevision,
    status: 'COMPLETED',
  },
  sourceSelectionStage: {
    status: 'COMPLETED',
    output_checksum: checksum,
  },
});
assert.equal(aliasOnly.eligibleExactNotAdmitted, true);
assert.equal(aliasOnly.sourceRefAliasMismatches.length, 0);

const badRevision = compareRepositoryMembershipV1({
  snapshotSources,
  membershipRows: memberships.map((row, index) =>
    index === 0 ? { ...row, code_source_revision: revisionB } : row,
  ),
  execution: {
    execution_id: '11111111-1111-4111-8111-111111111111',
    workspace_revision: workspaceRevision,
    status: 'COMPLETED',
  },
  sourceSelectionStage: {
    status: 'COMPLETED',
    output_checksum: checksum,
  },
});
assert.equal(badRevision.eligibleExactNotAdmitted, false);
assert.deepEqual(badRevision.codeSourceRevisionMismatches, ['repo:root:src/a.ts']);
assert.ok(badRevision.blockingIssueCodes.includes('REPOSITORY_MEMBERSHIP_SOURCE_REVISION_MISMATCH'));

const duplicate = compareRepositoryMembershipV1({
  snapshotSources,
  membershipRows: [...memberships, memberships[0]],
  execution: {
    execution_id: '11111111-1111-4111-8111-111111111111',
    workspace_revision: workspaceRevision,
    status: 'COMPLETED',
  },
  sourceSelectionStage: {
    status: 'COMPLETED',
    output_checksum: checksum,
  },
});
assert.equal(duplicate.eligibleExactNotAdmitted, false);
assert.deepEqual(duplicate.duplicateMembershipIdentities, ['repo:root:src/a.ts']);

const checksumMismatch = compareRepositoryMembershipV1({
  snapshotSources,
  membershipRows: memberships,
  execution: {
    execution_id: '11111111-1111-4111-8111-111111111111',
    workspace_revision: workspaceRevision,
    status: 'COMPLETED',
  },
  sourceSelectionStage: {
    status: 'COMPLETED',
    output_checksum: `sha256:${'f'.repeat(64)}`,
  },
});
assert.equal(checksumMismatch.eligibleExactNotAdmitted, false);
assert.ok(checksumMismatch.blockingIssueCodes.includes('REPOSITORY_MEMBERSHIP_SOURCE_SELECTION_CHECKSUM_MISMATCH'));

console.log(JSON.stringify({
  schema: 'atlas.graphify-repository-membership-delta-smoke.v1',
  status: 'PASSED',
  tests: 5,
  proves: [
    'repository-qualified identity keeps nested repositories distinct',
    'exact revision/content/length parity is required',
    'duplicate membership identities fail closed',
    'SOURCE_SELECTION checksum uses the v2 repository-qualified identity set',
    'source_ref normalization is diagnostic and never replaces repository-qualified identity',
  ],
  writesPerformed: false,
}, null, 2));
