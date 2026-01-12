<script lang="ts">
/**
 * RAG Search Page
 * ================
 *
 * Complete human-in-the-loop RAG search with source validation.
 *
 * Flow:
 * 1. User enters query
 * 2. System retrieves candidate chunks
 * 3. User validates/approves sources
 * 4. System generates answer with citations
 * 5. User can pin results to case canvas
 *
 * @phase Phase 94 ACE Synthesis
 */

import { page } from '$app/stores';
import AnswerWithCitations from '$lib/components/rag/AnswerWithCitations.svelte';
import SourceValidator from '$lib/components/rag/SourceValidator.svelte';
import { generateAnswer, searchKnowledgeBase, validateSources } from '$lib/services/rag-source-validation';
import type {
  AnswerWithCitations as AnswerData,
  ApprovedContext,
  Citation,
  RetrievedChunk,
  SourceValidation,
  ValidationStatus
} from '$lib/types/rag-source-validation';
import type { Component } from 'svelte';

// Type assertions for Svelte 5 component compatibility
const SourceValidatorComponent = SourceValidator as unknown as Component;
const AnswerWithCitationsComponent = AnswerWithCitations as unknown as Component;

// State
const urlParams = $derived(typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null);

// State
let query = $state('');
let caseId = $state('');
let isSearching = $state(false);
let isValidating = $state(false);
let isGenerating = $state(false);
let error = $state<string | null>(null);

// Flow state
type FlowStep = 'search' | 'validate' | 'answer';
let currentStep = $state<FlowStep>('search');

// Data
let chunks = $state<RetrievedChunk[]>([]);
let context = $state<ApprovedContext | null>(null);
let answer = $state<AnswerData | null>(null);
let queryId = $state<string | null>(null);

// Search history
let recentQueries = $state<string[]>([]);

// Load case ID from URL if present
$effect(() => {
  const urlCaseId = $page.url.searchParams.get('case');
  if (urlCaseId) {
    caseId = urlCaseId;
  }
});

async function handleSearch() {
  if (!query.trim()) return;

  isSearching = true;
  error = null;
  chunks = [];
  context = null;
  answer = null;

  try {
    const result = await searchKnowledgeBase(query, {
      case_id: caseId || undefined,
      top_k: 10,
      use_hybrid: true,
      use_rerank: true,
    });

    chunks = result.chunks;
    queryId = result.query_id;

    // Save to recent queries
    if (!recentQueries.includes(query)) {
      recentQueries = [query, ...recentQueries.slice(0, 4)];
    }

    if (chunks.length > 0) {
      currentStep = 'validate';
    } else {
      error = 'No relevant sources found. Try a different query.';
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Search failed';
  } finally {
    isSearching = false;
  }
}

async function handleValidate(approvedIds: string[]) {
  if (!queryId) return;

  isValidating = true;
  error = null;

  try {
    const validations: SourceValidation[] = chunks.map((chunk): SourceValidation => ({
      chunk_id: chunk.chunk_id,
      status: (approvedIds.includes(chunk.chunk_id) ? 'approved' : 'rejected') as ValidationStatus,
    }));

    context = await validateSources({
      query_id: queryId,
      case_id: caseId || `temp_${Date.now()}`,
      validations,
    });

    currentStep = 'answer';

    // Auto-generate answer
    await handleGenerateAnswer();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Validation failed';
  } finally {
    isValidating = false;
  }
}

async function handleGenerateAnswer() {
  if (!context) return;

  isGenerating = true;
  error = null;

  try {
    answer = await generateAnswer({
      context_id: context.context_id,
      query,
      case_id: context.case_id,
      include_citations: true, include_todos: true,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : 'Answer generation failed';
  } finally {
    isGenerating = false;
  }
}

function handleCancel() {
  currentStep = 'search';
  chunks = [];
  context = null;
  answer = null;
}

function handlePinToCanvas(citation: Citation) {
  // TODO: Integrate with case canvas
  console.log('Pin to canvas:', citation);
  alert(`Would pin "${citation.source_title}" to canvas for case ${caseId || 'current'}`);
}

function startNewSearch() {
  query = '';
  currentStep = 'search';
  chunks = [];
  context = null;
  answer = null;
  queryId = null;
  error = null;
}
</script>

<svelte:head>
  <title>RAG Search | Legal AI</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-4xl">
  <!-- Header -->
  <div class="mb-8">
    <h1 class="text-2xl font-bold mb-2">🔍 Knowledge Search</h1>
    <p class="text-base-content/70">
      Search the legal knowledge base with source validation.
    </p>
  </div>

  <!-- Progress Steps -->
  <ul class="steps steps-horizontal w-full mb-8">
    <li class="step" class, step-primary={currentStep === 'search' || currentStep === 'validate' || currentStep === 'answer'}>
      Search
    </li>
    <li class="step" class, step-primary={currentStep === 'validate' || currentStep === 'answer'}>
      Validate Sources
    </li>
    <li class="step" class, step-primary={currentStep === 'answer'}>
      Answer
    </li>
  </ul>

  <!-- Error Alert -->
  {#if error}
    <div class="alert alert-error mb-6">
      <svg xmlns="http, //www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{error}</span>
      <button class="btn btn-ghost btn-sm" onclick={() => error = null}>Dismiss</button>
    </div>
  {/if}

  <!-- Step 1, Search -->
  {#if currentStep === 'search'}
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title">Search the Knowledge Base</h2>

        <!-- Case ID (optional) -->
        <div class="form-control mb-4">
          <label class="label">
            <span class="label-text">Case ID (optional)</span>
            <input
              type="text"
              bind, value={caseId}
              placeholder="e.g., CASE-2024-001"
              class="input input-bordered w-full max-w-xs"
            />
          </label>
        </div>

        <!-- Query Input -->
        <div class="form-control">
          <label class="label">
            <span class="label-text">Your Question</span>
            <div class="join w-full">
              <input
                type="text"
                bind, value={query}
                placeholder="e.g., What are the requirements for deed registration in Texas? "
                class="input input-bordered join-item flex-1"
                onkeydown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button
                class="btn btn-primary join-item"
                onclick={handleSearch}
                disabled={isSearching ?? !query.trim()}
              >
                {#if isSearching}
                  <span class="loading loading-spinner loading-sm"></span>
                {:else}
                  🔍 Search
                {/if}
              </button>
            </div>
          </label>
        </div>

        <!-- Recent Queries -->
        {#if recentQueries.length > 0}
          <div class="mt-4">
            <div class="mb-2">
              <span class="label-text-alt text-base-content/60">Recent searches:</span>
            </div>
            <div class="flex flex-wrap gap-2">
              {#each recentQueries as recentQuery}
                <button
                  class="btn btn-ghost btn-xs"
                  onclick={() => { query = recentQuery; handleSearch(); }}
                >
                  {recentQuery.slice(0, 40)}{recentQuery.length > 40 ? '...' : ''}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Quick Examples -->
        <div class="mt-6 pt-4 border-t border-base-300">
          <p class="text-sm text-base-content/60 mb-3">Try these example queries:</p>
          <div class="flex flex-wrap gap-2">
            {#each [
              'What is a quitclaim deed?',
              'Requirements for notarizing a deed',
              'Transfer on death deed rules',
              'Deed recording fees by county'
            ] as example}
              <button
                class="btn btn-outline btn-sm"
                onclick={() => { query = example; handleSearch(); }}
              >
                {example}
              </button>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Step 2, Validate Sources -->
  {#if currentStep === 'validate'}
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <SourceValidatorComponent
          chunks={chunks}
          caseId={caseId || ''}
          initialQuery={query}
          isLoading={isValidating}
          onValidate={handleValidate}
          onCancel={handleCancel}
        />
      </div>
    </div>
  {/if}

  <!-- Step 3, Answer -->
  {#if currentStep === 'answer'}
    <div class="space-y-6">
      <!-- Loading State -->
      {#if isGenerating}
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body items-center">
            <span class="loading loading-spinner loading-lg text-primary"></span>
            <p class="text-base-content/70 mt-4">Generating answer from validated sources...</p>
          </div>
        </div>
      {/if}

      <!-- Answer Display -->
      {#if answer}
        <AnswerWithCitationsComponent
          answer={answer}
          onPinToCanvas={handlePinToCanvas}
        />
      {/if}

      <!-- Actions -->
      <div class="flex gap-3">
        <button class="btn btn-outline" onclick={startNewSearch}>
          ← New Search
        </button>
        <button class="btn btn-outline" onclick={() => currentStep = 'validate'}>
          ↻ Re-select Sources
        </button>
        {#if answer}
          <button class="btn btn-primary" onclick={() => handleGenerateAnswer()}>
            🔄 Regenerate Answer
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  /* Custom styles */
</style>



