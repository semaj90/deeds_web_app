import { describe, expect, it } from 'vitest';
import {
  buildOrnithCacheCapabilityV1,
  probeOrnithCacheCapabilityV1,
} from './ornith-cache-capability-v1.js';

const baseInput = () => ({
  capabilityRevision: 'ornith-cache-capability:r1',
  runtimeRevision: 'llama-server:r1',
  modelRevision: 'ornith:r1',
  modelSha256: null,
  checkedAt: '2026-09-07T20:00:00.000Z',
  probeMode: 'UNPROVEN' as const,
  capabilities: {
    promptCacheSupported: 'UNPROVEN' as const,
    cacheReuseKvShiftSupported: 'UNPROVEN' as const,
    recurrentCheckpointSupported: 'UNPROVEN' as const,
    hostRamPromptCacheSupported: 'UNPROVEN' as const,
    idleSlotCacheSupported: 'UNPROVEN' as const,
    slotPersistenceSupported: 'UNPROVEN' as const,
  },
  observedSettings: {
    cachePrompt: null,
    cacheReuseMinChunk: null,
    checkpointCount: null,
    checkpointMinStep: null,
    cacheRamMiB: null,
    cacheIdleSlots: null,
    slotPersistenceConfigured: null,
  },
  evidenceRefs: ['report:ornith-cache-capability-fixture'],
});

describe('OrnithCacheCapabilityV1', () => {
  it('builds a deterministic capability report without treating configuration as proof', () => {
    const first = buildOrnithCacheCapabilityV1(baseInput());
    const second = buildOrnithCacheCapabilityV1(baseInput());

    expect(first).toEqual(second);
    expect(first.probeMode).toBe('UNPROVEN');
    expect(first.capabilities.promptCacheSupported).toBe('UNPROVEN');
    expect(first.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes identity when a capability observation changes', () => {
    const first = buildOrnithCacheCapabilityV1(baseInput());
    const second = buildOrnithCacheCapabilityV1({
      ...baseInput(),
      capabilities: {
        ...baseInput().capabilities,
        promptCacheSupported: 'PROVEN_TRUE',
      },
      probeMode: 'LIVE_READ_ONLY',
    });

    expect(second.checksumSha256).not.toBe(first.checksumSha256);
  });

  it('rejects non-integral cache reuse settings', () => {
    expect(() => buildOrnithCacheCapabilityV1({
      ...baseInput(),
      observedSettings: {
        ...baseInput().observedSettings,
        cacheReuseMinChunk: 1.5,
      },
    })).toThrow();
  });

  it('probes only read-only metadata and keeps behavior capabilities unproven', async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/health')) return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      if (url.endsWith('/props')) {
        return new Response(JSON.stringify({
          build_info: 'b20260907-abc123',
          default_generation_settings: {
            params: {
              cache_prompt: true,
              cache_reuse: 256,
              ctx_checkpoints: 32,
              checkpoint_min_step: 8192,
              cache_ram_mib: 8192,
              cache_idle_slots: true,
              slot_persistence: false,
            },
          },
        }), { status: 200 });
      }
      if (url.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'ornith-1.5-9b' }] }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    };

    const result = await probeOrnithCacheCapabilityV1({
      baseUrl: 'http://127.0.0.1:8090/',
      configuredModel: 'ornith-1.5-9b',
      fetcher,
      now: () => '2026-09-07T20:00:00.000Z',
    });

    expect(result.status).toBe('PROVEN_RUNTIME');
    if (result.status !== 'PROVEN_RUNTIME') throw new Error('expected a runtime report');
    expect(result.resolvedModel).toBe('ornith-1.5-9b');
    expect(result.report.runtimeRevision).toBe('b20260907-abc123');
    expect(result.report.observedSettings).toEqual({
      cachePrompt: true,
      cacheReuseMinChunk: 256,
      checkpointCount: 32,
      checkpointMinStep: 8192,
      cacheRamMiB: 8192,
      cacheIdleSlots: true,
      slotPersistenceConfigured: false,
    });
    expect(result.report.capabilities.promptCacheSupported).toBe('UNPROVEN');
    expect(calls).toEqual([
      'http://127.0.0.1:8090/health',
      'http://127.0.0.1:8090/props',
      'http://127.0.0.1:8090/v1/models',
    ]);
  });

  it('fails closed without a runtime report when llama-server is unavailable', async () => {
    const fetcher: typeof fetch = async () => {
      throw new Error('connection refused');
    };

    const result = await probeOrnithCacheCapabilityV1({
      baseUrl: 'http://127.0.0.1:8090',
      fetcher,
    });

    expect(result).toEqual({
      status: 'UNAVAILABLE',
      report: null,
      reason: 'http://127.0.0.1:8090/health: connection refused',
    });
  });

  it('does not fabricate a runtime revision when /props omits build_info', async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/health')) return new Response('{}', { status: 200 });
      if (url.endsWith('/props')) return new Response(JSON.stringify({}), { status: 200 });
      return new Response(JSON.stringify({ data: [{ id: 'ornith-1.5-9b' }] }), { status: 200 });
    };

    const result = await probeOrnithCacheCapabilityV1({
      baseUrl: 'http://127.0.0.1:8090',
      fetcher,
    });

    expect(result.status).toBe('UNPROVEN');
    expect(result.report).toBeNull();
    expect(result.reason).toContain('build_info');
  });
});
