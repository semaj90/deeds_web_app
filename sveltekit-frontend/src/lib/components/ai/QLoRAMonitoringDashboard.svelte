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
			const res = await fetch('/api/health/capabilities', {
				signal: AbortSignal.timeout(3000)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();

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

<div class="p-3 border border-sand-dark rounded-lg bg-panel-soft {className}">
	<div class="flex items-center gap-2 mb-3">
		<Icon name="cpu" size={16} />
		<h3 class="flex-1 text-sm font-semibold m-0">QLoRA Training Monitor</h3>
		<label class="flex items-center gap-1 text-[11px] opacity-60 cursor-pointer">
			<input type="checkbox" bind:checked={autoRefresh} />
			<span>Auto-refresh</span>
		</label>
		<Button variant="ghost" size="sm" onclick={fetchStatus} disabled={loading}>
			<Icon name="refresh-cw" size={12} />
		</Button>
	</div>

	{#if loading && !status}
		<p class="text-[13px] opacity-50 m-0">Checking training status...</p>
	{:else if error}
		<p class="text-[13px] text-danger m-0">{error}</p>
	{:else if !status}
		<p class="text-[13px] opacity-50 m-0">No training status available</p>
	{:else if !status.active}
		<div class="flex items-center gap-3 p-3 rounded-md bg-white/3 opacity-60">
			<Icon name="circle-pause" size={20} />
			<div>
				<span class="block text-[13px] font-medium">No Active Training</span>
				<span class="block text-[11px] opacity-70">Model: {status.model}</span>
			</div>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			<div class="flex flex-col gap-1">
				<div class="flex justify-between text-xs font-medium">
					<span>Epoch {status.epoch}/{status.totalEpochs}</span>
					<span>{progressPercent}%</span>
				</div>
				<div class="h-1.5 bg-white/8 rounded-full overflow-hidden">
					<div class="h-full bg-accent rounded-full transition-all" style:width="{progressPercent}%"></div>
				</div>
			</div>

			<div class="grid grid-cols-3 gap-2">
				<div class="p-1.5 rounded bg-white/3 text-center">
					<span class="block text-[11px] opacity-50">Loss</span>
					<span class="block text-[13px] font-semibold font-mono">{status.loss.toFixed(4)}</span>
				</div>
				<div class="p-1.5 rounded bg-white/3 text-center">
					<span class="block text-[11px] opacity-50">Learning Rate</span>
					<span class="block text-[13px] font-semibold font-mono">{status.learningRate.toExponential(2)}</span>
				</div>
				<div class="p-1.5 rounded bg-white/3 text-center">
					<span class="block text-[11px] opacity-50">Samples</span>
					<span class="block text-[13px] font-semibold font-mono">{status.samplesProcessed}/{status.totalSamples}</span>
				</div>
				<div class="p-1.5 rounded bg-white/3 text-center">
					<span class="block text-[11px] opacity-50">Elapsed</span>
					<span class="block text-[13px] font-semibold font-mono">{formatTime(status.elapsedSeconds)}</span>
				</div>
				<div class="p-1.5 rounded bg-white/3 text-center">
					<span class="block text-[11px] opacity-50">GPU Memory</span>
					<span class="block text-[13px] font-semibold font-mono">{status.gpuMemoryMB} MB</span>
				</div>
				<div class="p-1.5 rounded bg-white/3 text-center">
					<span class="block text-[11px] opacity-50">GPU Util</span>
					<span class="block text-[13px] font-semibold font-mono">{status.gpuUtilization}%</span>
				</div>
			</div>
		</div>
	{/if}
</div>
