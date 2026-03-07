<script lang="ts">
  import  Button  from "$lib/components/ui/core.svelte";
  import  Card, CardContent, CardHeader, CardTitle  from "$lib/components/ui/card.svelte";
  import type { onMount  } from 'svelte';

  interface VectorResult {
    id: string;
    content?: string;
    textContent?: string;
    similarity: number;
    metadata: any;
    source: string;
    contentType?: string;
    caseId?: string;
    evidenceId?: string;
  }

  let results = $state<VectorResult[]>([]);
  let loading = $state(false);
  let query = $state('');
  let searchType = $state<'content' | 'cases' | 'evidence'>('content');
  let threshold = $state(0.7);
  let limit = $state(10);
  let processingTime = $state(0);

  async function performVectorSearch() {
    if (!query.trim()) return;

    try {
      loading = true;
      const response = await fetch('/api/ai/vector-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), type: searchType, threshold, limit }),
      });

      const data = await response.json();
      results = data.results || [];
      processingTime = data.metadata?.processingTime || 0;
    } catch (error) {
      console.error('Vector search failed:', error);
      results = [];
    } finally {
      loading = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      performVectorSearch();
    }
  }

  function getSimilarityColor(similarity: number): string {
    if (similarity > 0.9) return '#00ff00';
    if (similarity > 0.8) return '#66ff66';
    if (similarity > 0.7) return '#ffaa00';
    if (similarity > 0.6) return '#ff6600';
    return '#ff3333';
  }

  function formatContent(content: string): string {
    return content.length > 200 ? content.substring(0, 200) + '...' : content;
  }
</script>

<svelte:head>
  <title>Vector Search | YoRHa Legal AI</title>
  <meta name="description" content="Semantic vector search powered by AI embeddings" />
</svelte:head>

<div class="vector-search-page">
  <div class="page-header">
    <h1>🎯 Vector Search</h1>
    <p>Semantic similarity search using AI embeddings</p>
  </div>

  <!-- Search Interface -->
  <Card class="search-card">
    <CardHeader>
      <CardTitle>🔍 Semantic Search Query</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="search-form">
        <div class="query-input">
          <textarea
            bind:value={query}
            onkeydown={handleKeydown}
            placeholder="Enter your search query... (e.g., 'contract breach damages', 'evidence tampering cases')"
            class="query-textarea"
            rows="3"
          ></textarea>
        </div>

        <div class="search-options">
          <div class="option-group">
            <label>Search Type:</label>
            <select bind:value={searchType} class="search-type-select">
              <option value="content">General Content</option>
              <option value="cases">Legal Cases</option>
              <option value="evidence">Evidence</option>
            </select>
          </div>

          <div class="option-group">
            <label>Similarity Threshold:</label>
            <input
              type="range"
              bind:value={threshold}
              min="0.1"
              max="1.0"
              step="0.1"
              class="threshold-slider"
            />
            <span class="threshold-value">{threshold}</span>
          </div>

          <div class="option-group">
            <label>Results Limit:</label>
            <input type="number" bind:value={limit} min="1" max="50" class="limit-input" />
          </div>
        </div>

        <div class="search-actions">
          <Button
            onclick={performVectorSearch}
            disabled={!query.trim() || loading}
            class="search-button"
          >
            {#if loading}
              🔄 Searching...
            {:else}
              🎯 Vector Search
            {/if}
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- Search Results -->
  {#if loading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Performing semantic vector search...</p>
    </div>
  {:else if results.length === 0 && query}
    <div class="empty-state">
      <div class="empty-icon">🎯</div>
      <h3>No similar results found</h3>
      <p>Try lowering the similarity threshold or using different search terms</p>
    </div>
  {:else if results.length > 0}
    <div class="results-section">
      <div class="results-header">
        <h3>📊 Search Results</h3>
        <div class="results-meta">
          Found {results.length} results in {processingTime}ms
        </div>
      </div>

      <div class="results-grid">
        {#each Array.isArray(results) ? results : [] as result}
          <Card class="result-card">
            <CardHeader>
              <CardTitle class="result-title">
                {#if result.contentType}
                  <span class="content-type-badge">{result.contentType.toUpperCase()}</span>
                {/if}
                Result #{result.id}
              </CardTitle>
              <div class="similarity-badge" style="color: {getSimilarityColor(result.similarity)}">
                {Math.round(result.similarity * 100)}% Match
              </div>
            </CardHeader>
            <CardContent>
              <div class="result-content">
                {formatContent(result.content || result.textContent || 'No content available')}
              </div>

              {#if result.metadata && Object.keys(result.metadata).length > 0}
                <div class="metadata-section">
                  <strong>Metadata:</strong>
                  <div class="metadata-content">
                    {JSON.stringify(result.metadata, null, 2)}
                  </div>
                </div>
              {/if}

              <div class="result-footer">
                <div class="result-source">
                  Source: {result.source}
                </div>
                <div class="result-actions">
                  {#if result.caseId}
                    <Button size="sm" href="/cases/{result.caseId}">📁 View Case</Button>
                  {/if}
                  {#if result.evidenceId}
                    <Button size="sm" href="/evidence/{result.evidenceId}">🔍 View Evidence</Button>
                  {/if}
                  <Button size="sm" class="analyze-button">🧠 AI Analysis</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Search Tips -->
  {#if !query}
    <Card class="tips-card">
      <CardHeader>
        <CardTitle>💡 Vector Search Tips</CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="tips-list">
          <li>
            Use natural language queries like: "contract breach damages" or: "witness credibility
            issues"
          </li>
          <li>Vector search finds semantically similar content, not just keyword matches</li>
          <li>Lower similarity thresholds will return more results but may be less relevant</li>
          <li>Try different search types (content/cases/evidence) for specialized results</li>
          <li>The AI understands legal concepts and relationships between terms</li>
        </ul>
      </CardContent>
    </Card>
  {/if}
</div>

<style>
  .vector-search-page {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 1rem;
  }

  .page-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .page-header h1 {
    font-size: 2.5rem;
    color: var(--text-primary, #00ccff);
    margin-bottom: 0.5rem;
    text-shadow: 0 0 15px currentColor;
  }

  .search-card,
  .tips-card {
    margin-bottom: 2rem;
    background: var(--surface-secondary, #111111);
    border: 1px solid var(--border-primary, #00ccff);
  }

  .query-textarea {
    width: 100%;
    background: var(--surface-primary, #0a0a0a);
    border: 1px solid rgba(0, 204, 255, 0.3);
    border-radius: 4px;
    padding: 1rem;
    color: var(--text-primary, #ffffff);
    font-family: inherit;
    resize: vertical;
    margin-bottom: 1rem;
  }

  .query-textarea:focus {
    outline: none;
    border-color: var(--text-primary, #00ccff);
    box-shadow: 0 0 15px rgba(0, 204, 255, 0.3);
  }

  .search-options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .option-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .option-group label {
    color: var(--text-primary, #00ccff);
    font-weight: bold;
    font-size: 0.9rem;
  }

  .search-type-select,
  .limit-input {
    background: var(--surface-primary, #0a0a0a);
    border: 1px solid rgba(0, 204, 255, 0.3);
    border-radius: 4px;
    padding: 0.5rem;
    color: var(--text-primary, #ffffff);
  }

  .threshold-slider {
    width: 100%;
  }

  .threshold-value {
    color: var(--text-primary, #00ccff);
    font-weight: bold;
    font-family: monospace;
  }

  .search-actions {
    text-align: center;
  }

  .loading-state,
  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--text-secondary, #888888);
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(0, 204, 255, 0.3);
    border-top: 3px solid var(--text-primary, #00ccff);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .results-section {
    margin-bottom: 2rem;
  }

  .results-header {
    display: flex;
    justify-content: space-betweennn;
    align-items: center;
    margin-bottom: 1.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(0, 204, 255, 0.3);
  }

  .results-header h3 {
    color: var(--text-primary, #00ccff);
    margin: 0;
  }

  .results-meta {
    color: var(--text-secondary, #888888);
    font-size: 0.9rem;
  }

  .results-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(450px, 1fr));
    gap: 1.5rem;
  }

  /* Use global selectors because classes are applied to components
     (Card / CardTitle) and Svelte's analyzer can't see them otherwise. */
  :global(.result-card) {
    background: var(--surface-secondary, #111111);
    border: 1px solid var(--border-primary, #00ccff);
    transition: all 0.3s ease;
  }

  :global(.result-card:hover) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 204, 255, 0.2);
  }

  :global(.result-title) {
    color: var(--text-primary, #00ccff);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .content-type-badge {
    background: rgba(0, 204, 255, 0.2);
    padding: 0.2rem 0.4rem;
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: bold;
  }

  .similarity-badge {
    font-weight: bold;
    font-size: 0.9rem;
  }

  .result-content {
    color: var(--text-primary, #ffffff);
    line-height: 1.4;
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: rgba(0, 204, 255, 0.05);
    border-radius: 4px;
  }

  .metadata-section {
    margin-bottom: 1rem;
  }

  .metadata-content {
    background: rgba(0, 0, 0, 0.3);
    padding: 0.5rem;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.8rem;
    color: var(--text-secondary, #cccccc);
    overflow-x: auto;
    white-space: pre-wrap;
  }

  .result-footer {
    display: flex;
    justify-content: space-betweennn;
    align-items: center;
    border-top: 1px solid rgba(0, 204, 255, 0.2);
    padding-top: 0.75rem;
  }

  .result-source {
    color: var(--text-secondary, #888888);
    font-size: 0.8rem;
  }

  .result-actions {
    display: flex;
    gap: 0.5rem;
  }

  .tips-list {
    color: var(--text-secondary, #888888);
    line-height: 1.6;
  }

  .tips-list li {
    margin-bottom: 0.5rem;
  }

  @media (max-width: 768px) {
    .search-options {
      grid-template-columns: 1fr;
    }

    .results-grid {
      grid-template-columns: 1fr;
    }

    .results-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .page-header h1 {
      font-size: 2rem;
    }
  }
</style>
