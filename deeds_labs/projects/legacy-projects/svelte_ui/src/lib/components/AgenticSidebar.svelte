<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';

	let {
		isOpen = $bindable(false),
		currentAnalysis = $bindable(null as any),
		agenticSteps = $bindable([] as any[]),
		isAnalyzing = $bindable(false)
	} = $props();

	let autoScroll = true;
	let stepContainer: HTMLElement;

	// Auto-scroll to bottom when new steps are added
	$effect(() => {
		if (autoScroll && stepContainer && agenticSteps.length > 0) {
			stepContainer.scrollTop = stepContainer.scrollHeight;
		}
	});

	function toggleSidebar() {
		isOpen = !isOpen;
	}

	function clearAnalysis() {
		agenticSteps = [];
		currentAnalysis = null;
	}

	function toggleAutoScroll() {
		autoScroll = !autoScroll;
	}

	// Simulate agentic analysis steps (in real implementation, this would come from the backend)
	function simulateAnalysis() {
		if (isAnalyzing) return;

		isAnalyzing = true;
		agenticSteps = [];

		const steps = [
			{ type: 'search', message: 'Searching legal databases for relevant cases...', duration: 2000 },
			{ type: 'analyze', message: 'Analyzing document structure and key clauses...', duration: 3000 },
			{ type: 'extract', message: 'Extracting evidence and witness statements...', duration: 2500 },
			{ type: 'correlate', message: 'Correlating evidence with case law precedents...', duration: 3500 },
			{ type: 'evaluate', message: 'Evaluating strength of legal arguments...', duration: 2000 },
			{ type: 'summarize', message: 'Generating comprehensive case summary...', duration: 1500 }
		];

		let currentStep = 0;

		function addStep() {
			if (currentStep < steps.length) {
				const step = steps[currentStep];
				agenticSteps = [...agenticSteps, {
					...step,
					id: Date.now(),
					timestamp: new Date(),
					status: 'running'
				}];

				setTimeout(() => {
					// Mark step as completed
					agenticSteps = agenticSteps.map(s =>
						s.id === agenticSteps[agenticSteps.length - 1].id
							? { ...s, status: 'completed' }
							: s
					);

					currentStep++;
					if (currentStep < steps.length) {
						addStep();
					} else {
						isAnalyzing = false;
						currentAnalysis = {
							summary: 'Analysis complete. Found 12 relevant cases with 85% confidence in legal arguments.',
							recommendations: [
								'Focus on breach of contract claims',
								'Gather additional witness testimony',
								'Review similar case precedents from 2022-2023'
							],
							riskLevel: 'medium',
							timestamp: new Date()
						};
					}
				}, step.duration);
			}
		}

		addStep();
	}

	onMount(() => {
		// Auto-start analysis when sidebar opens (for demo)
		if (isOpen && !isAnalyzing && agenticSteps.length === 0) {
			simulateAnalysis();
		}
	});
</script>

<!-- Sidebar Toggle Button -->
<button
	class="sidebar-toggle"
	class:open={isOpen}
	on:click={toggleSidebar}
	title={isOpen ? 'Close Agentic Analysis' : 'Open Agentic Analysis'}
>
	🤖
</button>

<!-- Sidebar Panel -->
{#if isOpen}
	<div class="agentic-sidebar" transition:slide={{ duration: 300, axis: 'x' }}>
		<div class="sidebar-header">
			<h3>Agentic Analysis</h3>
			<div class="header-actions">
				<button
					class="auto-scroll-btn"
					class:active={autoScroll}
					on:click={toggleAutoScroll}
					title="Toggle auto-scroll"
				>
					📜
				</button>
				<button
					class="clear-btn"
					on:click={clearAnalysis}
					disabled={isAnalyzing}
					title="Clear analysis"
				>
					🗑️
				</button>
				<button class="close-btn" onclick={toggleSidebar} title="Close sidebar">
					×
				</button>
			</div>
		</div>

		<div class="sidebar-content">
			<!-- Analysis Steps -->
			<div class="steps-container" bind:this={stepContainer}>
				{#if agenticSteps.length === 0 && !isAnalyzing}
					<div class="empty-state">
						<div class="empty-icon">🧠</div>
						<h4>Ready for Analysis</h4>
						<p>Start an agentic analysis to automatically process evidence and generate insights.</p>
						<button class="start-analysis-btn" onclick={simulateAnalysis}>
							🚀 Start Analysis
						</button>
					</div>
				{:else}
					{#each agenticSteps as step (step.id)}
						<div class="analysis-step" class:running={step.status === 'running'}>
							<div class="step-icon">
								{#if step.status === 'running'}
									<div class="loading-spinner"></div>
								{:else if step.status === 'completed'}
									✅
								{:else}
									❌
								{/if}
							</div>
							<div class="step-content">
								<div class="step-type">{step.type}</div>
								<div class="step-message">{step.message}</div>
								<div class="step-time">
									{step.timestamp.toLocaleTimeString()}
								</div>
							</div>
						</div>
					{/each}

					{#if isAnalyzing}
						<div class="analysis-progress">
							<div class="progress-bar">
								<div
									class="progress-fill"
									style="width: {Math.round((agenticSteps.filter(s => s.status === 'completed').length / 6) * 100)}%"
								></div>
							</div>
							<div class="progress-text">
								Analyzing... {agenticSteps.filter(s => s.status === 'completed').length}/6 steps complete
							</div>
						</div>
					{/if}
				{/if}
			</div>

			<!-- Analysis Results -->
			{#if currentAnalysis}
				<div class="analysis-results">
					<h4>Analysis Complete</h4>
					<div class="result-summary">
						<p>{currentAnalysis.summary}</p>
					</div>

					{#if currentAnalysis.recommendations}
						<div class="recommendations">
							<h5>Recommendations:</h5>
							<ul>
								{#each currentAnalysis.recommendations as rec}
									<li>{rec}</li>
								{/each}
							</ul>
						</div>
					{/if}

					<div class="risk-indicator">
						<span class="risk-label">Risk Level:</span>
						<span class="risk-value" class:{currentAnalysis.riskLevel}>
							{currentAnalysis.riskLevel.toUpperCase()}
						</span>
					</div>

					<div class="analysis-meta">
						Completed at {currentAnalysis.timestamp.toLocaleString()}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.sidebar-toggle {
		position: fixed;
		top: 50%;
		right: 0;
		transform: translateY(-50%);
		background: #ff6b6b;
		color: white;
		border: none;
		width: 50px;
		height: 50px;
		border-radius: 25px 0 0 25px;
		cursor: pointer;
		font-size: 1.2rem;
		box-shadow: -2px 2px 8px rgba(0, 0, 0, 0.3);
		transition: all 0.3s ease;
		z-index: 1000;
	}

	.sidebar-toggle:hover {
		background: #ff5252;
		transform: translateY(-50%) translateX(-5px);
	}

	.sidebar-toggle.open {
		right: 400px;
	}

	.agentic-sidebar {
		position: fixed;
		top: 0;
		right: 0;
		width: 400px;
		height: 100vh;
		background: #1a1a1a;
		border-left: 1px solid #333;
		box-shadow: -4px 0 12px rgba(0, 0, 0, 0.3);
		z-index: 999;
		display: flex;
		flex-direction: column;
	}

	.sidebar-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid #333;
		background: #2a2a2a;
	}

	.sidebar-header h3 {
		margin: 0;
		color: #4ecdc4;
		font-family: 'Courier New', monospace;
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
	}

	.auto-scroll-btn, .clear-btn, .close-btn {
		background: none;
		border: none;
		color: #888;
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 4px;
		transition: background 0.2s;
	}

	.auto-scroll-btn.active {
		color: #4ecdc4;
	}

	.auto-scroll-btn:hover, .clear-btn:hover, .close-btn:hover {
		background: #333;
		color: #e0e0e0;
	}

	.clear-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.sidebar-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.steps-container {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		text-align: center;
		padding: 2rem;
	}

	.empty-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.empty-state h4 {
		color: #e0e0e0;
		margin: 0 0 0.5rem 0;
	}

	.empty-state p {
		color: #888;
		margin: 0 0 1.5rem 0;
		line-height: 1.5;
	}

	.start-analysis-btn {
		background: #ff6b6b;
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 6px;
		cursor: pointer;
		font-weight: bold;
		transition: background 0.3s ease;
	}

	.start-analysis-btn:hover {
		background: #ff5252;
	}

	.analysis-step {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		margin-bottom: 0.5rem;
		background: #2a2a2a;
		border-radius: 6px;
		border-left: 4px solid #444;
		transition: border-left-color 0.3s ease;
	}

	.analysis-step.running {
		border-left-color: #ff6b6b;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}

	.step-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		flex-shrink: 0;
	}

	.loading-spinner {
		width: 20px;
		height: 20px;
		border: 2px solid #444;
		border-top: 2px solid #ff6b6b;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.step-content {
		flex: 1;
		min-width: 0;
	}

	.step-type {
		color: #4ecdc4;
		font-weight: bold;
		font-size: 0.9rem;
		text-transform: uppercase;
		margin-bottom: 0.25rem;
	}

	.step-message {
		color: #e0e0e0;
		line-height: 1.4;
		margin-bottom: 0.25rem;
	}

	.step-time {
		color: #888;
		font-size: 0.8rem;
	}

	.analysis-progress {
		margin-top: 1rem;
		padding: 1rem;
		background: #222;
		border-radius: 6px;
	}

	.progress-bar {
		width: 100%;
		height: 8px;
		background: #444;
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 0.5rem;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #ff6b6b, #4ecdc4);
		transition: width 0.3s ease;
	}

	.progress-text {
		color: #e0e0e0;
		font-size: 0.9rem;
		text-align: center;
	}

	.analysis-results {
		border-top: 1px solid #333;
		padding: 1rem;
		background: #2a2a2a;
	}

	.analysis-results h4 {
		color: #4ecdc4;
		margin: 0 0 1rem 0;
		font-family: 'Courier New', monospace;
	}

	.result-summary {
		margin-bottom: 1rem;
	}

	.result-summary p {
		color: #e0e0e0;
		line-height: 1.5;
		margin: 0;
	}

	.recommendations {
		margin-bottom: 1rem;
	}

	.recommendations h5 {
		color: #ff6b6b;
		margin: 0 0 0.5rem 0;
		font-size: 0.9rem;
	}

	.recommendations ul {
		margin: 0;
		padding-left: 1.5rem;
	}

	.recommendations li {
		color: #e0e0e0;
		line-height: 1.4;
		margin-bottom: 0.25rem;
	}

	.risk-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.risk-label {
		color: #e0e0e0;
		font-weight: bold;
	}

	.risk-value {
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-weight: bold;
		font-size: 0.8rem;
	}

	.risk-value.low {
		background: #4caf50;
		color: white;
	}

	.risk-value.medium {
		background: #ff9800;
		color: white;
	}

	.risk-value.high {
		background: #f44336;
		color: white;
	}

	.analysis-meta {
		color: #888;
		font-size: 0.8rem;
		font-style: italic;
	}

	@media (max-width: 768px) {
		.agentic-sidebar {
			width: 100vw;
		}

		.sidebar-toggle.open {
			right: 100vw;
		}

		.sidebar-header {
			padding: 0.75rem;
		}

		.sidebar-header h3 {
			font-size: 1rem;
		}

		.header-actions {
			gap: 0.25rem;
		}

		.auto-scroll-btn, .clear-btn, .close-btn {
			font-size: 1rem;
			padding: 0.2rem;
		}
	}
</style>