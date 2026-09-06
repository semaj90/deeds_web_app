/**
 * Centralized optional-dependency loader for `@mendable/firecrawl-js`.
 *
 * Firecrawl is a paid, optional API client -- not a required runtime dependency (this repo does
 * not install it by default; `node_modules/@mendable` is absent, confirmed 2026-09-06). A bare
 * dynamic `import('@mendable/firecrawl-js')` is runtime-safe (Node resolves it lazily, and a
 * missing package throws at call time, not at module load), but `tsgo`/`tsc` still type-checks
 * the import specifier and fails with `TS2307: Cannot find module` since no type declarations
 * exist for an uninstalled package. Centralizing the load here means only one file carries the
 * documented type-check exception, instead of scattering `@vite-ignore`/`@ts-expect-error`
 * comments across every call site that wants Firecrawl.
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
    // @ts-expect-error -- optional dependency, not installed by default; see module docstring.
    const mod = await import('@mendable/firecrawl-js');
    const FirecrawlCtor = ((mod as { default?: unknown }).default ?? mod) as new (config: { apiKey: string }) => FirecrawlClient;
    cached = { status: 'AVAILABLE', FirecrawlCtor };
  } catch (err) {
    cached = { status: 'UNAVAILABLE', reason: err instanceof Error ? err.message : String(err) };
  }

  return cached;
}
