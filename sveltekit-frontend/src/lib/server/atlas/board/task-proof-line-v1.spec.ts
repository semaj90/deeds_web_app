// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  receiptChecksumV1,
  type CanonicalReceiptRecordV1,
  type ReceiptLookupResultV1,
} from '../cache/receipt-dictionary-v1';
import { projectTaskProofLineV1, type TaskProofLineInputV1 } from './task-proof-line-v1';

const REV = 'sha256:' + 'a'.repeat(64);
const OLD = 'sha256:' + 'b'.repeat(64);

// Real rows from docs/reports/openspec-workboard-v1.json (generatedAt 2026-11-12T00:45:10Z).
const REAL_OPEN = {
  stableKey: 'agent-branch-review-fanout-ace-centroid-aug22#16f4feb094087a07',
  sourceCheckboxState: 'OPEN',
  blockHash: 'sha256:3eaefc9a0c8a860f9db37ff24232c2e5d6d48c8e711cf0a29ec86ca1fac8f801',
};
const DUP_GROUP_MEMBER = {
  stableKey: 'atlas-feature-intelligence#ba82ae0bfd79cafc',
  sourceCheckboxState: 'OPEN',
  blockHash: 'sha256:6d645a65bc987b1614a26a26ecd1e3149bc03344c7c006a6c5c2c8ce76ff9114', // shared by 13 rows
};
const FIXTURE_TASK = {
  stableKey: 'fixture-change#0000000000000001',
  sourceCheckboxState: 'DONE',
  blockHash: 'sha256:' + 'c'.repeat(64),
};

const rec = (over: Partial<CanonicalReceiptRecordV1> = {}): CanonicalReceiptRecordV1 => ({
  receiptKind: 'TEST_EXECUTION',
  receiptId: 'rcpt-1',
  workspaceRevision: 'ws-1',
  sourceRevision: REV,
  verificationStatus: 'VERIFIED',
  committed: true,
  payload: { status: 'passed' },
  ...over,
});
const verifier = (over: Partial<CanonicalReceiptRecordV1> = {}) =>
  rec({ receiptKind: 'VERIFIER_RESULT', receiptId: 'rcpt-2', verifierRevision: 'v1', verificationStatus: 'VERIFIED_PASS', ...over });
const hit = (record: CanonicalReceiptRecordV1): ReceiptLookupResultV1 => ({
  schema: 'atlas.receipt-dictionary.v1',
  status: 'HIT',
  reason: null,
  evicted: false,
  record,
});
const rejected = (reason: string): ReceiptLookupResultV1 => ({
  schema: 'atlas.receipt-dictionary.v1',
  status: 'REJECTED',
  reason,
  evicted: false,
  record: null,
});

const base = (over: Partial<TaskProofLineInputV1> = {}): TaskProofLineInputV1 => ({
  task: FIXTURE_TASK,
  mapping: new Map([[FIXTURE_TASK.stableKey, ['rcpt-1', 'rcpt-2']]]),
  receipts: [hit(rec()), hit(verifier())],
  currentSourceRevision: REV,
  blockHashGroupSize: 1,
  completionGrant: true,
  featureLabel: 'Authentication Sessions',
  ...over,
});

describe('constructed verified fixture', () => {
  it('authorizes completion only when tests, readback, revision, binding and the grant all hold', () => {
    const line = projectTaskProofLineV1(base());
    expect(line).toMatchObject({
      status: 'COMPLETION_AUTHORIZED',
      checked: true,
      targetedTestsPassed: true,
      independentReadback: true,
      completionAuthorized: true,
    });
    expect(line.receiptIds).toEqual(['rcpt-1', 'rcpt-2']);
    expect(Object.isFrozen(line)).toBe(true);
  });

  it('keeps the four claims independent: no grant means verified but not authorized', () => {
    expect(projectTaskProofLineV1(base({ completionGrant: false }))).toMatchObject({
      status: 'VERIFIED_NOT_AUTHORIZED',
      targetedTestsPassed: true,
      independentReadback: true,
      completionAuthorized: false,
    });
  });

  it('a ticked checkbox proves nothing, and passing tests without readback are not complete', () => {
    expect(projectTaskProofLineV1(base({ receipts: [hit(rec())] }))).toMatchObject({
      status: 'TESTS_PASSED_NO_READBACK',
      checked: true,
      targetedTestsPassed: true,
      independentReadback: false,
      completionAuthorized: false,
    });
    expect(projectTaskProofLineV1(base({ mapping: null }))).toMatchObject({ checked: true, targetedTestsPassed: false });
  });

  it('a failed test receipt is UNVERIFIED even with a passing verifier row', () => {
    const line = projectTaskProofLineV1(base({ receipts: [hit(rec({ payload: { status: 'failed' } })), hit(verifier())] }));
    expect(line).toMatchObject({ status: 'UNVERIFIED', targetedTestsPassed: false, completionAuthorized: false });
  });
});

describe('negative cases', () => {
  it('missing receipt: a mapping whose receipts were not found', () => {
    const notFound: ReceiptLookupResultV1 = { schema: 'atlas.receipt-dictionary.v1', status: 'NOT_FOUND', reason: null, evicted: false, record: null };
    expect(projectTaskProofLineV1(base({ receipts: [notFound, notFound] }))).toMatchObject({ status: 'RECEIPT_MISSING', completionAuthorized: false });
  });

  it('ambiguous binding: a receipt claimed by two tasks proves neither', () => {
    const claimants = new Map([['rcpt-1', [FIXTURE_TASK.stableKey, 'other#1']]]);
    expect(projectTaskProofLineV1(base({ receiptClaimants: claimants }))).toMatchObject({
      status: 'AMBIGUOUS_BINDING',
      targetedTestsPassed: false,
      completionAuthorized: false,
    });
  });

  it('stale source revision: receipts at an older revision never count', () => {
    const stale = [hit(rec({ sourceRevision: OLD })), hit(verifier({ sourceRevision: OLD }))];
    expect(projectTaskProofLineV1(base({ receipts: stale }))).toMatchObject({
      status: 'STALE_SOURCE_REVISION',
      targetedTestsPassed: false,
      independentReadback: false,
    });
    expect(projectTaskProofLineV1(base({ currentSourceRevision: null })).status).toBe('STALE_SOURCE_REVISION');
    expect(projectTaskProofLineV1(base({ receipts: [rejected('STALE_SOURCE_REVISION')] })).status).toBe('STALE_SOURCE_REVISION');
  });

  it('unauthorized reference: a revoked grant is surfaced and nothing is claimed', () => {
    expect(projectTaskProofLineV1(base({ receipts: [rejected('GRANT_REVOKED'), hit(rec())] }))).toMatchObject({
      status: 'UNAUTHORIZED_RECEIPT_REFERENCE',
      targetedTestsPassed: false,
      completionAuthorized: false,
    });
  });

  it('duplicate blockHash: the shared-hash group is flagged and cannot resolve receipts', () => {
    const line = projectTaskProofLineV1(base({ task: DUP_GROUP_MEMBER, mapping: null, blockHashGroupSize: 13 }));
    expect(line.warnings).toContain('AMBIGUOUS_BLOCK_HASH');
    expect(line).toMatchObject({ status: 'UNRESOLVED_TASK_MAPPING', checked: false, completionAuthorized: false });
    // A mapping keyed by blockHash is not an explicit stableKey mapping and is ignored.
    const byHash = new Map([[DUP_GROUP_MEMBER.blockHash, ['rcpt-1']]]);
    expect(projectTaskProofLineV1(base({ task: DUP_GROUP_MEMBER, mapping: byHash, blockHashGroupSize: 13 })).status).toBe('UNRESOLVED_TASK_MAPPING');
  });

  it('real unresolved task from the snapshot has no mapping and claims nothing', () => {
    expect(projectTaskProofLineV1(base({ task: REAL_OPEN, mapping: null, receipts: [] }))).toMatchObject({
      stableKey: REAL_OPEN.stableKey,
      status: 'UNRESOLVED_TASK_MAPPING',
      checked: false,
      targetedTestsPassed: false,
      independentReadback: false,
      completionAuthorized: false,
      receiptIds: [],
    });
  });
});

describe('featureLabel authority', () => {
  const proposed = { value: 'Authentication Sessions', status: 'PROPOSED', canonicalAuthority: false };

  it('is PROPOSED by default, for proposal-only bindings, and for ADMITTED without a valid checksum', () => {
    const cases = [
      undefined,
      null,
      { status: 'PROPOSAL_ONLY' as const },
      { status: 'ADMITTED' as const },
      { status: 'ADMITTED' as const, bindingChecksum: 'sha256:bad' },
    ];
    for (const featureBinding of cases) {
      expect(projectTaskProofLineV1(base({ featureBinding })).featureLabel).toEqual(proposed);
    }
  });

  it('is ADMITTED only with an admitted binding and a well-formed checksum, and never alters completion', () => {
    const featureBinding = { status: 'ADMITTED' as const, bindingChecksum: receiptChecksumV1(rec()) };
    expect(projectTaskProofLineV1(base({ featureBinding })).featureLabel).toEqual({
      value: 'Authentication Sessions',
      status: 'ADMITTED',
      canonicalAuthority: true,
    });
    expect(projectTaskProofLineV1(base({ mapping: null, featureBinding })).completionAuthorized).toBe(false);
  });
});
