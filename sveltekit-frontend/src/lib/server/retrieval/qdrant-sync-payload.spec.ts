import { describe, expect, it } from 'vitest';
import { buildQdrantSyncPayload } from './qdrant-sync-payload.js';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceRevision = `sha256:${'b'.repeat(64)}`;
const validPacket = {
  packetKey: 'packet:test:1',
  sourceRef: 'src/test.ts',
  featureId: 'feature:test',
  workspaceId: 'workspace:test',
  workspaceRevision,
  workspaceCacheRevision: 41,
  repositoryRevision: 'c'.repeat(40),
  sourceRevision,
  representationId: 'semantic_512',
  representationRevision: 3,
};

describe('buildQdrantSyncPayload canonical lineage contract', () => {
  it('emits manifest workspace revision separately from cache/Git provenance', () => {
    const payload = buildQdrantSyncPayload(validPacket);
    expect(payload).toMatchObject({
      packet_key: 'packet:test:1',
      source_ref: 'src/test.ts',
      workspace_revision: workspaceRevision,
      workspace_cache_revision: 41,
      repository_revision: 'c'.repeat(40),
      source_revision: sourceRevision,
      representation_id: 'semantic_512',
      representation_revision: 3,
      schema_version: 'atlas.qdrant.payload.v2',
    });
  });

  it('accepts an explicit canonicalWorkspaceRevision while preserving a legacy numeric epoch separately', () => {
    const payload = buildQdrantSyncPayload({
      ...validPacket,
      workspaceRevision: undefined,
      canonicalWorkspaceRevision: workspaceRevision,
      legacyWorkspaceRevision: 52,
      workspaceCacheRevision: undefined,
      graphRevision: 'd'.repeat(64),
    });
    expect(payload.workspace_revision).toBe(workspaceRevision);
    expect(payload.workspace_cache_revision).toBe(52);
    expect(payload.graph_revision).toBe('d'.repeat(64));
  });

  it('rejects a numeric cache epoch masquerading as canonical workspace revision', () => {
    expect(() => buildQdrantSyncPayload({
      ...validPacket,
      workspaceRevision: 41,
      workspaceCacheRevision: undefined,
    })).toThrow(/canonical workspace_revision/);
  });

  it('rejects a non-content-addressed source revision', () => {
    expect(() => buildQdrantSyncPayload({ ...validPacket, sourceRevision: 'source:rev:41' }))
      .toThrow(/canonical source_revision/);
  });

  it('rejects non-canonical representation aliases instead of relabeling them', () => {
    expect(() => buildQdrantSyncPayload({
      ...validPacket,
      sourceRepresentationId: 'embeddinggemma_768_native_v1',
      representationId: undefined,
    })).toThrow(/canonical semantic_512 representation/);
  });

  it.each([
    ['workspaceRevision', { workspaceRevision: '' }],
    ['representationRevision', { representationRevision: 0 }],
    ['sourceRevision', { sourceRevision: '' }],
  ])('fails closed when %s is missing or invalid', (_field, override) => {
    expect(() => buildQdrantSyncPayload({ ...validPacket, ...override })).toThrow(/canonical Qdrant payload/);
  });
});
