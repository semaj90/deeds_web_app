<script lang="ts">
	import { onMount } from 'svelte';
	import { buildAssistantMessage, type CaseBrief } from '$lib/courtroom/loading-hints-v1.js';

	let { progress, brief = null }: { progress: number; brief?: CaseBrief | null } = $props();

	let tick = $state(0);
	const message = $derived(buildAssistantMessage({ progress, brief, tick }));

	onMount(() => {
		const id = setInterval(() => (tick += 1), 6000);
		return () => clearInterval(id);
	});
</script>

<aside class="assistant" role="status" aria-live="polite">
	<div class="portrait" aria-hidden="true">?!</div>
	<div class="bubble">
		<p class="headline">{message.headline}</p>
		<p class="tip"><strong>Tip:</strong> {message.tip}</p>
		<div class="bar" aria-hidden="true"><span style:width="{Math.min(100, Math.max(0, progress))}%"></span></div>
	</div>
</aside>

<style>
	.assistant { position: absolute; left: 50%; bottom: 120px; transform: translateX(-50%); display: flex; gap: 0.75rem; align-items: flex-end; max-width: min(560px, calc(100% - 2rem)); z-index: 30; pointer-events: none; }
	.portrait { flex: none; width: 48px; height: 48px; display: grid; place-items: center; font-weight: 800; color: #111; background: var(--t-accent, #f5c542); border: 2px solid #000; border-radius: 4px; }
	.bubble { background: rgba(0, 0, 0, 0.92); border: 2px solid rgba(255, 255, 255, 0.85); border-radius: 4px; padding: 0.6rem 0.8rem; color: #fff; font-size: 0.8rem; line-height: 1.35; }
	p { margin: 0 0 0.35rem; }
	.tip { color: #ddd; }
	.bar { height: 4px; background: rgba(255, 255, 255, 0.15); }
	.bar span { display: block; height: 100%; background: var(--t-accent, #f5c542); transition: width 0.3s; }
</style>
