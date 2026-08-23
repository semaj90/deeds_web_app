import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisState = {
  values: new Map<string, string>(),
};

vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn(async () => undefined),
    quit: vi.fn(async () => undefined),
    on: vi.fn(),
    get: vi.fn(async (key: string) => redisState.values.get(key) ?? null),
  })),
}));

import {
  buildCoverageFromRow,
  buildRepairPacket,
  determineExitCode,
  isCanonicalAcePacketPayload,
  isConstantVector,
  isValidEmbeddingArtifact,
  mapProofGateStatus,
  probeQdrantPacket,
  probeRedisPacket,
  selectPacketCoverage,
} from '../../scripts/atlas/phase108d-select-and-prove-packet.mts';

describe('phase108d packet selector', () => {
  beforeEach(() => {
    redisState.values.clear();
    vi.restoreAllMocks();
  });

  it('keeps an explicit packet target fixed', () => {
    const candidates = [
      {
        packetKey: 'packet-a',
        postgres: 'PRESENT' as const,
        qdrant: 'ABSENT' as const,
        redis: 'ABSENT' as const,
        ace: 'ABSENT' as const,
        hyperrag: 'PRESENT' as const,
        coverageScore: 0.4,
        diagnostics: [],
      },
      {
        packetKey: 'packet-b',
        postgres: 'PRESENT' as const,
        qdrant: 'PRESENT' as const,
        redis: 'PRESENT' as const,
        ace: 'PRESENT' as const,
        hyperrag: 'PRESENT' as const,
        coverageScore: 1,
        diagnostics: [],
      },
    ];

    const result = selectPacketCoverage(candidates, 'packet-a');
    expect(result.selectedPacket?.packetKey).toBe('packet-a');
  });

  it('prefers the complete cross-store packet automatically', () => {
    const candidates = [
      {
        packetKey: 'packet-a',
        packetVersion: 3,
        postgres: 'PRESENT' as const,
        qdrant: 'PRESENT' as const,
        redis: 'ABSENT' as const,
        ace: 'PRESENT' as const,
        hyperrag: 'PRESENT' as const,
        coverageScore: 0.8,
        diagnostics: ['Redis missing'],
      },
      {
        packetKey: 'packet-b',
        packetVersion: 7,
        postgres: 'PRESENT' as const,
        qdrant: 'PRESENT' as const,
        redis: 'PRESENT' as const,
        ace: 'PRESENT' as const,
        hyperrag: 'PRESENT' as const,
        coverageScore: 1,
        diagnostics: [],
      },
    ];

    const result = selectPacketCoverage(candidates);
    expect(result.selectedPacket?.packetKey).toBe('packet-b');
  });

  it('treats Postgres as the authority row and does not infer other stores', () => {
    const coverage = buildCoverageFromRow({
      packet_key: 'packet-a',
      source_ref: 'src/file.ts',
      content_hash: 'sha256:abc',
      workspace_revision: 'rev-1',
    });

    expect(coverage.postgres).toBe('PRESENT');
    expect(coverage.qdrant).toBe('ABSENT');
    expect(coverage.redis).toBe('ABSENT');
    expect(coverage.ace).toBe('ABSENT');
    expect(coverage.hyperrag).toBe('ABSENT');
  });

  it('rejects constant or lineage-free embeddings', () => {
    expect(isConstantVector([1, 1, 1])).toBe(true);
    expect(
      isValidEmbeddingArtifact({
        content_embedding_384: [1, 1, 1, 1],
        metadata: {},
        payload: {},
      } as never),
    ).toBe(false);
  });

  it('accepts a valid embedding artifact shape', () => {
    const vector = Array.from({ length: 384 }, (_, index) => index + 1);
    expect(
      isValidEmbeddingArtifact({
        content_embedding_384: vector,
        metadata: {
          producer_model: 'embeddinggemma',
          producer_version: '1.0.0',
          representation_name: 'dense_384',
        },
        payload: {},
      } as never),
    ).toBe(true);
  });

  it('rejects fixture-only Redis payloads as canonical proof', async () => {
    redisState.values.set(
      'ace:packet:packet-a',
      JSON.stringify({
        packetKey: 'packet-a',
        workspaceRevision: 'rev-1',
      }),
    );

    const state = await probeRedisPacket({
      packetKey: 'packet-a',
      postgres: 'PRESENT',
      qdrant: 'ABSENT',
      redis: 'ABSENT',
      ace: 'ABSENT',
      hyperrag: 'ABSENT',
      coverageScore: 0,
      diagnostics: [],
    } as never, 'redis://127.0.0.1:6379');

    expect(state.state).toBe('SCHEMA_MISMATCH');
  });

  it('accepts a canonical ACE packet payload shape', () => {
    const packet = buildRepairPacket({
      packetKey: 'packet-a',
      sourceRef: 'src/file.ts',
      postgres: 'PRESENT',
      qdrant: 'ABSENT',
      redis: 'ABSENT',
      ace: 'ABSENT',
      hyperrag: 'ABSENT',
      coverageScore: 0,
      diagnostics: [],
    } as never, {
      packet_key: 'packet-a',
      source_ref: 'src/file.ts',
      workspace_revision: 'rev-1',
      content_hash: 'sha256:abc',
      repository_id: 'repo-1',
    } as never);

    expect(isCanonicalAcePacketPayload(packet as Record<string, unknown>)).toBe(true);
  });

  it('maps proof gate and exit codes conservatively', () => {
    expect(mapProofGateStatus('CROSS_STORE_PROVEN')).toBe('FULLY_PROVEN');
    expect(mapProofGateStatus('PARTIAL_PROVEN')).toBe('PARTIAL_PROVEN');
    expect(
      determineExitCode({
        schemaVersion: 'phase108d-packet-selection.v1',
        runId: 'run-1',
        selectedPacket: {
          packetKey: 'packet-a',
          postgres: 'PRESENT',
          qdrant: 'ABSENT',
          redis: 'ABSENT',
          ace: 'ABSENT',
          hyperrag: 'PRESENT',
          coverageScore: 0.4,
          diagnostics: [],
        },
        candidatesChecked: 1,
        selectionReason: 'explicit',
        repairRequested: false,
        repairActions: [],
        proofState: 'PARTIAL_PROVEN',
        blockers: [],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      }),
    ).toBe(2);
  });

  it('treats Qdrant payload identity mismatches as schema mismatches', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/collections')) {
        return new Response(JSON.stringify({ result: { collections: [{ name: 'codebase_chunks_384' }] } }), { status: 200 });
      }
      return new Response(JSON.stringify({
        result: {
          points: [
            {
              id: 'point-1',
              payload: {
                packet_key: 'packet-a',
                source_ref: 'src/file.ts',
                content_hash: 'sha256:wrong',
                workspace_revision: 'rev-1',
                representation_name: 'dense_384',
                dimensions: 384,
              },
            },
          ],
        },
      }), { status: 200 });
    }) as never;

    try {
      const state = await probeQdrantPacket(
        {
          packetKey: 'packet-a',
          sourceRef: 'src/file.ts',
          contentHash: 'sha256:abc',
          workspaceRevision: 'rev-1',
          postgres: 'PRESENT',
          qdrant: 'ABSENT',
          redis: 'ABSENT',
          ace: 'ABSENT',
          hyperrag: 'ABSENT',
          coverageScore: 0,
          diagnostics: [],
        },
        {
          packet_key: 'packet-a',
          source_ref: 'src/file.ts',
          content_hash: 'sha256:abc',
          workspace_revision: 'rev-1',
        } as never,
        'http://127.0.0.1:6333',
      );

      expect(state).toBe('SCHEMA_MISMATCH');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
