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
	class="absolute right-2 top-14 z-30 w-60 border-2 border-white/70 bg-black/90 p-2 font-mono text-[0.6rem] text-zinc-200"
>
	<div class="mb-1 flex justify-between uppercase tracking-wider text-yorha-accent">
		<span>Floor plan</span>
		<span class="text-zinc-400">x · z · cell</span>
	</div>
	<ul>
		{#each rows as r (r.role)}
			<li data-role={r.role} data-x={r.x.toFixed(2)} data-z={r.z.toFixed(2)} class="flex justify-between gap-2 border-t border-white/10 py-0.5">
				<span class="uppercase">{r.role}</span>
				<span>
					{r.x.toFixed(1)}, {r.z.toFixed(1)}
					<span class="text-zinc-400">({r.col},{r.row})</span>
					{#if r.y > 0}<span class="text-yorha-accent">↑{r.y.toFixed(1)}</span>{/if}
					{#if !r.walkable}<span class="text-nes-danger" title="Standing on a blocked cell">!</span>{/if}
				</span>
			</li>
		{/each}
	</ul>
</aside>
