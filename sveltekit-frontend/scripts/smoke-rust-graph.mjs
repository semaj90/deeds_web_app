import { createRequire } from 'module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const rustGraph = require('../../simd-bridge/rust/graph-engine');

async function testRustGraph() {
	console.log('🚀 Testing Rust-Accelerated Graph Analysis (Mock Data)...');

	const nodes = [
	  { nodeId: '1', label: 'File', title: 'A.ts' },
	  { nodeId: '2', label: 'File', title: 'B.ts' },
	  { nodeId: '3', label: 'File', title: 'C.ts' },
	  { nodeId: '4', label: 'File', title: 'D.ts' },
	  { nodeId: '5', label: 'File', title: 'E.ts' },
	];

  const edges = [
    { from: '1', to: '2' },
    { from: '2', to: '3' },
    { from: '4', to: '5' },
  ];

	const fn = rustGraph.detectCommunitiesRust ?? rustGraph.detect_communities_rust;
	assert.equal(typeof fn, 'function', 'Rust addon exports detectCommunitiesRust');

	const communities = fn(
	  nodes.map((n) => n.nodeId),
	  edges.map((e) => e.from),
	  edges.map((e) => e.to),
	  20,
	);

	assert.ok(Array.isArray(communities), 'community detection returns an array');
	assert.ok(communities.length >= 2, 'mock graph splits into multiple communities');
	assert.ok(communities.every((c) => Array.isArray(c.nodeIds) && c.nodeIds.length > 0), 'communities contain node IDs');

	console.log(JSON.stringify({
	  addonExports: Object.keys(rustGraph),
	  communityCount: communities.length,
	  communitySizes: communities.map((c) => c.size),
	}, null, 2));
}

testRustGraph();
