import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveProjection, resolveProjectionsBatch } from './projection-registry-v1.js';

describe('ProjectionRegistryV1', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves a live, identity-consistent point into a ProjectionRefV1', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: [
          {
            id: '0417b9e4-621b-45d5-b623-f814513440ad',
            payload: {
              postgres_id: '0417b9e4-621b-45d5-b623-f814513440ad',
              projection_revision: 'v2_uuid_clean',
              model_revision: null,
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await resolveProjection({
      canonicalPacketIdentity: '0417b9e4-621b-45d5-b623-f814513440ad',
      representationIdentity: 'semantic_768',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ref).toEqual({
        executor: 'qdrant',
        collection: 'codebase_chunks_768_v2',
        vectorName: 'content',
        physicalPointId: '0417b9e4-621b-45d5-b623-f814513440ad',
        projectionRevision: 'v2_uuid_clean',
        modelRevision: null,
        inputPolicyRevision: null,
      });
    }
  });

  it('fails closed with PROJECTION_NOT_FOUND when no point exists at the expected coordinate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: [] }) }));

    const result = await resolveProjection({
      canonicalPacketIdentity: 'aaaaaaaa-0000-0000-0000-000000000000',
      representationIdentity: 'semantic_768',
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.failure.reason).toBe('PROJECTION_NOT_FOUND');
  });

  it('fails closed with CANONICAL_IDENTITY_MISMATCH rather than resolving a wrong-object projection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: [{ id: 'aaaaaaaa-0000-0000-0000-000000000000', payload: { postgres_id: 'different-id' } }],
      }),
    }));

    const result = await resolveProjection({
      canonicalPacketIdentity: 'aaaaaaaa-0000-0000-0000-000000000000',
      representationIdentity: 'semantic_768',
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.failure.reason).toBe('CANONICAL_IDENTITY_MISMATCH');
  });

  it('fails closed with UNSUPPORTED_REPRESENTATION for any representation other than semantic_768, without calling Qdrant', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const results = await resolveProjectionsBatch([
      { canonicalPacketIdentity: 'x', representationIdentity: 'not_semantic_768' as any },
    ]);

    expect(results[0].ok).toBe(false);
    if (results[0].ok === false) expect(results[0].failure.reason).toBe('UNSUPPORTED_REPRESENTATION');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
