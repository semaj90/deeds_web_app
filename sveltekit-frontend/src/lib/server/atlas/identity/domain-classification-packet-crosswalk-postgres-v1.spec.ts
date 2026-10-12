import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbQuery = vi.hoisted(() => vi.fn());
const dbRelease = vi.hoisted(() => vi.fn());
const dbConnect = vi.hoisted(() => vi.fn(async () => ({ query: dbQuery, release: dbRelease })));

vi.mock('$lib/server/db/client.js', () => ({ pool: { connect: dbConnect } }));

import { resolveDomainClassificationPacketCrosswalkFromPostgresV1 } from './domain-classification-packet-crosswalk-postgres-v1.js';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceRevision = `sha256:${'b'.repeat(64)}`;
const packetKey = 'packet:550e8400-e29b-51d4-a716-446655440000';

const proposal = {
  schemaVersion: 'atlas.okf.domain-classification.v1' as const,
  classificationId: 'classification:1',
  subjectRef: 'symbol:stable-1',
  subjectKind: 'symbol' as const,
  domainId: 'retrieval',
  taxonomyRevision: 'taxonomy:v1',
  confidence: 0.9,
  evidenceRefs: ['repo:src/search.ts'],
  sourceRevision,
  producerId: 'domain-taxonomy:rules',
  producerRevision: 'rules:v1',
  lifecycle: 'DERIVED' as const,
};

describe('resolveDomainClassificationPacketCrosswalkFromPostgresV1', () => {
  beforeEach(() => {
    dbQuery.mockReset();
    dbRelease.mockReset();
    dbConnect.mockClear();
  });

  it('reads packet and identity rows in one read-only repeatable-read transaction', async () => {
    dbQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT packet_key, source_ref')) {
        return { rows: [{ packet_key: packetKey, source_ref: 'repo:src/search.ts', source_revision: sourceRevision, workspace_revision_key: workspaceRevision }] };
      }
      if (sql.startsWith('SELECT EXISTS')) return { rows: [{ row_exists: true }] };
      return { rows: [] };
    });

    const result = await resolveDomainClassificationPacketCrosswalkFromPostgresV1({
      rows: [proposal],
      workspaceRevision,
    });

    expect(result.status).toBe('MATCHED_NOT_ADMITTED');
    expect(result.rows[0]).toMatchObject({ packetKey, canonicalPacketKey: packetKey, status: 'MATCHED_NOT_ADMITTED' });
    expect(dbQuery.mock.calls[0]?.[0]).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(dbQuery.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    expect(dbRelease).toHaveBeenCalledOnce();
  });

  it('rolls back and releases on provider failure', async () => {
    dbQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT packet_key, source_ref')) throw new Error('READ_FAILED');
      return { rows: [] };
    });

    await expect(resolveDomainClassificationPacketCrosswalkFromPostgresV1({
      rows: [proposal],
      workspaceRevision,
    })).rejects.toThrow('READ_FAILED');

    expect(dbQuery.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(dbRelease).toHaveBeenCalledOnce();
  });
});
