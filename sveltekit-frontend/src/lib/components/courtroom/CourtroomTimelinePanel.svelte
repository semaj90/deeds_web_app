<script lang="ts">
	import { Slider, ToggleGroup } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { PLAYBACK_SPEEDS, clampSeek, formatClock, markerPercent } from '$lib/courtroom/courtroom-hud-v1.js';

	interface Marker {
		timeMs: number;
		label: string;
	}

	let {
		currentMs,
		durationMs,
		playing,
		loading,
		speed,
		markers,
		activeMarker,
		onToggle,
		onStep,
		onSeek,
		onSpeed,
		onReset,
		onRegenerate
	}: {
		currentMs: number;
		durationMs: number;
		playing: boolean;
		loading: boolean;
		speed: number;
		markers: Marker[];
		activeMarker: number;
		onToggle: () => void;
		onStep: (direction: -1 | 1) => void;
		onSeek: (ms: number) => void;
		onSpeed: (speed: number) => void;
		onReset: () => void;
		onRegenerate: () => void;
	} = $props();

	const iconButton =
		'flex size-7 items-center justify-center rounded border border-[#3b4c65] bg-linear-to-br from-[#25324a] to-[#101827] text-[#e6efff] transition hover:border-[#a6d9fc] hover:text-white focus-visible:outline-2 focus-visible:outline-[#8bdfff] disabled:cursor-not-allowed disabled:opacity-30';
</script>

<section
	class="absolute inset-x-0 bottom-12 z-22 border-t border-t-[#c2aaff]/60 px-4 py-2 border-[#bad0ff]/22 bg-linear-to-br from-[#141d30]/85 to-[#0a0d1b]/80 backdrop-blur-md shadow-[0_10px_28px_rgba(0,0,0,0.4),0_0_24px_rgba(120,160,255,0.08)]"
	aria-label="3D timeline"
>
	<div class="mb-1.5 flex items-center gap-2 text-[0.7rem] uppercase tracking-wider text-[#c2aaff]">
		<Icon name="yorha-timeline" size={14} />
		<span class="font-bold">3D timeline</span>
		{#if loading}<span class="animate-pulse text-[0.65rem] text-yorha-accent">Loading...</span>{/if}
		<span class="ml-auto font-mono text-[#f3d471]" aria-live="off">{formatClock(currentMs)} / {formatClock(durationMs)}</span>
	</div>

	<div class="flex items-center gap-1.5">
		<button type="button" class={iconButton} title="Previous keyframe" aria-label="Previous keyframe" onclick={() => onStep(-1)}>
			<span aria-hidden="true">«</span>
		</button>
		<button
			type="button"
			class="flex size-9 items-center justify-center rounded border border-[#d4b96e] bg-[#3e3650] text-[#fff3c6] transition hover:brightness-125 focus-visible:outline-2 focus-visible:outline-[#8bdfff]"
			aria-label={playing ? 'Pause timeline' : 'Play timeline'}
			onclick={onToggle}
		>
			<span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
		</button>
		<button type="button" class={iconButton} title="Next keyframe" aria-label="Next keyframe" onclick={() => onStep(1)}>
			<span aria-hidden="true">»</span>
		</button>

		<Slider.Root
			type="single"
			min={0}
			max={Math.max(1, durationMs)}
			step={50}
			value={clampSeek(currentMs, durationMs)}
			onValueChange={(value) => onSeek(clampSeek(value, durationMs))}
			aria-label="Timeline position"
			class="relative mx-1 flex h-7 flex-1 touch-none select-none items-center"
		>
			{#snippet children({ thumbItems })}
				<span class="relative h-1.5 w-full overflow-hidden rounded-full bg-[#29344c]">
					<Slider.Range class="absolute h-full bg-linear-to-r from-[#8cb7ff] via-[#b4a0ff] to-[#f3d471] shadow-[0_0_12px_#b4a0ff]" />
				</span>
				{#each thumbItems as thumb (thumb.index)}
					<Slider.Thumb
						index={thumb.index}
						aria-label="Timeline position"
						class="block size-4 rounded-full border-2 border-[#8bdfff] bg-[#f3f3fc] shadow-[0_0_13px_#84dcff] transition focus-visible:outline-2 focus-visible:outline-white hover:bg-white active:scale-110"
					/>
				{/each}
			{/snippet}
		</Slider.Root>

		<ToggleGroup.Root
			type="single"
			value={String(speed)}
			onValueChange={(value) => value && onSpeed(Number(value))}
			aria-label="Playback speed"
			class="flex gap-0.5"
		>
			{#each PLAYBACK_SPEEDS as option (option)}
				<ToggleGroup.Item
					value={String(option)}
					class="rounded-sm border border-[#34435e] bg-[#1b2740] px-1.5 py-0.5 text-[0.55rem] text-[#a7bfdc] transition hover:text-white data-[state=on]:border-[#d4b96e] data-[state=on]:bg-[#3e3650] data-[state=on]:text-[#fff3c6]"
				>
					{option}x
				</ToggleGroup.Item>
			{/each}
		</ToggleGroup.Root>

		<button type="button" class={iconButton} title="Reset" aria-label="Reset timeline" onclick={onReset}>
			<span aria-hidden="true">↺</span>
		</button>
		<button type="button" class={iconButton} title="Regenerate timeline" aria-label="Regenerate timeline" disabled={loading} onclick={onRegenerate}>
			<span aria-hidden="true">⟳</span>
		</button>
	</div>

	{#if durationMs > 0}
		<div class="relative mt-1.5 h-2">
			{#each markers as marker, index (index)}
				<button
					type="button"
					title={marker.label}
					aria-label={marker.label}
					onclick={() => onSeek(marker.timeMs)}
					style:left="{markerPercent(marker.timeMs, durationMs)}%"
					class="absolute h-2 w-1 -translate-x-1/2 border-0 p-0 transition hover:bg-white/50 {index === activeMarker
						? 'bg-[#f3d471] shadow-[0_0_6px_rgba(243,212,113,0.6)]'
						: 'bg-white/20'}"
				></button>
			{/each}
		</div>
	{/if}
</section>
