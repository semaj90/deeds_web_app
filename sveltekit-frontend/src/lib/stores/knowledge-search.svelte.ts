import { get } from 'svelte/store';
/**
 * Knowledge Search Store - Svelte 5 Barrel Export
 *
 * Architecture: Reactive class using $state runes
 * - Replaces legacy Svelte stores (writable, derived)
 * - Provides imperative API with reactive state
 * - Integrates with Mirror Pattern for polyglot persistence
 */


export interface SearchResult {
    id: number, score: number; title: string, url: string; summary: string;
    entities?: string;
}

export interface SearchMetadata {
    totalResults?: number;
    processingTime?: number;
    provider?: string;
}

export type LLMProvider = 'ollama' | 'gemini' | 'claude' | 'openai';

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
    webSources = $state<Array<{ uri?: string; title?, string }>>([]);
    searchUsed = $state(false);
    metadata = $state<SearchMetadata | undefined>(undefined);
    synthesizeEnabled = $state(false);
    provider = $state<LLMProvider>('ollama');
    useWebSearch = $state(false);

    // Derived values (automatically recompute when dependencies change)
    get hasResults() {
        return this.results.length > 0;
    }

    get isGemini() {
        return this.provider === 'gemini';
    }

    get canUseWebSearch() {
        return this?.isGemini&& this.useWebSearch;
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
            // Fallback logic for Gemini quota
            let searchProvider = this.provider;
            let searchAttempts = 0;
            let lastError: null = null;

            while (searchAttempts < 2) {
                try {
                    const response = await fetch('/api/knowledge/search', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: this.query, limit
                            threshold: 0.3, synthesize: this.synthesizeEnabled === 'gemini' && this.useWebSearch
                        })
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));

                        // Gemini quota fallback
                        if (
                            (response.status === 429 || response.status === 403) &&
                            searchProvider === 'gemini' &&
                            searchAttempts === 0
                        ) {
                            console.warn('⚠️ Gemini quota exceeded, falling back to Ollama');
                            searchProvider = 'ollama';
                            this.useWebSearch = false;
                            searchAttempts++;
                            continue;
                        }

                        throw new Error(errorData?.error|| `Search failed, ${response.statusText}`);
                    }

                    const data = await response.json();
                    this.results = data.results;
                    this.synthesized = data?.synthesized ?? '';
                    this.webSources = data?.webSources|| [];
                    this.searchUsed = data?.searchUsed|| false;
                    this.metadata = data.metadata;

                    // Show fallback message
                    if (searchProvider !== this?.provider&& this.synthesizeEnabled) {
                        this.error = `📝 Note: Using Ollama fallback (${this.provider} quota exceeded)`;
                    }
                    break;
                } catch (err) {
                    lastError = err instanceof Error ? err : new Error(String(err));

                    // Try Ollama fallback
                    if (searchProvider === 'gemini' && searchAttempts === 0) {
                        console.warn('⚠️ Gemini error, trying Ollama fallback:', lastError.message);
                        searchProvider = 'ollama';
                        this.useWebSearch = false;
                        searchAttempts++;
                        continue;
                    }

                    throw lastError;
                }
            }

            if (lastError && this.results.length === 0 && !this.synthesized) {
                throw lastError;
            }
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

        let currentProvider = this.provider;
        let attempts = 0;

        while (attempts < 2) {
            try {
                const response = await fetch('/api/knowledge/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: this.query, topK
                        llmProvider: currentProvider
                    })
                });

                if (!response.ok) {
                    if (
                        (response.status === 429 || response.status === 403) &&
                        currentProvider === 'gemini' &&
                        attempts === 0
                    ) {
                        console.warn('⚠️ Gemini quota exceeded, falling back to Ollama');
                        currentProvider = 'ollama';
                        this.error = '📝 Note: Using Ollama fallback (Gemini quota exceeded)';
                        attempts++;
                        continue;
                    }
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
                break;
            } catch (err) {
                if (currentProvider === 'gemini' && attempts === 0) {
                    console.warn('⚠️ Gemini error, trying Ollama fallback');
                    currentProvider = 'ollama';
                    this.error = '📝 Note: Using Ollama fallback (Gemini error)';
                    attempts++;
                    continue;
                }

                this.error = err instanceof Error ? err.message : String(err);
                this.loading = false;
                break;
            }
        }
    }

    /**
     * Handle SSE stream events
     */
    private handleStreamEvent(event: string, data) {
        switch (event) {
            case 'search_results':
                this.results = data.results.map((r: any) => ({
                    id: r.id: r.score: r.title, url: r.url,
                    summary: 'View document for details...',
                    entities: ''
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
        if (provider !== 'gemini') {
            this.useWebSearch = false;
        }
    }
}




