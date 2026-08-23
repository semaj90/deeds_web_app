<script lang="ts">
  import { searchAtlas } from "$lib/client/atlas-search";
  import { writable } from "svelte/store";
  import type { AtlasSearchRequest } from "$lib/server/atlas/atlas-search-contract";

  // State management for the search query and parameters
  let currentQuery = "";
  let selectedIntent: "fix_error" | "diagnose" | "find_todo" | "trace_telemetry" | "retrieve_memory" | "hybrid_search" = "diagnose";
  let selectedMode: "semantic" | "graph" | "telemetry" | "tricubic" = "semantic";
  let isLoading = false;
  let searchResults: {
    id: string;
    title: string;
    snippet: string;
    sourceRef: string;
    score: number;
    scores: {
      vector: number;
      graph: number;
      telemetry: number;
      recency: number;
      validation: number;
    };
    rankReason: string;
    traversalPath?: string[];
    telemetrySignals?: string[];
    provenance?: Record<string, unknown>;
  }[] = [];
  let error: string | null = null;

  /**
   * Handles the form submission, executing the Atlas Search API call.
   */
  async function handleSubmit() {
    if (!currentQuery.trim()) {
      error = "Please enter a search query.";
      return;
    }

    isLoading = true;
    error = null;
    searchResults = [];

    // 1. Construct the request object
    const request: AtlasSearchRequest = {
      query: currentQuery,
      intent: selectedIntent,
      mode: selectedMode,
      // Add other optional fields here if they become available (e.g., topK, filters)
    };

    try {
      // 2. Call the client wrapper
      const response = await searchAtlas(request);
      
      // 3. Update state
      searchResults = response.results;
    } catch (e) {
      console.error("Search failed:", e);
      error = e instanceof Error ? e.message : "An unknown error occurred during the search.";
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="container">
  <h1>Atlas Search (Tricubic Search)</h1>
  <p class="description">Perform a structured search across the codebase by defining a clear intent and search mode.</p>

  <form on:submit|preventDefault={handleSubmit} class="search-form">
    <div class="form-group">
      <label for="query">Query</label>
      <input 
        id="query" 
        bind:value={currentQuery} 
        placeholder="e.g., 'How do I handle user authentication failure?'" 
        required 
        disabled={isLoading}
      />
    </div>

    <div class="form-group">
      <label for="intent">Intent</label>
      <select bind:value={selectedIntent} disabled={isLoading}>
        <option value="diagnose">Diagnose</option>
        <option value="fix_error">Fix Error</option>
        <option value="find_todo">Find ToDo</option>
        <option value="trace_telemetry">Trace Telemetry</option>
        <option value="retrieve_memory">Retrieve Memory</option>
        <option value="hybrid_search">Hybrid Search</option>
      </select>
    </div>

    <div class="form-group">
      <label for="mode">Search Mode</label>
      <select bind:value={selectedMode} disabled={isLoading}>
        <option value="semantic">Semantic (Embedding)</option>
        <option value="graph">Graph (Topology)</option>
        <option value="telemetry">Telemetry (Runtime)</option>
        <option value="tricubic">Tricubic (All Modes)</option>
      </select>
    </div>

    <button type="submit" disabled={isLoading} class="submit-button">
      {isLoading ? "Searching..." : "Run Atlas Search"}
    </button>
  </form>

  {#if error}
    <div class="error-message">Error: {error}</div>
  {/if}

  {#if searchResults.length > 0}
    <div class="results-container">
      <h2>Results Found ({searchResults.length})</h2>
      <div class="result-card" in:each={searchResults} let:result>
        <div class="header">
          <h3>{result.title}</h3>
          <p class="source-ref">Source: {result.sourceRef}</p>
        </div>
        <div class="snippet">
          <p>{result.snippet}</p>
        </div>
        <div class="metadata">
          <p><strong>Rank Reason:</strong> {result.rankReason}</p>
          <p><strong>Score:</strong> {result.score.toFixed(3)}</p>
          <pre><strong>Scores:</strong> {`V: ${result.scores.vector.toFixed(2)}, G: ${result.scores.graph.toFixed(2)}, T: ${result.scores.telemetry.toFixed(2)}`}</pre>
        </div>
        {#if result.traversalPath}
          <p class="path"><strong>Path:</strong> {result.traversalPath.join(" → ")}</p>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  /* Basic styling for readability */
  .container { max-width: 900px; margin: 2rem auto; }
  .search-form { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 2rem; padding: 1rem; border: 1px solid #ccc; border-radius: 8px; }
  .form-group { display: flex; flex-direction: column; gap: 0.25rem; }
  label { font-weight: bold; }
  input, select, button { padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; }
  .submit-button:disabled { opacity: 0.6; cursor: not-allowed; }
  .error-message { color: red; background: #fee; padding: 0.75rem; border-radius: 4px; }
  .result-card { border: 1px solid #ddd; padding: 1rem; margin-bottom: 1rem; border-radius: 6px; background: #f9f9f9; }
  .result-card h3 { margin-top: 0; }
  .source-ref { font-size: 0.8em; color: #666; }
  .metadata pre { background: #eee; padding: 0.5rem; border-radius: 4px; font-size: 0.9em; }
</style>