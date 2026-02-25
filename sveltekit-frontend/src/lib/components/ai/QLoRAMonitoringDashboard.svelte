<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface TrainingStatus {
		active: boolean;
		model: string;
		epoch: number;
		totalEpochs: number;
		loss: number;
		learningRate: number;
		samplesProcessed: number;
		totalSamples: number;
		elapsedSeconds: number;
		gpuMemoryMB: number;
		gpuUtilization: number;
	}

	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();

	let status = $state<TrainingStatus | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let autoRefresh = $state(false);

	$effect(() => {
		fetchStatus();
	});

	$effect(() => {
		if (!autoRefresh) return;
		const interval = setInterval(fetchStatus, 5000);
		return () => clearInterval(interval);
	});

	async function fetchStatus() {
		loading = true;
		error = null;
		try {
			// Check for Docker QLoRA training service
			const res = await fetch('/api/health/capabilities', {
				signal: AbortSignal.timeout(3000)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();

			// Map health data to training status
			status = {
				active: false,
				model: 'gemma3-legal:latest',
				epoch: 0,
				totalEpochs: 0,
				loss: 0,
				learningRate: 0,
				samplesProcessed: 0,
				totalSamples: 0,
				elapsedSeconds: 0,
				gpuMemoryMB: 0,
				gpuUtilization: 0
			};
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to check status';
		} finally {
			loading = false;
		}
	}

	let progressPercent = $derived.by(() => {
		if (!status || status.totalSamples === 0) return 0;
		return Math.round((status.samplesProcessed / status.totalSamples) * 100);
	});

	function formatTime(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		if (h > 0) return `${h}h ${m}m ${s}s`;
		if (m > 0) return `${m}m ${s}s`;
		return `${s}s`;
	}
</script>

<div class="qlora-dashboard {className}">
	<div class="dash-header">
		<Icon name="cpu" size={16} />
		<h3>QLoRA Training Monitor</h3>
		<label class="auto-refresh">
			<input type="checkbox" bind:checked={autoRefresh} />
			<span>Auto-refresh</span>
		</label>
		<Button variant="ghost" size="sm" onclick={fetchStatus} disabled={loading}>
			<Icon name="refresh-cw" size={12} />
		</Button>
	</div>

	{#if loading && !status}
		<p class="dash-status">Checking training status...</p>
	{:else if error}
		<p class="dash-error">{error}</p>
	{:else if !status}
		<p class="dash-status">No training status available</p>
	{:else if !status.active}
		<div class="dash-idle">
			<Icon name="pause-circle" size={20} />
			<div>
				<span class="idle-label">No Active Training</span>
				<span class="idle-detail">Model: {status.model}</span>
			</div>
		</div>
	{:else}
		<!-- Active training -->
		<div class="training-active">
			<div class="progress-section">
				<div class="progress-label">
					<span>Epoch {status.epoch}/{status.totalEpochs}</span>
					<span>{progressPercent}%</span>
				</div>
				<div class="progress-bar">
					<div class="progress-fill" style="width: {progressPercent}%"></div>
				</div>
			</div>

			<div class="metrics-grid">
				<div class="metric">
					<span class="metric-label">Loss</span>
					<span class="metric-value">{status.loss.toFixed(4)}</span>
				</div>
				<div class="metric">
					<span class="metric-label">Learning Rate</span>
					<span class="metric-value">{status.learningRate.toExponential(2)}</span>
				</div>
				<div class="metric">
					<span class="metric-label">Samples</span>
					<span class="metric-value">{status.samplesProcessed}/{status.totalSamples}</span>
				</div>
				<div class="metric">
					<span class="metric-label">Elapsed</span>
					<span class="metric-value">{formatTime(status.elapsedSeconds)}</span>
				</div>
				<div class="metric">
					<span class="metric-label">GPU Memory</span>
					<span class="metric-value">{status.gpuMemoryMB} MB</span>
				</div>
				<div class="metric">
					<span class="metric-label">GPU Util</span>
					<span class="metric-value">{status.gpuUtilization}%</span>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.qlora-dashboard {
		padding: 0.75rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.5rem;
		background: var(--color-panel-soft, #1c1917);
	}
	.dash-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.dash-header h3 {
		flex: 1;
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0;
	}
	.auto-refresh {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.6875rem;
		opacity: 0.6;
		cursor: pointer;
	}
	.dash-status {
		font-size: 0.8125rem;
		opacity: 0.5;
		margin: 0;
	}
	.dash-error {
		font-size: 0.8125rem;
		color: var(--color-danger, #ef4444);
		margin: 0;
	}
	.dash-idle {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		border-radius: 0.375rem;
		background: rgba(255, 255, 255, 0.03);
		opacity: 0.6;
	}
	.idle-label {
		display: block;
		font-size: 0.8125rem;
		font-weight: 500;
	}
	.idle-detail {
		display: block;
		font-size: 0.6875rem;
		opacity: 0.7;
	}
	.training-active {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.progress-section {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.progress-label {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		font-weight: 500;
	}
	.progress-bar {
		height: 6px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 3px;
		overflow: hidden;
	}
	.progress-fill {
		height: 100%;
		background: var(--color-accent, #a51c30);
		border-radius: 3px;
		transition: width 0.3s;
	}
	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
	}
	.metric {
		padding: 0.375rem;
		border-radius: 0.25rem;
		background: rgba(255, 255, 255, 0.03);
		text-align: center;
	}
	.metric-label {
		display: block;
		font-size: 0.6875rem;
		opacity: 0.5;
	}
	.metric-value {
		display: block;
		font-size: 0.8125rem;
		font-weight: 600;
		font-family: monospace;
	}
</style>
