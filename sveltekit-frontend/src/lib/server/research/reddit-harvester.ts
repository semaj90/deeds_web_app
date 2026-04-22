/**
 * reddit-harvester.ts — Lane 3 Research: Reddit keyword search ingestion
 *
 * Fetches posts from Reddit's official OAuth2 search API.
 * Results normalised into WebResearchChunk shape for chunks_web_search.
 *
 * API constraints:
 *   • Always append &raw_json=1 — prevents &gt; corruption in body text
 *   • No semantic search variant — use keyword + sort=top + t=year
 *   • Rate limit: 100 req/min OAuth2, ~10 req/min unauthenticated
 *   • max 100 results/page, cursor pagination via after/before (t3_xxxxx)
 *   • OAuth2 scope: read
 */

import { ENV } from '$lib/server/env.server.js';
import type { WebResearchChunk } from './web-research-ingester.js';
import { sha256Hex } from './research-utils.js';

const REDDIT_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const REDDIT_API_BASE = 'https://oauth.reddit.com';
const REDDIT_FALLBACK_BASE = 'https://www.reddit.com';

/** In-memory token cache — refreshed when expired */
let _redditToken: { token: string; expiresAt: number } | null = null;

async function getRedditToken(): Promise<string | null> {
  const clientId = ENV.REDDIT_CLIENT_ID;
  const clientSecret = ENV.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  // Return cached token if still valid (5-min safety margin)
  if (_redditToken && Date.now() < _redditToken.expiresAt - 300_000) {
    return _redditToken.token;
  }

  try {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(REDDIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': `server:deeds-legal-ai:1.0 (by /u/${ENV.REDDIT_USERNAME ?? 'deeds_legal_ai'})`,
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn(`[reddit-harvester] Token fetch failed: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    _redditToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return _redditToken.token;
  } catch (err) {
    console.error('[reddit-harvester] Token error:', err);
    return null;
  }
}

interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext: string;
    url: string;
    permalink: string;
    subreddit: string;
    score: number;
    name: string; // t3_xxxxx — cursor
    is_self: boolean;
    created_utc: number;
  };
}

interface RedditListing {
  data: {
    children: RedditPost[];
    after: string | null;
    before: string | null;
  };
}

export interface RedditSearchOptions {
  query: string;
  /** Filter to subreddit — omit for all-Reddit search */
  subreddit?: string;
  /** Sort — use 'top' for highest-quality signal */
  sort?: 'relevance' | 'hot' | 'top' | 'new' | 'comments';
  /** Time range — use 'year' or 'all' for quality */
  timeRange?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  limit?: number;
  /** Cursor for pagination (t3_xxxxx value from previous page) */
  after?: string;
}

/**
 * Search Reddit posts.
 * Always uses &raw_json=1 to prevent HTML entity corruption.
 */
export async function searchReddit(opts: RedditSearchOptions): Promise<{
  chunks: WebResearchChunk[];
  after: string | null;
}> {
  const limit = Math.min(opts.limit ?? 25, 100);
  const sort = opts.sort ?? 'top';
  const t = opts.timeRange ?? 'year';

  const token = await getRedditToken();
  const baseUrl = token ? REDDIT_API_BASE : REDDIT_FALLBACK_BASE;
  const subredditPath = opts.subreddit ? `/r/${opts.subreddit}` : '';

  const url = new URL(`${baseUrl}${subredditPath}/search.json`);
  url.searchParams.set('q', opts.query.slice(0, 512));
  url.searchParams.set('sort', sort);
  url.searchParams.set('t', t);
  url.searchParams.set('type', 'link');
  url.searchParams.set('restrict_sr', opts.subreddit ? 'true' : 'false');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('raw_json', '1'); // CRITICAL — prevents > → &gt; corruption
  if (opts.after) url.searchParams.set('after', opts.after);

  const userAgent = `server:deeds-legal-ai:1.0 (by /u/${ENV.REDDIT_USERNAME ?? 'deeds_legal_ai'})`;

  try {
    const headers: Record<string, string> = {
      'User-Agent': userAgent,
      'Accept': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') ?? 60);
      console.warn(`[reddit-harvester] Rate limited — retry in ${retryAfter}s`);
      return { chunks: [], after: null };
    }
    if (!res.ok) {
      console.warn(`[reddit-harvester] ${res.status} for Reddit search`);
      return { chunks: [], after: null };
    }

    const data = (await res.json()) as RedditListing;
    const posts = data?.data?.children ?? [];

    const chunks: WebResearchChunk[] = posts
      .filter((p) => p.data.is_self || p.data.selftext?.trim())
      .map((p) => {
        const d = p.data;
        const body = d.selftext?.trim() ?? '';
        const redditUrl = `https://reddit.com${d.permalink}`;

        return {
          id: sha256Hex(`reddit_post:${d.id}:${body.slice(0, 200)}`),
          source: 'reddit_post' as const,
          url: redditUrl,
          title: d.title,
          body: body.slice(0, 5000),
          subreddit: d.subreddit,
          score: d.score,
          fetched_at: new Date().toISOString(),
        };
      });

    return { chunks, after: data?.data?.after ?? null };
  } catch (err) {
    console.error('[reddit-harvester] fetch error:', err);
    return { chunks: [], after: null };
  }
}
