/**
 * SearchStore — Svelte 5 Runes (Session 27)
 */

export type SearchScope = 'cases' | 'evidence' | 'documents' | 'poi' | 'citations' | 'reports' | 'all';
export type SearchMode = 'full-text' | 'vector' | 'hybrid';

export interface SearchFilters {
  dateRange?: { start: number | null; end: number | null };
  caseIds?: string[];
  entityTypes?: string[];
  jurisdictions?: string[];
  tags?: string[];
  priority?: 'high' | 'medium' | 'low';
  status?: string;
}

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: SearchFilters;
  scope: SearchScope[];
  mode: SearchMode;
  createdAt: number;
}

class SearchStore {
  query = $state('');
  searchMode = $state<SearchMode>('hybrid');
  searchScope = $state<SearchScope[]>(['all']);
  results = $state<SearchResult[]>([]);
  totalResults = $state(0);
  filters = $state<SearchFilters>({});
  activeFilters = $state<string[]>([]);
  searchTime = $state(0);
  cachedResults = $state<Map<string, SearchResult[]>>(new Map());
  lastSearchQuery = $state('');
  savedSearches = $state<SavedSearch[]>([]);
  isSearching = $state(false);
  error = $state<string | null>(null);
  lastUpdated = $state(0);

  resultsByType = $derived.by(() => {
    const map = new Map<SearchScope, SearchResult[]>();
    this.results.forEach(r => {
      const t = r.type as SearchScope;
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(r);
    });
    return map;
  });

  async search(query: string, options?: { mode?: SearchMode; scope?: SearchScope[] }) {
    const mode = options?.mode ?? 'hybrid';
    const scope = options?.scope ?? ['all'];
    const cacheKey = `${query}-${mode}-${scope.join(',')}`;

    const cached = this.cachedResults.get(cacheKey);
    if (cached) {
      this.query = query;
      this.results = cached;
      this.totalResults = cached.length;
      this.searchTime = 0;
      this.lastSearchQuery = query;
      this.isSearching = false;
      return;
    }

    this.isSearching = true;
    this.query = query;
    this.error = null;

    try {
      const startTime = performance.now();
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, mode, scope, filters: {} })
      });
      if (response.ok) {
        const data = await response.json();
        this.results = data?.results || [];
        this.totalResults = this.results.length;
        this.searchTime = performance.now() - startTime;
        this.lastSearchQuery = query;
        const newCache = new Map(this.cachedResults);
        newCache.set(cacheKey, this.results);
        this.cachedResults = newCache;
        this.lastUpdated = Date.now();
      } else {
        throw new Error('Search failed');
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Search failed';
    } finally {
      this.isSearching = false;
    }
  }

  async vectorSearch(embedding: number[], threshold = 0.7) {
    this.isSearching = true;
    this.error = null;
    try {
      const response = await fetch('/api/search/vector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embedding, threshold })
      });
      if (response.ok) {
        const data = await response.json();
        this.results = data?.results || [];
        this.totalResults = this.results.length;
        return this.results;
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Vector search failed';
    } finally {
      this.isSearching = false;
    }
    return [];
  }

  setFilter<K extends keyof SearchFilters>(filterType: K, value: SearchFilters[K]) {
    this.filters = { ...this.filters, [filterType]: value };
    this.activeFilters = Object.keys(this.filters).filter(k => !!this.filters[k as keyof SearchFilters]);
  }

  clearFilters() {
    this.filters = {};
    this.activeFilters = [];
  }

  clearFilter(filterType: keyof SearchFilters) {
    const newFilters = { ...this.filters };
    delete newFilters[filterType];
    this.filters = newFilters;
    this.activeFilters = Object.keys(this.filters).filter(k => !!this.filters[k as keyof SearchFilters]);
  }

  setSearchScope(scope: SearchScope[]) { this.searchScope = scope; }
  setSearchMode(mode: SearchMode) { this.searchMode = mode; }

  clearCache() {
    this.cachedResults = new Map();
    this.lastSearchQuery = '';
  }
}

export const searchStore = new SearchStore();
