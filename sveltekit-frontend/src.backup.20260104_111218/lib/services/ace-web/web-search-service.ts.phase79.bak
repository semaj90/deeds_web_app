/**
 * Web Search Service
 * Integrates with web search APIs (DuckDuckGo, Brave, etc.)
 * Stores search result snapshots in MinIO
 */

import { MinIOService } from './minio-service.js';
import { createHash } from 'crypto';

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  publishedDate?: string;
}

export interface SearchOptions {
  limit?: number;
  region?: string;
  safeSearch?: boolean;
  timeRange?: 'day' | 'week' | 'month' | 'year' | 'all';
}

export interface SearchSnapshot {
  query: string;
  results: SearchResult[];
  timestamp: string;
  provider: string;
  totalResults: number;
}

export class WebSearchService {
  private minioService: MinIOService;
  private provider: 'duckduckgo' | 'brave' | 'mock';
  private braveApiKey?: string;

  constructor(config?: { provider?: 'duckduckgo' | 'brave' | 'mock'; braveApiKey?: string }) {
    this.minioService = new MinIOService();
    this.provider = config?.provider || 'mock'; // Default to mock for development
    this.braveApiKey = config?.braveApiKey || process.env.BRAVE_API_KEY;
  }

  /**
   * Search the web and return top results
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { limit = 10, region = 'us', safeSearch = true, timeRange = 'all' } = options;

    console.log(`[WebSearch] Searching: "${query}" (provider: ${this.provider})`);

    let results: SearchResult[];

    try {
      if (this.provider === 'duckduckgo') {
        results = await this.searchDuckDuckGo(query, limit, region, safeSearch);
      } else if (this.provider === 'brave') {
        results = await this.searchBrave(query, limit, region, safeSearch, timeRange);
      } else {
        // Mock provider for development/testing
        results = await this.searchMock(query, limit);
      }

      console.log(`[WebSearch] Found ${results.length} results`);

      // Store search snapshot in MinIO
      await this.storeSearchSnapshot(query, results);

      return results;
    } catch (error) {
      console.error('[WebSearch] Search failed:', error);
      throw error;
    }
  }

  /**
   * Search using DuckDuckGo HTML API
   */
  private async searchDuckDuckGo(
    query: string,
    limit: number,
    region: string,
    safeSearch: boolean
  ): Promise<SearchResult[]> {
    // DuckDuckGo HTML scraping (simple approach)
    // Note: This is a basic implementation. For production, consider using a proper API or service
    const encodedQuery = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}&kl=${region}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ACE-Bot/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed: ${response.status}`);
    }

    const html = await response.text();

    // Parse HTML to extract results (basic regex parsing)
    const results: SearchResult[] = [];
    const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([^<]+)<\/a>/g;

    let match;
    let count = 0;

    while ((match = resultRegex.exec(html)) !== null && count < limit) {
      const url = match[1];
      const title = match[2];

      // Extract domain
      const domain = new URL(url).hostname;

      // Try to find snippet
      const snippetMatch = snippetRegex.exec(html);
      const snippet = snippetMatch ? snippetMatch[1] : '';

      results.push({
        url,
        title,
        snippet,
        domain,
      });

      count++;
    }

    return results;
  }

  /**
   * Search using Brave Search API
   */
  private async searchBrave(
    query: string,
    limit: number,
    region: string,
    safeSearch: boolean,
    timeRange: string
  ): Promise<SearchResult[]> {
    if (!this.braveApiKey) {
      throw new Error('Brave API key not configured');
    }

    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', limit.toString());
    url.searchParams.set('country', region);
    url.searchParams.set('safesearch', safeSearch ? 'strict' : 'off');

    if (timeRange !== 'all') {
      url.searchParams.set('freshness', timeRange);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': this.braveApiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Brave Search API failed: ${response.status}`);
    }

    const data = await response.json();

    const results: SearchResult[] = (data.web?.results || []).map((result: any) => ({
      url: result.url,
      title: result.title,
      snippet: result.description || '',
      domain: new URL(result.url).hostname,
      publishedDate: result.age,
    }));

    return results;
  }

  /**
   * Mock search for development/testing
   */
  private async searchMock(query: string, limit: number): Promise<SearchResult[]> {
    console.log('[WebSearch] Using mock search provider');

    // Return mock results based on query keywords
    const mockResults: SearchResult[] = [];

    // Svelte-related queries
    if (query.toLowerCase().includes('svelte')) {
      mockResults.push(
        {
          url: 'https://svelte.dev/docs/introduction',
          title: 'Introduction / Svelte',
          snippet: 'Svelte is a radical new approach to building user interfaces...',
          domain: 'svelte.dev',
          publishedDate: '2024-12-01',
        },
        {
          url: 'https://svelte.dev/docs/svelte/overview',
          title: 'Svelte 5 Overview',
          snippet: 'Svelte 5 introduces runes, a new way to declare reactive state...',
          domain: 'svelte.dev',
          publishedDate: '2024-11-15',
        },
        {
          url: 'https://kit.svelte.dev/docs/introduction',
          title: 'Introduction • SvelteKit',
          snippet: 'SvelteKit is a framework for building web applications...',
          domain: 'kit.svelte.dev',
          publishedDate: '2024-12-10',
        }
      );
    }

    // TypeScript-related queries
    if (query.toLowerCase().includes('typescript')) {
      mockResults.push(
        {
          url: 'https://www.typescriptlang.org/docs/',
          title: 'TypeScript Documentation',
          snippet: 'TypeScript is a strongly typed programming language...',
          domain: 'typescriptlang.org',
          publishedDate: '2024-12-05',
        },
        {
          url: 'https://www.typescriptlang.org/docs/handbook/intro.html',
          title: 'The TypeScript Handbook',
          snippet: 'About this Handbook. The TypeScript Handbook is intended...',
          domain: 'typescriptlang.org',
          publishedDate: '2024-11-20',
        }
      );
    }

    // Error-related queries
    if (query.toLowerCase().includes('error') || query.toLowerCase().includes('fix')) {
      mockResults.push(
        {
          url: 'https://stackoverflow.com/questions/typescript-error',
          title: 'How to fix TypeScript errors in Svelte components',
          snippet: 'When working with Svelte 5 and TypeScript, you may encounter...',
          domain: 'stackoverflow.com',
          publishedDate: '2024-12-15',
        },
        {
          url: 'https://github.com/sveltejs/svelte/issues/12345',
          title: 'TypeScript error with runes in Svelte 5',
          snippet: 'Discussion about TypeScript compatibility with Svelte 5 runes...',
          domain: 'github.com',
          publishedDate: '2024-12-18',
        }
      );
    }

    // Generic fallback
    if (mockResults.length === 0) {
      mockResults.push(
        {
          url: 'https://developer.mozilla.org/en-US/docs/Web',
          title: 'MDN Web Docs',
          snippet: 'Resources for developers, by developers...',
          domain: 'developer.mozilla.org',
          publishedDate: '2024-12-01',
        },
        {
          url: 'https://web.dev/',
          title: 'web.dev',
          snippet: 'Guidance to build modern web experiences...',
          domain: 'web.dev',
          publishedDate: '2024-11-25',
        }
      );
    }

    return mockResults.slice(0, limit);
  }

  /**
   * Store search snapshot in MinIO
   */
  private async storeSearchSnapshot(query: string, results: SearchResult[]): Promise<void> {
    try {
      const queryHash = createHash('sha256').update(query).digest('hex').substring(0, 16);
      const timestamp = new Date().toISOString();

      const snapshot: SearchSnapshot = {
        query,
        results,
        timestamp,
        provider: this.provider,
        totalResults: results.length,
      };

      const key = `search/${queryHash}/${timestamp}.json`;

      await this.minioService.storeObject(
        'ace-web-raw',
        key,
        JSON.stringify(snapshot, null, 2),
        'application/json'
      );

      console.log(`[WebSearch] Snapshot stored: ${key}`);
    } catch (error) {
      console.error('[WebSearch] Failed to store snapshot:', error);
      // Don't throw - snapshot storage is not critical
    }
  }

  /**
   * Get search history for a query
   */
  async getSearchHistory(query: string, limit: number = 10): Promise<SearchSnapshot[]> {
    try {
      const queryHash = createHash('sha256').update(query).digest('hex').substring(0, 16);
      const prefix = `search/${queryHash}/`;

      // List objects with prefix
      const objects = await this.minioService.listObjects('ace-web-raw', prefix);

      // Sort by timestamp descending
      objects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

      // Load snapshots
      const snapshots: SearchSnapshot[] = [];

      for (const obj of objects.slice(0, limit)) {
        const content = await this.minioService.getObject('ace-web-raw', obj.key);
        const snapshot = JSON.parse(content) as SearchSnapshot;
        snapshots.push(snapshot);
      }

      return snapshots;
    } catch (error) {
      console.error('[WebSearch] Failed to get search history:', error);
      return [];
    }
  }
}
