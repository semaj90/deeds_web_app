<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface PipelineStage {
		name: string;
		icon: string;
		status: 'idle' | 'running' | 'complete' | 'error';
	}

	let stages: PipelineStage[] = $state([
		{ name: 'Ingestion', icon: 'upload', status: 'complete' },
		{ name: 'Extraction', icon: 'file-text', status: 'complete' },
		{ name: 'Chunking', icon: 'scissors', status: 'complete' },
		{ name: 'Embedding', icon: 'cpu', status: 'running' },
		{ name: 'Indexing', icon: 'database', status: 'idle' },
		{ name: 'Enrichment', icon: 'sparkles', status: 'idle' },
	]);

	const statusColor: Record<string, string> = {
		idle: 'rgba(212, 199, 163, 0.2)',
		running: 'rgba(96, 165, 250, 0.8)',
		complete: 'rgba(74, 222, 128, 0.7)',
		error: 'rgba(248, 113, 113, 0.8)',
	};

	const statusLabel: Record<string, string> = {
		idle: 'Idle',
		running: 'Running',
		complete: 'Complete',
		error: 'Error',
	};
</script>

<div class="pipeline-card">
	<div class="pipeline-header">
		<div class="pipeline-title-row">
			<div class="pipeline-icon-badge">
				<Icon name="git-branch" size={14} />
			</div>
			<h3 class="pipeline-title">Neural Pipeline</h3>
		</div>
		<span class="pipeline-status-badge">
			{stages.filter(s => s.status === 'complete').length}/{stages.length} stages
		</span>
	</div>

	<div class="pipeline-stages">
		{#each stages as stage, i}
			<div class="stage-item">
				<div
					class="stage-dot"
					style="background: {statusColor[stage.status]}; box-shadow: 0 0 8px {statusColor[stage.status]}"
				>
					<Icon name={stage.icon} size={12} />
				</div>
				<div class="stage-info">
					<span class="stage-name">{stage.name}</span>
					<span class="stage-status" style="color: {statusColor[stage.status]}">{statusLabel[stage.status]}</span>
				</div>
			</div>
			{#if i < stages.length - 1}
				<div
					class="stage-connector"
					style="background: {stage.status === 'complete' ? statusColor.complete : 'rgba(212, 199, 163, 0.08)'}"
				></div>
			{/if}
		{/each}
	</div>
</div>

<style>
	.pipeline-card {
		padding: 1.25rem;
	}

	.pipeline-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.25rem;
	}

	.pipeline-title-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.pipeline-icon-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 0.5rem;
		background: rgba(96, 165, 250, 0.1);
		color: rgba(96, 165, 250, 0.8);
	}

	.pipeline-title {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: rgba(212, 199, 163, 0.6);
		margin: 0;
	}

	.pipeline-status-badge {
		font-size: 0.6875rem;
		padding: 0.25rem 0.625rem;
		border-radius: 9999px;
		background: rgba(212, 199, 163, 0.06);
		border: 1px solid rgba(212, 199, 163, 0.1);
		color: rgba(212, 199, 163, 0.5);
	}

	.pipeline-stages {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.stage-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0;
	}

	.stage-dot {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		flex-shrink: 0;
		color: rgba(18, 17, 14, 0.9);
	}

	.stage-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.stage-name {
		font-size: 0.8125rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.75);
	}

	.stage-status {
		font-size: 0.6875rem;
		font-weight: 500;
	}

	.stage-connector {
		width: 2px;
		height: 0.75rem;
		margin-left: 0.8125rem;
		border-radius: 1px;
		transition: background 0.3s ease;
	}
</style>
