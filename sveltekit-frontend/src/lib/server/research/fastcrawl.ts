import FirecrawlApp from '@mendable/firecrawl-js';
import { ENV } from '$lib/server/env.server.js';
import type { WebResearchChunk } from './web-research-ingester.js';
import { sha256Hex } from './research-utils.js';

/**
 * fastcrawl.ts — High-speed web page fetch and normalization.
 * Uses Firecrawl for clean markdown/HTML extraction.
 */

let _firecrawl: any = null;

function getFirecrawl() {
  if (!_firecrawl && ENV.FIRECRAWL_API_KEY) {
    _firecrawl = new (FirecrawlApp as any)(ENV.FIRECRAWL_API_KEY);
  }
  return _firecrawl;
}

export async function fastCrawl(url: string): Promise<WebResearchChunk | null> {
  const firecrawl = getFirecrawl();
  if (!firecrawl) {
    console.warn('[fastcrawl] FIRECRAWL_API_KEY missing, falling back to basic fetch');
    return basicFetch(url);
  }

  try {
    const result = await firecrawl.scrapeUrl(url, {
      formats: ['markdown'],
      onlyMainContent: true
    });

    if (!result.success) {
      console.warn(`[fastcrawl] Scrape failed for ${url}:`, result.error);
      return null;
    }

    return {
      id: sha256Hex(`web_page:${url}`),
      source: 'web_page',
      url,
      title: result.metadata?.title || url,
      body: result.markdown || '',
      score: 1.0,
      fetched_at: new Date().toISOString()
    };
  } catch (err) {
    console.error(`[fastcrawl] Error crawling ${url}:`, err);
    return null;
  }
}

async function basicFetch(url: string): Promise<WebResearchChunk | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const text = await res.text();
    // Basic cleanup: remove tags
    const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    return {
      id: sha256Hex(`web_page:${url}`),
      source: 'web_page',
      url,
      title: url,
      body: cleanText.slice(0, 10000),
      score: 0.5,
      fetched_at: new Date().toISOString()
    };
  } catch {
    return null;
  }
}
