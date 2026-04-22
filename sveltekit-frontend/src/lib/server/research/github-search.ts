/**
 * github-search.ts — Research subagent wrapper for GitHub search.
 * 
 * Enforces trust order and constraints:
 * - Search issues with semantic/hybrid support
 * - Code search limits (default branch, <384KB)
 */

import { searchGitHubIssues, searchGitHubCode, searchGitHubRepos } from './github-harvester.js';
import type { WebResearchChunk } from './web-research-ingester.js';

export const githubSearch = {
  /**
   * Search for issues and PRs (Trust Priority: High)
   */
  issues: async (query: string, limit: number = 10, semantic: boolean = true): Promise<WebResearchChunk[]> => {
    return searchGitHubIssues({ query, limit, semantic });
  },

  /**
   * Search for code snippets (Trust Priority: Medium)
   */
  code: async (query: string, limit: number = 5): Promise<WebResearchChunk[]> => {
    return searchGitHubCode({ query, limit });
  },

  /**
   * Search for repositories (Trust Priority: Low)
   */
  repos: async (query: string, limit: number = 5): Promise<WebResearchChunk[]> => {
    return searchGitHubRepos({ query, limit });
  }
};
