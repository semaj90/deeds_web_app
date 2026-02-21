<script lang="ts">
	/**
	 * EnhancedLegalProcessor — Document upload + AI analysis pipeline
	 * Rewritten Session 63c: Svelte 5 runes (removed writable + xstate interpret)
	 */
	import { slide } from 'svelte/transition';

	const apiClient = {
		uploadDocument: async (file: File) => {
			console.log(`Uploading ${file.name}...`);
			await new Promise((resolve) => setTimeout(resolve, 1500));
			if (file.name.includes('fail')) throw new Error('Simulated upload failure');
			return { documentId: `doc_${Date.now()}`, filePath: `/uploads/${file.name}` };
		},
		processDocument: async (documentId: string) => {
			console.log(`Processing document ${documentId}...`);
			await new Promise((resolve) => setTimeout(resolve, 2000));
			return {
				extractedText:
					'This is the extracted text from the document. It contains important legal clauses...',
				pages: 5
			};
		},
		analyzeDocument: async (documentId: string) => {
			console.log(`Analyzing document ${documentId}...`);
			await new Promise((resolve) => setTimeout(resolve, 2500));
			return {
				riskScore: 0.85,
				keyEntities: ['Plaintiff A', 'Defendant B', 'Contract XYZ'],
				summary:
					'The document outlines a contractual dispute between Plaintiff A and Defendant B regarding Contract XYZ.'
			};
		}
	};

	type ProcessorState =
		| 'idle'
		| 'readyToUpload'
		| 'uploading'
		| 'processing'
		| 'analyzing'
		| 'complete'
		| 'error';

	let currentState = $state<ProcessorState>('idle');
	let file = $state<File | null>(null);
	let documentId = $state<string | null>(null);
	let processingResults = $state<{ extractedText: string; pages: number } | null>(null);
	let analysisResults = $state<{
		riskScore: number;
		keyEntities: string[];
		summary: string;
	} | null>(null);
	let errorMessage = $state<string | null>(null);

	let fileInput: HTMLInputElement;

	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			file = target.files[0];
			currentState = 'readyToUpload';
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer?.files[0]) {
			file = e.dataTransfer.files[0];
			currentState = 'readyToUpload';
		}
	}

	async function startProcessing() {
		if (!file) return;

		try {
			// Upload
			currentState = 'uploading';
			const uploadResult = await apiClient.uploadDocument(file);
			documentId = uploadResult.documentId;

			// Process
			currentState = 'processing';
			processingResults = await apiClient.processDocument(documentId);

			// Analyze
			currentState = 'analyzing';
			analysisResults = await apiClient.analyzeDocument(documentId);

			currentState = 'complete';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : String(err);
			currentState = 'error';
		}
	}

	function reset() {
		currentState = 'idle';
		file = null;
		documentId = null;
		processingResults = null;
		analysisResults = null;
		errorMessage = null;
	}

	function cancel() {
		file = null;
		currentState = 'idle';
	}

	function getProgress() {
		if (currentState === 'uploading') return 25;
		if (currentState === 'processing') return 50;
		if (currentState === 'analyzing') return 75;
		if (currentState === 'complete') return 100;
		return 0;
	}
</script>

<div class="bg-white rounded-lg shadow-lg border border-sand/20 p-6 max-w-3xl">
	<div class="flex items-center justify-between mb-6">
		<h2 class="text-2xl font-bold">Enhanced Legal Processor</h2>
		{#if currentState !== 'idle'}
			<button class="text-sm text-sand/60 hover:text-sand" onclick={reset}> Reset </button>
		{/if}
	</div>

	<!-- IDLE: File Dropzone -->
	{#if currentState === 'idle'}
		<div
			role="button"
			tabindex="0"
			aria-label="Upload document"
			class="border-2 border-dashed border-sand/20 rounded-lg p-8 text-center cursor-pointer hover:border-info transition-colors"
			onclick={() => fileInput.click()}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					fileInput.click();
				}
			}}
			ondragover={(e) => e.preventDefault()}
			ondrop={handleDrop}
		>
			<input
				type="file"
				class="hidden"
				bind:this={fileInput}
				onchange={handleFileSelect}
				accept=".pdf,.doc,.docx,.txt"
			/>
			<p class="text-sand/60">Drag & drop a document here, or click to select a file.</p>
			<p class="text-xs text-sand/40 mt-2">Supported formats: PDF, DOC, DOCX, TXT</p>
		</div>
	{/if}

	<!-- READY TO UPLOAD -->
	{#if currentState === 'readyToUpload'}
		<div class="bg-sand/5 p-4 rounded-lg">
			<p class="font-medium">File selected: {file?.name}</p>
			<div class="mt-4 flex gap-3">
				<button
					class="bg-info text-white px-6 py-2 rounded-lg hover:bg-info/80"
					onclick={startProcessing}
				>
					Start Processing
				</button>
				<button class="text-sand/60 hover:text-sand" onclick={cancel}> Cancel </button>
			</div>
		</div>
	{/if}

	<!-- PROCESSING STATES -->
	{#if currentState === 'uploading' || currentState === 'processing' || currentState === 'analyzing'}
		<div class="space-y-4">
			<h3 class="text-lg font-semibold text-center">Processing: {file?.name}</h3>
			<div class="w-full bg-sand/10 rounded-full">
				<div
					class="bg-info h-4 rounded-full transition-all duration-500"
					style="width: {getProgress()}%"
				></div>
			</div>
			<p class="text-center text-info font-medium capitalize">{currentState}...</p>
		</div>
	{/if}

	<!-- ERROR STATE -->
	{#if currentState === 'error'}
		<div class="bg-danger/5 border border-danger/20 text-danger p-4 rounded-lg" transition:slide>
			<h3 class="font-bold">Processing Failed</h3>
			<p>{errorMessage}</p>
			<button
				class="mt-4 bg-danger text-white px-4 py-1 rounded hover:bg-danger/80"
				onclick={reset}
			>
				Try Again
			</button>
		</div>
	{/if}

	<!-- COMPLETE: Results -->
	{#if currentState === 'complete'}
		<div class="space-y-6" transition:slide>
			<div class="bg-accent/5 border border-accent/20 text-accent p-4 rounded-lg">
				<h3 class="font-bold">Processing Complete</h3>
				<p>Document '{file?.name}' has been successfully analyzed.</p>
			</div>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<!-- Extraction Results -->
				<div class="bg-white rounded-lg border border-sand/20 p-4">
					<h4 class="font-semibold text-sand mb-3">Extraction Results</h4>
					<div class="space-y-2">
						<div class="flex justify-between">
							<span class="text-sand/60">Document ID:</span>
							<span class="font-mono text-sm">{documentId}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-sand/60">Pages Extracted:</span>
							<span class="font-medium">{processingResults?.pages}</span>
						</div>
						<div>
							<span class="text-sand/60">Extracted Text (preview):</span>
							<p class="mt-1 p-2 bg-sand/5 rounded text-sand/80 text-xs max-h-24 overflow-hidden">
								{processingResults?.extractedText.substring(0, 200)}...
							</p>
						</div>
					</div>
				</div>
				<!-- AI Analysis Results -->
				<div class="bg-white rounded-lg border border-sand/20 p-4">
					<h4 class="font-semibold text-sand mb-3">AI Analysis</h4>
					<div class="space-y-2">
						<div class="flex justify-between">
							<span class="text-sand/60">Risk Score:</span>
							<span
								class="font-bold text-lg"
								class:text-accent={analysisResults && analysisResults.riskScore < 0.5}
								class:text-warning={analysisResults &&
									analysisResults.riskScore >= 0.5 &&
									analysisResults.riskScore < 0.8}
								class:text-danger={analysisResults && analysisResults.riskScore >= 0.8}
							>
								{((analysisResults?.riskScore ?? 0) * 100).toFixed(0)}%
							</span>
						</div>
						<div>
							<span class="text-sand/60">Key Entities:</span>
							<div class="flex flex-wrap gap-1 mt-1">
								{#each analysisResults?.keyEntities ?? [] as entity}
									<span class="bg-info/10 text-info px-2 py-1 rounded-full text-sm">
										{entity}
									</span>
								{/each}
							</div>
						</div>
						<div>
							<span class="text-sand/60">AI Summary:</span>
							<p class="mt-1 p-2 bg-sand/5 rounded text-sand/80 text-sm">
								{analysisResults?.summary}
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>