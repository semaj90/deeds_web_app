<script lang="ts">
	/**
	 * Simplified Cache Warm-Up Control
	 * Minimal version for testing
	 */

	let isRunning = $state(false);
	let message = $state('');
	let selectedDomain = $state('evidence');

	async function runWarmUp() {
		isRunning = true;
		message = 'Starting warm-up...';

		try {
			const response = await fetch('/api/cache/warm-up', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchSize: 5,
					delayMs: 1000,
					domain: selectedDomain,
					dryRun: false,
				}),
			});

			const data = await response.json();

			if (data.success) {
				const { config } = data;
				message = `✅ Warm-up started! Processing ${config.totalQueries} queries in background (~${Math.ceil(config.estimatedDurationSeconds / 60)} minutes). Watch cache stats above for progress.`;
			} else {
				message = `❌ Failed: ${data.error}`;
			}
		} catch (err) {
			message = `❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
		} finally {
			isRunning = false;
		}
	}
</script>

<div class="warm-up-simple" style="padding: 1.5rem; background: #1e293b; border: 1px solid #334155; border-radius: 8px; margin: 1rem 0;">
	<h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem; color: #e2e8f0;">
		Cache Warm-Up (Simple)
	</h3>

	<div style="margin-bottom: 1rem;">
		<label style="display: block; font-size: 0.875rem; color: #94a3b8; margin-bottom: 0.5rem;">
			Domain:
		</label>
		<select
			bind:value={selectedDomain}
			disabled={isRunning}
			style="width: 100%; padding: 0.5rem; background: #0f172a; border: 1px solid #334155; border-radius: 4px; color: #e2e8f0;"
		>
			<option value="evidence">Evidence (20 queries)</option>
			<option value="civil-procedure">Civil Procedure (20 queries)</option>
			<option value="torts">Torts (20 queries)</option>
			<option value="contracts">Contracts (20 queries)</option>
			<option value="criminal">Criminal (20 queries)</option>
			<option value="evidence-analysis">Evidence Analysis (20 queries)</option>
		</select>
	</div>

	<button
		onclick={runWarmUp}
		disabled={isRunning}
		style="width: 100%; padding: 0.75rem; background: {isRunning ? '#475569' : '#3b82f6'}; color: white; border: none; border-radius: 4px; cursor: {isRunning ? 'not-allowed' : 'pointer'}; font-weight: 600;"
	>
		{isRunning ? '⏳ Running...' : '▶️ Start Warm-Up'}
	</button>

	{#if message}
		<div style="margin-top: 1rem; padding: 0.75rem; background: #0f172a; border: 1px solid #334155; border-radius: 4px; color: #e2e8f0; font-size: 0.875rem;">
			{message}
		</div>
	{/if}
</div>

<style>
	select option {
		background: #0f172a;
		color: #e2e8f0;
	}
</style>
