// @vitest-environment node

import { describe, expect, it } from 'vitest';
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

    const postgresMap = new Map<string, { relative_path: string; symbol: string; kind: string }>([
      ['packet:a', { relative_path: 'src/a.ts', symbol: 'findPacket', kind: 'function' }],
      ['packet:b', { relative_path: 'src/b.ts', symbol: 'scanPackets', kind: 'function' }]
    ]);

    const ranked = rankCandidates(qdrantHits, turboVecHits, lexicalHits, postgresMap);

    expect(ranked[0].id).toBe('packet:a');
    expect(ranked[0].path).toBe('src/a.ts');
    expect(ranked[0].symbol).toBe('findPacket');
    expect(ranked[0].kind).toBe('function');
    expect(ranked[0].qdrantPointId).toBe('packet:a');
    expect(ranked[0].packetKey).toBe('chunk-uuid-a');
    expect(ranked[0].sourceRef).toBe('src/a.ts');
    expect(ranked[0].sourceRevision).toBe('src-rev-a');
    expect(ranked[0].workspaceRevision).toBe('workspace-rev-1');
    expect(ranked[0].identity).toMatchObject({
      qdrantPointId: 'packet:a',
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

  it('runs the opt-in latent pass only on packet-keyed candidates', async () => {
    const ranked = rankCandidates(
      [
        { id: 'projection-a', score: 0.9, payload: { packet_key: 'a', source_ref: 'src/a.ts' } },
        { id: 'projection-b', score: 0.8, payload: { packet_key: 'b', source_ref: 'src/b.ts' } },
      ],
      [],
      [],
      new Map([
        ['projection-a', { relative_path: 'src/a.ts', symbol: 'a', kind: 'function' }],
        ['projection-b', { relative_path: 'src/b.ts', symbol: 'b', kind: 'function' }],
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
              ['a', Array.from({ length: 256 }, () => 1)],
              ['b', Array.from({ length: 256 }, () => 1)],
            ]),
            requested: input.candidateIds.length,
            found: input.candidateIds.length,
            missing: 0,
            revisionMismatch: 0,
            invalidShape: 0,
            vectorsChecksum: 'vectors-1',
            receiptChecksum: 'receipt-1',
          };
        },
      },
    });

    expect(hydratedKeys).toEqual(['a', 'b']);
    expect(output.map(candidate => candidate.packetKey)).toEqual(['a']);
  });
});
