<script lang="ts">
	import { fade } from 'svelte/transition';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { getOllamaBaseUrl } from '$lib/utils/ollama';

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
			id: 'gemma4-legal',
			name: 'gemma4-legal:latest',
			displayName: 'Gemma4 Legal Specialist',
			provider: 'ollama',
			size: '7.3GB',
			specialization: 'legal',
			status: 'offline',
			performance: { tokensPerSecond: 25, memoryUsage: '6.8GB', responseTime: 1200 },
			capabilities: ['legal-analysis', 'case-research', 'document-review'],
			endpoint: getOllamaBaseUrl()
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
			endpoint: getOllamaBaseUrl()
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
			endpoint: getOllamaBaseUrl()
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

	function getStatusIcon(status: string): string {
		switch (status) {
			case 'online': return 'circle-check';
			case 'offline': return 'circle';
			case 'loading': return 'loader-circle';
			case 'error': return 'circle-alert';
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
			const response = await fetch(`${getOllamaBaseUrl()}/api/tags`, {
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

<div class="relative w-full">
	<label class="block text-sm font-medium mb-1.5 opacity-80">AI Model Selection</label>

	<button
		onclick={() => (isOpen = !isOpen)}
		class="flex items-center justify-between w-full h-12 px-3 py-2 border border-sand-dark rounded-lg bg-panel-soft text-inherit cursor-pointer hover:border-accent transition-colors"
		aria-label="Select AI Model"
		aria-expanded={isOpen}
	>
		<div class="flex items-center gap-2">
			{#if selectedModel}
				<div class="flex items-center gap-2">
					<Icon name="cpu" size={16} />
					<span class="font-medium">{selectedModel.displayName}</span>
					<span
						class="text-[11px] font-semibold"
						class:text-green-500={selectedModel.status === 'online'}
						class:text-stone-500={selectedModel.status === 'offline'}
						class:text-warning={selectedModel.status === 'loading'}
						class:text-danger={selectedModel.status === 'error'}
					>
						{selectedModel.status.toUpperCase()}
					</span>
				</div>
			{:else}
				<span class="opacity-50">Select an AI model...</span>
			{/if}
		</div>
		<Icon name="chevron-down" size={16} />
	</button>

	{#if isOpen}
		<div class="absolute top-full mt-1 left-0 right-0 z-50 bg-panel-soft border border-sand-dark rounded-lg shadow-xl max-h-96 overflow-auto" transition:fade={{ duration: 150 }}>
			<div class="py-1">
				{#each filteredModels as model (model.id)}
					<div
						onclick={() => selectModel(model)}
						onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectModel(model); } }}
						class="flex items-center justify-between w-full px-4 py-3 bg-transparent text-inherit cursor-pointer text-left hover:bg-white/5"
						style:background={selectedModel?.id === model.id ? 'rgba(59, 130, 246, 0.1)' : 'transparent'}
						role="option"
						tabindex="0"
						aria-selected={selectedModel?.id === model.id}
					>
						<div class="flex items-start gap-3 flex-1">
							<Icon name="cpu" size={18} />
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<span class="font-medium">{model.displayName}</span>
									<span class="text-[11px] px-1.5 py-0.5 rounded bg-white/8 capitalize">{model.specialization}</span>
								</div>
								<div class="flex gap-3 mt-1 text-xs opacity-60">
									<span>{model.size}</span>
									{#if showMetrics && model.status === 'online'}
										<span>{model.performance.tokensPerSecond} tok/s</span>
										<span>{model.performance.responseTime}ms</span>
									{/if}
								</div>
								<div class="flex flex-wrap gap-1 mt-1.5">
									{#each model.capabilities.slice(0, 3) as cap}
										<span class="text-[11px] px-1.5 py-px rounded bg-blue-500/10 text-info">{cap}</span>
									{/each}
								</div>
							</div>
						</div>

						<div class="flex items-center gap-2 shrink-0">
							<div
								class="flex items-center gap-1 text-[11px] font-semibold"
								class:text-green-500={model.status === 'online'}
								class:text-stone-500={model.status === 'offline'}
								class:text-warning={model.status === 'loading'}
								class:text-danger={model.status === 'error'}
							>
								<Icon name={getStatusIcon(model.status)} size={14} />
								<span>{model.status.toUpperCase()}</span>
							</div>
							{#if model.status === 'offline'}
								<button
									onclick={(e: MouseEvent) => { e.stopPropagation(); pullModel(model); }}
									class="px-2 py-1 text-xs bg-info text-white border-none rounded cursor-pointer hover:opacity-80"
								>
									Load
								</button>
							{/if}
							{#if selectedModel?.id === model.id}
								<Icon name="circle-check" size={16} />
							{/if}
						</div>
					</div>
				{/each}

				{#if filteredModels.length === 0}
					<div class="p-6 text-center text-sm opacity-50">No models available for "{filterBy}" filter</div>
				{/if}
			</div>

			<div class="flex items-center justify-between px-4 py-2 border-t border-sand-dark">
				<Button variant="ghost" size="sm" onclick={refreshModelStatuses} disabled={isRefreshing}>
					{isRefreshing ? 'Refreshing...' : 'Refresh Status'}
				</Button>
				<span class="text-xs opacity-60">{onlineCount} / {filteredModels.length} online</span>
			</div>
		</div>
	{/if}
</div>
