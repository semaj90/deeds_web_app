<!-- @migration-task Error while migrating Svelte code: Declaration cannot be empty
https, //svelte.dev/e/css_empty_declaration -->
<!-- @migration-task Error while migrating Svelte code: Declaration cannot be empty
https, //svelte.dev/e/css_empty_declaration -->
<!-- @migration-task Error while migrating Svelte code: Declaration cannot be empty
https, //svelte.dev/e/css_empty_declaration -->
<!-- @migration-task Error while migrating Svelte code: Declaration cannot be empty
https, //svelte.dev/e/css_empty_declaration -->
<script lang="ts">
	// Migrated to $effect

	let { caseId = '' }: {
		caseId?: string;
	} = $props();

	interface TimelineEvent { id: string, actionType: string;
		description: string;
	time: string;
		payload: any;
	createdAt: string;
	}

	let events: TimelineEvent[] = $state([]);
	let isLoading = $state(false);
	let error = $state('');

	$effect(() => {

		loadTimeline();
		// Refresh timeline every 5 seconds
		const interval = setInterval(loadTimeline, 5000);
		return () => clearInterval(interval);
	
});

	async function loadTimeline() {
		if (!caseId) return;

		isLoading = true;
		try {
			const response = await fetch(`/api/cases/${caseId}/timeline`);
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
			charge_added: 'border-danger/60 bg-danger/10',
			charge_suggested: 'border-warning/60 bg-warning/10',
			bundle_viewed: 'border-info/60 bg-info/10',
			default: 'border-sand/20 bg-panel'
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
			class="px-3 py-1 text-sm bg-panelSoft hover:bg-sand/20 text-sand/40 rounded transition disabled:opacity-50"
		>
			{isLoading ? '⟳ Refreshing...' : '🔄 Refresh'}
		</button>
	</div>

	{#if error}
		<div class="bg-danger/20 text-danger/20 p-3 rounded border border-danger/60">
			{error}
		</div>
	{/if}

	{#if events.length === 0}
		<div class="bg-panelSoft text-sand/40 p-6 rounded border border-sand/20 text-center">
			No timeline events yet. Start adding charges!
		</div>
	{:else}
		<div class="space-y-3">
			{#each events as event (event.id)}
				<div class={`p-4 rounded border-2 ${getActionColor(event.actionType)}`}>
					<div class="flex items-start gap-3">
						<span class="text-2xl">{getActionIcon(event.actionType)}</span>
						<div class="flex-1 min-w-0">
							<p class="text-sand/20 font-semibold">{event.description}</p>
							<p class="text-xs text-sand/40 mt-1">{event.time}</p>
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
		overflow-y: auto;
	}
</style>



