import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { db, pgRows } from '$lib/server/db/client';
import { ObservationIngester, type RawObservation } from '$lib/server/unknown/observation-ingester';

describe('Phase 109 Stage 1: Observation Intake (DB Integration)', () => {
  const ingester = new ObservationIngester();
  const testPrefix = `phase109:${Date.now()}`;
  const observedUnknownIds = new Set<string>();
  const observedObservationIds = new Set<string>();

  const remember = (result: { unknown_id: string; observation_id: string }) => {
    observedUnknownIds.add(result.unknown_id);
    observedObservationIds.add(result.observation_id);
  };

  const selectPacketsByObservation = async (observationId: string) =>
    pgRows<Record<string, unknown>>(
      await db.execute(sql`
        SELECT
          unknown_id,
          observation_id,
          workspace_id,
          potential_source_ref,
          potential_feature_id,
          potential_feature_label,
          evidence_payload,
          status
        FROM unknown_packets
        WHERE observation_id = ${observationId}
      `)
    );

  const selectLedgerByUnknown = async (unknownId: string) =>
    pgRows<Record<string, unknown>>(
      await db.execute(sql`
        SELECT
          unknown_id,
          stage,
          gate_name,
          gate_result
        FROM unknown_resolution_ledger
        WHERE unknown_id = ${unknownId}
      `)
    );

  afterAll(async () => {
    if (observedUnknownIds.size > 0) {
      await db.execute(sql`
        DELETE FROM unknown_resolution_ledger
        WHERE unknown_id IN (${sql.join([...observedUnknownIds].map(id => sql`${id}`), sql`, `)})
      `);
    }

    if (observedObservationIds.size > 0) {
      await db.execute(sql`
        DELETE FROM unknown_packets
        WHERE observation_id IN (${sql.join([...observedObservationIds].map(id => sql`${id}`), sql`, `)})
      `);
    }
  });

  it('Test 1: Valid observation inserts a packet row through ObservationIngester', async () => {
    const obs: RawObservation = {
      observation_id: `${testPrefix}:obs-001`,
      workspace_id: 'workspace-001',
      potential_source_ref: 'src\\lib\\server\\auth.ts',
      potential_feature_id: 'auth.sessions',
      potential_feature_label: 'Authentication Sessions',
      source_kind: 'scanner',
      evidence_payload: { user_count: 42 },
    };

    const result = await ingester.ingest(obs);
    remember(result);

    expect(result.overall_result).toBe('PASS');

    const rows = await selectPacketsByObservation(obs.observation_id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.workspace_id).toBe(obs.workspace_id);
    expect(rows[0]?.potential_source_ref).toBe('src/lib/server/auth.ts');
    expect(rows[0]?.status).toBe('OBSERVATION');
  });

  it('Test 2: Successful ingestion records a ledger entry in the same path', async () => {
    const obs: RawObservation = {
      observation_id: `${testPrefix}:obs-002`,
      workspace_id: 'workspace-001',
      potential_source_ref: 'src/lib/server/db/client.ts',
      potential_feature_id: 'db.pool',
      potential_feature_label: 'Database Connection Pool',
      source_kind: 'scanner',
      evidence_payload: { pool_size: 10 },
    };

    const result = await ingester.ingest(obs);
    remember(result);

    expect(result.overall_result).toBe('PASS');

    const ledgerRows = await selectLedgerByUnknown(result.unknown_id);
    expect(ledgerRows.length).toBeGreaterThan(0);
    expect(ledgerRows.some(row => row.gate_name === 'OBSERVATION_IDENTITY_COMPLETE')).toBe(true);
  });

  it('Test 3: Duplicate observation_id is rejected without inserting a second row', async () => {
    const obs: RawObservation = {
      observation_id: `${testPrefix}:obs-003`,
      workspace_id: 'workspace-001',
      potential_source_ref: 'src/lib/server/cache.ts',
      potential_feature_id: 'cache.redis',
      potential_feature_label: 'Redis Cache',
      source_kind: 'scanner',
      evidence_payload: { cache: true },
    };

    const first = await ingester.ingest(obs);
    remember(first);
    expect(first.overall_result).toBe('PASS');

    const second = await ingester.ingest(obs);
    remember(second);
    expect(second.overall_result).toBe('FAIL');
    expect(second.error).toMatch(/Duplicate observation_id/i);

    const rows = await selectPacketsByObservation(obs.observation_id);
    expect(rows).toHaveLength(1);
  });

  it('Test 4: Invalid identity fails before any database row is created', async () => {
    const obs: RawObservation = {
      observation_id: `${testPrefix}:obs-004`,
      workspace_id: '',
      potential_source_ref: 'src/lib/server/vector.ts',
      potential_feature_id: 'vector.qdrant',
      potential_feature_label: 'Qdrant Vector Search',
      source_kind: 'scanner',
      evidence_payload: { enabled: true },
    };

    const result = await ingester.ingest(obs);
    remember(result);

    expect(result.overall_result).toBe('FAIL');
    expect(result.error).toMatch(/workspace_id/i);

    const rows = await selectPacketsByObservation(obs.observation_id);
    expect(rows).toHaveLength(0);
  });

  it('Test 5: Evidence payload persists as JSON for accepted observations', async () => {
    const obs: RawObservation = {
      observation_id: `${testPrefix}:obs-005`,
      workspace_id: 'workspace-001',
      potential_source_ref: 'src/lib/server/topology.ts',
      potential_feature_id: 'topology.neo4j',
      potential_feature_label: 'Neo4j Topology',
      source_kind: 'scanner',
      evidence_payload: {
        nested: { level: 2 },
        tags: ['neo4j', 'topology'],
      },
    };

    const result = await ingester.ingest(obs);
    remember(result);

    expect(result.overall_result).toBe('PASS');

    const rows = await selectPacketsByObservation(obs.observation_id);
    expect(rows).toHaveLength(1);

    const payload = rows[0]?.evidence_payload as { nested?: { level?: number }; tags?: string[] } | null;
    expect(payload?.nested?.level).toBe(2);
    expect(payload?.tags).toEqual(['neo4j', 'topology']);
  });
});
