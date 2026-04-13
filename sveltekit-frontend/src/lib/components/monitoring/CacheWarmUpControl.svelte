<script lang="ts">
	/**
	 * Cache Warm-Up Control Component
	 *
	 * Provides UI controls to trigger cache warm-up with common legal queries.
	 * Can be embedded in cache-monitor page or system-configuration.
	 */

	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface WarmUpReport {
		totalQueries: number;
		successful: number;
		failed: number;
		skipped: number;
		errors: Array<{ query: string; error: string }>;
		durationMs: number;
		model: string;
	}

	let isRunning = $state(false);
	let report = $state<WarmUpReport | null>(null);
	let error = $state<string | null>(null);
	let selectedDomain = $state<string>('all');
	let batchSize = $state(5);
	let delayMs = $state(1000);
	let dryRun = $state(false);

	const domains = [
		{ value: 'all', label: 'All Domains (100 queries)' },
		{ value: 'evidence', label: 'Evidence Law (20 queries)' },
		{ value: 'civil-procedure', label: 'Civil Procedure (20 queries)' },
		{ value: 'torts', label: 'Torts (20 queries)' },
		{ value: 'contracts', label: 'Contracts (20 queries)' },
		{ value: 'criminal', label: 'Criminal Law (20 queries)' },
	];

	async function runWarmUp() {
		isRunning = true;
		error = null;
		report = null;

		try {
			const response = await fetch('/api/cache/warm-up', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchSize,
					delayMs,
					domain: selectedDomain === 'all' ? undefined : selectedDomain,
					dryRun,
				}),
			});

			const data = await response.json();

			if (data.success) {
				report = data.report;
			} else {
				error = data.error || 'Warm-up failed';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Network error';
		} finally {
			isRunning = false;
		}
	}

	function resetReport() {
		report = null;
		error = null;
	}

	// Format duration as seconds
	function formatDuration(ms: number): string {
		return (ms / 1000).toFixed(1) + 's';
	}

	// Calculate success rate percentage
	function getSuccessRate(rep: WarmUpReport): string {
		if (rep.totalQueries === 0) return '0.0';
		return ((rep.successful / rep.totalQueries) * 100).toFixed(1);
	}
</script>

<div class="warm-up-control bg-panel border border-sand-6 rounded-lg p-4 space-y-4">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Icon name="zap" size={20} class="text-accent" />
			<h3 class="text-lg font-semibold">Cache Warm-Up</h3>
		</div>
		{#if report}
			<button onclick={resetReport} class="text-xs text-sand-11 hover:text-sand-12">
				<Icon name="x" size={14} class="inline" /> Clear
			</button>
		{/if}
	</div>

	{#if !report && !error}
		<!-- Configuration Form -->
		<div class="space-y-3">
			<!-- Domain Selection -->
			<div>
				<label class="text-xs font-medium text-sand-11 block mb-1">Domain</label>
				<select
					bind:value={selectedDomain}
					disabled={isRunning}
					class="w-full bg-sand-2 border border-sand-6 rounded px-3 py-2 text-sm"
				>
					{#each domains as domain}
						<option value={domain.value}>{domain.label}</option>
					{/each}
				</select>
			</div>

			<!-- Advanced Options -->
			<details class="text-sm">
				<summary class="cursor-pointer text-sand-11 hover:text-sand-12 select-none">
					Advanced Options
				</summary>
				<div class="mt-2 space-y-2 pl-4 border-l-2 border-sand-5">
					<div class="grid grid-cols-2 gap-2">
						<div>
							<label class="text-xs text-sand-11">Batch Size</label>
							<input
								type="number"
								bind:value={batchSize}
								min="1"
								max="20"
								disabled={isRunning}
								class="w-full bg-sand-2 border border-sand-6 rounded px-2 py-1 text-xs"
							/>
						</div>
						<div>
							<label class="text-xs text-sand-11">Delay (ms)</label>
							<input
								type="number"
								bind:value={delayMs}
								min="0"
								max="5000"
								step="100"
								disabled={isRunning}
								class="w-full bg-sand-2 border border-sand-6 rounded px-2 py-1 text-xs"
							/>
						</div>
					</div>
					<label class="flex items-center gap-2 text-xs text-sand-11">
						<input type="checkbox" bind:checked={dryRun} disabled={isRunning} />
						Dry Run (log queries without calling LLM)
					</label>
				</div>
			</details>

			<!-- Warning -->
			<div class="bg-yellow-50 border border-yellow-200 rounded p-3 text-xs">
				<div class="flex items-start gap-2">
					<Icon name="alert-triangle" size={14} class="text-yellow-600 mt-0.5" />
					<div class="flex-1 text-yellow-800">
						<p class="font-semibold mb-1">Note:</p>
						<p>
							Warm-up will generate {selectedDomain === 'all' ? '100' : '20'} LLM
							responses. This may take several minutes and will consume GPU resources.
						</p>
					</div>
				</div>
			</div>

			<!-- Run Button -->
			<Button
				onclick={runWarmUp}
				disabled={isRunning}
				variant="primary"
				class="w-full flex items-center justify-center gap-2"
			>
				{#if isRunning}
					<Icon name="loader-2" size={16} class="animate-spin" />
					Running Warm-Up...
				{:else}
					<Icon name="play" size={16} />
					Start Warm-Up
				{/if}
			</Button>
		</div>
	{:else if error}
		<!-- Error State -->
		<div class="bg-red-50 border border-red-200 rounded p-3">
			<div class="flex items-start gap-2">
				<Icon name="alert-circle" size={16} class="text-red-600 mt-0.5" />
				<div class="flex-1">
					<p class="font-semibold text-red-900 text-sm">Warm-Up Failed</p>
					<p class="text-red-800 text-xs mt-1">{error}</p>
				</div>
			</div>
		</div>
	{:else if report}
		<!-- Success State -->
		<div class="space-y-3">
			<!-- Success Banner -->
			<div
				class="rounded p-3 {report.failed === 0
					? 'bg-green-50 border border-green-200'
					: 'bg-yellow-50 border border-yellow-200'}"
			>
				<div class="flex items-start gap-2">
					<Icon
						name={report.failed === 0 ? 'check-circle' : 'alert-triangle'}
						size={16}
						class="{report.failed === 0 ? 'text-green-600' : 'text-yellow-600'} mt-0.5"
					/>
					<div class="flex-1">
						<p
							class="font-semibold {report.failed === 0 ? 'text-green-900' : 'text-yellow-900'} text-sm"
						>
							{report.failed === 0 ? 'Warm-Up Completed Successfully' : 'Warm-Up Completed with Errors'}
						</p>
						<p
							class="text-xs {report.failed === 0 ? 'text-green-800' : 'text-yellow-800'} mt-1"
						>
							{report.successful} of {report.totalQueries} queries cached successfully
							({getSuccessRate(report)}%)
						</p>
					</div>
				</div>
			</div>

			<!-- Stats Grid -->
			<div class="grid grid-cols-3 gap-2">
				<div class="bg-panelSoft rounded p-2 border border-sand-5">
					<div class="text-xs text-sand-11">Successful</div>
					<div class="text-lg font-bold text-green-600">{report.successful}</div>
				</div>
				<div class="bg-panelSoft rounded p-2 border border-sand-5">
					<div class="text-xs text-sand-11">Failed</div>
					<div class="text-lg font-bold {report.failed > 0 ? 'text-red-600' : 'text-sand-11'}">
						{report.failed}
					</div>
				</div>
				<div class="bg-panelSoft rounded p-2 border border-sand-5">
					<div class="text-xs text-sand-11">Duration</div>
					<div class="text-lg font-bold text-blue-600">{formatDuration(report.durationMs)}</div>
				</div>
			</div>

			<!-- Additional Info -->
			<div class="text-xs text-sand-11 space-y-1">
				<div class="flex justify-between">
					<span>Average per query:</span>
					<span class="font-medium text-sand-12"
						>{(report.durationMs / (report.totalQueries || 1)).toFixed(0)}ms</span
					>
				</div>
				<div class="flex justify-between">
					<span>Model:</span>
					<span class="font-medium text-sand-12">{report.model}</span>
				</div>
				{#if report.skipped > 0}
					<div class="flex justify-between">
						<span>Skipped (dry run):</span>
						<span class="font-medium text-sand-12">{report.skipped}</span>
					</div>
				{/if}
			</div>

			<!-- Errors (if any) -->
			{#if report.errors.length > 0}
				<details class="text-xs">
					<summary class="cursor-pointer text-red-600 hover:text-red-700 select-none">
						View Errors ({report.errors.length})
					</summary>
					<div class="mt-2 max-h-40 overflow-y-auto space-y-1 pl-4 border-l-2 border-red-300">
						{#each report.errors.slice(0, 10) as err}
							<div class="text-xs">
								<div class="font-medium text-red-900">"{err.query.slice(0, 50)}..."</div>
								<div class="text-red-700 ml-2">{err.error}</div>
							</div>
						{/each}
						{#if report.errors.length > 10}
							<div class="text-red-700 italic">... and {report.errors.length - 10} more errors</div>
						{/if}
					</div>
				</details>
			{/if}
		</div>
	{/if}
</div>

<style>
	.warm-up-control {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	select,
	input[type='number'] {
		appearance: none;
		color: var(--sand-12);
	}

	input[type='checkbox'] {
		width: 1rem;
		height: 1rem;
		cursor: pointer;
	}

	details summary::marker {
		color: var(--sand-11);
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
