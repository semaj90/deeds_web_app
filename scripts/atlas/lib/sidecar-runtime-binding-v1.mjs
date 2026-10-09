export function verifySidecarRuntimeBindingV1({ health, expectedModuleDigests }) {
  const requiredModuleIds = ['miniforge_nlp_sidecar_v2', 'miniforge_nlp_sidecar'];
  const modules = health?.runtimeSourceBindings?.modules;
  const adapter = health?.runtimeSourceBindings?.groundedExtractionAdapter;
  if (!modules || !adapter || !expectedModuleDigests) {
    return { status: 'SIDECAR_RUNTIME_BINDING_UNAVAILABLE' };
  }
  if (requiredModuleIds.some((moduleId) => !(moduleId in expectedModuleDigests))) {
    return { status: 'EXPECTED_RUNTIME_MODULES_INCOMPLETE' };
  }

  for (const moduleId of requiredModuleIds) {
    const expectedDigest = expectedModuleDigests[moduleId];
    if (typeof expectedDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(expectedDigest)) {
      return { status: 'EXPECTED_RUNTIME_DIGEST_INVALID', moduleId };
    }
    if (modules[moduleId] !== expectedDigest) {
      return {
        status: modules[moduleId] ? 'SIDECAR_RUNTIME_SOURCE_MISMATCH' : 'SIDECAR_RUNTIME_MODULE_UNAVAILABLE',
        moduleId,
        expectedDigest,
        observedDigest: modules[moduleId] ?? null,
      };
    }
  }

  if (adapter.acceptsSpanDiagnostics !== true || adapter.acceptsExecutionReceipt !== true) {
    return { status: 'SIDECAR_GROUNDED_ADAPTER_INCOMPATIBLE' };
  }

  return { status: 'RUNTIME_BINDING_MATCH' };
}
