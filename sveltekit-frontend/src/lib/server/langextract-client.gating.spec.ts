// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    LANGEXTRACT_ENABLED: true,
    LANGEXTRACT_NATIVE: 'false',
    LANGEXTRACT_URL: 'http://127.0.0.1:8095',
    MINIFORGE_SIDECAR_URL: 'http://127.0.0.1:8095',
  },
  privateEnv: {},
}));

describe('langextract client grounding gate', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('does not invoke extraction without explicit grounded authorization', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { extractDocument, extractFile } = await import('./langextract-client.js');

    await expect(extractDocument('plain text')).resolves.toBeNull();
    await expect(extractFile(new Blob(['plain text']))).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
