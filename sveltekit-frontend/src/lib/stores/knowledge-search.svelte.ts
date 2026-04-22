/**
 * Knowledge Search Store - Svelte 5 Barrel Export
 *
 * Architecture: Reactive class using $state runes
 * - Replaces legacy Svelte stores (writable, derived)
 * - Provides imperative API with reactive state
 * - Integrates with Mirror Pattern for polyglot persistence
 */


export interface SearchResult {
    id: number;
	score: number;
    title: string;
	url: string;
    summary: string;
    entities?: string;
}

export interface SearchMetadata {
    totalResults?: number;
    processingTime?: number;
    provider?: string;
}

export type LLMProvider = 'ollama';

/**
 * Knowledge Search Store
 *
 * Usage in components:
 * ```svelte
 * <script>
 *   import { KnowledgeSearchStore } from '$lib/stores/knowledge-search.svelte';
 *   const search = new KnowledgeSearchStore();
 * </script>
 *
 * <button onclick={() => search.query('Svelte 5 runes')}>Search</button>
 * {#if search.loading}Loading...{/if}
 * {#each search.results as result}
 *   <div>{result.title}</div>
 * {/each}
 * ```
 */
export class KnowledgeSearchStore {
  // Reactive state using Svelte 5 runes
  query = $state('');
  loading = $state(false);
  error = $state('');
  results = $state<SearchResult[]>([]);
  synthesized = $state('');
  webSources = $state<Array<{ uri?: string; title?: string }>>([]);
  searchUsed = $state(false);
  metadata = $state<SearchMetadata | undefined>(undefined);
  synthesizeEnabled = $state(false);
  provider = $state<LLMProvider>('ollama');

  // Derived values (automatically recompute when dependencies change)
  get hasResults() {
    return this.results.length > 0;
  }

  get resultCount() {
    return this.results.length;
  }

  /**
   * Execute search query
   */
  async search(queryText?: string) {
    if (queryText) {
      this.query = queryText;
    }

    if (!this.query.trim()) return;

    this.loading = true;
    this.error = '';
    this.results = [];
    this.synthesized = '';
    this.webSources = [];
    this.searchUsed = false;

    try {
      const response = await fetch('/api/knowledge/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: this.query,
          limit: 10,
          threshold: 0.3,
          synthesize: this.synthesizeEnabled,
          llmProvider: this.provider,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || `Search failed, ${response.statusText}`);
      }

      const data = await response.json();
      this.results = data.results;
      this.synthesized = data?.synthesized ?? '';
      this.webSources = data?.webSources || [];
      this.searchUsed = data?.searchUsed || false;
      this.metadata = data.metadata;
    } catch (err) {
      this.error = `❌ ${err instanceof Error ? err.message : 'Unknown error'}`;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Stream search results (Server-Sent Events)
   */
  async *streamSearch(queryText?: string) {
    if (queryText) {
      this.query = queryText;
    }

    if (!this.query.trim()) return;

    this.loading = true;
    this.error = '';
    this.results = [];
    this.synthesized = '';

    try {
      const response = await fetch('/api/knowledge/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: this.query,
          topK: 10,
          llmProvider: this.provider,
        }),
      });

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const eventMatch = line.match(/^event: (.*)$/m);
          const dataMatch = line.match(/^data: (.*)$/m);

          if (eventMatch && dataMatch) {
            const event = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);

            yield { event, data };

            this.handleStreamEvent(event, data);
          }
        }
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.loading = false;
    }
  }

  /**
   * Handle SSE stream events
   */
  private handleStreamEvent(event: string, data: any) {
    switch (event) {
      case 'search_results':
        this.results = data.results.map((r: any) => ({
          id: r.id,
          score: r.score,
          title: r.title,
          url: r.url,
          summary: 'View document for details...',
          entities: '',
        }));
        break;
      case 'synthesis_chunk':
        this.synthesized += data.text;
        break;
      case 'complete':
        this.loading = false;
        break;
      case 'error':
        this.error = data.message;
        this.loading = false;
        break;
    }
  }

  /**
   * Clear search results
   */
  clear() {
    this.query = '';
    this.results = [];
    this.synthesized = '';
    this.webSources = [];
    this.searchUsed = false;
    this.error = '';
    this.metadata = undefined;
  }

  /**
   * Set provider and auto-disable web search for non-Gemini
   */
  setProvider(provider: LLMProvider) {
    this.provider = provider;
  }
}




