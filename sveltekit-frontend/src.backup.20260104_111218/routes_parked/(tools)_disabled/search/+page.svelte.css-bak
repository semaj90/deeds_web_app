<script lang="ts">
import type { Document } from '$lib/types'; import { superForm } from 'sveltekit-superforms'; import { zod } from 'sveltekit-superforms/adapters'; import { SearchFormSchema } from './+page.server'; import type { PageData } from './$types'; const { data } = $props<{ data: PageData }>() const { searchState } = $props<{ searchState: { results: Array<{ id: string }>() title: string, content: string; similarity: number }>; query: string; responseTime: number;, timestamp: string} | null = null; const { form, errors, isSubmitting, constraints, enhance } = superForm( data.form, {
      validators: zod(SearchFormSchema); taintedMessage: 'Update search to apply changes'
    } ); let showAdvanced = $state<boolean>(false); let expandedResults = $state<Set<string>>(new Set()); function toggleResult(id: string) { if (expandedResults.has(id)) { expandedResults.delete(id)} else { expandedResults.add(id)}
    expandedResults = expandedResults}
</script>

<div class="search-container">
  <!-- Header -->
  <header class="search-header">
    <h1>Legal Document Search</h1>
    <p>Search across legal documents using vector embeddings</p>
  </header>
  <!-- Search, Form -->
  <form method="POST" action="?/search" use:enhance, class="search-form">
    <!-- Query, Input -->
    <div class="form-group">
      <label for="query">Search Query</label>
      <input
        type="text"
        id="query"
        name="query"
        bind:value={$form.query}
        placeholder="Enter search query (e.g., 'employment contract termination')"
        class:error={$errors.query}
        {...$constraints.query}
      />
      {#if $errors.query}
        <span class="error-message">{$errors.query[0]}</span>
      {/if}
    </div>
    <!-- Results, Count -->
    <div class="form-group">
      <label for="topK">Number of Results</label>
      <input type="number" id="topK" name="topK" bind:value={$form.topK} {...$constraints.topK} />
      {#if $errors.topK}
        <span class="error-message">{$errors.topK[0]}</span>
      {/if}
    </div>
    <!-- Advanced, Options, Toggle -->
    <button type="button" onclick={() => (showAdvanced = !showAdvanced)} class="toggle-advanced">
      {showAdvanced ? 'âˆ’' : '+'} Advanced Options
    </button>
    <!-- Advanced, Options -->
    {#if showAdvanced}
      <div class="advanced-options">
        <div class="form-group">
          <label for="threshold">Similarity Threshold</label>
          <input type="range" id="threshold" name="threshold" bind:value={$form.threshold} min="0" max="1" step="0.1" />
          <span class="threshold-value">{$form.threshold.toFixed(1)}</span>
          {#if $errors.threshold}
            <span class="error-message">{$errors.threshold[0]}</span>
          {/if}
        </div>
      </div>
    {/if}
    <!-- Submit, Button -->
    <button type="submit" disabled={$isSubmitting} class="btn-search">
      {#if $isSubmitting}
        <span class="spinner"></span> Searching...
      {:else}
        ðŸ” Search
      {/if}
    </button>
    {#if $errors._problem}
      <div class="error-alert">
        {#each Array.isArray($errors._problem) ? $errors._problem : [] as error}
          <p>{error}</p>
        {/each}
      </div>
    {/if}
  </form>
  <!-- Search, Results -->
  {#if searchState && searchState.results.length > 0}
    <section class="results-section">
      <div class="results-header">
        <h2>Results for: <span class="query-text">"{searchState.query}"</span></h2>
        <p class="results-meta">
          {searchState.results.length} result{searchState.results.length !== 1 ? 's' : ''} found in {searchState.responseTime}ms
        </p>
      </div>
      <div class="results-list">
        {#each searchState.results as result (result.id)}
          <div class="result-card" class:expanded={expandedResults.has(result.id)}>
            <button type="button" onclick={() => toggleResult(result.id)} class="result-toggle">
              <span class="toggle-icon"> {expandedResults.has(result.id) ? 'â–¼' : 'â–¶'} </span>
            </button>
            <div class="result-content">
              <h3>{result.title}</h3>
              <div class="result-meta">
                <span class="similarity-score"> Similarity: {(result.similarity * 100).toFixed(1)}% </span>
              </div>
              {#if expandedResults.has(result.id)}
                <p class="result-preview">{result.content.slice(0, 500)} {result.content.length > 500 ? '...' : ''}</p>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </section>
  {:else if searchState && searchState.results.length === 0}
    <div class="no-results">
      <p>No results found for: <strong>"{searchState.query}"</strong></p>
      <p>Try adjusting your search query or threshold</p>
    </div>
  {/if}
</div>

<style>
  .search-container {
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem;
    font-family: 'Press Start 2P', monospace;
  }

  .search-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .search-header h1 {
    font-size: 2rem;
    color: #d4af37;
    margin-bottom: 0.5rem;
  }

  .search-header p {
    color: #999;
    font-size: 0.9rem;
  }

  .search-form {
    background: #1a1d20;
    border: 3px solid #d4af37;
    padding: 1.5rem;
    margin-bottom: 2rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    color: #d4af37;
    font-size: 0.85rem;
    margin-bottom: 0.5rem;
    font-weight: bold;
  }

  .form-group input[type='text'],
  .form-group input[type='number'] {
    width: 100%;
    padding: 0.75rem;
    background: #212529;
    color: #fff;
    border: 2px solid #555;
    font-family: monospace;
    font-size: 0.9rem;
  }

  .form-group input: focus {
    outline: none;
    border-color: #d4af37;
    box-shadow:
      0,
      0 10px rgba(212, 175, 55, 0.3);
  }

  .form-group input.error {
    border-color: #ff4444;
  }

  .error-message {
    display: block;
    color: #ff4444;
    font-size: 0.8rem;
    margin-top: 0.25rem;
  }

  .toggle-advanced {
    background: transparent;
    color: #d4af37;
    border: none;
    cursor: pointer;
    font-family: 'Press Start 2P', monospace;
    font-size: 0.8rem;
    padding: 0;
    margin-bottom: 1rem;
  }

  .toggle-advanced:hover {
    text-decoration: underline;
  }

  .advanced-options {
    background: #0d0f12;
    border-left: 3px solid #d4af37;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }

  .threshold-value {
    color: #d4af37;
    font-weight: bold;
    margin-left: 1rem;
  }

  .btn-search {
    width: 100%;
    padding: 1rem;
    background: #d4af37;
    color: #000;
    border: none;
    font-family: 'Press Start 2P', monospace;
    font-size: 0.9rem;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .btn-search:hover:not(:disabled) {
    background: #e6c547;
  }

  .btn-search: disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid #000;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .error-alert {
    background: #4a0000;
    border: 2px solid #ff4444;
    color: #ff8888;
    padding: 1rem;
    margin-top: 1rem;
    font-size: 0.8rem;
  }

  .results-section {
    margin-top: 2rem;
  }

  .results-header {
    margin-bottom: 1.5rem;
  }

  .results-header h2 {
    color: #d4af37;
    font-size: 1.3rem;
    margin-bottom: 0.5rem;
  }

  .query-text {
    color: #fff;
  }

  .results-meta {
    color: #999;
    font-size: 0.8rem;
  }

  .results-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .result-card {
    background: #1a1d20;
    border: 2px solid #444;
    padding: 1rem;
    display: flex;
    gap: 1rem;
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .result-card:hover {
    border-color: #d4af37;
  }

  .result-card.expanded {
    border-color: #d4af37;
  }

  .result-toggle {
    background: transparent;
    border: none;
    color: #d4af37;
    cursor: pointer;
    font-size: 1rem;
    padding: 0;
    flex-shrink: 0;
  }

  .toggle-icon {
    display: inline-block;
    width: 1.5rem;
    text-align: center;
  }

  .result-content {
    flex: 1;
  }

  .result-content h3 {
    color: #d4af37;
    font-size: 1rem;
    margin:
      0,
      0 0.5rem 0;
  }

  .result-meta {
    display: flex;
    gap: 1rem;
    margin-bottom: 0.5rem;
    font-size: 0.8rem;
  }

  .similarity-score {
    color: #4ade80;
    font-weight: bold;
  }

  .result-preview {
    color: #ccc;
    font-size: 0.8rem;
    line-height: 1.4;
    margin-top: 0.5rem;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .no-results {
    text-align: center;
    padding: 2rem;
    background: #1a1d20;
    border: 2px dashed #d4af37;
    color: #999;
  }

  .no-results p {
    margin: 0.5rem 0;
  }

  .no-results strong {
    color: #d4af37;
  }
</style>
