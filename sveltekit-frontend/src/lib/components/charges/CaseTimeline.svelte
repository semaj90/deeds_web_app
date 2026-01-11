<!-- @migration-task Error while migrating Svelte code: Declaration cannot be empty
https://svelte.dev/e/css_empty_declaration -->
<!-- @migration-task Error while migrating Svelte code: Declaration cannot be empty
https://svelte.dev/e/css_empty_declaration -->
<!-- @migration-task Error while migrating Svelte code: Declaration cannot be empty
https://svelte.dev/e/css_empty_declaration -->
<!-- @migration-task Error while migrating Svelte code: Declaration cannot be empty
https://svelte.dev/e/css_empty_declaration -->
<script lang="ts">
	import { onMount } from 'svelte';

	let { caseId = '' } = $props<{
		caseId?: string;
	}>();

	interface TimelineEvent {
		id: string; actionType: string;
		description: string; time: string;
		payload: any; createdAt: string;
	}

	let events: TimelineEvent[] = [];
	let isLoading = false;
	let error = '';

	onMount(() => {
		loadTimeline();
		// Refresh timeline every 5 seconds
		const interval = setInterval(loadTimeline, 5000);
		return () => clearInterval(interval);
	});

	async function loadTimeline() {
		if (!caseId) return;

		isLoading = true;
		try {
			const response = await fetch(`/api/cases/${ caseId }/timeline`);
			if (response.ok) {
				const data = await response.json();
				events = data.events || [];
				error = '';
			} else {
				error = 'Failed to load timeline';
			}
		} catch (err) {
			console.error('Error loading timeline:', err);
			error = 'Error loading timeline';
		} finally {
			isLoading = false;
		}
	}

	function getActionIcon(actionType: string): string {
		const icons: Record<string, string> = {
			charge_added: '📎',
			charge_suggested: '🚔',
			bundle_viewed: '👁️',
			default: '📝'
		};
		return icons[actionType] || icons.default;
	}

	function getActionColor(actionType: string): string {
		const colors: Record<string, string> = {
			charge_added: 'border-red-700 bg-red-950',
			charge_suggested: 'border-orange-700 bg-orange-950',
			bundle_viewed: 'border-blue-700 bg-blue-950',
			default: 'border-gray-700 bg-gray-900'
		};
		return colors[actionType] || colors.default;
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-xl font-bold text-white">🕒 Case Timeline</h3>
		<button
			onclick={loadTimeline}
			disabled={isLoading}
			class="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition disabled:opacity-50"
		>
			{isLoading ? '⟳ Refreshing...' : '🔄 Refresh'}
		</button>
	</div>

	{#if error}
		<div class="bg-red-900 text-red-100 p-3 rounded border border-red-700">
			{error}
		</div>
	{/if}

	{#if events.length === 0}
		<div class="bg-gray-800 text-gray-400 p-6 rounded border border-gray-700 text-center">
			No timeline events yet. Start adding charges!
		</div>
	{:else}
		<div class="space-y-3">
			{#each events as event (event.id)}
				<div class={`p-4 rounded border-2 ${getActionColor(event.actionType)}`}>
					<div class="flex items-start gap-3">
						<span class="text-2xl">{getActionIcon(event.actionType)}</span>
						<div class="flex-1 min-w-0">
							<p class="text-gray-100 font-semibold">{event.description}</p>
							<p class="text-xs text-gray-400 mt-1">{event.time}</p>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	:global(.timeline-container) {
		max-height: 500px;
		overflow-y-auto;
	}
</style>



