import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { QdrantPayloadEnricher } from './qdrant-payload-enricher.js';

const state = vi.hoisted(() => ({
  chunkRows: [] as any[],
  packetRows: [] as any[],
  payloads: new Map<string | number, Record<string, unknown>>(),
}));

const dbMock = vi.hoisted(() => ({
  select: vi.fn(() => ({
    from: vi.fn(async () => state.chunkRows),
  })),
  execute: vi.fn(async () => {
    const row = state.packetRows.shift();
    return { rows: Array.isArray(row) ? row : row ? [row] : [] };
  }),
}));

const qdrantUpsert = vi.hoisted(() => vi.fn(async () => undefined));
const qdrantSetPayload = vi.hoisted(() => vi.fn(async (_collection: string, request: { points: Array<string | number>; payload: Record<string, unknown> }) => {
  state.payloads.set(request.points[0], request.payload);
}));
const qdrantRetrieve = vi.hoisted(() => vi.fn(async (_collection: string, request: { ids: Array<string | number> }) => {
  const id = request.ids[0];
  return [{ id, vector: { content: [0.25, 0.75] }, payload: state.payloads.get(id) ?? {} }];
}));

vi.mock('../db/client.js', () => ({
  db: dbMock,
}));

vi.mock('../vector/qdrant-manager.js', () => ({
  qdrant: {
    upsert: qdrantUpsert,
    client: { setPayload: qdrantSetPayload, retrieve: qdrantRetrieve },
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
      feature_id: `feature-${index}`,
      tree_node_id: `tree-${index}`,
      feature_label: `Feature ${index}`,
      function_symbol: `symbol_${index}`,
      byte_start: index * 10,
      byte_end: index * 10 + 20,
      sha256: `sha256-${index}`,
      workspace_revision: `1842`,
      workspace_revision_key: `sha256:${'a'.repeat(64)}`,
      source_revision: `sha256:${'b'.repeat(64)}`,
      representation_revision: 1,
      qdrant_point_id: `qdrant-${index}`,
      metadata: {
        workspace_id: 'workspace:proof',
        schema_version: 'atlas.qdrant.payload.v1',
        workspace_revision: '1842',
        source_revision: `stale-metadata-revision-${index}`,
        taxonomy_revision: `sha256:${'c'.repeat(64)}`,
        parser_language: 'typescript',
        language_resolver_revision: 'atlas.8095-language-resolver.v1',
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
    state.payloads.clear();
    dbMock.select.mockClear();
    dbMock.execute.mockClear();
    qdrantUpsert.mockClear();
    qdrantSetPayload.mockClear();
    qdrantRetrieve.mockClear();
  });

  it('emits canonical packet lineage for a 20-row synthetic fixture', async () => {
    state.chunkRows = makeChunkRows(20);
    state.packetRows = makePacketRows(20);

    const enricher = new QdrantPayloadEnricher();
    const result = await enricher.enrich([], false);

    expect(result.success).toBe(20);
    expect(result.failed).toBe(0);
    expect(qdrantUpsert).not.toHaveBeenCalled();
    expect(qdrantSetPayload).toHaveBeenCalledTimes(20);
    const firstQuery = (dbMock.execute.mock.calls as unknown as [Parameters<PgDialect['sqlToQuery']>[0]][])[0][0];
    const compiled = new PgDialect().sqlToQuery(firstQuery);
    expect(compiled.sql).toContain('FROM atlas_packet_chunk_lineage l');
    expect(compiled.sql).toContain("l.revision_status = 'PROVEN'");
    expect(compiled.sql).toContain('c.workspace_revision = p.workspace_revision_key');
    expect(compiled.sql).toContain('FROM atlas_workspace_source_bindings b');
    expect(compiled.params).toEqual([1, 'src/proof/file-0.ts']);

    for (let index = 0; index < 20; index += 1) {
      const call = qdrantSetPayload.mock.calls[index] as unknown as [string, { points: Array<string | number>; payload: Record<string, unknown>; wait: boolean }];
      expect(call[0]).toBe('codebase_chunks_768');
      expect(call[1].points).toEqual([`qdrant-${index}`]);
      expect(call[1].wait).toBe(true);
      const payload = call[1].payload;
      expect(payload.packet_key).toBe(`packet-${index}`);
      expect(payload.qdrant_point_id).toBe(`qdrant-${index}`);
      expect(payload.source_ref).toBe(`src/proof/file-${index}.ts`);
      expect(payload.workspace_id).toBe('workspace:proof');
      expect(payload.workspace_revision).toBe(`sha256:${'a'.repeat(64)}`);
      expect(payload.source_revision).toBe(`sha256:${'b'.repeat(64)}`);
      expect(payload.representation_id).toBe('semantic_768');
      expect(payload.representation_revision).toBe(1);
      expect(payload.schema_version).toBe('atlas.qdrant.payload.v1');
      expect(payload.tree_node_id).toBe(`tree-${index}`);
      expect(payload.stable_symbol_id).toBe(`stable-${index}`);
      expect(payload.symbol_version_id).toBe(`symbol-version-${index}`);
      expect(payload.feature_label).toBe(`Feature ${index}`);
      expect(payload.taxonomy_revision).toBe(`sha256:${'c'.repeat(64)}`);
      expect(payload.parser_language).toBe('typescript');
      expect(payload.language_resolver_revision).toBe('atlas.8095-language-resolver.v1');
      expect(payload.start_byte).toBe(index * 10);
      expect(payload.end_byte).toBe(index * 10 + 20);
      expect(payload.symbol).toBe(`symbol_${index}`);
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
        feature_id: 'feature-missing',
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
    expect(qdrantSetPayload).not.toHaveBeenCalled();
  });

  it('refuses ambiguous or mismatched packet bindings instead of selecting by source path', async () => {
    state.chunkRows = makeChunkRows(1);
    const packet = makePacketRows(1)[0];
    state.packetRows = [[packet, { ...packet, packet_key: 'other-packet' }]];

    const enricher = new QdrantPayloadEnricher();
    expect(await enricher.enrich([], false)).toMatchObject({ success: 0, failed: 1 });
    expect(qdrantUpsert).not.toHaveBeenCalled();
    expect(qdrantSetPayload).not.toHaveBeenCalled();

    state.packetRows = [{ ...packet, packet_key: 'other-packet' }];
    expect(await enricher.enrich([], false)).toMatchObject({ success: 0, failed: 1 });
    expect(qdrantUpsert).not.toHaveBeenCalled();
    expect(qdrantSetPayload).not.toHaveBeenCalled();

    state.packetRows = [{ ...packet, feature_id: 'other-feature' }];
    expect(await enricher.enrich([], false)).toMatchObject({ success: 0, failed: 1 });
    expect(qdrantUpsert).not.toHaveBeenCalled();
    expect(qdrantSetPayload).not.toHaveBeenCalled();
  });

  it('refuses a chunk without a qualified packet binding', async () => {
    state.chunkRows = makeChunkRows(1);
    expect(await new QdrantPayloadEnricher().enrich([], false)).toMatchObject({ success: 0, failed: 1 });
    expect(qdrantUpsert).not.toHaveBeenCalled();
    expect(qdrantSetPayload).not.toHaveBeenCalled();
  });

  it('refuses packet bindings missing canonical feature or revision metadata', async () => {
    state.chunkRows = makeChunkRows(1);
    const packet = makePacketRows(1)[0];
    state.packetRows = [{ ...packet, feature_label: null }];
    expect(await new QdrantPayloadEnricher().enrich([], false)).toMatchObject({ success: 0, failed: 1 });
    expect(qdrantSetPayload).not.toHaveBeenCalled();

    state.packetRows = [{ ...packet, source_revision: null }];
    expect(await new QdrantPayloadEnricher().enrich([], false)).toMatchObject({ success: 0, failed: 1 });
    expect(qdrantSetPayload).not.toHaveBeenCalled();
  });

  it('refuses a missing Qdrant point ID instead of substituting the PostgreSQL row ID', async () => {
    state.chunkRows = [{ ...makeChunkRows(1)[0], qdrant_id: null }];
    state.packetRows = makePacketRows(1);
    expect(await new QdrantPayloadEnricher().enrich([], false)).toMatchObject({ success: 0, failed: 1 });
    expect(dbMock.execute).not.toHaveBeenCalled();
    expect(qdrantUpsert).not.toHaveBeenCalled();
    expect(qdrantSetPayload).not.toHaveBeenCalled();
  });
});
