/**
 * Web Search Client for Local Deep Research
 * Integrates with the shared server env loader so local discovery and
 * acquisition lanes read the same runtime values as the rest of the app.
 */

import { ENV } from '$lib/server/env.server.js';
import { extractWebDocument } from '$lib/server/web/web-crawl.js';
import { fetchWebEvidenceFromSidecar } from './web-evidence-sidecar-client.js';

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
  sourceRevision?: string;
  acquisitionProvider?: string;
  canonicalAuthority?: false;
  writesPerformed?: false;
}

const SEARXNG_URL = ENV.SEARXNG_URL || 'http://127.0.0.1:8888';
const FIRECRAWL_API_KEY = ENV.FIRECRAWL_API_KEY;
const WEB_SEARCH_TIMEOUT = 10000;

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
      headers: { 'User-Agent': 'Mozilla/5.0 (Legal AI Research Bot)' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`SearXNG search failed: ${res.status}`, await res.text());
      return [];
    }

    const data = await res.json() as { results?: Array<{ url: string; title: string; content: string }> };
    return (data.results || []).slice(0, limit).map(r => ({
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
 * Fetch one web document for LDR.
 *
 * Preferred path: the bounded `/evidence/web` FastAPI/Pydantic route on 8095.
 * It must provide a source revision and explicitly report non-authoritative,
 * no-write behavior. If unavailable or invalid, fall back to the pre-existing
 * shared crawler. Legacy direct Firecrawl/native extraction remains last-resort
 * compatibility behavior so this integration is additive rather than breaking.
 */
export async function fetchAndExtractText(url: string): Promise<ExtractedDocument | null> {
  try {
    const evidence = await fetchWebEvidenceFromSidecar(url, { maximumChunks: 8 });
    if (evidence) {
      return {
        url: evidence.url,
        title: evidence.title || 'Untitled',
        content: evidence.text,
        extractedAt: new Date(evidence.extractedAt),
        wordCount: evidence.text.split(/\s+/).filter(Boolean).length,
        sourceRevision: evidence.sourceRevision,
        acquisitionProvider: evidence.provider,
        canonicalAuthority: false,
        writesPerformed: false,
      };
    }
  } catch (err) {
    console.warn(`Typed web evidence acquisition failed for ${url}:`, err instanceof Error ? err.message : String(err));
  }

  try {
    const doc = await extractWebDocument(url);
    return {
      url: doc.url,
      title: doc.title || 'Untitled',
      content: doc.text,
      extractedAt: new Date(doc.extractedAt),
      wordCount: doc.contentLength > 0 ? doc.text.split(/\s+/).filter(Boolean).length : 0,
    };
  } catch (err) {
    console.warn(`Shared crawl extraction failed for ${url}:`, err instanceof Error ? err.message : String(err));
  }

  if (FIRECRAWL_API_KEY) {
    try {
      const doc = await fetchViaFirecrawl(url);
      if (doc) return doc;
    } catch (err) {
      console.warn(`Firecrawl extraction failed for ${url}:`, err instanceof Error ? err.message : String(err));
    }
  }

  return fetchViaNativeClient(url);
}

async function fetchViaFirecrawl(url: string): Promise<ExtractedDocument | null> {
  try {
    const res = await fetch('https://api.firecrawl.dev/v0/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url, pageOptions: { onlyMainContent: true } })
    });

    if (!res.ok) return null;

    const data = await res.json() as { data?: { markdown: string; metadata: { title?: string; publishedDate?: string } } };
    if (!data.data?.markdown) return null;

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

async function fetchViaNativeClient(url: string): Promise<ExtractedDocument | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Legal AI Research Bot)' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok || !res.headers.get('content-type')?.includes('text/html')) return null;

    const html = await res.text();
    const title = extractTitleFromHTML(html);
    const content = stripHTMLTags(html);
    if (content.length < 100) return null;

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

function extractTitleFromHTML(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) return titleMatch[1].trim();
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match?.[1]) return h1Match[1].trim();
  return 'Untitled';
}

function stripHTMLTags(html: string): string {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ');

  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return text.split(/\s+/).filter(Boolean).join(' ').trim();
}

export function aggregateDocuments(docs: ExtractedDocument[]): string {
  return docs
    .map((doc, i) => {
      const revision = doc.sourceRevision ? `\n[Source revision: ${doc.sourceRevision}]` : '';
      const header = `[Source ${i + 1}: ${doc.title}]\n[URL: ${doc.url}]\n[Word count: ${doc.wordCount}]${revision}\n`;
      return header + doc.content.slice(0, 2000);
    })
    .join('\n\n---\n\n');
}
