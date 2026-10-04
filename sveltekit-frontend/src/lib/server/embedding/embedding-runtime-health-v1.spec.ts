// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  bindProbeToModelReceiptV1,
  classifyEmbeddingRuntimeV1,
  normalizeEmbeddingModelIdV1,
  probeOllamaEmbeddingRuntimeV1,
  type EmbeddingModelReceiptV1,
  type EmbeddingRuntimeProbeV1,
} from './embedding-runtime-health-v1.js';

const REQUESTED = 'embeddinggemma:latest';
const NOW = '2026-10-04T00:00:00.000Z';
const probe = (over: Partial<EmbeddingRuntimeProbeV1> = {}): EmbeddingRuntimeProbeV1 => ({
  provider: 'ollama', reachable: true, modelAvailable: true, loadedModelIds: [],
  dimension: null, modelArtifactRevision: null, observedAt: NOW, ...over,
});

describe('classifyEmbeddingRuntimeV1', () => {
  it('provider down -> unreachable and not loaded', () => {
    const h = classifyEmbeddingRuntimeV1(REQUESTED, probe({ reachable: false }));
    expect(h).toMatchObject({ status: 'BACKEND_UNREACHABLE', backendReachable: false, modelLoaded: false, loadedModelId: null });
  });

  it('provider up + /api/ps empty -> reachable but NOT loaded (reachable != loaded)', () => {
    const h = classifyEmbeddingRuntimeV1(REQUESTED, probe());
    expect(h).toMatchObject({ status: 'MODEL_UNLOADED', backendReachable: true, modelLoaded: false });
  });

  it('provider up + a different model resident -> WRONG_MODEL_LOADED, never ready', () => {
    const h = classifyEmbeddingRuntimeV1(REQUESTED, probe({ loadedModelIds: ['nomic-embed-text:latest'] }));
    expect(h).toMatchObject({ status: 'WRONG_MODEL_LOADED', modelLoaded: false, loadedModelId: 'nomic-embed-text:latest' });
  });

  it('requested model resident with 768 dims and a bound artifact revision -> MODEL_READY', () => {
    const h = classifyEmbeddingRuntimeV1(REQUESTED, probe({
      loadedModelIds: ['embeddinggemma:latest'], dimension: 768, modelArtifactRevision: 'sha256:bc843658',
    }));
    expect(h).toMatchObject({ status: 'MODEL_READY', modelLoaded: true, loadedModelId: 'embeddinggemma:latest', canonicalAuthority: false });
    expect(h.reasons).toEqual([]);
  });

  it('requested model resident but no dimension/revision bound -> MODEL_IDENTITY_UNPROVEN', () => {
    const h = classifyEmbeddingRuntimeV1(REQUESTED, probe({ loadedModelIds: ['embeddinggemma:latest'] }));
    expect(h.status).toBe('MODEL_IDENTITY_UNPROVEN');
    expect(h.modelLoaded).toBe(true);
    expect(h.reasons.join(' ')).toMatch(/dimension/);
    expect(h.reasons.join(' ')).toMatch(/artifact revision/);
  });

  it('a wrong dimension is never ready', () => {
    const h = classifyEmbeddingRuntimeV1(REQUESTED, probe({
      loadedModelIds: ['embeddinggemma'], dimension: 512, modelArtifactRevision: 'sha256:x',
    }));
    expect(h.status).toBe('MODEL_IDENTITY_UNPROVEN');
  });

  it('model not installed -> MODEL_UNAVAILABLE', () => {
    const h = classifyEmbeddingRuntimeV1(REQUESTED, probe({ modelAvailable: false }));
    expect(h.status).toBe('MODEL_UNAVAILABLE');
  });

  it('cpu backend with no reported identity -> provider cpu, residency NOT inferred from Ollama', () => {
    const h = classifyEmbeddingRuntimeV1(REQUESTED, probe({ provider: 'cpu', loadedModelIds: [] }));
    expect(h).toMatchObject({ provider: 'cpu', status: 'MODEL_IDENTITY_UNPROVEN', modelLoaded: false });
  });

  it('model ids compare without the :latest suffix and case', () => {
    expect(normalizeEmbeddingModelIdV1('EmbeddingGemma:latest')).toBe('embeddinggemma');
    const h = classifyEmbeddingRuntimeV1('embeddinggemma', probe({
      loadedModelIds: ['EmbeddingGemma:latest'], dimension: 768, modelArtifactRevision: 'sha256:x',
    }));
    expect(h.status).toBe('MODEL_READY');
  });
});

describe('probeOllamaEmbeddingRuntimeV1 (read-only, no embedding request)', () => {
  const mk = (map: Record<string, unknown | null>) => async (url: string) => {
    const key = Object.keys(map).find((k) => url.endsWith(k));
    const body = key ? map[key] : null;
    if (body === null || body === undefined) throw new Error('connect ECONNREFUSED');
    return { ok: true, json: async () => body };
  };

  it('Ollama down -> unreachable', async () => {
    const p = await probeOllamaEmbeddingRuntimeV1({ baseUrl: 'http://x', requestedModelId: REQUESTED, fetchImpl: mk({}), now: () => NOW });
    expect(p.reachable).toBe(false);
    expect(classifyEmbeddingRuntimeV1(REQUESTED, p).status).toBe('BACKEND_UNREACHABLE');
  });

  it('installed but nothing resident -> MODEL_UNLOADED', async () => {
    const p = await probeOllamaEmbeddingRuntimeV1({
      baseUrl: 'http://x', requestedModelId: REQUESTED, now: () => NOW,
      fetchImpl: mk({ '/api/tags': { models: [{ name: 'embeddinggemma:latest' }] }, '/api/ps': { models: [] } }),
    });
    expect(p).toMatchObject({ reachable: true, modelAvailable: true, loadedModelIds: [] });
    expect(classifyEmbeddingRuntimeV1(REQUESTED, p).status).toBe('MODEL_UNLOADED');
  });

  it('another model resident -> WRONG_MODEL_LOADED', async () => {
    const p = await probeOllamaEmbeddingRuntimeV1({
      baseUrl: 'http://x', requestedModelId: REQUESTED, now: () => NOW,
      fetchImpl: mk({ '/api/tags': { models: [{ name: 'embeddinggemma:latest' }] }, '/api/ps': { models: [{ name: 'nomic-embed-text:latest' }] } }),
    });
    expect(classifyEmbeddingRuntimeV1(REQUESTED, p).status).toBe('WRONG_MODEL_LOADED');
  });

  it('requested model resident -> loaded but identity UNPROVEN until a receipt binds dimension and revision', async () => {
    const p = await probeOllamaEmbeddingRuntimeV1({
      baseUrl: 'http://x', requestedModelId: REQUESTED, now: () => NOW,
      fetchImpl: mk({ '/api/tags': { models: [{ name: 'embeddinggemma:latest' }] }, '/api/ps': { models: [{ name: 'embeddinggemma:latest' }] } }),
    });
    expect(classifyEmbeddingRuntimeV1(REQUESTED, p)).toMatchObject({ status: 'MODEL_IDENTITY_UNPROVEN', modelLoaded: true });
    const bound = { ...p, dimension: 768, modelArtifactRevision: 'sha256:bc843658' };
    expect(classifyEmbeddingRuntimeV1(REQUESTED, bound).status).toBe('MODEL_READY');
  });

  it('the probe only issues GETs to /api/tags and /api/ps', async () => {
    const urls: string[] = [];
    await probeOllamaEmbeddingRuntimeV1({
      baseUrl: 'http://x/', requestedModelId: REQUESTED, now: () => NOW,
      fetchImpl: async (url, init) => { urls.push(url); expect(init && 'method' in init).toBeFalsy(); return { ok: true, json: async () => ({ models: [] }) }; },
    });
    expect(urls.sort()).toEqual(['http://x/api/ps', 'http://x/api/tags']);
  });
});

describe('bindProbeToModelReceiptV1 (EMBED-RUNTIME-READBACK-01 step 2)', () => {
  const GGUF = 'bc843658e96d2e9cc7c3402332b158f0cc4f73e61b23cef9a41acee1c0d372b7';
  const OLLAMA_BLOB = '0800cbac9c2064dde519420e75e512a83cb360de3ad5df176185dc69652fc515';
  const receipt = (over: Partial<EmbeddingModelReceiptV1> = {}): EmbeddingModelReceiptV1 => ({
    schema: 'atlas.emb-prov-01-embedding-provenance-receipt.v1',
    generatedAt: '2026-10-03T22:34:29.809Z',
    status: 'EMB_PROV_01_PROVEN',
    artifact: { liveArtifactSha256: GGUF, recordedModelArtifactRevision: GGUF, artifactChecksumMatchesRevision: true },
    runtimeLoadedArtifact: { loadedMatchesArtifact: true },
    crossExecutorParity: { executorsAgree: true, parity: { dim: 768 } },
    provenanceFields: { serverModelAlias: 'embeddinggemma' },
    ...over,
  });
  const now = new Date('2026-10-04T00:00:00.000Z');
  const resident = (provider: 'ollama' | 'llama-server' | 'cpu') => probe({ provider, loadedModelIds: ['embeddinggemma'] });

  it('llama-server lane + proven fresh receipt -> bound, and a resident model reaches MODEL_READY', () => {
    const b = bindProbeToModelReceiptV1(resident('llama-server'), receipt(), { now });
    expect(b.bound).toBe(true);
    expect(b.probe).toMatchObject({ dimension: 768, modelArtifactRevision: GGUF });
    expect(classifyEmbeddingRuntimeV1(REQUESTED, b.probe).status).toBe('MODEL_READY');
  });

  it('ollama with no observed blob hash -> NOT bound: parity is not identity', () => {
    const b = bindProbeToModelReceiptV1(resident('ollama'), receipt(), { now });
    expect(b.bound).toBe(false);
    expect(b.reasons.join(' ')).toMatch(/parity does not prove identity/);
    expect(classifyEmbeddingRuntimeV1(REQUESTED, b.probe).status).toBe('MODEL_IDENTITY_UNPROVEN');
  });

  it('the real Ollama blob is a different file from the receipt GGUF -> NOT bound, both hashes named', () => {
    const b = bindProbeToModelReceiptV1(resident('ollama'), receipt(), { now, observedArtifactSha256: `sha256-${OLLAMA_BLOB}` });
    expect(b.bound).toBe(false);
    expect(b.reasons.join(' ')).toContain('0800cbac9c2');
    expect(b.reasons.join(' ')).toContain('bc843658e96');
    expect(classifyEmbeddingRuntimeV1(REQUESTED, b.probe).status).toBe('MODEL_IDENTITY_UNPROVEN');
  });

  it('ollama whose blob equals the receipt artifact -> bound and ready', () => {
    const b = bindProbeToModelReceiptV1(resident('ollama'), receipt(), { now, observedArtifactSha256: GGUF.toUpperCase() });
    expect(b.bound).toBe(true);
    expect(classifyEmbeddingRuntimeV1(REQUESTED, b.probe).status).toBe('MODEL_READY');
  });

  it('a stale, unproven or inconsistent receipt binds nothing', () => {
    expect(bindProbeToModelReceiptV1(resident('llama-server'), receipt({ generatedAt: '2026-09-01T00:00:00Z' }), { now }).bound).toBe(false);
    expect(bindProbeToModelReceiptV1(resident('llama-server'), receipt({ status: 'EMB_PROV_01_UNPROVEN' }), { now }).bound).toBe(false);
    expect(bindProbeToModelReceiptV1(resident('llama-server'), receipt({ artifact: { liveArtifactSha256: GGUF, recordedModelArtifactRevision: OLLAMA_BLOB, artifactChecksumMatchesRevision: true } }), { now }).bound).toBe(false);
    expect(bindProbeToModelReceiptV1(resident('llama-server'), receipt({ runtimeLoadedArtifact: { loadedMatchesArtifact: false } }), { now }).bound).toBe(false);
  });

  it('the cpu backend is never bound from this receipt', () => {
    const b = bindProbeToModelReceiptV1(resident('cpu'), receipt(), { now });
    expect(b.bound).toBe(false);
    expect(b.reasons.join(' ')).toMatch(/cpu backend/);
  });
});
