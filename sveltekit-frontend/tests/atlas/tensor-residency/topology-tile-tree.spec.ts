import { describe, expect, it } from 'vitest';
import { collectCandidateTiles } from '../../../src/lib/server/atlas/tensors/topology-tile-tree';

describe('TopologyTileTree', () => {
  it('culls non-intersecting regions without becoming ANN', () => {
    const root = {id:'root',minSomX:0,maxSomX:1,minSomY:0,maxSomY:1,minAuthority:0,maxAuthority:1,minEntropyUtility:0,maxEntropyUtility:1,tileKeys:['t0'],children:[{id:'c',minSomX:0,maxSomX:.5,minSomY:0,maxSomY:.5,minAuthority:0,maxAuthority:1,minEntropyUtility:0,maxEntropyUtility:1,tileKeys:['t1']}]};
    // TopologyCoordinate4 is a readonly tuple [somX, somY, authorityNorm, entropyUtilityNorm]
    // (topology-coordinate4.ts), not an object — the shipped v2 bundle test used an
    // object literal here, which made every `p[0]..p[3]` index read `undefined` and
    // silently pass `contains()`'s comparisons as false. Fixed 2026-08-10.
    expect(collectCandidateTiles(root, [.25, .25, .5, .5])).toEqual(['t0', 't1']);
    expect(collectCandidateTiles(root, [2, 2, .5, .5])).toEqual([]);
  });
});
