<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { LayoutData } from './$types';
	import ErrorBoundary from '$lib/components/ui/ErrorBoundary.svelte';
	import { authStore } from '$lib/stores/auth-store.svelte.js';

	interface Props {
		data: LayoutData;
		children?: import('svelte').Snippet;
	}

	let { data, children }: Props = $props();

	// Hydrate auth from server data
	$effect(() => {
		if (data.user) {
			authStore.session = {
				user: data.user as import('$lib/stores/auth-store.svelte').AuthUser,
				session: { id: 'server-hydrated', expiresAt: '' }
			};
		} else {
			authStore.session = null;
		}
	});

	// Keyboard shortcuts for analysis workspace
	function handleGlobalKeydown(e: KeyboardEvent) {
		// ESC to close/return
		if (e.key === 'Escape' && !e.ctrlKey && !e.altKey) {
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(e.target as HTMLElement)?.isContentEditable) {
				// Go back to evidence page
				window.history.back();
			}
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<!-- Full-screen analysis workspace (no site chrome) -->
<div class="analysis-workspace">
	<ErrorBoundary showDetails={data.devBypass}>
		{@render children?.()}
	</ErrorBoundary>
</div>

<style>
	.analysis-workspace {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: var(--t-bg);
		color: var(--t-text);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	/* Remove any default margins/padding */
	:global(body:has(.analysis-workspace)) {
		margin: 0;
		padding: 0;
		overflow: hidden;
	}
</style>