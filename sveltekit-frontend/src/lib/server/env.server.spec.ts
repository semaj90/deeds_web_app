import { afterEach, describe, expect, it, vi } from 'vitest';

describe('TURBOVEC_HEALTH_URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('prefers the explicit health URL and trims whitespace', async () => {
    vi.stubEnv('TURBOVEC_HEALTH_URL', ' http://health.test ');
    vi.stubEnv('TURBOVEC_SIDECAR', 'http://sidecar.test');

    const { ENV } = await import('./env.server.js');

    expect(ENV.TURBOVEC_HEALTH_URL).toBe('http://health.test');
  });

  it('falls back to the configured TurboVec sidecar URL', async () => {
    vi.stubEnv('TURBOVEC_HEALTH_URL', ' ');
    vi.stubEnv('TURBOVEC_SIDECAR', 'http://sidecar.test');

    const { ENV } = await import('./env.server.js');

    expect(ENV.TURBOVEC_HEALTH_URL).toBe('http://sidecar.test');
  });

  it('uses the existing local TurboVec default when neither URL is configured', async () => {
    vi.stubEnv('TURBOVEC_HEALTH_URL', '');
    vi.stubEnv('TURBOVEC_SIDECAR', '');

    const { ENV } = await import('./env.server.js');

    expect(ENV.TURBOVEC_HEALTH_URL).toBe('http://127.0.0.1:8791');
  });
});
