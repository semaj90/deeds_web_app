<script lang="ts">
  import  Button  from "$lib/components/ui/core.svelte";
  import  Card, CardContent, CardHeader, CardTitle  from "$lib/components/ui/card.svelte";
  import type { onMount  } from 'svelte';

  interface Citation {
    id: string;
    citationType: string;
    formattedCitation string;
    quotedText: string;
    legalPrinciple: string;
    relevanceScore: string;
    isKeyAuthority: boolean;
    documentTitle?: string;
    caseTitle?: string;
  }

  let citations = $state<Citation[]>([]);
  let loading = $state(true);
  let searchQuery = $state('');
  let citationType = $state('all');

  onMount(async () => {
    await loadCitations();
  });

  async function loadCitations() {
    try {
      loading = true;
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (citationType !== 'all') params.set('citationType', citationType);

      const response = await fetch(`/api/legal/citations?${params}`);
      const data = await response.json();
      citations = data.citations || [];
    } catch (error) {
      console.error('Failed to load citations:', error);
    } finally {
      loading = false;
    }
  }

  async function handleSearch() {
    await loadCitations();
  }
</script>

<svelte:head>
  <title>Legal Citations | YoRHa Legal AI</title>
  <meta name="description" content="Legal citation management and validation system" />
</svelte:head>

<div class="citations-page">
  <div class="page-header">
    <h1>📝 Legal Citations</h1>
    <p>Manage and validate legal citations with AI assistance</p>
  </div>

  <!-- Search and Filters -->
  <Card class="search-card">
    <CardContent>
      <div class="search-controls">
        <div class="search-input">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search citations, quoted text, or legal principles..."
            class="search-field"
          />
        </div>
        <div class="filter-controls">
          <select bind:value={citationType} class="citation-type-select">
            <option value="all">All Types</option>
            <option value="case">Case Citations</option>
            <option value="statute">Statute Citations</option>
            <option value="regulation">Regulation Citations</option>
          </select>
        </div>
        <Button onclick={handleSearch} class="search-button">🔍 Search</Button>
      </div>
    </CardContent>
  </Card>

  <!-- Citations Results -->
  {#if loading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading citations...</p>
    </div>
  {:else if citations.length === 0}
    <div class="empty-state">
      <div class="empty-icon">📝</div>
      <h3>No citations found</h3>
      <p>Try adjusting your search criteria or add new citations</p>
    </div>
  {:else}
    <div class="citations-grid">
      {#each Array.isArray(citations) ? citations : [] as citation}
        <Card class="citation-card">
          <CardHeader>
            <CardTitle class="citation-type">
              {citation.citationType.toUpperCase()}
              {#if citation.isKeyAuthority}
                <span class="key-authority-badge">KEY</span>
              {/if}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="formatted-citation">
              {citation.formattedCitation}
            </div>

            {#if citation.quotedText}
              <blockquote class="quoted-text">
                "{citation.quotedText}"
              </blockquote>
            {/if}

            {#if citation.legalPrinciple}
              <div class="legal-principle">
                <strong>Legal Principle:</strong>
                {citation.legalPrinciple}
              </div>
            {/if}

            <div class="citation-footer">
              <div class="relevance-score">
                Relevance: {Math.round(parseFloat(citation.relevanceScore) * 100)}%
              </div>
              <div class="citation-actions">
                <Button size="sm" class="copy-button">📋 Copy</Button>
                <Button size="sm" class="edit-button">✏️ Edit</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      {/each}
    </div>
  {/if}
</div>

<style>
  .citations-page {
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
    color: var(--text-primary, #00ff00);
    margin-bottom: 0.5rem;
    text-shadow: 0 0 15px currentColor;
  }

  .search-card {
    margin-bottom: 2rem;
    background: var(--surface-secondary, #111111);
    border: 1px solid var(--border-primary, #00ff00);
  }

  .search-controls {
    display: grid;
    grid-template-columns: 2fr 1fr auto;
    gap: 1rem;
    align-items: center;
  }

  .search-field,
  .citation-type-select {
    background: var(--surface-primary, #0a0a0a);
    border: 1px solid rgba(0, 255, 0, 0.3);
    border-radius: 4px;
    padding: 0.75rem;
    color: var(--text-primary, #ffffff);
    font-family: inherit;
  }

  .search-field:focus,
  .citation-type-select:focus {
    outline: none;
    border-color: var(--text-primary, #00ff00);
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
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
    border: 3px solid rgba(0, 255, 0, 0.3);
    border-top: 3px solid var(--text-primary, #00ff00);
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

  .empty-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .citations-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 1.5rem;
  }

  .citation-card {
    background: var(--surface-secondary, #111111);
    border: 1px solid var(--border-primary, #00ff00);
    transition: all 0.3s ease;
  }

  .citation-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 255, 0, 0.2);
  }

  .citation-type {
    color: var(--text-primary, #00ff00);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .key-authority-badge {
    background: var(--accent-primary, #ff6600);
    color: white;
    padding: 0.2rem 0.4rem;
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: bold;
  }

  .formatted-citation {
    font-family: 'Times New Roman', serif;
    font-style: italic;
    color: var(--text-primary, #ffffff);
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: rgba(0, 255, 0, 0.05);
    border-left: 3px solid var(--text-primary, #00ff00);
  }

  .quoted-text {
    font-style: italic;
    color: var(--text-secondary, #cccccc);
    margin: 1rem 0;
    padding: 0.75rem;
    background: rgba(0, 0, 0, 0.3);
    border-left: 3px solid var(--text-secondary, #888888);
  }

  .legal-principle {
    color: var(--text-secondary, #888888);
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }

  .citation-footer {
    display: flex;
    justify-content: space-betweennn;
    align-items: center;
    border-top: 1px solid rgba(0, 255, 0, 0.2);
    padding-top: 0.75rem;
  }

  .relevance-score {
    color: var(--text-primary, #00ff00);
    font-size: 0.8rem;
    font-weight: bold;
  }

  .citation-actions {
    display: flex;
    gap: 0.5rem;
  }

  @media (max-width: 768px) {
    .search-controls {
      grid-template-columns: 1fr;
    }

    .citations-grid {
      grid-template-columns: 1fr;
    }

    .page-header h1 {
      font-size: 2rem;
    }
  }
</style>
