<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getContext } from 'svelte';
	import { fly } from 'svelte/transition';
	import DrawerOverlay from './DrawerOverlay.svelte';
	import type { DrawerContentProps, DrawerContext } from './types';

	interface Props extends DrawerContentProps {
		children?: Snippet;
	}

	let {
		class: className = '',
		children,
	}: Props = $props();

	const drawerContext = getContext<DrawerContext>('drawer');

	const flyParams = $derived.by(() => {
		switch (drawerContext?.side) {
			case 'left': return { x: -300, duration: 200 };
			case 'right': return { x: 300, duration: 200 };
			case 'top': return { y: -300, duration: 200 };
			case 'bottom': return { y: 300, duration: 200 };
			default: return { x: 300, duration: 200 };
		}
	});

	const sideClass = $derived.by(() => {
		switch (drawerContext?.side) {
			case 'left': return 'drawer-left';
			case 'top': return 'drawer-top';
			case 'bottom': return 'drawer-bottom';
			default: return 'drawer-right';
		}
	});
</script>

{#if drawerContext?.open}
	<DrawerOverlay />
	<div
		transition:fly={flyParams}
		role="dialog"
		aria-modal="true"
		class="drawer-content {sideClass} {className}"
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}

<style>
	.drawer-content {
		position: fixed;
		z-index: 50;
		gap: 1rem;
		padding: 1.5rem;
		overflow: hidden;
		background: linear-gradient(180deg, rgba(19, 27, 42, 0.96) 0%, rgba(8, 12, 20, 0.98) 100%);
		border: 1px solid var(--shell-border, rgba(120, 160, 220, 0.18));
		box-shadow:
			0 0 0 1px rgba(126, 231, 255, 0.04),
			0 28px 56px -18px rgba(0, 0, 0, 0.72),
			0 0 72px rgba(0, 0, 0, 0.36),
			inset 0 1px 0 rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(20px) saturate(1.18);
		color: var(--shell-text, rgba(233, 240, 255, 0.88));
	}

	.drawer-content::before {
		content: '';
		position: absolute;
		inset: 0 1.25rem auto;
		height: 1px;
		background: linear-gradient(90deg, transparent, rgba(126, 231, 255, 0.82), rgba(255, 212, 121, 0.6), transparent);
		pointer-events: none;
	}

	.drawer-content::after {
		content: '';
		position: absolute;
		inset: 1px;
		border: 1px solid rgba(255, 255, 255, 0.04);
		pointer-events: none;
	}

	.drawer-right {
		inset: 0 0 0 auto;
		height: 100%;
		width: 75%;
		max-width: 24rem;
		border-radius: 28px 0 0 24px / 34px 0 0 26px;
		border-right: none;
	}

	.drawer-left {
		inset: 0 auto 0 0;
		height: 100%;
		width: 75%;
		max-width: 24rem;
		border-radius: 0 28px 24px 0 / 0 34px 26px 0;
		border-left: none;
	}

	.drawer-top {
		inset: 0 0 auto 0;
		height: auto;
		border-radius: 0 0 28px 28px / 0 0 30px 30px;
		border-top: none;
	}

	.drawer-bottom {
		inset: auto 0 0 0;
		height: auto;
		border-radius: 28px 28px 0 0 / 30px 30px 0 0;
		border-bottom: none;
	}

	.drawer-right::after {
		border-radius: 26px 0 0 22px / 32px 0 0 24px;
	}

	.drawer-left::after {
		border-radius: 0 26px 22px 0 / 0 32px 24px 0;
	}

	.drawer-top::after {
		border-radius: 0 0 26px 26px / 0 0 28px 28px;
	}

	.drawer-bottom::after {
		border-radius: 26px 26px 0 0 / 28px 28px 0 0;
	}
</style>