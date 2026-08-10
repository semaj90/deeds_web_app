import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_PUBLIC_API_URL = process.env.PUBLIC_API_URL;
const ORIGINAL_ORIGIN = process.env.ORIGIN;

afterEach(() => {
  if (ORIGINAL_PUBLIC_API_URL === undefined) {
    delete process.env.PUBLIC_API_URL;
  } else {
    process.env.PUBLIC_API_URL = ORIGINAL_PUBLIC_API_URL;
  }

  if (ORIGINAL_ORIGIN === undefined) {
    delete process.env.ORIGIN;
  } else {
    process.env.ORIGIN = ORIGINAL_ORIGIN;
  }
  vi.resetModules();
});

describe('env.server PUBLIC_API_URL fallback', () => {
  it('falls back to the dev origin when PUBLIC_API_URL is unset', async () => {
    delete process.env.PUBLIC_API_URL;
    delete process.env.ORIGIN;
    vi.resetModules();

    const { ENV } = await import('$lib/server/env.server.js');

    expect(ENV.PUBLIC_API_URL).toBe('http://127.0.0.1:5173');
  });

  it('prefers PUBLIC_API_URL when explicitly configured', async () => {
    process.env.PUBLIC_API_URL = 'http://example.test:4173';
    vi.resetModules();

    const { ENV } = await import('$lib/server/env.server.js');

    expect(ENV.PUBLIC_API_URL).toBe('http://example.test:4173');
  });
});
