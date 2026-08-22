import { describe, expect, it } from 'vitest';

import { buildGraphSnapshotRevisionV1 } from './graph-snapshot-revision-v1.js';
import {
  buildGraphQdrantProjectionPatchV1,
  verifyGraphQdrantProjectionPatchV1,
} from './graph-qdrant-projection-patch-v1.js';

function fixtureSnapshot() {
  return buildGraphSnapshotRevisionV1({
    snapshotId: '11111111-1111-4111-8111-111111111111',
    workspaceRevision: `sha256:${'a'.repeat(64)}`,
    sourceInventoryRevision: `sha256:${'b'.repeat(64)}`,
    identityContractVersion: 'identity.v1',
    parserContractVersion: 'parser.v1',
    sourceInventoryHash: 'b'.repeat(64),
    topologyHash: 'c'.repeat(64),
    policyHash: 'd'.repeat(64),
    producerRevision: 'producer.v1',
  });
}

describe('GraphQdrantProjectionPatchV1', () => {
  it('builds a deterministic setPayload-only graph projection patch', () => {
    const snapshot = fixtureSnapshot();
    const first = buildGraphQdrantProjectionPatchV1({
      graphSnapshot: snapshot,
      qdrantPointId: '18446744073709551615',
      packetKey: 'packet-1',
      canonicalId: 'canonical-1',
      symbolVersionId: 'symbol-version-1',
      sourceRef: 'src/lib/a.ts',
      treeNodeId: 'tree-1',
      sourceRevision: `sha256:${'e'.repeat(64)}`,
      representationRevision: 'embeddinggemma-full768-v1',
    });
    const second = buildGraphQdrantProjectionPatchV1({
      graphSnapshot: snapshot,
      qdrantPointId: '18446744073709551615',
      packetKey: 'packet-1',
      canonicalId: 'canonical-1',
      symbolVersionId: 'symbol-version-1',
      sourceRef: 'src/lib/a.ts',
      treeNodeId: 'tree-1',
      sourceRevision: `sha256:${'e'.repeat(64)}`,
      representationRevision: 'embeddinggemma-full768-v1',
    });

    expect(first).toEqual(second);
    expect(first.qdrantCollection).toBe('codebase_chunks_768_v2');
    expect(first.mutation).toBe('SET_PAYLOAD_ONLY');
    expect(first.vectorWrite).toBe(false);
    expect(first.canonicalWritesAllowed).toBe(false);
    expect(first.identityAuthority).toBe(false);
    expect(first.workspaceWorldRevision).toBe(snapshot.workspaceRevision);
    expect(first.graphRevision).toBe(snapshot.graphRevision);
    expect(first.payload.packet_key).toBe('packet-1');
    expect(first.payload.source_revision).toBe(`sha256:${'e'.repeat(64)}`);
    expect(first.payload.representation_id).toBe('semantic_768');
  });

  it('preserves large Qdrant point ids as projection addresses rather than numeric identity', () => {
    const patch = buildGraphQdrantProjectionPatchV1({
      graphSnapshot: fixtureSnapshot(),
      qdrantPointId: '9223372036854775807',
      packetKey: 'packet-2',
      sourceRevision: `sha256:${'f'.repeat(64)}`,
      representationRevision: 42,
    });

    expect(patch.qdrantPointId).toBe('9223372036854775807');
    expect(patch.identity.packetKey).toBe('packet-2');
    expect(patch.identityAuthority).toBe(false);
  });

  it('rejects tampering with graph, source, workspace, packet or representation lineage', () => {
    const patch = buildGraphQdrantProjectionPatchV1({
      graphSnapshot: fixtureSnapshot(),
      qdrantPointId: 'point-3',
      packetKey: 'packet-3',
      sourceRevision: `sha256:${'1'.repeat(64)}`,
      representationRevision: 'rep-v1',
    });

    expect(() => verifyGraphQdrantProjectionPatchV1({
      ...patch,
      payload: { ...patch.payload, graph_revision: '2'.repeat(64) },
    })).toThrow(/CHECKSUM_MISMATCH|GRAPH_REVISION_MISMATCH/);

    expect(() => verifyGraphQdrantProjectionPatchV1({
      ...patch,
      payload: { ...patch.payload, source_revision: `sha256:${'3'.repeat(64)}` },
    })).toThrow(/CHECKSUM_MISMATCH|SOURCE_REVISION_MISMATCH/);

    expect(() => verifyGraphQdrantProjectionPatchV1({
      ...patch,
      payload: { ...patch.payload, workspace_world_revision: `sha256:${'4'.repeat(64)}` },
    })).toThrow(/CHECKSUM_MISMATCH|WORKSPACE_REVISION_MISMATCH/);

    expect(() => verifyGraphQdrantProjectionPatchV1({
      ...patch,
      payload: { ...patch.payload, packet_key: 'other-packet' },
    })).toThrow(/CHECKSUM_MISMATCH|PACKET_KEY_MISMATCH/);

    expect(() => verifyGraphQdrantProjectionPatchV1({
      ...patch,
      payload: { ...patch.payload, representation_revision: 'rep-v2' },
    })).toThrow(/CHECKSUM_MISMATCH|REPRESENTATION_REVISION_MISMATCH/);
  });

  it('rejects Git-like or cache-like source/workspace revision substitutions', () => {
    const snapshot = fixtureSnapshot();

    expect(() => buildGraphQdrantProjectionPatchV1({
      graphSnapshot: snapshot,
      qdrantPointId: 'point-4',
      packetKey: 'packet-4',
      sourceRevision: 'deadbeef',
      representationRevision: 'rep-v1',
    })).toThrow();

    expect(() => buildGraphQdrantProjectionPatchV1({
      graphSnapshot: { ...snapshot, workspaceRevision: '742' } as never,
      qdrantPointId: 'point-5',
      packetKey: 'packet-5',
      sourceRevision: `sha256:${'5'.repeat(64)}`,
      representationRevision: 'rep-v1',
    })).toThrow();
  });
});
