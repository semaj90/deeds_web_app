<script lang="ts">
/**
 * AnswerGenerator Component (Svelte 5)
 * Display LLM-generated answer with inline citations
 *
 * Pattern: CopilotKit + Pydantic AI
 * Phase: Agentic RAG Source Validation (Task 1.3)
 */

import { sourceValidationAPI } from '$lib/services/source-validation-api';
import type {
  AnswerGeneratorProps,
  CitationMetadata
} from '$lib/types/source-validation';
import CitationInspector from './CitationInspector.svelte';

// Svelte 5 props
let {
	validationId,
	caseId,
	query,
	onAnswerGenerated,
	llmProvider = 'gemma3-legal'
}: AnswerGeneratorProps = $props();

// State
let answer = $state<string | null>(null);
let citations = $state<CitationMetadata[]>([]);
let isGenerating = $state(false);
let generationError = $state<string | null>(null);
let selectedCitation = $state<CitationMetadata | null>(null);
let showCitationInspector = $state(false);

// Derived
let usedCitations = $derived(citations.filter((c) => c.used_in_answer));
let unusedCitations = $derived(citations.filter((c) => !c.used_in_answer));

// ============================================================================
// Generate Answer
// ============================================================================

async function generateAnswer() {
	isGenerating = true;
	generationError = null;
	answer = null;
	citations = [];

	try {
		const response = await sourceValidationAPI.generateAnswer({
			validation_id: validationId,
			case_id: caseId,
			query,
			llm_provider: llmProvider
		});

		answer = response.answer;
		citations = response.citations;

		onAnswerGenerated?.(response.answer, response.citations);
	} catch (error) {
		generationError = error instanceof Error ? error.message : 'Generation failed';
	} finally {
		isGenerating = false;
	}
}

// ============================================================================
// Citation Click Handler
// ============================================================================

function openCitation(citation: CitationMetadata) {
	selectedCitation = citation;
	showCitationInspector = true;
}

// Parse answer text to make citations clickable
function renderAnswerWithClickableCitations(text: string): string {
	// Replace [Source N] with clickable spans
	return text.replace(/\[Source (\d+)\]/g, (match, num) => {
		const index = parseInt(num) - 1;
		if (index >= 0 && index < citations.length) {
			return `<button class="citation-link" data-citation-index="${index}">${match}</button>`;
		}
		return match;
	});
}

// Handle click on citation buttons
function handleCitationClick(event: MouseEvent) {
	const target = event.target as HTMLElement;
	if (target.classList.contains('citation-link')) {
		const index = parseInt(target.dataset.citationIndex || '-1');
		if (index >= 0 && index < citations.length) {
			openCitation(citations[index]);
		}
	}
}

// Auto-generate on mount if not already generated
$effect(() => {
	if (!answer && !isGenerating && !generationError) {
		generateAnswer();
	}
});
</script>

<div class="answer-generator">
	<div class="header mb-4">
		<div class="flex justify-between items-center">
			<h2 class="text-2xl font-bold">🤖 AI-Generated Answer</h2>
			<div class="flex items-center gap-2 text-sm text-gray-600">
				<span class="px-2 py-1 bg-blue-100 rounded">{llmProvider}</span>
				<span>Validation: {validationId.slice(0, 16)}...</span>
			</div>
		</div>
		<p class="text-sm text-gray-600 mt-1">
			<strong>Query:</strong> {query}
		</p>
	</div>

	{#if isGenerating}
		<div class="loading-state p-8 bg-gray-50 rounded-lg text-center">
			<div class="spinner mb-4"></div>
			<p class="text-gray-600">Generating answer with validated sources...</p>
		</div>
	{:else if generationError}
		<div class="error-state p-4 bg-red-50 border border-red-200 rounded-lg">
			<p class="text-red-700">⚠️ {generationError}</p>
			<button
				onclick={generateAnswer}
				class="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
			>
				Retry
			</button>
		</div>
	{:else if answer}
		<div class="answer-content">
			<!-- Generated Answer -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div
				class="answer-text p-6 bg-white border rounded-lg mb-6 prose max-w-none"
				onclick={handleCitationClick}
				onkeydown={(e) => { if (e.key === 'Enter') handleCitationClick(e as unknown as MouseEvent); }}
				role="article"
				tabindex="0"
				aria-label="Generated answer with clickable citations"
			>
				{@html renderAnswerWithClickableCitations(answer)}
			</div>

			<!-- Citations Section -->
			<div class="citations-section">
				<h3 class="text-lg font-semibold mb-3">
					📚 Sources ({citations.length} total, {usedCitations.length} cited)
				</h3>

				<!-- Used Citations -->
				{#if usedCitations.length > 0}
					<div class="mb-4">
						<h4 class="text-sm font-semibold text-green-700 mb-2">✅ Cited in Answer</h4>
						<div class="grid gap-2">
							{#each usedCitations as citation, index (citation.chunk_id)}
								<button
									onclick={() => openCitation(citation)}
									class="citation-card p-3 border border-green-200 bg-green-50 rounded hover:bg-green-100 text-left"
								>
									<div class="flex justify-between items-start">
										<div class="flex-1">
											<div class="text-xs text-green-700 font-semibold mb-1">
												[Source {index + 1}]
											</div>
											<div class="text-sm text-gray-700">{citation.source_file}</div>
											<div class="text-xs text-gray-500 mt-1 line-clamp-2">
												{citation.snippet}
											</div>
										</div>
										<div class="ml-3 text-xs text-gray-500">
											{(citation.confidence * 100).toFixed(0)}%
										</div>
									</div>
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Unused Citations -->
				{#if unusedCitations.length > 0}
					<div>
						<h4 class="text-sm font-semibold text-gray-500 mb-2">📖 Available but Not Cited</h4>
						<div class="grid gap-2">
							{#each unusedCitations as citation (citation.chunk_id)}
								<button
									onclick={() => openCitation(citation)}
									class="citation-card p-3 border bg-gray-50 rounded hover:bg-gray-100 text-left opacity-60"
								>
									<div class="flex justify-between items-start">
										<div class="flex-1">
											<div class="text-sm text-gray-700">{citation.source_file}</div>
											<div class="text-xs text-gray-500 mt-1 line-clamp-2">
												{citation.snippet}
											</div>
										</div>
										<div class="ml-3 text-xs text-gray-500">
											{(citation.confidence * 100).toFixed(0)}%
										</div>
									</div>
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Citation Inspector Modal -->
{#if showCitationInspector && selectedCitation}
	<CitationInspector
		citation={selectedCitation}
		isOpen={showCitationInspector}
		onClose={() => {
			showCitationInspector = false;
			selectedCitation = null;
		}}
	/>
{/if}

<style>
	.answer-generator {
		max-width: 1000px;
		margin: 0 auto;
	}

	.spinner {
		border: 3px solid #f3f4f6;
		border-top: 3px solid #3b82f6;
		border-radius: 50%;
		width: 40px;
		height: 40px;
		animation: spin 1s linear infinite;
		margin: 0 auto;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	:global(.citation-link) {
		color: #2563eb;
		text-decoration: underline;
		cursor: pointer;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
	}

	:global(.citation-link:hover) {
		color: #1d4ed8;
		background-color: #dbeafe;
		padding: 2px 4px;
		border-radius: 3px;
	}

	.line-clamp-2 { overflow: hidden;, display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.prose {
		line-height: 1.7;
	}

	.prose :global(p) {
		margin-bottom: 1em;
	}
</style>
