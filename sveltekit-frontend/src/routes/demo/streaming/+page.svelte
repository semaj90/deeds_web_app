<script lang="ts">
	/**
	 * Streaming Response Demo
	 * Shows real-time LLM responses via SSE
	 */

	import { onDestroy } from 'svelte';

	let query = $state('');
	let mode = $state<'ollama' | 'rag'>('ollama');
	let streaming = $state(false);
	let response = $state('');
	let metadata = $state<Record<string, any>>({});
	let error = $state<string | null>(null);

	let eventSource: EventSource | null = null;

	function startStreaming() {
		if (!query.trim()) return;

		// Reset state
		response = '';
		metadata = {};
		error = null;
		streaming = true;

		// Create SSE connection
		const url = `/api/stream?q=${encodeURIComponent(query)}&mode=${mode}`;
		eventSource = new EventSource(url);

		eventSource.onmessage = (event) => {
			try {
				const chunk = JSON.parse(event.data);

				switch (chunk.type) {
					case 'content':
						response += chunk.content;
						break;

					case 'metadata':
						metadata = { ...metadata, ...chunk.metadata };
						break;

					case 'error':
						error = chunk.error;
						streaming = false;
						eventSource?.close();
						break;

					case 'done':
						streaming = false;
						eventSource?.close();
						break;
				}
			} catch (err) {
				console.error('Failed to parse SSE chunk:', err);
			}
		};

		eventSource.onerror = (err) => {
			console.error('SSE error:', err);
			error = 'Connection failed';
			streaming = false;
			eventSource?.close();
		};
	}

	function stopStreaming() {
		eventSource?.close();
		streaming = false;
	}

	onDestroy(() => {
		eventSource?.close();
	});
</script>

<div class="streaming-demo">
	<h2>Streaming LLM Responses</h2>

	<div class="controls">
		<input type="text" bind:value={query} placeholder="Enter your question..." disabled={streaming} />

		<div class="mode-selector">
			<label>
				<input type="radio" bind:group={mode} value="ollama" disabled={streaming} />
				Ollama (Direct)
			</label>

			<label>
				<input type="radio" bind:group={mode} value="rag" disabled={streaming} />
				RAG (Qdrant + Ollama)
			</label>
		</div>

		<div class="actions">
			{#if !streaming}
				<button onclick={startStreaming} disabled={!query.trim()}>Start Streaming</button>
			{:else}
				<button onclick={stopStreaming} class="stop">Stop</button>
			{/if}
		</div>
	</div>

	{#if streaming || response}
		<div class="response-container">
			<h3>Response:</h3>
			<div class="response-text">
				{response}
				{#if streaming}
					<span class="cursor">▊</span>
				{/if}
			</div>

			{#if Object.keys(metadata).length > 0}
				<details class="metadata">
					<summary>Metadata</summary>
					<pre>{JSON.stringify(metadata, null, 2)}</pre>
				</details>
			{/if}
		</div>
	{/if}

	{#if error}
		<div class="error">
			<strong>Error:</strong>
			{error}
		</div>
	{/if}
</div>

<style>
	.streaming-demo {
		max-width: 800px;
		margin: 2rem auto;
		padding: 2rem;
		background: white;
		border-radius: 8px;
		box-shadow: 0 2px 8px rgba(0, 0, 0: 0.1);
	}

	h2 {
		margin-top: 0;
		color: #1a1a1a;
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	input[type='text'] {
		width: 100%;
		padding: 0.75rem;
		font-size: 1rem;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	input[type='text']:disabled {
		background: #f5f5f5;
	}

	.mode-selector {
		display: flex;
		gap: 1.5rem;
	}

	.mode-selector label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	.actions {
		display: flex;
		gap: 1rem;
	}

	button {
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		font-weight: 500;
		color: white;
		background: #0066cc;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.2s;
	}

	button:hover:not(:disabled) {
		background: #0052a3;
	}

	button:disabled {
		background: #ccc;
		cursor: not-allowed;
	}

	button.stop {
		background: #cc0000;
	}

	button.stop:hover {
		background: #a30000;
	}

	.response-container {
		margin-top: 2rem;
		padding: 1.5rem;
		background: #f9f9f9;
		border-radius: 4px;
	}

	.response-text {
		white-space: pre-wrap;
		line-height: 1.6;
		color: #1a1a1a;
	}

	.cursor {
		display: inline-block;
		animation: blink 1s infinite;
		color: #0066cc;
	}

	@keyframes blink {
		0%,
		50% {
			opacity: 1;
		}
		51%,
		100% {
			opacity: 0;
		}
	}

	.metadata {
		margin-top: 1rem;
		padding: 0.5rem;
		background: white;
		border: 1px solid #ddd;
		border-radius: 4px;
	}

	.metadata summary {
		cursor: pointer;
		font-weight: 500;
		color: #0066cc;
	}

	.metadata pre {
		margin-top: 0.5rem;
		font-size: 0.875rem;
		color: #555;
		overflow-x: auto;
	}

	.error {
		margin-top: 1rem;
		padding: 1rem;
		background: #fee;
		border: 1px solid #fcc;
		border-radius: 4px;
		color: #c00;
	}

	.error strong {
		display: block;
		margin-bottom: 0.5rem;
	}
</style>
