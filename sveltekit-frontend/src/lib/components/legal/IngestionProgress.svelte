<script lang="ts">
	let {
		jobId,
		onComplete,
	}: {
		jobId: string;
		onComplete?: (documentId: string) => void;
	} = $props();

	interface ProgressEvent {
		stage: string;
		stageLabel: string;
		stageIndex: number;
		totalStages: number;
		status: string;
		progress: number;
		errorText?: string | null;
		metrics?: Record<string, unknown>;
		document?: { id: string; title: string; corpusType: string; pageCount: number } | null;
	}

	let info = $state<ProgressEvent | null>(null);
	let done = $state(false);
	let failed = $state(false);

	$effect(() => {
		const es = new EventSource(`/api/library/ingest/${jobId}`);
		es.onmessage = (evt: MessageEvent) => {
			try {
				const p: ProgressEvent = JSON.parse(evt.data);
				info = p;
				if (p.status === 'complete') {
					done = true;
					es.close();
					onComplete?.(p.document?.id ?? '');
				} else if (p.status === 'failed') {
					failed = true;
					es.close();
				}
			} catch { /* ignore parse errors */ }
		};
		es.onerror = () => {
			failed = true;
			es.close();
		};
		return () => es.close();
	});

	const STAGE_LABELS = [
		'Fetching',
		'Extracting text',
		'Structure analysis',
		'Building sections',
		'Indexing chunks',
		'Generating embeddings',
		'Syncing graph',
	];
</script>

<div class="flex flex-col gap-3">
	{#if !info && !done && !failed}
		<div class="flex items-center gap-2 text-sand/40 text-xs">
			<span class="animate-spin">⟳</span>
			<span>Connecting to job {jobId.slice(0, 8)}…</span>
		</div>
	{/if}

	{#if info || done || failed}
		<div class="p-4 bg-sand/3 border border-sand/10 rounded-lg">
			<!-- Stage dots -->
			<div class="flex items-center gap-1 mb-3">
				{#each STAGE_LABELS as label, i}
					{@const stageIdx = info?.stageIndex ?? -1}
					<div
						title={label}
						class="h-1.5 flex-1 rounded-full transition-colors duration-500
							{i < stageIdx ? 'bg-green-500' : i === stageIdx ? 'bg-accent' : 'bg-sand/10'}"
					></div>
				{/each}
			</div>

			<!-- Current stage -->
			<div class="flex items-center justify-between mb-1.5">
				<span class="text-xs text-sand/70">
					{#if done}
						✓ Complete
					{:else if failed}
						✗ {info?.errorText ?? 'Failed'}
					{:else}
						{info?.stageLabel ?? 'Processing…'}
					{/if}
				</span>
				<span class="text-xs text-sand/40">{Math.round(info?.progress ?? 0)}%</span>
			</div>

			<!-- Progress bar -->
			<div class="h-1.5 bg-sand/10 rounded-full overflow-hidden">
				<div
					class="h-full rounded-full transition-all duration-500 {failed ? 'bg-red-500' : done ? 'bg-green-500' : 'bg-accent'}"
					style:width="{info?.progress ?? 0}%"
				></div>
			</div>

			<!-- Metrics -->
			{#if info?.metrics && Object.keys(info.metrics).length > 0}
				<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1">
					{#each Object.entries(info.metrics) as [k, v]}
						<span class="text-[10px] text-sand/30">
							{k}: <span class="text-sand/50">{v}</span>
						</span>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
