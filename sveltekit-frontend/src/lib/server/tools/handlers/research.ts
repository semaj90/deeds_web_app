/**
 * Lane 3 Deep Research — convenience handlers.
 *
 * These are NOT registered in toolRegistry (which uses a strict Zod-schema /
 * ToolResult contract). Instead they are thin async wrappers consumed directly
 * by the MCP server (research:github_search / research:reddit_search /
 * research:search_chunks cases) and the HTTP routes
 * (/api/research/ingest, /api/research/search).
 */

import { githubSearch } from '../../research/github-search.js';
import { redditSearch } from '../../research/reddit-search.js';
import { fastCrawl } from '../../research/fastcrawl.js';
import { storeWebDoc } from '../../research/store-web-doc.js';
import { ENV } from '../../env.server.js';

export async function handleGitHubSearch(args: {
  query: string;
  search_type?: 'issues' | 'code' | 'repos';
  limit?: number;
}): Promise<{ success: boolean; result?: any; error?: string }> {
  if (!ENV.GITHUB_TOKEN) return { success: false, error: 'GITHUB_TOKEN is not configured in .env' };
  try {
    const type = args.search_type ?? 'issues';
    let results;
    if (type === 'issues')     results = await githubSearch.issues(args.query, args.limit ?? 5);
    else if (type === 'code')  results = await githubSearch.code(args.query, args.limit ?? 5);
    else                       results = await githubSearch.repos(args.query, args.limit ?? 5);
    return { success: true, result: results };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function handleRedditSearch(args: {
  query: string;
  limit?: number;
}): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    const results = await redditSearch.search(args.query, args.limit ?? 5);
    return { success: true, result: results };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function handleWebIngest(args: {
  url: string;
}): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    const doc = await fastCrawl(args.url);
    if (!doc) return { success: false, error: 'Failed to crawl URL' };
    const res = await storeWebDoc(doc);
    return { success: true, result: { doc_id: doc.id, ...res } };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
