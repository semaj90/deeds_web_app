// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { rankCandidates } from './unified-orchestrator';

describe('unified orchestrator RRF fusion', () => {
  it('fuses dense, turbovec, and lexical lanes into one ranked winner', () => {
    const qdrantHits = [
      { id: 'packet:a', score: 0.92, payload: { relative_path: 'src/a.ts' } },
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
    expect(ranked[0].ranks.qdrant_dense).toBeDefined();
    expect(ranked[0].ranks.turbovec).toBeDefined();
    expect(ranked[0].ranks.rg_lexical).toBeDefined();
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });
});
