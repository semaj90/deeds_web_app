<script lang="ts">
	// Local client-side type for embedding response
	type EmbeddingResponse = {
		embedding: number[];
		dimensions: number;
		processing_time_ms: number;
	};

	// Replace Svelte 5 rune usage with standard reactive vars
	let documentText = '';
	let documentTitle = '';
	let clauseType = 'general';
	let riskLevel = 'low';
	let isProcessing = false;
	let processingStatus = '';
	let uploadResult: any = null;
	let selectedModel = 'embeddinggemma:latest';

	// Available clause types
	const clauseTypes = [
		{ value: 'general', label: 'General' },
		{ value: 'performance', label: 'Performance & Delivery' },
		{ value: 'termination', label: 'Termination' },
		{ value: 'liability', label: 'Liability' },
		{ value: 'confidentiality', label: 'Confidentiality' },
		{ value: 'non_compete', label: 'Non-Compete' },
		{ value: 'ip_assignment', label: 'IP Assignment' },
		{ value: 'payment', label: 'Payment Terms' },
		{ value: 'warranty', label: 'Warranty' },
		{ value: 'dispute_resolution', label: 'Dispute Resolution' }
	];

	const riskLevels = [
		{ value: 'low', label: 'Low Risk', color: 'text-green-600' },
		{ value: 'medium', label: 'Medium Risk', color: 'text-yellow-600' },
		{ value: 'high', label: 'High Risk', color: 'text-red-600' },
		{ value: 'critical', label: 'Critical Risk', color: 'text-red-800' }
	];

	// Auto-classify clause type based on content
	function autoClassifyClause(text: string): string {
		const lowerText = text.toLowerCase();

		if (lowerText.includes('deliver') || lowerText.includes('deadline') || lowerText.includes('time')) {
			return 'performance';
		} else if (lowerText.includes('terminate')) {
			return 'termination';
		} else if (lowerText.includes('liable') || lowerText.includes('damages')) {
			return 'liability';
		} else if (lowerText.includes('confidential')) {
			return 'confidentiality';
		} else if (lowerText.includes('compete')) {
			return 'non_compete';
		} else if (lowerText.includes('intellectual property')) {
			return 'ip_assignment';
		} else if (lowerText.includes('payment') || lowerText.includes('invoice')) {
			return 'payment';
		} else if (lowerText.includes('warranty') || lowerText.includes('guarantee')) {
			return 'warranty';
		} else if (lowerText.includes('dispute') || lowerText.includes('arbitration')) {
			return 'dispute_resolution';
		}
		return 'general';
	}

	// Auto-assess risk level
	function autoAssessRisk(text: string): string {
		const lowerText = text.toLowerCase();

		const highRiskTerms = ['time being of essence', 'immediate termination', 'not be liable', 'any damages', 'liquidated damages'];
		const mediumRiskTerms = ['thirty days', 'binding arbitration', 'force majeure', 'material breach'];

		for (const term of highRiskTerms) {
			if (lowerText.includes(term)) return 'high';
		}

		for (const term of mediumRiskTerms) {
			if (lowerText.includes(term)) return 'medium';
		}

		return 'low';
	}

	// Auto-classify when text changes
	function onTextChange() {
		// note: called on input events; guard against undefined
		if (documentText && documentText.length > 20) {
			clauseType = autoClassifyClause(documentText);
			riskLevel = autoAssessRisk(documentText);
		}
	}

	// helper for dynamic risk badge classes
	function getRiskClass(level: string | undefined) {
		if (level === 'high') return 'ml-2 px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full';
		if (level === 'medium') return 'ml-2 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full';
		return 'ml-2 px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full';
	}

	// Process and upload document
	async function uploadDocument() {
		if (!documentText.trim()) return;

		isProcessing = true;
		processingStatus = 'Generating 512-dim embedding...';
		uploadResult = null;

		try {
			// Generate embedding
			const embeddingResponse = await fetch('/api/embeddings', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					text: documentText,
					model: selectedModel
				})
			});

			if (!embeddingResponse.ok) {
				throw new Error(`Failed to generate embedding: ${embeddingResponse.statusText}`);
			}

			const embeddingData: EmbeddingResponse = await embeddingResponse.json();
			processingStatus = 'Adding to vector database...';

			// Create document entry (capture current text before clearing)
			const documentEntry = {
				id: Date.now(), // Simple ID generation
				title: documentTitle || 'Untitled Document',
				text: documentText,
				embedding: embeddingData.embedding,
				clause_type: clauseType,
				risk_level: riskLevel,
				model_used: selectedModel,
				created_at: new Date().toISOString(),
				dimensions: embeddingData.dimensions,
				processing_time_ms: embeddingData.processing_time_ms
			};

			// In a real app, you'd save this to your database
			// For now, we'll just show the result
			processingStatus = 'Document processed successfully!';
			uploadResult = {
				success: true,
				document: documentEntry,
				embedding_preview: embeddingData.embedding.slice(0, 5),
				stats: {
					text_length: documentText.length,
					embedding_dimensions: embeddingData.dimensions,
					processing_time: embeddingData.processing_time_ms,
					model_used: selectedModel
				}
			};

			// Clear form
			documentText = '';
			documentTitle = '';
			clauseType = 'general';
			riskLevel = 'low';

		} catch (error: any) {
			console.error('Upload error:', error);
			processingStatus = `Error: ${error?.message ?? String(error)}`;
			uploadResult = {
				success: false,
				error: error?.message ?? String(error)
			};
		} finally {
			isProcessing = false;
			setTimeout(() => {
				processingStatus = '';
			}, 3000);
		}
	}

	// Clear results
	function clearResults() {
		uploadResult = null;
		processingStatus = '';
	}
</script>

<div class="document-upload-container p-6 bg-white rounded-lg shadow-lg">
	<div class="header mb-6">
		<h2 class="text-2xl font-bold text-gray-800 mb-2">Add Legal Document</h2>
		<p class="text-gray-600">Upload legal text to generate 512-dim embeddings and add to vector database</p>
	</div>

	<div class="upload-form space-y-6">
		<!-- Document Title -->
		<div>
			<label for="doc-title" class="block text-sm font-medium text-gray-700 mb-2">
				Document Title (Optional)
			</label>
			<input
				id="doc-title"
				type="text"
				bind:value={documentTitle}
				placeholder="e.g., Service Agreement Clause 5.2"
				class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
			/>
		</div>

		<!-- Document Text -->
		<div>
			<label for="doc-text" class="block text-sm font-medium text-gray-700 mb-2">
				Legal Text *
			</label>
			<textarea
				id="doc-text"
				bind:value={documentText}
				on:input={onTextChange}
				placeholder="Enter legal contract clause, terms, or document text..."
				class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
				rows="8"
			></textarea>
			<div class="mt-1 text-xs text-gray-500">
				{documentText.length} characters • Auto-classification enabled
			</div>
		</div>

		<!-- Classification -->
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<div>
				<label for="clause-type" class="block text-sm font-medium text-gray-700 mb-2">
					Clause Type
				</label>
				<select
					id="clause-type"
					bind:value={clauseType}
					class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
				>
					{#each clauseTypes as type}
						<option value={type.value}>{type.label}</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="risk-level" class="block text-sm font-medium text-gray-700 mb-2">
					Risk Level
				</label>
				<select
					id="risk-level"
					bind:value={riskLevel}
					class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
				>
					{#each riskLevels as risk}
						<option value={risk.value} class={risk.color}>{risk.label}</option>
					{/each}
				</select>
			</div>
		</div>

		<!-- Model Selection -->
		<div>
			<label for="embedding-model" class="block text-sm font-medium text-gray-700 mb-2">
				Embedding Model
			</label>
			<select
				id="embedding-model"
				bind:value={selectedModel}
				class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
			>
				<option value="embeddinggemma:latest">Gemma Embeddings (Primary)</option>
				<option value="nomic-embed-text:latest">Nomic Embeddings (Backup)</option>
			</select>
		</div>

		<!-- Upload Button -->
		<div class="upload-actions">
			<button
				on:click={($event: any) => ($event: any) => uploadDocument}
				disabled={isProcessing || !documentText.trim()}
				class="w-full px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
			>
				{#if isProcessing}
					<span class="inline-flex items-center justify-center">
						<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						Processing Document...
					</span>
				{:else}
					Generate 512-Dim Embedding & Add to Database
				{/if}
			</button>
		</div>

		<!-- Processing Status -->
		{#if processingStatus}
			<div class="processing-status p-3 bg-blue-50 border border-blue-200 rounded-md">
				<div class="text-blue-800 font-medium">{processingStatus}</div>
			</div>
		{/if}

		<!-- Upload Result -->
		{#if uploadResult}
			<div class="upload-result">
				{#if uploadResult.success}
					<div class="success-result p-4 bg-green-50 border border-green-200 rounded-lg">
						<div class="flex items-center justify-between mb-3">
							<h3 class="text-lg font-semibold text-green-800">Document Added Successfully!</h3>
							<button type="button" on:click={($event: any) => ($event: any) => clearResults} aria-label="Close result" class="text-green-600 hover:text-green-800">
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
								</svg>
							</button>
						</div>

						<div class="result-details space-y-3">
							<div class="grid grid-cols-2 gap-4 text-sm">
								<div>
									<span class="font-medium text-gray-700">Document ID:</span>
									<span class="text-gray-600">{uploadResult.document.id}</span>
								</div>
								<div>
									<span class="font-medium text-gray-700">Embedding Dimensions:</span>
									<span class="text-gray-600">{uploadResult.stats.embedding_dimensions}</span>
								</div>
								<div>
									<span class="font-medium text-gray-700">Processing Time:</span>
									<span class="text-gray-600">{uploadResult.stats.processing_time}ms</span>
								</div>
								<div>
									<span class="font-medium text-gray-700">Model Used:</span>
									<span class="text-gray-600">{uploadResult.stats.model_used}</span>
								</div>
							</div>

							<div>
								<span class="font-medium text-gray-700 block mb-1">Embedding Preview:</span>
								<code class="text-xs bg-gray-100 p-2 rounded block text-gray-600">
									[{uploadResult.embedding_preview.map(x => x.toFixed(3)).join(', ')}...]
								</code>
							</div>

							<div class="classification-result grid grid-cols-2 gap-4">
								<div>
									<span class="font-medium text-gray-700">Clause Type:</span>
									<span class="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
										{uploadResult.document.clause_type.replaceAll('_', ' ')}
									</span>
								</div>
								<div>
									<span class="font-medium text-gray-700">Risk Level:</span>
									<span class={getRiskClass(uploadResult.document.risk_level)}>
										{uploadResult.document.risk_level} risk
									</span>
								</div>
							</div>
						</div>
					</div>
				{:else}
					<div class="error-result p-4 bg-red-50 border border-red-200 rounded-lg">
						<div class="flex items-center justify-between mb-2">
							<h3 class="text-lg font-semibold text-red-800">Upload Failed</h3>
							<button type="button" on:click={($event: any) => ($event: any) => clearResults} aria-label="Close error" class="text-red-600 hover:text-red-800">
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
								</svg>
							</button>
						</div>
						<p class="text-red-700">{uploadResult.error}</p>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.document-upload-container {
		max-width: 800px;
		margin: 0 auto;
	}
</style>


