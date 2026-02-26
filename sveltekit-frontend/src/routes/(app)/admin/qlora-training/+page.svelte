<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface TrainingJob {
		id: string;
		model: string;
		dataset: string;
		status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
		config: {
			epochs: number;
			batchSize: number;
			learningRate: number;
			loraRank: number;
			loraAlpha: number;
			maxSeqLength: number;
		};
		progress: {
			epoch: number;
			step: number;
			loss: number;
			samplesProcessed: number;
		};
		createdAt: string;
		startedAt: string | null;
		completedAt: string | null;
		error: string | null;
	}

	interface DatasetInfo {
		evidenceDocuments: number;
		trainingFiles: Array<{ name: string; format: string; description: string }>;
	}

	let jobs = $state<TrainingJob[]>([]);
	let datasets = $state<DatasetInfo | null>(null);
	let availableModels = $state<string[]>([]);
	let defaultConfig = $state<TrainingJob['config'] | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let submitting = $state(false);

	// GPU lease status
	let gpuLease = $state<{ backend: string; expiresAt: number } | null>(null);
	let gpuFree = $state(true);

	// GPU process queue status
	let queueStats = $state<{ queueDepth: number; totalSubmitted: number; totalProcessed: number } | null>(null);

	// New job form state
	let newJob = $state({
		model: 'gemma3-legal:latest',
		dataset: 'legal-qa-pairs',
		epochs: 3,
		batchSize: 4,
		learningRate: 0.0002,
		loraRank: 16,
		loraAlpha: 32,
		maxSeqLength: 2048
	});

	let showNewJobForm = $state(false);

	$effect(() => {
		fetchData();
		fetchGpuStatus();
	});

	async function fetchData() {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/admin/qlora', { signal: AbortSignal.timeout(5000) });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			jobs = data.jobs ?? [];
			datasets = data.datasets ?? null;
			availableModels = data.availableModels ?? [];
			defaultConfig = data.defaultConfig ?? null;
			if (defaultConfig) {
				newJob.epochs = defaultConfig.epochs;
				newJob.batchSize = defaultConfig.batchSize;
				newJob.learningRate = defaultConfig.learningRate;
				newJob.loraRank = defaultConfig.loraRank;
				newJob.loraAlpha = defaultConfig.loraAlpha;
				newJob.maxSeqLength = defaultConfig.maxSeqLength;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
		}
	}

	async function fetchGpuStatus() {
		try {
			const [leaseRes, queueRes] = await Promise.all([
				fetch('/api/gpu/lease', { signal: AbortSignal.timeout(3000) }),
				fetch('/api/gpu/queue', { signal: AbortSignal.timeout(3000) })
			]);
			if (leaseRes.ok) {
				const data = await leaseRes.json();
				gpuLease = data.lease;
				gpuFree = data.free;
			}
			if (queueRes.ok) {
				const data = await queueRes.json();
				queueStats = data.stats;
			}
		} catch { /* non-critical */ }
	}

	async function submitJob() {
		submitting = true;
		error = null;
		try {
			const res = await fetch('/api/admin/qlora', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: newJob.model,
					dataset: newJob.dataset,
					config: {
						epochs: newJob.epochs,
						batchSize: newJob.batchSize,
						learningRate: newJob.learningRate,
						loraRank: newJob.loraRank,
						loraAlpha: newJob.loraAlpha,
						maxSeqLength: newJob.maxSeqLength
					}
				})
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			showNewJobForm = false;
			await fetchData();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to submit job';
		} finally {
			submitting = false;
		}
	}

	function statusColor(status: string): string {
		switch (status) {
			case 'running': return 'color: #22d3ee';
			case 'completed': return 'color: #10b981';
			case 'failed': return 'color: #ef4444';
			case 'cancelled': return 'color: #94a3b8';
			default: return 'color: #eab308';
		}
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleString();
	}
</script>

<svelte:head>
	<title>QLoRA Training | Admin | DEEDS</title>
</svelte:head>

<div class="p-6 max-w-5xl mx-auto">
	<div class="flex items-center gap-3 mb-6">
		<Icon name="cpu" size={24} />
		<h1 class="text-xl font-bold m-0">QLoRA Fine-Tuning Manager</h1>
		<div class="ml-auto flex gap-2">
			<Button variant="ghost" size="sm" onclick={fetchData}>
				<Icon name="refresh-cw" size={14} />
				<span class="ml-1">Refresh</span>
			</Button>
			<Button variant="primary" size="sm" onclick={() => showNewJobForm = !showNewJobForm}>
				<Icon name="plus" size={14} />
				<span class="ml-1">New Job</span>
			</Button>
		</div>
	</div>

	<!-- GPU Status Cards -->
	<div class="grid grid-cols-3 gap-3 mb-6">
		<div class="p-3 rounded-lg border border-sand-dark bg-panel-soft">
			<div class="text-[11px] uppercase opacity-50 mb-1">GPU Lease</div>
			{#if gpuFree}
				<div class="text-sm font-semibold" style="color: #10b981">Available</div>
			{:else if gpuLease}
				<div class="text-sm font-semibold" style="color: #eab308">
					Held by {gpuLease.backend}
				</div>
				<div class="text-[11px] opacity-50">
					Expires: {new Date(gpuLease.expiresAt).toLocaleTimeString()}
				</div>
			{/if}
		</div>
		<div class="p-3 rounded-lg border border-sand-dark bg-panel-soft">
			<div class="text-[11px] uppercase opacity-50 mb-1">Process Queue</div>
			<div class="text-sm font-semibold">{queueStats?.queueDepth ?? 0} pending</div>
			<div class="text-[11px] opacity-50">{queueStats?.totalProcessed ?? 0} processed</div>
		</div>
		<div class="p-3 rounded-lg border border-sand-dark bg-panel-soft">
			<div class="text-[11px] uppercase opacity-50 mb-1">Training Data</div>
			<div class="text-sm font-semibold">{datasets?.evidenceDocuments ?? 0} documents</div>
			<div class="text-[11px] opacity-50">{datasets?.trainingFiles?.length ?? 0} datasets</div>
		</div>
	</div>

	<!-- New Job Form -->
	{#if showNewJobForm}
		<div class="p-4 rounded-lg border border-accent/30 bg-panel-soft mb-6">
			<h2 class="text-sm font-semibold mb-3 m-0">Create Training Job</h2>
			<div class="grid grid-cols-2 gap-3">
				<label class="flex flex-col gap-1">
					<span class="text-[11px] uppercase opacity-50">Base Model</span>
					<select bind:value={newJob.model} class="bg-panel border border-sand-dark rounded px-2 py-1.5 text-sm">
						{#each availableModels as model}
							<option value={model}>{model}</option>
						{/each}
						{#if availableModels.length === 0}
							<option value="gemma3-legal:latest">gemma3-legal:latest</option>
						{/if}
					</select>
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-[11px] uppercase opacity-50">Dataset</span>
					<select bind:value={newJob.dataset} class="bg-panel border border-sand-dark rounded px-2 py-1.5 text-sm">
						{#each datasets?.trainingFiles ?? [] as ds}
							<option value={ds.name}>{ds.name} ({ds.format})</option>
						{/each}
						{#if !datasets?.trainingFiles?.length}
							<option value="legal-qa-pairs">legal-qa-pairs</option>
						{/if}
					</select>
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-[11px] uppercase opacity-50">Epochs</span>
					<input type="number" bind:value={newJob.epochs} min="1" max="20" class="bg-panel border border-sand-dark rounded px-2 py-1.5 text-sm" />
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-[11px] uppercase opacity-50">Batch Size</span>
					<input type="number" bind:value={newJob.batchSize} min="1" max="32" class="bg-panel border border-sand-dark rounded px-2 py-1.5 text-sm" />
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-[11px] uppercase opacity-50">Learning Rate</span>
					<input type="number" bind:value={newJob.learningRate} step="0.0001" min="0.00001" max="0.01" class="bg-panel border border-sand-dark rounded px-2 py-1.5 text-sm" />
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-[11px] uppercase opacity-50">LoRA Rank</span>
					<select bind:value={newJob.loraRank} class="bg-panel border border-sand-dark rounded px-2 py-1.5 text-sm">
						<option value={4}>4</option>
						<option value={8}>8</option>
						<option value={16}>16</option>
						<option value={32}>32</option>
						<option value={64}>64</option>
					</select>
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-[11px] uppercase opacity-50">LoRA Alpha</span>
					<input type="number" bind:value={newJob.loraAlpha} min="1" max="128" class="bg-panel border border-sand-dark rounded px-2 py-1.5 text-sm" />
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-[11px] uppercase opacity-50">Max Seq Length</span>
					<select bind:value={newJob.maxSeqLength} class="bg-panel border border-sand-dark rounded px-2 py-1.5 text-sm">
						<option value={512}>512</option>
						<option value={1024}>1024</option>
						<option value={2048}>2048</option>
						<option value={4096}>4096</option>
					</select>
				</label>
			</div>
			<div class="flex gap-2 mt-4">
				<Button variant="primary" size="sm" onclick={submitJob} disabled={submitting}>
					{submitting ? 'Submitting...' : 'Submit Job'}
				</Button>
				<Button variant="ghost" size="sm" onclick={() => showNewJobForm = false}>Cancel</Button>
			</div>
		</div>
	{/if}

	<!-- Error -->
	{#if error}
		<div class="p-3 rounded-lg border border-danger/30 bg-danger/5 text-danger text-sm mb-4">
			{error}
		</div>
	{/if}

	<!-- Loading -->
	{#if loading}
		<div class="text-center py-12 opacity-50">Loading training jobs...</div>
	{:else if jobs.length === 0}
		<div class="text-center py-12">
			<div class="text-lg opacity-30 mb-2">No Training Jobs</div>
			<div class="text-sm opacity-50 mb-4">Create a new QLoRA fine-tuning job to get started.</div>
			<Button variant="primary" size="sm" onclick={() => showNewJobForm = true}>
				<Icon name="plus" size={14} />
				<span class="ml-1">Create First Job</span>
			</Button>
		</div>
	{:else}
		<!-- Jobs List -->
		<div class="flex flex-col gap-3">
			{#each jobs as job}
				<div class="p-4 rounded-lg border border-sand-dark bg-panel-soft">
					<div class="flex items-center gap-3 mb-2">
						<span class="font-mono text-xs opacity-50">{job.id}</span>
						<span class="px-2 py-0.5 rounded text-[11px] font-semibold border" style={statusColor(job.status)}>
							{job.status.toUpperCase()}
						</span>
						<span class="ml-auto text-[11px] opacity-50">{formatDate(job.createdAt)}</span>
					</div>
					<div class="grid grid-cols-4 gap-3 text-sm">
						<div>
							<span class="block text-[11px] uppercase opacity-50">Model</span>
							<span class="font-mono text-xs">{job.model}</span>
						</div>
						<div>
							<span class="block text-[11px] uppercase opacity-50">Dataset</span>
							<span class="font-mono text-xs">{job.dataset}</span>
						</div>
						<div>
							<span class="block text-[11px] uppercase opacity-50">Config</span>
							<span class="font-mono text-xs">
								{job.config.epochs}ep / r{job.config.loraRank} / bs{job.config.batchSize}
							</span>
						</div>
						<div>
							<span class="block text-[11px] uppercase opacity-50">Progress</span>
							{#if job.status === 'running'}
								<span class="font-mono text-xs">
									Epoch {job.progress.epoch}/{job.config.epochs} — Loss {job.progress.loss.toFixed(4)}
								</span>
							{:else if job.status === 'completed'}
								<span class="font-mono text-xs" style="color: #10b981">Complete</span>
							{:else if job.status === 'failed'}
								<span class="font-mono text-xs" style="color: #ef4444">{job.error ?? 'Failed'}</span>
							{:else}
								<span class="font-mono text-xs opacity-50">Waiting...</span>
							{/if}
						</div>
					</div>
					{#if job.status === 'running'}
						{@const pct = job.config.epochs > 0 ? Math.round((job.progress.epoch / job.config.epochs) * 100) : 0}
						<div class="mt-2 h-1.5 bg-white/8 rounded-full overflow-hidden">
							<div class="h-full bg-accent rounded-full transition-all" style:width="{pct}%"></div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Available Datasets Section -->
	{#if datasets?.trainingFiles?.length}
		<div class="mt-8">
			<h2 class="text-sm font-semibold mb-3">Available Datasets</h2>
			<div class="grid grid-cols-1 gap-2">
				{#each datasets.trainingFiles as ds}
					<div class="p-3 rounded-lg border border-sand-dark bg-panel-soft flex items-center gap-3">
						<Icon name="database" size={16} />
						<div class="flex-1">
							<span class="block text-sm font-medium">{ds.name}</span>
							<span class="block text-[11px] opacity-50">{ds.description}</span>
						</div>
						<span class="text-[11px] font-mono opacity-40">{ds.format}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
