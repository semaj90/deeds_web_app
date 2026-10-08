/** Runtime readiness is distinct from asset existence. No automatic calls to ACP/A2A. */
export interface RuntimeReadiness {
  status: 'LOADED' | 'NOT_LOADED' | 'UNKNOWN';
  runtimeId: string;
  expectedModelId: string;
  observedModelId?: string;
  reason: string;
}
export function evaluateRuntimeReadiness(params: {
  runtimeId: string; expectedModelId: string;
  engineStatus: 'ready' | 'loading' | 'idle' | 'generating' | 'failed' | 'disposed';
  loadedModelId?: string;
}): RuntimeReadiness {
  const { runtimeId, expectedModelId, engineStatus, loadedModelId } = params;
  if (!runtimeId.trim() || !expectedModelId.trim()) {
    throw new Error('runtime and model identities are mandatory');
  }
  if ((engineStatus === 'ready' || engineStatus === 'generating') && loadedModelId === expectedModelId) {
    return { status: 'LOADED', runtimeId, expectedModelId, observedModelId: loadedModelId, reason: 'Engine reports ready with matching model identity; inference is not yet proven' };
  }
  if ((engineStatus === 'ready' || engineStatus === 'generating') && loadedModelId !== expectedModelId) {
    return { status: 'NOT_LOADED', runtimeId, expectedModelId, observedModelId: loadedModelId, reason: 'Active model identity does not match requested model' };
  }
  if (engineStatus === 'loading') {
    return { status: 'UNKNOWN', runtimeId, expectedModelId, observedModelId: loadedModelId, reason: 'Model load is in progress' };
  }
  return { status: 'NOT_LOADED', runtimeId, expectedModelId, observedModelId: loadedModelId, reason: 'Engine state: ' + engineStatus };
}
// TODO(P23-EDGE): bind observed loadedModelId to actual Web runtime reports;
// do not use a hardcoded identity or an asset URL as proof of load.
