// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  classifyEmbeddingRuntimeV1,
  normalizeEmbeddingModelIdV1,
  probeOllamaEmbeddingRuntimeV1,
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
