import assert from 'node:assert/strict';
import { hilbertXYToIndex, sortByHilbert2D } from './hilbert-locality-adapter.mjs';

assert.equal(hilbertXYToIndex(1,0,0),0);
assert.equal(hilbertXYToIndex(1,0,1),1);
assert.equal(hilbertXYToIndex(1,1,1),2);
assert.equal(hilbertXYToIndex(1,1,0),3);

const input=[{id:'a',x:0,y:0},{id:'b',x:0,y:1},{id:'c',x:1,y:1},{id:'d',x:1,y:0}];
const out=sortByHilbert2D(input,1);
assert.deepEqual(out.map(x=>x.id),['a','b','c','d']);
console.log('HILBERT_2D_DETERMINISTIC_PASS');
