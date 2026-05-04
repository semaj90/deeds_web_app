<script lang="ts">
	import type { ErrorSuggestion } from '$lib/server/db/schema/index.js';

	interface Props {
		suggestions?: ErrorSuggestion[];
		isLoading?: boolean;
	}

	let { suggestions = [], isLoading = false }: Props = $props();

	let filterRisk = $state<string | null>(null);
	let filterApplied = $state<string | null>(null);
	let selectedId = $state<string | null>(null);

	let filtered = $derived(
		suggestions
			.filter((s) => !filterRisk || s.riskLevel === filterRisk)
			.filter(
				(s) => filterApplied === null || (filterApplied === 'true' ? s.applied : !s.applied)
			)
	);

	const getRiskIcon = (risk: string) => {
		const icons: Record<string, string> = { low: '🟢', medium: '🟡', high: '🔴' };
		return icons[risk] || '•';
	};

	const getRiskColor = (risk: string) => {
		const colors: Record<string, string> = {
			low: 'border-accent/40 bg-accent/10 text-accent',
			medium: 'border-warning/40 bg-warning/10 text-warning',
			high: 'border-danger/40 bg-danger/10 text-danger'
		};
		return colors[risk] || 'border-sand/20 bg-panel text-sand';
	};

	async function applySuggestion(id: string) {
		try {
			const response = await fetch('/api/error-brain/apply-fix', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ suggestionId: id }),
			});
			if (response.ok) window.location.reload();
		} catch (err) {
			console.error('Failed to apply suggestion:', err);
		}
	}

	async function dismissSuggestion(id: string) {
		try {
			const response = await fetch(`/api/error-brain/suggestions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
			if (response.ok) window.location.reload();
		} catch (err) {
			console.error('Failed to dismiss suggestion:', err);
		}
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold text-sand">Fix Suggestions</h3>
		<span class="text-sm text-sand/60">{filtered.length} / {suggestions.length} suggestions</span>
	</div>

	{#if isLoading}
		<div class="py-8 text-center">
			<p class="text-sand/60">Loading suggestions...</p>
		</div>
	{:else if suggestions.length === 0}
		<div class="rounded-lg border-2 border-dashed border-info/30 bg-info/10 p-4 text-center">
			<p class="text-info">No suggestions generated yet</p>
		</div>
	{:else}
		<div class="flex flex-wrap gap-3">
			<select
				bind:value={filterRisk}
				class="rounded-lg border-2 border-sand/20 bg-panel px-3 py-2 text-sm text-sand focus:border-accent focus:outline-none"
			>
				<option value={null}>All Risk Levels</option>
				<option value="low">Low Risk</option>
				<option value="medium">Medium Risk</option>
				<option value="high">High Risk</option>
			</select>

			<select
				bind:value={filterApplied}
				class="rounded-lg border-2 border-sand/20 bg-panel px-3 py-2 text-sm text-sand focus:border-accent focus:outline-none"
			>
				<option value={null}>All Status</option>
				<option value="true">Applied</option>
				<option value="false">Pending</option>
			</select>
		</div>

		<div class="space-y-3">
			{#each filtered as suggestion (suggestion.id)}
				<div role="button" tabindex="0"
					class="w-full cursor-pointer rounded-lg border-2 p-4 text-left transition hover:shadow-md {getRiskColor(
						suggestion.riskLevel
					)}"
					onclick={() =>
						(selectedId = selectedId === suggestion.id ? null : suggestion.id)}
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectedId = selectedId === suggestion.id ? null : suggestion.id; } }}
				>
					<div class="flex items-start justify-between gap-3">
						<div class="flex-1">
							<div class="flex items-center gap-2">
								<span class="text-xl">{getRiskIcon(suggestion.riskLevel)}</span>
								<span class="text-sm font-semibold">{suggestion.summary}</span>
								{#if suggestion.applied}
									<span
										class="rounded bg-accent/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-accent"
										>Applied</span
									>
								{/if}
							</div>
						</div>
						<div class="whitespace-nowrap text-xs text-sand/40">
							{new Date(suggestion.createdAt).toLocaleDateString()}
						</div>
					</div>

					{#if selectedId === suggestion.id}
						<div class="mt-4 space-y-3 border-t border-sand/20 pt-4">
							{#if suggestion.patch}
								<div>
									<p class="mb-2 text-xs font-semibold text-sand/60">Suggested Fix:</p>
									<pre
										class="overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-sand/80"><code
											>{suggestion.patch}</code
										></pre>
								</div>
							{/if}

							<div class="flex gap-2 pt-2">
								{#if !suggestion.applied}
									<button
										onclick={(e) => {
											e.stopPropagation();
											applySuggestion(suggestion.id);
										}}
										class="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-accentSoft"
									>
										Apply Fix
									</button>
									<button
										onclick={(e) => {
											e.stopPropagation();
											dismissSuggestion(suggestion.id);
										}}
										class="rounded bg-sand/20 px-3 py-1.5 text-xs font-semibold text-sand transition hover:bg-sand/30"
									>
										Dismiss
									</button>
								{/if}
							</div>

							{#if suggestion.applied}
								<div class="text-xs text-sand/40">
									Applied
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>