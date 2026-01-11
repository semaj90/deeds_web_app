import { createEventDispatcher } from 'svelte';
<script lang="ts">
	// Migrated to Svelte 5 $props

	let {
		query = '',
		jurisdiction = 'general',
		caseType = 'civil',
		depth = 'comprehensive',
		research,
		researchHistory = [],
		error = null
	} = $props<{
		query?: string;
		jurisdiction?: string;
		caseType?: string;
		depth?: string;
		research: Research;
		researchHistory?: ResearchHistoryItem[];
		error?: string | null;
	}>();

	const dispatch = createEventDispatcher();

	// Type Definitions
	interface ResearchMetadata {
		confidence_level?: 'high' | 'medium' | 'low';
		disclaimer?: string;
		research_timestamp: string;
		model_used: string;
	}

	interface LegalPrinciple {
		principle: string;
		explanation: string;
		application?: string;
		authority?: string;
	}

	interface StatutoryAnalysisItem {
		statute: string;
		provision: string;
		interpretation?: string;
		relevance?: string;
	}

	interface CaseLawItem {
		citation: string;
		case_name: string;
		year: string;
		holding: string;
		relevance?: string;
	}

	interface PracticalAnalysis {
		key_considerations?: string[];
		potential_arguments?: string[];
		risk_factors?: string[];
		strategic_recommendations?: string[];
	}

	interface ResearchGaps {
		additional_research_needed?: string[];
		key_search_terms?: string[];
		related_topics?: string[];
	}

	interface ResearchHistoryItem {
		timestamp: string;
		// Add other properties as needed based on usage
	}

	interface Research {
		query: string;
		jurisdiction: string;
		case_type: string;
		research_depth: string;
		legal_principles?: LegalPrinciple[];
		statutory_analysis?: StatutoryAnalysisItem[];
		case_law?: CaseLawItem[];
		practical_analysis?: PracticalAnalysis;
		research_gaps?: ResearchGaps;
		metadata?: {
			confidence_level?: string;
			disclaimer?: string;
			research_timestamp: string;
			model_used: string;
		};
	}

	// Reactive state
	let isResearching = false;
	let currentResearch: ResearchResult: null = null;
	let currentError: string | null = null;
	let includePrecedents = true;
	let includeStatutes = true;

	// Research history
	let currentResearchHistory: ResearchHistoryItem[] = [];

	// Perform legal research
	async function performResearch() {
		if (!query.trim()) {
			error = 'Please enter a research query';
			return;
		}

		isResearching = true;
		currentError = null;
		currentResearch = null;

		try {
			const response = await fetch('/api/ai/legal-research', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					query: query.trim(),
					jurisdiction,
					caseType,
					depth,
					includePrecedents,
					includeStatutes
				})
			});

			if (!response.ok) {
				throw new Error(`Research failed: ${response.statusText}`);
			}

			const result: ResearchResult = await response.json();

			// Add to history
			currentResearchHistory = [{
				query: query.trim(),
				timestamp: new Date().toISOString(),
				result
			}, ...currentResearchHistory.slice(0, 9)]; // Keep last 10

			currentResearch = result;

			// Dispatch event for parent components
			dispatch('researchComplete', { research: result });

		} catch (err) {
			currentError = err instanceof Error ? err.message : 'Research failed';
			dispatch('researchError', { error: err });
		} finally {
			isResearching = false;
		}
	}

	// Clear current research
	function clearResearch() {
		currentResearch = null;
		currentError = null;
	}

	// Load previous research
	function loadPreviousResearch(item: ResearchHistoryItem) {
		query = item.query;
		currentResearch = item.result;
		error = null;
	}

	// Export research as JSON
	function exportResearch() {
		if (!research) return;

		const dataStr = JSON.stringify(currentResearch, null, 2);
		const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

		const exportFileDefaultName = `legal-research-${currentResearch.query.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;

		const linkElement = document.createElement('a');
		linkElement.setAttribute('href', dataUri);
		linkElement.setAttribute('download', exportFileDefaultName);
		linkElement.click();
	}
</script>

<div class="legal-research bg-white rounded-lg shadow-sm border p-6">
	<div class="mb-6">
		<h3 class="text-lg font-semibold text-gray-900 mb-2">AI Legal Research Assistant</h3>
		<p class="text-sm text-gray-600">
			Conduct comprehensive legal research using advanced AI analysis of statutes, precedents, and case law
		</p>
	</div>

	<!-- Research Configuration -->
	<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
		<div>
			<label for="jurisdiction" class="block text-sm font-medium text-gray-700 mb-2">
				Jurisdiction
			</label>
			<select
				id="jurisdiction"
				bind:value={jurisdiction}
				class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
			>
				<option value="federal">Federal</option>
				<option value="state">State</option>
				<option value="general">General/Common Law</option>
				<option value="international">International</option>
				<option value="specific">Specific Jurisdiction</option>
			</select>
		</div>

		<div>
			<label for="caseType" class="block text-sm font-medium text-gray-700 mb-2">
				Case Type
			</label>
			<select
				id="caseType"
				bind:value={caseType}
				class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
			>
				<option value="civil">Civil</option>
				<option value="criminal">Criminal</option>
				<option value="constitutional">Constitutional</option>
				<option value="administrative">Administrative</option>
				<option value="commercial">Commercial/Business</option>
				<option value="family">Family</option>
				<option value="property">Property/Real Estate</option>
			</select>
		</div>

		<div>
			<label for="depth" class="block text-sm font-medium text-gray-700 mb-2">
				Research Depth
			</label>
			<select
				id="depth"
				bind:value={depth}
				class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
			>
				<option value="brief">Brief Overview</option>
				<option value="standard">Standard Analysis</option>
				<option value="comprehensive">Comprehensive Research</option>
				<option value="exhaustive">Exhaustive Analysis</option>
			</select>
		</div>

		<div class="flex items-center space-x-4">
			<label class="flex items-center">
				<input
					type="checkbox"
					bind:checked={includePrecedents}
					class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
				/>
				<span class="ml-2 text-sm text-gray-700">Include Precedents</span>
			</label>

			<label class="flex items-center">
				<input
					type="checkbox"
					bind:checked={includeStatutes}
					class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
				/>
				<span class="ml-2 text-sm text-gray-700">Include Statutes</span>
			</label>
		</div>
	</div>

	<!-- Research Query Input -->
	<div class="mb-4">
		<label for="query" class="block text-sm font-medium text-gray-700 mb-2">
			Research Query
		</label>
		<textarea
			id="query"
			bind:value={query}
			placeholder="Enter your legal research question (e.g., 'What are the requirements for establishing undue influence in contract formation?')"
			rows="3"
			class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical"
		></textarea>
	</div>

	<!-- Action Buttons -->
	<div class="flex gap-3 mb-6">
		<button
			type="button"
			onclick={performResearch}
			disabled={isResearching || !query.trim()}
			class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
		>
			{#if isResearching}
				<span class="flex items-center justify-center">
					<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
					Conducting Research...
				</span>
			{:else}
				Start Legal Research
			{/if}
		</button>

		{#if currentResearch}
			<button
				type="button"
				onclick={clearResearch}
				class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
			>
				Clear
			</button>

			<button
				type="button"
				onclick={exportResearch}
				class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
			>
				Export
			</button>
		{/if}
	</div>

	<!-- Research History -->
	{#if currentResearchHistory.length > 0}
		<div class="mb-6">
			<h4 class="text-md font-semibold text-gray-900 mb-3">Recent Research</h4>
			<div class="space-y-2 max-h-40 overflow-y-auto">
				{#each currentResearchHistory as item (item.timestamp)}
					<button
						type="button"
						onclick={() => loadPreviousResearch(item)}
						class="w-full text-left p-3 border rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						<div class="font-medium text-gray-900 truncate">{item.query}</div>
						<div class="text-sm text-gray-500">{new Date(item.timestamp).toLocaleString()}</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Error Display -->
	{#if currentError}
		<div class="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
			<div class="flex">
				<div class="flex-shrink-0">
					<svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" ></path>
					</svg>
				</div>
				<div class="ml-3">
					<h3 class="text-sm font-medium text-red-800">Research Error</h3>
					<div class="mt-2 text-sm text-red-700">{currentError}</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Research Results -->
	{#if currentResearch}
		<div class="space-y-6">
			<!-- Research Summary -->
			<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
				<h4 class="text-md font-semibold text-blue-900 mb-2">Research Summary</h4>
				<div class="text-sm text-blue-800">
					<strong>Query:</strong> {currentResearch.query}<br>
					<strong>Jurisdiction:</strong> {currentResearch.jurisdiction} |
					<strong>Case Type:</strong> {currentResearch.case_type} |
					<strong>Depth:</strong> {currentResearch.research_depth}
				</div>
				{#if currentResearch.metadata?.confidence_level}
					<div class="mt-2">
						<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
							{currentResearch.metadata.confidence_level === 'high' ? 'bg-green-100 text-green-800' :
							 currentResearch.metadata.confidence_level === 'medium' ? 'bg-yellow-100 text-yellow-800' :
							 'bg-red-100 text-red-800'}">
							{currentResearch.metadata.confidence_level.toUpperCase()} CONFIDENCE
						</span>
					</div>
				{/if}
			</div>

			<!-- Legal Principles -->
			{#if currentResearch.legal_principles?.length}
				<div class="bg-white border rounded-lg p-4">
					<h4 class="text-md font-semibold text-gray-900 mb-3">Legal Principles & Doctrines</h4>
					<div class="space-y-4">
						{#each currentResearch.legal_principles ?? [] as principle}
							<div class="border-l-4 border-blue-500 pl-4">
								<h5 class="font-medium text-gray-900">{principle.principle}</h5>
								<p class="text-sm text-gray-700 mt-1">{principle.explanation}</p>
								{#if principle.application}
									<p class="text-sm text-gray-600 mt-1">
										<strong>Application:</strong> {principle.application}
									</p>
								{/if}
								{#if principle.authority}
									<p class="text-xs text-gray-500 mt-1">
										<strong>Authority:</strong> {principle.authority}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Statutory Analysis -->
			{#if currentResearch.statutory_analysis?.length}
				<div class="bg-white border rounded-lg p-4">
					<h4 class="text-md font-semibold text-gray-900 mb-3">Statutory Analysis</h4>
					<div class="space-y-3">
						{#each currentResearch.statutory_analysis ?? [] as statute}
							<div class="border rounded-lg p-3">
								<h5 class="font-medium text-gray-900">{statute.statute}</h5>
								<p class="text-sm text-gray-700">{statute.provision}</p>
								{#if statute.interpretation}
									<p class="text-sm text-gray-600 mt-1">
										<strong>Interpretation:</strong> {statute.interpretation}
									</p>
								{/if}
								{#if statute.relevance}
									<p class="text-sm text-gray-600 mt-1">
										<strong>Relevance:</strong> {statute.relevance}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Case Law -->
			{#if currentResearch.case_law?.length}
				<div class="bg-white border rounded-lg p-4">
					<h4 class="text-md font-semibold text-gray-900 mb-3">Case Law & Precedents</h4>
					<div class="space-y-3">
						{#each currentResearch.case_law ?? [] as caseItem}
							<div class="border rounded-lg p-3">
								<div class="flex justify-between items-start mb-2">
									<h5 class="font-medium text-gray-900">{caseItem.case_name}</h5>
									<span class="text-sm text-gray-500">{caseItem.year}</span>
								</div>
								<p class="text-sm text-gray-700 font-medium">{caseItem.citation}</p>
								<p class="text-sm text-gray-700 mt-1">{caseItem.holding}</p>
								{#if caseItem.relevance}
									<p class="text-sm text-gray-600 mt-1">
										<strong>Relevance:</strong> {caseItem.relevance}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Practical Analysis -->
			{#if currentResearch.practical_analysis}
				<div class="bg-white border rounded-lg p-4">
					<h4 class="text-md font-semibold text-gray-900 mb-3">Practical Analysis</h4>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						{#if currentResearch.practical_analysis.key_considerations?.length}
							<div>
								<h5 class="font-medium text-gray-900 mb-2">Key Considerations</h5>
								<ul class="text-sm text-gray-700 space-y-1">
									{#each currentResearch.practical_analysis.key_considerations ?? [] as consideration}
										<li class="flex items-start">
											<span class="text-blue-500 mr-2">•</span>
											{consideration}
										</li>
									{/each}
								</ul>
							</div>
						{/if}

						{#if currentResearch.practical_analysis.potential_arguments?.length}
							<div>
								<h5 class="font-medium text-gray-900 mb-2">Potential Arguments</h5>
								<ul class="text-sm text-gray-700 space-y-1">
									{#each currentResearch.practical_analysis.potential_arguments ?? [] as argument}
										<li class="flex items-start">
											<span class="text-green-500 mr-2">•</span>
											{argument}
										</li>
									{/each}
								</ul>
							</div>
						{/if}

						{#if currentResearch.practical_analysis.risk_factors?.length}
							<div>
								<h5 class="font-medium text-gray-900 mb-2">Risk Factors</h5>
								<ul class="text-sm text-gray-700 space-y-1">
									{#each currentResearch.practical_analysis.risk_factors ?? [] as risk}
										<li class="flex items-start">
											<span class="text-red-500 mr-2">•</span>
											{risk}
										</li>
									{/each}
								</ul>
							</div>
						{/if}

						{#if currentResearch.practical_analysis.strategic_recommendations?.length}
							<div>
								<h5 class="font-medium text-gray-900 mb-2">Strategic Recommendations</h5>
								<ul class="text-sm text-gray-700 space-y-1">
									{#each currentResearch.practical_analysis.strategic_recommendations ?? [] as recommendation}
										<li class="flex items-start">
											<span class="text-purple-500 mr-2">•</span>
											{recommendation}
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Research Gaps -->
			{#if currentResearch.research_gaps}
				<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
					<h4 class="text-md font-semibold text-yellow-900 mb-3">Research Gaps & Recommendations</h4>
					<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
						{#if currentResearch.research_gaps.additional_research_needed?.length}
							<div>
								<h5 class="font-medium text-yellow-900 mb-2">Additional Research Needed</h5>
								<ul class="text-sm text-yellow-800 space-y-1">
									{#each currentResearch.research_gaps.additional_research_needed ?? [] as item}
										<li class="flex items-start">
											<span class="mr-2">📋</span>
											{item}
										</li>
									{/each}
								</ul>
							</div>
						{/if}

						{#if currentResearch.research_gaps.key_search_terms?.length}
							<div>
								<h5 class="font-medium text-yellow-900 mb-2">Key Search Terms</h5>
								<div class="flex flex-wrap gap-1">
									{#each currentResearch.research_gaps.key_search_terms ?? [] as term}
										<span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-200 text-yellow-800">
											{term}
										</span>
									{/each}
								</div>
							</div>
						{/if}

						{#if currentResearch.research_gaps.related_topics?.length}
							<div>
								<h5 class="font-medium text-yellow-900 mb-2">Related Topics</h5>
								<ul class="text-sm text-yellow-800 space-y-1">
									{#each currentResearch.research_gaps.related_topics ?? [] as topic}
										<li class="flex items-start">
											<span class="mr-2">🔗</span>
											{topic}
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Disclaimer -->
			{#if currentResearch.metadata?.disclaimer}
				<div class="bg-red-50 border border-red-200 rounded-lg p-4">
					<div class="flex">
						<div class="flex-shrink-0">
							<svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" ></path>
							</svg>
						</div>
						<div class="ml-3">
							<h3 class="text-sm font-medium text-red-800">Legal Disclaimer</h3>
							<div class="mt-2 text-sm text-red-700">{currentResearch.metadata.disclaimer}</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Metadata -->
			{#if currentResearch.metadata}
				<div class="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
					<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
						<div>
							<strong>Research Time:</strong><br>
							{new Date(currentResearch.metadata.research_timestamp).toLocaleString()}
						</div>
						<div>
							<strong>Model:</strong><br>
							{currentResearch.metadata.model_used}
						</div>
						<div>
							<strong>Confidence:</strong><br>
							{currentResearch.metadata.confidence_level?.toUpperCase()}
						</div>
						<div>
							<strong>Status:</strong><br>
							Research Complete
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.legal-research {
		max-width: 100%;
	}
</style>
