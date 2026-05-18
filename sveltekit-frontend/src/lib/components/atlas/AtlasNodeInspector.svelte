<script lang="ts">
	import type { AtlasNode, AtlasChunk } from '$lib/types/atlas.js';
	import { NODE_COLORS } from '$lib/types/atlas.js';

	let {
		node,
		chunk,
	}: {
		node: AtlasNode | null;
		chunk: AtlasChunk | null;
	} = $props();

	function fmt(v: number | undefined): string {
		return v !== undefined ? v.toFixed(3) : '—';
	}
</script>

<div class="flex flex-col h-full p-4 bg-panel rounded-lg overflow-y-auto gap-3">
	{#if !node}
		<div class="flex-1 flex items-center justify-center text-sand-7 text-xs">
			Click a node to inspect
		</div>
	{:else}
		<!-- Type badge + label -->
		<div class="flex items-center gap-2">
			<span
				class="w-2.5 h-2.5 rounded-full flex-shrink-0"
				style="background:{NODE_COLORS[node.type]}"
			></span>
			<span class="text-[10px] font-mono text-sand-8 uppercase tracking-wide">{node.type}</span>
		</div>

		<div class="text-xs font-semibold text-sand-12 break-all leading-tight">{node.label}</div>

		{#if node.data.source_ref}
			<div class="text-[10px] font-mono text-sand-8 break-all">{node.data.source_ref}</div>
		{/if}

		<!-- Chunk text preview -->
		{#if node.data.text}
			<div
				class="text-[11px] text-sand-9 bg-panelSoft rounded p-2 leading-relaxed max-h-28 overflow-y-auto"
			>
				{node.data.text.slice(0, 300)}{node.data.text.length > 300 ? '…' : ''}
			</div>
		{/if}

		<!-- Score signals -->
		{#if node.data.qdrant_score !== undefined || node.data.llm_synthesis_weight !== undefined}
			<div class="space-y-1 text-xs">
				{#if node.data.qdrant_score !== undefined}
					<div class="flex justify-between">
						<span class="text-sand-8">cosine</span>
						<span class="font-mono text-blue-400">{fmt(node.data.qdrant_score)}</span>
					</div>
				{/if}
				{#if node.data.pagerank_score !== undefined}
					<div class="flex justify-between">
						<span class="text-sand-8">pagerank</span>
						<span class="font-mono text-purple-400">{fmt(node.data.pagerank_score)}</span>
					</div>
				{/if}
				{#if node.data.topology_score !== undefined}
					<div class="flex justify-between">
						<span class="text-sand-8">topology</span>
						<span class="font-mono text-green-400">{fmt(node.data.topology_score)}</span>
					</div>
				{/if}
				{#if node.data.llm_synthesis_weight !== undefined}
					<div class="flex justify-between pt-1 border-t border-sand-5 mt-1">
						<span class="text-sand-8">blend</span>
						<span class="font-mono font-bold text-accent">{fmt(node.data.llm_synthesis_weight)}</span>
					</div>
				{/if}
			</div>
		{/if}

		<!-- 4D topology -->
		{#if node.data.topology4d}
			{@const t = node.data.topology4d}
			<div class="pt-2 border-t border-sand-5">
				<div class="text-[10px] text-sand-7 mb-1.5">4D topology</div>
				<div class="grid grid-cols-4 gap-1 text-[10px] font-mono text-center">
					{#each [['x', t.x], ['y', t.y], ['z', t.z], ['w', t.w]] as [axis, val]}
						<div>
							<div class="text-sand-7">{axis}</div>
							<div class="text-sand-10">{(val as number).toFixed(2)}</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- ACE feature key -->
		{#if node.data.feature_key}
			<div class="pt-2 border-t border-sand-5 text-xs flex items-center gap-2">
				<span class="text-sand-8">feature:</span>
				<span class="font-mono text-teal-400 text-[10px]">{node.data.feature_key}</span>
				{#if node.data.redis_hot}
					<span class="px-1.5 py-0.5 rounded bg-orange-900/40 text-orange-400 text-[9px]">HOT</span>
				{/if}
			</div>
		{/if}

		<!-- Chunk signals from actual chunk record -->
		{#if chunk && !node.data.qdrant_score}
			<div class="space-y-1 text-xs">
				<div class="flex justify-between">
					<span class="text-sand-8">cosine</span>
					<span class="font-mono text-blue-400">{fmt(chunk.signals.cosine)}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-sand-8">hotness</span>
					<span class="font-mono text-orange-400">{fmt(chunk.signals.hotness)}</span>
				</div>
				<div class="flex justify-between pt-1 border-t border-sand-5">
					<span class="text-sand-8">score</span>
					<span class="font-mono text-accent font-bold">{fmt(chunk.score)}</span>
				</div>
			</div>
		{/if}
	{/if}
</div>