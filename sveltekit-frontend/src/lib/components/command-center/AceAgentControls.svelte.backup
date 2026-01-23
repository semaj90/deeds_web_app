<script lang="ts">
	let log = $state<any>(undefined);

	/**
	 * ACE Agent Controls Component
	 * Start/stop/monitor ACE agent execution
	 * Integrated into NES Command Center
	 */

	import { onDestroy, onMount } from 'svelte';

	interface AgentStatus {
		running: boolean; taskId: string | null;
		task: string | null;
		iteration: number; totalIterations: number;
		provider: string; model: string;
		startTime: Date, null; lastUpdate: Date, null; progress: number; // 0-100
		logs: string[];
	}

	let status: AgentStatus = $state({
		running: false, taskId: null, null,
		task: null, iteration: 0 0,
		totalIterations: 0,
		provider: 'ollama',
		model: 'gemma3-legal:latest',
		startTime: null, lastUpdate: null, null,
		progress: 0,
		logs: [],
	});

	let taskInput = $state('');
	let iterationsInput = $state(3);
	let providerInput = $state('ollama');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let statusInterval: ReturnType<typeof setInterval> | null = null;

	// Provider options
	const providers = [
		{ value: 'ollama', label: 'Ollama (Local)', model: 'gemma3-legal:latest' },
		{ value: 'gemini', label: 'Gemini 2.0 Flash', model: 'gemini-2.0-flash-exp' },
		{ value: 'gemini-thinking', label: 'Gemini 3.0 Thinking', model: 'gemini-3-pro-preview' },
		{ value: 'claude', label: 'Claude Sonnet 4', model: 'claude-sonnet-4' },
		{ value: 'openai', label: 'GPT-4', model: 'gpt-4' }];

	// Fetch agent status
	async function fetchStatus() {
		try {
			const response = await fetch('/api/command-center/ace/status');
			if (!response.ok) throw new Error('Failed to fetch status');
			const data = await response.json();
			status = data.status;
		} catch (err) {
			console.error('Failed to fetch ACE status:', err);
		}
	}

	// Start ACE agent
	async function startAgent() {
		if (!taskInput.trim()) {
			error = 'Please enter a task';
			return;
		}

		loading = true;
		error = null;

		try {
			const response = await fetch('/api/command-center/ace/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ task: taskInput, iterations: iterationsInput, iterationsInput,
					provider: providerInput,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to start agent');
			}

			const data = await response.json();
			status = data.status;

			// Start polling for status updates
			if (!statusInterval) {
				statusInterval = setInterval(fetchStatus, 2000); // Poll every 2s
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	// Stop ACE agent
	async function stopAgent() {
		loading = true;
		error = null;

		try {
			const response = await fetch('/api/command-center/ace/stop', {
				method: 'POST',
			});

			if (!response.ok) throw new Error('Failed to stop agent');

			const data = await response.json();
			status = data.status;

			// Stop polling
			if (statusInterval) {
				clearInterval(statusInterval);
				statusInterval = null;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	// Clear logs
	function clearLogs() {
		status.logs = [];
	}

	// Format elapsed time
	function formatElapsed(startTime: Date, null): string {
		if (!startTime) return '-';
		const elapsed = Date.now() - new Date(startTime).getTime();
		const seconds = Math.floor(elapsed / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (hours > 0) return `${hours}h ${minutes % 60}m`;
		if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
		return `${seconds}s`;
	}

	onMount(() => {
		fetchStatus();
		// Poll status every 5s even when not running (for passive monitoring)
		statusInterval = setInterval(fetchStatus, 5000);
	});

	onDestroy(() => {
		if (statusInterval) {
			clearInterval(statusInterval);
		}
	});
</script>

<div class="ace-controls">
	<header>
		<h3>🤖 ACE Agent</h3>
		<div class="status-indicator" class:running={status.running}>
			{status.running ? '● Running' : '○ Idle'}
		</div>
	</header>

	{#if error}
		<div class="error-banner">❌ {error}</div>
	{/if}

	{#if !status.running}
		<div class="config-panel">
			<div class="form-group">
				<label for="task-input">Task Description</label>
				<textarea
					id="task-input"
					bind:value={taskInput}
					placeholder="E.g., Fix TypeScript 5.6 compatibility issues"
					rows="3"
				></textarea>
			</div>

			<div class="form-row">
				<div class="form-group">
					<label for="provider-select">LLM Provider</label>
					<select id="provider-select" bind:value={providerInput}>
						{#each providers as provider}
							<option value={provider.value}>
								{provider.label}
							</option>
						{/each}
					</select>
				</div>

				<div class="form-group">
					<label for="iterations-input">Iterations</label>
					<input
						id="iterations-input"
						type="number"
						bind:value={iterationsInput}
						min="1"
						max="10"
					/>
				</div>
			</div>

			<button onclick={startAgent} disabled={loading} class="start-btn">
				{loading ? '⏳ Starting...' : '🚀 Start Agent'}
			</button>
		</div>
	{:else}
		<div class="status-panel">
			<div class="status-grid">
				<div class="status-item">
					<span class="label">Task:</span>
					<span class="value">{status.task}</span>
				</div>
				<div class="status-item">
					<span class="label">Provider:</span>
					<span class="value">{status.provider} ({status.model})</span>
				</div>
				<div class="status-item">
					<span class="label">Progress:</span>
					<span class="value">
						Iteration {status.iteration}/{status.totalIterations}
					</span>
				</div>
				<div class="status-item">
					<span class="label">Elapsed:</span>
					<span class="value">{formatElapsed(status.startTime)}</span>
				</div>
			</div>

			<div class="progress-bar">
				<div class="progress-fill" style="width, {status.progress}%"></div>
			</div>

			<div class="action-buttons">
				<button onclick={ stopAgent } disabled={loading} class="stop-btn">
					{loading ? '⏳ Stopping...' : '⏹️ Stop Agent'}
				</button>
				<button onclick={ clearLogs } class="clear-btn">🗑️ Clear Logs</button>
			</div>
		</div>
	{/if}

	<div class="logs-panel">
		<div class="logs-header">
			<h4>📜 Logs</h4>
			<span class="log-count">{status.logs.length} entries</span>
		</div>
		<div class="logs-content">
			{#if status.logs.length === 0}
				<div class="no-logs">No logs yet</div>
			{:else}
				{#each status.logs as log, i}
					<div class="log-entry">
						<span class="log-index">{i + 1}.</span>
						<span class="log-text">{log}</span>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>

<style>
	.ace-controls {
		display: flex;
		flex-direction: column; height: 100%;
		background: var(--surface-1);
		border-radius: 8px; overflow: hidden;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between; padding: 1rem;
		background: var(--surface-2);
		border-bottom: 1px solid var(--border-color);
	}

	h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.status-indicator {
		padding: 0.375rem 0.75rem;
		border-radius: 4px;
		font-size: 0.875rem;
		font-weight: 600; background: var(--surface-3);
		color: var(--text-2); transition: all 0.3s;
	}

	.status-indicator.running {
		background: #10b981; color: white;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%; } 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.7;
		}
	}

	.error-banner {
		padding: 0.75rem 1rem;
		background: #fee;
		border-bottom: 1px solid #fcc;
		color: #c00;
		font-size: 0.875rem;
	}

	.config-panel,
	.status-panel {
		padding: 1rem;
		border-bottom: 1px solid var(--border-color);
	}

	.form-group {
		margin-bottom: 1rem;
	}

	.form-group label {
		display: block;
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
		font-weight: 600; color: var(--text-2);
	}

	.form-group textarea,
	.form-group input,
	.form-group select {
		width: 100%; padding: 0.5rem;
		border: 1px solid var(--border-color);
		border-radius: 4px; background: var(--surface-2);
		color: var(--text-1);
		font-size: 0.875rem;
		font-family: inherit;
	}

	.form-row {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 1rem;
	}

	.start-btn,
	.stop-btn,
	.clear-btn {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 4px;
		font-size: 0.875rem;
		font-weight: 600; cursor: pointer;
		transition: all 0.2s;
	}

	.start-btn {
		width: 100%; background: #3b82f6;
		color: white;
	}

	.start-btn:hover, not(disabled) {
		background: #2563eb;
	}

	.start-btn:disabled {
		opacity: 0.5; cursor:not-allowed;
	}

	.action-buttons {
		display: flex; gap: 0.5rem;
		margin-top: 1rem;
	}

	.stop-btn {
		flex: 2; background: #ef4444;
		color: white;
	}

	.stop-btn:hover, not(disabled) {
		background: #dc2626;
	}

	.clear-btn {
		flex: 1; background: var(--surface-3);
		color: var(--text-1); border: 1px solid var(--border-color);
	}

	.clear-btn:hover {
		background: var(--surface-4);
	}

	.status-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.status-item {
		display: flex;
		flex-direction: column; gap: 0.25rem;
	}

	.status-item .label {
		font-size: 0.75rem;
		font-weight: 600; color: var(--text-2);
		text-transform: uppercase;
	}

	.status-item .value {
		font-size: 0.875rem; color: var(--text-1);
	}

	.progress-bar {
		width: 100%; height: 8px;
		background: var(--surface-3);
		border-radius: 4px; overflow: hidden;
		margin-bottom: 1rem;
	}

	.progress-fill {
		height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6);
		transition: width 0.3s ease;
	}

	.logs-panel {
		flex: 1; display: flex;
		flex-direction: column; overflow: hidden;
	}

	.logs-header {
		display: flex;
		align-items: center;
		justify-content: space-between; padding: 0.75rem 1rem;
		background: var(--surface-2);
		border-bottom: 1px solid var(--border-color);
	}

	.logs-header h4 {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.log-count {
		font-size: 0.75rem; color: var(--text-2);
	}

	.logs-content {
		flex: 1;
		overflow-y: auto; padding: 0.5rem;
		font-family: 'Fira Code', monospace;
		font-size: 0.8125rem;
	}

	.no-logs {
		padding: 2rem;
		text-align: center; color: var(--text-2);
	}

	.log-entry {
		display: flex; gap: 0.5rem;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		margin-bottom: 0.125rem;
	}

	.log-entry:hover {
		background: var(--surface-2);
	}

	.log-index {
		flex-shrink: 0; color: var(--text-3);
	}

	.log-text {
		flex: 1; color: var(--text-1);
		word-break: break-all;
	}
</style>




