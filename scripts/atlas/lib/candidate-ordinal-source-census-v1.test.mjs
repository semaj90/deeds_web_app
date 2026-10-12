import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  assertOneSourceRevisionPerRefV1,
  assertCurrentSourceAuthorityReceiptV1,
  assertRootSourceBindingCensusV1,
  resolveSourceBatchLimitsV1,
} from './candidate-ordinal-source-census-v1.mjs';

const digest = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

function reports(overrides = {}) {
  const body = {
    status: 'CURRENT_SOURCE_AUTHORITY_PROVEN',
    workspaceRevision: digest('workspace'),
    sourceCount: 25_542,
    counts: { qualified: 25_542, missingRevision: 0, revisionMismatch: 0, namespaceAmbiguous: 0, notInAdmittedCohort: 0 },
    proof: { workspaceAuthorityProven: true, exactMembershipProven: true, sourceIdentityProven: true },
    blockerCensus: { byRepository: {
      'repo:root': { sources: 24_456, registryExact: 24_456, registryAbsent: 0, registryMismatch: 0 },
      'repo:external': { sources: 1_086, registryExact: 0, registryAbsent: 1_086, registryMismatch: 0 },
    } },
    ...overrides,
  };
  const receiptChecksum = digest(JSON.stringify(body));
  return {
    current: { ...body, receiptChecksum, versionedReceipt: 'docs/reports/current-source-authority-cohort-v1.fixture.json' },
    versioned: { ...body, receiptChecksum },
  };
}

test('verifies matching checksummed current and immutable source-authority receipts', () => {
  const pair = reports();
  assert.deepEqual(assertCurrentSourceAuthorityReceiptV1(pair.current, pair.versioned), {
    workspaceRevision: pair.current.workspaceRevision,
    sourceCount: 25_542,
    rootSourceCount: 24_456,
  });
});

test('rejects a tampered current source-authority receipt', () => {
  const pair = reports();
  pair.current.sourceCount += 1;
  assert.throws(() => assertCurrentSourceAuthorityReceiptV1(pair.current, pair.versioned), /CHECKSUM_MISMATCH/);
});

test('rejects versioned receipt checksum or status mismatch', () => {
  const pair = reports();
  pair.versioned.status = 'CURRENT_SOURCE_AUTHORITY_BLOCKED';
  assert.throws(() => assertCurrentSourceAuthorityReceiptV1(pair.current, pair.versioned), /NOT_PROVEN/);
});

test('rejects incomplete or non-qualified authority counts', () => {
  const pair = reports({ counts: { qualified: 25_541, missingRevision: 1, revisionMismatch: 0, namespaceAmbiguous: 0, notInAdmittedCohort: 0 } });
  const currentBody = { ...pair.current };
  delete currentBody.receiptChecksum;
  delete currentBody.versionedReceipt;
  const versionedBody = { ...pair.versioned };
  delete versionedBody.receiptChecksum;
  const nextChecksum = digest(JSON.stringify(versionedBody));
  pair.current.receiptChecksum = nextChecksum;
  pair.versioned.receiptChecksum = nextChecksum;
  assert.throws(() => assertCurrentSourceAuthorityReceiptV1(pair.current, pair.versioned), /INCOMPLETE/);
});

test('accepts only exact root membership and binding counts with no workspace drift', () => {
  assert.doesNotThrow(() => assertRootSourceBindingCensusV1({ membershipRows: 24_456, mappedBindingRows: 24_456, mismatchedWorkspaceRows: 0 }, 24_456));
});

test('rejects stale hard-coded census counts and workspace mismatches', () => {
  assert.throws(() => assertRootSourceBindingCensusV1({ membershipRows: 24_455, mappedBindingRows: 24_455, mismatchedWorkspaceRows: 0 }, 24_456), /CENSUS_MISMATCH/);
  assert.throws(() => assertRootSourceBindingCensusV1({ membershipRows: 24_456, mappedBindingRows: 24_455, mismatchedWorkspaceRows: 1 }, 24_456), /CENSUS_MISMATCH/);
});

test('defaults and bounds source batches to 500 files and 64 MiB', () => {
  assert.deepEqual(resolveSourceBatchLimitsV1(), { maxSourceFiles: 500, maxSourceBytes: 64 * 1024 * 1024 });
  assert.deepEqual(resolveSourceBatchLimitsV1('12', '1024'), { maxSourceFiles: 12, maxSourceBytes: 1024 });
  assert.throws(() => resolveSourceBatchLimitsV1('501', '1024'), /LIMIT_OUT_OF_RANGE/);
  assert.throws(() => resolveSourceBatchLimitsV1('1.5', '1024'), /LIMIT_OUT_OF_RANGE/);
  assert.throws(() => resolveSourceBatchLimitsV1('1', String(64 * 1024 * 1024 + 1)), /LIMIT_OUT_OF_RANGE/);
});

test('rejects a source reference carrying multiple revisions in one batch', () => {
  assert.doesNotThrow(() => assertOneSourceRevisionPerRefV1([
    { source_ref: 'src/a.ts', source_revision: 'sha256:a' },
    { source_ref: 'src/a.ts', source_revision: 'sha256:a' },
  ]));
  assert.throws(() => assertOneSourceRevisionPerRefV1([
    { source_ref: 'src/a.ts', source_revision: 'sha256:a' },
    { source_ref: 'src/a.ts', source_revision: 'sha256:b' },
  ]), /MULTIPLE_SOURCE_REVISIONS/);
});
