import { describe, it, expect } from 'vitest';
import { evaluateRuntimeReadiness } from './phase23-runtime-readiness.js';
const base = { runtimeId: 'browser-litert', expectedModelId: 'gemma4-e2b' };
describe('Phase23 runtime readiness identity', () => {
  it('only admits matching ready runtime identity', () => {
    expect(evaluateRuntimeReadiness({ ...base, engineStatus: 'ready', loadedModelId: 'gemma4-e2b' }).status).toBe('LOADED');
  });
  it('rejects stale or mismatched model', () => {
    expect(evaluateRuntimeReadiness({ ...base, engineStatus: 'ready', loadedModelId: 'gemma3' }).status).toBe('NOT_LOADED');
  });
  it('does not claim loaded during asynchronous loading', () => {
    expect(evaluateRuntimeReadiness({ ...base, engineStatus: 'loading' }).status).toBe('UNKNOWN');
  });
  it('does not infer loaded from a present file', () => {
    expect(evaluateRuntimeReadiness({ ...base, engineStatus: 'idle' }).status).toBe('NOT_LOADED');
  });
});
