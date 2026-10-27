import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QdrantPayloadEnricher } from './qdrant-payload-enricher.js';

const state = vi.hoisted(() => ({
  chunks: [0, 1].map((index) => ({
    id: index + 1, qdrant_id: `point-${index}`, packet_key: `packet-${index}`,
    featureId: `feature-${index}`, source_ref: `src/file-${index}.ts`, metadata: {},
  })),
  packets: [0, 1].map((index) => ({
    packet_key: `packet-${index}`, feature_id: `feature-${index}`, feature_label: `Feature ${index}`,
    source_ref: `src/file-${index}.ts`, source_revision: `sha256:${'b'.repeat(64)}`,
    workspace_revision_key: `sha256:${'a'.repeat(64)}`, representation_revision: 1,
    byte_start: 0, byte_end: 10, qdrant_point_id: `point-${index}`,
    metadata: {
      workspace_id: 'fixture:workspace', taxonomy_revision: `sha256:${'c'.repeat(64)}`,
      parser_language: 'typescript', language_resolver_revision: 'fixture-resolver-v1',
      representation_id: 'semantic_768',
    },
  })),
  payloads: new Map<string | number, Record<string, unknown>>(),
  setPayload: vi.fn(async (_collection: string, _request: { points: Array<string | number>; payload: Record<string, unknown> }) => undefined),
  retrieve: vi.fn(async (_collection: string, request: { ids: Array<string | number> }) => [{
    id: request.ids[0], vector: { content: [0.25, 0.75] }, payload: state.payloads.get(request.ids[0]) ?? {},
  }]),
  upsert: vi.fn(async () => undefined),
}));

vi.mock('../db/client.js', () => ({
  db: {
    select: () => ({ from: async () => state.chunks }),
    execute: async () => ({ rows: [state.packets.shift()] }),
  },
}));
vi.mock('../vector/qdrant-manager.js', () => ({
  qdrant: { client: { setPayload: state.setPayload, retrieve: state.retrieve }, upsert: state.upsert },
}));

describe('Qdrant payload update accounting', () => {
  beforeEach(() => {
    state.chunks = [0, 1].map((index) => ({ id: index + 1, qdrant_id: `point-${index}`, packet_key: `packet-${index}`,
      featureId: `feature-${index}`, source_ref: `src/file-${index}.ts`, metadata: {} }));
    state.packets = [0, 1].map((index) => ({
      packet_key: `packet-${index}`, feature_id: `feature-${index}`, feature_label: `Feature ${index}`,
      source_ref: `src/file-${index}.ts`, source_revision: `sha256:${'b'.repeat(64)}`,
      workspace_revision_key: `sha256:${'a'.repeat(64)}`, representation_revision: 1,
      byte_start: 0, byte_end: 10, qdrant_point_id: `point-${index}`,
      metadata: {
        workspace_id: 'fixture:workspace', taxonomy_revision: `sha256:${'c'.repeat(64)}`,
        parser_language: 'typescript', language_resolver_revision: 'fixture-resolver-v1',
        representation_id: 'semantic_768',
      },
    }));
    state.payloads.clear();
    state.upsert.mockClear();
    state.retrieve.mockClear();
    state.setPayload.mockReset();
    state.setPayload.mockImplementation(async (_collection, request) => { state.payloads.set(request.points[0], request.payload); });
  });

  it('reports acknowledged and failed updates independently', async () => {
    state.setPayload.mockImplementationOnce(async (_collection, request) => { state.payloads.set(request.points[0], request.payload); })
      .mockRejectedValueOnce(new Error('fixture update failure'));
    const result = await new QdrantPayloadEnricher().enrich([], false);
    expect(result).toMatchObject({ success: 1, failed: 1 });
    expect(state.setPayload).toHaveBeenCalledTimes(2);
    expect(state.upsert).not.toHaveBeenCalled();
  });

  it('refuses a missing point before any payload update', async () => {
    state.chunks = state.chunks.slice(0, 1);
    state.retrieve.mockResolvedValueOnce([]);
    expect(await new QdrantPayloadEnricher().enrich([], false)).toMatchObject({ success: 0, failed: 1 });
    expect(state.setPayload).not.toHaveBeenCalled();
  });

  it('reports a post-update vector change as a readback failure', async () => {
    state.chunks = state.chunks.slice(0, 1);
    state.retrieve.mockImplementationOnce(async (_collection, request) => [{ id: request.ids[0], vector: { content: [1] }, payload: {} }])
      .mockImplementationOnce(async (_collection, request) => [{ id: request.ids[0], vector: { content: [2] }, payload: state.payloads.get(request.ids[0]) ?? {} }]);
    expect(await new QdrantPayloadEnricher().enrich([], false)).toMatchObject({ success: 0, failed: 1 });
    expect(state.setPayload).toHaveBeenCalledTimes(1);
  });

  it('reports mismatched payload readback as a failure', async () => {
    state.chunks = state.chunks.slice(0, 1);
    state.retrieve.mockImplementationOnce(async (_collection, request) => [{ id: request.ids[0], vector: { content: [1] }, payload: {} }])
      .mockImplementationOnce(async (_collection, request) => [{ id: request.ids[0], vector: { content: [1] }, payload: {} }]);
    expect(await new QdrantPayloadEnricher().enrich([], false)).toMatchObject({ success: 0, failed: 1 });
    expect(state.setPayload).toHaveBeenCalledTimes(1);
  });
});
