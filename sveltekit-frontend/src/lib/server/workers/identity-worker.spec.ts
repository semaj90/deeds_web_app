// @vitest-environment node
/**
 * Identity Worker — Drizzle writer correctness regression (S180-6C)
 *
 * Proves processPacketIdentity():
 * 1. Reads/writes atlas_packets via the real camelCase Drizzle properties
 *    (packetKey, featureId, identityLane, identityConfidence, updatedAt) —
 *    NOT the raw snake_case column names (packet_key, feature_id, ...).
 * 2. Never calls `eq()` with `undefined` as the column argument.
 * 3. Fails closed (quarantine, was_updated=false) when zero or more than one
 *    row matches packet_key, instead of silently no-op'ing or picking row[0].
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSelect, mockUpdate, mockEq, mockIsNull, mockAnd, mockCreatePermissionManager } =
  vi.hoisted(() => ({
    mockSelect: vi.fn(),
    mockUpdate: vi.fn(),
    mockEq: vi.fn((col: unknown, val: unknown) => ({ __eq: true, col, val })),
    mockIsNull: vi.fn((col: unknown) => ({ __isNull: true, col })),
    mockAnd: vi.fn((...conds: unknown[]) => ({ __and: conds })),
    mockCreatePermissionManager: vi.fn(() => ({ canWrite: () => true })),
  }));

// Sentinel column objects — distinguishable from `undefined` so tests can prove
// eq()/set() received a real Drizzle property, not a nonexistent snake_case one.
const ATLAS_PACKETS_MOCK = {
  packetKey: { __col: 'packet_key' },
  sourceRef: { __col: 'source_ref' },
  featureId: { __col: 'feature_id' },
  identityLane: { __col: 'identity_lane' },
  identityConfidence: { __col: 'identity_confidence' },
  updatedAt: { __col: 'updated_at' },
  directoryPath: { __col: 'directory_path' },
  featureLabel: { __col: 'feature_label' },
  qdrantPointId: { __col: 'qdrant_point_id' },
  neo4jNodeId: { __col: 'neo4j_node_id' },
  createdAt: { __col: 'created_at' },
};

vi.mock('$lib/server/db/client.js', () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
  isNull: mockIsNull,
  and: mockAnd,
}));

vi.mock('../db/schema-postgres.js', () => ({
  atlasPackets: ATLAS_PACKETS_MOCK,
}));

vi.mock('../topology/permission-manager.js', () => ({
  createPermissionManager: mockCreatePermissionManager,
}));

function mockSelectResult(rows: unknown[]) {
  const limit = vi.fn(async () => rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  mockSelect.mockReturnValueOnce({ from });
  return { from, where, limit };
}

function mockUpdateChain() {
  const where = vi.fn(async () => undefined);
  const set = vi.fn((_values: Record<string, unknown>) => ({ where }));
  mockUpdate.mockReturnValueOnce({ set });
  return { set, where };
}

describe('identity-worker: processPacketIdentity (S180-6C Drizzle correctness)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreatePermissionManager.mockReturnValue({ canWrite: () => true });
  });

  it('existing packet gets canonical packetKey — reads/writes via real Drizzle properties', async () => {
    const row = {
      packetKey: 'ace:packet:abc123',
      sourceRef: 'src/lib/server/auth.ts',
      featureId: 'auth.sessions',
      directoryPath: 'src/lib/server',
      featureLabel: 'auth',
    };
    mockSelectResult([row]);
    const { set, where: updateWhere } = mockUpdateChain();

    const { processPacketIdentity } = await import('./identity-worker.js');
    const result = await processPacketIdentity('ace:packet:abc123');

    // 1. select().where() must have been called with eq(atlasPackets.packetKey, key) —
    //    the real Drizzle property, not `atlasPackets.packet_key` (undefined).
    expect(mockEq).toHaveBeenCalledWith(ATLAS_PACKETS_MOCK.packetKey, 'ace:packet:abc123');
    expect(mockEq.mock.calls.some(([col]) => col === undefined)).toBe(false);

    // 2. update().set() must use camelCase keys that exist on the schema, never
    //    the missing repository_id/directory_id/file_id/module_id/symbol_id/chunk_id.
    expect(set).toHaveBeenCalledTimes(1);
    const setArg = set.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(setArg).sort()).toEqual(
      ['featureId', 'identityConfidence', 'identityLane', 'updatedAt'].sort()
    );
    expect(setArg).not.toHaveProperty('repository_id');
    expect(setArg).not.toHaveProperty('packet_key');
    expect(setArg).not.toHaveProperty('feature_id');

    // 3. update().where() must also use the real packetKey column.
    expect(updateWhere).toHaveBeenCalledTimes(1);

    expect(result.was_updated).toBe(true);
    expect(result.source_ref).toBe('src/lib/server/auth.ts');
    expect(['created', 'updated']).toContain(result.action);
  });

  it('missing target: zero rows found → skipped, no update attempted', async () => {
    mockSelectResult([]);

    const { processPacketIdentity } = await import('./identity-worker.js');
    const result = await processPacketIdentity('ace:packet:does-not-exist');

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.action).toBe('skipped');
    expect(result.identity_lane).toBe('quarantine');
    expect(result.was_updated).toBe(false);
    expect(result.validation_errors).toContain('packet not found in Postgres');
  });

  it('duplicate target: more than one row matches packet_key → fails closed, no update attempted', async () => {
    mockSelectResult([
      { packetKey: 'ace:packet:dup', sourceRef: 'src/a.ts', featureId: 'a' },
      { packetKey: 'ace:packet:dup', sourceRef: 'src/b.ts', featureId: 'b' },
    ]);

    const { processPacketIdentity } = await import('./identity-worker.js');
    const result = await processPacketIdentity('ace:packet:dup');

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.action).toBe('skipped');
    expect(result.identity_lane).toBe('quarantine');
    expect(result.was_updated).toBe(false);
    expect(result.validation_errors.some((e) => e.includes('duplicate packet_key'))).toBe(true);
  });
});
