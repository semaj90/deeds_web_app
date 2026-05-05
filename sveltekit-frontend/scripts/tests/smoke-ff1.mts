#!/usr/bin/env node
// FF1 smoke test — run with: npx tsx scripts/tests/smoke-ff1.mts
import { computeRegistry } from '../src/lib/server/ff1/registry.ts';
import { ff1Capabilities } from '../src/lib/server/ff1/planner.ts';

console.log('\n=== FF1 Compute Registry Smoke Test ===\n');

// 1. Registry presence
const keys = Object.keys(computeRegistry);
console.log(`Registry: ${keys.length} functions registered`);
if (keys.length < 8) {
  console.error('FAIL: expected ≥8 functions');
  process.exit(1);
}

// 2. All required functions present
const required = [
  'embedding.cosine',
  'embedding.batchCosine',
  'embedding.kmeans',
  'jsonb.fastParse',
  'jsonb.schemaMap',
  'graph.pagerank',
  'graph.somBmu',
  'ast.gateScore',
];
const missing = required.filter(k => !(k in computeRegistry));
if (missing.length > 0) {
  console.error('FAIL: missing functions:', missing.join(', '));
  process.exit(1);
}
console.log(`Required functions: all ${required.length} present ✓`);

// 3. Capabilities output
const caps = ff1Capabilities();
console.log(`\nCapabilities (${caps.length}):\n`);
for (const c of caps) {
  const icon = c.tier === 'GPU/cuBLAS' ? '🔴' : c.tier === 'WASM-SIMD' ? '🟡' : '⚪';
  const cache = c.cached ? '💾 cached' : '       ';
  console.log(`  ${icon} ${c.name.padEnd(28)} ${c.tier.padEnd(14)} ${cache}`);
}

// 4. JS fallback cosine similarity
console.log('\nJS fallback cosine similarity test:');
// Import the planner to test JS path (no GPU needed)
const { ff1 } = await import('../src/lib/server/ff1/planner.ts');
const a = new Float32Array([1, 0, 0]);
const b = new Float32Array([1, 0, 0]);
const c_same = await ff1('embedding.cosine', Array.from(a), Array.from(b));
const c_ortho = await ff1('embedding.cosine', [1,0,0], [0,1,0]);

console.log(`  cosine([1,0,0], [1,0,0]) = ${c_same}  (expected 1.0)`);
console.log(`  cosine([1,0,0], [0,1,0]) = ${c_ortho}  (expected 0.0)`);

if (Math.abs((c_same as number) - 1.0) > 0.001) { console.error('FAIL: same-vector cosine should be 1.0'); process.exit(1); }
if (Math.abs((c_ortho as number) - 0.0) > 0.001) { console.error('FAIL: orthogonal cosine should be 0.0'); process.exit(1); }
console.log('  Cosine fallback: ✓\n');

// 5. TurboQuant health check
const base = process.env.GEMMA_BASE ?? 'http://localhost:8090';
process.stdout.write(`TurboQuant health (${base}): `);
try {
  const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
  if (r.ok) {
    console.log('✓ reachable — analyze-graph-ai.mjs will work');
  } else {
    console.log(`⚠  HTTP ${r.status} — start TurboQuant to use analyze:graph:ai`);
  }
} catch {
  console.log('⚠  not reachable — start TurboQuant to use analyze:graph:ai');
}

console.log('\n=== FF1 smoke PASSED ===\n');
