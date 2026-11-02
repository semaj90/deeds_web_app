<script lang="ts">
	import { onMount } from 'svelte';
	import { SCENE_ROLES } from '$lib/courtroom/runtime/scene-adapter.js';
	import { heightAt, isWalkable, worldToCell } from '$lib/courtroom/courtroom-floorplan-v1.js';

	let { getPosition }: { getPosition: (role: string) => { x: number; z: number } | null } = $props();

	interface Row {
		role: string;
		x: number;
		z: number;
		col: number;
		row: number;
		y: number;
		walkable: boolean;
	}

	let rows = $state<Row[]>([]);

	function sample(): Row[] {
		const out: Row[] = [];
		for (const role of SCENE_ROLES) {
			const p = getPosition(role);
			if (!p) continue;
			const cell = worldToCell(p.x, p.z);
			out.push({ role, x: p.x, z: p.z, col: cell.col, row: cell.row, y: heightAt(p.x, p.z), walkable: isWalkable(p.x, p.z) });
		}
		return out;
	}

	onMount(() => {
		rows = sample();
		const id = setInterval(() => (rows = sample()), 200);
		return () => clearInterval(id);
	});
</script>

<aside
	aria-label="Character coordinates"
	data-testid="coordinate-readout"
	class="absolute right-3 top-16 z-30 w-64 rounded-lg border border-[#bad0ff]/25 bg-linear-to-br from-[#141d30]/90 to-[#0a0d1b]/85 p-3 font-mono text-[0.65rem] text-[#e6efff] backdrop-blur-md shadow-[0_10px_28px_rgba(0,0,0,0.4)]"
>
	<div class="mb-2 flex items-center justify-between border-b border-[#bad0ff]/15 pb-1 uppercase tracking-wider text-[#f3d471]">
		<span class="font-bold flex items-center gap-1.5">
			<span class="inline-block size-1.5 rounded-full bg-[#f3d471] animate-pulse"></span>
			Floor Plan
		</span>
		<span class="text-[0.6rem] text-zinc-400 font-mono">x · z · cell</span>
	</div>
	<ul class="space-y-0.5">
		{#each rows as r (r.role)}
			<li
				data-role={r.role}
				data-x={r.x.toFixed(2)}
				data-z={r.z.toFixed(2)}
				class="flex items-center justify-between gap-2 border-t border-white/5 py-1 text-[0.62rem]"
			>
				<span class="uppercase font-semibold text-zinc-300">{r.role}</span>
				<span class="font-mono">
					<span class="text-[#8bdfff]">{r.x.toFixed(1)}</span>, <span class="text-[#8bdfff]">{r.z.toFixed(1)}</span>
					<span class="text-zinc-500 ml-0.5">({r.col},{r.row})</span>
					{#if r.y > 0}
						<span class="ml-1 text-emerald-400 font-bold" title="Platform height">↑{r.y.toFixed(1)}</span>
					{/if}
					{#if !r.walkable}
						<span class="ml-1 text-[#ff9a80] font-bold" title="Standing on a blocked cell">!</span>
					{/if}
				</span>
			</li>
		{/each}
	</ul>
</aside>
