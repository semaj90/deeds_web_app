import { describe, expect, it } from 'vitest';
import { reducePassResults, type PassResult } from './canonical-reducer';

const revision = { workspaceRevision: 'w1', sourceRevision: 's1', representationRevision: 'r1', graphRevision: 'g1' };
const rows: PassResult[] = [
  { requestId: 'q1', packetKey: 'pk1', revision, passName: 'semantic', payload: { score: 0.8 } },
  { requestId: 'q1', packetKey: 'pk1', revision, passName: 'ast', payload: { match: 1 } },
  { requestId: 'q1', packetKey: 'pk2', revision, passName: 'semantic', payload: { score: 0.7 } },
];

describe('reducePassResults', () => {
  it('is independent of physical completion order', () => {
    const a = reducePassResults(rows, ['semantic', 'ast']);
    const b = reducePassResults([...rows].reverse(), ['semantic', 'ast']);
    expect(a).toEqual(b);
    expect(a.find((row) => row.packetKey === 'pk2')?.missingPasses).toEqual(['ast']);
  });
});
