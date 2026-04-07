<script lang="ts">
  interface Props {
    placeholder?: string;
    limit?: number;
    cudaServiceUrl?: string;
    onResults?: ((data: any) => void) | null;
    onError?: ((err: any) => void) | null;
  }

  let {
    placeholder = 'Search legal documents...',
    limit = 5,
    cudaServiceUrl = 'http://localhost:8096',
    onResults = null,
    onError = null
  }: Props = $props();

  interface ResultItem {
    id?: string;
    score?: number;
    task_id?: string;
    payload?: string;
    metadata?: any;
  }

  let query = $state<string>('');
  let isSearching = $state<boolean>(false);
  let results = $state<ResultItem[]>([]);
  let error = $state<string | null>(null);
  let lastSearchTime = $state<number>(0);

  let canSearch = $derived(query.trim().length > 0 && !isSearching);

  async function performSearch(): Promise<void> {
    if (!canSearch) return;

    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    isSearching = true;
    error = null;
    const startTime = Date.now();

    try {
      const response = await fetch(`${cudaServiceUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
q: trimmedQuery, limit })
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      results = (data.results as ResultItem[]) || [];
      lastSearchTime = Date.now() - startTime;

      if (onResults) {
        onResults(data);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error = message;
      results = [];

      if (onError) {
        onError(err);
      }
    } finally {
      isSearching = false;
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      performSearch();
    }
  }

  function formatScore(score?: number): string {
    if (typeof score !== 'number') return 'n/a';
    return (1 - score).toFixed(3);
  }

  function parseMetadata(metadata: any): Record<string, any> | undefined {
    try {
      if (typeof metadata === 'string') return JSON.parse(metadata);
      if (typeof metadata === 'object' && metadata !== null) return metadata;
      return undefined;
    } catch {
      return undefined;
    }
  }
</script>

<div class="search-container nes-container">
  <p class="title">🔍 Legal AI Search</p>

  <div class="search-input-group">
    <input
      type="text"
      bind:value={query}
      onkeydown={handleKeydown}
      {placeholder}
      class="nes-input search-input"
      disabled={isSearching}
    />
    <button
      type="button"
      onclick={performSearch}
      disabled={!canSearch}
      class="nes-btn search-button {canSearch ? 'is-primary' : 'is-disabled'}"
    >
      {#if isSearching}
        ⏳ Searching...
      {:else}
        🚀 Search
      {/if}
    </button>
  </div>

  <div class="search-config">
    <label class="nes-text">
      Results limit:
      <input
        type="number"
        bind:value={limit}
        min="1"
        max="50"
        class="nes-input limit-input"
        disabled={isSearching}
      />
    </label>
    {#if lastSearchTime > 0}
      <span class="search-time nes-text">⚡ {lastSearchTime}ms</span>
    {/if}
  </div>

  {#if error}
    <div class="nes-container is-dark error-container">
      <p class="nes-text">❌ {error}</p>
    </div>
  {/if}

  {#if results.length > 0}
    <div class="results-container">
      <h3 class="nes-text">📋 Search Results ({results.length})</h3>
      {#each results as result, index (result.id ?? index)}
        <div class="result-item nes-container">
          <div class="result-header">
            <span class="result-rank">#{index + 1}</span>
            <span class="result-id nes-text">ID: {result.id}</span>
            <span class="result-score nes-text">📊 {formatScore(result.score)}</span>
          </div>
          {#if result.task_id}
            <p class="nes-text"><strong>Task ID:</strong> {result.task_id}</p>
          {/if}
          <div class="result-payload">
            <p class="nes-text">{result.payload}</p>
          </div>
          {#if result.metadata}
            {@const metadata = parseMetadata(result.metadata)}
            {#if metadata}
              <details class="metadata-details">
                <summary class="nes-text">📋 Metadata</summary>
                <div class="metadata-content">
                  <table class="nes-table is-bordered">
                    <tbody>
                      {#each Object.entries(metadata) as [key, value]}
                        <tr>
                          <td class="nes-text">{key}</td>
                          <td class="nes-text">{value}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </details>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  {:else if query.trim() && !isSearching && !error}
    <div class="no-results nes-container">
      <p class="nes-text">🔍 No results found for: "{query}"</p>
    </div>
  {/if}
</div>

<style>
  .search-container {
    max-width: 800px;
	margin: 20px auto;
    padding: 20px;
  }

  .search-input-group { display: flex;
		gap: 10px;
    margin-bottom: 15px;
    align-items: center;
    flex-wrap: wrap;
  }

  .search-input {
    flex: 1;
    min-width: 300px;
  }

  .search-button {
    white-space: nowrap;
    min-width: 120px;
  }

  .search-config {
    display: flex;
    align-items: center;
	gap: 20px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .limit-input {
    width: 80px;
    margin-left: 10px;
  }

  .search-time {
    font-weight: bold;
  }

  .error-container {
    margin: 20px 0;
  }

  .results-container {
    margin-top: 30px;
  }

  .result-item {
    margin-bottom: 20px;
	padding: 15px;
  }

  .result-header {
    display: flex;
    align-items: center;
	gap: 15px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }

  .result-rank {
    font-size: 0.9em;
  }

  .result-id {
    font-family: monospace;
    font-size: 0.9em;
  }

  .result-score {
    font-weight: bold;
  }

  .result-payload {
    margin: 15px 0;
    background-color: #f8f8f8;
	padding: 10px;
    border-radius: 4px;
  }

  .metadata-details {
    margin-top: 15px;
  }

  .metadata-details summary {
    cursor: pointer;
    margin-bottom: 10px;
    font-weight: bold;
  }

  .metadata-content {
    background-color: #f0f0f0;
	padding: 10px;
    border-radius: 8px;
  }

  .metadata-content table {
    width: 100%;
    font-size: 0.9em;
  }

  .metadata-content td:first-child {
    font-weight: bold;
    background-color: #e0e0e0;
	width: 30%;
  }

  .no-results {
    text-align: center;
	padding: 30px;
    background-color: #f8f8f8;
  }

  @media (max-width: 600px) {
    .search-input-group {
      flex-direction: column;
    }

    .search-input {
      min-width: 100%;
    }

    .search-button {
      width: 100%;
    }

    .search-config {
      flex-direction: column;
      align-items: flex-start;
    }

    .result-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  .nes-input:focus {
    box-shadow: 0 0 0 4px #92cc41;
  }

  .nes-btn.is-disabled { cursor: not-allowed;
		opacity: 0.6;
  }
</style>
