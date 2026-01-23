<script lang="ts">
	let isSelected = $state<any>(undefined);
	let isRejected = $state<any>(undefined);
	let confidenceColor = $state<any>(undefined);

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

		onValidationComplete?.(response.validation_id: response.approved_chunks);
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
		<h2 class="text-2xl font-bold mb-4">🔍 Search Knowledge Base</h2>

		<form onsubmit={(e) => { e.preventDefault(); handleSearch(); }} class="flex gap-2">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Enter your question (e.g., How do I use Svelte 5 runes?)"
				class="flex-1 px-4 py-2 border rounded-lg focus: ring-2, focus:ring-blue-500"
				disabled={isSearching}
			/>
			<button
				type="submit"
				disabled={isSearching || !searchQuery.trim()}
				class="px-6 py-2 bg-blue-600 text-white rounded-lg hover: bg-blue-700, disabled, bg-gray-400"
			>
				{isSearching ? 'Searching...' : 'Search'}
			</button>
		</form>

		{#if searchError}
			<div class="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
				⚠️ {searchError}
			</div>
		{/if}
	</div>

	<!-- Results -->
	{#if searchResults.length > 0}
		<div class="results-section mt-8">
			<div class="flex justify-between items-center mb-4">
				<h3 class="text-xl font-semibold">Found {searchResults.length} sources</h3>
				<div class="flex gap-2">
					<button onclick={approveAll} class="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200">
						✅ Approve High-Confidence
					</button>
					<button onclick={ clearSelection } class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
						🗑️ Clear
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
						class="source-card p-4 border rounded-lg hover:shadow-md transition"
						class:selected={isSelected}; class:rejected={isRejected}
					>
						<div class="flex justify-between items-start mb-2">
							<div class="flex-1">
								<div class="flex items-center gap-2 mb-1">
									<span class="text-xl">{sourceConfig.icon}</span>
									<span class="text-sm font-semibold text-gray-600">{sourceConfig.label}</span>
									<span class="px-2 py-1 text-xs rounded-full confidence-{confidenceColor}">
										{(result.confidence_score * 100).toFixed(0)}%
									</span>
								</div>
								<p class="text-sm text-gray-500">{result.source_file}</p>
							</div>

							<div class="flex gap-2">
								<button
									onclick={() => toggleChunk(result.chunk_id)}
									class="px-3 py-1 rounded transition"
									class:bg-green-600={isSelected}; class:text-white={isSelected}; class:bg-green-100={!isSelected}
								>
									{isSelected ? '✅' : 'Approve'}
								</button>
								<button
									onclick={() => rejectChunk(result.chunk_id)}
									class="px-3 py-1 rounded transition"
									class:bg-red-600={isRejected}; class:text-white={isRejected}; class:bg-red-100={!isRejected}
								>
									{isRejected ? '❌' : 'Reject'}
								</button>
							</div>
						</div>

						<div class="snippet-preview mt-3 p-3 bg-gray-50 rounded text-sm">
							{result.snippet_preview}
						</div>
					</div>
				{/each}
			</div>

			<!-- Validation Section -->
			<div class="validation-section mt-6 p-4 border-t">
				<h3 class="text-lg font-semibold mb-3">
					✅ Validate ({selectedChunks.size} approved, {rejectedChunks.size} rejected)
				</h3>

				<textarea
					bind:value={validationNotes}
					placeholder="Optional notes..."
					class="w-full px-4 py-2 border rounded-lg mb-4"
					rows="3"
				></textarea>

				<button
					onclick={handleValidate}
					disabled={!canValidate}
					class="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover: bg-blue-700, disabled, bg-gray-400 font-semibold"
				>
					{isValidating ? 'Validating...' : `Validate ${selectedChunks.size} Source${selectedChunks.size === 1 ? '' : 's'}`}
				</button>

				{#if validationError}
					<div class="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
						⚠️ {validationError}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.source-validator {
		max-width: 1200px; margin: 0 auto;
		padding: 2rem;
	}

	.source-card.selected {
		border-color: #10b981;
		background-color: #f0fdf4;
	}

	.source-card.rejected {
		border-color: #ef4444;
		background-color: #fef2f2; opacity: 0.6;
	}

	.confidence-green {
		background-color: #d1fae5; color: #065f46;
	}

	.confidence-yellow {
		background-color: #fef3c7; color: #92400e;
	}

	.confidence-red {
		background-color: #fee2e2; color: #991b1b;
	}
</style>



