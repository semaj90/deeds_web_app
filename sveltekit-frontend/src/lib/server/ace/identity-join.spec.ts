import { describe, expect, it } from 'vitest';

import {
  buildSourceRefCandidates,
  extractWorkspaceRevisionFromMetadata as extractIndexedWorkspaceRevision,
} from './indexed-source-packet.js';
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
        packet_key: 'packet-1',
        source_ref: 'src/app.ts',
        content_hash: 'hash-1',
        tree_node_id: 'tree-1',
        feature_id: 'feat-1',
        feature_label: 'feature label',
        workspaceRevision: 'rev-1',
      })
    ).toEqual({
      packetKey: 'packet-1',
      sourceRef: 'src/app.ts',
      contentHash: 'hash-1',
      treeNodeId: 'tree-1',
      featureId: 'feat-1',
      featureLabel: 'feature label',
      workspaceRevision: 'rev-1',
    });
  });
});
