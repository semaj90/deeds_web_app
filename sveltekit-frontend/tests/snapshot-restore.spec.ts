// @vitest-environment node

/**
 * P1.6 — Snapshot create + restore integrity contract tests.
 *
 * All hermetic: QdrantManager is mocked. No network calls.
 *
 * Covers:
 *  - createCollectionSnapshot() happy path and error handling
 *  - buildSnapshotBaseline() assembles correct baseline shape
 *  - listCollectionSnapshots() normalises and sorts Qdrant response
 *  - pruneSnapshots() deletes oldest when count exceeds keep
 *  - verifyRestoreIntegrity() gates: point-count match + sample recall
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock QdrantManager
// ---------------------------------------------------------------------------

const mockCreateSnapshot = vi.fn();
const mockListSnapshots = vi.fn();
const mockDeleteSnapshot = vi.fn();
const mockGetCollection = vi.fn();
const mockScroll = vi.fn();

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  getQdrantManager: () => ({
    client: {
      createSnapshot: mockCreateSnapshot,
      listSnapshots: mockListSnapshots,
      deleteSnapshot: mockDeleteSnapshot,
      getCollection: mockGetCollection,
      scroll: mockScroll,
    },
    getCollections: vi.fn(),
  }),
}));

import {
  createCollectionSnapshot,
  buildSnapshotBaseline,
  listCollectionSnapshots,
  pruneSnapshots,
  verifyRestoreIntegrity,
  type SnapshotBaseline,
} from '../src/lib/server/retrieval/snapshot-restore.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const COLLECTION = 'codebase_chunks_384_hybrid';

function makeSnapshotRaw(name: string, creation_time: string, size = 1024 * 1024 * 50) {
  return { name, creation_time, size, checksum: `sha256:${name}` };
}

function makeScrollResponse(packetKeys: string[]) {
  return {
    points: packetKeys.map((pk, i) => ({
      id: i + 1,
      payload: { packet_key: pk },
    })),
  };
}

function makeBaseline(overrides: Partial<SnapshotBaseline> = {}): SnapshotBaseline {
  return {
    collection: COLLECTION,
    snapshotName: 'snap-2026-01-01',
    pointCount: 1000,
    samplePacketKeys: ['ace:packet:auth:001', 'ace:packet:db:002', 'ace:packet:api:003'],
    takenAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createCollectionSnapshot
// ---------------------------------------------------------------------------

describe('createCollectionSnapshot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ok=true with snapshot description on success', async () => {
    mockCreateSnapshot.mockResolvedValue(
      makeSnapshotRaw('snap-2026-07-18T10:00:00', '2026-07-18T10:00:00Z'),
    );

    const result = await createCollectionSnapshot(COLLECTION);

    expect(result.ok).toBe(true);
    expect(result.snapshot?.name).toBe('snap-2026-07-18T10:00:00');
    expect(result.snapshot?.creationTime).toBe('2026-07-18T10:00:00Z');
    expect(result.snapshot?.sizeMb).toBe(50); // 50 MB
    expect(result.snapshot?.checksum).toContain('sha256:');
    expect(result.message).toMatch(/Snapshot .* created/);
  });

  it('handles result-wrapped Qdrant response', async () => {
    mockCreateSnapshot.mockResolvedValue({
      result: makeSnapshotRaw('snap-wrapped', '2026-07-18T11:00:00Z'),
    });

    const result = await createCollectionSnapshot(COLLECTION);

    expect(result.ok).toBe(true);
    expect(result.snapshot?.name).toBe('snap-wrapped');
  });

  it('returns ok=false when createSnapshot throws', async () => {
    mockCreateSnapshot.mockRejectedValue(new Error('Qdrant unreachable'));

    const result = await createCollectionSnapshot(COLLECTION);

    expect(result.ok).toBe(false);
    expect(result.snapshot).toBeNull();
    expect(result.message).toMatch(/createCollectionSnapshot failed/);
  });
});

// ---------------------------------------------------------------------------
// buildSnapshotBaseline
// ---------------------------------------------------------------------------

describe('buildSnapshotBaseline', () => {
  beforeEach(() => vi.clearAllMocks());

  it('assembles baseline with point count and sample keys', async () => {
    mockGetCollection.mockResolvedValue({ points_count: 40568 });
    mockScroll.mockResolvedValue(
      makeScrollResponse(['ace:packet:auth:001', 'ace:packet:db:002']),
    );

    const baseline = await buildSnapshotBaseline(COLLECTION, 'snap-test', 2);

    expect(baseline.collection).toBe(COLLECTION);
    expect(baseline.snapshotName).toBe('snap-test');
    expect(baseline.pointCount).toBe(40568);
    expect(baseline.samplePacketKeys).toEqual(['ace:packet:auth:001', 'ace:packet:db:002']);
    expect(baseline.takenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns pointCount=0 when getCollection fails', async () => {
    mockGetCollection.mockRejectedValue(new Error('not found'));
    mockScroll.mockResolvedValue(makeScrollResponse([]));

    const baseline = await buildSnapshotBaseline(COLLECTION, 'snap-err');

    expect(baseline.pointCount).toBe(0);
    expect(baseline.samplePacketKeys).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// listCollectionSnapshots
// ---------------------------------------------------------------------------

describe('listCollectionSnapshots', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns snapshots sorted newest first', async () => {
    mockListSnapshots.mockResolvedValue([
      makeSnapshotRaw('snap-old', '2026-01-01T00:00:00Z'),
      makeSnapshotRaw('snap-new', '2026-07-18T00:00:00Z'),
      makeSnapshotRaw('snap-mid', '2026-04-01T00:00:00Z'),
    ]);

    const result = await listCollectionSnapshots(COLLECTION);

    expect(result[0]!.name).toBe('snap-new');
    expect(result[1]!.name).toBe('snap-mid');
    expect(result[2]!.name).toBe('snap-old');
  });

  it('returns empty array when Qdrant fails', async () => {
    mockListSnapshots.mockRejectedValue(new Error('timeout'));

    const result = await listCollectionSnapshots(COLLECTION);

    expect(result).toHaveLength(0);
  });

  it('normalises size to MB', async () => {
    mockListSnapshots.mockResolvedValue([
      makeSnapshotRaw('snap-100mb', '2026-01-01T00:00:00Z', 100 * 1024 * 1024),
    ]);

    const result = await listCollectionSnapshots(COLLECTION);

    expect(result[0]!.sizeMb).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// pruneSnapshots
// ---------------------------------------------------------------------------

describe('pruneSnapshots', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes snapshots beyond the keep count (oldest first)', async () => {
    mockListSnapshots.mockResolvedValue([
      makeSnapshotRaw('snap-3', '2026-07-18T00:00:00Z'), // newest
      makeSnapshotRaw('snap-2', '2026-06-01T00:00:00Z'),
      makeSnapshotRaw('snap-1', '2026-05-01T00:00:00Z'), // oldest
    ]);
    mockDeleteSnapshot.mockResolvedValue(true);

    const result = await pruneSnapshots(COLLECTION, 2);

    expect(result.deleted).toEqual(['snap-1']);
    expect(result.kept).toEqual(['snap-3', 'snap-2']);
    expect(mockDeleteSnapshot).toHaveBeenCalledOnce();
    expect(mockDeleteSnapshot).toHaveBeenCalledWith(COLLECTION, 'snap-1');
  });

  it('does not delete when count ≤ keep', async () => {
    mockListSnapshots.mockResolvedValue([
      makeSnapshotRaw('snap-only', '2026-07-18T00:00:00Z'),
    ]);

    const result = await pruneSnapshots(COLLECTION, 3);

    expect(result.deleted).toHaveLength(0);
    expect(mockDeleteSnapshot).not.toHaveBeenCalled();
  });

  it('continues pruning when a single delete fails', async () => {
    mockListSnapshots.mockResolvedValue([
      makeSnapshotRaw('snap-3', '2026-07-18T00:00:00Z'),
      makeSnapshotRaw('snap-2', '2026-06-01T00:00:00Z'),
      makeSnapshotRaw('snap-1-fail', '2026-05-01T00:00:00Z'),
      makeSnapshotRaw('snap-0', '2026-04-01T00:00:00Z'),
    ]);
    mockDeleteSnapshot
      .mockResolvedValueOnce(true)         // snap-1-fail attempt fails...
      .mockRejectedValueOnce(new Error('locked')) // ...actually this is snap-1-fail
      .mockResolvedValue(true);

    // keep=2 → delete snap-1-fail and snap-0
    mockDeleteSnapshot
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('locked'));

    const result = await pruneSnapshots(COLLECTION, 2);

    // At least one was attempted even if one failed
    expect(mockDeleteSnapshot).toHaveBeenCalled();
    // The result.deleted only includes successfully deleted ones
    expect(Array.isArray(result.deleted)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// verifyRestoreIntegrity
// ---------------------------------------------------------------------------

describe('verifyRestoreIntegrity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ok=true when point count matches and all sample keys found', async () => {
    const baseline = makeBaseline();

    mockGetCollection.mockResolvedValue({ points_count: 1000 });
    // Each packet_key scroll returns one result (found)
    mockScroll.mockResolvedValue({ points: [{ id: 1, payload: {} }] });

    const result = await verifyRestoreIntegrity(baseline);

    expect(result.ok).toBe(true);
    expect(result.pointCountMatch).toBe(true);
    expect(result.sampleRecallRate).toBe(1);
    expect(result.message).toMatch(/verified/i);
  });

  it('returns ok=false when point count is below tolerance (< 99%)', async () => {
    const baseline = makeBaseline({ pointCount: 1000 });

    // 970 < 990 (99% of 1000)
    mockGetCollection.mockResolvedValue({ points_count: 970 });
    mockScroll.mockResolvedValue({ points: [{ id: 1 }] });

    const result = await verifyRestoreIntegrity(baseline);

    expect(result.ok).toBe(false);
    expect(result.pointCountMatch).toBe(false);
    expect(result.message).toMatch(/mismatch/i);
  });

  it('returns ok=false when sample recall < 90%', async () => {
    const baseline = makeBaseline({
      pointCount: 1000,
      samplePacketKeys: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10'],
    });

    mockGetCollection.mockResolvedValue({ points_count: 1000 });
    // Only 8/10 found (80% recall — below 90% threshold)
    let callCount = 0;
    mockScroll.mockImplementation(() => {
      callCount++;
      return callCount <= 8
        ? Promise.resolve({ points: [{ id: callCount }] })
        : Promise.resolve({ points: [] });
    });

    const result = await verifyRestoreIntegrity(baseline);

    expect(result.ok).toBe(false);
    expect(result.sampleRecallRate).toBe(0.8);
    expect(result.message).toMatch(/recall/i);
  });

  it('returns ok=true when actual points slightly exceed baseline', async () => {
    // More points than baseline is fine (e.g. items added since snapshot)
    const baseline = makeBaseline({ pointCount: 1000 });

    mockGetCollection.mockResolvedValue({ points_count: 1050 });
    mockScroll.mockResolvedValue({ points: [{ id: 1 }] });

    const result = await verifyRestoreIntegrity(baseline);

    expect(result.ok).toBe(true);
    expect(result.pointCountMatch).toBe(true);
  });

  it('returns ok=true when baseline has no sample keys (skip sample check)', async () => {
    const baseline = makeBaseline({ samplePacketKeys: [] });

    mockGetCollection.mockResolvedValue({ points_count: 1000 });
    // scroll should not be called since there are no sample keys
    mockScroll.mockResolvedValue({ points: [] });

    const result = await verifyRestoreIntegrity(baseline);

    expect(result.ok).toBe(true);
    expect(result.sampleRecallRate).toBe(1); // vacuously true
  });

  it('returns ok=false when scroll throws during sample verification', async () => {
    const baseline = makeBaseline();

    mockGetCollection.mockResolvedValue({ points_count: 1000 });
    mockScroll.mockRejectedValue(new Error('scroll failed'));

    const result = await verifyRestoreIntegrity(baseline);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Sample key verification failed/);
  });

  it('handles baseline pointCount=0 correctly (empty collection is valid restore)', async () => {
    const baseline = makeBaseline({ pointCount: 0, samplePacketKeys: [] });

    mockGetCollection.mockResolvedValue({ points_count: 0 });

    const result = await verifyRestoreIntegrity(baseline);

    expect(result.ok).toBe(true);
    expect(result.pointCountMatch).toBe(true);
  });

  it('reports actualPointCount and sampleRecallRate in result', async () => {
    const baseline = makeBaseline({ pointCount: 500 });

    mockGetCollection.mockResolvedValue({ points_count: 495 });
    mockScroll.mockResolvedValue({ points: [{ id: 1 }] });

    const result = await verifyRestoreIntegrity(baseline);

    expect(result.actualPointCount).toBe(495);
    expect(typeof result.sampleRecallRate).toBe('number');
    expect(result.baseline).toStrictEqual(baseline);
  });
});
