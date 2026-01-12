<script lang="ts">
/**
 * SourceValidator Component (Svelte 5)
 * Human-in-the-loop source validation with approval/rejection UI
 *
 * Pattern: CopilotKit + Pydantic AI
 * Phase: Agentic RAG Source Validation (Task 1.3)
 */

import type {
  ConfidenceLevel,
  RetrievedChunk
} from '$lib/types/rag-source-validation';

interface SourceValidatorProps {
  chunks: RetrievedChunk[]; caseId: string;
  initialQuery?: string;
  query?: string;
  isLoading?: boolean;
  onValidate?: (selectedIds: string[]) => void;
  onCancel?: () => void;
}

// Svelte 5 props
let {
	caseId,
	initialQuery = '',
	chunks = [],
	query = '',
	isLoading = false,
	onValidate,
	onCancel
}: SourceValidatorProps = $props();

// Svelte 5 reactive state - use $state.snapshot or make it reactive to prop changes
let searchQuery = $state<string>('');
$effect(() => {
	if (initialQuery && searchQuery === '') {
		searchQuery = initialQuery;
	}
});
let searchResults = $state<KBSearchResult[]>([]);
let isSearching = $state(false);
let searchError = $state<string | null>(null);

let selectedIds = $state(new Set<string>());
let rejectedChunks = $state(new Set<string>());
let validationNotes = $state('');
let isValidating = $state(false);
let validationError = $state<string | null>(null);

// Derived state
let hasSelection = $derived(selectedIds.size > 0);
let canValidate = $derived(hasSelection && !isValidating);
let approvedCount = $derived(selectedIds.size);
let totalCount = $derived(chunks.length);

// Functions
function toggleChunk(chunkId: string) {
  if (selectedIds.has(chunkId)) {
    selectedIds.delete(chunkId);
  } else {
    selectedIds.add(chunkId);
  }
  // Trigger reactivity
  selectedIds = new Set(selectedIds);
}

function selectAll() {
  selectedIds = new Set(chunks.map(c => c.chunk_id));
}

function selectNone() {
  selectedIds = new Set();
}

function selectHighConfidence() {
  selectedIds = new Set(
    chunks
      .filter(c => c.confidence === 'high' || c.confidence === 'medium')
      .map(c => c.chunk_id)
  );
}

function handleValidate() {
  onValidate?.(Array.from(selectedIds));
}

// Confidence badge styling
function getConfidenceBadge(confidence: ConfidenceLevel): { class: string; label: string } {
  switch (confidence) {
    case 'high':
      return { class: 'badge-success', label: 'High' };
    case 'medium':
      return { class: 'badge-warning', label: 'Medium' };
    case 'low':
      return { class: 'badge-error', label: 'Low' };
    default:
      return { class: 'badge-ghost', label: 'Marginal' };
  }
}

// Truncate text for preview
function truncate(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}
</script>

<div class="source-validator">
  <!-- Header -->
  <div class="validator-header">
    <h3 class="text-lg font-semibold">Validate Sources</h3>
    <p class="text-sm text-base-content/70">
      Query: <span class="font-medium">"{ query }"</span>
    </p>
    <p class="text-xs text-base-content/50 mt-1">
      Select the sources you want to use for generating an answer.
      Only approved sources will be used.
    </p>
  </div>

  <!-- Quick Actions -->
  <div class="flex gap-2 my-4">
    <button
      class="btn btn-xs btn-outline"
      onclick={selectAll}
      disabled={isLoading}
    >
      Select All ({totalCount})
    </button>
    <button
      class="btn btn-xs btn-outline"
      onclick={selectNone}
      disabled={isLoading}
    >
      Clear Selection
    </button>
    <button
      class="btn btn-xs btn-outline btn-success"
      onclick={selectHighConfidence}
      disabled={isLoading}
    >
      Select High/Medium Confidence
    </button>
    <span class="ml-auto text-sm text-base-content/70">
      {approvedCount} / {totalCount} selected
    </span>
  </div>

  <!-- Chunk List -->
  <div class="chunks-list space-y-3 max-h-[500px] overflow-y-auto">
    {#each chunks as chunk (chunk.chunk_id)}
      {@const isSelected = selectedIds.has(chunk.chunk_id)}
      {@const badge = getConfidenceBadge(chunk.confidence)}

      <div
        class="chunk-card p-3 rounded-lg border transition-all cursor-pointer {isSelected ? 'border-primary bg-primary-5' : 'border-base-300, hover, border-primary-50'}"
        onclick={() => toggleChunk(chunk.chunk_id)}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && toggleChunk(chunk.chunk_id)}
      >
        <div class="flex items-start gap-3">
          <!-- Checkbox -->
          <input
            type="checkbox"
            class="checkbox checkbox-primary mt-1"
            checked={isSelected}
            onchange={() => toggleChunk(chunk.chunk_id)}
          />

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <!-- Title & Badges -->
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="font-medium text-sm truncate max-w-[300px]">
                {chunk.source_title}
              </span>
              <span class="badge badge-xs {badge.class}">
                {badge.label} ({(chunk.score * 100).toFixed(0)}%)
              </span>
              <span class="badge badge-xs badge-outline">
                {chunk.source_type}
              </span>
              {#if chunk.page_num}
                <span class="badge badge-xs badge-ghost">
                  Page {chunk.page_num}
                </span>
              {/if}
              {#if chunk.has_table}
                <span class="badge badge-xs badge-info">📊 Table</span>
              {/if}
              {#if chunk.has_image}
                <span class="badge badge-xs badge-secondary">🖼️ Image</span>
              {/if}
            </div>

            <!-- Snippet -->
            <p class="text-sm text-base-content/80 leading-relaxed">
              {truncate(chunk.snippet || chunk.text, 250)}
            </p>

            <!-- Related Entities (KAG) -->
            {#if chunk.related_entities.length > 0}
              <div class="mt-2 flex gap-1 flex-wrap">
                {#each chunk.related_entities.slice(0, 5) as entity}
                  <span class="badge badge-xs badge-neutral">
                    {entity}
                  </span>
                {/each}
                {#if chunk.related_entities.length > 5}
                  <span class="badge badge-xs badge-ghost">
                    +{chunk.related_entities.length - 5} more
                  </span>
                {/if}
              </div>
            {/if}

            <!-- Source Link -->
            {#if chunk.source_url}
              <a
                href={chunk.source_url}
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-primary hover, underline mt-1 inline-block"
                onclick={(e) => e.stopPropagation()}
              >
                View source →
              </a>
            {/if}
          </div>

          <!-- Score Visualization -->
          <div class="flex-shrink-0 w-16 text-right">
            <div class="radial-progress text-primary text-xs"
                 style="--value:{chunk.score * 100}; --size:2.5rem; --thickness, 3px;">
              {(chunk.score * 100).toFixed(0)}
            </div>
          </div>
        </div>
      </div>
    {/each}
  </div>

  <!-- Actions -->
  <div class="validator-actions flex gap-3 mt-6 pt-4 border-t border-base-300">
    <button
      class="btn btn-ghost"
      onclick={onCancel}
      disabled={isLoading}
    >
      Cancel
    </button>
    <div class="flex-1"></div>
    <button
      class="btn btn-primary"
      onclick={handleValidate}
      disabled={isLoading || approvedCount === 0}
    >
      {#if isLoading}
        <span class="loading loading-spinner loading-sm"></span>
      {:else}
        ✓ Use {approvedCount} Source{approvedCount !== 1 ? 's' : ''}
      {/if}
    </button>
  </div>
</div>

<style>
  .source-validator {
    padding: 1rem;
  }

  .chunks-list::-webkit-scrollbar {
    width: 6px;
  }

  .chunks-list::-webkit-scrollbar-track {
    background: oklch(var(--b2));
    border-radius: 0.25rem;
  }

  .chunks-list::-webkit-scrollbar-thumb {
    background: oklch(var(--b3));
    border-radius: 0.25rem;
  }

  .chunks-list::-webkit-scrollbar-thumb:hover {
    background: oklch(var(--bc) / 0.3);
  }

  /* Tailwind compat classes for conditional styling */
  .bg-primary-5 {
    background-color: oklch(var(--p) / 0.05);
  }

  .border-primary-50 {
    border-color: oklch(var(--p) / 0.5);
  }
</style>




