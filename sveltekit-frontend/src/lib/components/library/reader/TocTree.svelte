<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface TocNode {
		id: string;
		heading: string;
		nodeType: string;
		children: TocNode[];
		citationLabel?: string;
	}

	let { nodes = [] as TocNode[], activeNodeId = '' } = $props();

	function onNodeClick(node: TocNode) {
		console.log('Node clicked:', node.id);
	}
</script>

<nav class="toc-tree flex flex-col gap-1 p-2 bg-[#0d0d0f] border-r border-[#222] h-full overflow-y-auto custom-scrollbar">
	<div class="px-3 py-2 text-[10px] font-bold text-[#444] uppercase tracking-widest mb-2">
		Table of Contents
	</div>

	{#each nodes as node (node.id)}
		{#if node.children && node.children.length > 0}
			<Collapsible.Root class="w-full">
				<Collapsible.Trigger
					class="flex items-center gap-2 w-full px-3 py-1.5 text-sm font-medium text-[#888] hover:text-white hover:bg-[#1a1a1c] rounded transition-colors group"
				>
					<Icon name="chevron-right" size={14} class="transition-transform duration-200 group-data-[state=open]:rotate-90" />
					<span class="truncate">{node.heading}</span>
				</Collapsible.Trigger>
				<Collapsible.Content class="ml-4 border-l border-[#222] pl-2 mt-1 flex flex-col gap-1">
					{#each node.children as child (child.id)}
						<button
							class="flex items-center gap-2 w-full px-3 py-1 text-xs text-[#666] hover:text-[#bbb] hover:bg-[#161618] rounded transition-colors text-left {activeNodeId === child.id ? 'bg-[#1a1a1c] text-blue-400 font-semibold' : ''}"
							onclick={() => onNodeClick(child)}
						>
							<Icon name="file-text" size={12} class="opacity-50" />
							<span class="truncate">{child.heading}</span>
						</button>
					{/each}
				</Collapsible.Content>
			</Collapsible.Root>
		{:else}
			<button
				class="flex items-center gap-2 w-full px-3 py-1.5 text-sm font-medium text-[#888] hover:text-white hover:bg-[#1a1a1c] rounded transition-colors text-left {activeNodeId === node.id ? 'bg-[#1a1a1c] text-blue-400 font-semibold' : ''}"
				onclick={() => onNodeClick(node)}
			>
				<Icon name="file-text" size={14} class="opacity-50" />
				<span class="truncate">{node.heading}</span>
			</button>
		{/if}
	{/each}
</nav>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: #0d0d0f;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: #222;
		border-radius: 2px;
	}
</style>
