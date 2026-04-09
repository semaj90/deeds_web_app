<script lang="ts">
	import Fuse from 'fuse.js';
	import Icon from '$lib/components/ui/Icon.svelte';

	type NodeType = { id: string; title: string; evidenceType: string; description?: string; [key: string]: any };

	let {
		nodes,
		onHighlight,
		onNavigate,
		onClose
	}: {
		nodes: NodeType[];
		onHighlight: (nodeIds: Set<string>) => void;
		onNavigate: (nodeId: string) => void;
		onClose: () => void;
	} = $props();

	let query = $state('');
	let inputEl: HTMLInputElement;

	// Cache Fuse index — only rebuild when nodes array identity changes
	let cachedNodes: NodeType[] | null = null;
	let cachedFuse: Fuse<NodeType> | null = null;

	const fuse = $derived.by(() => {
		if (cachedNodes === nodes && cachedFuse) return cachedFuse;
		cachedNodes = nodes;
		cachedFuse = new Fuse(nodes, {
			keys: [
				{ name: 'title', weight: 0.6 },
				{ name: 'evidenceType', weight: 0.3 },
				{ name: 'description', weight: 0.1 }
			],
			threshold: 0.35,
			includeScore: true
		});
		return cachedFuse;
	});

	let results = $derived.by(() => {
		if (!query.trim()) {
			onHighlight(new Set());
			return [];
		}
		const found = fuse.search(query);
		onHighlight(new Set(found.map(r => r.item.id)));
		return found.slice(0, 8);
	});

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}

	$effect(() => {
		inputEl?.focus();
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="search-overlay" onkeydown={handleKeyDown}>
	<div class="search-box">
		<Icon name="search" size={14} />
		<input
			bind:this={inputEl}
			bind:value={query}
			type="text"
			placeholder="Search evidence nodes..."
			class="search-input"
		/>
		<button class="close-btn" onclick={onClose}>
			<Icon name="x" size={12} />
		</button>
	</div>

	{#if results.length > 0}
		<div class="search-results">
			{#each results as result}
				<button
					class="result-item"
					onclick={() => onNavigate(result.item.id)}
				>
					<span class="result-type">[{result.item.evidenceType.toUpperCase()}]</span>
					<span class="result-title">{result.item.title}</span>
					{#if result.score !== undefined}
						<span class="result-score">{Math.round((1 - result.score) * 100)}%</span>
					{/if}
				</button>
			{/each}
		</div>
	{:else if query.trim()}
		<div class="no-results">No matching nodes</div>
	{/if}
</div>

<style>
	.search-overlay {
		position: absolute;
		top: 8px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 30;
		min-width: 320px;
		max-width: 420px;
		background: #f0edd4;
		border: 2px solid #8a855e;
		box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.2);
		font-family: "Courier New", monospace;
	}

	.search-box {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-bottom: 1px solid #8a855e;
		color: #4a4630;
	}

	.search-input {
		flex: 1;
		border: none;
		background: transparent;
		font-family: "Courier New", monospace;
		font-size: 0.8rem;
		color: #2a2618;
		outline: none;
	}
	.search-input::placeholder {
		color: #8a855e;
	}

	.close-btn {
		background: none;
		border: 1px solid #8a855e;
		color: #6b654a;
		cursor: pointer;
		padding: 2px 4px;
		display: flex;
		align-items: center;
	}
	.close-btn:hover {
		background: #e8e4c8;
	}

	.search-results {
		max-height: 240px;
		overflow-y: auto;
	}

	.result-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 12px;
		border: none;
		border-bottom: 1px solid rgba(138, 133, 94, 0.2);
		background: transparent;
		cursor: pointer;
		font-family: "Courier New", monospace;
		font-size: 0.7rem;
		color: #4a4630;
		text-align: left;
	}
	.result-item:hover {
		background: #e8e4c8;
	}

	.result-type {
		color: #8a855e;
		font-size: 0.55rem;
		letter-spacing: 0.5px;
		flex-shrink: 0;
	}

	.result-title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.result-score {
		font-size: 0.6rem;
		color: #3a6e3a;
		flex-shrink: 0;
	}

	.no-results {
		padding: 12px;
		text-align: center;
		font-size: 0.7rem;
		color: #8a855e;
	}
</style>
