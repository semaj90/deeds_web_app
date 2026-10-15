#!/usr/bin/env node
/**
 * test-native-graph-tree-parity.mjs
 *
 * Verifies exact parity between C++ N-API graph search / tree ensemble helpers
 * in tensorrt_bridge.node and the Python reference oracle (graph_search_subhelpers_v1.py).
 */

import assert from 'node:assert';
import { loadTensorRTBridge, getBridgeInfo } from '../../sveltekit-frontend/scripts/atlas/load-tensorrt-bridge.mjs';

function runParityTests() {
  console.log('=== Testing Native C++ Graph Search & Tree Ensemble Parity ===');
  const bridge = loadTensorRTBridge();
  assert(bridge, 'Failed to load tensorrt_bridge.node');

  const info = getBridgeInfo(bridge);
  console.log(`Hardware: ${info.backendInfo?.cuda_device_name || 'CPU'}`);
  console.log(`Total Exports: ${info.exports.length}`);

  // 1. Breadth-First Search (BFS)
  // Python: adj = {"a":["b","c"],"b":["d"],"c":["d"]} -> bfs(adj, "a") == ("a","b","c","d")
  // CSR: a=0, b=1, c=2, d=3
  const rowPtr = new Int32Array([0, 2, 3, 4, 4]);
  const colIndices = new Int32Array([1, 2, 3, 3]);
  const bfsResult = bridge.graphBFS(rowPtr, colIndices, 0, 128);
  assert.deepStrictEqual(Array.from(bfsResult), [0, 1, 2, 3], 'BFS path mismatch');
  console.log('✅ graphBFS: Exact parity with Python reference [0, 1, 2, 3]');

  // 2. A* Search
  // Python: weighted = {"a":[("b",1),("c",5)],"b":[("d",1)],"c":[("d",1)]} -> astar(weighted, "a", "d") == ("a","b","d")
  const edgeWeights = new Float32Array([1.0, 5.0, 1.0, 1.0]);
  const astarResult = bridge.graphAStar(rowPtr, colIndices, edgeWeights, null, 0, 3, 1024);
  assert.deepStrictEqual(Array.from(astarResult), [0, 1, 3], 'A* path mismatch');
  console.log('✅ graphAStar: Exact parity with Python reference [0, 1, 3]');

  // 3. Greedy Best-First Search
  // Python: heuristics = {"a":2,"b":1,"c":3,"d":0} -> greedy_best_first(adj, "a", "d", h) == ("a","b","d")
  const heuristics = new Float32Array([2.0, 1.0, 3.0, 0.0]);
  const greedyResult = bridge.graphGreedySearch(rowPtr, colIndices, heuristics, 0, 3, 1024);
  assert.deepStrictEqual(Array.from(greedyResult), [0, 1, 3], 'Greedy search path mismatch');
  console.log('✅ graphGreedySearch: Exact parity with Python reference [0, 1, 3]');

  // 4. AST Linked-List Traversal
  // Node 0 -> children (1, 2); Node 1 -> child (3)
  const firstChild = new Int32Array([1, 3, -1, -1]);
  const nextSibling = new Int32Array([-1, 2, -1, -1]);
  const astResult = bridge.traverseAstLinkedList(firstChild, nextSibling, 0, 10, 10);
  assert.deepStrictEqual(Array.from(astResult), [0, 1, 3, 2], 'AST traversal order mismatch');
  console.log('✅ traverseAstLinkedList: Verified pre-order depth-first traversal [0, 1, 3, 2]');

  // 5. Decision Tree / Random Forest Inference
  const features = new Float32Array([
    0.5, 0.2, // row 0: feat0 <= 0.6 -> leaf 10.0
    0.8, 0.9  // row 1: feat0 >  0.6 -> leaf 20.0
  ]);
  const fi = new Int32Array([0, -1, -1]);
  const th = new Float32Array([0.6, 0.0, 0.0]);
  const lc = new Int32Array([1, -1, -1]);
  const rc = new Int32Array([2, -1, -1]);
  const lv = new Float32Array([0.0, 10.0, 20.0]);
  const roots = new Int32Array([0]);
  const forestScores = bridge.forestPredict(features, 2, 2, fi, th, lc, rc, lv, roots);
  assert.deepStrictEqual(Array.from(forestScores), [10.0, 20.0], 'Forest prediction mismatch');
  console.log('✅ forestPredict: Verified batch tree evaluation [10.0, 20.0]');

  // 6. Spherical Linear Interpolation (SLERP)
  const v1 = new Float32Array([1, 0, 0, 0]);
  const v2 = new Float32Array([0, 1, 0, 0]);
  const slerpMid = bridge.slerpEmbeddings(v1, v2, 0.5);
  const expectedSlerp = 1.0 / Math.sqrt(2);
  assert(Math.abs(slerpMid[0] - expectedSlerp) < 1e-5, 'SLERP[0] mismatch');
  assert(Math.abs(slerpMid[1] - expectedSlerp) < 1e-5, 'SLERP[1] mismatch');
  console.log(`✅ slerpEmbeddings: Verified geodesic arc interpolation (${slerpMid[0].toFixed(6)}, ${slerpMid[1].toFixed(6)})`);

  // 7. 4D Manifold RBF Interpolation
  const coords4D = new Float32Array([
    0, 0, 0, 0,
    1, 0, 0, 0,
    0, 1, 0, 0
  ]);
  const embs = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0
  ]);
  const queryCoord = new Float32Array([0, 0, 0, 0]);
  const interpolated = bridge.manifoldInterpolate4D(coords4D, embs, 3, 4, queryCoord, 5.0);
  assert(interpolated[0] > 0.99, 'Manifold interpolation target mismatch');
  console.log(`✅ manifoldInterpolate4D: Verified continuous RBF synthesis at [0,0,0,0] -> [${Array.from(interpolated).map(v => v.toFixed(3)).join(', ')}]`);

  console.log('\n🎉 ALL 7 NATIVE GRAPH, TREE & MANIFOLD PARITY CHECKS PASSED!');
}

runParityTests();
