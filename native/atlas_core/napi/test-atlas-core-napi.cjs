const assert = require('node:assert/strict');
const addon = require(process.argv[2]);

async function main() {
  const backendInfo = addon.getBackendInfo();
  assert.equal(backendInfo.per_export_backend.atlasPageRank.backend, 'cpu_reference');
  assert.equal(backendInfo.per_export_backend.atlasPageRank.execution_observed, false);
  const offsets = new BigUint64Array([0n, 1n, 2n, 2n]);
  const columns = new Uint32Array([1, 2]);
  const weights = new Float32Array([1, 1]);
  const result = await addon.atlasPageRank(offsets, columns, weights, 0.85, 1e-10, 100);
  assert(result.scores instanceof Float64Array);
  assert.equal(result.scores.length, 3);
  assert.equal(result.backend, 'cpu');
  assert(result.iterations > 0);
  assert(Math.abs(result.scores.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);

  const offsetsA = new BigUint64Array([0n, 1n, 2n, 2n]);
  const columnsA = new Uint32Array([1, 2]);
  const weightsA = new Float32Array([1, 1]);
  const pendingA = addon.atlasPageRank(offsetsA, columnsA, weightsA, 0.85, 1e-10, 100);
  const pendingB = addon.atlasPageRank(
    new BigUint64Array([0n, 1n, 2n, 2n]),
    new Uint32Array([1, 2]),
    new Float32Array([1, 1]),
    0.85,
    1e-10,
    100,
  );
  assert(pendingA instanceof Promise);
  assert(pendingB instanceof Promise);
  offsetsA.fill(0n);
  columnsA.fill(0);
  weightsA.fill(0);
  assert.throws(
    () => addon.atlasPageRank(offsets, columns, weights, 0.85, 1e-10, 100),
    (error) => error.code === 'ATLAS_QUEUE_FULL',
  );
  const [resultA, resultB] = await Promise.all([pendingA, pendingB]);
  assert.deepEqual(Array.from(resultA.scores), Array.from(result.scores));
  assert.deepEqual(Array.from(resultB.scores), Array.from(result.scores));
  const afterDrain = await addon.atlasPageRank(offsets, columns, weights, 0.85, 1e-10, 100);
  assert.deepEqual(Array.from(afterDrain.scores), Array.from(result.scores));

  assert.throws(() => addon.atlasPageRank(new Uint32Array([0, 1]), columns, weights, 0.85, 1e-10, 100),
    /BigUint64Array/);
  await assert.rejects(addon.atlasPageRank(new BigUint64Array([1n, 2n]), columns, weights, 0.85, 1e-10, 100));
  process.stdout.write('atlas_core_napi: runtime fixture passed (CPU backend, execution unobserved by legacy counters)\n');
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
