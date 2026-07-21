/**
 * Web Search Client for Local Deep Research
 * Integrates with SearXNG for autonomous research queries
 */

export interface WebSearchResult {
  url: string;
  title: string;
  snippet: string;
  publishDate?: string;
  source: 'searxng' | 'firecrawl';
}

export interface ExtractedDocument {
  url: string;
  title: string;
  content: string;
  extractedAt: Date;
  wordCount: number;
}

const SEARXNG_URL = process.env.SEARXNG_URL || 'http://127.0.0.1:8888';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const WEB_SEARCH_TIMEOUT = 10000; // 10 seconds per search

/**
 * Search the web using SearXNG (self-hosted, privacy-preserving)
 */
export async function searchViaSearXNG(query: string, limit: number = 10): Promise<WebSearchResult[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      pageno: '1',
      results_on_new_tab: '0',
      autocomplete: 'false'
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEB_SEARCH_TIMEOUT);

    const res = await fetch(`${SEARXNG_URL}/search?${params}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Legal AI Research Bot)'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`SearXNG search failed: ${res.status}`, await res.text());
      return [];
    }

    const data = await res.json() as { results?: Array<{ url: string; title: string; content: string }> };
    const results = data.results || [];

    return results.slice(0, limit).map(r => ({
      url: r.url,
      title: r.title || 'Untitled',
      snippet: r.content || '',
      source: 'searxng'
    }));
  } catch (err) {
    console.error('SearXNG search error:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * Fetch and extract text content from a URL using Firecrawl
 * Falls back to simple text extraction if Firecrawl unavailable
 */
export async function fetchAndExtractText(url: string): Promise<ExtractedDocument | null> {
  // Try Firecrawl first (if available)
  if (FIRECRAWL_API_KEY) {
    try {
      const doc = await fetchViaFirecrawl(url);
      if (doc) return doc;
    } catch (err) {
      console.warn(`Firecrawl extraction failed for ${url}:`, err instanceof Error ? err.message : String(err));
    }
  }

  // Fallback: simple fetch + text extraction
  return fetchViaNativeClient(url);
}

/**
 * Extract via Firecrawl API (premium, higher quality)
 */
async function fetchViaFirecrawl(url: string): Promise<ExtractedDocument | null> {
  try {
    const res = await fetch('https://api.firecrawl.dev/v0/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url,
        pageOptions: {
          onlyMainContent: true
        }
      })
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json() as { data?: { markdown: string; metadata: { title?: string; publishedDate?: string } } };
    if (!data.data?.markdown) {
      return null;
    }

    return {
      url,
      title: data.data.metadata?.title || 'Untitled',
      content: data.data.markdown,
      extractedAt: new Date(),
      wordCount: data.data.markdown.split(/\s+/).length
    };
  } catch (err) {
    console.error('Firecrawl error:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Extract via native fetch (fallback, lower quality but always available)
 */
async function fetchViaNativeClient(url: string): Promise<ExtractedDocument | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Legal AI Research Bot)'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok || !res.headers.get('content-type')?.includes('text/html')) {
      return null;
    }

    const html = await res.text();
    const title = extractTitleFromHTML(html);
    const content = stripHTMLTags(html);

    if (content.length < 100) {
      // Too short to be useful
      return null;
    }

    return {
      url,
      title,
      content,
      extractedAt: new Date(),
      wordCount: content.split(/\s+/).length
    };
  } catch (err) {
    console.error(`Failed to fetch ${url}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Extract title from HTML document
 */
function extractTitleFromHTML(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    return titleMatch[1].trim();
  }

  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match && h1Match[1]) {
    return h1Match[1].trim();
  }

  return 'Untitled';
}

/**
 * Strip HTML tags and decode entities
 */
function stripHTMLTags(html: string): string {
  // Remove script and style tags
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Collapse whitespace
  text = text
    .split(/\s+/)
    .filter(t => t.length > 0)
    .join(' ')
    .trim();

  return text;
}

/**
 * Aggregate multiple documents into a single context string
 */
export function aggregateDocuments(docs: ExtractedDocument[]): string {
  return docs
    .map((doc, i) => {
      const header = `[Source ${i + 1}: ${doc.title}]\n[URL: ${doc.url}]\n[Word count: ${doc.wordCount}]\n`;
      const content = doc.content.slice(0, 2000); // Limit per document
      return header + content;
    })
    .join('\n\n---\n\n');
}
