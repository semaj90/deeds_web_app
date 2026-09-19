/**
 * Centralized optional-dependency loader for `@mendable/firecrawl-js`.
 *
 * Firecrawl is a paid, optional API client -- not a required runtime dependency (this repo does
 * not install it by default; `node_modules/@mendable` is absent, confirmed 2026-09-06). A bare
 * The package is loaded through a dynamic specifier so Vite and TypeScript do not require the
 * optional package during the normal build. A missing package is reported as an unavailable
 * provider when this loader is called.
 */

export type FirecrawlLoadResult =
  | { status: 'AVAILABLE'; FirecrawlCtor: new (config: { apiKey: string }) => FirecrawlClient }
  | { status: 'UNAVAILABLE'; reason: string };

export interface FirecrawlScrapeResult {
  success: boolean;
  markdown?: string;
  error?: string;
  metadata?: {
    title?: string;
    ogTitle?: string;
    description?: string;
    ogDescription?: string;
  };
}

export interface FirecrawlScrapeOptions {
  formats: string[];
  timeout?: number;
  onlyMainContent?: boolean;
}

export interface FirecrawlClient {
  scrapeUrl(url: string, options: FirecrawlScrapeOptions): Promise<FirecrawlScrapeResult>;
}

let cached: FirecrawlLoadResult | null = null;

export async function loadFirecrawl(): Promise<FirecrawlLoadResult> {
  if (cached) return cached;

  try {
    const firecrawlPkg = ['@mendable', 'firecrawl-js'].join('/');
    const mod = await import(/* @vite-ignore */ firecrawlPkg);
    const FirecrawlCtor = ((mod as { default?: unknown }).default ?? mod) as new (config: { apiKey: string }) => FirecrawlClient;
    cached = { status: 'AVAILABLE', FirecrawlCtor };
  } catch (err) {
    cached = { status: 'UNAVAILABLE', reason: err instanceof Error ? err.message : String(err) };
  }

  return cached;
}
