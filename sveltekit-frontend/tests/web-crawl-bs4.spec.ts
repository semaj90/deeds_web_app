import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLangextractFetch, mockValidateExternalUrl } = vi.hoisted(() => ({
  mockLangextractFetch: vi.fn(),
  mockValidateExternalUrl: vi.fn(() => ({ valid: true })),
}));

vi.mock('$lib/server/langextract-client.js', () => ({
  langextractFetch: mockLangextractFetch,
}));

vi.mock('$lib/server/security/url-validator.js', () => ({
  validateExternalUrl: mockValidateExternalUrl,
}));

describe('web crawl BS4 fallback', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('uses the BeautifulSoup-backed endpoint when primary extraction fails', async () => {
    mockLangextractFetch.mockImplementation(async (path: string) => {
      if (path === '/extract') {
        return null;
      }

      if (path === '/extract/web') {
        return new Response(
          JSON.stringify({
            title: 'Example Title',
            text: 'Hello World',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const { extractWebDocument } = await import('$lib/server/web/web-crawl.js');
    const result = await extractWebDocument('https://example.com/article');

    expect(mockValidateExternalUrl).toHaveBeenCalledWith('https://example.com/article');
    expect(result.source).toBe('beautifulsoup');
    expect(result.title).toBe('Example Title');
    expect(result.text).toBe('Hello World');
    expect(result.contentLength).toBe(11);
  });
});
