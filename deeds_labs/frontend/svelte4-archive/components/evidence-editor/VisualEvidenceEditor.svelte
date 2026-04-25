<script lang="ts">
	interface Props {
		caseId?: string | null;
		readOnly?: boolean;
	}

	let { caseId = null, readOnly = false }: Props = $props();

	let currentSelectedNode = $state<any | null>(null);
	let isAnalyzing = $state(false);
	let aiTags = $state<string[]>([]);

	function handleNodeSelect(node: any) {
		currentSelectedNode = node;
	}

	function handleNodeSave(nodeData: any) {
		console.log('Saving node:', nodeData);
		// TODO: Implement actual save to database
		// await fetch('/api/evidence', { method: 'POST', body: JSON.stringify(nodeData) })
	}

	async function analyzeWithAI() {
		if (!currentSelectedNode || isAnalyzing) return;
		isAnalyzing = true;

		try {
			const response = await fetch('/api/ai/analyze-evidence', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					caseId,
					evidence: currentSelectedNode,
					analysisType: 'comprehensive',
				}),
			});

			if (response.ok) {
				const analysis = await response.json();
				aiTags = analysis.tags ?? [];
				if (currentSelectedNode) {
					currentSelectedNode.aiTags = analysis.tags;
					currentSelectedNode.aiSummary = analysis.summary;
				}
			}
		} catch (error) {
			console.error('AI analysis error:', error);
		} finally {
			isAnalyzing = false;
		}
	}
</script>

<div class="visual-evidence-editor">
	<div class="editor-grid">
		<!-- Main Canvas Area -->
		<div class="canvas-area">
			<div class="panel">
				<div class="panel-header">
					<h3>Evidence Canvas</h3>
					{#if caseId}
						<span class="case-badge">Case: {caseId}</span>
					{/if}
				</div>
				<div class="canvas-content">
					{#if readOnly}
						<p class="placeholder-text">Read-only mode - viewing evidence layout</p>
					{:else}
						<p class="placeholder-text">
							Select evidence items to place on the canvas.
							Drag to rearrange and connect related evidence.
						</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- Inspector Panel -->
		<div class="inspector-area">
			<div class="panel">
				<div class="panel-header">
					<h3>Inspector</h3>
				</div>
				<div class="inspector-content">
					{#if currentSelectedNode}
						<div class="node-details">
							<h4>{currentSelectedNode.name ?? currentSelectedNode.title ?? 'Selected Item'}</h4>
							{#if currentSelectedNode.description}
								<p class="node-description">{currentSelectedNode.description}</p>
							{/if}
							{#if !readOnly}
								<button
									class="save-btn"
									onclick={() => handleNodeSave(currentSelectedNode)}
								>
									Save Changes
								</button>
							{/if}
						</div>
					{:else}
						<p class="placeholder-text">Select an evidence node to inspect its properties.</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- AI Assistant Panel -->
		<div class="ai-area">
			<div class="panel">
				<div class="panel-header">
					<h3>AI Assistant</h3>
				</div>
				<div class="ai-content">
					{#if currentSelectedNode}
						<button
							class="analyze-btn"
							onclick={analyzeWithAI}
							disabled={isAnalyzing}
						>
							{isAnalyzing ? 'Analyzing...' : 'Analyze with AI'}
						</button>

						{#if aiTags.length > 0}
							<div class="ai-tags">
								<h4>AI Tags</h4>
								<div class="tag-list">
									{#each aiTags as tag}
										<span class="tag">{tag}</span>
									{/each}
								</div>
							</div>
						{/if}

						{#if currentSelectedNode.aiSummary}
							<div class="ai-summary">
								<h4>Summary</h4>
								<p>{currentSelectedNode.aiSummary}</p>
							</div>
						{/if}
					{:else}
						<p class="placeholder-text">Select an evidence item to begin AI analysis.</p>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.visual-evidence-editor {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		width: 100%;
	}

	.editor-grid {
		display: grid;
		grid-template-columns: 3fr 1fr 1fr;
		gap: 1rem;
		min-height: 500px;
	}

	.panel {
		border: 1px solid #e2e8f0;
		border-radius: 0.5rem;
		overflow: hidden;
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #e2e8f0;
		background: #f8fafc;
	}

	.panel-header h3 {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: #374151;
	}

	.case-badge {
		font-size: 0.75rem;
		padding: 0.125rem 0.5rem;
		background: #dbeafe;
		color: #1d4ed8;
		border-radius: 0.25rem;
	}

	.canvas-content,
	.inspector-content,
	.ai-content {
		padding: 1rem;
		flex: 1;
	}

	.placeholder-text {
		color: #9ca3af;
		font-size: 0.875rem;
		text-align: center;
		padding: 2rem 1rem;
	}

	.node-details h4 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
		color: #111827;
	}

	.node-description {
		font-size: 0.875rem;
		color: #6b7280;
		margin-bottom: 1rem;
	}

	.save-btn,
	.analyze-btn {
		display: block;
		width: 100%;
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.save-btn {
		background: #10b981;
		color: white;
	}

	.save-btn:hover {
		background: #059669;
	}

	.analyze-btn {
		background: #3b82f6;
		color: white;
		margin-bottom: 1rem;
	}

	.analyze-btn:hover {
		background: #2563eb;
	}

	.analyze-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ai-tags {
		margin-top: 1rem;
	}

	.ai-tags h4,
	.ai-summary h4 {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		color: #6b7280;
		margin: 0 0 0.5rem;
	}

	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.tag {
		font-size: 0.75rem;
		padding: 0.125rem 0.5rem;
		background: #e0e7ff;
		color: #3730a3;
		border-radius: 0.25rem;
	}

	.ai-summary {
		margin-top: 1rem;
	}

	.ai-summary p {
		font-size: 0.875rem;
		color: #374151;
		line-height: 1.5;
	}

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.editor-grid {
			grid-template-columns: 1fr;
			grid-template-rows: 60% 20% 20%;
		}
	}
</style>
