<script lang="ts">
	import { ToggleGroup } from 'bits-ui';
	import { LEVEL1_CAMERAS, type Level1View } from '$lib/courtroom/demo-level1-v1.js';
	import type { CourtroomView } from '$lib/courtroom/courtroom-types.js';

	let {
		level,
		onCamera,
		onMove,
		stations = ['witness', 'judge']
	}: {
		level: Level1View;
		onCamera: (view: CourtroomView) => void;
		onMove: (station: string) => void;
		stations?: string[];
	} = $props();

	const RECEIPT_LABEL: Record<string, string> = {
		SCENE_READY: 'Scene loaded',
		CAMERA_WIDE: 'Wide view',
		CAMERA_WITNESS: 'Witness view',
		CAMERA_JUDGE: 'Judge view',
		MOVE_VERIFIED: 'Walked to a station'
	};
</script>

<section
	aria-label="Level 1: Courtroom Orientation"
	data-testid="level1-panel"
	data-level-complete={level.complete}
	class="absolute left-3 top-14 z-30 grid w-64 gap-2 rounded-lg border border-[#bad0ff]/25 border-t-[#f3d471]/60 bg-linear-to-br from-[#141d30]/85 to-[#0a0d1b]/80 p-3 text-[#e7efff] shadow-[0_10px_28px_rgba(0,0,0,0.4)] backdrop-blur-md"
>
	<h2 class="text-[0.65rem] font-bold uppercase tracking-widest text-[#f3d471]">Level 1 | Courtroom Orientation</h2>

	<div class="grid gap-1">
		<span class="text-[0.55rem] uppercase tracking-wider text-[#a5b6cf]" id="l1-camera-label">Camera</span>
		<ToggleGroup.Root
			type="single"
			value={level.cameraPreset}
			onValueChange={(v) => v && onCamera(v as CourtroomView)}
			aria-labelledby="l1-camera-label"
			class="flex gap-1"
		>
			{#each LEVEL1_CAMERAS as view (view)}
				<ToggleGroup.Item
					value={view}
					data-testid={`camera-${view}`}
					class="flex-1 rounded border border-[#34435e] bg-[#1b2740] px-2 py-1 text-[0.65rem] uppercase text-[#a7bfdc] focus-visible:outline-2 focus-visible:outline-[#8bdfff] data-[state=on]:border-[#d4b96e] data-[state=on]:bg-[#3e3650] data-[state=on]:text-[#fff3c6]"
				>
					{view}
				</ToggleGroup.Item>
			{/each}
		</ToggleGroup.Root>
	</div>

	<div class="grid gap-1">
		<span class="text-[0.55rem] uppercase tracking-wider text-[#a5b6cf]">Walk the jester to</span>
		<div class="flex gap-1">
			{#each stations as station (station)}
				<button
					type="button"
					data-testid={`move-${station}`}
					onclick={() => onMove(station)}
					class="flex-1 rounded border border-[#3b4c65] bg-linear-to-br from-[#25324a] to-[#101827] px-2 py-1 text-[0.65rem] uppercase text-[#e6efff] hover:border-[#a6d9fc] focus-visible:outline-2 focus-visible:outline-[#8bdfff]"
				>
					{station}
				</button>
			{/each}
		</div>
		{#if level.moveOutcome}
			<p class="font-mono text-[0.6rem] text-[#a5b6cf]" data-testid="level1-move">
				{level.moveOutcome.station}: {level.moveOutcome.outcome}
				{#if level.moveOutcome.position}at {level.moveOutcome.position.x.toFixed(1)}, {level.moveOutcome.position.z.toFixed(1)}{/if}
			</p>
		{/if}
	</div>

	<ul class="grid gap-0.5 text-[0.65rem]" aria-label="Level 1 receipts">
		{#each Object.keys(RECEIPT_LABEL) as id (id)}
			<li class={level.receipts.includes(id as never) ? 'text-[#80f3ce]' : 'text-[#a5b6cf]'} data-receipt={id} data-earned={level.receipts.includes(id as never)}>
				{level.receipts.includes(id as never) ? '[x]' : '[ ]'} {RECEIPT_LABEL[id]}
			</li>
		{/each}
	</ul>
	{#if level.complete}<p class="text-[0.7rem] font-bold text-[#f3d471]" data-testid="level1-complete">Level 1 complete</p>{/if}
</section>
