import type { BackendName } from './model-loader.js';
import type { InferenceRuntimeConfig } from './inference-configs.js';

export function canUseTurboQuant(runtime: InferenceRuntimeConfig): boolean {
  return runtime.runtimeAvailable === true && runtime.turboQuant === true;
}

export function gatePreferredBackend(
  preferredBackend: BackendName | undefined,
  runtime: InferenceRuntimeConfig,
): BackendName {
  if (preferredBackend === 'turboquant' && !canUseTurboQuant(runtime)) {
    return 'bifrost';
  }

  if (preferredBackend) {
    return preferredBackend;
  }

  return canUseTurboQuant(runtime) ? 'turboquant' : 'bifrost';
}
