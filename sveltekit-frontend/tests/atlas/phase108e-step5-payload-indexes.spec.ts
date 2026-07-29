// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

const step5Module = await import(
  new URL('../../src/lib/server/atlas/phase108e-step5-payload-indexes.js', import.meta.url).href
);

const {
  buildIndexPlan,
  createPayloadIndex,
  assertAllowedCollection,
  TARGET_COLLECTION,
  runStep5,
} = step5Module;

function responseJson(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('phase108e step 5 payload indexes', () => {
  it('rejects legacy collection targets', () => {
    expect(() => assertAllowedCollection('codebase_chunks_768')).toThrow(
      /codebase_chunks_768_v2/
    );
  });

  it('builds a deterministic plan from observed coverage and types', () => {
    const plan = buildIndexPlan({
      collectionName: TARGET_COLLECTION,
      pointsCount: 10,
      existingSchema: { postgres_id: { data_type: 'keyword' } },
      fieldStats: {
        postgres_id: {
          nonNull: 10,
          coveragePct: 100,
          typeCounts: { string: 10 },
          distinct: 10,
          samples: [],
        },
        source_ref: {
          nonNull: 10,
          coveragePct: 100,
          typeCounts: { string: 10 },
          distinct: 10,
          samples: [],
        },
        chunk_id: {
          nonNull: 4,
          coveragePct: 40,
          typeCounts: { string: 4, null: 6 },
          distinct: 4,
          samples: [],
        },
        content_hash: {
          nonNull: 8,
          coveragePct: 80,
          typeCounts: { string: 8 },
          distinct: 8,
          samples: [],
        },
        representation_name: {
          nonNull: 10,
          coveragePct: 100,
          typeCounts: { string: 10 },
          distinct: 1,
          samples: [],
        },
        representation_id: { nonNull: 0, coveragePct: 0, typeCounts: {}, distinct: 0, samples: [] },
        embedding_model: {
          nonNull: 10,
          coveragePct: 100,
          typeCounts: { string: 10 },
          distinct: 1,
          samples: [],
        },
        model_revision: { nonNull: 0, coveragePct: 0, typeCounts: {}, distinct: 0, samples: [] },
        model_revision_state: {
          nonNull: 10,
          coveragePct: 100,
          typeCounts: { string: 10 },
          distinct: 1,
          samples: [],
        },
        projection_revision: {
          nonNull: 10,
          coveragePct: 100,
          typeCounts: { string: 10 },
          distinct: 1,
          samples: [],
        },
        corpus_revision: { nonNull: 0, coveragePct: 0, typeCounts: {}, distinct: 0, samples: [] },
        domain: { nonNull: 0, coveragePct: 0, typeCounts: {}, distinct: 0, samples: [] },
        language: { nonNull: 0, coveragePct: 0, typeCounts: {}, distinct: 0, samples: [] },
        kind: { nonNull: 0, coveragePct: 0, typeCounts: {}, distinct: 0, samples: [] },
        artifact_kind: { nonNull: 0, coveragePct: 0, typeCounts: {}, distinct: 0, samples: [] },
        semantic_tags: { nonNull: 0, coveragePct: 0, typeCounts: {}, distinct: 0, samples: [] },
        feature_ids: { nonNull: 0, coveragePct: 0, typeCounts: {}, distinct: 0, samples: [] },
        community_id: {
          nonNull: 2,
          coveragePct: 20,
          typeCounts: { integer: 2 },
          distinct: 2,
          samples: [],
        },
        page_rank_score: {
          nonNull: 2,
          coveragePct: 20,
          typeCounts: { float: 2 },
          distinct: 2,
          samples: [],
        },
        evidence_state: { nonNull: 0, coveragePct: 0, typeCounts: {}, distinct: 0, samples: [] },
        qdrant_point_id: {
          nonNull: 10,
          coveragePct: 100,
          typeCounts: { string: 10 },
          distinct: 10,
          samples: [],
        },
        indexed_at: { nonNull: 10, coveragePct: 100, typeCounts: { string: 10 }, distinct: 10, samples: [] },
      },
    });

    const byField = Object.fromEntries(plan.planned_indexes.map((item) => [item.field, item]));
    expect(byField.postgres_id.action).toBe('KEEP');
    expect(byField.source_ref.proposed_schema).toBe('keyword');
    expect(byField.chunk_id.proposed_schema).toBe('keyword');
    expect(byField.community_id.proposed_schema).toBe('integer');
    expect(byField.page_rank_score.proposed_schema).toBe('float');
    expect(plan.skipped_fields.find((item) => item.field === 'representation_id')?.action).toBe('SKIP');
    expect(plan.skipped_fields.find((item) => item.field === 'model_revision')?.action).toBe('SKIP');
  });

  it('treats a compatible existing index as idempotent success', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/collections/codebase_chunks_768_v2')) {
        return responseJson({
          result: {
            status: 'green',
            optimizer_status: 'ok',
            points_count: 1,
            payload_schema: {
              postgres_id: { data_type: 'keyword', points: 1 },
              source_ref: { data_type: 'keyword', points: 1 },
              chunk_id: { data_type: 'keyword', points: 1 },
              content_hash: { data_type: 'keyword', points: 1 },
              representation_name: { data_type: 'keyword', points: 1 },
              embedding_model: { data_type: 'keyword', points: 1 },
              model_revision_state: { data_type: 'keyword', points: 1 },
              projection_revision: { data_type: 'keyword', points: 1 },
              qdrant_point_id: { data_type: 'keyword', points: 1 },
            },
            config: { params: { vectors: { content: { size: 768, distance: 'Cosine' } } } },
          },
        });
      }
      if (String(url).endsWith('/points/scroll')) {
        return responseJson({
          result: {
            points: [
              {
                id: 'uuid-1',
                payload: { postgres_id: 'uuid-1', source_ref: 'src/a.ts', representation_name: 'semantic_768' },
              },
            ],
            next_page_offset: null,
          },
        });
      }
      if (String(url).includes('/index')) {
        return responseJson({}, { status: 409 });
      }
      throw new Error(`Unexpected request: ${String(url)} ${JSON.stringify(init)}`);
    });

    const report = await runStep5({ fetchImpl: fetchMock, dryRun: false });
    expect(report.mode).toBe('apply');
    expect(
      fetchMock.mock.calls.filter(([url, init]) => String(url).includes('/index') && init?.method === 'PUT')
    ).toHaveLength(0);
  });

  it('treats an incompatible existing index as a hard failure', async () => {
    const response = responseJson('field schema mismatch', { status: 400 });
    await expect(
      createPayloadIndex(
        async () => response,
        'http://127.0.0.1:6333',
        TARGET_COLLECTION,
        'source_ref',
        'keyword'
      )
    ).rejects.toThrow(/Failed to create payload index source_ref/);
  });

  it('does not write during dry-run', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/collections/codebase_chunks_768_v2')) {
        return responseJson({
          result: {
            status: 'green',
            optimizer_status: 'ok',
            points_count: 1,
            payload_schema: {},
            config: { params: { vectors: { content: { size: 768, distance: 'Cosine' } } } },
          },
        });
      }
      if (String(url).endsWith('/points/scroll')) {
        return responseJson({
          result: {
            points: [
              {
                id: 'uuid-1',
                payload: { postgres_id: 'uuid-1', source_ref: 'src/a.ts', representation_name: 'semantic_768' },
              },
            ],
            next_page_offset: null,
          },
        });
      }
      throw new Error(`Unexpected request: ${String(url)}`);
    });

    const report = await runStep5({ fetchImpl: fetchMock, dryRun: true });
    expect(report.mode).toBe('dry-run');
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('/index') || init?.method === 'PUT')).toBe(false);
  });
});
