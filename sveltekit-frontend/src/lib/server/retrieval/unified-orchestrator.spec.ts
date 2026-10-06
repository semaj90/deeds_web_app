// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/llm/runtime-contract.js', () => {
  throw new Error('[llm-runtime-contract] ROTORQUANT_MODEL_PATH is required');
});
import { applyConfiguredLatent256Dedup, rankCandidates } from './unified-orchestrator';

describe('unified orchestrator RRF fusion', () => {
  it('fuses dense, turbovec, and lexical lanes into one ranked winner', () => {
    const qdrantHits = [
      { id: 'packet:a', score: 0.92, payload: {
        relative_path: 'src/a.ts', packet_key: 'chunk-uuid-a', source_ref: 'src/a.ts',
        source_revision: 'src-rev-a', workspace_revision: 'workspace-rev-1',
      } },
      { id: 'packet:b', score: 0.85, payload: { relative_path: 'src/b.ts' } }
    ];

    const turboVecHits = [
      { id: 'packet:a', score: 0.88, rank: 1 },
      { id: 'packet:b', score: 0.74, rank: 2 }
    ];

    const lexicalHits = [
      { id: 'packet:a', file: 'src/a.ts', line: 12, score: 1.0, rank: 1 }
    ];

    const postgresMap = new Map<string, { candidateId: string; relative_path: string; symbol: string; kind: string }>([
      ['packet:a', { candidateId: 'chunk-id-a', relative_path: 'src/a.ts', symbol: 'findPacket', kind: 'function' }],
      ['packet:b', { candidateId: 'chunk-id-b', relative_path: 'src/b.ts', symbol: 'scanPackets', kind: 'function' }]
    ]);

    const ranked = rankCandidates(qdrantHits, turboVecHits, lexicalHits, postgresMap);

    expect(ranked[0].id).toBe('packet:a');
    expect(ranked[0].path).toBe('src/a.ts');
    expect(ranked[0].symbol).toBe('findPacket');
    expect(ranked[0].kind).toBe('function');
    expect(ranked[0].qdrantPointId).toBe('packet:a');
    expect(ranked[0].candidateId).toBe('chunk-id-a');
    expect(ranked[0].packetKey).toBe('chunk-uuid-a');
    expect(ranked[0].sourceRef).toBe('src/a.ts');
    expect(ranked[0].sourceRevision).toBe('src-rev-a');
    expect(ranked[0].workspaceRevision).toBe('workspace-rev-1');
    expect(ranked[0].identity).toMatchObject({
      qdrantPointId: 'packet:a',
      candidateId: 'chunk-id-a',
      packetKey: 'chunk-uuid-a',
      sourceRef: 'src/a.ts',
      sourceRevision: 'src-rev-a',
      workspaceRevision: 'workspace-rev-1',
      symbolVersionId: null,
      identitySource: 'QDRANT_PAYLOAD_V1',
      missingFields: [],
    });
    expect(ranked[0].ranks.qdrant_dense).toBeDefined();
    expect(ranked[0].ranks.turbovec).toBeDefined();
    expect(ranked[0].ranks.rg_lexical).toBeDefined();
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('does not promote a projection ID or display path into canonical identity', () => {
    const ranked = rankCandidates(
      [{ id: 'projection-only', score: 0.9, payload: { relative_path: 'src/only.ts' } }],
      [],
      [],
      new Map([['projection-only', { relative_path: 'src/only.ts', symbol: 'f', kind: 'function' }]]),
    );

    expect(ranked[0].qdrantPointId).toBe('projection-only');
    expect(ranked[0].packetKey).toBeUndefined();
    expect(ranked[0].sourceRef).toBeUndefined();
    expect(ranked[0].identity.packetKey).toBeNull();
    expect(ranked[0].identity.sourceRef).toBeNull();
    expect(ranked[0].identity.identitySource).toBe('QDRANT_PAYLOAD_V1');
    expect(ranked[0].identity.missingFields).toEqual([
      'packetKey', 'sourceRef', 'sourceRevision', 'workspaceRevision',
    ]);
  });

  it('passes the canonical chunk ID to latent hydration, not packet or projection IDs', async () => {
    const ranked = rankCandidates(
      [
        { id: 'projection-a', score: 0.9, payload: { packet_key: 'a', source_ref: 'src/a.ts' } },
        { id: 'projection-b', score: 0.8, payload: { packet_key: 'b', source_ref: 'src/b.ts' } },
      ],
      [],
      [],
      new Map([
        ['projection-a', { candidateId: 'chunk-a', relative_path: 'src/a.ts', symbol: 'a', kind: 'function' }],
        ['projection-b', { candidateId: 'chunk-b', relative_path: 'src/b.ts', symbol: 'b', kind: 'function' }],
      ]),
    );
    let hydratedKeys: string[] = [];
    const output = await applyConfiguredLatent256Dedup(ranked, {
      enabled: true,
      threshold: 0.9,
      finalK: 1,
      candidatePoolK: 2,
      checkpointRevision: 'checkpoint-1',
      candidateSnapshotRevision: 'snapshot-1',
      representationRevision: 'latent_256-v1',
      provider: {
        async hydrate(input) {
          hydratedKeys = [...input.candidateIds];
          return {
            vectors: new Map([
              ['chunk-a', Array.from({ length: 256 }, () => 1)],
              ['chunk-b', Array.from({ length: 256 }, () => 1)],
            ]),
            outcomes: input.candidateIds.map((candidateId, candidateOrdinal) => ({
              candidateOrdinal,
              canonicalId: candidateId,
              codebaseChunkId: candidateId,
              status: 'AVAILABLE' as const,
            })),
            requested: input.candidateIds.length,
            found: input.candidateIds.length,
            missing: 0,
            identityUnresolved: 0,
            revisionMismatch: 0,
            invalidShape: 0,
            vectorsChecksum: 'vectors-1',
            receiptChecksum: 'receipt-1',
          };
        },
      },
    });

    expect(ranked.map(candidate => [candidate.candidateId, candidate.packetKey, candidate.qdrantPointId])).toEqual([
      ['chunk-a', 'a', 'projection-a'],
      ['chunk-b', 'b', 'projection-b'],
    ]);
    expect(hydratedKeys).toEqual(['chunk-a', 'chunk-b']);
    expect(output.map(candidate => candidate.packetKey)).toEqual(['a']);
  });

  it('fails open and preserves candidates when the canonical chunk ID is unavailable', async () => {
    const ranked = rankCandidates(
      [{ id: 'projection-only', score: 0.9, payload: { packet_key: 'packet-a', source_ref: 'src/a.ts' } }],
      [],
      [],
      new Map([['projection-only', { relative_path: 'src/a.ts', symbol: 'a', kind: 'function' }]]),
    );
    let providerCalled = false;

    const output = await applyConfiguredLatent256Dedup(ranked, {
      enabled: true,
      threshold: 0.9,
      finalK: 1,
      candidatePoolK: 1,
      checkpointRevision: 'checkpoint-1',
      candidateSnapshotRevision: 'snapshot-1',
      representationRevision: 'latent_256-v1',
      provider: {
        async hydrate() {
          providerCalled = true;
          throw new Error('provider must not receive projection-only identity');
        },
      },
    });

    expect(providerCalled).toBe(false);
    expect(output).toEqual(ranked);
  });
});

describe('unified orchestrator config safety (KERNEL-REAL-02 blockers 3 and 4)', () => {
  it('imports even when the LLM runtime contract throws at import (synthesis-only dependency)', async () => {
    const mod = await import('./unified-orchestrator');
    expect(typeof mod.executeUnifiedRetrieval).toBe('function');
  });

  it('carries no hard-coded database credential and no wrong-port fallback', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['unified-orchestrator.ts', 'parent-atlas-bridge.ts']) {
      const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(src).not.toContain('123456');
      expect(src).not.toMatch(/POSTGRES_PORT \|\| '5432'/);
    }
  });

  it('resolves Postgres config as UNAVAILABLE without a password, CONFIGURED on 5434 by default', async () => {
    const { resolvePostgresRuntimeConfigV1 } = await import('./parent-atlas-bridge');
    expect(resolvePostgresRuntimeConfigV1({})).toEqual({ status: 'UNAVAILABLE', missing: ['POSTGRES_PASSWORD'] });
    expect(resolvePostgresRuntimeConfigV1({ POSTGRES_PASSWORD: ' pw ' })).toMatchObject({
      status: 'CONFIGURED', host: '127.0.0.1', port: 5434, password: 'pw',
    });
  });

  it('postgres join fails explicitly, and bridge enrichment degrades, when no password is configured', async () => {
    const { postgresJoin } = (await import('./unified-orchestrator')).default;
    const { resolveParentAtlasContext } = await import('./parent-atlas-bridge');
    const noPassword = { postgres: { host: '127.0.0.1', port: 5434, user: 'u', password: '', database: 'd' } };
    await expect(postgresJoin(['q1'], noPassword as never)).rejects.toThrow('POSTGRES_ENRICHMENT_UNAVAILABLE');
    expect(await resolveParentAtlasContext('src/a.ts', noPassword)).toBeNull();
  });
});
