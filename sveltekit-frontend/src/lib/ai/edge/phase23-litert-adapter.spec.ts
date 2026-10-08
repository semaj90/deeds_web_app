import { describe, expect, it, vi } from 'vitest';
import { makeLitertEngine } from './phase23-litert-adapter.js';
const bridge = { runtimeVersion: '0.17.1', load: vi.fn(async () => undefined), generate: vi.fn(async () => ({ text: 'ok', tokenCount: 1 })), dispose: vi.fn(async () => undefined) };
describe('EDGE-06 runtime pin admission', () => {
  it('blocks unpinned model/runtime', () => {
    expect(() => makeLitertEngine(bridge, { modelUrl: '/m.litertlm', pinnedRuntimeVersion: 'UNPINNED', pinnedModelRevision: 'a' })).toThrow(/pinned/);
  });
  it('blocks mismatched JS runtime versions', () => {
    expect(() => makeLitertEngine(bridge, { modelUrl: '/m.litertlm', pinnedRuntimeVersion: '0.18.0', pinnedModelRevision: 'sha256:x' })).toThrow(/mismatch/);
  });
});
