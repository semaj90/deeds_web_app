import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySidecarRuntimeBindingV1 } from './sidecar-runtime-binding-v1.mjs';

const digest = `sha256:${'a'.repeat(64)}`;
const expectedModuleDigests = {
  miniforge_nlp_sidecar_v2: digest,
  miniforge_nlp_sidecar: digest,
};
const healthy = {
  runtimeSourceBindings: {
    modules: { ...expectedModuleDigests },
    groundedExtractionAdapter: {
      acceptsSpanDiagnostics: true,
      acceptsExecutionReceipt: true,
    },
  },
};

test('accepts exact loaded module digests and the receipt-aware adapter signature', () => {
  assert.equal(
    verifySidecarRuntimeBindingV1({ health: healthy, expectedModuleDigests }).status,
    'RUNTIME_BINDING_MATCH',
  );
});

test('fails closed when the runtime binding is absent', () => {
  assert.equal(
    verifySidecarRuntimeBindingV1({ health: {}, expectedModuleDigests }).status,
    'SIDECAR_RUNTIME_BINDING_UNAVAILABLE',
  );
});

test('rejects a stale loaded module digest', () => {
  const health = structuredClone(healthy);
  health.runtimeSourceBindings.modules.miniforge_nlp_sidecar_v2 = `sha256:${'b'.repeat(64)}`;
  const result = verifySidecarRuntimeBindingV1({ health, expectedModuleDigests });
  assert.equal(result.status, 'SIDECAR_RUNTIME_SOURCE_MISMATCH');
  assert.equal(result.moduleId, 'miniforge_nlp_sidecar_v2');
});

test('rejects a loaded adapter missing receipt parameters', () => {
  const health = structuredClone(healthy);
  health.runtimeSourceBindings.groundedExtractionAdapter.acceptsSpanDiagnostics = false;
  assert.equal(
    verifySidecarRuntimeBindingV1({ health, expectedModuleDigests }).status,
    'SIDECAR_GROUNDED_ADAPTER_INCOMPATIBLE',
  );
});

test('rejects expected digest maps that omit a required module', () => {
  assert.equal(
    verifySidecarRuntimeBindingV1({
      health: healthy,
      expectedModuleDigests: { miniforge_nlp_sidecar_v2: digest },
    }).status,
    'EXPECTED_RUNTIME_MODULES_INCOMPLETE',
  );
});

test('rejects the second loaded module being stale even when the first matches', () => {
  const health = structuredClone(healthy);
  health.runtimeSourceBindings.modules.miniforge_nlp_sidecar = `sha256:${'c'.repeat(64)}`;
  const result = verifySidecarRuntimeBindingV1({ health, expectedModuleDigests });
  assert.equal(result.status, 'SIDECAR_RUNTIME_SOURCE_MISMATCH');
  assert.equal(result.moduleId, 'miniforge_nlp_sidecar');
});

test('rejects missing loaded module without assuming compatibility', () => {
  const health = structuredClone(healthy);
  delete health.runtimeSourceBindings.modules.miniforge_nlp_sidecar;
  const result = verifySidecarRuntimeBindingV1({ health, expectedModuleDigests });
  assert.equal(result.status, 'SIDECAR_RUNTIME_MODULE_UNAVAILABLE');
  assert.equal(result.observedDigest, null);
});

test('rejects malformed expected digest and does not call extraction', () => {
  const result = verifySidecarRuntimeBindingV1({
    health: healthy,
    expectedModuleDigests: { ...expectedModuleDigests, miniforge_nlp_sidecar: 'not-a-sha256' },
  });
  assert.equal(result.status, 'EXPECTED_RUNTIME_DIGEST_INVALID');
});

test('rejects an adapter without execution-receipt support', () => {
  const health = structuredClone(healthy);
  health.runtimeSourceBindings.groundedExtractionAdapter.acceptsExecutionReceipt = false;
  assert.equal(
    verifySidecarRuntimeBindingV1({ health, expectedModuleDigests }).status,
    'SIDECAR_GROUNDED_ADAPTER_INCOMPATIBLE',
  );
});
