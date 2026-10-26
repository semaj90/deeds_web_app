import { describe, expect, it } from 'vitest';
import { buildQdrantSyncPayload } from './qdrant-sync-payload.js';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceRevision = `sha256:${'b'.repeat(64)}`;
const validPacket = {
  canonicalId: 'chunk:canonical:test:1',
  packetKey: 'packet:test:1',
  sourceRef: 'src/test.ts',
  featureId: 'feature:test',
  workspaceId: 'workspace:test',
  workspaceRevision,
  workspaceCacheRevision: 41,
  repositoryRevision: 'c'.repeat(40),
  sourceRevision,
  representationId: 'semantic_768',
  representationRevision: 3,
};

describe('buildQdrantSyncPayload canonical lineage contract', () => {
  it('emits manifest workspace revision separately from cache/Git provenance', () => {
    const payload = buildQdrantSyncPayload(validPacket);
    expect(payload).toMatchObject({
      canonical_id: 'chunk:canonical:test:1',
      packet_key: 'packet:test:1',
      source_ref: 'src/test.ts',
      file_path: 'src/test.ts',
      workspace_revision: workspaceRevision,
      workspace_cache_revision: 41,
      repository_revision: 'c'.repeat(40),
      source_revision: sourceRevision,
      representation_id: 'semantic_768',
      representation_revision: 3,
      schema_version: 'atlas.qdrant.payload.v2',
    });
  });

  it('rejects a payload without an exact canonical identity', () => {
    expect(() => buildQdrantSyncPayload({ ...validPacket, canonicalId: undefined }))
      .toThrow(/Missing canonical_id/);
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

  it('uses workspace revision keys and preserves feature, parser, taxonomy, and source-span lineage', () => {
    const taxonomyRevision = `sha256:${'d'.repeat(64)}`;
    const payload = buildQdrantSyncPayload({
      ...validPacket,
      workspaceRevision: 41,
      workspaceRevisionKey: workspaceRevision,
      featureLabel: 'Retrieval Ranking',
      byteStart: 12,
      byteEnd: 64,
      functionSymbol: 'rankCandidates',
      metadata: {
        taxonomy_revision: taxonomyRevision,
        parser_language: 'typescript',
        language_resolver_revision: 'atlas.8095-language-resolver.v1',
      },
    });
    expect(payload).toMatchObject({
      workspace_revision: workspaceRevision,
      feature_label: 'Retrieval Ranking',
      taxonomy_revision: taxonomyRevision,
      parser_language: 'typescript',
      language_resolver_revision: 'atlas.8095-language-resolver.v1',
      start_byte: 12,
      end_byte: 64,
      symbol: 'rankCandidates',
    });
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
    })).toThrow(/canonical semantic_768 representation/);
  });

  it.each([
    ['workspaceRevision', { workspaceRevision: '' }],
    ['representationRevision', { representationRevision: 0 }],
    ['sourceRevision', { sourceRevision: '' }],
  ])('fails closed when %s is missing or invalid', (_field, override) => {
    expect(() => buildQdrantSyncPayload({ ...validPacket, ...override })).toThrow(/canonical Qdrant payload/);
  });
});
