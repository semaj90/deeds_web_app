<script lang="ts">
	import type { PageData } from '../../../routes/cases/[id]/evidence/$types';

	interface Props {
		data: PageData;
	}

	const { data }: Props = $props();
	const { evidence: evidenceRows = [] } = data;

	// Fake "graph" for now: just treat evidence as nodes
	const nodes = evidenceRows.map((ev) => ({
		id: ev.id,
		label: ev.file_name ?? 'Untitled',
		type: ev.evidence_type ?? 'generic'
	}));
</script>

<div class="flex flex-col gap-2 h-full">
	<div class="text-[10px] uppercase tracking-[0.15em] text-[#ffdf6b]">
		Evidence Graph Analyzer
	</div>

	<div class="grid grid-cols-[minmax(0,1.2fr),minmax(0,1fr)] gap-2 flex-1">
		<!-- Radar grid -->
		<div class="border border-[#f5f5f5] bg-[#101018] p-2 flex flex-col">
			<div class="text-[9px] text-[#aaa] mb-1">
				Relationship radar (placeholder)
			</div>
			<div class="flex-1 relative bg-[#050509] border border-[#34344a] overflow-hidden">
				<!-- NES grid -->
				<div class="absolute inset-0 opacity-30">
					{#each Array(8) as _, i}
						<div
							class="absolute left-0 right-0 border-t border-[#34344a]"
							style={`top: ${(i + 1) * (100 / 9)}%`}
						></div>
						<div
							class="absolute top-0 bottom-0 border-l border-[#34344a]"
							style={`left: ${(i + 1) * (100 / 9)}%`}
						></div>
					{/each}
				</div>

				<!-- Nodes -->
				<div class="absolute inset-0">
					{#each nodes.slice(0, 12) as node, idx}
						<div
							class="absolute px-1 py-[1px] text-[9px] rounded border border-[#f5f5f5] bg-[#202030] text-[#fff] truncate max-w-[45%]"
							style={`top: ${(idx * 17) % 80 + 10}%; left: ${(idx * 29) % 70 + 10}%;`}
						>
							{node.label}
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- Node list -->
		<div class="border border-[#f5f5f5] bg-[#101018] p-2 text-[11px] flex flex-col">
			<div class="text-[9px] text-[#aaa] mb-1">
				Nodes ({nodes.length})
			</div>
			<div class="flex-1 overflow-auto">
				{#if nodes.length === 0}
					<p class="text-[10px] text-[#aaa] italic">
						Add evidence to see nodes on the radar.
					</p>
				{:else}
					<ul class="space-y-1">
						{#each nodes as node}
							<li class="border border-[#f5f5f5] bg-[#15151f] px-2 py-1 rounded">
								<div class="text-[10px] font-semibold truncate">
									{node.label}
								</div>
								<div class="text-[9px] text-[#aaa]">
									Type: {node.type}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	</div>
</div>
