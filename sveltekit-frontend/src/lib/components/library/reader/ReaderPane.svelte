<script lang="ts">
	import { onMount } from 'svelte';
	import * as Collapsible from 'bits-ui';
	import { ChevronRight } from 'lucide-svelte';

	interface LegalNode {
		id: string;
		heading: string;
		textContent: string | null;
		citationLabel: string | null;
		children?: LegalNode[];
	}

	let { nodes = [] as LegalNode[], documentTitle = '' } = $props();

	// State for expanded nodes
	let expandedNodes = $state(new Set<string>());

	function toggleNode(id: string) {
		if (expandedNodes.has(id)) {
			expandedNodes.delete(id);
		} else {
			expandedNodes.add(id);
		}
		expandedNodes = new Set(expandedNodes);
	}
</script>

<div class="reader-pane flex flex-col h-full bg-[#0a0a0b] text-[#d1d1d1] font-sans">
	<!-- Header -->
	<header class="border-b border-[#222] p-4 flex items-center justify-between">
		<h2 class="text-sm font-semibold uppercase tracking-wider text-[#888]">{documentTitle}</h2>
		<div class="flex gap-2">
			<button class="px-3 py-1 text-xs border border-[#333] rounded hover:bg-[#1a1a1c] transition-colors">
				History
			</button>
			<button class="px-3 py-1 text-xs bg-[#3a3a3c] rounded hover:bg-[#4a4a4c] transition-colors text-white">
				Cite
			</button>
		</div>
	</header>

	<!-- Content -->
	<div class="flex-1 overflow-y-auto p-8 custom-scrollbar">
		{#each nodes as node (node.id)}
			<div class="mb-8 max-w-3xl mx-auto">
				<div class="group flex items-start gap-4 mb-2">
					<div 
						class="mt-1 w-5 h-5 flex items-center justify-center rounded hover:bg-[#222] cursor-pointer transition-colors"
						onclick={() => toggleNode(node.id)}
					>
						<ChevronRight 
							class="w-4 h-4 text-[#555] transition-transform duration-200"
							style="transform: {expandedNodes.has(node.id) ? 'rotate(90deg)' : 'rotate(0deg)'}"
						/>
					</div>
					
					<div class="flex-1">
						<h3 class="text-lg font-bold text-white mb-2 group-hover:text-blue-400 transition-colors cursor-pointer">
							{node.heading}
						</h3>
						
						{#if node.citationLabel}
							<span class="text-[10px] bg-[#1a1a1c] text-[#888] px-2 py-0.5 rounded border border-[#222] font-mono mb-4 inline-block">
								{node.citationLabel}
							</span>
						{/if}

						{#if node.textContent}
							<div class="text-base leading-relaxed text-[#bbb] whitespace-pre-wrap selection:bg-blue-900/40">
								{node.textContent}
							</div>
						{/if}
					</div>
				</div>

				<!-- Recursive children -->
				{#if expandedNodes.has(node.id) && node.children && node.children.length > 0}
					<div class="ml-9 border-l border-[#222] pl-6 mt-4">
						<!-- This would be a recursive call in a real implementation or a nested each -->
						{#each node.children as child (child.id)}
							<div class="mb-6">
								<h4 class="text-sm font-bold text-[#eee] mb-2">{child.heading}</h4>
								<div class="text-sm text-[#999] leading-relaxed">
									{child.textContent || ''}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 8px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: #0a0a0b;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: #222;
		border-radius: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: #333;
	}
</style>
