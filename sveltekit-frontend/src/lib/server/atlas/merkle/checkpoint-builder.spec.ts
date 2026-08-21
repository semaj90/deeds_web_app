import { describe, expect, it, vi } from 'vitest';
import { buildAnalyticsCheckpoint, type CanonicalCheckpointEvent } from './checkpoint-builder.js';

function event(overrides: Partial<CanonicalCheckpointEvent> = {}): CanonicalCheckpointEvent {
  return {
    streamOffset: '0',
    eventId: 'evt-1',
    occurredAt: '2026-08-20T00:00:00.000Z',
    canonicalJson: '{"a":1}',
    canonicalEventHashHex: 'deadbeef',
    ...overrides,
  };
}

describe('buildAnalyticsCheckpoint', () => {
  it('refuses to checkpoint an empty population', async () => {
    const persistLeafManifest = vi.fn();
    await expect(
      buildAnalyticsCheckpoint({
        checkpointId: 'cp-1',
        stream: 'stream-a',
        events: [],
        schemaRevision: 'rev-1',
        checkpointAlgorithmRevision: 'algo-1',
        persistLeafManifest,
      }),
    ).rejects.toThrow(/empty analytics population/);
    expect(persistLeafManifest).not.toHaveBeenCalled();
  });

  it('builds a payload conforming to CheckpointCommitPayloadV1 and a deterministic Merkle root', async () => {
    const persistLeafManifest = vi.fn(async (leaves: readonly unknown[]) => ({
      ref: `manifest-${leaves.length}`,
      hashHex: 'manifest-hash',
    }));

    const events = [
      event({ streamOffset: '0', eventId: 'evt-1', occurredAt: '2026-08-20T00:00:00.000Z' }),
      event({ streamOffset: '1', eventId: 'evt-2', occurredAt: '2026-08-20T00:01:00.000Z' }),
      event({ streamOffset: '2', eventId: 'evt-3', occurredAt: '2026-08-20T00:02:00.000Z' }),
    ];

    const result = await buildAnalyticsCheckpoint({
      checkpointId: 'cp-1',
      stream: 'stream-a',
      events,
      schemaRevision: 'rev-1',
      checkpointAlgorithmRevision: 'algo-1',
      sourceRevisionSetHash: 'src-rev-hash',
      graphRevision: 'graph-rev-1',
      persistLeafManifest,
    });

    expect(persistLeafManifest).toHaveBeenCalledTimes(1);
    const leavesArg = persistLeafManifest.mock.calls[0][0];
    expect(leavesArg).toHaveLength(3);
    expect(leavesArg[0]).toMatchObject({ ordinal: 0, streamOffset: '0', eventId: 'evt-1' });

    expect(result.payload.checkpointId).toBe('cp-1');
    expect(result.payload.stream).toBe('stream-a');
    expect(result.payload.startOffset).toBe('0');
    expect(result.payload.endOffset).toBe('2');
    expect(result.payload.eventCount).toBe(3);
    expect(result.payload.firstOccurredAt).toBe('2026-08-20T00:00:00.000Z');
    expect(result.payload.lastOccurredAt).toBe('2026-08-20T00:02:00.000Z');
    expect(result.payload.schemaRevision).toBe('rev-1');
    expect(result.payload.sourceRevisionSetHash).toBe('src-rev-hash');
    expect(result.payload.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(result.payload.metadata).toMatchObject({
      checkpointAlgorithmRevision: 'algo-1',
      graphRevision: 'graph-rev-1',
      leafManifestRef: 'manifest-3',
      leafManifestHashHex: 'manifest-hash',
    });
    expect(result.leafManifestRef).toBe('manifest-3');
  });

  it('produces the same Merkle root for the same events across two runs (determinism)', async () => {
    const persistLeafManifest = vi.fn(async () => ({ ref: 'r', hashHex: 'h' }));
    const events = [event({ streamOffset: '0' }), event({ streamOffset: '1', eventId: 'evt-2' })];

    const first = await buildAnalyticsCheckpoint({
      checkpointId: 'cp-a',
      stream: 's',
      events,
      schemaRevision: 'rev-1',
      checkpointAlgorithmRevision: 'algo-1',
      persistLeafManifest,
    });
    const second = await buildAnalyticsCheckpoint({
      checkpointId: 'cp-b',
      stream: 's',
      events,
      schemaRevision: 'rev-1',
      checkpointAlgorithmRevision: 'algo-1',
      persistLeafManifest,
    });

    expect(first.payload.merkleRoot).toBe(second.payload.merkleRoot);
  });

  it('changes the Merkle root when a single event payload changes', async () => {
    const persistLeafManifest = vi.fn(async () => ({ ref: 'r', hashHex: 'h' }));

    const base = await buildAnalyticsCheckpoint({
      checkpointId: 'cp-a',
      stream: 's',
      events: [event({ canonicalJson: '{"a":1}' })],
      schemaRevision: 'rev-1',
      checkpointAlgorithmRevision: 'algo-1',
      persistLeafManifest,
    });
    const mutated = await buildAnalyticsCheckpoint({
      checkpointId: 'cp-a',
      stream: 's',
      events: [event({ canonicalJson: '{"a":2}' })],
      schemaRevision: 'rev-1',
      checkpointAlgorithmRevision: 'algo-1',
      persistLeafManifest,
    });

    expect(base.payload.merkleRoot).not.toBe(mutated.payload.merkleRoot);
  });
});