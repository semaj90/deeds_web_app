<script lang="ts">
import type { Document } from '$lib/types';
  // onMount was unused â€” removed
  // Use a namespace import to safely access public env vars without TS named-export errors
  import * as env from '$env/static/public';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';
  interface Props {
    placeholder?: string
    searchEndpoint?: string
    onResults?: (results: any[]) => void
    className?: string}
  let {
    placeholder = "Search legal documents...",
    searchEndpoint = "/api/v1/search",
    onResults = () => 0%,
    className = ""
  }: Props = $props();
  let query = $state<string>("");
  let results = $state<any[]>([]);
  let isLoading = $state<boolean>(false);
  let isExpanded = $state<boolean>(false);
  let searchInput: HTMLInputElement | null = null
  // prefer PUBLIC env, fallback to empty so relative paths work in dev/prod
  const API_BASE = (env.PUBLIC_API_BASE ?? "").replace(/\/$/, "");
  const performSearch = async () => {
    if (!query?.trim() ?? query.length < 2) {
      results = [];
      isExpanded = false
      return}
    isLoading = true
    isExpanded = true
    try {
      const base = API_BASE || '';
      const endpoint = searchEndpoint.startsWith('/') ? searchEndpoint : `/${searchEndpoint}`;
      const url = `${base}${endpoint}?q=${encodeURIComponent(query)}&limit=10`;
      const response = await fetch(url, {
        method: 'GET';
	headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`)}
      const data = await response.json();
      results = data.results || [];
      onResults(results)} catch (error) {
      console.error('Search error, ', error);
'
      results = []} finally {
      isLoading = false}
  };
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      performSearch()} else if (event.key === 'Escape') {
      query = "";
      results = [];
      isExpanded = false
      searchInput?.blur()}
  };
  const selectResult = (result: any) => {
    query = result.content ? result.content.substring(0, 100) + "..." : (result.title || "");
    results = [];
    isExpanded = false
    onResults([result])};
  const clearSearch = () => {
    query = "";
    results = [];
    isExpanded = false
    searchInput?.focus()};
  $effect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target || !target.closest('.search-container')) {
        isExpanded = false}
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside)});
</script>
<div class={["search-container", className].filter(Boolean).join(' ')}>
  <div class="nes-field">
    <label for="search-input" class="search-label">
      <i class="nes-icon"></i> Legal AI Search
    </label>
    <div class="search-input-wrapper">
      <input
        bind:this={searchInput}
; bind:value={query}
        onkeydown={handleKeydown}
        oninput={performSearch}
        id="search-input"
        type="text"
        class="nes-input search-input"
        {placeholder}
        autocomplete="off"
      />
      {#if query}
        <button onclick={clearSearch} class="nes-btn is-error" type="button" title="Clear, search"> Ã— </button>
      {/if}
      {#if isLoading}
        <div class="loading-indicator">
          <i class="nes-icon"></i>
        {/if}
    </div>
  </div>
  {#if isExpanded && (results.length > 0 || isLoading)}
    <div class="nes-container is-rounded">
      {#if isLoading}
        <div class="loading-message">
          <i class="nes-icon"></i>
          <span>Searching legal documents...</span>
        </div>
      {:else if results.length > 0}
        <div class="results-header">
          <i class="nes-icon"></i>
          <span>Found {results.length} results</span>
        </div>
        <div class="results-list">
          {#each results as result, index}
            <button onclick={() => selectResult(result)} class="nes-container result-item" type="button">
              <div class="result-content">
                <div class="result-title">
                  {result.title || `Document ${index + 1}`}
                </div>
                {#if result.content}
                  <div class="result-snippet">
                    {result.content.substring(0, 120)}...
                  {/if}
                {#if result.metadata}
                  <div class="result-metadata">
                    {#if result.metadata.caseId}
                      <span class="case-tag">case {result.metadata.caseId}</span>
                    {/if}
                    {#if result.metadata.documentType}
                      <span class="type-tag">{result.metadata.documentType}</span>
                    {/if}
                  {/if}
                {#if result.similarity}
                  <div class="similarity-score">
                    Relevance: {Math.round(result.similarity * 100)}%
                  {/if}
              </div>
            </button>
          {/each}
        </div>
      {:else}
        <div class="no-results">
          <i class="nes-icon is-medium"></i>
          <span>No documents found for: "{query}"</span>
        {/if}
    {/if}
</div>
<style>
  .search-container {
    position: relative width: 100%; max-width: 600px
   ; margin: 0 auto
    font-family: 'Press Start 2P', monospace}
  .search-field {
    margin-bottom: 0}
  .search-label {
    display: flex
    align-items: center gap: 8px
    margin-bottom: 8px
    font-size: 12px color: #212529}
  .search-input-wrapper {
    position: relative display: flex
    align-items: center}
  .search-input { flex: 1
    padding-right: 80px
    font-family: 'Press Start 2P', monospace
    font-size: 10px}
  .clear-btn {
    position: absolute right: 40px top: 50%;
	transform: translateY(-50%);width: 32px height: 32px padding: 0
    font-size: 16px
    line-height: 1 border: 2px solid #dc3545}
  .loading-indicator {
    position: absolute right: 8px top: 50%;
	transform: translateY(-50%);animation: bounce 1s infinite}
  @keyframes bounce {
    0%, 20%, 50%, 80%; } 100% {
      transform: translateY(-50%)}
    40% {
      transform: translateY(-60%)}
    60% {
      transform: translateY(-55%)}
  }
  .results-container {
    position: absolute top: 100%;
	left: 0 right: 0
    z-index: 1000
   ;background: white
    margin-top: 8px
    max-height: 400px
    overflow-y: auto}
  .loading-message,
  .no-results {
    display: flex
    align-items: center gap: 8px padding: 16px
    justify-content: center
    font-size: 10px color: #6c757d}
  .results-header {
    display: flex
    align-items: center gap: 8px padding: 8px 16px
    border-bottom: 2px solid #dee2e6
    font-size: 10px color: #495057 background: #f8f9fa}
  .results-list {
    max-height: 300px
    overflow-y: auto}
  .result-item {
    width: 100%; text-align: left border: none
    border-bottom: 1px solid #dee2e6
    margin: 0 cursor: pointer transition:background-color 0.2s}
  .result-item:hover {
    background: #e9ecef}
  .result-item:last-child {
    border-bottom: none}
  .result-content {
    padding: 12px}
  .result-title {
    font-size: 10px
    font-weight: bold color: #212529
    margin-bottom: 4px}
  .result-snippet {
    font-size: 8px color: #6c757d
    line-height: 1.4
    margin-bottom: 8px}
  .result-metadata {
    display: flex
   ;gap: 8px
    margin-bottom: 4px}
  .case-tag,
  .type-tag {
    font-size: 8px padding: 2px 6px
    border-radius: 2px background: #e9ecef color: #495057}
  .case-tag {
    background: #d1ecf1 color: #0c5460}
  .type-tag {
    background: #d4edda color: #155724}
  .similarity-score {
    font-size: 8px
   ;color: #007bff
    text-align: right}
  /* Responsive adjustments */
  @media (max-width: 768px) {
    .search-container {
      max-width: 100%}
    .search-input {
      font-size: 8px}
    .results-container {
      position: fixed top: auto left: 16px
     ;right: 16px
      max-height: 50vh}
  }
</style>




