import { describe, expect, it } from 'vitest';

import {
  buildSourceRefCandidates,
  extractWorkspaceRevisionFromMetadata as extractIndexedWorkspaceRevision,
} from './indexed-source-packet.js';
import { resolveCanonicalIdentity } from './identity-contract.js';
import {
  extractWorkspaceRevisionFromMetadata as extractLaneWorkspaceRevision,
  normalizeQdrantPayloadIdentity,
} from './retrieval/evidence-lanes.js';

describe('identity join normalization', () => {
  it('preserves source ref variants without rewriting the canonical candidate', () => {
    expect(buildSourceRefCandidates('src/lib/server/ace/indexed-source-packet.ts')).toEqual([
      'src/lib/server/ace/indexed-source-packet.ts',
      'sveltekit-frontend/src/lib/server/ace/indexed-source-packet.ts',
    ]);
  });

  it('extracts workspace revision from snake_case, camelCase, or revision metadata', () => {
    expect(extractIndexedWorkspaceRevision({ workspace_revision: 'rev-a' })).toBe('rev-a');
    expect(extractLaneWorkspaceRevision({ workspaceRevision: 'rev-b' })).toBe('rev-b');
    expect(extractIndexedWorkspaceRevision({ revision: 'rev-c' })).toBe('rev-c');
  });

  it('normalizes qdrant payload identity without dropping the packet spine', () => {
    expect(
      normalizeQdrantPayloadIdentity({
        id: 'qdrant-point-123',
        packet_key: 'packet-1',
        source_ref: 'src/app.ts',
        content_hash: 'hash-1',
        tree_node_id: 'tree-1',
        feature_id: 'feat-1',
        feature_label: 'feature label',
        workspaceRevision: 'rev-1',
      })
    ).toEqual({
      backendLocalId: 'qdrant-point-123',
      canonicalIdentity: {
        value: 'packet-1',
        source: 'packet_key',
        status: 'canonical',
        backendLocalId: 'qdrant-point-123',
      },
      identityStatus: 'canonical',
      packetKey: 'packet-1',
      sourceRef: 'src/app.ts',
      contentHash: 'hash-1',
      treeNodeId: 'tree-1',
      featureId: 'feat-1',
      featureLabel: 'feature label',
      workspaceRevision: 'rev-1',
    });
  });

  it('resolves canonical identity in precedence order and fails open on degraded fallbacks', () => {
    expect(
      resolveCanonicalIdentity({
        symbolVersionId: 'symbol-v1',
        packetKey: 'packet-v1',
        sourceRef: 'src/app.ts',
        backendLocalId: 'qdrant-point-123',
      })
    ).toEqual({
      value: 'symbol-v1',
      source: 'symbol_version_id',
      status: 'canonical',
      backendLocalId: 'qdrant-point-123',
    });

    expect(
      resolveCanonicalIdentity({
        packetKey: 'packet-v2',
        sourceRef: 'src/app.ts',
        backendLocalId: 'qdrant-point-456',
      })
    ).toEqual({
      value: 'packet-v2',
      source: 'packet_key',
      status: 'canonical',
      backendLocalId: 'qdrant-point-456',
    });

    expect(
      resolveCanonicalIdentity({
        sourceRef: 'src/app.ts',
        backendLocalId: 'qdrant-point-789',
      })
    ).toEqual({
      value: 'src/app.ts',
      source: 'source_ref',
      status: 'degraded',
      backendLocalId: 'qdrant-point-789',
    });

    expect(
      resolveCanonicalIdentity({
        laneIdFallback: 'lane:fallback',
        backendLocalId: 'qdrant-point-000',
      })
    ).toEqual({
      value: 'lane:fallback',
      source: 'lane_id_fallback',
      status: 'degraded',
      backendLocalId: 'qdrant-point-000',
    });
  });
});
