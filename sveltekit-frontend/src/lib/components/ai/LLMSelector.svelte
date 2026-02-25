<script lang="ts">
	import { fade } from 'svelte/transition';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface LLMModel {
		id: string;
		name: string;
		displayName: string;
		provider: 'ollama';
		size: string;
		specialization: 'general' | 'legal' | 'code' | 'embedding';
		status: 'online' | 'offline' | 'loading' | 'error';
		performance: {
			tokensPerSecond: number;
			memoryUsage: string;
			responseTime: number;
		};
		capabilities: string[];
		endpoint: string;
	}

	interface Props {
		selectedModel?: LLMModel | null;
		onModelChange?: (model: LLMModel) => void;
		showMetrics?: boolean;
		filterBy?: 'all' | 'legal' | 'general' | 'code' | 'embedding';
	}

	let {
		selectedModel = $bindable(null),
		onModelChange,
		showMetrics = true,
		filterBy = 'all'
	}: Props = $props();

	let availableModels = $state<LLMModel[]>([
		{
			id: 'gemma3-legal',
			name: 'gemma3-legal:latest',
			displayName: 'Gemma3 Legal Specialist',
			provider: 'ollama',
			size: '7.3GB',
			specialization: 'legal',
			status: 'offline',
			performance: { tokensPerSecond: 25, memoryUsage: '6.8GB', responseTime: 1200 },
			capabilities: ['legal-analysis', 'case-research', 'document-review'],
			endpoint: 'http://localhost:11434'
		},
		{
			id: 'embeddinggemma',
			name: 'embeddinggemma:latest',
			displayName: 'EmbeddingGemma',
			provider: 'ollama',
			size: '622MB',
			specialization: 'embedding',
			status: 'offline',
			performance: { tokensPerSecond: 500, memoryUsage: '700MB', responseTime: 80 },
			capabilities: ['text-embedding', 'similarity-search', 'vector-generation'],
			endpoint: 'http://localhost:11434'
		},
		{
			id: 'nomic-embed',
			name: 'nomic-embed-text:latest',
			displayName: 'Nomic Embeddings',
			provider: 'ollama',
			size: '274MB',
			specialization: 'embedding',
			status: 'offline',
			performance: { tokensPerSecond: 400, memoryUsage: '512MB', responseTime: 100 },
			capabilities: ['text-embedding', 'similarity-search'],
			endpoint: 'http://localhost:11434'
		}
	]);

	let isOpen = $state(false);
	let isRefreshing = $state(false);

	let filteredModels = $derived(
		filterBy === 'all'
			? availableModels
			: availableModels.filter((m) => m.specialization === filterBy)
	);

	let onlineCount = $derived(filteredModels.filter((m) => m.status === 'online').length);

	function getProviderIcon(_provider: string): string {
		return 'cpu';
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'online': return 'status-online';
			case 'offline': return 'status-offline';
			case 'loading': return 'status-loading';
			case 'error': return 'status-error';
			default: return 'status-offline';
		}
	}

	function getStatusIcon(status: string): string {
		switch (status) {
			case 'online': return 'check-circle';
			case 'offline': return 'circle';
			case 'loading': return 'loader-2';
			case 'error': return 'alert-circle';
			default: return 'circle';
		}
	}

	function selectModel(model: LLMModel) {
		selectedModel = model;
		onModelChange?.(model);
		isOpen = false;
	}

	$effect(() => {
		refreshModelStatuses();
		const interval = setInterval(refreshModelStatuses, 30000);
		return () => clearInterval(interval);
	});

	async function refreshModelStatuses() {
		isRefreshing = true;
		try {
			const response = await fetch('http://localhost:11434/api/tags', {
				method: 'GET',
				signal: AbortSignal.timeout(3000)
			});
			if (response.ok) {
				const data = await response.json();
				const loadedNames = new Set(
					(data.models ?? []).map((m: { name: string }) => m.name)
				);
				for (const model of availableModels) {
					model.status = loadedNames.has(model.name) ? 'online' : 'offline';
				}
				availableModels = [...availableModels];
			}
		} catch {
			for (const model of availableModels) {
				model.status = 'error';
			}
			availableModels = [...availableModels];
		}
		isRefreshing = false;
	}

	async function pullModel(model: LLMModel) {
		model.status = 'loading';
		availableModels = [...availableModels];
		try {
			const response = await fetch(`${model.endpoint}/api/pull`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: model.name })
			});
			model.status = response.ok ? 'online' : 'error';
		} catch {
			model.status = 'error';
		}
		availableModels = [...availableModels];
	}
</script>

<div class="llm-selector">
	<label class="selector-label">AI Model Selection</label>

	<!-- Trigger -->
	<button
		onclick={() => (isOpen = !isOpen)}
		class="selector-trigger"
		aria-label="Select AI Model"
		aria-expanded={isOpen}
	>
		<div class="trigger-content">
			{#if selectedModel}
				<div class="trigger-model">
					<Icon name={getProviderIcon(selectedModel.provider)} size={16} />
					<span class="trigger-name">{selectedModel.displayName}</span>
					<span class="trigger-status {getStatusColor(selectedModel.status)}">
						{selectedModel.status.toUpperCase()}
					</span>
				</div>
			{:else}
				<span class="trigger-placeholder">Select an AI model...</span>
			{/if}
		</div>
		<Icon name="chevron-down" size={16} />
	</button>

	<!-- Dropdown -->
	{#if isOpen}
		<div class="dropdown" transition:fade={{ duration: 150 }}>
			<div class="dropdown-list">
				{#each filteredModels as model (model.id)}
					<button
						onclick={() => selectModel(model)}
						class="model-option"
						class:selected={selectedModel?.id === model.id}
					>
						<div class="model-main">
							<Icon name={getProviderIcon(model.provider)} size={18} />
							<div class="model-info">
								<div class="model-header">
									<span class="model-name">{model.displayName}</span>
									<span class="model-spec">{model.specialization}</span>
								</div>
								<div class="model-meta">
									<span>{model.size}</span>
									{#if showMetrics && model.status === 'online'}
										<span>{model.performance.tokensPerSecond} tok/s</span>
										<span>{model.performance.responseTime}ms</span>
									{/if}
								</div>
								<div class="model-caps">
									{#each model.capabilities.slice(0, 3) as cap}
										<span class="cap-tag">{cap}</span>
									{/each}
								</div>
							</div>
						</div>

						<div class="model-actions">
							<div class="model-status {getStatusColor(model.status)}">
								<Icon name={getStatusIcon(model.status)} size={14} />
								<span>{model.status.toUpperCase()}</span>
							</div>
							{#if model.status === 'offline'}
								<button
									onclick={(e: MouseEvent) => { e.stopPropagation(); pullModel(model); }}
									class="pull-btn"
								>
									Load
								</button>
							{/if}
							{#if selectedModel?.id === model.id}
								<Icon name="check-circle" size={16} />
							{/if}
						</div>
					</button>
				{/each}

				{#if filteredModels.length === 0}
					<div class="no-models">No models available for "{filterBy}" filter</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="dropdown-footer">
				<Button variant="ghost" size="sm" onclick={refreshModelStatuses} disabled={isRefreshing}>
					{isRefreshing ? 'Refreshing...' : 'Refresh Status'}
				</Button>
				<span class="online-count">{onlineCount} / {filteredModels.length} online</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.llm-selector {
		position: relative;
		width: 100%;
	}
	.selector-label {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
		margin-bottom: 0.375rem;
		opacity: 0.8;
	}
	.selector-trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		height: 3rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.5rem;
		background: var(--color-panel-soft, #1c1917);
		color: inherit;
		cursor: pointer;
		transition: border-color 0.2s;
	}
	.selector-trigger:hover {
		border-color: var(--color-accent, #a51c30);
	}
	.trigger-content {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.trigger-model {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.trigger-name {
		font-weight: 500;
	}
	.trigger-placeholder {
		opacity: 0.5;
	}
	.trigger-status {
		font-size: 0.6875rem;
		font-weight: 600;
	}
	.dropdown {
		position: absolute;
		top: calc(100% + 0.25rem);
		left: 0;
		right: 0;
		z-index: 50;
		background: var(--color-panel-soft, #1c1917);
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.5rem;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		max-height: 24rem;
		overflow: auto;
	}
	.dropdown-list {
		padding: 0.25rem 0;
	}
	.model-option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.75rem 1rem;
		border: none;
		background: transparent;
		color: inherit;
		cursor: pointer;
		text-align: left;
		transition: background-color 0.15s;
	}
	.model-option:hover {
		background: rgba(255, 255, 255, 0.05);
	}
	.model-option.selected {
		background: rgba(59, 130, 246, 0.1);
	}
	.model-main {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		flex: 1;
	}
	.model-info {
		flex: 1;
	}
	.model-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.model-name {
		font-weight: 500;
	}
	.model-spec {
		font-size: 0.6875rem;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		background: rgba(255, 255, 255, 0.08);
		text-transform: capitalize;
	}
	.model-meta {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.25rem;
		font-size: 0.75rem;
		opacity: 0.6;
	}
	.model-caps {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.375rem;
	}
	.cap-tag {
		font-size: 0.6875rem;
		padding: 0.0625rem 0.375rem;
		border-radius: 0.25rem;
		background: rgba(59, 130, 246, 0.1);
		color: var(--color-info, #3b82f6);
	}
	.model-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}
	.model-status {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.6875rem;
		font-weight: 600;
	}
	.status-online { color: var(--color-accent, #22c55e); }
	.status-offline { color: rgba(255, 255, 255, 0.4); }
	.status-loading { color: var(--color-warning, #eab308); }
	.status-error { color: var(--color-danger, #ef4444); }
	.pull-btn {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		background: var(--color-info, #3b82f6);
		color: white;
		border: none;
		border-radius: 0.25rem;
		cursor: pointer;
		transition: opacity 0.15s;
	}
	.pull-btn:hover {
		opacity: 0.8;
	}
	.no-models {
		padding: 1.5rem;
		text-align: center;
		font-size: 0.875rem;
		opacity: 0.5;
	}
	.dropdown-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1rem;
		border-top: 1px solid var(--color-sand-dark, #44403c);
	}
	.online-count {
		font-size: 0.75rem;
		opacity: 0.6;
	}
</style>
