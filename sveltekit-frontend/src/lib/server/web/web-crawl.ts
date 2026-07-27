import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { langextractFetch } from '$lib/server/langextract-client.js';
import { validateExternalUrl } from '$lib/server/security/url-validator.js';

export interface CrawlResult {
  url: string;
  title: string;
  text: string;
  html?: string;
  extractedAt: string;
  contentLength: number;
  source: 'langextract' | 'fallback';
}

export async function crawlViaLangextract(url: string): Promise<CrawlResult> {
  const res = await langextractFetch('/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, extract_text: true }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res?.ok) {
    throw new Error(`langextract ${res?.status ?? 'unavailable'}`);
  }

  const data = await res.json();
  return {
    url,
    title: data.title ?? '',
    text: data.text ?? data.content ?? '',
    extractedAt: new Date().toISOString(),
    contentLength: (data.text ?? data.content ?? '').length,
    source: 'langextract',
  };
}

export async function crawlFallback(url: string): Promise<CrawlResult> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'DeedsAI/1.0 (legal research)' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50_000);

  return {
    url,
    title,
    text,
    extractedAt: new Date().toISOString(),
    contentLength: text.length,
    source: 'fallback',
  };
}

export async function extractWebDocument(url: string): Promise<CrawlResult> {
  const urlCheck = validateExternalUrl(url);
  if (!urlCheck.valid) {
    throw new Error(urlCheck.error ?? 'invalid_url');
  }

  try {
    return await crawlViaLangextract(url);
  } catch {
    return crawlFallback(url);
  }
}

export async function maybeGenerateWebEmbedding(text: string): Promise<number[] | null> {
  if (!text.length) return null;

  try {
    const embedRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: text.slice(0, 4000),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!embedRes.ok) return null;
    const data = await embedRes.json();
    return data.embedding ?? null;
  } catch {
    return null;
  }
}
