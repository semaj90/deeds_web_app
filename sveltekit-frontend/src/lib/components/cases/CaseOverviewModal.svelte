<script lang="ts">
	import { onMount } from 'svelte';
	import CaseOverview from './CaseOverview.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { fade, scale } from 'svelte/transition';

	let { id, onClose = () => {} } = $props<{ id: string; onClose?: () => void }>();

	let data = $state<any>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			const res = await fetch(`/api/cases/${id}/overview`);
			if (!res.ok) {
				const err = await res.json().catch(() => ({ error: 'Failed to fetch case data' }));
				error = err.error || 'Failed to fetch case data';
				return;
			}
			data = await res.json();
		} catch (err) {
			error = 'Network error';
		} finally {
			loading = false;
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
	class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
	onclick={onClose}
	transition:fade={{ duration: 200 }}
>
	<!-- Modal Container -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div 
		class="relative w-full max-w-5xl h-[90vh] bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
		onclick={(e) => e.stopPropagation()}
		transition:scale={{ duration: 250, start: 0.95, opacity: 0 }}
	>
		{#if loading}
			<div class="flex-1 flex flex-col items-center justify-center gap-4 text-neutral-400">
				<div class="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500/20 border-t-emerald-500"></div>
				<p class="text-sm font-medium animate-pulse">Hydrating legal data...</p>
			</div>
		{:else if error}
			<div class="flex-1 flex flex-col items-center justify-center gap-4 text-rose-400 p-8 text-center">
				<Icon name="circle-alert" size={48} />
				<div>
					<h3 class="font-semibold text-lg">Failed to load case</h3>
					<p class="text-sm opacity-80 mt-1">{error}</p>
				</div>
				<button 
					onclick={onClose}
					class="mt-4 px-6 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors text-white text-sm font-medium"
				>
					Close
				</button>
			</div>
		{:else if data}
			<CaseOverview {data} isModal={true} {onClose} />
		{/if}

		<!-- Close Button (Absolute positioned for easy access) -->
		<button 
			onclick={onClose}
			class="absolute top-4 right-6 p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-full transition-all z-[110]"
			aria-label="Close modal"
		>
			<Icon name="x" size={20} />
		</button>
	</div>
</div>
