<script lang="ts">
	import {
		TIMELINE_TRACK_KINDS_V1,
		getActiveTrackItemsAtTimeV1,
		type TimelineClockModeV1,
		type TimelineTrackItemV1,
		type TimelineTrackKindV1
	} from '$lib/reconstruction/dual-clock-timeline-v1.js';

	interface Props {
		durationSeconds?: number;
		currentTimeSeconds?: number;
		clockMode?: TimelineClockModeV1;
		items?: TimelineTrackItemV1[];
		onSeek?: (seconds: number) => void;
		onModeChange?: (mode: TimelineClockModeV1) => void;
	}

	let {
		durationSeconds = 20,
		currentTimeSeconds = $bindable(0),
		clockMode = $bindable<TimelineClockModeV1>('deterministic_review'),
		items = [],
		onSeek,
		onModeChange
	}: Props = $props();

	let activeItems = $derived(getActiveTrackItemsAtTimeV1(items, currentTimeSeconds));
	let playheadPercent = $derived(
		durationSeconds > 0 ? Math.max(0, Math.min(100, (currentTimeSeconds / durationSeconds) * 100)) : 0
	);

	function itemsForTrack(track: TimelineTrackKindV1): TimelineTrackItemV1[] {
		return items.filter((item) => item.track === track);
	}

	function handleScrub(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const next = Number(target.value);
		if (Number.isFinite(next)) {
			currentTimeSeconds = next;
			onSeek?.(next);
		}
	}

	function toggleClockMode() {
		const next: TimelineClockModeV1 =
			clockMode === 'deterministic_review' ? 'interactive_preview' : 'deterministic_review';
		clockMode = next;
		onModeChange?.(next);
	}
</script>

<section
	class="timeline-engine rounded border border-neutral-700 bg-neutral-900 p-3 text-xs text-neutral-200"
	aria-label="Dual-Clock 5-Track Scene Timeline"
>
	<header class="mb-2 flex items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<span class="font-semibold tracking-wide text-amber-300">TIMELINE ENGINE (ENG-03)</span>
			<button
				type="button"
				onclick={toggleClockMode}
				class="rounded border border-neutral-600 bg-neutral-800 px-2 py-0.5 text-[11px] hover:border-amber-400"
			>
				Mode: {clockMode === 'deterministic_review' ? 'Deterministic Review (setTime)' : 'Interactive Preview (update)'}
			</button>
		</div>
		<div class="font-mono text-[11px] text-neutral-400">
			t = {currentTimeSeconds.toFixed(2)}s / {durationSeconds.toFixed(2)}s · Active: {activeItems.length}
		</div>
	</header>

	<div class="mb-3">
		<input
			type="range"
			min="0"
			max={durationSeconds}
			step="0.05"
			value={currentTimeSeconds}
			oninput={handleScrub}
			aria-label="Scrub timeline seconds"
			class="w-full accent-amber-400"
		/>
	</div>

	<div class="relative space-y-1.5">
		<div
			class="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-amber-400"
			style={`left: ${playheadPercent}%`}
		></div>

		{#each TIMELINE_TRACK_KINDS_V1 as track}
			<div class="grid grid-cols-[130px_1fr] items-center gap-2">
				<div class="truncate font-mono text-[11px] text-neutral-400">{track}</div>
				<div class="relative h-6 overflow-hidden rounded bg-neutral-800/80">
					{#each itemsForTrack(track) as item (item.id)}
						{@const leftPct = (item.startSeconds / durationSeconds) * 100}
						{@const widthPct = Math.max(2, ((item.endSeconds - item.startSeconds) / durationSeconds) * 100)}
						<div
							class="absolute top-0.5 bottom-0.5 truncate rounded border border-amber-500/50 bg-amber-500/20 px-1.5 leading-5 text-[10px] text-amber-200"
							style={`left: ${leftPct}%; width: ${widthPct}%`}
							title={`${item.label} (${item.startSeconds.toFixed(2)}s - ${item.endSeconds.toFixed(2)}s)`}
						>
							{item.label}
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</section>
