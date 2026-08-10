import { describe, expect, it } from 'vitest';
import { collectCandidateTiles } from '../../../src/lib/server/atlas/tensors/topology-tile-tree';

describe('TopologyTileTree', () => {
  it('culls non-intersecting regions without becoming ANN', () => {
    const root = {id:'root',minSomX:0,maxSomX:1,minSomY:0,maxSomY:1,minAuthority:0,maxAuthority:1,minEntropyUtility:0,maxEntropyUtility:1,tileKeys:['t0'],children:[{id:'c',minSomX:0,maxSomX:.5,minSomY:0,maxSomY:.5,minAuthority:0,maxAuthority:1,minEntropyUtility:0,maxEntropyUtility:1,tileKeys:['t1']}]};
    expect(collectCandidateTiles(root,{somX:.25,somY:.25,authority:.5,entropyUtility:.5})).toEqual(['t0','t1']);
    expect(collectCandidateTiles(root,{somX:2,somY:2,authority:.5,entropyUtility:.5})).toEqual([]);
  });
});
