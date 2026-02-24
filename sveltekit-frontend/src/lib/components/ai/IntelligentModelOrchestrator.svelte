<!-- RAG + KAG + DAG Pipeline Orchestrator — 3-step evidence retrieval + answer generation -->
<script lang="ts">
	interface Props {
		caseId?: string;
		initialQuery?: string;
	}

	let { caseId = '', initialQuery = '' }: Props = $props();

	// Pipeline state
	type PipelineStep = 'idle' | 'searching' | 'validating' | 'generating' | 'complete' | 'error';
	let pipelineStep = $state<PipelineStep>('idle');
	let query = $state(initialQuery);
	let errorMessage = $state('');

	// Step 1: Search results
	let searchResults = $state<any[]>([]);
	let searchBundles = $state<any[]>([]);
	let searchTiming = $state<Record<string, number>>({});
	let queryId = $state('');

	// Step 2: Validation
	let validations = $state<Record<string, 'approved' | 'rejected'>>({});
	let contextId = $state('');
	let combinedContext = $state('');
	let totalTokens = $state(0);

	// Step 3: Answer
	let answer = $state('');
	let answerCitations = $state<any[]>([]);
	let answerActionItems = $state<any[]>([]);
	let answerConfidence = $state(0);
	let answerModel = $state('');
	let generationTimeMs = $state(0);

	// Service health
	let serviceHealth = $state<any>(null);
	let isCheckingHealth = $state(false);

	// Pipeline config
	let topK = $state(5);
	let expandSections = $state(true);
	let jurisdiction = $state('');
	let includeActionItems = $state(false);

	// Derived
	let approvedCount = $derived(Object.values(validations).filter(v => v === 'approved').length);
	let rejectedCount = $derived(Object.values(validations).filter(v => v === 'rejected').length);
	let allValidated = $derived(searchResults.length > 0 && Object.keys(validations).length === searchResults.length);

	// Step 1: RAG+KAG+DAG Evidence Search
	async function runSearch() {
		if (!query.trim()) return;
		pipelineStep = 'searching';
		errorMessage = '';
		searchResults = [];
		searchBundles = [];
		validations = {};
		contextId = '';
		answer = '';

		try {
			const res = await fetch('/api/evidence/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: query.trim(),
					caseId: caseId || undefined,
					limit: topK,
					expandSections,
					jurisdiction: jurisdiction || undefined
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
				throw new Error(err.error || `Search failed (${res.status})`);
			}

			const data = await res.json();
			searchResults = data.results ?? [];
			searchBundles = data.bundles ?? [];
			searchTiming = data.timing ?? {};

			// Extract query ID from first result for tracking
			if (searchResults.length > 0) {
				queryId = searchResults[0]?.evidenceId?.split(':')[0] ?? crypto.randomUUID();
			}

			pipelineStep = searchResults.length > 0 ? 'validating' : 'idle';
			if (searchResults.length === 0) {
				errorMessage = 'No results found. Try a broader query or different keywords.';
			}
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Search failed';
			pipelineStep = 'error';
		}
	}

	// Step 2: Validate Sources
	function toggleValidation(chunkId: string) {
		const current = validations[chunkId];
		if (!current) {
			validations[chunkId] = 'approved';
		} else if (current === 'approved') {
			validations[chunkId] = 'rejected';
		} else {
			delete validations[chunkId];
			validations = { ...validations };
		}
		validations = { ...validations }; // trigger reactivity
	}

	function approveAll() {
		const newValidations: Record<string, 'approved' | 'rejected'> = {};
		for (const r of searchResults) {
			const id = r.evidenceId + ':' + (r.chunkIndex ?? 0);
			newValidations[id] = 'approved';
		}
		validations = newValidations;
	}

	async function submitValidation() {
		pipelineStep = 'generating';
		errorMessage = '';

		try {
			const validationPayload = Object.entries(validations).map(([chunkId, status]) => ({
				chunk_id: chunkId,
				status,
				relevance_rating: status === 'approved' ? 4 : 1
			}));

			const res = await fetch('/api/rag/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query_id: queryId,
					case_id: caseId || 'unlinked',
					validations: validationPayload
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
				throw new Error(err.error || `Validation failed (${res.status})`);
			}

			const data = await res.json();
			contextId = data.context_id ?? '';
			combinedContext = data.combined_context ?? '';
			totalTokens = data.total_tokens ?? 0;

			// Immediately generate answer
			await generateAnswer();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Validation failed';
			pipelineStep = 'error';
		}
	}

	// Step 3: Generate Answer with Citations
	async function generateAnswer() {
		try {
			const res = await fetch('/api/rag/answer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					context_id: contextId,
					query: query.trim(),
					case_id: caseId || 'unlinked',
					max_tokens: 2048,
					temperature: 0.3,
					include_citations: true,
					include_todos: includeActionItems,
					jurisdiction: jurisdiction || undefined
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
				throw new Error(err.error || `Generation failed (${res.status})`);
			}

			const data = await res.json();
			answer = data.answer ?? '';
			answerCitations = data.citations ?? [];
			answerActionItems = data.action_items ?? [];
			answerConfidence = data.answer_confidence ?? 0;
			answerModel = data.model ?? 'gemma3-legal';
			generationTimeMs = data.generation_time_ms ?? 0;

			pipelineStep = 'complete';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Generation failed';
			pipelineStep = 'error';
		}
	}

	// Health check
	async function checkHealth() {
		isCheckingHealth = true;
		try {
			const res = await fetch('/api/rag/unified');
			if (res.ok) serviceHealth = await res.json();
		} catch { /* non-fatal */ }
		isCheckingHealth = false;
	}

	// Utils
	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text).catch(() => {});
	}

	function resetPipeline() {
		pipelineStep = 'idle';
		searchResults = [];
		searchBundles = [];
		validations = {};
		contextId = '';
		answer = '';
		answerCitations = [];
		errorMessage = '';
	}

	// Pipeline steps config
	const pipelineSteps = [
		{ id: 'searching', label: 'RAG Search', desc: 'Embed → Dual Search → Rerank', icon: Search },
		{ id: 'validating', label: 'Source Validation', desc: 'Approve/reject retrieved chunks', icon: CheckCircle },
		{ id: 'generating', label: 'LLM Generation', desc: 'gemma3-legal with citations', icon: Brain }
	] as const;

	function getStepStatus(stepId: string): 'pending' | 'active' | 'done' | 'error' {
		const steps = ['searching', 'validating', 'generating'];
		const currentIdx = steps.indexOf(pipelineStep);
		const stepIdx = steps.indexOf(stepId);
		if (pipelineStep === 'error') return stepIdx <= currentIdx ? 'error' : 'pending';
		if (pipelineStep === 'complete') return 'done';
		if (stepIdx < currentIdx) return 'done';
		if (stepIdx === currentIdx) return 'active';
		return 'pending';
	}
</script>

<div class="orchestrator">
	<!-- Pipeline Progress Bar -->
	<div class="pipeline-bar">
		{#each pipelineSteps as step, i}
			{@const status = getStepStatus(step.id)}
			<div class="pipeline-step {status}">
				<div class="step-icon">
					{#if status === 'active'}
						<span class="i-lucide-loader animate-spin w-4 h-4 inline-block" />
					{:else if status === 'done'}
						<span class="i-lucide-check-circle w-4 h-4 inline-block" />
					{:else if status === 'error'}
						<span class="i-lucide-alert-circle w-4 h-4 inline-block" />
					{:else}
						<svelte:component this={step.icon} size={16} />
					{/if}
				</div>
				<div class="step-info">
					<span class="step-label">{step.label}</span>
					<span class="step-desc">{step.desc}</span>
				</div>
				{#if i < pipelineSteps.length - 1}
					<div class="step-connector {status === 'done' ? 'done' : ''}"></div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Query Input -->
	<div class="query-section">
		<div class="query-row">
			<input
				type="text"
				class="query-input"
				placeholder="Search evidence with RAG + KAG + DAG pipeline..."
				bind:value={query}
				onkeydown={(e) => e.key === 'Enter' && runSearch()}
				disabled={pipelineStep === 'searching' || pipelineStep === 'generating'}
			/>
			<button
				class="search-btn"
				onclick={runSearch}
				disabled={!query.trim() || pipelineStep === 'searching' || pipelineStep === 'generating'}
			>
				{#if pipelineStep === 'searching'}
					<span class="i-lucide-loader animate-spin w-4 h-4 inline-block" /> Searching...
				{:else}
					<span class="i-lucide-search w-4 h-4 inline-block" /> Search
				{/if}
			</button>
		</div>

		<!-- Config Row -->
		<div class="config-row">
			<label class="config-item">
				<span>Top K:</span>
				<select bind:value={topK}>
					<option value={3}>3</option>
					<option value={5}>5</option>
					<option value={10}>10</option>
					<option value={20}>20</option>
				</select>
			</label>
			<label class="config-item">
				<input type="checkbox" bind:checked={expandSections} />
				<span>Expand Sections (DAG)</span>
			</label>
			<label class="config-item">
				<input type="checkbox" bind:checked={includeActionItems} />
				<span>Action Items</span>
			</label>
			<label class="config-item">
				<span>Jurisdiction:</span>
				<input type="text" class="jurisdiction-input" placeholder="e.g. California" bind:value={jurisdiction} />
			</label>
			<button class="health-btn" onclick={checkHealth} disabled={isCheckingHealth}>
				{#if isCheckingHealth}
					<span class="i-lucide-loader animate-spin w-3.5 h-3.5 inline-block" />
				{:else}
					<span class="i-lucide-database w-3.5 h-3.5 inline-block" />
				{/if}
				Health
			</button>
			{#if pipelineStep !== 'idle'}
				<button class="reset-btn" onclick={resetPipeline}>
					<span class="i-lucide-refresh-cw w-3.5 h-3.5 inline-block" /> Reset
				</button>
			{/if}
		</div>
	</div>

	<!-- Service Health Panel -->
	{#if serviceHealth}
		<div class="health-panel">
			<div class="health-item">
				<span class="health-label">Qdrant:</span>
				<span class="health-status {serviceHealth.services?.qdrant?.status === 'ok' ? 'ok' : 'err'}">
					{serviceHealth.services?.qdrant?.status ?? 'unknown'}
				</span>
			</div>
			<div class="health-item">
				<span class="health-label">Ollama:</span>
				<span class="health-status {serviceHealth.services?.ollama?.status === 'ok' ? 'ok' : 'err'}">
					{serviceHealth.services?.ollama?.status ?? 'unknown'}
				</span>
				{#if serviceHealth.services?.ollama?.hasEmbedding}
					<span class="health-tag">embeddinggemma</span>
				{/if}
			</div>
			<div class="health-item">
				<span class="health-label">Points:</span>
				<span class="health-value">{serviceHealth.summary?.totalQdrantPoints ?? 0}</span>
			</div>
			<button class="close-btn" onclick={() => (serviceHealth = null)}>dismiss</button>
		</div>
	{/if}

	<!-- Error Message -->
	{#if errorMessage}
		<div class="error-bar">
			<span class="i-lucide-alert-circle w-4 h-4 inline-block" />
			<span>{errorMessage}</span>
			<button onclick={() => (errorMessage = '')}>dismiss</button>
		</div>
	{/if}

	<!-- Timing Bar -->
	{#if Object.keys(searchTiming).length > 0}
		<div class="timing-bar">
			{#if searchTiming.embedMs}<span>Embed: {searchTiming.embedMs}ms</span>{/if}
			{#if searchTiming.searchMs}<span>Search: {searchTiming.searchMs}ms</span>{/if}
			{#if searchTiming.rerankMs}<span>Rerank: {searchTiming.rerankMs}ms</span>{/if}
			{#if searchTiming.hopMs}<span><span class="i-lucide-network w-3 h-3 inline-block" /> DAG-hop: {searchTiming.hopMs}ms</span>{/if}
			{#if searchTiming.kagMs}<span><span class="i-lucide-zap w-3 h-3 inline-block" /> KAG: {searchTiming.kagMs}ms</span>{/if}
			{#if searchTiming.dagMs}<span><span class="i-lucide-file-text w-3 h-3 inline-block" /> DAG: {searchTiming.dagMs}ms</span>{/if}
			<span class="timing-total">Total: {searchTiming.totalMs ?? 0}ms</span>
			{#if searchTiming.cacheSource}<span class="cache-tag">{searchTiming.cacheSource}</span>{/if}
		</div>
	{/if}

	<!-- Step 2: Validation UI -->
	{#if (pipelineStep === 'validating' || pipelineStep === 'complete') && searchResults.length > 0}
		<div class="validation-section">
			<div class="validation-header">
				<h3>Source Validation ({searchResults.length} chunks)</h3>
				<div class="validation-stats">
					<span class="stat approved">{approvedCount} approved</span>
					<span class="stat rejected">{rejectedCount} rejected</span>
				</div>
				{#if pipelineStep === 'validating'}
					<button class="approve-all-btn" onclick={approveAll}>Approve All</button>
					<button
						class="submit-btn"
						onclick={submitValidation}
						disabled={approvedCount === 0}
					>
						Generate Answer ({approvedCount} sources)
					</button>
				{/if}
			</div>

			<div class="results-grid">
				{#each searchResults as result, i}
					{@const chunkId = result.evidenceId + ':' + (result.chunkIndex ?? 0)}
					{@const status = validations[chunkId]}
					<div class="result-card {status ?? 'unvalidated'}">
						<div class="result-top">
							<span class="result-score">{(result.score * 100).toFixed(1)}%</span>
							{#if result.rerank}
								<span class="rerank-tag" title="Cosine: {(result.rerank.cosine * 100).toFixed(0)}%">reranked</span>
							{/if}
							<span class="result-num">#{i + 1}</span>
							{#if pipelineStep === 'validating'}
								<button class="validation-btn" onclick={() => toggleValidation(chunkId)}>
									{#if status === 'approved'}
										<span class="i-lucide-thumbs-up w-3.5 h-3.5 inline-block" />
									{:else if status === 'rejected'}
										<span class="i-lucide-thumbs-down w-3.5 h-3.5 inline-block" />
									{:else}
										<span class="unset">?</span>
									{/if}
								</button>
							{/if}
						</div>
						<div class="result-content">{result.content?.slice(0, 300) ?? ''}</div>
						{#if result.metadata}
							<div class="result-meta">
								{#if result.metadata.heading}
									<span class="meta-tag">{result.metadata.heading}</span>
								{/if}
								{#if result.metadata.fileName}
									<span class="meta-tag file">{result.metadata.fileName}</span>
								{/if}
								{#if result.metadata.jurisdiction}
									<span class="meta-tag jurisdiction">{result.metadata.jurisdiction}</span>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Context Bundles (KAG graph neighbors) -->
			{#if searchBundles.length > 0}
				<div class="bundles-section">
					<h4>Context Bundles — KAG Graph ({searchBundles.length})</h4>
					{#each searchBundles.slice(0, 5) as bundle}
						<div class="bundle-card">
							<div class="bundle-top">
								<span class="bundle-heading">{bundle.heading ?? 'Section'}</span>
								<span class="bundle-path">{bundle.sectionPath?.join(' > ') ?? ''}</span>
							</div>
							{#if bundle.graphNeighbors?.length > 0}
								<div class="graph-neighbors">
									{#each bundle.graphNeighbors.slice(0, 3) as neighbor}
										<span class="neighbor-tag" title="Strength: {neighbor.strength}%">
											{neighbor.title} [{neighbor.connectionType}]
										</span>
									{/each}
								</div>
							{/if}
							{#if bundle.documentContext?.aiSummary}
								<div class="doc-summary">{bundle.documentContext.aiSummary}</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Step 3: Answer Display -->
	{#if pipelineStep === 'complete' && answer}
		<div class="answer-section">
			<div class="answer-header">
				<h3><span class="i-lucide-brain w-4.5 h-4.5 inline-block" /> Generated Answer</h3>
				<div class="answer-meta">
					<span class="confidence" title="Answer confidence">
						{(answerConfidence * 100).toFixed(0)}% confidence
					</span>
					<span class="model-tag">{answerModel}</span>
					<span class="gen-time">{generationTimeMs}ms</span>
					<button class="copy-btn" onclick={() => copyToClipboard(answer)}>
						<span class="i-lucide-copy w-3.5 h-3.5 inline-block" /> Copy
					</button>
				</div>
			</div>
			<div class="answer-body">{answer}</div>

			{#if answerCitations.length > 0}
				<div class="citations-section">
					<h4>Citations ({answerCitations.length})</h4>
					{#each answerCitations as citation}
						<div class="citation-card">
							<span class="citation-quote">{citation.quote}</span>
							<span class="citation-source">{citation.source_title}</span>
							{#if citation.page_num}
								<span class="citation-page">p.{citation.page_num}</span>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			{#if answerActionItems.length > 0}
				<div class="actions-section">
					<h4>Action Items ({answerActionItems.length})</h4>
					{#each answerActionItems as item}
						<div class="action-item {item.priority}">
							<span class="action-priority">{item.priority}</span>
							<span class="action-desc">{item.description}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.orchestrator {
		font-family: 'JetBrains Mono', 'Consolas', monospace;
		color: #f0f6fc;
	}

	/* Pipeline bar */
	.pipeline-bar {
		display: flex;
		gap: 0;
		margin-bottom: 1rem;
		background: rgba(0, 0, 0, 0.4);
		border: 1px solid #1e293b;
		border-radius: 6px;
		padding: 0.75rem 1rem;
	}

	.pipeline-step {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		position: relative;
	}

	.step-icon {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid #374151;
		color: #6b7280;
		flex-shrink: 0;
	}

	.pipeline-step.active .step-icon {
		background: rgba(16, 185, 129, 0.2);
		border-color: #10b981;
		color: #10b981;
	}

	.pipeline-step.done .step-icon {
		background: rgba(16, 185, 129, 0.3);
		border-color: #34d399;
		color: #34d399;
	}

	.pipeline-step.error .step-icon {
		background: rgba(239, 68, 68, 0.2);
		border-color: #ef4444;
		color: #ef4444;
	}

	.step-info {
		display: flex;
		flex-direction: column;
	}

	.step-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: #d1d5db;
	}

	.step-desc {
		font-size: 0.6rem;
		color: #6b7280;
	}

	.step-connector {
		position: absolute;
		right: 0;
		top: 50%;
		width: 20px;
		height: 2px;
		background: #374151;
	}

	.step-connector.done {
		background: #10b981;
	}

	/* Query */
	.query-section {
		margin-bottom: 0.75rem;
	}

	.query-row {
		display: flex;
		gap: 0.5rem;
	}

	.query-input {
		flex: 1;
		padding: 0.6rem 0.75rem;
		background: rgba(30, 41, 59, 0.6);
		border: 1px solid #374151;
		border-radius: 4px;
		color: #f0f6fc;
		font-family: inherit;
		font-size: 0.85rem;
	}

	.query-input:focus {
		outline: none;
		border-color: #10b981;
	}

	.search-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.6rem 1rem;
		background: linear-gradient(90deg, #10b981, #34d399);
		border: none;
		border-radius: 4px;
		color: #0d1117;
		font-weight: 600;
		font-family: inherit;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.search-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.config-row {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		margin-top: 0.5rem;
		flex-wrap: wrap;
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.config-item {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		cursor: pointer;
	}

	.config-item select,
	.jurisdiction-input {
		background: rgba(30, 41, 59, 0.6);
		border: 1px solid #374151;
		color: #e5e7eb;
		padding: 0.2rem 0.4rem;
		border-radius: 3px;
		font-family: inherit;
		font-size: 0.75rem;
	}

	.jurisdiction-input {
		width: 120px;
	}

	.health-btn,
	.reset-btn {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.25rem 0.5rem;
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid #374151;
		color: #9ca3af;
		border-radius: 3px;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.7rem;
	}

	.health-btn:hover,
	.reset-btn:hover {
		border-color: #10b981;
		color: #10b981;
	}

	/* Health panel */
	.health-panel {
		display: flex;
		gap: 1rem;
		align-items: center;
		padding: 0.5rem 0.75rem;
		background: rgba(16, 185, 129, 0.05);
		border: 1px solid #1e3a2a;
		border-radius: 4px;
		margin-bottom: 0.5rem;
		font-size: 0.7rem;
		flex-wrap: wrap;
	}

	.health-item {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.health-label { color: #6b7280; }
	.health-status.ok { color: #34d399; }
	.health-status.err { color: #ef4444; }
	.health-value { color: #e5e7eb; }
	.health-tag {
		padding: 0.1rem 0.3rem;
		background: rgba(139, 92, 246, 0.15);
		color: #a78bfa;
		border-radius: 3px;
		font-size: 0.6rem;
	}

	.close-btn {
		margin-left: auto;
		background: none;
		border: 1px solid #374151;
		color: #6b7280;
		padding: 0.15rem 0.4rem;
		border-radius: 3px;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.65rem;
	}

	/* Error / Timing */
	.error-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 4px;
		color: #fca5a5;
		font-size: 0.8rem;
		margin-bottom: 0.5rem;
	}

	.error-bar button {
		margin-left: auto;
		background: none;
		border: 1px solid #ef4444;
		color: #ef4444;
		padding: 0.15rem 0.4rem;
		border-radius: 3px;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.65rem;
	}

	.timing-bar {
		display: flex;
		gap: 0.75rem;
		padding: 0.4rem 0.75rem;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid #1e293b;
		border-radius: 4px;
		font-size: 0.65rem;
		color: #6b7280;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
		align-items: center;
	}

	.timing-total {
		color: #10b981;
		font-weight: 600;
		margin-left: auto;
	}

	.cache-tag {
		padding: 0.1rem 0.3rem;
		background: rgba(251, 191, 36, 0.15);
		color: #fbbf24;
		border-radius: 3px;
	}

	/* Validation */
	.validation-section {
		margin-bottom: 0.75rem;
	}

	.validation-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
		flex-wrap: wrap;
	}

	.validation-header h3 {
		color: #10b981;
		font-size: 0.85rem;
		margin: 0;
	}

	.validation-stats {
		display: flex;
		gap: 0.5rem;
		font-size: 0.7rem;
	}

	.stat.approved { color: #34d399; }
	.stat.rejected { color: #f87171; }

	.approve-all-btn {
		padding: 0.25rem 0.5rem;
		background: rgba(16, 185, 129, 0.15);
		border: 1px solid #10b981;
		color: #10b981;
		border-radius: 3px;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.7rem;
	}

	.submit-btn {
		padding: 0.3rem 0.6rem;
		background: linear-gradient(90deg, #10b981, #34d399);
		border: none;
		border-radius: 4px;
		color: #0d1117;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.75rem;
		margin-left: auto;
	}

	.submit-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.results-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 0.5rem;
	}

	.result-card {
		background: rgba(30, 41, 59, 0.4);
		border: 1px solid #1e293b;
		border-radius: 4px;
		padding: 0.6rem;
	}

	.result-card.approved {
		border-color: rgba(16, 185, 129, 0.4);
		background: rgba(16, 185, 129, 0.05);
	}

	.result-card.rejected {
		border-color: rgba(239, 68, 68, 0.3);
		opacity: 0.5;
	}

	.result-top {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.4rem;
		font-size: 0.7rem;
	}

	.result-score {
		color: #34d399;
		font-weight: 600;
	}

	.rerank-tag {
		padding: 0.1rem 0.3rem;
		background: rgba(139, 92, 246, 0.15);
		color: #a78bfa;
		border-radius: 3px;
		font-size: 0.6rem;
	}

	.result-num {
		color: #6b7280;
		margin-left: auto;
	}

	.validation-btn {
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid #374151;
		color: #9ca3af;
		border-radius: 50%;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		font-size: 0.7rem;
	}

	.unset { font-weight: bold; }

	.result-content {
		color: #d1d5db;
		font-size: 0.75rem;
		line-height: 1.4;
		margin-bottom: 0.4rem;
	}

	.result-meta {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}

	.meta-tag {
		padding: 0.1rem 0.3rem;
		background: rgba(16, 185, 129, 0.1);
		color: #6ee7b7;
		border-radius: 3px;
		font-size: 0.6rem;
	}

	.meta-tag.file { color: #93c5fd; background: rgba(59, 130, 246, 0.1); }
	.meta-tag.jurisdiction { color: #fbbf24; background: rgba(251, 191, 36, 0.1); }

	/* Bundles */
	.bundles-section {
		margin-top: 0.75rem;
		padding-top: 0.5rem;
		border-top: 1px solid #1e293b;
	}

	.bundles-section h4 {
		color: #a78bfa;
		font-size: 0.75rem;
		margin: 0 0 0.4rem 0;
	}

	.bundle-card {
		background: rgba(139, 92, 246, 0.05);
		border: 1px solid rgba(139, 92, 246, 0.15);
		border-radius: 4px;
		padding: 0.5rem;
		margin-bottom: 0.4rem;
	}

	.bundle-top {
		display: flex;
		justify-content: space-between;
		font-size: 0.7rem;
	}

	.bundle-heading { color: #a78bfa; font-weight: 600; }
	.bundle-path { color: #6b7280; font-size: 0.6rem; }

	.graph-neighbors {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
		margin-top: 0.3rem;
	}

	.neighbor-tag {
		padding: 0.1rem 0.3rem;
		background: rgba(139, 92, 246, 0.1);
		color: #c4b5fd;
		border-radius: 3px;
		font-size: 0.6rem;
		cursor: help;
	}

	.doc-summary {
		color: #9ca3af;
		font-size: 0.65rem;
		margin-top: 0.3rem;
		line-height: 1.3;
	}

	/* Answer */
	.answer-section {
		background: rgba(16, 185, 129, 0.05);
		border: 1px solid #1e3a2a;
		border-radius: 6px;
		padding: 1rem;
	}

	.answer-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.answer-header h3 {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: #10b981;
		font-size: 0.9rem;
		margin: 0;
	}

	.answer-meta {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		font-size: 0.7rem;
	}

	.confidence { color: #34d399; font-weight: 600; }

	.model-tag {
		padding: 0.1rem 0.4rem;
		background: rgba(139, 92, 246, 0.15);
		color: #a78bfa;
		border-radius: 3px;
	}

	.gen-time { color: #6b7280; }

	.copy-btn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.2rem 0.4rem;
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid #374151;
		color: #9ca3af;
		border-radius: 3px;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.65rem;
	}

	.answer-body {
		color: #e5e7eb;
		font-size: 0.85rem;
		line-height: 1.6;
		white-space: pre-wrap;
	}

	.citations-section, .actions-section {
		margin-top: 0.75rem;
		padding-top: 0.5rem;
		border-top: 1px solid #1e3a2a;
	}

	.citations-section h4, .actions-section h4 {
		color: #fbbf24;
		font-size: 0.75rem;
		margin: 0 0 0.4rem 0;
	}

	.citation-card {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		font-size: 0.7rem;
		padding: 0.3rem 0;
	}

	.citation-quote {
		color: #10b981;
		font-weight: 600;
	}

	.citation-source { color: #d1d5db; }
	.citation-page { color: #6b7280; }

	.action-item {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		font-size: 0.75rem;
		padding: 0.3rem 0;
	}

	.action-priority {
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.action-item.high .action-priority { background: rgba(239, 68, 68, 0.15); color: #f87171; }
	.action-item.medium .action-priority { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }
	.action-item.low .action-priority { background: rgba(16, 185, 129, 0.15); color: #34d399; }

	.action-desc { color: #d1d5db; }

	/* Spin animation */
	:global(.animate-spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
