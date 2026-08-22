import { describe, expect, it } from 'vitest';
import { buildQdrantSyncPayload } from './qdrant-sync-payload.js';

const validPacket = {
  packetKey: 'packet:test:1',
  sourceRef: 'src/test.ts',
  featureId: 'feature:test',
  workspaceId: 'workspace:test',
  workspaceRevision: 41,
  sourceRevision: 'source:rev:41',
  representationId: 'semantic_768',
  representationRevision: 3,
};

describe('buildQdrantSyncPayload EMB3A lineage contract', () => {
  it('preserves the historical integer workspace revision as a cache epoch', () => {
    const payload = buildQdrantSyncPayload(validPacket);
    expect(payload).toMatchObject({
      packet_key: 'packet:test:1',
      source_ref: 'src/test.ts',
      workspace_revision: 41,
      workspace_cache_revision: 41,
      workspace_revision_kind: 'CACHE_EPOCH_INT',
      source_revision: 'source:rev:41',
      representation_id: 'semantic_768',
      representation_revision: 3,
    });
    expect(payload.repository_revision).toBeUndefined();
  });

  it('projects Git repository revision separately when supplied by an authority owner', () => {
    const repositoryRevision = 'a'.repeat(40);
    const payload = buildQdrantSyncPayload({ ...validPacket, repositoryRevision });
    expect(payload).toMatchObject({
      workspace_revision: 41,
      workspace_cache_revision: 41,
      repository_revision: repositoryRevision,
      repository_revision_kind: 'GIT_COMMIT_SHA',
    });
  });

  it('rejects malformed repository revision instead of relabeling cache epochs as Git lineage', () => {
    expect(() => buildQdrantSyncPayload({
      ...validPacket,
      repositoryRevision: '41',
    })).toThrow(/expected Git commit SHA/);
  });

  it('maps the existing atlas_packets representation aliases without inventing code-world lineage', () => {
    const payload = buildQdrantSyncPayload({
      packetKey: 'packet:db-shaped',
      sourceRef: 'src/db-shaped.ts',
      featureId: 'feature:db-shaped',
      workspaceId: 'workspace:test',
      workspaceRevision: 41,
      sourceRevision: 'source:rev:41',
      sourceRepresentationId: 'semantic_768',
      representationRevision: 3,
      graphRevision: 'graph:41',
    });
    expect(payload).toMatchObject({
      representation_id: 'semantic_768',
      graph_revision: 'graph:41',
    });
    expect(payload.repository_revision).toBeUndefined();
  });

  it('rejects non-canonical representation aliases instead of relabeling them', () => {
    expect(() => buildQdrantSyncPayload({
      ...validPacket,
      sourceRepresentationId: 'embeddinggemma_768_native_v1',
      representationId: undefined,
    })).toThrow(/canonical semantic_768 representation/);
  });

  it.each([
    ['workspaceRevision', { workspaceRevision: 0 }],
    ['representationRevision', { representationRevision: 0 }],
    ['sourceRevision', { sourceRevision: '' }],
  ])('fails closed when %s is missing or invalid', (_field, override) => {
    expect(() => buildQdrantSyncPayload({ ...validPacket, ...override })).toThrow(/canonical Qdrant payload/);
  });
});
