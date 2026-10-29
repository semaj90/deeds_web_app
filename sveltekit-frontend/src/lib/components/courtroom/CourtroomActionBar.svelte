<script lang="ts">
	import { Toolbar } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { ActionButton, ActionId, ActionTone } from '$lib/courtroom/courtroom-hud-v1.js';

	let { buttons, onAction }: { buttons: ActionButton[]; onAction: (id: ActionId) => void } = $props();

	// Full class strings, never built by concatenation: UnoCSS (svelte-scoped) can only extract what it can read.
	const TONE: Record<ActionTone, string> = {
		go: 'bg-[#2d987c]/25 text-[#80f3ce]',
		info: 'bg-[#508fff]/20 text-[#83e1ff]',
		respond: 'bg-[#b4a0ff]/18 text-[#c2aaff]',
		strategy: 'bg-[#8a6ad8]/20 text-[#d6c2ff]',
		objection: 'bg-[#e0583a]/22 text-[#ff9a80]',
		holdit: 'bg-[#f3d471]/16 text-[#f3d471]',
		takethat: 'bg-[#2d987c]/25 text-[#80f3ce]',
		quiet: 'bg-white/3 text-[#a5b6cf]',
		done: 'bg-[#f3d471] text-black'
	};
</script>

<Toolbar.Root
	aria-label="Courtroom actions"
	class="absolute inset-x-0 bottom-0 z-20 flex h-12 items-stretch border-t border-t-[#f3d471]/60 border-[#bad0ff]/22 bg-linear-to-br from-[#141d30]/95 to-[#0a0d1b]/92 backdrop-blur-md shadow-[0_-8px_28px_rgba(0,0,0,0.38),0_0_24px_rgba(120,160,255,0.08)]"
>
	{#each buttons as button (button.id)}
		{#if button.dividerBefore}
			<div class="mx-0.5 my-2 w-px bg-[#bad0ff]/20" role="separator"></div>
		{/if}
		<Toolbar.Button
			disabled={button.disabled}
			onclick={() => onAction(button.id)}
			class="flex min-w-16 flex-col items-center justify-center gap-px !rounded-none !border-0 !bg-transparent !shadow-none px-2.5 font-inherit transition hover:not-disabled:brightness-125 focus-visible:outline-2 focus-visible:outline-yorha-accent disabled:cursor-not-allowed disabled:opacity-35 {TONE[
				button.tone
			]} {button.grow ? 'flex-1' : ''}"
		>
			<span class="flex items-center gap-1">
				{#if button.icon}
					<Icon name={button.icon} size={12} />
				{:else}
					<span class="text-xs font-bold leading-none" aria-hidden="true">{button.glyph}</span>
				{/if}
				{#if button.key}
					<kbd class="rounded-sm border border-white/15 px-1 text-[0.5rem] uppercase leading-snug tracking-wider text-white/40">{button.key}</kbd>
				{/if}
			</span>
			<span class="text-[0.6rem] font-bold uppercase tracking-wider">{button.label}</span>
		</Toolbar.Button>
	{/each}
</Toolbar.Root>
