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
      graphExpanded: [],
    })),
  })),
}));

import { AtlasState } from './atlas-runtime-context.js';
import { handleAtlasSemanticToolCall } from './atlas-semantic-tools.js';

describe('atlas semantic tools', () => {
  it('builds a runtime discovery packet', async () => {
    const result = await handleAtlasSemanticToolCall('atlas.discover', {});
    expect(result.ok).toBe(true);
    expect(result.tool).toBe('atlas.discover');
    expect(result.backend).toBe('grpc');
    expect(result.data.retrievalHealth).toMatchObject({ available: true, status: 'healthy' });
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
        state: AtlasState.DISCOVER,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.tool).toBe('atlas.validate_change');
    expect(result.data.allowedTools).toContain('atlas.retrieve');
    expect(result.data.transitionAllowed).toBe(true);
  });

  it('returns a mock retrieval packet when requested', async () => {
    const result = await handleAtlasSemanticToolCall('atlas.retrieve', {
      query: 'find retry logic',
      topK: 3,
      mock: true,
    });

    expect(result.ok).toBe(true);
    expect(result.mock).toBe(true);
    expect(result.backend).toBe('mock');
    expect(result.data.query).toBe('find retry logic');
    expect(result.data.evidence).toEqual([]);
    expect(result.data.semanticSignal).toMatchObject({ signal_version: expect.stringContaining('semantic_signal') });
    expect(result.data.proofManifest.status).toBe('RUNTIME_PROOF_PENDING');
  });

  it('builds a bounded context packet', async () => {
    const result = await handleAtlasSemanticToolCall('atlas.build_context', {
      query: 'build context for retry logic',
      topK: 2,
    });

    expect(result.ok).toBe(true);
    expect(result.tool).toBe('atlas.build_context');
    expect(result.data.contextBlob).toContain('build context for retry logic');
    expect(result.data.preamble).toBeTruthy();
    expect(result.data.semanticSignal).toMatchObject({ signal_version: expect.stringContaining('semantic_signal') });
  });

  it('stubs mutation and delegation surfaces explicitly', async () => {
    const applyResult = await handleAtlasSemanticToolCall('atlas.apply_change', {
      target: 'codebase_chunks_768_v2',
      patch: { dryRun: true },
    });
    const delegateResult = await handleAtlasSemanticToolCall('atlas.delegate', {
      target: 'acp',
      reason: 'handoff',
    });

    expect(applyResult.ok).toBe(true);
    expect(applyResult.mock).toBe(true);
    expect(applyResult.data.applied).toBe(false);
    expect(delegateResult.ok).toBe(true);
    expect(delegateResult.mock).toBe(true);
    expect(delegateResult.data.delegated).toBe(false);
  });
});
