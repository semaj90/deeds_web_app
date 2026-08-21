/**
 * Crawl4AI Client — validated acquisition adapter
 *
 * Wraps Crawl4AI HTTP API with schema validation (CrawledDocument).
 * This is the ONLY path to web acquisition for personal/private sources.
 *
 * Ownership:
 * - INPUT: URLs (local decision or discovery via SearXNG)
 * - PROCESSING: Browser rendering, JavaScript execution, link extraction
 * - VALIDATION: CrawledDocument schema (this file)
 * - OUTPUT: Validated CrawledDocument → Postgres ingestion boundary
 *
 * Do NOT call Crawl4AI directly — use this client.
 * Do NOT skip schema validation — it gates canonical persistence.
 */

import { createHash } from 'node:crypto';
import { ENV } from '$lib/server/env.server.js';
import {
  validateCrawledDocumentSafe,
  type CrawledDocument,
} from './crawled-document.schema.js';

/**
 * Crawl4AI request envelope
 * See: https://github.com/unclecode/crawl4ai
 */
export interface Crawl4AIRequest {
  urls: string[];
  include_raw_html?: boolean;
  use_cache?: boolean;
  cache_mode?: 'read' | 'write' | 'bypass';
  screenshot?: boolean;
  screenshot_type?: 'png' | 'jpg';
  wait_for?: string;
  wait_until?: 'load' | 'domcontentloaded' | 'networkidle';
  remove_overlay_elements?: boolean;
  ignore_body_width?: boolean;
  magic?: boolean; // LLM-powered extraction; disabled by default
}

/**
 * Crawl4AI response envelope (per URL)
 */
export interface Crawl4AIResponse {
  url: string;
  status_code: number;
  status_message: string;
  content_type: string | null;
  html?: string;
  markdown?: string;
  cleaned_html?: string;
  media?: {
    images: string[];
    links: Array<{ url: string; text: string }>;
  };
  metadata?: {
    title?: string;
    description?: string;
    language?: string;
    charset?: string;
    canonical?: string;
  };
  crawl_depth?: number;
  response_time?: number;
}

export interface CrawlBatchFailure {
  url: string;
  error: string;
}

export interface CrawlBatchResult {
  documents: CrawledDocument[];
  failures: CrawlBatchFailure[];
}

/**
 * Crawl4AI client configuration
 */
export interface Crawl4AIConfig {
  baseUrl: string;
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export class Crawl4AIClient {
  private baseUrl: string;
  private timeout: number;
  private retries: number;
  private headers: Record<string, string>;

  constructor(config: Crawl4AIConfig) {
    this.baseUrl = config.baseUrl || process.env.CRAWL4AI_URL?.trim() || 'http://127.0.0.1:8000';
    this.timeout = config.timeout || 30_000;
    this.retries = config.retries ?? 2;
    this.headers = config.headers || { 'Content-Type': 'application/json' };
  }

  /**
   * Crawl a single URL and return a validated CrawledDocument
   *
   * On validation failure, throws ZodError with details about missing/invalid fields.
   */
  async crawl(url: string): Promise<CrawledDocument> {
    const request: Crawl4AIRequest = {
      urls: [url],
      include_raw_html: false,
      use_cache: false,
      cache_mode: 'bypass',
      screenshot: false,
      magic: false,
      wait_until: 'networkidle',
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/crawl`, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(this.timeout),
        });

        if (!response.ok) {
          throw new Error(`Crawl4AI HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as Crawl4AIResponse[] | { results: Crawl4AIResponse[] };
        const results = Array.isArray(data) ? data : data.results;
        const crawlResult = results[0];

        if (!crawlResult) {
          throw new Error('Crawl4AI returned empty results');
        }

        if (crawlResult.status_code >= 400) {
          throw new Error(`Crawl4AI: HTTP ${crawlResult.status_code} from ${url}`);
        }

        // Transform to CrawledDocument
        const canonicalUrl = crawlResult.metadata?.canonical || crawlResult.url;
        const text = crawlResult.markdown || crawlResult.cleaned_html || '';
        const title = crawlResult.metadata?.title || 'Untitled';
        const language = crawlResult.metadata?.language || 'en';

        // Compute content hash for deduplication
        const contentHash = createHash('sha256').update(text).digest('hex');

        const candidate = {
          source_url: url,
          canonical_url: canonicalUrl,
          title,
          text,
          language,
          retrieved_at: new Date().toISOString(),
          content_hash: contentHash,
          links: (crawlResult.media?.links || []).map((link) => ({
            href: link.url,
            anchor: link.text,
          })),
          metadata: {
            http_status: crawlResult.status_code,
            media_type: crawlResult.content_type,
            charset: crawlResult.metadata?.charset,
          },
          access_scope: 'private' as const,
        };

        // Validate
        const validation = validateCrawledDocumentSafe(candidate);
        if (!validation.success) {
          throw new Error(
            `CrawledDocument validation failed for ${url}: ${validation.error.message}`
          );
        }

        return validation.data;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.retries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = 1000 * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error(`Failed to crawl ${url} after ${this.retries} retries`);
  }

  /**
   * Crawl multiple URLs in parallel (with concurrency limit)
   */
  async crawlBatch(urls: string[], concurrency = 3): Promise<CrawlBatchResult> {
    const documents: CrawledDocument[] = [];
    const failures: CrawlBatchFailure[] = [];

    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(batch.map((url) => this.crawl(url)));

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          documents.push(result.value);
        } else {
          failures.push({
            url: batch[j],
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      }
    }

    if (failures.length > 0) {
      console.warn(`[Crawl4AI] ${failures.length}/${urls.length} crawls failed:`, failures);
    }

    return { documents, failures };
  }
}

/**
 * Factory: Create a singleton Crawl4AI client from env vars
 */
export function createCrawl4AIClient(): Crawl4AIClient | null {
  const baseUrl = ENV.CRAWL4AI_HOST || 'http://127.0.0.1:8000';

  // Check if Crawl4AI is disabled
  if (process.env.CRAWL4AI_ENABLED === 'false') {
    return null;
  }

  return new Crawl4AIClient({
    baseUrl,
    timeout: 45_000, // JavaScript rendering can take time
    retries: 2,
  });
}

let _client: Crawl4AIClient | null = null;

export function getCrawl4AIClient(): Crawl4AIClient | null {
  if (!_client) {
    _client = createCrawl4AIClient();
  }
  return _client;
}
