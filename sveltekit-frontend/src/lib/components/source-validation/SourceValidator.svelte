<script lang="ts">
/**
 * SourceValidator Component (Svelte 5 Complete)
 * Human-in-the-loop source validation with approval/rejection UI
 *
 * Pattern: CopilotKit + Pydantic AI
 * Phase: Agentic RAG Source Validation (Task 1.3)
 */

import { sourceValidationAPI } from '$lib/services/source-validation-api';
import {
  SOURCE_TYPE_CONFIG,
  getConfidenceColor,
  type KBSearchResult,
  type SourceValidatorProps
} from '$lib/types/source-validation';

// Svelte 5 props
let {
	caseId,
	onValidationComplete,
	initialQuery = ''
}: SourceValidatorProps = $props();

// Svelte 5 reactive state - sync with prop changes
let searchQuery = $state<string>('');
$effect(() => {
	if (initialQuery && searchQuery === '') {
		searchQuery = initialQuery;
	}
});
let searchResults = $state<KBSearchResult[]>([]);
let isSearching = $state(false);
let searchError = $state<string | null>(null);

let selectedChunks = $state(new Set<string>());
let rejectedChunks = $state(new Set<string>());
let validationNotes = $state('');
let isValidating = $state(false);
let validationError = $state<string | null>(null);

// Derived state
let hasSelection = $derived(selectedChunks.size > 0);
let canValidate = $derived(hasSelection && !isValidating);

// ============================================================================
// Search Handler
// ============================================================================

async function handleSearch() {
	if (!searchQuery.trim()) return;

	isSearching = true;
	searchError = null;
	selectedChunks.clear();
	rejectedChunks.clear();

	try {
		const response = await sourceValidationAPI.search({
			query: searchQuery,
			top_k: 20,
			include_codebase: true
		});

		searchResults = response.results;
	} catch (error) {
		searchError = error instanceof Error ? error.message : 'Search failed';
		searchResults = [];
	} finally {
		isSearching = false;
	}
}

// ============================================================================
// Selection Handlers
// ============================================================================

function toggleChunk(chunkId: string) {
	if (selectedChunks.has(chunkId)) {
		selectedChunks.delete(chunkId);
	} else {
		selectedChunks.add(chunkId);
		rejectedChunks.delete(chunkId);
	}
	selectedChunks = selectedChunks;
	rejectedChunks = rejectedChunks;
}

function rejectChunk(chunkId: string) {
	if (rejectedChunks.has(chunkId)) {
		rejectedChunks.delete(chunkId);
	} else {
		rejectedChunks.add(chunkId);
		selectedChunks.delete(chunkId);
	}
	rejectedChunks = rejectedChunks;
	selectedChunks = selectedChunks;
}

function approveAll() {
	searchResults.forEach((result) => {
		if (result.confidence_score >= 0.7) {
			selectedChunks.add(result.chunk_id);
		}
	});
	rejectedChunks.clear();
	selectedChunks = selectedChunks;
	rejectedChunks = rejectedChunks;
}

function clearSelection() {
	selectedChunks.clear();
	rejectedChunks.clear();
	selectedChunks = selectedChunks;
	rejectedChunks = rejectedChunks;
}

// ============================================================================
// Validation Handler
// ============================================================================

async function handleValidate() {
	if (!canValidate) return;

	isValidating = true;
	validationError = null;

	try {
		const response = await sourceValidationAPI.validateSources({
			case_id: caseId,
			query: searchQuery,
			selected_chunk_ids: Array.from(selectedChunks),
			rejected_chunk_ids: Array.from(rejectedChunks),
			validation_notes: validationNotes || undefined
		});

		onValidationComplete?.(response.validation_id, response.approved_chunks);
	} catch (error) {
		validationError = error instanceof Error ? error.message : 'Validation failed';
	} finally {
		isValidating = false;
	}
}
</script>

<div class="source-validator">
	<!-- Search Section -->
	<div class="search-section">
		<h2 class="text-2xl font-bold mb-4 text-sand">Search Knowledge Base</h2>

		<form onsubmit={(e) => { e.preventDefault(); handleSearch(); }} class="flex gap-2">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Enter your question (e.g., How do I use Svelte 5 runes?)"
				class="flex-1 px-4 py-2 border border-sand/30 rounded-lg bg-panelSoft text-sand placeholder-sand/40 focus:ring-2 focus:ring-info focus:outline-none"
				disabled={isSearching}
			/>
			<button
				type="submit"
				disabled={isSearching || !searchQuery.trim()}
				class="px-6 py-2 bg-info text-white rounded-lg hover:bg-info/60 disabled:bg-sand/20 disabled:text-sand/40"
			>
				{isSearching ? 'Searching...' : 'Search'}
			</button>
		</form>

		{#if searchError}
			<div class="mt-4 p-4 bg-danger/5 border border-danger/20 rounded-lg text-danger">
				{searchError}
			</div>
		{/if}
	</div>

	<!-- Results -->
	{#if searchResults.length > 0}
		<div class="results-section mt-8">
			<div class="flex justify-between items-center mb-4">
				<h3 class="text-xl font-semibold text-sand">Found {searchResults.length} sources</h3>
				<div class="flex gap-2">
					<button onclick={approveAll} class="px-4 py-2 bg-accent/10 text-accent rounded-lg hover:bg-accent/20">
						Approve High-Confidence
					</button>
					<button onclick={clearSelection} class="px-4 py-2 bg-sand/10 text-sand/80 rounded-lg hover:bg-sand/20">
						Clear
					</button>
				</div>
			</div>

			<div class="grid gap-4">
				{#each searchResults as result (result.chunk_id)}
					{@const isSelected = selectedChunks.has(result.chunk_id)}
					{@const isRejected = rejectedChunks.has(result.chunk_id)}
					{@const sourceConfig = SOURCE_TYPE_CONFIG[result.source_type]}
					{@const confidenceColor = getConfidenceColor(result.confidence_score)}

					<div
						class="p-4 border rounded-lg hover:shadow-md transition {isSelected ? 'border-accent bg-accent/5' : isRejected ? 'border-danger bg-danger/5 opacity-60' : 'border-sand/20 bg-panelSoft'}"
					>
						<div class="flex justify-between items-start mb-2">
							<div class="flex-1">
								<div class="flex items-center gap-2 mb-1">
									<span class="text-xl">{sourceConfig.icon}</span>
									<span class="text-sm font-semibold text-sand/60">{sourceConfig.label}</span>
									<span class="px-2 py-1 text-xs rounded-full {confidenceColor === 'green' ? 'bg-accent/20 text-accent' : confidenceColor === 'yellow' ? 'bg-warning/20 text-warning' : 'bg-danger/20 text-danger'}">
										{(result.confidence_score * 100).toFixed(0)}%
									</span>
								</div>
								<p class="text-sm text-sand/60">{result.source_file}</p>
							</div>

							<div class="flex gap-2">
								<button
									onclick={() => toggleChunk(result.chunk_id)}
									class="px-3 py-1 rounded transition {isSelected ? 'bg-accent text-white' : 'bg-accent/10 text-accent'}"
								>
									{isSelected ? 'Approved' : 'Approve'}
								</button>
								<button
									onclick={() => rejectChunk(result.chunk_id)}
									class="px-3 py-1 rounded transition {isRejected ? 'bg-danger text-white' : 'bg-danger/10 text-danger'}"
								>
									{isRejected ? 'Rejected' : 'Reject'}
								</button>
							</div>
						</div>

						<div class="mt-3 p-3 bg-sand/5 rounded text-sm text-sand/80">
							{result.snippet_preview}
						</div>
					</div>
				{/each}
			</div>

			<!-- Validation Section -->
			<div class="mt-6 p-4 border-t border-sand/20">
				<h3 class="text-lg font-semibold mb-3 text-sand">
					Validate ({selectedChunks.size} approved, {rejectedChunks.size} rejected)
				</h3>

				<textarea
					bind:value={validationNotes}
					placeholder="Optional notes..."
					class="w-full px-4 py-2 border border-sand/30 rounded-lg bg-panelSoft text-sand placeholder-sand/40 mb-4 focus:ring-2 focus:ring-info focus:outline-none"
					rows="3"
				></textarea>

				<button
					onclick={handleValidate}
					disabled={!canValidate}
					class="w-full px-6 py-3 bg-info text-white rounded-lg hover:bg-info/60 disabled:bg-sand/20 disabled:text-sand/40 font-semibold"
				>
					{isValidating ? 'Validating...' : `Validate ${selectedChunks.size} Source${selectedChunks.size === 1 ? '' : 's'}`}
				</button>

				{#if validationError}
					<div class="mt-4 p-4 bg-danger/5 border border-danger/20 rounded-lg text-danger">
						{validationError}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.source-validator {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}
</style>
