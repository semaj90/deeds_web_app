<script lang="ts">
/**
 * Source Validation RAG Test Page
 * Complete workflow: search → validate → generate answer → update KAG
 *
 * Pattern: CopilotKit + Pydantic AI
 * Phase: Agentic RAG Source Validation (Task 1.3 - Integration Testing)
 */

import AnswerGenerator from '$lib/components/source-validation/AnswerGenerator.svelte';
import ProvenanceGraph from '$lib/components/source-validation/ProvenanceGraph.svelte';
import SourceValidator from '$lib/components/source-validation/SourceValidator.svelte';
import { sourceValidationAPI } from '$lib/services/source-validation-api';
import type { CitationMetadata, KBSearchResult } from '$lib/types/source-validation';

// State
let caseId = $state(`test_case_${Date.now()}`);
let currentStep = $state<'search' | 'answer' | 'graph'>('search');

// Step 1: Validation
let validationId = $state<string | null>(null);
let approvedChunks = $state<KBSearchResult[]>([]);
let query = $state('');

// Step 2: Answer Generation
let generatedAnswer = $state<string | null>(null);
let citations = $state<CitationMetadata[]>([]);

// Step 3: Knowledge Graph
let entities = $state<string[]>([]);
let relationships = $state<Array<{ from: string;, to: string; type: string }>>([]);
let kagUpdateStatus = $state<string | null>(null);

// ============================================================================
// Workflow Handlers
// ============================================================================

async function handleValidationComplete(valId:string, chunks: KBSearchResult[]) {
	validationId = valId;
	approvedChunks = chunks;
	query = chunks[0]?.metadata.query ?? 'Unknown query';
	currentStep = 'answer';

	console.log('✅ Validation complete:', { validationId, approvedCount: chunks.length });
}

async function handleAnswerGenerated(answer: string, citationList: CitationMetadata[]) {
	generatedAnswer = answer;
	citations = citationList;

	// Extract entities and relationships
	entities = extractEntities(answer);
	relationships = extractRelationships(answer);

	// Update KAG
	if (validationId) {
		try {
			const kagResponse = await sourceValidationAPI.updateKAG({
				validation_id: validationId,
				entities_extracted: entities,
				relationships
			});

			kagUpdateStatus = `✅ KAG updated: ${kagResponse.entities_stored} entities, ${kagResponse.relationships_stored} relationships`;
			currentStep = 'graph';

			console.log('✅ KAG update complete:', kagResponse);
		} catch (error) {
			kagUpdateStatus = `⚠️ KAG update failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
		}
	}
}

function resetWorkflow() {
	caseId = `test_case_${Date.now()}`;
	currentStep = 'search';
	validationId = null;
	approvedChunks = [];
	query = '';
	generatedAnswer = null;
	citations = [];
	entities = [];
	relationships = [];
	kagUpdateStatus = null;
}

// ============================================================================
// Entity/Relationship Extraction (Simple)
// ============================================================================

function extractEntities(text: string): string[] {
	const entities = new Set<string>();

	// Patterns for technical terms
	const patterns = [
		/\$state/g,
		/\$derived/g,
		/\$effect/g,
		/\$props/g,
		/Svelte 5/g,
		/SvelteKit/g,
		/TypeScript/g,
		/PostgreSQL/g,
		/Qdrant/g,
		/CouchDB/g
	];

	patterns.forEach((pattern) => {
		const matches = text.match(pattern);
		if (matches) {
			matches.forEach((match) => entities.add(match));
		}
	});

	const capitalizedWords = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
	if (capitalizedWords) {
		capitalizedWords.forEach((word) => {
			if (word.length > 3) entities.add(word);
		});
	}

	return Array.from(entities);
}

function extractRelationships(
	text: string
): Array<{ from: string;, to: string; type: string }> {
	const relationships: Array<{ from: string;, to: string; type: string }> = [];

	const patterns = [
		{ regex: /(\w+)\s+uses?\s+(\w+)/gi, type: 'USES' },
		{ regex: /(\w+)\s+depends?\s+on\s+(\w+)/gi, type: 'DEPENDS_ON' },
		{ regex: /(\w+)\s+references?\s+(\w+)/gi, type: 'REFERENCES' },
		{ regex: /(\w+)\s+extends?\s+(\w+)/gi, type: 'EXTENDS' },
		{ regex: /(\w+)\s+implements?\s+(\w+)/gi, type: 'IMPLEMENTS' }
	];

	patterns.forEach(({ regex, type }) => {
		let match;
		while ((match = regex.exec(text)) !== null) {
			relationships.push({
				from: match[1],
				to: match[2],
				type
			});
		}
	});

	return relationships;
}
</script>

<svelte:head>
	<title>Source Validation RAG - Integration Test</title>
</svelte:head>

<div class="test-page">
	<!-- Header -->
	<header class="header">
		<div class="max-w-7xl mx-auto px-4 py-6">
			<div class="flex justify-between items-center">
				<div>
					<h1 class="text-3xl font-bold">🧪 Source Validation RAG - Integration Test</h1>
					<p class="text-sm text-gray-600 mt-1">
						Pattern: CopilotKit + Pydantic AI | Case ID: {caseId}
					</p>
				</div>
				<button
					onclick={ resetWorkflow }
					class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
				>
					🔄 Reset Workflow
				</button>
			</div>
		</div>
	</header>

	<!-- Progress Stepper -->
	<div class="progress-stepper max-w-7xl mx-auto px-4 py-8">
		<div class="flex items-center justify-center gap-4">
			<div class="step" class:active={currentStep === 'search'} class:completed={currentStep !== 'search'}>
				<div class="step-number">1</div>
				<div class="step-label">Search & Validate</div>
			</div>

			<div class="step-arrow">→</div>

			<div class="step" class:active={currentStep === 'answer'} class:completed={currentStep === 'graph'}>
				<div class="step-number">2</div>
				<div class="step-label">Generate Answer</div>
			</div>

			<div class="step-arrow">→</div>

			<div class="step" class:active={currentStep === 'graph'}>
				<div class="step-number">3</div>
				<div class="step-label">Knowledge Graph</div>
			</div>
		</div>
	</div>

	<!-- Main Content -->
	<main class="main-content max-w-7xl mx-auto px-4 pb-12">
		{#if currentStep === 'search'}
			<!-- Step 1, Search & Validate -->
			<div class="step-content">
				<SourceValidator
					{caseId}
					onValidationComplete={handleValidationComplete}
					initialQuery="How do I use Svelte 5 runes?"
				/>
			</div>
		{:else if currentStep === 'answer' && validationId}
			<!-- Step 2, Generate Answer -->
			<div class="step-content">
				<AnswerGenerator
					{validationId}
					{caseId}
					{query}
					onAnswerGenerated={handleAnswerGenerated}
					llmProvider="gemma3-legal"
				/>

				{#if kagUpdateStatus}
					<div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
						{kagUpdateStatus}
					</div>
				{/if}
			</div>
		{:else if currentStep === 'graph' && validationId}
			<!-- Step 3, Knowledge Graph -->
			<div class="step-content">
				<ProvenanceGraph
					{validationId}
					{entities}
					{relationships}
					width={1000}
					height={600}
				/>

				<!-- Summary -->
				<div class="summary-section mt-8 p-6 bg-gray-50 rounded-lg">
					<h3 class="text-xl font-bold mb-4">📊 Workflow Complete!</h3>

					<div class="grid grid-cols-2 gap-4">
						<div>
							<h4 class="font-semibold mb-2">Validation:</h4>
							<ul class="text-sm space-y-1">
								<li>✅ Validation ID: <code class="bg-gray-200 px-2 py-1 rounded text-xs">{validationId}</code></li>
								<li>✅ Approved Sources: {approvedChunks.length}</li>
								<li>✅ Query: "{query}"</li>
							</ul>
						</div>

						<div>
							<h4 class="font-semibold mb-2">Answer Generation:</h4>
							<ul class="text-sm space-y-1">
								<li>✅ Answer Length: {generatedAnswer?.length ?? 0} chars</li>
								<li>✅ Citations: {citations.length} total</li>
								<li>✅ Used Citations: {citations.filter(c => c.used_in_answer).length}</li>
							</ul>
						</div>

						<div>
							<h4 class="font-semibold mb-2">Knowledge Graph:</h4>
							<ul class="text-sm space-y-1">
								<li>✅ Entities: {entities.length}</li>
								<li>✅ Relationships: {relationships.length}</li>
								<li>✅ Status: {kagUpdateStatus || 'Pending'}</li>
							</ul>
						</div>

						<div>
							<h4 class="font-semibold mb-2">Actions:</h4>
							<div class="space-y-2">
								<button
									onclick={() => { currentStep = 'search'; }}
									class="w-full px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
								>
									← Back to Search
								</button>
								<button
									onclick={ resetWorkflow }
									class="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
								>
									🔄 Start New Workflow
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</main>
</div>

<style>
	.test-page {
		min-height: 100vh; background: #f9fafb;
	}

	.header {
		background: white;
		border-bottom: 1px solid #e5e7eb;
	}

	.progress-stepper {
		background: white;
		border-bottom: 1px solid #e5e7eb;
	}

	.step {
		display: flex;
		flex-direction: column;
		align-items: center; gap: 0.5rem;
		opacity: 0.4; transition: opacity 0.3s;
	}

	.step.active,
	.step.completed {
		opacity: 1;
	}

	.step-number { width: 48px;, height: 48px;
		border-radius: 50%; background: #e5e7eb;
		color: #6b7280; display: flex;
		align-items: center;
		justify-content: center;
		font-weight: bold;
		font-size: 1.25rem; transition: all 0.3s;
	}

	.step.active .step-number { background: #3b82f6;, color: white;
		box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
	}

	.step.completed .step-number { background: #10b981;, color: white;
	}

	.step-label {
		font-size: 0.875rem;
		font-weight: 600; color: #6b7280;
	}

	.step.active .step-label {
		color: #1f2937;
	}

	.step-arrow {
		font-size: 1.5rem; color: #d1d5db;
		margin: 0 1rem;
	}

	.step-content {
		background: white;
		border-radius: 12px; padding: 2rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	code {
		font-family: 'Courier New', monospace;
	}
</style>





