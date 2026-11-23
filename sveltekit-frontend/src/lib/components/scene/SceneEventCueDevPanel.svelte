<script lang="ts">
	import type { SceneTimedEventV1 } from '$lib/splat/scene-event-visibility-v1.js';

	interface Props {
		cue: SceneTimedEventV1;
		clockOptions: ReadonlyArray<{ id: string; label: string }>;
		targetOptions: ReadonlyArray<{ kind: 'actor' | 'primitive' | 'asset'; id: string; label: string }>;
		activeClockId: string;
		sourceTimeMs: number;
		maxTimeMs?: number;
		onCueChange: (cue: SceneTimedEventV1) => void;
		onClockSelect: (clockId: string) => void;
		onScrub: (sourceTimeMs: number) => void;
	}

	let { cue, clockOptions, targetOptions, activeClockId, sourceTimeMs, maxTimeMs = 60_000, onCueChange, onClockSelect, onScrub }: Props = $props();
	let active = $derived(cue.clockId === activeClockId && sourceTimeMs >= cue.startMs && sourceTimeMs < cue.endMs);
	let selectedTargetId = $derived(cue.targetRefs?.[0]?.targetId ?? '');

	function changeClock(event: Event) {
		onCueChange({ ...cue, clockId: (event.currentTarget as HTMLSelectElement).value });
	}

	function changeTarget(event: Event) {
		const targetId = (event.currentTarget as HTMLSelectElement).value;
		const target = targetOptions.find((option) => option.id === targetId);
		if (target) onCueChange({ ...cue, targetRefs: [{ kind: target.kind, targetId: target.id }] });
	}

	function changeAction(event: Event) {
		const type = (event.currentTarget as HTMLSelectElement).value;
		if (type === 'move_during_interval') {
			onCueChange({ ...cue, action: { type, fromMeters: [0, 0, 0], toMeters: [4, 0, 0] } });
		} else {
			onCueChange({ ...cue, action: { type: 'visible_during_interval', visible: true } });
		}
	}

	function changePreviewClock(event: Event) {
		onClockSelect((event.currentTarget as HTMLSelectElement).value);
	}

	function changeStart(event: Event) {
		const startMs = Number((event.currentTarget as HTMLInputElement).value);
		if (!Number.isSafeInteger(startMs) || startMs < 0) return;
		onCueChange({ ...cue, startMs, endMs: Math.max(cue.endMs, startMs + 1) });
	}

	function changeEnd(event: Event) {
		const endMs = Number((event.currentTarget as HTMLInputElement).value);
		if (!Number.isSafeInteger(endMs) || endMs <= cue.startMs) return;
		onCueChange({ ...cue, endMs });
	}

	function scrub(event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		if (Number.isSafeInteger(value) && value >= 0) onScrub(value);
	}
</script>

<section class="cue-panel" aria-label="Developer scene event cue controls">
	<header><strong>Scene Cue Lab</strong><span class="dev-only">DEV ONLY</span></header>
	<p>Preview a presentation cue against one source clock. No evidence or scene data is saved.</p>
	<div class="cue-title"><span>{cue.eventId}</span><b class:active>{active ? 'VISIBLE' : 'HIDDEN'}</b></div>
	<label>Clock lane
		<select value={cue.clockId} onchange={changeClock}>
			{#each clockOptions as clock (clock.id)}<option value={clock.id}>{clock.label}</option>{/each}
		</select>
	</label>
	<label>Preview lane
		<select value={activeClockId} onchange={changePreviewClock}>
			{#each clockOptions as clock (clock.id)}<option value={clock.id}>{clock.label}</option>{/each}
		</select>
	</label>
	<label>Scene target
		<select value={selectedTargetId} onchange={changeTarget}>
			{#each targetOptions as target (`${target.kind}:${target.id}`)}<option value={target.id}>{target.label}</option>{/each}
		</select>
	</label>
	<label>Presentation behavior
		<select value={cue.action?.type ?? 'visible_during_interval'} onchange={changeAction}>
			<option value="visible_during_interval">Show/hide during interval</option>
			<option value="move_during_interval">Move along a path during interval</option>
		</select>
	</label>
	<div class="interval">
		<label>Start · source ms<input type="number" min="0" max={maxTimeMs - 1} step="100" value={cue.startMs} onchange={changeStart} /></label>
		<label>End · source ms<input type="number" min={cue.startMs + 1} max={maxTimeMs} step="100" value={cue.endMs} onchange={changeEnd} /></label>
	</div>
	<label>Scrub source clock · {(sourceTimeMs / 1000).toFixed(1)} s
		<input type="range" min="0" max={maxTimeMs} step="100" value={Math.min(sourceTimeMs, maxTimeMs)} oninput={scrub} />
	</label>
	<p class="note">{cue.status.toUpperCase()} · cue affects its registered target only on <code>{cue.clockId}</code> from {(cue.startMs / 1000).toFixed(1)}–{(cue.endMs / 1000).toFixed(1)} s. This dev control is not a review decision.</p>
</section>

<style>
	.cue-panel { display:grid; gap:.65rem; padding:.85rem; border:1px solid #345064; border-radius:.5rem; background:#101c25; color:#e6edf2; font:12px/1.4 system-ui,sans-serif; }
	header,.cue-title,.interval { display:flex; align-items:center; justify-content:space-between; gap:.6rem; }
	strong { color:#f2c46f; font-size:.8rem; letter-spacing:.12em; text-transform:uppercase; }
	.dev-only { border:1px solid #936d31; border-radius:999px; padding:.1rem .4rem; color:#f2c46f; font-size:.62rem; }
	p { margin:0; color:#afbdc8; }
	.cue-title span,code { color:#bcdcf0; font-family:ui-monospace,monospace; }
	.cue-title b { color:#aebbc4; font-size:.68rem; letter-spacing:.1em; }
	.cue-title b.active { color:#72d2aa; }
	label { display:grid; gap:.3rem; color:#bdcbd4; }
	select,input { box-sizing:border-box; width:100%; min-height:2rem; border:1px solid #3b5362; border-radius:.3rem; padding:.3rem .45rem; background:#172732; color:#f2f5f7; }
	input[type='range'] { padding:0; accent-color:#e9bd69; }
	.interval { align-items:flex-start; }
	.interval label { flex:1; }
	.note { border-top:1px solid #2c414e; padding-top:.55rem; font-size:.68rem; }
</style>
