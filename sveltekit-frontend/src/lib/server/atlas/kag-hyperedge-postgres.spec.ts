import { describe, expect, it, vi } from 'vitest';
import { createHyperedgeV1 } from '../graph/hyperedge-contract.js';

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: queryMock, release: releaseMock }));
vi.mock('$lib/server/db/client.js', () => ({ pool: { connect: () => connectMock() } }));

function edge(overrides: Partial<Parameters<typeof createHyperedgeV1>[0]> = {}) {
  return createHyperedgeV1({
    predicate: 'CALLS',
    participants: [
      { canonicalId: 'symbol:a', role: 'caller', ordinal: 0 },
      { canonicalId: 'symbol:b', role: 'callee', ordinal: 1 },
    ],
    evidenceRefs: ['packet:pg-test-1'],
    workspaceRevision: 'workspace:pg-test-1',
    graphRevision: 'graph:pg-test-1',
    sourceRevision: 'source:pg-test-1',
    producerRevision: 'test-producer:v1',
    ...overrides,
  });
}

describe('KAG-05: persistHyperedges', () => {
  it('is a no-op for an empty edge array (never connects)', async () => {
    connectMock.mockClear();
    const { persistHyperedges } = await import('./kag-hyperedge-postgres.js');
    const result = await persistHyperedges([]);

    expect(result).toEqual({ attempted: 0, written: 0, errors: [] });
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('persists the header then each member inside one BEGIN/COMMIT transaction', async () => {
    queryMock.mockClear();
    releaseMock.mockClear();
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO atlas_hyperedges')) return Promise.resolve({ rows: [{ hyperedge_id: 'uuid-1' }] });
      return Promise.resolve({ rows: [] });
    });

    const { persistHyperedges } = await import('./kag-hyperedge-postgres.js');
    const testEdge = edge();
    const result = await persistHyperedges([testEdge]);

    expect(result).toEqual({ attempted: 1, written: 1, errors: [] });
    const calls = queryMock.mock.calls.map((call) => call[0]);
    expect(calls[0]).toBe('BEGIN');
    expect(calls[1]).toContain('INSERT INTO atlas_hyperedges');
    expect(calls[2]).toContain('INSERT INTO atlas_hyperedge_members');
    expect(calls[3]).toContain('INSERT INTO atlas_hyperedge_members');
    expect(calls[4]).toBe('COMMIT');
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('rolls back and records a per-edge error without losing other edges in the batch', async () => {
    queryMock.mockClear();
    releaseMock.mockClear();
    let call = 0;
    queryMock.mockImplementation((sql: string) => {
      call += 1;
      if (sql === 'BEGIN' || sql === 'ROLLBACK' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql.includes('INSERT INTO atlas_hyperedges')) {
        if (call <= 2) return Promise.reject(new Error('duplicate key value')); // fails inside edge #1's transaction
        return Promise.resolve({ rows: [{ hyperedge_id: 'uuid-2' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const { persistHyperedges } = await import('./kag-hyperedge-postgres.js');
    const failingEdge = edge({ producerRevision: 'test-producer:fail' });
    const succeedingEdge = edge({ producerRevision: 'test-producer:ok' });
    const result = await persistHyperedges([failingEdge, succeedingEdge]);

    expect(result.attempted).toBe(2);
    expect(result.written).toBe(1);
    expect(result.errors).toEqual([{ hyperedgeId: failingEdge.hyperedgeId, message: 'duplicate key value' }]);
    expect(queryMock.mock.calls.some((c) => c[0] === 'ROLLBACK')).toBe(true);
    expect(releaseMock).toHaveBeenCalledTimes(1); // one client, released once at the end of the batch
  });

  it('treats identity and revision columns as immutable on conflict', async () => {
    queryMock.mockClear();
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO atlas_hyperedges')) return Promise.resolve({ rows: [{ hyperedge_id: 'uuid-1' }] });
      return Promise.resolve({ rows: [] });
    });

    const { persistHyperedges } = await import('./kag-hyperedge-postgres.js');
    await persistHyperedges([edge()]);

    const upsertSql = String(queryMock.mock.calls.map((c) => c[0]).find((s) => String(s).includes('INSERT INTO atlas_hyperedges')));
    const afterSet = upsertSql.split('DO UPDATE SET')[1];
    const setClause = afterSet.split('WHERE')[0];
    const guardClause = afterSet.split('WHERE')[1];

    expect(setClause).toMatch(/confidence/);
    expect(setClause).toMatch(/lifecycle/);
    for (const immutable of ['relation_type', 'packet_key', 'workspace_revision', 'source_revision', 'graph_revision', 'producer_revision', 'evidence_hash', 'evidence_refs', 'checksum']) {
      expect(setClause, `${immutable} must not be overwritten`).not.toContain(immutable);
      expect(guardClause, `${immutable} must be guarded`).toContain(`atlas_hyperedges.${immutable} IS NOT DISTINCT FROM EXCLUDED.${immutable}`);
    }
  });

  it('rejects a same-id edge with a different revision instead of overwriting it', async () => {
    queryMock.mockClear();
    releaseMock.mockClear();
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO atlas_hyperedges')) return Promise.resolve({ rows: [] }); // guard blocked the update
      return Promise.resolve({ rows: [] });
    });

    const { persistHyperedges } = await import('./kag-hyperedge-postgres.js');
    const result = await persistHyperedges([edge()]);
    const calls = queryMock.mock.calls.map((call) => String(call[0]));

    expect(result.written).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/^KAG_HYPEREDGE_REVISION_CONFLICT:/);
    expect(calls).toContain('ROLLBACK');
    expect(calls.some((c) => c.includes('INSERT INTO atlas_hyperedge_members'))).toBe(false);
    expect(calls).not.toContain('COMMIT');
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('releases the client even when every edge fails', async () => {
    queryMock.mockClear();
    releaseMock.mockClear();
    queryMock.mockImplementation((sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
      return Promise.reject(new Error('connection refused'));
    });

    const { persistHyperedges } = await import('./kag-hyperedge-postgres.js');
    const result = await persistHyperedges([edge()]);

    expect(result.written).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});
