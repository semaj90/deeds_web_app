<script lang="ts">
	import type { TraceStep } from '$lib/types/atlas.js';

	let { steps }: { steps: TraceStep[] } = $props();

	const STAGE_COLORS: Record<string, string> = {
		'A0:cache': '#ea580c',
		'A1:embed': '#7c3aed',
		'A2:qdrant': '#2563eb',
		'A3:karpathy': '#d97706',
		'A3:blend': '#b45309',
		'A4:hyperrag': '#0d9488',
	};

	function colorFor(stage: string) {
		return STAGE_COLORS[stage] ?? '#6b7280';
	}

	const totalMs = $derived(steps.reduce((s, t) => s + t.durationMs, 0));
</script>

<div class="flex items-center gap-0 px-3 py-2 bg-panel rounded-lg overflow-x-auto min-h-16">
	{#if steps.length === 0}
		<span class="text-sand-7 text-xs self-center whitespace-nowrap"
			>Trace will appear after a query</span
		>
	{:else}
		{#each steps as step, i}
			{#if i > 0}
				<div class="w-4 h-px bg-sand-5 flex-shrink-0 mx-0.5"></div>
			{/if}
			<div class="flex flex-col items-center gap-0.5 px-2 flex-shrink-0">
				<span
					class="px-1.5 py-0.5 rounded text-[9px] font-mono text-white whitespace-nowrap"
					style="background:{colorFor(step.stage)}"
				>{step.stage}</span>
				<span class="text-xs font-mono text-sand-11">{step.durationMs}ms</span>
				<span class="text-[9px] text-sand-8 max-w-20 text-center truncate" title={step.detail}
					>{step.detail}</span
				>
			</div>
		{/each}
		<div class="ml-3 pl-3 border-l border-sand-5 flex-shrink-0">
			<div class="text-[10px] text-sand-7">total</div>
			<div class="text-sm font-mono text-sand-11">{totalMs}ms</div>
		</div>
	{/if}
</div>