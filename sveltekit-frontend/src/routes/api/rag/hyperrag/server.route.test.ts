// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  bifrostChat: vi.fn(),
  workspaceAuthority: vi.fn(),
  poolQuery: vi.fn(),
}));

vi.mock('$lib/server/retrieval/search-runtime.js', () => ({
  createSearchRuntime: () => ({
    search: (...args: unknown[]) => mocks.search(...args),
  }),
}));

vi.mock('$lib/server/db/client.js', () => ({
  pool: {
    query: (...args: unknown[]) => mocks.poolQuery(...args),
  },
}));

vi.mock('$lib/server/retrieval/trusted-workspace-authority-v1.js', () => ({
  resolveTrustedWorkspaceAuthorityV1: () => mocks.workspaceAuthority(),
}));

vi.mock('$lib/server/ollama.js', () => ({
  bifrostChat: (...args: unknown[]) => mocks.bifrostChat(...args),
  VLM_MODELS: { legal: 'ornith-1.5-9b' },
}));

describe('/api/rag/hyperrag', () => {
  beforeEach(() => {
    mocks.search.mockReset();
    mocks.bifrostChat.mockReset();
    mocks.workspaceAuthority.mockReset();
    mocks.poolQuery.mockReset();

    mocks.search.mockResolvedValue({
      metadata: { query: 'graph retrieval', candidatesRetrieved: 2, candidatesFused: 2, candidatesReranked: 1, durationMs: 17, stages: { retrieve: 4, fuse: 3, hydrate: 5, rerank: 5 } },
      provenance: {
        retrievalSources: ['postgres_trigram', 'qdrant', 'ast_tree'],
        fusionMethod: 'rrf',
        rerankModel: 'mixedbread-ai/mxbai-rerank-base-v2',
        rerankerUsed: true,
        promotionAttempted: true,
      },
      packets: [
        {
          packet_key: 'packet-1',
          source_ref: 'src/lib/example.ts',
          summary: 'packet summary one',
          content: 'packet content one',
          retrieval_score: 0.91,
          blended_score: 0.94,
          cross_encoder_score: 0.95,
          rank_after: 1,
          semantic_title: 'Packet One',
          domain: 'codebase',
          page_rank_score: 0.12,
          som_cluster: 8,
          lexical: { score: 0.7 },
        },
      ],
    });

    mocks.bifrostChat.mockResolvedValue('Synthesized summary');
  });

  it('returns a canonical compatibility packet for authenticated users', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/rag/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'graph retrieval', limit: 5 }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.packet.query).toBe('graph retrieval');
    expect(body.packet.results).toHaveLength(1);
    expect(body.packet.results[0].id).toBe('packet-1');
    expect(body.packet.results[0].summary).toBe('packet summary one');
    expect(body.packet.turbovecPrefilter).toBe(false);
    expect(body.packet.turbovecCandidates).toEqual(['packet-1']);
    expect(body.bitfrostSummary).toBe('Synthesized summary');
    expect(mocks.search).toHaveBeenCalledTimes(1);
  });

  it('rejects unauthenticated requests', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/rag/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'graph retrieval' }),
    });

    const result = await POST({ request, url: new URL(request.url), locals: {} } as any).catch((err) => err);
    expect(result.status ?? result?.statusCode).toBe(401);
  });

  it('resolves PG18 actor grant + BitFrost procedural descriptor when workspaceId is provided', async () => {
    const workspaceId = '625743d2-092b-4fa8-abe0-9dc094920c80';
    const workspaceRevision = 'sha256:09e1d40886a982f66a17ec1e068774559d12f012dde412228d909dca49247590';
    mocks.workspaceAuthority.mockResolvedValue({
      status: 'TRUSTED',
      workspaceRevision,
      source: 'admitted',
      reason: 'CURRENT_WORKSPACE_ADMITTED',
    });
    mocks.poolQuery.mockResolvedValue({
      rows: [
        {
          actor_id: 'u1',
          actor_type: 'USER',
          tenant_id: null,
          workspace_id: workspaceId,
          workspace_revision: workspaceRevision,
          repository_id: 'repo-deeds',
          permitted_source_refs: ['src/lib/example.ts'],
          grant_revision: 'grant-rev-1',
          status: 'GRANTED',
          issued_at: '2026-11-01T00:00:00.000Z',
          expires_at: null,
          revoked_at: null,
        },
      ],
    });

    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/rag/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'graph retrieval',
        limit: 5,
        workspaceId,
        bitfrost: {
          modelName: 'gemma4-legal-iq4xs-direct.gguf',
          artifactChecksum: 'sha256:abc123',
          representationRevision: 'semantic_768',
          slotIndex: 0,
        },
      }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.canonicalAuthority).toBe(false);
    expect(body.writesPerformed).toBe(false);
    expect(body.actorGrantAuthorityRef).toMatch(/^postgresql:atlas_actor_workspace_source_grants_v1:[a-f0-9]{64}$/);
    expect(body.bitfrostDescriptor).toEqual({
      schema: 'atlas.bitfrost-procedural-descriptor.v1',
      proceduralKey: 'bitfrost:procedural:gemma4-legal-iq4xs-direct.gguf:sha256:abc123:semantic_768:slot_0',
      modelName: 'gemma4-legal-iq4xs-direct.gguf',
      artifactChecksum: 'sha256:abc123',
      representationRevision: 'semantic_768',
      kvCachePersisted: false,
      hiddenThoughtsPersisted: false,
      rawTensorPersisted: false,
    });
    expect(mocks.search).toHaveBeenCalledTimes(1);
    const [searchQuery, searchExecCtx] = mocks.search.mock.calls[0];
    expect(searchQuery.workspaceRevision).toBe(workspaceRevision);
    expect(searchExecCtx.requireActorGrant).toBe(true);
    expect(searchExecCtx.actorGrant.status).toBe('AUTHORIZED');
    expect(searchExecCtx.actorGrant.allowedSourceRefs).toEqual(['src/lib/example.ts']);
  });

  it('fails closed with 403 when requireActorGrant or workspaceId has no matching PG18 grant', async () => {
    const workspaceId = '625743d2-092b-4fa8-abe0-9dc094920c80';
    mocks.workspaceAuthority.mockResolvedValue({
      status: 'TRUSTED',
      workspaceRevision: 'sha256:09e1d40886a982f66a17ec1e068774559d12f012dde412228d909dca49247590',
      source: 'admitted',
      reason: 'CURRENT_WORKSPACE_ADMITTED',
    });
    mocks.poolQuery.mockResolvedValue({ rows: [] });

    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/rag/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'graph retrieval', workspaceId }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('WORKSPACE_GRANT_NOT_FOUND_FOR_REVISION');
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it('fails closed with 403 when trusted workspace authority is unavailable', async () => {
    const workspaceId = '625743d2-092b-4fa8-abe0-9dc094920c80';
    mocks.workspaceAuthority.mockResolvedValue({
      status: 'UNAVAILABLE',
      workspaceRevision: null,
      reason: 'EXECUTION_AUTHORITY_UNAVAILABLE',
    });

    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/rag/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'graph retrieval', workspaceId }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE');
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
