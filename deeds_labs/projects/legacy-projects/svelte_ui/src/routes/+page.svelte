<script lang="ts">
  import AgenticSidebar from '$lib/components/AgenticSidebar.svelte';
  import EvidenceViewer from '$lib/components/EvidenceViewer.svelte';
  import LoadingIndicator from '$lib/components/LoadingIndicator.svelte';
  import SearchInterface from '$lib/components/SearchInterface.svelte';

  let searchQuery = '';
  let searchResults: any[] = [];
  let isLoading = false;
  let selectedEvidence: any = null;
  let agenticMode = false;

  async function performSearch() {
    if (!searchQuery.trim()) return;

    isLoading = true;
    try {
      const response = await fetch(`/api/search/${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      searchResults = data.results;
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      isLoading = false;
    }
  }

  function handleEvidenceSelect(evidence: any) {
    selectedEvidence = evidence;
  }

  function toggleAgenticMode() {
    agenticMode = !agenticMode;
  }
</script>

<svelte:head>
  <title>Legal AI Evidence Engine - Noir Detective Mode</title>
  <meta name="description" content="Advanced legal evidence analysis and investigation platform" />
</svelte:head>

<main class="noir-detective-theme">
  <!-- Header -->
  <header class="detective-header">
    <div class="header-content">
      <h1 class="title">🕵️‍♂️ Legal Evidence Engine</h1>
      <p class="subtitle">Investigative Analysis Platform</p>
      <div class="status-indicators">
        <span class="status-item">🔍 OCR Active</span>
        <span class="status-item">🧠 Gemma Online</span>
        <span class="status-item">📊 Vector Search Ready</span>
      </div>
    </div>
  </header>

  <!-- Main Interface -->
  <div class="main-interface">
    <!-- Search Section -->
    <section class="search-section">
      <SearchInterface
        bind:query={searchQuery}
        {isLoading}
        on:search={performSearch}
        on:toggleAgentic={toggleAgenticMode}
      />
    </section>

    <!-- Results Section -->
    <section class="results-section">
      {#if isLoading}
        <LoadingIndicator message="Analyzing evidence..." />
      {:else if searchResults.length > 0}
        <div class="results-grid">
          {#each searchResults as result}
            <div
              class="evidence-card"
              class:selected={selectedEvidence?.id === result.id}
              on:click={() => handleEvidenceSelect(result)}
            >
              <div class="card-header">
                <h3 class="evidence-title">{result.title}</h3>
                <span class="confidence-badge" class:confident={result.confidence > 0.9}>
                  {Math.round(result.confidence * 100)}% confidence
                </span>
              </div>
              <p class="evidence-preview">{result.content.substring(0, 150)}...</p>
              <div class="evidence-meta">
                <span class="evidence-type">{result.evidence_type}</span>
                <span class="timestamp">{new Date(result.timestamp).toLocaleDateString()}</span>
              </div>
            </div>
          {/each}
        </div>
      {:else if searchQuery}
        <div class="no-results">
          <p>No evidence found matching your query.</p>
          <p class="suggestion">Try different keywords or check your search parameters.</p>
        </div>
      {/if}
    </section>

    <!-- Evidence Viewer -->
    {#if selectedEvidence}
      <aside class="evidence-sidebar">
        <EvidenceViewer evidence={selectedEvidence} />
      </aside>
    {/if}

    <!-- Agentic Sidebar -->
    {#if agenticMode}
      <AgenticSidebar
        {searchQuery}
        {searchResults}
        on:close={() => agenticMode = false}
      />
    {/if}
  </div>
</main>

<style>
  .noir-detective-theme {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    color: #e8e8e8;
    min-height: 100vh;
    font-family: 'Courier New', monospace;
  }

  .detective-header {
    background: rgba(0, 0, 0, 0.8);
    border-bottom: 2px solid #ffd700;
    padding: 1rem 2rem;
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
  }

  .header-content {
    max-width: 1200px;
    margin: 0 auto;
  }

  .title {
    color: #ffd700;
    font-size: 2.5rem;
    margin: 0;
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
  }

  .subtitle {
    color: #b8b8b8;
    margin: 0.5rem 0;
    font-style: italic;
  }

  .status-indicators {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
  }

  .status-item {
    background: rgba(255, 215, 0, 0.1);
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.9rem;
    border: 1px solid rgba(255, 215, 0, 0.3);
  }

  .main-interface {
    max-width: 1400px;
    margin: 0 auto;
    padding: 2rem;
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 2rem;
  }

  .search-section {
    grid-column: 1 / -1;
  }

  .results-section {
    min-height: 400px;
  }

  .results-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1.5rem;
  }

  .evidence-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 215, 0, 0.2);
    border-radius: 8px;
    padding: 1.5rem;
    cursor: pointer;
    transition: all 0.3s ease;
    backdrop-filter: blur(10px);
  }

  .evidence-card:hover {
    border-color: #ffd700;
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.2);
    transform: translateY(-2px);
  }

  .evidence-card.selected {
    border-color: #ffd700;
    box-shadow: 0 0 30px rgba(255, 215, 0, 0.4);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }

  .evidence-title {
    color: #ffd700;
    margin: 0;
    font-size: 1.2rem;
  }

  .confidence-badge {
    background: rgba(255, 0, 0, 0.8);
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
  }

  .confidence-badge.confident {
    background: rgba(0, 255, 0, 0.8);
  }

  .evidence-preview {
    color: #b8b8b8;
    line-height: 1.5;
    margin: 1rem 0;
  }

  .evidence-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
    color: #888;
  }

  .no-results {
    text-align: center;
    padding: 3rem;
    color: #888;
  }

  .suggestion {
    margin-top: 0.5rem;
    font-style: italic;
  }

  .evidence-sidebar {
    background: rgba(0, 0, 0, 0.8);
    border-left: 2px solid #ffd700;
    padding: 1.5rem;
    backdrop-filter: blur(10px);
  }

  @media (max-width: 768px) {
    .main-interface {
      grid-template-columns: 1fr;
      padding: 1rem;
    }

    .evidence-sidebar {
      border-left: none;
      border-top: 2px solid #ffd700;
      margin-top: 2rem;
    }

    .title {
      font-size: 2rem;
    }
  }
</style>