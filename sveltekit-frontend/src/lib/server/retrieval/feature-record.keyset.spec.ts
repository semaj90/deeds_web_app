// @vitest-environment node
/**
 * streamFeatureRecords keyset paging on (created_at, feature_id).
 *
 * The DB is mocked. db.execute receives the drizzle sql object, which is
 * converted with PgDialect.sqlToQuery and emulated over an in-memory fixture
 * using the bound params (feature_type, version, [cursor createdAt, cursor
 * featureId], limit).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const { executeMock, state } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  state: { rows: [] as Array<Record<string, unknown>>, calls: [] as Array<{ sql: string; params: unknown[] }> },
}));

vi.mock('$lib/server/db/client.js', () => ({
  db: { execute: (...args: unknown[]) => executeMock(...args) },
}));

import { streamFeatureRecords, type FeatureRecord } from '$lib/server/retrieval/feature-record.js';

const dialect = new PgDialect();

const T1 = new Date('2026-01-01T00:00:00.000Z');
const T2 = new Date('2026-01-02T00:00:00.000Z');

function row(id: string, createdAt: Date, extra: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    feature_id: id,
    packet_key: `pk:${id}`,
    feature_type: 'pagerank',
    version: 'v1',
    snapshot_hash: 'h'.repeat(64),
    payload: {},
    scalar_f32: 0.5,
    vector_f32: null,
    created_at: createdAt,
    superseded_at: null,
    superseded_by: null,
    ...extra,
  };
}

// Emulates: WHERE feature_type=$1 AND version=$2 AND superseded_at IS NULL
//           [AND (created_at, feature_id) > ($3::timestamptz, $4::uuid)]
//           ORDER BY created_at ASC, feature_id ASC LIMIT $n
function emulate(sqlText: string, params: unknown[]): Array<Record<string, unknown>> {
  const [featureType, version] = params as [string, string];
  const hasCursor = sqlText.includes('(created_at, feature_id) >');
  const limit = Number(params[params.length - 1]);
  let cursorTs = -Infinity;
  let cursorId = '';
  if (hasCursor) {
    cursorTs = Date.parse(String(params[2]));
    cursorId = String(params[3]);
  }
  const eligible = state.rows
    .filter((r) => r.feature_type === featureType && r.version === version && r.superseded_at == null)
    .filter((r) => {
      if (!hasCursor) return true;
      const ts = (r.created_at as Date).getTime();
      if (ts !== cursorTs) return ts > cursorTs;
      return String(r.feature_id) > cursorId;
    })
    .sort((a, b) => {
      const d = (a.created_at as Date).getTime() - (b.created_at as Date).getTime();
      if (d !== 0) return d;
      return String(a.feature_id) < String(b.feature_id) ? -1 : String(a.feature_id) > String(b.feature_id) ? 1 : 0;
    });
  return eligible.slice(0, limit);
}

beforeEach(() => {
  state.calls = [];
  executeMock.mockReset();
  executeMock.mockImplementation(async (query: unknown) => {
    const { sql: sqlText, params } = dialect.sqlToQuery(query as Parameters<PgDialect['sqlToQuery']>[0]);
    state.calls.push({ sql: sqlText, params });
    return { rows: emulate(sqlText, params) };
  });
});

// Fixture A: 10 eligible rows, all created_at = T1. IDs listed in insertion
// order are deliberately NOT sorted by feature_id.
const INSERTION_ORDER_IDS = [
  '7f3c0a10-0000-4000-8000-000000000009',
  '1a2b3c4d-0000-4000-8000-000000000003',
  'c0ffee00-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-000000000001',
  'ab12cd34-0000-4000-8000-000000000005',
  '3e4f5a6b-0000-4000-8000-000000000008',
  'ffffffff-0000-4000-8000-000000000002',
  '2b2b2b2b-0000-4000-8000-000000000004',
  '9d8e7f60-0000-4000-8000-000000000006',
  '5c5c5c5c-0000-4000-8000-00000000000a',
];

const EXCLUDED_OTHER_TYPE = 'eeeeeeee-0000-4000-8000-0000000000e1';
const EXCLUDED_SUPERSEDED = '0000eeee-0000-4000-8000-0000000000e2';

function collect(batchSize: number, initialCursor?: Parameters<typeof streamFeatureRecords>[4]) {
  const seen: FeatureRecord[] = [];
  const batches: number[] = [];
  return streamFeatureRecords(
    'pagerank',
    'v1',
    async (batch) => {
      batches.push(batch.length);
      seen.push(...batch);
    },
    batchSize,
    initialCursor,
  ).then((out) => ({ ...out, seen, batches }));
}

function assertExactSetAndOrder(seen: FeatureRecord[], expectedIds: string[]) {
  const ids = seen.map((r) => r.feature_id);
  // (a) total count
  expect(ids.length).toBe(expectedIds.length);
  // (b) no duplicates
  expect(new Set(ids).size).toBe(ids.length);
  // (c) no skipped rows: set equality
  expect([...ids].sort()).toEqual([...expectedIds].sort());
  // (d) emitted order == sort by feature_id asc (within the tied created_at)
  expect(ids).toEqual([...expectedIds].sort());
}

describe('streamFeatureRecords keyset paging', () => {
  beforeEach(() => {
    state.rows = [
      ...INSERTION_ORDER_IDS.map((id) => row(id, T1)),
      row(EXCLUDED_OTHER_TYPE, T1, { feature_type: 'embedding768' }),
      row(EXCLUDED_SUPERSEDED, T1, { superseded_at: new Date('2026-01-03T00:00:00.000Z') }),
    ];
  });

  it('emits SQL with keyset clause, ORDER BY created_at, feature_id, and no OFFSET', async () => {
    await collect(3);
    expect(state.calls.length).toBeGreaterThan(1);
    const first = state.calls[0]!.sql;
    const second = state.calls[1]!.sql;
    expect(first).toMatch(/ORDER BY created_at ASC, feature_id ASC/);
    expect(first).not.toMatch(/OFFSET/i);
    expect(first).not.toContain('(created_at, feature_id) >');
    expect(second).toContain('(created_at, feature_id) >');
    expect(second).not.toMatch(/OFFSET/i);
  });

  it.each([1, 3, 4])('batchSize %i: count, no dupes, no skips, feature_id order', async (batchSize) => {
    const out = await collect(batchSize);
    assertExactSetAndOrder(out.seen, INSERTION_ORDER_IDS);
    expect(out.total).toBe(INSERTION_ORDER_IDS.length);
    expect(out.seen.some((r) => r.feature_id === EXCLUDED_OTHER_TYPE)).toBe(false);
    expect(out.seen.some((r) => r.feature_id === EXCLUDED_SUPERSEDED)).toBe(false);
  });

  it('batchSize 3 crosses tie boundaries (multiple batches inside one created_at)', async () => {
    const out = await collect(3);
    expect(out.batches).toEqual([3, 3, 3, 1]);
  });
});

describe('streamFeatureRecords keyset paging across two timestamp groups', () => {
  const GROUP_T1 = [
    'a1a1a1a1-0000-4000-8000-000000000011',
    '0b0b0b0b-0000-4000-8000-000000000012',
    'd4d4d4d4-0000-4000-8000-000000000013',
    '6e6e6e6e-0000-4000-8000-000000000014',
    '82828282-0000-4000-8000-000000000015',
  ];
  const GROUP_T2 = [
    'f0f0f0f0-0000-4000-8000-000000000021',
    '1c1c1c1c-0000-4000-8000-000000000022',
    'bbbbbbbb-0000-4000-8000-000000000023',
    '44444444-0000-4000-8000-000000000024',
    'e9e9e9e9-0000-4000-8000-000000000025',
  ];

  beforeEach(() => {
    // Insert T2 rows first so insertion order does not match created_at order.
    state.rows = [
      ...GROUP_T2.map((id) => row(id, T2)),
      ...GROUP_T1.map((id) => row(id, T1)),
    ];
  });

  it.each([1, 2, 3, 4, 5])('batchSize %i spans the T1/T2 boundary without skips or dupes', async (batchSize) => {
    const out = await collect(batchSize);
    const expectedOrder = [...GROUP_T1].sort().concat([...GROUP_T2].sort());
    const ids = out.seen.map((r) => r.feature_id);
    expect(ids.length).toBe(10);
    expect(new Set(ids).size).toBe(10);
    expect(ids).toEqual(expectedOrder);
  });
});
