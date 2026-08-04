import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QdrantPayloadEnricher } from './qdrant-payload-enricher.js';

const state = vi.hoisted(() => ({
  chunkRows: [] as any[],
  packetRows: [] as any[],
}));

const dbMock = vi.hoisted(() => ({
  select: vi.fn(() => ({
    from: vi.fn(async () => state.chunkRows),
  })),
  execute: vi.fn(async () => {
    const row = state.packetRows.shift();
    return { rows: row ? [row] : [] };
  }),
}));

const qdrantUpsert = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../db/client.js', () => ({
  db: dbMock,
}));

vi.mock('../vector/qdrant-manager.js', () => ({
  qdrant: {
    upsert: qdrantUpsert,
  },
}));

function makeChunkRows(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const sourceRef = `src/proof/file-${index}.ts`;
    return {
      id: index + 1,
      qdrant_id: `qdrant-${index}`,
      packet_key: `packet-${index}`,
      featureId: `feature-${index}`,
      source_ref: sourceRef,
      relative_path: sourceRef,
      symbol: `symbol_${index}`,
      kind: 'function',
      directory_path: 'src/proof',
      lineStart: index + 1,
      lineEnd: index + 3,
      summary: `summary ${index}`,
      contentHash: `content-hash-${index}`,
      pageRankScore: 0.5,
      metadata: {},
    };
  });
}

function makePacketRows(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const sourceRef = `src/proof/file-${index}.ts`;
    return {
      packet_key: `packet-${index}`,
      tree_node_id: `tree-${index}`,
      feature_label: `Feature ${index}`,
      sha256: `sha256-${index}`,
      workspace_revision: `1842`,
      representation_revision: 1,
      qdrant_point_id: `qdrant-${index}`,
      metadata: {
        workspace_id: 'workspace:proof',
        schema_version: 'atlas.qdrant.payload.v1',
        workspace_revision: '1842',
        source_revision: `source-revision-${index}`,
        stable_symbol_id: `stable-${index}`,
        symbol_version_id: `symbol-version-${index}`,
        representation_id: 'semantic_768',
        representation_revision: 1,
        source_ref: sourceRef,
      },
    };
  });
}

describe('QdrantPayloadEnricher', () => {
  beforeEach(() => {
    state.chunkRows = [];
    state.packetRows = [];
    dbMock.select.mockClear();
    dbMock.execute.mockClear();
    qdrantUpsert.mockClear();
  });

  it('emits canonical packet lineage for a 20-row synthetic fixture', async () => {
    state.chunkRows = makeChunkRows(20);
    state.packetRows = makePacketRows(20);

    const enricher = new QdrantPayloadEnricher();
    const result = await enricher.enrich([], false);

    expect(result.success).toBe(20);
    expect(result.failed).toBe(0);
    expect(qdrantUpsert).toHaveBeenCalledTimes(20);

    for (let index = 0; index < 20; index += 1) {
      const call = qdrantUpsert.mock.calls[index]?.[0] as {
        collection: string;
        points: Array<{ id: string | number; payload: Record<string, unknown> }>;
      };

      expect(call.collection).toBe('codebase_chunks_768');
      expect(call.points).toHaveLength(1);

      const point = call.points[0];
      const payload = point.payload;

      expect(point.id).toBe(`qdrant-${index}`);
      expect(payload.packet_key).toBe(`packet-${index}`);
      expect(payload.qdrant_point_id).toBe(`qdrant-${index}`);
      expect(payload.source_ref).toBe(`src/proof/file-${index}.ts`);
      expect(payload.workspace_id).toBe('workspace:proof');
      expect(payload.workspace_revision).toBe('1842');
      expect(payload.source_revision).toBe(`source-revision-${index}`);
      expect(payload.representation_id).toBe('semantic_768');
      expect(payload.representation_revision).toBe(1);
      expect(payload.schema_version).toBe('atlas.qdrant.payload.v1');
      expect(payload.tree_node_id).toBe(`tree-${index}`);
      expect(payload.stable_symbol_id).toBe(`stable-${index}`);
      expect(payload.symbol_version_id).toBe(`symbol-version-${index}`);
      expect(payload.feature_label).toBe(`Feature ${index}`);
    }
  });

  it('fails closed when workspace_id is missing from the lineage metadata', async () => {
    state.chunkRows = [
      {
        id: 1,
        qdrant_id: 'qdrant-missing',
        packet_key: 'packet-missing',
        featureId: 'feature-missing',
        source_ref: 'src/proof/missing.ts',
        relative_path: 'src/proof/missing.ts',
        symbol: 'missing',
        kind: 'function',
        directory_path: 'src/proof',
        lineStart: 1,
        lineEnd: 3,
        summary: 'missing workspace',
        metadata: {},
      },
    ];
    state.packetRows = [
      {
        packet_key: 'packet-missing',
        tree_node_id: 'tree-missing',
        feature_label: 'Feature missing',
        sha256: 'sha256-missing',
        workspace_revision: '1842',
        representation_revision: 1,
        qdrant_point_id: 'qdrant-missing',
        metadata: {
          schema_version: 'atlas.qdrant.payload.v1',
          source_revision: 'source-revision-missing',
          stable_symbol_id: 'stable-missing',
          symbol_version_id: 'symbol-version-missing',
          representation_id: 'semantic_768',
          representation_revision: 1,
        },
      },
    ];

    const enricher = new QdrantPayloadEnricher();
    const result = await enricher.enrich([], false);

    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(qdrantUpsert).not.toHaveBeenCalled();
  });
});
