import { describe, expect, it, vi } from 'vitest';
import { probeFirecrawlVersionV1 } from './optional-firecrawl-provider.js';

describe('probeFirecrawlVersionV1', () => {
  it('reports UNAVAILABLE with no client package and no service URL', async () => {
    const probe = await probeFirecrawlVersionV1({ readClientPackageVersion: () => null });
    expect(probe.overall).toBe('UNAVAILABLE');
    expect(probe.clientPackage).toEqual({ status: 'NOT_INSTALLED', reason: 'PACKAGE_NOT_RESOLVABLE' });
    expect(probe.serviceHttpStatus).toBeNull();
    expect(probe.serviceVersionClaimed).toBe(false);
    expect(probe.writesPerformed).toBe(false);
    expect(probe.canonicalAuthority).toBe(false);
  });

  it('reports the installed client version as CLIENT_ONLY when no service is configured', async () => {
    const probe = await probeFirecrawlVersionV1({ readClientPackageVersion: () => '9.9.9' });
    expect(probe.overall).toBe('CLIENT_ONLY');
    expect(probe.clientPackage).toEqual({ status: 'INSTALLED', version: '9.9.9' });
    expect(probe.serviceUrl).toBeNull();
  });

  it('records the raw HTTP status of a reachable service without claiming its version', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));
    const probe = await probeFirecrawlVersionV1({
      serviceUrl: 'http://127.0.0.1:3002/',
      readClientPackageVersion: () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(probe.overall).toBe('SERVICE_REACHABLE');
    expect(probe.serviceHttpStatus).toBe(200);
    expect(probe.serviceVersionClaimed).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('treats a connection failure as an unreachable service, not an error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const probe = await probeFirecrawlVersionV1({
      serviceUrl: 'http://127.0.0.1:3002/',
      readClientPackageVersion: () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(probe.serviceHttpStatus).toBeNull();
    expect(probe.overall).toBe('UNAVAILABLE');
  });
});
