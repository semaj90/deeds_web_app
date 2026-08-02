/**
 * ACQ6/ACQ7 — cache-aware, SSRF-safe conditional HTTP fetch for the
 * acquisition plane. Does its OWN raw fetch rather than routing through
 * web-crawl.ts's extractWebDocument(), for two reasons found while wiring
 * this up:
 *
 * 1. extractWebDocument() discards response headers entirely (title/text
 *    only) — cache validators (ETag/Last-Modified/Cache-Control/Vary) are
 *    unavailable from it, and ACQ6 needs them.
 * 2. crawlViaLangextract() (the first tier of extractWebDocument's cascade)
 *    POSTs {url, extract_text:true} to /extract, but /extract's native-TS
 *    short-circuit (LANGEXTRACT_NATIVE=true, the current default) only
 *    reads body.text/body.content — never body.url — so it silently
 *    returns empty content and never falls through to the real
 *    BeautifulSoup path at /extract/web. Confirmed live: a real fetch of
 *    https://example.com returned contentLength:0. That's a genuine,
 *    separate bug in web-crawl.ts's tier ordering — tracked, not fixed
 *    here (out of scope for the acquisition plane; extraction itself is
 *    ACQ8's job, against bytes this module has already fetched and stored).
 *
 * Manually follows redirects (does not use fetch's automatic redirect
 * following) so each hop can be independently SSRF-validated — this closes
 * the "validate then connect" TOCTOU gap the automatic-redirect path can't.
 */

import { validateExternalUrl } from '$lib/server/security/url-validator.js';
import { createHash } from 'node:crypto';
import type { AcquisitionResultV1, CacheDecision } from './contracts.js';

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10MB

export interface ConditionalFetchInput {
  requestedUrl: string;
  cacheMode: 'default' | 'revalidate' | 'bypass' | 'cache_only';
  priorRevision?: {
    contentDigest?: string;
    etag?: string;
    lastModified?: string;
  };
}

export interface ConditionalFetchOutcome {
  result: Omit<AcquisitionResultV1, 'schemaVersion' | 'eventId' | 'researchRunId' | 'fetchId'>;
  rawBytes: Buffer | null; // null on not_modified / cache_hit / failed
}

class PermanentFetchError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function followRedirects(
  url: string,
  headers: Record<string, string>
): Promise<{ res: Response; finalUrl: string; redirectChain: Array<{ url: string; status: number }> }> {
  let currentUrl = url;
  const redirectChain: Array<{ url: string; status: number }> = [];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = validateExternalUrl(currentUrl);
    if (!check.valid) {
      throw new PermanentFetchError('SSRF_BLOCKED', check.error ?? 'blocked URL');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'User-Agent': 'DeedsAI-AtlasAcquisition/1.0 (legal research)', ...headers },
        signal: controller.signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('abort')) throw new Error('HTTP_TIMEOUT');
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      redirectChain.push({ url: currentUrl, status: res.status });
      if (hop === MAX_REDIRECTS) throw new PermanentFetchError('TOO_MANY_REDIRECTS', 'exceeded max redirects');
      currentUrl = new URL(res.headers.get('location')!, currentUrl).toString();
      continue;
    }

    return { res, finalUrl: currentUrl, redirectChain };
  }

  throw new PermanentFetchError('TOO_MANY_REDIRECTS', 'exceeded max redirects');
}

export async function conditionalFetch(input: ConditionalFetchInput): Promise<ConditionalFetchOutcome> {
  const startedAt = new Date();

  const urlCheck = validateExternalUrl(input.requestedUrl);
  if (!urlCheck.valid) {
    return failure('SSRF_BLOCKED', urlCheck.error ?? 'blocked URL', 'permanent', startedAt);
  }

  if (input.cacheMode === 'cache_only') {
    // Rule: cache_only must never perform network I/O.
    if (input.priorRevision?.contentDigest) {
      return {
        result: buildResult({
          requestedUrl: input.requestedUrl, finalUrl: input.requestedUrl, redirectChain: [],
          status: 'cache_hit', cache: { decision: 'fresh_cache_hit' as CacheDecision },
          contentDigest: input.priorRevision.contentDigest, startedAt, completedAt: new Date(),
        }),
        rawBytes: null,
      };
    }
    return failure('CACHE_ONLY_MISS', 'cache_only requested but no prior revision available', 'policy', startedAt);
  }

  const headers: Record<string, string> = {};
  const sendValidators = input.cacheMode !== 'bypass' && input.priorRevision;
  if (sendValidators?.etag) headers['If-None-Match'] = sendValidators.etag;
  if (sendValidators?.lastModified) headers['If-Modified-Since'] = sendValidators.lastModified;

  try {
    const { res, finalUrl, redirectChain } = await followRedirects(input.requestedUrl, headers);
    const completedAt = new Date();

    if (res.status === 304) {
      // Rule: 304 retains the prior source revision, records a new fetch
      // attempt, does not rewrite raw content, no new extraction revision.
      return {
        result: buildResult({
          requestedUrl: input.requestedUrl, finalUrl, redirectChain, httpStatus: 304,
          status: 'not_modified',
          cache: {
            decision: 'not_modified', etag: res.headers.get('etag') ?? undefined,
            lastModified: res.headers.get('last-modified') ?? undefined,
            cacheControl: res.headers.get('cache-control') ?? undefined,
            vary: res.headers.get('vary') ?? undefined,
          },
          contentDigest: input.priorRevision?.contentDigest,
          startedAt, completedAt,
        }),
        rawBytes: null,
      };
    }

    if (!res.ok) {
      const retryable = [429, 502, 503, 504].includes(res.status);
      return failure(`HTTP_${res.status}`, `upstream returned ${res.status}`, retryable ? 'transient' : 'permanent', startedAt, finalUrl, redirectChain);
    }

    const contentLengthHeader = res.headers.get('content-length');
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_RESPONSE_BYTES) {
      return failure('RESPONSE_TOO_LARGE', 'content-length exceeds policy limit', 'permanent', startedAt, finalUrl, redirectChain);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_RESPONSE_BYTES) {
      return failure('RESPONSE_TOO_LARGE', 'decompressed body exceeds policy limit', 'permanent', startedAt, finalUrl, redirectChain);
    }

    const contentDigest = createHash('sha256').update(buf).digest('hex');
    const exactReuse = input.priorRevision?.contentDigest === contentDigest;

    return {
      result: buildResult({
        requestedUrl: input.requestedUrl, finalUrl, redirectChain, httpStatus: res.status,
        status: 'fetched',
        contentType: res.headers.get('content-type') ?? undefined,
        contentLength: buf.byteLength,
        cache: {
          decision: exactReuse ? 'exact_digest_reuse' : (sendValidators ? 'conditional_fetch' : 'network_fetch'),
          etag: res.headers.get('etag') ?? undefined,
          lastModified: res.headers.get('last-modified') ?? undefined,
          cacheControl: res.headers.get('cache-control') ?? undefined,
          vary: res.headers.get('vary') ?? undefined,
        },
        contentDigest,
        startedAt, completedAt,
      }),
      rawBytes: buf,
    };
  } catch (err) {
    if (err instanceof PermanentFetchError) {
      return failure(err.code, err.message, 'permanent', startedAt);
    }
    const message = err instanceof Error ? err.message : String(err);
    const code = message === 'HTTP_TIMEOUT' ? 'HTTP_TIMEOUT' : 'FETCH_ERROR';
    return failure(code, message, 'transient', startedAt);
  }
}

function failure(
  code: string, message: string, retryClass: 'transient' | 'permanent' | 'policy',
  startedAt: Date, finalUrl?: string, redirectChain: Array<{ url: string; status: number }> = []
): ConditionalFetchOutcome {
  return {
    result: buildResult({
      requestedUrl: finalUrl ?? '', finalUrl: finalUrl ?? '', redirectChain,
      status: 'failed', cache: { decision: 'cache_bypass' as CacheDecision },
      startedAt, completedAt: new Date(),
      error: { code, retryClass, message },
    }),
    rawBytes: null,
  };
}

function buildResult(opts: {
  requestedUrl: string; finalUrl: string; redirectChain: Array<{ url: string; status: number }>;
  status: 'fetched' | 'not_modified' | 'cache_hit' | 'failed';
  httpStatus?: number; contentType?: string; contentLength?: number;
  cache: { decision: CacheDecision; etag?: string; lastModified?: string; cacheControl?: string; vary?: string };
  contentDigest?: string; startedAt: Date; completedAt: Date;
  error?: { code: string; retryClass: 'transient' | 'permanent' | 'policy'; message: string };
}): Omit<AcquisitionResultV1, 'schemaVersion' | 'eventId' | 'researchRunId' | 'fetchId'> {
  return {
    requestedUrl: opts.requestedUrl,
    finalUrl: opts.finalUrl,
    redirectChain: opts.redirectChain,
    status: opts.status,
    httpStatus: opts.httpStatus,
    contentType: opts.contentType,
    contentLength: opts.contentLength,
    cache: opts.cache,
    contentDigest: opts.contentDigest,
    startedAt: opts.startedAt.toISOString(),
    completedAt: opts.completedAt.toISOString(),
    durationMs: opts.completedAt.getTime() - opts.startedAt.getTime(),
    error: opts.error,
  };
}
