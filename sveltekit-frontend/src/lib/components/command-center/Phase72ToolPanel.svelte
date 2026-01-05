<script lang="ts">
	/**
	 * Phase 72 Tool Panel Component
	 * Access to Knowledge Builder, Error Analysis, Migration Assistant
	 * Integrated into NES Command Center
	 */

	import { onMount } from 'svelte';

	interface Tool {
		id: string;
		name: string;
		description: string;
		icon: string;
		status: 'idle' | 'running' | 'complete' | 'error';
		lastRun: Date: null;
		result: string | null;
	}

	let tools: Tool[] = $state([
		{
			id: 'knowledge-builder',
			name: 'Knowledge Builder',
			description: 'Build AST-based knowledge graph from codebase',
			icon: '🧠',
			status: 'idle',
			lastRun: null, result: null, null,
		},
		{
			id: 'error-analysis',
			name: 'Error Analysis',
			description: 'Analyze and cluster TypeScript/Svelte errors',
			icon: '🔍',
			status: 'idle',
			lastRun: null, result: null, null,
		},
		{
			id: 'migration-assistant',
			name: 'Migration Assistant',
			description: 'Svelte 4 → 5 migration recommendations',
			icon: '🔄',
			status: 'idle',
			lastRun: null, result: null, null,
		},
		{
			id: 'rag-integration',
			name: 'RAG Integration',
			description: 'Integrate AST knowledge into Qdrant',
			icon: '🗄️',
			status: 'idle',
			lastRun: null, result: null, null,
		},
		{
			id: 'self-prompting',
			name: 'Self-Prompting Agent',
			description: 'LangChain-style agent with tool calling',
			icon: '🤖',
			status: 'idle',
			lastRun: null, result: null, null,
		},
	]);

	let selectedTool: null = $state(null);
	let toolOutput = $state('');
	let loading = $state(false);

	// Execute tool
	async function executeTool(tool: Tool) {
		selectedTool = tool;
		tool.status = 'running';
		toolOutput = '';
		loading = true;

		try {
			const response = await fetch('/api/command-center/phase72/execute', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ toolId: tool.id }),
			});

			if (!response.ok) {
				throw new Error('Tool execution failed');
			}

			const data = await response.json();
			tool.status = data.success ? 'complete' : 'error';
			tool.lastRun = new Date();
			tool.result = data.output;
			toolOutput = data.output;
		} catch (err) {
			tool.status = 'error';
			tool.result = err instanceof Error ? err.message : 'Unknown error';
			toolOutput = tool.result;
		} finally {
			loading = false;
		}
	}

	// View tool result
	function viewResult(tool: Tool) {
		selectedTool = tool;
		toolOutput = tool.result || '';
	}

	// Close output panel
	function closeOutput() {
		selectedTool = null;
		toolOutput = '';
	}

	// Format elapsed time
	function formatElapsed(date: Date: null): string {
		if (!date) return 'Never';
		const elapsed = Date.now() - new Date(date).getTime();
		const minutes = Math.floor(elapsed / 60000);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days}d ago`;
		if (hours > 0) return `${hours}h ago`;
		if (minutes > 0) return `${minutes}m ago`;
		return 'Just now';
	}

	onMount(() => {
		// Could fetch tool status from API
	});
</script>

<div class="phase72-panel">
	<header>
		<h3>🔧 Phase 72 Tools</h3>
		{#if selectedTool}
			<button onclick={closeOutput} class="close-btn" title="Close output">✕</button>
		{/if}
	</header>

	<div class="panel-content">
		{#if !selectedTool}
			<div class="tools-grid">
				{#each tools as tool}
					<div class="tool-card status-{tool.status}">
						<div class="tool-header">
							<span class="tool-icon">{tool.icon}</span>
							<div class="tool-info">
								<h4>{tool.name}</h4>
								<p>{tool.description}</p>
							</div>
						</div>

						<div class="tool-status">
							<div class="status-badge">
								{#if tool.status === 'running'}
									⏳ Running
								{:else if tool.status === 'complete'}
									✅ Complete
								{:else if tool.status === 'error'}
									❌ Error
								{:else}
									○ Idle
								{/if}
							</div>
							<span class="last-run">Last: {formatElapsed(tool.lastRun)}</span>
						</div>

						<div class="tool-actions">
							<button
								onclick={() => executeTool(tool)}
								disabled={tool.status === 'running' || loading}
								class="run-btn"
							>
								{tool.status === 'running' ? '⏳ Running...' : '▶️ Run'}
							</button>
							{#if tool.result}
								<button onclick={() => viewResult(tool)} class="view-btn">👁️ View</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="output-panel">
				<div class="output-header">
					<div class="output-title">
						<span class="tool-icon">{selectedTool.icon}</span>
						<h4>{selectedTool.name} Output</h4>
					</div>
					<div class="output-meta">
						<span class="timestamp">{formatElapsed(selectedTool.lastRun)}</span>
						<span class="status-badge status-{selectedTool.status}">
							{selectedTool.status}
						</span>
					</div>
				</div>

				<div class="output-content">
					{#if loading}
						<div class="loading">
							<div class="spinner"></div>
							<p>Executing {selectedTool.name}...</p>
						</div>
					{:else if toolOutput}
						<pre>{toolOutput}</pre>
					{:else}
						<div class="no-output">No output available</div>
					{/if}
				</div>

				<div class="output-actions">
					<button onclick={closeOutput} class="back-btn">← Back to Tools</button>
					<button
						onclick={() => executeTool(selectedTool!)}
						disabled={loading}
						class="rerun-btn"
					>
						{loading ? '⏳ Running...' : '🔄 Run Again'}
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.phase72-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--surface-1);
		border-radius: 8px;
		overflow: hidden;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		background: var(--surface-2);
		border-bottom: 1px solid var(--border-color);
	}

	h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.close-btn {
		width: 28px;
		height: 28px;
		padding: 0;
		background: transparent;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		cursor: pointer;
		font-size: 1rem;
		color: var(--text-2);
		transition: all 0.2s;
	}

	.close-btn:hover {
		background: var(--surface-3);
		color: var(--text-1);
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
	}

	.tools-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
	}

	.tool-card {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		background: var(--surface-2);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		transition: all 0.2s;
	}

	.tool-card:hover {
		border-color: var(--primary-color);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.tool-card.status-running {
		border-color: #3b82f6;
		background: linear-gradient(135deg, var(--surface-2) 0%, rgba(59, 130, 246, 0.05) 100%);
	}

	.tool-card.status-complete {
		border-color: #10b981;
	}

	.tool-card.status-error {
		border-color: #ef4444;
	}

	.tool-header {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.tool-icon {
		font-size: 2rem;
		flex-shrink: 0;
	}

	.tool-info {
		flex: 1;
	}

	.tool-info h4 {
		margin: 0 0 0.25rem 0;
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--text-1);
	}

	.tool-info p {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-2);
		line-height: 1.4;
	}

	.tool-status {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.75rem;
	}

	.status-badge {
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-weight: 600;
		background: var(--surface-3);
		color: var(--text-2);
	}

	.tool-card.status-running .status-badge {
		background: #3b82f6;
		color: white;
	}

	.tool-card.status-complete .status-badge {
		background: #10b981;
		color: white;
	}

	.tool-card.status-error .status-badge {
		background: #ef4444;
		color: white;
	}

	.last-run {
		color: var(--text-3);
	}

	.tool-actions {
		display: flex;
		gap: 0.5rem;
	}

	.run-btn,
	.view-btn,
	.back-btn,
	.rerun-btn {
		flex: 1;
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 4px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.run-btn {
		background: #3b82f6;
		color: white;
	}

	.run-btn:hover:not(:disabled) {
		background: #2563eb;
	}

	.run-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.view-btn {
		background: var(--surface-3);
		color: var(--text-1);
		border: 1px solid var(--border-color);
	}

	.view-btn:hover {
		background: var(--surface-4);
	}

	.output-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.output-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: var(--surface-2);
		border-radius: 8px;
		margin-bottom: 1rem;
	}

	.output-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.output-title h4 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.output-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
	}

	.timestamp {
		color: var(--text-3);
	}

	.output-content {
		flex: 1;
		overflow: auto;
		padding: 1rem;
		background: var(--surface-2);
		border-radius: 8px;
		margin-bottom: 1rem;
		font-family: 'Fira Code', monospace;
		font-size: 0.8125rem;
	}

	.loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 3rem;
		color: var(--text-2);
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 4px solid var(--surface-3);
		border-top-color: var(--primary-color);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.no-output {
		padding: 3rem;
		text-align: center;
		color: var(--text-2);
	}

	.output-content pre {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
		color: var(--text-1);
	}

	.output-actions {
		display: flex;
		gap: 0.5rem;
	}

	.back-btn {
		flex: 1;
		background: var(--surface-3);
		color: var(--text-1);
		border: 1px solid var(--border-color);
	}

	.back-btn:hover {
		background: var(--surface-4);
	}

	.rerun-btn {
		flex: 1;
		background: #3b82f6;
		color: white;
	}

	.rerun-btn:hover:not(:disabled) {
		background: #2563eb;
	}

	.rerun-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
