import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rootFabricUrl = new URL('./contextual-prefill-fabric.ts', import.meta.url);
const packageFabricUrl = new URL('../../../packages/parent-atlas/src/core/contextual-prefill-fabric.ts', import.meta.url);
const rootRuntimeUrl = new URL('./prefill-cache-runtime.ts', import.meta.url);
const packageRuntimeUrl = new URL('../../../packages/parent-atlas/src/core/prefill-cache-runtime.ts', import.meta.url);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('root prefill helpers remain byte-identical to package sources', async () => {
  for (const [rootUrl, packageUrl] of [
    [rootFabricUrl, packageFabricUrl],
    [rootRuntimeUrl, packageRuntimeUrl],
  ]) {
    const [rootBytes, packageBytes] = await Promise.all([readFile(rootUrl), readFile(packageUrl)]);
    assert.equal(sha256(rootBytes), sha256(packageBytes));
    assert.deepEqual(rootBytes, packageBytes);
  }
});

test('package build imports both helpers and exposes deterministic prefill behavior', async () => {
  const fabricUrl = new URL('../../../packages/parent-atlas/dist/core/contextual-prefill-fabric.js', import.meta.url);
  const runtimeUrl = new URL('../../../packages/parent-atlas/dist/core/prefill-cache-runtime.js', import.meta.url);
  const [fabric, runtime] = await Promise.all([import(fabricUrl), import(runtimeUrl)]);

  assert.equal(typeof fabric.contextualFabricChecksum, 'function');
  assert.equal(typeof fabric.buildPrefillCacheEntry, 'function');
  assert.equal(typeof runtime.buildPrefillRuntimeIdentity, 'function');
  assert.equal(typeof runtime.verifyPrefillRecord, 'function');
  assert.equal(
    fabric.contextualFabricChecksum({ b: 2, a: 1 }),
    fabric.contextualFabricChecksum({ a: 1, b: 2 }),
  );
  assert.match(runtime.prefillValkeyStorageKey('a'.repeat(64)), /^atlas:prefill:v1:[a-f0-9]{64}$/);
});
