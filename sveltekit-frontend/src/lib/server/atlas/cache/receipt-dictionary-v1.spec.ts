// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  buildReceiptCacheKeyV1,
  buildReceiptFeatureIndexKeyV1,
  buildReceiptTaskIndexKeyV1,
  createReceiptDictionaryV1,
  receiptChecksumV1,
  resolveTaskReceiptsV1,
  type CanonicalReceiptRecordV1,
  type ReceiptCacheIdentityV1,
  type ReceiptKvStore,
} from './receipt-dictionary-v1';

const REV = 'sha256:' + 'a'.repeat(64);
const record = (over: Partial<CanonicalReceiptRecordV1> = {}): CanonicalReceiptRecordV1 => ({
  receiptKind: 'TEST_EXECUTION',
  receiptId: 'rcpt-1',
  workspaceRevision: 'ws-1',
  sourceRevision: REV,
  verificationStatus: 'VERIFIED',
  committed: true,
  payload: { status: 'passed', durationMs: 12 },
  ...over,
});
const identityFor = (r: CanonicalReceiptRecordV1, over: Partial<ReceiptCacheIdentityV1> = {}): ReceiptCacheIdentityV1 => ({
  receiptKind: r.receiptKind,
  receiptId: r.receiptId,
  workspaceRevision: r.workspaceRevision,
  sourceRevision: r.sourceRevision,
  receiptChecksum: receiptChecksumV1(r),
  ...over,
});

function memoryStore() {
  const data = new Map<string, string>();
  const store: ReceiptKvStore = {
    get: vi.fn(async (k) => data.get(k) ?? null),
    set: vi.fn(async (k, v) => void data.set(k, v)),
    del: vi.fn(async (k) => void data.delete(k)),
  };
  return { data, store };
}

function dictionary(rows: CanonicalReceiptRecordV1[], status = 'VERIFIED') {
  const { data, store } = memoryStore();
  const loadCanonical = vi.fn(async () => rows);
  const currentVerificationStatus = vi.fn(async () => status);
  return { data, store, loadCanonical, currentVerificationStatus, dict: createReceiptDictionaryV1({ store, loadCanonical, currentVerificationStatus, ttlSeconds: 60 }) };
}

describe('receipt keys', () => {
  it('follow the BitFrost pattern, carry a workspace digest, and differ across workspaces', () => {
    const r = record();
    const a = buildReceiptCacheKeyV1(identityFor(r));
    const b = buildReceiptCacheKeyV1(identityFor(r, { workspaceRevision: 'ws-2' }));
    expect(a.startsWith('atlas:bitfrost:v1:receipt:test_execution:')).toBe(true);
    expect(a.endsWith(receiptChecksumV1(r).slice(7))).toBe(true);
    expect(a).not.toBe(b);
  });

  it('require a verifier revision for verifier results and a well-formed checksum and source revision', () => {
    const r = record({ receiptKind: 'VERIFIER_RESULT' });
    expect(() => buildReceiptCacheKeyV1(identityFor(r))).toThrow();
    expect(() => buildReceiptCacheKeyV1(identityFor(r, { verifierRevision: 'v1' }))).not.toThrow();
    expect(() => buildReceiptCacheKeyV1(identityFor(record(), { receiptChecksum: 'sha256:bad' }))).toThrow();
    expect(() => buildReceiptCacheKeyV1(identityFor(record(), { sourceRevision: 'abc' }))).toThrow();
  });

  it('feature indexes accept admitted bindings only; proposals never become identity', () => {
    expect(() => buildReceiptFeatureIndexKeyV1({ workspaceRevision: 'ws-1', featureId: 'f1', bindingStatus: 'PROPOSAL_ONLY' })).toThrow('FEATURE_BINDING_NOT_ADMITTED');
    expect(buildReceiptFeatureIndexKeyV1({ workspaceRevision: 'ws-1', featureId: 'f1', bindingStatus: 'ADMITTED' })).toContain('receipt-index:feature:');
    expect(buildReceiptTaskIndexKeyV1({ workspaceRevision: 'ws-1', taskStableKey: 'chg#abc' })).toContain('receipt-index:task:');
    expect(() => buildReceiptTaskIndexKeyV1({ workspaceRevision: '', taskStableKey: 'x' })).toThrow('RECEIPT_INDEX_IDENTITY_REQUIRED');
  });
});

describe('read-through dictionary', () => {
  it('misses, loads from PostgreSQL, caches after commit, then hits without reloading', async () => {
    const r = record();
    const t = dictionary([r]);
    const first = await t.dict.lookup({ identity: identityFor(r), grantActive: true });
    expect(first).toMatchObject({ status: 'MISS_LOADED', reason: null });
    expect(t.store.set).toHaveBeenCalledTimes(1);
    const second = await t.dict.lookup({ identity: identityFor(r), grantActive: true });
    expect(second.status).toBe('HIT');
    expect(t.loadCanonical).toHaveBeenCalledTimes(1);
  });

  it('refuses a revoked grant before touching the cache or PostgreSQL', async () => {
    const r = record();
    const t = dictionary([r]);
    const res = await t.dict.lookup({ identity: identityFor(r), grantActive: false });
    expect(res).toMatchObject({ status: 'REJECTED', reason: 'GRANT_REVOKED' });
    expect(t.store.get).not.toHaveBeenCalled();
    expect(t.loadCanonical).not.toHaveBeenCalled();
  });

  it('rejects and evicts a tampered cached payload (checksum mismatch) and reloads canonical data', async () => {
    const r = record();
    const t = dictionary([r]);
    const id = identityFor(r);
    t.data.set(buildReceiptCacheKeyV1(id), JSON.stringify({ ...r, payload: { status: 'failed' } }));
    const res = await t.dict.lookup({ identity: id, grantActive: true });
    expect(res).toMatchObject({ status: 'MISS_LOADED', evicted: true });
    expect(res.record?.payload).toEqual({ status: 'passed', durationMs: 12 });
  });

  it('evicts a cached entry whose verifier status changed in PostgreSQL', async () => {
    const r = record();
    const t = dictionary([r], 'REVOKED');
    const id = identityFor(r);
    t.data.set(buildReceiptCacheKeyV1(id), JSON.stringify(r));
    const res = await t.dict.lookup({ identity: id, grantActive: true });
    expect(res.evicted).toBe(true);
    expect(res.status).toBe('MISS_LOADED');
    expect(t.currentVerificationStatus).toHaveBeenCalled();
  });

  it('rejects stale revisions and other-workspace rows returned by the canonical read', async () => {
    const r = record();
    const stale = dictionary([record({ sourceRevision: 'sha256:' + 'b'.repeat(64) })]);
    expect(await stale.dict.lookup({ identity: identityFor(r), grantActive: true })).toMatchObject({ status: 'REJECTED', reason: 'STALE_SOURCE_REVISION' });
    const other = dictionary([record({ workspaceRevision: 'ws-other' })]);
    expect(await other.dict.lookup({ identity: identityFor(r), grantActive: true })).toMatchObject({ status: 'REJECTED', reason: 'WORKSPACE_SCOPE_MISMATCH' });
    expect(stale.store.set).not.toHaveBeenCalled();
  });

  it('rejects a checksum that does not match the canonical row, and uncommitted rows, and never caches them', async () => {
    const r = record();
    const bad = dictionary([record({ payload: { status: 'failed' } })]);
    expect(await bad.dict.lookup({ identity: identityFor(r), grantActive: true })).toMatchObject({ status: 'REJECTED', reason: 'CHECKSUM_MISMATCH' });
    const uncommitted = record({ committed: false });
    const nc = dictionary([uncommitted]);
    expect(await nc.dict.lookup({ identity: identityFor(uncommitted), grantActive: true })).toMatchObject({ status: 'REJECTED', reason: 'NOT_COMMITTED' });
    expect(bad.store.set).not.toHaveBeenCalled();
    expect(nc.store.set).not.toHaveBeenCalled();
  });

  it('rejects a duplicate receipt identity and reports an absent receipt as NOT_FOUND', async () => {
    const r = record();
    const dup = dictionary([r, r]);
    expect(await dup.dict.lookup({ identity: identityFor(r), grantActive: true })).toMatchObject({ status: 'REJECTED', reason: 'DUPLICATE_RECEIPT_IDENTITY' });
    const none = dictionary([]);
    expect(await none.dict.lookup({ identity: identityFor(r), grantActive: true })).toMatchObject({ status: 'NOT_FOUND' });
  });
});

describe('task to receipt resolution', () => {
  it('stays UNRESOLVED when no explicit mapping exists, and never infers one', () => {
    expect(resolveTaskReceiptsV1({ taskStableKey: 'chg#abc', mapping: null })).toEqual({ status: 'UNRESOLVED_TASK_MAPPING', receiptIds: [] });
    expect(resolveTaskReceiptsV1({ taskStableKey: 'chg#abc', mapping: new Map([['other#1', ['r1']]]) }).status).toBe('UNRESOLVED_TASK_MAPPING');
  });

  it('resolves only from an explicit mapping and de-duplicates receipt ids', () => {
    const res = resolveTaskReceiptsV1({ taskStableKey: 'chg#abc', mapping: new Map([['chg#abc', ['r1', 'r1', 'r2']]]) });
    expect(res).toEqual({ status: 'RESOLVED', receiptIds: ['r1', 'r2'] });
  });
});
