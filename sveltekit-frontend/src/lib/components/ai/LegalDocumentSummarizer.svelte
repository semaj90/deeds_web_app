<!--
Legal Document Summarizer Component
Uses Gemma3 summarization service for converting 200-page legal documents into concise summaries
Enhanced-bits UI integration with real-time progress and quality metrics
-->
<script lang="ts">
	import Card from '$lib/components/ui/card/Card.svelte';
	import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
	import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
	import CardContent from '$lib/components/ui/card/CardContent.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { Label } from '$lib/components/ui/label';

	interface SummarizationRequest {
		document_id: string;
		title: string;
		content: string;
		document_type: 'contract' | 'judgment' | 'brief' | 'statute';
		summary_type: 'executive' | 'detailed' | 'bullet_points' | 'legal_analysis';
		max_length: number;
		focus: string[];
		metadata: Record<string, unknown>;
	}

	interface SummarizationResponse {
		document_id: string;
		original_length_words: number;
		summary_length_words: number;
		compression_ratio: number;
		summary: {
			full_summary: string;
			key_points: string[];
			legal_implications: string[];
			recommendations: string[];
			executive_summary: string;
		};
		processing_time: number;
		model: string;
		quality: {
			relevance_score: number;
			completeness_score: number;
			clarity_score: number;
			overall_rating: string;
		};
		metadata: Record<string, unknown>;
	}

	interface Props {
		defaultContent?: string;
		onSummaryGenerated?: (summary: SummarizationResponse) => void;
		serviceUrl?: string;
	}

	let {
		defaultContent = '',
		onSummaryGenerated,
		serviceUrl = '/api/gemma3-summarization'
	}: Props = $props();

	// State management using Svelte 5 runes
	let documentTitle = $state('');
	let documentContent = $state(defaultContent);
	let documentType = $state<'contract' | 'judgment' | 'brief' | 'statute'>('contract');
	let summaryType = $state<'executive' | 'detailed' | 'bullet_points' | 'legal_analysis'>('executive');
	let maxLength = $state(500);
	let focusAreas = $state<string[]>(['key_findings']);
	let isProcessing = $state(false);
	let processingProgress = $state(0);
	let currentSummary = $state<SummarizationResponse | null>(null);
	let errorMessage = $state('');
	let serviceHealth = $state<'healthy' | 'degraded' | 'unavailable'>('healthy');

	// Available focus areas for document analysis
	const availableFocusAreas = [
		'key_findings',
		'legal_precedents',
		'financial_terms',
		'obligations',
		'deadlines',
		'penalties',
		'parties_involved',
		'jurisdictional_issues'
	];

	// Document type options with descriptions
	const documentTypes = [
		{ value: 'contract', label: 'Contract', description: 'Agreements, terms, obligations' },
		{ value: 'judgment', label: 'Court Judgment', description: 'Court decisions, rulings' },
		{ value: 'brief', label: 'Legal Brief', description: 'Arguments, case analysis' },
		{ value: 'statute', label: 'Statute/Law', description: 'Legal codes, regulations' }
	];

	// Summary type options with descriptions
	const summaryTypeOptions = [
		{ value: 'executive', label: 'Executive Summary', description: 'High-level overview for decision makers' },
		{ value: 'detailed', label: 'Detailed Analysis', description: 'Comprehensive breakdown with context' },
		{ value: 'bullet_points', label: 'Key Points', description: 'Structured bullet-point format' },
		{ value: 'legal_analysis', label: 'Legal Analysis', description: 'Legal implications and precedents' }
	];

	// Check service health on mount
	$effect(() => {
		checkServiceHealth();
	});

	// Check if Gemma3 summarization service is available
	async function checkServiceHealth(): Promise<void> {
		try {
			const response = await fetch(serviceUrl);
			if (response.ok) {
				const health = await response.json();
				serviceHealth = health.status === 'healthy' ? 'healthy' : 'degraded';
			} else {
				serviceHealth = 'unavailable';
			}
		} catch (error) {
			console.error('Health check failed:', error);
			serviceHealth = 'unavailable';
		}
	}

	// Generate document summary via Gemma3 API
	async function generateSummary(): Promise<void> {
		if (!documentContent.trim()) {
			errorMessage = 'Please provide document content to summarize';
			return;
		}
		if (!documentTitle.trim()) {
			errorMessage = 'Please provide a document title';
			return;
		}

		isProcessing = true;
		processingProgress = 0;
		errorMessage = '';
		currentSummary = null;

		// Simulate real-time progress updates
		const progressInterval = setInterval(() => {
			if (processingProgress < 90) {
				processingProgress += Math.random() * 15;
			}
		}, 500);

		try {
			const request: SummarizationRequest = {
				document_id: `doc_${Date.now()}`,
				title: documentTitle,
				content: documentContent,
				document_type: documentType,
				summary_type: summaryType,
				max_length: maxLength,
				focus: focusAreas,
				metadata: {
					generated_at: new Date().toISOString(),
					user_agent: navigator.userAgent,
					content_length: documentContent.length
				}
			};

			const response = await fetch(`${serviceUrl}/summarize`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(request)
			});

			clearInterval(progressInterval);
			processingProgress = 100;

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || `Summarization failed: ${response.status}`);
			}

			const summaryResult = await response.json() as SummarizationResponse;
			currentSummary = summaryResult;

			// Notify parent component
			if (onSummaryGenerated) {
				onSummaryGenerated(summaryResult);
			}
		} catch (error) {
			console.error('Summarization error:', error);
			errorMessage = error instanceof Error ? error.message : 'Summarization failed';
			currentSummary = null;
		} finally {
			clearInterval(progressInterval);
			isProcessing = false;
		}
	}

	// Handle focus area toggle
	function toggleFocusArea(area: string): void {
		if (focusAreas.includes(area)) {
			focusAreas = focusAreas.filter(f => f !== area);
		} else {
			focusAreas = [...focusAreas, area];
		}
	}

	// Format processing time for display
	function formatProcessingTime(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}

	// Get quality color based on score threshold
	function getQualityColor(score: number): string {
		if (score >= 0.8) return 'quality-high';
		if (score >= 0.6) return 'quality-mid';
		return 'quality-low';
	}

	// Copy summary to clipboard
	async function copySummary(): Promise<void> {
		if (!currentSummary) return;
		try {
			await navigator.clipboard.writeText(currentSummary.summary.full_summary);
		} catch (error) {
			console.error('Failed to copy to clipboard:', error);
		}
	}
</script>

<div class="legal-summarizer">
	<!-- Service Status -->
	<div class="status-bar">
		{#if serviceHealth === 'unavailable'}
			<div class="status-alert status-error">
				Gemma3 Summarization Service is unavailable
			</div>
		{:else if serviceHealth === 'degraded'}
			<div class="status-alert status-warn">
				Summarization service is running with degraded performance
			</div>
		{:else}
			<div class="status-alert status-ok">
				Gemma3 Legal Summarization Service is ready
			</div>
		{/if}
	</div>

	<div class="two-col-layout">
		<!-- Input Section -->
		<Card>
			<CardHeader>
				<CardTitle>Document Input</CardTitle>
				<p class="card-subtitle">
					Upload or paste legal document content for AI-powered summarization
				</p>
			</CardHeader>
			<CardContent>
				<div class="form-stack">
					<!-- Document Title -->
					<div class="field">
						<Label>Document Title</Label>
						<input
							type="text"
							bind:value={documentTitle}
							placeholder="e.g., Software License Agreement - ABC Corp"
							class="field-input"
						/>
					</div>

					<!-- Document Type -->
					<div class="field">
						<Label>Document Type</Label>
						<select bind:value={documentType} class="field-input">
							{#each documentTypes as type}
								<option value={type.value}>{type.label}</option>
							{/each}
						</select>
						<p class="field-hint">
							{documentTypes.find(t => t.value === documentType)?.description}
						</p>
					</div>

					<!-- Summary Configuration -->
					<div class="config-row">
						<div class="field">
							<Label>Summary Type</Label>
							<select bind:value={summaryType} class="field-input">
								{#each summaryTypeOptions as type}
									<option value={type.value}>{type.label}</option>
								{/each}
							</select>
						</div>
						<div class="field">
							<Label>Target Length (words)</Label>
							<input
								type="number"
								bind:value={maxLength}
								min="100"
								max="2000"
								step="50"
								class="field-input"
							/>
						</div>
					</div>

					<!-- Focus Areas -->
					<div class="field">
						<Label>Focus Areas</Label>
						<div class="focus-grid">
							{#each availableFocusAreas as area}
								<label class="focus-option">
									<input
										type="checkbox"
										checked={focusAreas.includes(area)}
										onchange={() => toggleFocusArea(area)}
									/>
									<span>{area.replace(/_/g, ' ')}</span>
								</label>
							{/each}
						</div>
					</div>

					<!-- Document Content -->
					<div class="field">
						<Label>Document Content</Label>
						<textarea
							bind:value={documentContent}
							placeholder="Paste or type your legal document content here..."
							rows="12"
							class="field-input field-textarea"
						></textarea>
						<p class="field-hint">
							{documentContent.length.toLocaleString()} characters, ~{Math.ceil(documentContent.length / 5)} words
						</p>
					</div>

					<!-- Generate Button -->
					<Button
						onclick={generateSummary}
						disabled={isProcessing || !documentContent.trim() || !documentTitle.trim() || serviceHealth === 'unavailable'}
					>
						{#if isProcessing}
							Generating Summary...
						{:else}
							Generate AI Summary
						{/if}
					</Button>

					<!-- Real-time Processing Progress -->
					{#if isProcessing}
						<div class="progress-section">
							<div class="progress-labels">
								<span>Processing with Gemma3...</span>
								<span>{Math.round(processingProgress)}%</span>
							</div>
							<div class="progress-track">
								<div
									class="progress-fill"
									style="width: {processingProgress}%"
								></div>
							</div>
						</div>
					{/if}

					<!-- Error Message -->
					{#if errorMessage}
						<div class="status-alert status-error">
							{errorMessage}
						</div>
					{/if}
				</div>
			</CardContent>
		</Card>

		<!-- Results Section -->
		<Card>
			<CardHeader>
				<div class="results-header">
					<div>
						<CardTitle>AI Summary Results</CardTitle>
						{#if currentSummary}
							<p class="card-subtitle">
								Generated in {formatProcessingTime(currentSummary.processing_time)}
							</p>
						{/if}
					</div>
					{#if currentSummary}
						<Button onclick={copySummary}>
							Copy
						</Button>
					{/if}
				</div>
			</CardHeader>
			<CardContent>
				{#if currentSummary}
					<div class="form-stack">
						<!-- Quality Metrics -->
						<Card>
							<CardContent>
								<h4 class="quality-title">Quality Assessment</h4>
								<div class="quality-grid">
									<div>
										<span class="quality-label">Relevance:</span>
										<span class="{getQualityColor(currentSummary.quality.relevance_score)} quality-value">
											{(currentSummary.quality.relevance_score * 100).toFixed(0)}%
										</span>
									</div>
									<div>
										<span class="quality-label">Completeness:</span>
										<span class="{getQualityColor(currentSummary.quality.completeness_score)} quality-value">
											{(currentSummary.quality.completeness_score * 100).toFixed(0)}%
										</span>
									</div>
									<div>
										<span class="quality-label">Clarity:</span>
										<span class="{getQualityColor(currentSummary.quality.clarity_score)} quality-value">
											{(currentSummary.quality.clarity_score * 100).toFixed(0)}%
										</span>
									</div>
									<div>
										<span class="quality-label">Overall:</span>
										<span class="quality-value">
											{currentSummary.quality.overall_rating}
										</span>
									</div>
								</div>
							</CardContent>
						</Card>

						<!-- Compression Stats -->
						<div class="stats-grid">
							<div class="stat-card">
								<div class="stat-value">
									{currentSummary.original_length_words.toLocaleString()}
								</div>
								<div class="stat-label">Original Words</div>
							</div>
							<div class="stat-card">
								<div class="stat-value">
									{currentSummary.summary_length_words.toLocaleString()}
								</div>
								<div class="stat-label">Summary Words</div>
							</div>
							<div class="stat-card">
								<div class="stat-value">
									{(currentSummary.compression_ratio * 100).toFixed(1)}%
								</div>
								<div class="stat-label">Compression</div>
							</div>
						</div>

						<!-- Executive Summary -->
						{#if currentSummary.summary.executive_summary}
							<div class="result-block">
								<h4 class="result-heading">Executive Summary</h4>
								<div class="result-content">
									<p>{currentSummary.summary.executive_summary}</p>
								</div>
							</div>
						{/if}

						<!-- Key Points -->
						{#if currentSummary.summary.key_points?.length}
							<div class="result-block">
								<h4 class="result-heading">Key Points</h4>
								<ul class="result-list">
									{#each currentSummary.summary.key_points as point}
										<li>{point}</li>
									{/each}
								</ul>
							</div>
						{/if}

						<!-- Legal Implications -->
						{#if currentSummary.summary.legal_implications?.length}
							<div class="result-block">
								<h4 class="result-heading">Legal Implications</h4>
								<ul class="result-list">
									{#each currentSummary.summary.legal_implications as implication}
										<li>{implication}</li>
									{/each}
								</ul>
							</div>
						{/if}

						<!-- Recommendations -->
						{#if currentSummary.summary.recommendations?.length}
							<div class="result-block">
								<h4 class="result-heading">Recommendations</h4>
								<ul class="result-list">
									{#each currentSummary.summary.recommendations as rec}
										<li>{rec}</li>
									{/each}
								</ul>
							</div>
						{/if}

						<!-- Full Summary -->
						<div class="result-block">
							<h4 class="result-heading">Full Summary</h4>
							<div class="result-content full-summary">
								<p>{currentSummary.summary.full_summary}</p>
							</div>
						</div>

						<!-- Model Info -->
						<div class="model-info">
							Generated by {currentSummary.model} | Document ID: {currentSummary.document_id}
						</div>
					</div>
				{:else}
					<div class="empty-state">
						<p class="empty-main">Configure your document and click "Generate AI Summary" to begin</p>
						<p class="empty-sub">
							Powered by Gemma3 Legal AI | Optimized for legal document analysis
						</p>
					</div>
				{/if}
			</CardContent>
		</Card>
	</div>
</div>

<style>
	.legal-summarizer {
		padding: 1.5rem;
	}

	.status-bar {
		margin-bottom: 1rem;
	}

	.status-alert {
		padding: 0.75rem 1rem;
		border-radius: 6px;
		font-size: 0.85rem;
		border: 1px solid;
	}

	.status-ok {
		background: rgba(16, 185, 129, 0.1);
		border-color: rgba(16, 185, 129, 0.3);
		color: #10b981;
	}

	.status-warn {
		background: rgba(245, 158, 11, 0.1);
		border-color: rgba(245, 158, 11, 0.3);
		color: #f59e0b;
	}

	.status-error {
		background: rgba(239, 68, 68, 0.1);
		border-color: rgba(239, 68, 68, 0.3);
		color: #ef4444;
	}

	.two-col-layout {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.5rem;
	}

	@media (min-width: 1024px) {
		.two-col-layout {
			grid-template-columns: 1fr 1fr;
		}
	}

	.card-subtitle {
		font-size: 0.8rem;
		color: var(--color-sand, #94a3b8);
		opacity: 0.6;
		margin-top: 0.25rem;
	}

	.form-stack {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.field-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid rgba(148, 163, 184, 0.2);
		background: rgba(30, 41, 59, 0.5);
		border-radius: 6px;
		font-size: 0.85rem;
		color: inherit;
	}

	.field-input:focus {
		outline: none;
		border-color: rgba(34, 211, 238, 0.4);
	}

	.field-textarea {
		font-family: monospace;
		resize: vertical;
		min-height: 120px;
	}

	.field-hint {
		font-size: 0.7rem;
		color: var(--color-sand, #94a3b8);
		opacity: 0.5;
		margin: 0;
	}

	.config-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.focus-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.focus-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		cursor: pointer;
		text-transform: capitalize;
	}

	.focus-option span {
		opacity: 0.8;
	}

	.progress-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.progress-labels {
		display: flex;
		justify-content: space-between;
		font-size: 0.8rem;
		color: var(--color-sand, #94a3b8);
		opacity: 0.6;
	}

	.progress-track {
		width: 100%;
		height: 8px;
		background: rgba(148, 163, 184, 0.1);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: #22d3ee;
		border-radius: 4px;
		transition: width 0.3s;
	}

	.results-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}

	.quality-title {
		font-weight: 600;
		margin: 0 0 0.75rem;
		font-size: 0.9rem;
	}

	.quality-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		font-size: 0.85rem;
	}

	.quality-label {
		opacity: 0.6;
	}

	.quality-value {
		font-weight: 600;
		margin-left: 0.25rem;
	}

	.quality-high { color: #10b981; }
	.quality-mid { color: #f59e0b; }
	.quality-low { color: #ef4444; }

	.stats-grid {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 0.75rem;
	}

	.stat-card {
		padding: 0.75rem;
		border-radius: 6px;
		text-align: center;
		background: rgba(34, 211, 238, 0.05);
		border: 1px solid rgba(34, 211, 238, 0.1);
	}

	.stat-value {
		font-size: 1.1rem;
		font-weight: 700;
	}

	.stat-label {
		font-size: 0.7rem;
		opacity: 0.5;
		margin-top: 0.15rem;
	}

	.result-block {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.result-heading {
		font-size: 0.85rem;
		font-weight: 600;
		margin: 0;
		color: #22d3ee;
	}

	.result-content {
		padding: 0.75rem;
		background: rgba(30, 41, 59, 0.5);
		border-radius: 6px;
		font-size: 0.85rem;
		line-height: 1.6;
	}

	.result-content p {
		margin: 0;
	}

	.full-summary {
		max-height: 24rem;
		overflow-y: auto;
	}

	.result-list {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.85rem;
		line-height: 1.5;
	}

	.result-list li {
		margin-bottom: 0.3rem;
	}

	.model-info {
		font-size: 0.7rem;
		opacity: 0.4;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(148, 163, 184, 0.1);
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
	}

	.empty-main {
		font-size: 0.9rem;
		opacity: 0.6;
		margin: 0 0 0.5rem;
	}

	.empty-sub {
		font-size: 0.75rem;
		opacity: 0.4;
		margin: 0;
	}
</style>