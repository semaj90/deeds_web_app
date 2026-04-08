<script lang="ts">
	import type { ErrorEvent } from '$lib/server/db/schema/index.js';

	interface Props {
		errors?: ErrorEvent[];
		isLoading?: boolean;
	}

	let { errors = [], isLoading = false }: Props = $props();

	let sortBy = $state<'date' | 'severity' | 'code'>('date');
	let filterSeverity = $state<string | null>(null);
	let searchQuery = $state('');

	let filtered = $derived(
		errors
			.filter((e) => !filterSeverity || e.severity === filterSeverity)
			.filter(
				(e) =>
					!searchQuery ||
					e.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
					e.tsCode?.includes(searchQuery)
			)
			.sort((a, b) => {
				if (sortBy === 'date') {
					return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
				} else if (sortBy === 'severity') {
					const severityOrder = { fatal: 0, error: 1, warn: 2, info: 3 };
					return (
						(severityOrder[a.severity as keyof typeof severityOrder] || 99) -
						(severityOrder[b.severity as keyof typeof severityOrder] || 99)
					);
				} else {
					return (a.tsCode || '').localeCompare(b.tsCode || '');
				}
			})
	);

	const getSeverityIcon = (severity: string) => {
		const icons: Record<string, string> = {
			fatal: '🔴',
			error: '❌',
			warn: '⚠️',
			info: 'ℹ️'
		};
		return icons[severity] || '•';
	};

	const getSeverityColor = (severity: string) => {
		const colors: Record<string, string> = {
			fatal: 'bg-danger text-white',
			error: 'bg-danger/80 text-white',
			warn: 'bg-warning text-black',
			info: 'bg-info text-white'
		};
		return colors[severity] || 'bg-sand/20 text-sand';
	};
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold text-sand">Error Events</h3>
		<span class="text-sm text-sand/60">{filtered.length} / {errors.length} errors</span>
	</div>

	{#if isLoading}
		<div class="py-8 text-center">
			<p class="text-sand/60">Loading error events...</p>
		</div>
	{:else if errors.length === 0}
		<div class="rounded-lg border-2 border-dashed border-accent/30 bg-accent/10 p-4 text-center">
			<p class="text-accent">No errors found for this route</p>
		</div>
	{:else}
		<div class="space-y-3">
			<input
				type="text"
				placeholder="Search by message or error code..."
				bind:value={searchQuery}
				class="w-full rounded-lg border-2 border-sand/20 bg-panel px-4 py-2 text-sm text-sand placeholder-sand/40 transition focus:border-accent focus:outline-none"
			/>

			<div class="flex flex-wrap gap-3">
				<select
					bind:value={sortBy}
					class="rounded-lg border-2 border-sand/20 bg-panel px-3 py-2 text-sm text-sand focus:border-accent focus:outline-none"
				>
					<option value="date">Sort by Date</option>
					<option value="severity">Sort by Severity</option>
					<option value="code">Sort by Code</option>
				</select>

				<select
					bind:value={filterSeverity}
					class="rounded-lg border-2 border-sand/20 bg-panel px-3 py-2 text-sm text-sand focus:border-accent focus:outline-none"
				>
					<option value={null}>All Severities</option>
					<option value="fatal">Fatal</option>
					<option value="error">Error</option>
					<option value="warn">Warning</option>
					<option value="info">Info</option>
				</select>
			</div>
		</div>

		<div class="max-h-[600px] space-y-2 overflow-y-auto">
			{#each filtered as error (error.id)}
				<div
					class="rounded-lg border-2 border-sand/20 bg-panel p-3 transition hover:border-sand/40"
				>
					<div class="flex items-start gap-3">
						<span class="mt-0.5 text-xl">{getSeverityIcon(error.severity)}</span>

						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								{#if error.tsCode}
									<span class="rounded bg-sand/10 px-2 py-1 font-mono text-xs text-sand"
										>{error.tsCode}</span
									>
								{/if}
								<span
									class="rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider {getSeverityColor(
										error.severity
									)}"
								>
									{error.severity.toUpperCase()}
								</span>
							</div>

							<p class="mt-1 break-words text-sm text-sand/80">{error.message}</p>

							<div class="mt-2 flex items-center gap-4 text-xs text-sand/40">
								<span class="truncate font-mono">{error.filePath}</span>
								{#if error.clusterId}
									<span class="rounded bg-info/20 px-2 py-1 text-info">{error.clusterId}</span>
								{/if}
							</div>

							<p class="mt-2 text-xs text-sand/30">
								{new Date(error.createdAt).toLocaleString()}
							</p>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>