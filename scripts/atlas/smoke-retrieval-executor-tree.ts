import assert from 'node:assert/strict';
import {
  APP_SIDE_CAR_EXECUTOR_TREE,
  getAppSideCarExecutorTreeStatus,
} from '../../sveltekit-frontend/src/lib/server/retrieval/executor-tree.js';
import {
  getAtlasRuntimeRegistrySection,
  getAtlasRuntimeRegistrySnapshot,
} from '../../sveltekit-frontend/src/lib/server/atlas/runtime-registry.js';

const treeStatus = getAppSideCarExecutorTreeStatus();
const registry = getAtlasRuntimeRegistrySnapshot();
const worker = getAtlasRuntimeRegistrySection('worker');

assert.equal(registry.version, 'atlas-runtime-registry-v1');
assert.ok(worker);
assert.ok(worker?.items.some((item) => item.key === 'retrieval-executor-tree'));
assert.equal(APP_SIDE_CAR_EXECUTOR_TREE.crossEncoder.exportName, 'rerankWithCrossEncoder');
assert.equal(treeStatus.crossEncoder.present, true);
assert.equal(treeStatus.langExtract.present, true);
assert.equal(treeStatus.trace.present, true);

console.log(JSON.stringify({
  status: 'PASS',
  registryVersion: registry.version,
  workerItems: worker?.items.map((item) => item.key),
  tree: APP_SIDE_CAR_EXECUTOR_TREE,
  treeStatus,
}, null, 2));
