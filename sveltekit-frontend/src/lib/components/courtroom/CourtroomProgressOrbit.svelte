<script lang="ts">
	let { progress, phase, tick }: { progress: number; phase: string; tick: number | null } = $props();
	let boundedProgress = $derived(Math.min(100, Math.max(0, Number.isFinite(progress) ? progress : 0)));
</script>

<section class="progress-orbit" aria-label="Story progression">
	<div
		class="orbit"
		style={`--story-progress: ${boundedProgress}%`}
		role="progressbar"
		aria-label="Story progress"
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={Math.round(boundedProgress)}
	>
		<span class="orbit-core" aria-hidden="true"></span>
		<span class="orbit-node node-one" aria-hidden="true"></span>
		<span class="orbit-node node-two" aria-hidden="true"></span>
		<span class="orbit-node node-three" aria-hidden="true"></span>
	</div>
	<div class="progress-copy">
		<span class="eyebrow">STORY PATH · {Math.round(boundedProgress)}%</span>
		<strong>{phase || 'Awaiting story'}</strong>
		{#if tick !== null}<span class="tick">TICK {tick}</span>{/if}
		<div
			class="story-track"
			role="progressbar"
			aria-label="Story progression"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(boundedProgress)}
		>
			<span style={`width: ${boundedProgress}%`}></span>
		</div>
	</div>
</section>

<style>
	.progress-orbit {
		position: absolute;
		top: 58px;
		right: 12px;
		z-index: 12;
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 190px;
		padding: 9px 11px;
		border: 1px solid rgba(190, 208, 255, 0.2);
		border-radius: 3px;
		background: linear-gradient(110deg, rgba(11, 16, 29, 0.92), rgba(28, 31, 50, 0.78));
		box-shadow: inset 0 0 18px rgba(112, 184, 255, 0.06), 0 6px 24px rgba(0, 0, 0, 0.28);
		backdrop-filter: blur(12px);
		color: #e7edf8;
	}
	.orbit {
		position: relative;
		flex: 0 0 34px;
		width: 34px;
		aspect-ratio: 1;
		border: 1px solid rgba(157, 186, 255, 0.28);
		border-radius: 50%;
		background: conic-gradient(from -90deg, #8bdfff var(--story-progress), rgba(165, 182, 207, 0.16) 0);
		box-shadow: 0 0 12px rgba(139, 223, 255, 0.18);
	}
	.orbit::before {
		position: absolute;
		inset: 4px;
		border: 1px solid rgba(194, 170, 255, 0.42);
		border-radius: 50%;
		content: '';
	}
	.orbit-core { position: absolute; inset: 13px; border-radius: 50%; background: #f3d471; box-shadow: 0 0 8px #f3d471; }
	.orbit-node { position: absolute; z-index: 1; width: 4px; height: 4px; border-radius: 50%; background: #b4a0ff; box-shadow: 0 0 5px #b4a0ff; }
	.node-one { top: 1px; left: 14px; }
	.node-two { right: 1px; bottom: 8px; background: #8bdfff; box-shadow: 0 0 5px #8bdfff; }
	.node-three { bottom: 3px; left: 7px; background: #f3d471; box-shadow: 0 0 5px #f3d471; }
	.progress-copy { display: grid; min-width: 0; flex: 1; gap: 3px; }
	.eyebrow, .tick { color: #a9bed9; font: 600 8px/1.2 ui-monospace, monospace; letter-spacing: 0.1em; }
	.eyebrow { color: #f3d471; }
	.progress-copy strong { overflow: hidden; color: #e8e5f5; font-size: 10px; font-weight: 600; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
	.story-track { height: 4px; overflow: hidden; border: 1px solid rgba(139, 223, 255, 0.28); background: rgba(165, 182, 207, 0.12); }
	.story-track span { display: block; height: 100%; background: linear-gradient(90deg, #8bdfff, #b4a0ff 68%, #f3d471); box-shadow: 0 0 9px rgba(139, 223, 255, 0.62); transition: width 240ms ease; }
	@media (max-width: 640px) { .progress-orbit { top: 52px; right: 8px; min-width: 0; padding: 5px 7px; } .orbit { flex-basis: 28px; width: 28px; } .orbit-core { inset: 11px; } .progress-copy strong { max-width: 110px; } }
	@media (prefers-reduced-motion: reduce) { .progress-orbit, .orbit { scroll-behavior: auto; } }
</style>
