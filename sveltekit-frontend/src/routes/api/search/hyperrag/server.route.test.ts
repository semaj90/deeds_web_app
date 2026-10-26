// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  bifrostChat: vi.fn(),
  runtimeConfigs: [] as Array<Record<string, unknown>>,
  oakEnrichment: vi.fn(),
  ontologyResolution: vi.fn(),
  workspaceAuthority: vi.fn(),
  env: {
    ATLAS_FUNCTION_REGISTRY_RETRIEVAL_ENABLED: false,
    ATLAS_FUNCTION_REGISTRY_REPO_ROOT: undefined as string | undefined,
  },
}));

vi.mock('$lib/server/retrieval/search-runtime.js', () => ({
  createSearchRuntime: (config: Record<string, unknown>) => {
    mocks.runtimeConfigs.push(config);
    return { search: (...args: unknown[]) => mocks.search(...args) };
  },
}));

vi.mock('$lib/server/env.server.js', () => ({ ENV: mocks.env }));
vi.mock('$lib/server/retrieval/trusted-workspace-authority-v1.js', () => ({
  resolveTrustedWorkspaceAuthorityV1: () => mocks.workspaceAuthority(),
}));

vi.mock('$lib/server/db/client.js', () => ({ pool: { connect: vi.fn() } }));
vi.mock('@deeds/parent-atlas', () => ({ createFeatureIntelligenceRepository: vi.fn() }));
vi.mock('$lib/server/atlas/agentic/oak-query-enrichment-v1.js', () => ({
  enrichQueryClassificationWithOakV1: (classification: { requestId: string }) => mocks.oakEnrichment(classification),
}));
vi.mock('$lib/server/atlas/ontology-resolution-boundary-postgres.js', () => ({
  resolveOntologyLabelV1: (request: { label: string }) => mocks.ontologyResolution(request),
}));

vi.mock('$lib/server/ollama.js', () => ({
  bifrostChat: (...args: unknown[]) => mocks.bifrostChat(...args),
  VLM_MODELS: { legal: 'ornith-1.5-9b' },
}));

// The repository-root Vitest runner does not install SvelteKit's `$lib`
// alias. Bridge this route import to the real classifier for the test.
vi.mock('$lib/server/atlas/agentic-file-compiler/query-classifier.js', async () =>
  import('../../../../lib/server/atlas/agentic-file-compiler/query-classifier.js'));
vi.mock('$lib/server/atlas/agentic-file-compiler/retrieval-plan.js', async () =>
  import('../../../../lib/server/atlas/agentic-file-compiler/retrieval-plan.js'));

describe('/api/search/hyperrag', () => {
  const baseResult = {
    metadata: { query: 'graph retrieval', candidatesRetrieved: 2, candidatesFused: 2, candidatesReranked: 2, durationMs: 12, stages: { retrieve: 1, fuse: 1, hydrate: 1, rerank: 1 } },
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
  };

  beforeEach(() => {
    mocks.search.mockReset();
    mocks.bifrostChat.mockReset();
    mocks.oakEnrichment.mockReset();
    mocks.ontologyResolution.mockReset();
    mocks.workspaceAuthority.mockReset();
    mocks.workspaceAuthority.mockResolvedValue({
      status: 'UNAVAILABLE',
      workspaceRevision: null,
      reason: 'NO_OPERATOR_PIN',
      resolverRevision: 'atlas.trusted-workspace-resolver.v1',
    });
    mocks.runtimeConfigs.length = 0;
    mocks.env.ATLAS_FUNCTION_REGISTRY_RETRIEVAL_ENABLED = false;
    mocks.env.ATLAS_FUNCTION_REGISTRY_REPO_ROOT = undefined;

    mocks.search.mockResolvedValue(baseResult);
    mocks.oakEnrichment.mockImplementation(async (classification: { requestId: string }) => ({
      requestId: classification.requestId,
      evidence: [],
    }));
    mocks.ontologyResolution.mockImplementation(async (request: { label: string }) => ({
      schemaVersion: 'atlas.ontology-resolution-result.v1',
      label: request.label,
      resolutionState: 'UNRESOLVED',
      conceptId: null,
      candidateConceptIds: [],
      matchMethod: 'none',
      ontologyRevision: 'atlas-domain-ontology:v1:test',
    }));
    mocks.bifrostChat.mockResolvedValue('Synthesized summary');
  });

  it('rejects unauthenticated requests', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/search/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'graph retrieval' }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: {} } as any);
    expect(response.status).toBe(401);
  });

  it('rejects empty and oversized queries', async () => {
    const { POST } = await import('./+server.js');

    const emptyRequest = new Request('http://localhost/api/search/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '   ' }),
    });
    const emptyResponse = await POST({ request: emptyRequest, url: new URL(emptyRequest.url), locals: { user: { id: 'u1' } } } as any);
    expect(emptyResponse.status).toBe(400);

    const oversizedRequest = new Request('http://localhost/api/search/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'x'.repeat(1025) }),
    });
    const oversizedResponse = await POST({ request: oversizedRequest, url: new URL(oversizedRequest.url), locals: { user: { id: 'u1' } } } as any);
    expect(oversizedResponse.status).toBe(400);
  });

  it('returns the canonical hyperrag shape for valid requests', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/search/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'graph retrieval', synthesize: false }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(200);
    expect(mocks.runtimeConfigs.at(-1)).toEqual(expect.objectContaining({ readOnly: true }));

    const body = await response.json();
    expect(body.query).toBe('graph retrieval');
    expect(body.classification).toEqual(expect.objectContaining({
      schema: 'atlas.query-classification.v1',
      operation: 'INSPECT',
      producerRevision: 'hyperrag-front-door-v1',
    }));
    expect(body.retrievalPlan).toBeNull();
    expect(Array.isArray(body.variants)).toBe(true);
    expect(Array.isArray(body.hits)).toBe(true);
    expect(Array.isArray(body.graphPaths)).toBe(true);
    expect(body.hits[0].reasons).toEqual(expect.arrayContaining(['retrieval:canonical', 'domain:codebase']));
    expect(body.hits[0].signals).toEqual(
      expect.objectContaining({
        graphAuthority: 0.12,
        clusterMatch: 8,
        pagerank: 0.12,
        topoClass: 'codebase',
        lexicalBoost: 0.7,
      })
    );
    expect(body.provenance).toEqual(expect.objectContaining({ pgvector: false, qdrant: true, neo4j: false, redis: false, turbovec: false, ace: false }));
    expect(body.synthesis).toBeNull();
    expect(mocks.bifrostChat).not.toHaveBeenCalled();
  });

  it('ignores caller-supplied workspace revisions and abstains from graph expansion', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/search/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-request-id': 'req-plan-1' },
      body: JSON.stringify({
        query: 'Find SvelteKit 2 route functions that use Drizzle ORM',
        workspaceId: 'forged-workspace',
        workspaceRevision: 'sha256:workspace-1',
        sourceRevision: 'sha256:source-1',
        representationId: 'semantic_768',
        representationRevision: 3,
        topK: 7,
        useGraph: true,
      }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.retrievalPlan).toBeNull();
    // No operator pin in the test environment: the resolver fails closed, and the forged request workspace is ignored.
    expect(body.workspaceAuthority).toEqual({
      status: 'UNAVAILABLE',
      workspaceRevision: null,
      reason: 'NO_OPERATOR_PIN',
      resolverRevision: 'atlas.trusted-workspace-resolver.v1',
      callerSuppliedWorkspaceContextIgnored: true,
    });
    expect(body.hypergraph.reason).toBe('TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE');
    expect(body.graphExpansionStatus).toBe('BLOCKED_TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE');
    expect(body.graphPaths).toEqual([]);
    expect(mocks.ontologyResolution.mock.calls.map(([request]) => request.label)).toEqual(['Drizzle ORM', 'SvelteKit']);
    expect(mocks.search.mock.calls[0]?.[0].lexicalExpansion).not.toContain('Drizzle ORM');
    expect(mocks.search.mock.calls[0]?.[0].lexicalExpansion).not.toContain('SvelteKit');
    expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Find SvelteKit 2 route functions that use Drizzle ORM',
      topK: 7,
      lexicalExpansion: expect.arrayContaining(['drizzle-orm', '@sveltejs/kit']),
    }));
    expect(mocks.oakEnrichment).toHaveBeenCalledWith(expect.objectContaining({
      packageCandidates: expect.arrayContaining(['drizzle-orm', '@sveltejs/kit']),
    }));
    expect(mocks.search.mock.calls[0]?.[0]).not.toHaveProperty('workspaceId');
    expect(mocks.search.mock.calls[0]?.[0]).not.toHaveProperty('workspaceRevision');
    expect(mocks.search.mock.calls[0]?.[0]).not.toHaveProperty('sourceRevision');
    expect(mocks.search.mock.calls[0]?.[0]).not.toHaveProperty('representationId');
    expect(mocks.search.mock.calls[0]?.[0]).not.toHaveProperty('representationRevision');
  });

  it('passes only the server-resolved revision to SearchRuntime for requested graph expansion', async () => {
    const trustedRevision = `sha256:${'a'.repeat(64)}`;
    mocks.workspaceAuthority.mockResolvedValue({
      status: 'TRUSTED',
      workspaceRevision: trustedRevision,
      source: 'OPERATOR_PIN',
      receiptCrossCheck: 'MATCHES_ADMISSION_RECEIPT',
      resolverRevision: 'atlas.trusted-workspace-resolver.v1',
    });

    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/search/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'Find SvelteKit route helpers using Drizzle ORM',
        useGraph: true,
        workspaceRevision: `sha256:${'f'.repeat(64)}`,
      }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: { user: { id: 'u1' } } } as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({
      workspaceRevision: trustedRevision,
    }));
    expect(mocks.search.mock.calls[0]?.[0].workspaceRevision).not.toBe(`sha256:${'f'.repeat(64)}`);
    expect(body.workspaceAuthority).toEqual(expect.objectContaining({
      status: 'TRUSTED',
      workspaceRevision: trustedRevision,
      callerSuppliedWorkspaceContextIgnored: true,
    }));
    expect(body.graphExpansionStatus).toBe('DELEGATED_TO_SEARCH_RUNTIME');
    expect(body.hypergraph.reason).toBe('SEARCH_RUNTIME_GRAPH_EXPANSION_DELEGATED');
  });

  it('uses only resolved ontology package labels as lexical hints and returns non-authoritative evidence', async () => {
    mocks.ontologyResolution.mockImplementation(async (request: { label: string }) => ({
      schemaVersion: 'atlas.ontology-resolution-result.v1',
      label: request.label,
      resolutionState: request.label === 'Drizzle ORM' ? 'RESOLVED' : 'AMBIGUOUS',
      conceptId: request.label === 'Drizzle ORM' ? 'concept:database' : null,
      candidateConceptIds: request.label === 'Drizzle ORM'
        ? ['concept:database']
        : ['concept:frontend', 'concept:frontend.sveltekit'],
      matchMethod: request.label === 'Drizzle ORM' ? 'alias' : null,
      ontologyRevision: 'atlas-domain-ontology:v1:test',
    }));

    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/search/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Find SvelteKit 2 route functions that use Drizzle ORM', topK: 7 }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: { user: { id: 'u1' } } } as any);
    const body = await response.json();

    expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Find SvelteKit 2 route functions that use Drizzle ORM',
      topK: 7,
      lexicalExpansion: expect.arrayContaining(['Drizzle ORM']),
    }));
    expect(mocks.search.mock.calls[0]?.[0].lexicalExpansion).not.toContain('SvelteKit');
    expect(body.ontologyQueryEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Drizzle ORM', conceptId: 'concept:database', canonicalAuthority: false }),
      expect.objectContaining({ label: 'SvelteKit', resolutionState: 'AMBIGUOUS', candidateConceptIds: ['concept:frontend', 'concept:frontend.sveltekit'], canonicalAuthority: false }),
    ]));
  });

  it('does not enable the function registry from a caller-supplied revision', async () => {
    const { POST } = await import('./+server.js');
    const makeRequest = () => new Request('http://localhost/api/search/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'find parser', workspaceRevision: 'sha256:workspace-1' }),
    });

    const disabledRequest = makeRequest();
    await POST({ request: disabledRequest, url: new URL(disabledRequest.url), locals: { user: { id: 'u1' } } } as any);
    expect(mocks.runtimeConfigs.at(-1)?.['functionRegistry']).toBeUndefined();

    mocks.env.ATLAS_FUNCTION_REGISTRY_RETRIEVAL_ENABLED = true;
    mocks.env.ATLAS_FUNCTION_REGISTRY_REPO_ROOT = 'C:/repo';
    const enabledRequest = makeRequest();
    await POST({ request: enabledRequest, url: new URL(enabledRequest.url), locals: { user: { id: 'u1' } } } as any);
    expect(mocks.runtimeConfigs.at(-1)?.['functionRegistry']).toBeUndefined();
  });

  it('blocks synthesis until admitted ContextManifest evidence is wired', async () => {
    const { POST } = await import('./+server.js');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const request = new Request('http://localhost/api/search/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'graph retrieval', synthesize: true }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.synthesis).toBeNull();
    expect(body.synthesisStatus).toBe('BLOCKED_CONTEXT_MANIFEST_REQUIRED');
    expect(body.hits).toHaveLength(1);
    expect(mocks.bifrostChat).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('redacts internal retrieval errors', async () => {
    const { POST } = await import('./+server.js');
    mocks.search.mockRejectedValueOnce(new Error('secret-host/internal-db'));
    const request = new Request('http://localhost/api/search/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'graph retrieval' }),
    });
    const response = await POST({ request, url: new URL(request.url), locals: { user: { id: 'u1' } } } as any);
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.error).toBe('Search unavailable');
    expect(JSON.stringify(body)).not.toContain('secret-host');
  });
});
