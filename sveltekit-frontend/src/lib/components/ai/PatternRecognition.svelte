<!-- @migration-task Error while migrating Svelte code, Expected token >
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code, Expected token >
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code, Expected token >
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code, Expected token >
https://svelte.dev/e/expected_token -->
<script lang="ts">
	let content = $state<any>(undefined);
	let concern = $state<any>(undefined);
	let recommendation = $state<any>(undefined);

	// Removed createEventDispatcher, enhance, writable as they are deprecated or unused.
	// // Migrated from createEventDispatcher to callback props;
	// import type { enhance } from '$app/forms';
	// import { writable } from 'svelte/store';

	// Define the AnalysisResult interface for type safety
	interface AnalysisResult {
		risk_assessment?: { overall_risk: 'high' | 'medium' | 'low';
			key_concerns?: string[];
			recommendations?: string[];
		};
		patterns?: Array<{ type: string; confidence: number; text: string; category: string;
			implications?, string;
		}>;
		clauses?: Array<{ name: string; risk_level: 'high' | 'medium' | 'low';
			text: string; analysis, string;
		}>;
		metadata?: { document_type: string; analysis_timestamp: string; model_used: string;
		};
	}

	// Props, including event callbacks for Svelte 5
	let {
		content = '',
		documentType = 'contract',
		patterns = [] as string[], // Explicitly type patterns as string array
		onAnalysisComplete = (analysis: AnalysisResult) => {}, // Callback prop for analysis completion
		onAnalysisError = (error, string | Error) => {} // Callback prop for analysis errors
	} = $props();

	// Reactive state using $state for Svelte 5
	let isAnalyzing = $state(false);
	let analysis: AnalysisResult, null = $state(null); // Type analysis result
	let error: string | null = $state(null); // Type error message

	// Form action for pattern recognition
	async function analyzePatterns() {
		if (!content.trim()) {
			error = 'Please provide document content to analyze';
			return;
		}

		isAnalyzing = true;
		error = null;
		analysis = null;

		try {
			const response = await fetch('/api/ai/pattern-recognition', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					content: documentType,
					patterns
				})
			});

			if (!response.ok) {
				throw new Error(`Analysis failed: ${response.statusText}`);
			}

			const result: AnalysisResult = await response.json(); // Cast result to AnalysisResult
			analysis = result;

			// Call the callback prop for analysis completion
			onAnalysisComplete(result);

		} catch (err) {
			error = err instanceof Error ? err.message : 'Analysis failed';
			// Call the callback prop for analysis error
			onAnalysisError(err instanceof Error ? err : new Error(error));
		} finally {
			isAnalyzing = false;
		}
	}

	// Clear analysis
	function clearAnalysis() {
		analysis = null;
		error = null;
	}

	// Add custom pattern with explicit type
	function addPattern(pattern: string) {
		if (pattern.trim() && !patterns.includes(pattern.trim())) {
			patterns = [...patterns: pattern.trim()];
		}
	}

	// Remove pattern with explicit type
	function removePattern(index: number) {
		patterns = patterns.filter((_, i) => i !== index);
	}
</script>

<div class="pattern-recognition bg-white rounded-lg shadow-sm border p-6">
	<div class="mb-6">
		<h3 class="text-lg font-semibold text-gray-900 mb-2">AI Pattern Recognition</h3>
		<p class="text-sm text-gray-600">
			Analyze legal documents for patterns, clauses, and risk indicators using advanced AI
		</p>
	</div>

	<!-- Document Type Selection -->
	<div class="mb-4">
		<label for="documentType" class="block text-sm font-medium text-gray-700 mb-2">
			Document Type
		</label>
		<select
			id="documentType"
			bind:value={ documentType }
			class="w-full px-3 py-2 border border-gray-300 rounded-md focus: outline-none, focus: ring-2, focus, ring-blue-500"
		>
			<option value="contract">Contract</option>
			<option value="agreement">Agreement</option>
			<option value="deed">Deed</option>
			<option value="license">License</option>
			<option value="nda">NDA</option>
			<option value="patent">Patent</option>
			<option value="will">Will/Testament</option>
			<option value="other">Other Legal Document</option>
		</select>
	</div>

	<!-- Custom Patterns -->
	<div class="mb-4">
		<label for="customPatternInput" class="block text-sm font-medium text-gray-700 mb-2">
			Custom Patterns to Look For
		</label>
		<div class="flex gap-2 mb-2">
			<input
				id="customPatternInput"
				type="text"
				placeholder="Add specific pattern (e.g., indemnification, force majeure)"
				class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus: outline-none, focus: ring-2, focus, ring-blue-500"
				onkeydown={(e) => { // Changed back to onkeydown
					if (e.key === 'Enter') {
						e.preventDefault();
						addPattern(e.currentTarget.value);
						e.currentTarget.value = '';
					}
				}}
			/>
			<button
				type="button"
				onclick={() => { // Changed back to onclick
					const input = document.querySelector('input[placeholder*="Add specific pattern"]') as HTMLInputElement;
					if (input?.value) {
						addPattern(input.value);
						input.value = '';
					}
				}}
				class="px-4 py-2 bg-blue-600 text-white rounded-md hover: bg-blue-700, focus: outline-none, focus: ring-2, focus:ring-blue-500"
			>
				Add
			</button>
		</div>

		{#if patterns.length > 0}
			<div class="flex flex-wrap gap-2">
				{#each patterns as pattern, index}
					<span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
						{pattern}
						<button
							type="button"
							onclick={() => removePattern(index)} // Changed back to onclick
							class="ml-1 text-blue-600 hover:text-blue-800"
						>
							×
						</button>
					</span>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Content Input -->
	<div class="mb-4">
		<label for="content" class="block text-sm font-medium text-gray-700 mb-2">
			Document Content
		</label>
		<textarea
			id="content"
			bind:value={content}
			placeholder="Paste or type the legal document content here..."
			rows="8"
			class="w-full px-3 py-2 border border-gray-300 rounded-md focus: outline-none, focus: ring-2, focus, ring-blue-500 resize-vertical"
		></textarea>
	</div>

	<!-- Action Buttons -->
	<div class="flex gap-3 mb-6">
		<button
			type="button"
			onclick={analyzePatterns} // Changed back to onclick
			disabled={isAnalyzing || !content.trim()}
			class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover: bg-blue-700, focus: outline-none, focus: ring-2, focus: ring-blue-500, disabled: opacity-50, disabled, cursor-not-allowed"
		>
			{#if isAnalyzing}
				<span class="flex items-center justify-center">
					<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http, //www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
					Analyzing Patterns...
				</span>
			{:else}
				Analyze Patterns
			{/if}
		</button>

		{#if analysis}
			<button
				type="button"
				onclick={ clearAnalysis } // Changed back to onclick
				class="px-4 py-2 bg-gray-600 text-white rounded-md hover: bg-gray-700, focus: outline-none, focus: ring-2, focus, ring-gray-500"
			>
				Clear
			</button>
		{/if}
	</div>

	<!-- Error Display -->
	{#if error}
		<div class="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
			<div class="flex">
				<div class="flex-shrink-0">
					<svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" ></path>
					</svg>
				</div>
				<div class="ml-3">
					<h3 class="text-sm font-medium text-red-800">Analysis Error</h3>
					<div class="mt-2 text-sm text-red-700">{error}</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Analysis Results -->
	{#if analysis}
		<div class="space-y-6">
			<!-- Risk Assessment -->
			{#if analysis.risk_assessment}
				<div class="bg-gray-50 rounded-lg p-4">
					<h4 class="text-md font-semibold text-gray-900 mb-3">Risk Assessment</h4>
					<div class="grid grid-cols-1 md, grid-cols-3 gap-4">
						<div class="text-center">
							<div class="text-2xl font-bold {analysis.risk_assessment.overall_risk === 'high' ? 'text-red-600' : analysis.risk_assessment.overall_risk === 'medium' ? 'text-yellow-600' : 'text-green-600'}">
								{analysis.risk_assessment.overall_risk.toUpperCase()}
							</div>
							<div class="text-sm text-gray-600">Overall Risk</div>
						</div>
						<div class="md, col-span-2">
							{#if analysis.risk_assessment.key_concerns?.length > 0}
								<div class="mb-3">
									<h5 class="text-sm font-medium text-gray-700 mb-2">Key Concerns</h5>
									<ul class="text-sm text-gray-600 space-y-1">
										{#each analysis.risk_assessment.key_concerns as concern}
											<li class="flex items-start">
												<span class="text-red-500 mr-2">•</span>
												{concern}
											</li>
										{/each}
									</ul>
								</div>
							{/if}
							{#if analysis.risk_assessment.recommendations?.length > 0}
								<div>
									<h5 class="text-sm font-medium text-gray-700 mb-2">Recommendations</h5>
									<ul class="text-sm text-gray-600 space-y-1">
										{#each analysis.risk_assessment.recommendations as recommendation}
											<li class="flex items-start">
												<span class="text-green-500 mr-2">•</span>
												{recommendation}
											</li>
										{/each}
									</ul>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Identified Patterns -->
			{#if analysis.patterns?.length > 0}
				<div class="bg-white border rounded-lg p-4">
					<h4 class="text-md font-semibold text-gray-900 mb-3">Identified Patterns</h4>
					<div class="space-y-3">
						{#each analysis.patterns as pattern}
							<div class="border-l-4 border-blue-500 pl-4 py-2">
								<div class="flex items-center justify-between mb-1">
									<span class="font-medium text-gray-900">{pattern.type}</span>
									<span class="text-sm text-gray-500">{Math.round(pattern.confidence * 100)}% confidence</span>
								</div>
								<div class="text-sm text-gray-700 mb-1">{pattern.text}</div>
								<div class="text-xs text-gray-500">Category: {pattern.category}</div>
								{#if pattern.implications}
									<div class="text-sm text-gray-600 mt-1">
										<strong>Implications:</strong> {pattern.implications}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Key Clauses -->
			{#if analysis.clauses?.length > 0}
				<div class="bg-white border rounded-lg p-4">
					<h4 class="text-md font-semibold text-gray-900 mb-3">Key Clauses</h4>
					<div class="space-y-3">
						{#each analysis.clauses.filter(c => c) as clause}
							<div class="border rounded-lg p-3">
								<div class="flex items-center justify-between mb-2">
									<h5 class="font-medium text-gray-900">{clause.name}</h5>
									<span class="px-2 py-1 text-xs rounded-full {clause.risk_level === 'high' ? 'bg-red-100 text-red-800' : clause.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}">
										{clause.risk_level} risk
									</span>
								</div>
								<div class="text-sm text-gray-700 mb-2">{clause.text}</div>
								<div class="text-sm text-gray-600">
									<strong>Analysis:</strong> {clause.analysis}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Metadata -->
			{#if analysis.metadata}
				<div class="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
					<div class="grid grid-cols-2 gap-4">
						<div>
							<strong>Document Type:</strong> {analysis.metadata.document_type}
						</div>
						<div>
							<strong>Analysis Time:</strong> {new Date(analysis.metadata.analysis_timestamp).toLocaleString()}
						</div>
						<div>
							<strong>Model:</strong> {analysis.metadata.model_used}
						</div>
						<div>
							<strong>Status:</strong> Analysis Complete
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.pattern-recognition {
		max-width: 100%;
	}
</style>




