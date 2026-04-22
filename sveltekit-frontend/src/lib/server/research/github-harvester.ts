/**
 * github-harvester.ts — Lane 3 Research: GitHub REST/GraphQL ingestion
 *
 * Fetches issues, code snippets, and repositories from GitHub APIs.
 * Results are normalised into WebResearchChunk shape for chunks_web_search.
 *
 * Rate limits (with auth token):
 *   /search/issues        30 req/min  (10 semantic/hybrid)
 *   /search/code          9 req/min
 *   /search/repositories  30 req/min
 *   /search/commits       30 req/min
 *
 * Constraints:
 *   • search_type=semantic|hybrid ONLY on /search/issues
 *   • code search: default branch only, files < 384 KB, auth required
 *   • max 1 000 results per query, 100 per page
 *   • query limit: 256 chars, 5 AND/OR/NOT operators
 */

import { ENV } from '$lib/server/env.server.js';
import type { WebResearchChunk } from './web-research-ingester.js';
import { sha256Hex } from './research-utils.js';

const GH_API_BASE = 'https://api.github.com';

interface GHIssueHit {
  html_url: string;
  title: string;
  body: string | null;
  repository_url: string;
  number: number;
  state: string;
  score: number;
  text_matches?: Array<{ fragment: string; property: string }>;
}

interface GHCodeHit {
  html_url: string;
  name: string;
  path: string;
  repository: { full_name: string; html_url: string };
  text_matches?: Array<{ fragment: string; property: string }>;
  score?: number;
}

interface GHRepoHit {
  html_url: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  topics: string[];
  score: number;
}

function makeHeaders(acceptTextMatch = false): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': acceptTextMatch
      ? 'application/vnd.github.text-match+json'
      : 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'deeds-legal-ai/1.0 (agentic-research)',
  };
  const token = ENV.GITHUB_TOKEN;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function ghFetch<T>(path: string, params: Record<string, string>, acceptTextMatch = false): Promise<T | null> {
  const url = new URL(`${GH_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  try {
    const res = await fetch(url.toString(), {
      headers: makeHeaders(acceptTextMatch),
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 422) {
      console.warn(`[github-harvester] 422 Unprocessable for ${path} — query too complex or invalid`);
      return null;
    }
    if (res.status === 403) {
      const reset = res.headers.get('x-ratelimit-reset');
      const retryAfter = reset ? Math.ceil(Number(reset) - Date.now() / 1000) : 60;
      console.warn(`[github-harvester] Rate limited — retry in ${retryAfter}s`);
      return null;
    }
    if (!res.ok) {
      console.warn(`[github-harvester] ${res.status} for ${path}`);
      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    console.error(`[github-harvester] fetch error for ${path}:`, err);
    return null;
  }
}

// ── Public search functions ───────────────────────────────────────────────────

export interface GitHubSearchOptions {
  /** GitHub search qualifier string (e.g. "svelte5 runes language:TypeScript") */
  query: string;
  /** Max results to return (capped at 100) */
  limit?: number;
  /** Use semantic search — only valid for issues, requires auth */
  semantic?: boolean;
}

/**
 * Search GitHub Issues & PRs.
 * Supports search_type=semantic|hybrid when semantic=true (auth required).
 */
export async function searchGitHubIssues(opts: GitHubSearchOptions): Promise<WebResearchChunk[]> {
  const perPage = Math.min(opts.limit ?? 20, 100);
  const params: Record<string, string> = {
    q: opts.query.slice(0, 256),
    per_page: String(perPage),
    sort: 'relevance',
    order: 'desc',
  };
  if (opts.semantic && ENV.GITHUB_TOKEN) params['search_type'] = 'semantic';

  const data = await ghFetch<{ items: GHIssueHit[] }>(
    '/search/issues',
    params,
    true // request text-match fragments
  );

  if (!data?.items?.length) return [];

  return data.items.map((hit) => {
    const body = hit.body?.slice(0, 4000) ?? '';
    const repoName = hit.repository_url.split('/').slice(-2).join('/');
    const textFragments = hit.text_matches
      ?.filter((m) => m.fragment?.trim())
      .map((m) => m.fragment)
      .join('\n---\n')
      .slice(0, 1000);

    const content = [hit.title, body, textFragments].filter(Boolean).join('\n\n');

    return {
      id: sha256Hex(`github_issue:${hit.html_url}:${body.slice(0, 200)}`),
      source: 'github_issue' as const,
      url: hit.html_url,
      title: hit.title,
      body: content,
      text_matches: hit.text_matches?.map((m) => ({ fragment: m.fragment, property: m.property })),
      repo: repoName,
      score: hit.score,
      fetched_at: new Date().toISOString(),
    };
  });
}

/**
 * Search GitHub Code.
 * Auth required. Default branch only. Files < 384 KB.
 * search_type=semantic NOT supported here.
 */
export async function searchGitHubCode(opts: GitHubSearchOptions): Promise<WebResearchChunk[]> {
  if (!ENV.GITHUB_TOKEN) {
    console.warn('[github-harvester] Code search requires GITHUB_TOKEN');
    return [];
  }

  const perPage = Math.min(opts.limit ?? 10, 30); // lower limit — 9 req/min
  const data = await ghFetch<{ items: GHCodeHit[] }>(
    '/search/code',
    { q: opts.query.slice(0, 256), per_page: String(perPage) },
    true
  );

  if (!data?.items?.length) return [];

  return data.items.map((hit) => {
    const fragments = hit.text_matches
      ?.map((m) => m.fragment)
      .filter(Boolean)
      .join('\n---\n')
      .slice(0, 3000) ?? '';

    return {
      id: sha256Hex(`github_code:${hit.html_url}:${hit.path}`),
      source: 'github_code' as const,
      url: hit.html_url,
      title: `${hit.repository.full_name} / ${hit.path}`,
      body: fragments || `[${hit.name}] ${hit.path}`,
      text_matches: hit.text_matches,
      repo: hit.repository.full_name,
      score: hit.score ?? 1,
      fetched_at: new Date().toISOString(),
    };
  });
}

/**
 * Search GitHub Repositories.
 * Sorted by stars (quality signal). search_type=semantic NOT supported.
 */
export async function searchGitHubRepos(opts: GitHubSearchOptions): Promise<WebResearchChunk[]> {
  const perPage = Math.min(opts.limit ?? 15, 100);
  const data = await ghFetch<{ items: GHRepoHit[] }>(
    '/search/repositories',
    { q: opts.query.slice(0, 256), per_page: String(perPage), sort: 'stars', order: 'desc' }
  );

  if (!data?.items?.length) return [];

  return data.items.map((hit) => ({
    id: sha256Hex(`github_repo:${hit.html_url}`),
    source: 'github_repo' as const,
    url: hit.html_url,
    title: hit.full_name,
    body: [hit.description ?? '', hit.topics.join(', ')].filter(Boolean).join('\n'),
    repo: hit.full_name,
    language: hit.language ?? undefined,
    score: hit.score,
    fetched_at: new Date().toISOString(),
  }));
}
