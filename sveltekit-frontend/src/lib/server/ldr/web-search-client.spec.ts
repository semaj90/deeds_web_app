import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExtractWebDocument } = vi.hoisted(() => ({
  mockExtractWebDocument: vi.fn(),
}));

vi.mock('$lib/server/web/web-crawl.js', () => ({
  extractWebDocument: mockExtractWebDocument,
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: { SEARXNG_URL: undefined, FIRECRAWL_API_KEY: undefined },
}));

describe('ldr/web-search-client', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('prefers the shared crawl helper before legacy fetch fallbacks', async () => {
    mockExtractWebDocument.mockResolvedValue({
      url: 'https://example.com/article',
      title: 'Shared Crawl Title',
      text: 'Shared crawl body',
      extractedAt: '2026-08-02T00:00:00.000Z',
      contentLength: 17,
      source: 'beautifulsoup',
    });

    const { fetchAndExtractText } = await import('./web-search-client.js');
    const doc = await fetchAndExtractText('https://example.com/article');

    expect(mockExtractWebDocument).toHaveBeenCalledWith('https://example.com/article');
    expect(doc).toMatchObject({
      url: 'https://example.com/article',
      title: 'Shared Crawl Title',
      content: 'Shared crawl body',
      wordCount: 3,
    });
  });

  it('fails closed without a configured SearXNG URL instead of calling reserved port 8888', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { searchViaSearXNG } = await import('./web-search-client.js');

    await expect(searchViaSearXNG('test query')).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('SearXNG search skipped: SEARXNG_URL is not configured');
    fetchSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
