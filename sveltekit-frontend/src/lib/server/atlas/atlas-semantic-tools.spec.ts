import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/mcp/atlas-tools-client.js', () => ({
  buildStreamPreamble: vi.fn(async () => ({
    intent: { intent: 'research', domain: 'retrieval', subdomain: 'semantic', confidence: 0.91, safeNextCommand: 'atlas.retrieve' },
    rag: { ok: true, query: 'mock', totalCards: 1, packetAge: 'fresh', cards: [], sourceRefs: [], promptPacket: 'stub', safeNextCommand: 'atlas.retrieve' },
  })),
}));

vi.mock('$lib/server/grpc/retrieval-client.js', () => ({
  searchEvidenceViaGrpc: vi.fn(async () => null),
  checkRetrievalHealth: vi.fn(async () => ({
    available: true,
    enabled: true,
    url: 'grpc://retrieval',
    status: 'healthy',
    service: 'retrieval-service',
  })),
}));

vi.mock('./retrieval/search-runtime-adapter.js', () => ({
  createAtlasSearchAdapter: vi.fn(() => ({
    search: vi.fn(async () => ({
      packets: [
        { packet_key: 'packet-1', source_ref: 'src/file.ts', score: 0.88 },
      ],
      topPacketKeys: ['packet-1'],
      metadata: { query: 'mock', candidatesRetrieved: 1 },
      provenance: { fusionMethod: 'rrf', rerankerUsed: false },
      graphExpansionStatus: 'NOT_REQUESTED',
    })),
  })),
}));

import { AtlasState } from './atlas-runtime-context.js';
import { searchEvidenceViaGrpc } from '$lib/server/grpc/retrieval-client.js';
import { createAtlasSearchAdapter } from './retrieval/search-runtime-adapter.js';
import {
  compressHeadroomCcrPromptForRuntimeV1,
  handleAtlasSemanticToolCall,
  retrieveHeadroomCcrHashForRuntimeV1,
} from './atlas-semantic-tools.js';

describe('atlas semantic tools', () => {
  const qualifiedRuntime = {
    workspaceId: 'workspace:fixture',
    workspaceRevision: 'sha256:' + '1'.repeat(64),
    packetKey: 'packet:fixture',
    packetRevision: 'sha256:' + '2'.repeat(64),
  };

  it('builds a runtime discovery packet', async () => {
    const result = await handleAtlasSemanticToolCall('atlas.discover', { runtime: qualifiedRuntime });
    expect(result.ok).toBe(true);
    expect(result.tool).toBe('atlas.discover');
    expect(result.backend).toBe('grpc');
    expect(result.data.retrievalHealth).toMatchObject({ available: true, status: 'healthy' });
    expect(result.data).not.toHaveProperty('preamble');
  });

  it('validates a transition with the existing FSM policy', async () => {
    const result = await handleAtlasSemanticToolCall('atlas.validate_change', {
      observation: {
        lastTool: 'atlas.retrieve',
        lastToolSucceeded: true,
        retrievalConfidence: 0.9,
        evidenceCount: 2,
        validationStatus: 'PASS',
        authFailure: false,
        revisionMismatch: false,
        tokenPressure: 0.1,
        iterationNumber: 1,
      },
      runtime: {
        ...qualifiedRuntime,
        state: AtlasState.DISCOVER,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.tool).toBe('atlas.validate_change');
    expect(result.data.allowedTools).toContain('atlas.retrieve');
    expect(result.data.transitionAllowed).toBe(true);
  });

  it('does not let caller-supplied runtime authority enable mutation', async () => {
    const result = await handleAtlasSemanticToolCall('atlas.validate_change', {
      runtime: {
        ...qualifiedRuntime,
        authority: { mutationAllowed: true, postgresCanonical: false },
      },
      observation: {
        lastTool: 'atlas.validate_change',
        lastToolSucceeded: true,
        retrievalConfidence: 1,
        evidenceCount: 1,
        validationStatus: 'PASS',
        authFailure: false,
        revisionMismatch: false,
        tokenPressure: 0,
        iterationNumber: 1,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.runtime.authority).toEqual({ mutationAllowed: false, postgresCanonical: true });
    expect(result.data.allowMutation).toBe(false);
  });

  it('returns a mock retrieval packet when requested', async () => {
    const result = await handleAtlasSemanticToolCall('atlas.retrieve', {
      query: 'find retry logic',
      topK: 3,
      mock: true,
      runtime: qualifiedRuntime,
    });

    expect(result.ok).toBe(true);
    expect(result.mock).toBe(true);
    expect(result.backend).toBe('mock');
    expect(result.data.query).toBe('find retry logic');
    expect(result.data.evidence).toEqual([]);
    expect(result.data.canonicalAuthority).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.data.canonicalEvidenceValidity).toBe('NOT_ADMITTED');
    expect(result.data.workspaceAuthorityStatus).toBe('UNVERIFIED_CALLER_INPUT');
    expect(result.data.semanticSignal).toMatchObject({ signal_version: expect.stringContaining('semantic_signal') });
    expect(result.data.proofManifest.status).toBe('RUNTIME_PROOF_PENDING');
  });

  it('rejects whitespace-only queries', async () => {
    await expect(handleAtlasSemanticToolCall('atlas.retrieve', {
      query: '   ',
      runtime: qualifiedRuntime,
    })).rejects.toThrow();
  });

  it('returns gRPC candidate locators without mislabeling identity or exposing source text', async () => {
    vi.mocked(searchEvidenceViaGrpc).mockResolvedValueOnce({
      results: [{ evidenceId: 'evidence-1', content: 'private source bytes', score: 0.8, metadata: { fileName: 'src/a.ts' } }],
      timing: { totalMs: 1 },
      cacheSource: 'miss',
    } as Awaited<ReturnType<typeof searchEvidenceViaGrpc>>);

    const result = await handleAtlasSemanticToolCall('atlas.retrieve', {
      query: 'find parser',
      runtime: qualifiedRuntime,
    });

    expect(result.ok).toBe(true);
    expect(result.data.candidateRefs).toEqual([{
      evidenceId: 'evidence-1',
      sourceLocator: 'src/a.ts',
      score: 0.8,
      identityStatus: 'UNRESOLVED',
    }]);
    expect(JSON.stringify(result.data)).not.toContain('private source bytes');
    expect(result.data.canonicalAuthority).toBe(false);
  });

  it('returns SearchRuntime references rather than raw packet bodies', async () => {
    vi.mocked(searchEvidenceViaGrpc).mockResolvedValueOnce(null);

    const result = await handleAtlasSemanticToolCall('atlas.retrieve', {
      query: 'find parser',
      runtime: qualifiedRuntime,
    });

    expect(result.ok).toBe(true);
    expect(result.data.candidateRefs).toEqual([{ candidateRef: 'packet-1', identityStatus: 'UNRESOLVED' }]);
    expect(result.data).not.toHaveProperty('packets');
    expect(result.data.canonicalEvidenceValidity).toBe('NOT_ADMITTED');
    expect(result.confidence).toBe(0);
    expect(result.data.grpcFallbackStatus).toBe('NO_RESULT');
  });

  it('reports a sanitized gRPC fallback status and refuses to assign evidence confidence', async () => {
    vi.mocked(searchEvidenceViaGrpc).mockRejectedValueOnce(new Error('private endpoint details'));

    const result = await handleAtlasSemanticToolCall('atlas.retrieve', {
      query: 'find parser',
      runtime: qualifiedRuntime,
    });

    expect(result.ok).toBe(true);
    expect(result.data.grpcFallbackStatus).toBe('REQUEST_FAILED');
    expect(result.confidence).toBe(0);
    expect(JSON.stringify(result)).not.toContain('private endpoint details');
  });

  it('returns a stable refusal when SearchRuntime fails without exposing its error', async () => {
    vi.mocked(searchEvidenceViaGrpc).mockResolvedValueOnce(null);
    vi.mocked(createAtlasSearchAdapter).mockReturnValueOnce({
      search: vi.fn().mockRejectedValue(new Error('private search backend details')),
    } as unknown as ReturnType<typeof createAtlasSearchAdapter>);

    const result = await handleAtlasSemanticToolCall('atlas.retrieve', {
      query: 'find parser',
      runtime: qualifiedRuntime,
    });

    expect(result.ok).toBe(false);
    expect(result.data.error).toBe('SEARCH_RUNTIME_UNAVAILABLE');
    expect(result.data.canonicalEvidenceValidity).toBe('NOT_ADMITTED');
    expect(JSON.stringify(result)).not.toContain('private search backend details');
  });

  it('refuses live context assembly without the verified context provider', async () => {
    const result = await handleAtlasSemanticToolCall('atlas.build_context', {
      query: 'build context for retry logic',
      topK: 2,
      runtime: qualifiedRuntime,
    });

    expect(result.ok).toBe(false);
    expect(result.tool).toBe('atlas.build_context');
    expect(result.data.error).toBe('VERIFIED_CONTEXT_SERVICE_NOT_CONFIGURED');
    expect(result.data.canonicalEvidenceValidity).toBe('NOT_ADMITTED');
  });

  it('stubs mutation and delegation surfaces explicitly', async () => {
    const applyResult = await handleAtlasSemanticToolCall('atlas.apply_change', {
      target: 'codebase_chunks_768_v2',
      patch: { dryRun: true },
      runtime: qualifiedRuntime,
    });
    const delegateResult = await handleAtlasSemanticToolCall('atlas.delegate', {
      target: 'acp',
      reason: 'handoff',
      runtime: qualifiedRuntime,
    });

    expect(applyResult.ok).toBe(true);
    expect(applyResult.mock).toBe(true);
    expect(applyResult.data.applied).toBe(false);
    expect(delegateResult.ok).toBe(true);
    expect(delegateResult.mock).toBe(true);
    expect(delegateResult.data.delegated).toBe(false);
  });

  it('compresses and retrieves Headroom CCR hashes only with a revision-qualified runtime and non-canonical flags', async () => {
    await expect(
      retrieveHeadroomCcrHashForRuntimeV1({
        hash: 'b3df3352432ed4f38c765afe',
        runtime: {},
      }),
    ).rejects.toThrow('REVISION_QUALIFIED_RUNTIME_REQUIRED');

    const fakeFetch = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith('/v1/compress')) {
        return new Response(
          JSON.stringify({
            messages: [{ role: 'user', content: '[CCR: b3df3352432ed4f38c765afe]' }],
            tokens_before: 11736,
            tokens_after: 3136,
            tokens_saved: 8600,
            compression_ratio: 0.2672,
            transforms_applied: ['router:code_aware:0.53'],
            ccr_hashes: ['b3df3352432ed4f38c765afe'],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          hash: 'b3df3352432ed4f38c765afe',
          content: 'export function example() { return 42; }',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const compressed = await compressHeadroomCcrPromptForRuntimeV1(
      {
        runtime: qualifiedRuntime,
        messages: [{ role: 'user', content: 'export function example() { return 42; }' }],
      },
      { endpoint: 'http://127.0.0.1:8787', fetchImpl: fakeFetch as unknown as typeof fetch },
    );

    expect(compressed.receipt.ccrHashes).toEqual(['b3df3352432ed4f38c765afe']);
    expect(compressed.canonicalAuthority).toBe(false);
    expect(compressed.replacementCanonicalEvidence).toBe(false);
    expect(compressed.canonicalEvidenceValidity).toBe('NOT_ADMITTED');

    const retrieved = await retrieveHeadroomCcrHashForRuntimeV1(
      {
        runtime: qualifiedRuntime,
        hash: 'b3df3352432ed4f38c765afe',
        expectedOriginalText: 'export function example() { return 42; }',
      },
      { endpoint: 'http://127.0.0.1:8787', fetchImpl: fakeFetch as unknown as typeof fetch },
    );

    expect(retrieved.receipt.found).toBe(true);
    expect(retrieved.receipt.exactByteChecksumMatch).toBe(true);
    expect(retrieved.canonicalAuthority).toBe(false);
    expect(retrieved.replacementCanonicalEvidence).toBe(false);
    expect(retrieved.canonicalEvidenceValidity).toBe('NOT_ADMITTED');
    expect(retrieved.writesPerformed).toBe(false);
  });
});
