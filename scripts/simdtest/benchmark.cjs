const fs = require('fs');
const path = require('path');

function now() { return Date.now(); }

const sampleCandidates = [
  path.join(__dirname, '..', '..', '.tmp', 'parent_atlas_packets', '00a337a7c6c8fadc.json'),
  path.join(__dirname, '..', '..', '.opencode', 'cards')
];

let sample = null;
for (const c of sampleCandidates) {
  if (fs.existsSync(c) && fs.statSync(c).isFile()) {
    sample = fs.readFileSync(c, 'utf8');
    break;
  }
}
if (!sample) {
  // fallback synthetic sample
  sample = JSON.stringify({ id: 'test', text: 'The quick brown fox jumps over the lazy dog', title: 'test', metadata: { tags: ['a','b'] } });
}

const N = parseInt(process.argv[2] || '500', 10);
const inputs = new Array(N).fill(sample);

const candidates = [
  path.join(__dirname, '..', '..', 'simd-bridge', 'rust-simdjson', 'target', 'release', 'simd_bridge_rs.node'),
  path.join(__dirname, '..', '..', 'simd-bridge', 'rust-simdjson', 'target', 'release', 'simd_bridge_rs.dll')
];
let native = null;
for (const c of candidates) {
  if (fs.existsSync(c)) {
    try { native = require(c); break; } catch (e) {}
  }
}

console.log('Sample length:', sample.length, 'N=', N, 'nativeLoaded=', !!native);

if (native && (typeof native.parseBatch === 'function' || typeof native.parse_batch === 'function')) {
  const parseBatch = native.parseBatch || native.parse_batch;
  const t0 = now();
  const out = parseBatch(inputs);
  const t1 = now();
  console.log('native.parseBatch: time=', (t1-t0), 'ms, out.length=', out.length);
} else {
  console.log('native parseBatch not available; skipping native run');
}

// measure JSON.parse path
{
  const t0 = now();
  const parsed = inputs.map(s => JSON.parse(s));
  const t1 = now();
  console.log('JSON.parse map: time=', (t1-t0), 'ms, parsed.length=', parsed.length);
}
