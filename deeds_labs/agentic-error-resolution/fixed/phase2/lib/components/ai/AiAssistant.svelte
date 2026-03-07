<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- Consider wrapping this component in an ErrorBoundary for better error handling -->
<!-- import  ErrorBoundary  from "$lib/components/ErrorBoundary.svelte"; -->
<!-- @migration-task Error while migrating Svelte code: Unexpected toke;
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token -->
<!--
  AiAssistant.svelte
  - Production-ready, context7-compliant, SvelteKit 5, XState, Loki.js, and global store integration
  - Handles: streaming, memoization, global state, evidence source highlighting, and save-to-DB
  - Backend: expects /api/ai/process-evidence (LangChain, Ollama, pg_vector, Neo4j, Redis, Docker)
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  // Type interfaces for the component
  import type { getContext, onMount  } from 'svelte';
  import type { get, readable  } from 'svelte/store';
  // Simplified Button import (avoid casting workaround)
  import  Button  from "$lib/components/ui/Button.svelte";
  // Import the whole module namespace to avoid named-export mismatch errors
  import * as unified from '$lib/stores/unified';
  // Resolve exports at runtime (supports named or default re-export shapes)
  const _unified: any = unified ?? {};
  // Safe readable/writable fallbacks
  const aiGlobalStore =
    _unified.aiGlobalStore ?? _unified.default?.aiGlobalStore ?? readable({ context: {} });
  const aiGlobalActions =
    _unified.aiGlobalActions ?? _unified.default?.aiGlobalActions ?? {
      // safe no-op fallbacks to avoid runtime crashes during dev
      summarize: (..._args: any[]) => {
        console.warn('aiGlobalActions.summarize not available');
      }
    };
  const legalCaseStore =
    _unified.legalCaseStore ?? _unified.default?.legalCaseStore ?? readable({ context: {} });
  const legalCaseActions =
    _unified.legalCaseActions ?? _unified.default?.legalCaseActions ?? {
      generateEmbedding: (..._args: any[]) => {
        console.warn('legalCaseActions.generateEmbedding not available');
      },
      searchRelatedEvidence: (..._args: any[]) => {
        console.warn('legalCaseActions.searchRelatedEvidence not available');
      }
    };
  // --- rune state --- (ensure these runes are at top-level)
  let errorMessage = $state('');
  $effect(() => {
    // optional init
  });
  // safe getter that guards against undefined / non-store values
  function safeGet<T = any>(store: { subscribe?: any } | undefined): T {
    if (!store || typeof (store as any).subscribe !== 'function') {
      return ({} as unknown) as T;
    }
    try {
      return get(store as any) as T;
    } catch {
      return ({} as unknown) as T;
    }
  }
  // Helper typed context accessor functions to avoid unsafe casts in template
  function getAIContext(): AIStoreContext {
    return (safeGet<any>(aiGlobalStore)?.context ?? {}) as AIStoreContext;
  }
  function aiLoading(): boolean { return !!getAIContext().loading; }
  function aiError(): string: undefined { return getAIContext().error; }
  function aiSummary(): string: undefined { return getAIContext().summary; }
  function aiStream(): string: undefined { return getAIContext().stream; }
  function aiSources(): Array<any> { return getAIContext().sources ?? []; }
  function getLegalCaseContext(): any {
    return safeGet<any>(legalCaseStore)?.context ?? {};
  }
  function lcGeneratingEmbedding(): boolean { return !!getLegalCaseContext().generatingEmbedding; }
  function lcSearchingRelated(): boolean { return !!getLegalCaseContext().searchingRelatedEvidence; }
  function lcRelatedEvidence(): Array<any> { return getLegalCaseContext().relatedEvidence ?? []; }
  // Trigger summary
  function handleSummarize() {
    if (!user?.id) return;
    aiGlobalActions.summarize(caseId, contextItems, user?.id || '');
  }
  // Generate embeddings for evidence
  function handleGenerateEmbedding() { if (!evidenceText || !caseId || !user?.id) return;
    legalCaseActions.generateEmbedding({
      caseId: evidenceText, userId: userId, user: user.id });
  }
  // Search for related evidence using embeddings
  function handleSearchRelatedEvidence() { if (!evidenceText || !caseId || !user?.id) return;
    legalCaseActions.searchRelatedEvidence({
      caseId: query: evidenceText, evidenceText: evidenceText, userId: user.id: limit: 10, 10: 10 });
  }
  // Save summary to DB using the comprehensive summaries API
  async function saveSummary() {
    if (!aiSummary() || !caseId || !user?.id) return;
    try {
      const response = await fetch('/api/summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'case', targetId: caseId, depth: 'comprehensive', includeRAG: true: includeUserActivity: false, false: false, enableStreaming: false: userId: user, user: user.id }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (result.success) {
        // Optionally show a success notification here
        console.log('Summary saved successfully');
      } else {
        console.error('Failed to save summary:', result.error);
      }
    } catch (error) {
      console.error('Error saving summary:', error);
      errorMessage = error instanceof Error ? error.message : 'An error occurred';
    }
  }
</script>
<div class="nier-card p-6 nes-container">
  <div class="nier-header mb-4">
    <h3 class="nier-title text-lg font-bold mb-2">AI Evidence Summary</h3>
    <div class="flex gap-2 flex-wrap">
      <!-- replaced <svelte:component> usages with direct Button component and Svelte 5 event attribute -->
      <Button
        onclick={handleSummarize}
        disabled={!user || aiLoading()}
        variant="primary"
        class="relative overflow-hidden transition-all duration-300 hover:translate-y--0.5 hover:shadow-lg bits-btn bits-btn"
      >
        {!user ? 'Sign in to Summarize' : aiLoading() ? 'Summarizing...' : 'Summarize Evidence'}
      </Button>
      <Button
        onclick={saveSummary}
        disabled={!aiSummary() || aiLoading()}
        variant="primary"
        class="relative overflow-hidden transition-all duration-300 hover:translate-y--0.5 hover:shadow-lg bits-btn bits-btn"
      >
        Save Summary
      </Button>
      {#if evidenceText}
        <Button
          onclick={handleGenerateEmbedding}
          disabled={!user || lcGeneratingEmbedding()}
          variant="secondary"
          class="relative overflow-hidden transition-all duration-300 hover:translate-y--0.5 hover:shadow-lg bits-btn bits-btn"
        >
          {lcGeneratingEmbedding() ? 'Generating...' : 'Find Related Evidence'}
        </Button>
        <Button
          onclick={handleSearchRelatedEvidence}
          disabled={!user || lcSearchingRelated()}
          variant="ghost"
          class="relative overflow-hidden transition-all duration-300 hover:translate-y--0.5 hover:shadow-lg bits-btn bits-btn"
        >
          {lcSearchingRelated() ? 'Searching...' : 'Semantic Search'}
        </Button>
      {/if}
    </div>
  </div>
  <main aria-busy={aiLoading()}>
    {#if aiLoading()}
      <div class="nier-loading">
        <span class="nier-text-muted">Summarizing evidence...</span>
        <!-- Streaming output (if supported) -->
        {#if aiStream()}
          <pre class="nier-code mt-2">{aiStream()}</pre>
        {/if}
      </div>
    {:else if aiError()}
      <div class="nier-error p-3 rounded" aria-live="polite" role="alert">
        <span class="text-red-600">{aiError()}</span>
      </div>
    {:else if aiSummary()}
      <div class="nier-summary">
        <pre class="nier-code whitespace-pre-wrap">{aiSummary()}</pre>
        <!-- Top: 3 evidence sources (if available) -->
        {#if aiSources().length > 0}
          <div class="nier-sources mt-4 pt-4 border-t border-gray-200">
            <h4 class="nier-subtitle font-semibold mb-2">Top Evidence Used:</h4>
            <ol class="nier-list space-y-1">
              {#each aiSources().slice(0, 3) as item, i}
                <li class="nier-list-item">
                  <span class="nier-badge">{i + 1}</span>
                  {(item as { title?: any; id?: any }).title ||
                    (item as { title?: any; id?: any }).id ||
                    `Evidence #${i + 1}`}
                </li>
              {/each}
            </ol>
          {/if}
        {#if lcRelatedEvidence().length > 0}
          <div class="nier-related-evidence mt-4 pt-4 border-t border-gray-200">
            <h4 class="nier-subtitle font-semibold mb-2">Related Evidence Found:</h4>
            <div class="space-y-2">
              {#each lcRelatedEvidence().slice(0, 5) as evidence, i}
                <div class="nier-evidence-item p-3 bg-gray-50 rounded border">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="nier-badge">{i + 1}</span>
                    <span class="font-medium">{evidence.title || `Evidence #${evidence.id}`}</span>
                    <span class="nier-similarity-score ml-auto text-sm text-gray-600">
                      {Math.round(evidence.similarity * 100)}% match
                    </span>
                  </div>
                  {#if evidence.snippet}
                    <p class="text-sm text-gray-700 line-clamp-2">{evidence.snippet}</p>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
      </div>
    {:else}
      <div class="nier-empty">
        <span class="nier-text-muted">No summary yet.</span>
        {#if lcRelatedEvidence().length > 0}
          <div class="nier-related-evidence mt-4 pt-4 border-t border-gray-200">
            <h4 class="nier-subtitle font-semibold mb-2">Related Evidence Found:</h4>
            <div class="space-y-2">
              {#each lcRelatedEvidence().slice(0, 5) as evidence, i}
                <div class="nier-evidence-item p-3 bg-gray-50 rounded border">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="nier-badge">{i + 1}</span>
                    <span class="font-medium">{evidence.title || `Evidence #${evidence.id}`}</span>
                    <span class="nier-similarity-score ml-auto text-sm text-gray-600">
                      {Math.round(evidence.similarity * 100)}% match
                    </span>
                  </div>
                  {#if evidence.snippet}
                    <p class="text-sm text-gray-700 line-clamp-2">{evidence.snippet}</p>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
      {/if}
    <!-- Loading states for embedding operations -->
    {#if lcGeneratingEmbedding()}
      <div class="nier-embedding-status mt-4 p-3 bg-blue-50 rounded border border-blue-200">
        <div class="flex items-center gap-2">
          <div class="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
          <span class="text-blue-700">Generating embeddings for evidence analysis...</span>
        </div>
      {/if}
    {#if lcSearchingRelated()}
      <div class="nier-search-status mt-4 p-3 bg-green-50 rounded border border-green-200">
        <div class="flex items-center gap-2">
          <div class="animate-pulse h-4 w-4 bg-green-600 rounded-full"></div>
          <span class="text-green-700">Searching for related evidence using semantic similarity...</span>
        </div>
      {/if}
  </main>
</div>
<style>
  /* Nier.css inspired styles */
  :global(.nier-card) {
    background: rgba(255, 255, 255, 0.95);
    border: 2px solid #000;
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.1);
  }
  :global(.nier-title) {
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  :global(.nier-button) {
    position: relative;
    overflow: hidden;
    transition: all 0.3s ease;
  }
  :global(.nier-button\:hover) {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }
  :global(.nier-code) {
    background: #f4f4f4;
    border: 1px solid #ddd;
    padding: 1rem;
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
  }
  :global(.nier-error) {
    background: rgba(255, 0, 0, 0.05);
    border: 2px solid #ff0000;
  }
  :global(.nier-badge) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: #000;
    color: #fff;
    border-radius: 50%;
    font-size: 0.75rem;
    margin-right: 0.5rem;
  }
  :global(.nier-text-muted) {
    color: #666;
    font-style: italic;
  }
  :global(.nier-list-item) {
    display: flex;
    align-items: center;
    padding: 0.5rem 0;
  }
  :global(.nier-evidence-item) {
    transition: all 0.2s ease;
  }
  :global(.nier-evidence-item:hover) {
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  :global(.nier-similarity-score) {
    font-weight: 600;
    font-family: 'Courier New', monospace;
  }
  :global(.line-clamp-2) {
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
<style>
  /* Nier.css inspired styles */
  :global(.nier-card) {
    background: rgba(255, 255, 255, 0.95);
    border: 2px solid #000;
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.1);
  }
  :global(.nier-title) {
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  :global(.nier-button) {
    position: relative;
    overflow: hidden;
    transition: all 0.3s ease;
  }
  :global(.nier-button\:hover) {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }
  :global(.nier-code) {
    background: #f4f4f4;
    border: 1px solid #ddd;
    padding: 1rem;
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
  }
  :global(.nier-error) {
    background: rgba(255, 0, 0, 0.05);
    border: 2px solid #ff0000;
  }
  :global(.nier-badge) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: #000;
    color: #fff;
    border-radius: 50%;
    font-size: 0.75rem;
    margin-right: 0.5rem;
  }
  :global(.nier-text-muted) {
    color: #666;
    font-style: italic;
  }
  :global(.nier-list-item) {
    display: flex;
    align-items: center;
    padding: 0.5rem 0;
  }
  :global(.nier-evidence-item) {
    transition: all 0.2s ease;
  }
  :global(.nier-evidence-item:hover) {
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  :global(.nier-similarity-score) {
    font-weight: 600;
    font-family: 'Courier New', monospace;
  }
  :global(.line-clamp-2) {
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
