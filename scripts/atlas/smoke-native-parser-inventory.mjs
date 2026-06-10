#!/usr/bin/env node
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const graphPath = path.resolve(__dirname, '../../simd-bridge/rust/graph-engine/graph-engine.win32-x64-msvc.node');
const hmmPath = path.resolve(__dirname, '../../simd-bridge/rust/hmm-repair/hmm-repair.win32-x64-msvc.node');

console.log('🧪 Loading native parser addons...');
console.log('  Graph-Engine path:', graphPath);
console.log('  HMM-Repair path:', hmmPath);

const graph = require(graphPath);
const hmm = require(hmmPath);

console.log('Graph exports:', Object.keys(graph));
console.log('HMM exports:', Object.keys(hmm));

console.log('\n📊 Function types:');
console.log('  graph.detectCommunitiesRust:', typeof graph.detectCommunitiesRust);
console.log('  hmm.predictChunkRust:', typeof hmm.predictChunkRust);

if (typeof graph.detectCommunitiesRust !== 'function' || typeof hmm.predictChunkRust !== 'function') {
  console.error('❌ Fail: Expected functions missing from native bindings');
  process.exit(1);
}

console.log('\n🧪 Testing hmm-repair prediction:');
const testText = 'Plaintiff alleges jurisdiction and venue are proper in this court because the facts occurred here.';
const pred = hmm.predictChunkRust(testText);
console.log('  Input:', testText);
console.log('  Predicted State:', pred.primaryState || pred.primary_state);
console.log('  Confidence:', pred.confidence.toFixed(4));

console.log('\n🧪 Testing graph-engine community detection:');
const comms = graph.detectCommunitiesRust(
  ['a', 'b', 'c', 'd'],
  ['a', 'b', 'c'],
  ['b', 'c', 'd'],
  20
);
console.log('  Detected Communities count:', comms.length);
comms.forEach(c => {
  const commId = c.communityId !== undefined ? c.communityId : c.community_id;
  const nodeIds = c.nodeIds !== undefined ? c.nodeIds : c.node_ids;
  console.log(`    Community ${commId} (size ${c.size}): [${nodeIds.join(', ')}]`);
});

console.log('\n✅ All native parser tests passed successfully!');
process.exit(0);
