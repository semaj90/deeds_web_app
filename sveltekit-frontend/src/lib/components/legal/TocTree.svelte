<script lang="ts">
	interface TocNode {
		id: string;
		parentId: string | null;
		nodeType: string;
		heading: string;
		citationLabel?: string | null;
		nodePath: string;
		depth: number;
		pageStart?: number | null;
		pageEnd?: number | null;
		children?: TocNode[];
	}

	interface Props {
		nodes: TocNode[];
		selectedId?: string | null;
		onSelect?: (id: string) => void;
		depth?: number;
	}

	let {
		nodes = [],
		selectedId = $bindable<string | null>(null),
		onSelect,
		depth = 0,
	}: Props = $props();

	const NODE_ICON: Record<string, string> = {
		part: '◈',
		title: '§§',
		chapter: '⬡',
		article: '▸',
		section: '§',
		subdivision: '·',
	};

	const collapsed = $state<Record<string, boolean>>({});
	function toggle(id: string) { collapsed[id] = !collapsed[id]; }
</script>

{#each nodes as node}
	<div>
		<button
			onclick={() => {
				if (node.children?.length) toggle(node.id);
				selectedId = node.id;
				onSelect?.(node.id);
			}}
			class="w-full flex items-center gap-1.5 px-2 py-1 rounded text-left transition-colors group
				{selectedId === node.id ? 'bg-accent/15 text-accent' : 'hover:bg-sand/5 text-sand/60 hover:text-sand/80'}"
			style:padding-left="{depth * 14 + 8}px"
		>
			{#if node.children?.length}
				<span class="text-[9px] text-sand/30 w-3 shrink-0 {collapsed[node.id] ? '' : 'rotate-90'} transition-transform">
					▶
				</span>
			{:else}
				<span class="w-3 shrink-0 text-[9px] text-sand/25 text-center">
					{NODE_ICON[node.nodeType] ?? '·'}
				</span>
			{/if}
			<span class="text-xs truncate">{node.heading}</span>
			{#if node.citationLabel}
				<span class="ml-auto text-[9px] text-sand/25 font-mono shrink-0">{node.citationLabel}</span>
			{/if}
		</button>

		{#if node.children?.length && !collapsed[node.id]}
			<svelte:self
				nodes={node.children}
				bind:selectedId
				{onSelect}
				depth={depth + 1}
			/>
		{/if}
	</div>
{/each}
