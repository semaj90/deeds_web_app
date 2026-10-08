import { describe, expect, it, vi } from 'vitest';
import { EdgeModelHarness, type EdgeEngine, type EdgeModelIdentity } from './phase23-edge-model-harness.js';

const identity: EdgeModelIdentity = {
  modelId: 'gemma4-e2b-experimental', modelRevision: 'sha256:test',
  tokenizerDigest: 'sha256:tok', runtimeId: 'mock-browser',
  runtimeRevision: 'unit-v1',
};
function makeEngine(): EdgeEngine {
  return {
    load: vi.fn(async () => undefined),
    generate: vi.fn(async () => ({ text: 'ACTION: grounded', tokenCount: 4 })),
    dispose: vi.fn(async () => undefined),
  };
}
describe('Phase23 experimental browser lifecycle', () => {
  it('requires all model identity fields', () => {
    expect(() => new EdgeModelHarness(makeEngine(), { ...identity, tokenizerDigest: '' })).toThrow(/missing model identity/);
  });
  it('does not generate before load or after disposal', async () => {
    const h = new EdgeModelHarness(makeEngine(), identity);
    await expect(h.generate('hello')).rejects.toThrow(/invalid generate state/);
    await h.load();
    expect((await h.generate('hello')).status).toBe('PASS');
    await h.dispose();
    await expect(h.generate('hello')).rejects.toThrow(/invalid generate state/);
  });
  it('rejects empty output instead of claiming successful LLM inference', async () => {
    const engine = makeEngine();
    engine.generate = async () => ({ text: '', tokenCount: 0 });
    const h = new EdgeModelHarness(engine, identity);
    await h.load();
    const receipt = await h.generate('extract');
    expect(receipt.status).toBe('FAIL');
    expect(receipt.error).toMatch(/verifiable generated tokens/);
    expect(h.status).toBe('ready');
  });
  it('fails load cleanly and requires explicit retry owner', async () => {
    const engine = makeEngine();
    engine.load = async () => { throw new Error('backend unavailable'); };
    const h = new EdgeModelHarness(engine, identity);
    await expect(h.load()).rejects.toThrow('backend unavailable');
    expect(h.status).toBe('failed');
    await expect(h.load()).rejects.toThrow(/invalid load state/);
  });
  it('supports cancellation with abort-aware backend', async () => {
    const engine = makeEngine();
    engine.generate = async (_p, signal) => {
      await new Promise<void>((resolve, reject) => {
        signal.addEventListener('abort', () => { reject(new Error('aborted')); }, { once: true });
      });
      return { text: 'should not appear', tokenCount: 1 };
    };
    const h = new EdgeModelHarness(engine, identity);
    await h.load();
    const pending = h.generate('slow');
    h.cancel();
    expect((await pending).status).toBe('FAIL');
    await h.dispose();
    expect(h.status).toBe('disposed');
  });
});
