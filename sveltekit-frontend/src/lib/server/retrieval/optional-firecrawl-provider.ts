/**
 * Centralized optional-dependency loader for `@mendable/firecrawl-js`.
 *
 * Firecrawl is a paid, optional API client -- not a required runtime dependency (this repo does
 * not install it by default; `node_modules/@mendable` is absent, confirmed 2026-09-06). A bare
 * The package is loaded through a dynamic specifier so Vite and TypeScript do not require the
 * optional package during the normal build. A missing package is reported as an unavailable
 * provider when this loader is called.
 */

import { createRequire } from 'node:module';

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

/**
 * Read-only Firecrawl status probe.
 *
 * Reports the installed client package version (if resolvable) and the raw HTTP status of an
 * explicitly configured service URL. It never claims a service version: no service endpoint for
 * version discovery is verified in this repo. It writes nothing and installs nothing.
 */
export interface FirecrawlVersionProbeV1 {
  schema: 'atlas.firecrawl-version-probe.v1';
  clientPackage:
    | { status: 'INSTALLED'; version: string }
    | { status: 'NOT_INSTALLED'; reason: 'PACKAGE_NOT_RESOLVABLE' };
  serviceUrl: string | null;
  serviceHttpStatus: number | null;
  overall: 'UNAVAILABLE' | 'CLIENT_ONLY' | 'SERVICE_REACHABLE';
  serviceVersionClaimed: false;
  canonicalAuthority: false;
  writesPerformed: false;
}

export interface FirecrawlVersionProbeOptionsV1 {
  serviceUrl?: string | null;
  readClientPackageVersion?: () => string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function defaultReadClientPackageVersion(): string | null {
  try {
    const requireFromHere = createRequire(import.meta.url);
    const pkgJsonPath = ['@mendable', 'firecrawl-js', 'package.json'].join('/');
    const pkg = requireFromHere(pkgJsonPath) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

export async function probeFirecrawlVersionV1(
  opts: FirecrawlVersionProbeOptionsV1 = {},
): Promise<FirecrawlVersionProbeV1> {
  const version = (opts.readClientPackageVersion ?? defaultReadClientPackageVersion)();
  const clientPackage: FirecrawlVersionProbeV1['clientPackage'] = version
    ? { status: 'INSTALLED', version }
    : { status: 'NOT_INSTALLED', reason: 'PACKAGE_NOT_RESOLVABLE' };

  const serviceUrl = opts.serviceUrl ?? null;
  let serviceHttpStatus: number | null = null;
  if (serviceUrl) {
    const fetchImpl = opts.fetchImpl ?? fetch;
    try {
      const res = await fetchImpl(serviceUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(opts.timeoutMs ?? 3000),
      });
      serviceHttpStatus = res.status;
      await res.body?.cancel().catch(() => undefined);
    } catch {
      serviceHttpStatus = null;
    }
  }

  const overall: FirecrawlVersionProbeV1['overall'] =
    serviceHttpStatus !== null ? 'SERVICE_REACHABLE' : version ? 'CLIENT_ONLY' : 'UNAVAILABLE';

  return {
    schema: 'atlas.firecrawl-version-probe.v1',
    clientPackage,
    serviceUrl,
    serviceHttpStatus,
    overall,
    serviceVersionClaimed: false,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
