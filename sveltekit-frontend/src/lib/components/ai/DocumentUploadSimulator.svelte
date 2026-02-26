<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();

	interface SimUpload {
		id: string;
		filename: string;
		size: number;
		status: 'uploading' | 'extracting' | 'chunking' | 'embedding' | 'done' | 'error';
		progress: number;
		error?: string;
	}

	const STAGES: SimUpload['status'][] = ['uploading', 'extracting', 'chunking', 'embedding', 'done'];

	let uploads = $state<SimUpload[]>([]);
	let isDragging = $state(false);
	let fileInput: HTMLInputElement | undefined;

	function stageLabel(status: SimUpload['status']): string {
		switch (status) {
			case 'uploading': return 'Uploading';
			case 'extracting': return 'Extracting text';
			case 'chunking': return 'Chunking';
			case 'embedding': return 'Generating embeddings';
			case 'done': return 'Complete';
			case 'error': return 'Error';
			default: return 'Unknown';
		}
	}

	async function simulateUpload(file: File) {
		const id = crypto.randomUUID();
		const upload: SimUpload = {
			id,
			filename: file.name,
			size: file.size,
			status: 'uploading',
			progress: 0
		};
		uploads = [...uploads, upload];

		try {
			for (let i = 0; i < STAGES.length - 1; i++) {
				const stage = STAGES[i];
				updateUpload(id, { status: stage, progress: (i / (STAGES.length - 1)) * 100 });
				await delay(800 + Math.random() * 600);
			}
			updateUpload(id, { status: 'done', progress: 100 });
		} catch {
			updateUpload(id, { status: 'error', error: 'Simulation failed' });
		}
	}

	function updateUpload(id: string, updates: Partial<SimUpload>) {
		uploads = uploads.map((u) => (u.id === id ? { ...u, ...updates } : u));
	}

	function removeUpload(id: string) {
		uploads = uploads.filter((u) => u.id !== id);
	}

	function delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		const files = e.dataTransfer?.files;
		if (files) Array.from(files).forEach(simulateUpload);
	}

	function handleFileInput(e: Event) {
		const files = (e.target as HTMLInputElement)?.files;
		if (files) Array.from(files).forEach(simulateUpload);
	}

	function formatSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}
</script>

<div class="upload-sim {className}">
	<div class="sim-header">
		<Icon name="upload" size={16} />
		<h3>Upload Simulator</h3>
		<span class="sim-badge">DEV</span>
	</div>

	<div
		class="drop-zone"
		class:dragging={isDragging}
		role="button"
		tabindex="0"
		ondragover={(e) => e.preventDefault()}
		ondragenter={(e) => { e.preventDefault(); isDragging = true; }}
		ondragleave={() => (isDragging = false)}
		ondrop={handleDrop}
		onclick={() => fileInput?.click()}
		onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput?.click()}
	>
		<input
			bind:this={fileInput}
			type="file"
			multiple
			class="sr-only"
			onchange={handleFileInput}
		/>
		<Icon name={isDragging ? 'folder-open' : 'upload-cloud'} size={24} />
		<span>{isDragging ? 'Drop files here' : 'Drop files or click to select'}</span>
		<span class="drop-hint">Simulates the 4-stage evidence pipeline</span>
	</div>

	{#if uploads.length > 0}
		<div class="upload-list">
			{#each uploads as upload (upload.id)}
				<div class="upload-item">
					<div class="item-top">
						<Icon name="file" size={12} />
						<span class="item-name">{upload.filename}</span>
						<span class="item-size">{formatSize(upload.size)}</span>
						<button class="remove-btn" onclick={() => removeUpload(upload.id)}>
							<Icon name="x" size={10} />
						</button>
					</div>
					<div class="item-progress">
						<div class="progress-bar">
							<div
								class="progress-fill"
								class:error={upload.status === 'error'}
								class:done={upload.status === 'done'}
								style="width: {upload.progress}%"
							></div>
						</div>
						<span class="stage-label" class:error={upload.status === 'error'}>
							{stageLabel(upload.status)}
						</span>
					</div>
				</div>
			{/each}
		</div>

		<Button variant="ghost" size="sm" onclick={() => (uploads = [])}>
			Clear All
		</Button>
	{/if}
</div>

<style>
	.upload-sim {
		padding: 0.75rem;
		border: 1px solid var(--color-sand-dark, #44403c);
		border-radius: 0.5rem;
		background: var(--color-panel-soft, #1c1917);
	}
	.sim-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.sim-header h3 {
		flex: 1;
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0;
	}
	.sim-badge {
		font-size: 0.5625rem;
		font-weight: 700;
		padding: 0.125rem 0.375rem;
		background: rgba(255, 200, 0, 0.15);
		color: var(--color-warning, #eab308);
		border-radius: 0.25rem;
		letter-spacing: 0.05em;
	}
	.drop-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.375rem;
		padding: 1.25rem;
		border: 2px dashed var(--color-sand-dark, #44403c);
		border-radius: 0.5rem;
		cursor: pointer;
		text-align: center;
		font-size: 0.8125rem;
		transition: all 0.15s;
		margin-bottom: 0.75rem;
	}
	.drop-zone:hover,
	.drop-zone.dragging {
		border-color: var(--color-accent, #a51c30);
		background: rgba(165, 28, 48, 0.05);
	}
	.drop-hint {
		font-size: 0.6875rem;
		opacity: 0.4;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
	}
	.upload-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.upload-item {
		padding: 0.5rem;
		border-radius: 0.375rem;
		background: rgba(255, 255, 255, 0.03);
	}
	.item-top {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 0.375rem;
		font-size: 0.8125rem;
	}
	.item-name {
		flex: 1;
		font-family: monospace;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.item-size {
		font-size: 0.6875rem;
		opacity: 0.5;
	}
	.remove-btn {
		background: none;
		border: none;
		cursor: pointer;
		opacity: 0.4;
		color: inherit;
		padding: 0.125rem;
	}
	.item-progress {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.progress-bar {
		flex: 1;
		height: 4px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 2px;
		overflow: hidden;
	}
	.progress-fill {
		height: 100%;
		background: var(--color-info, #3b82f6);
		border-radius: 2px;
		transition: width 0.3s;
	}
	.progress-fill.done {
		background: var(--color-accent, #a51c30);
	}
	.progress-fill.error {
		background: var(--color-danger, #ef4444);
	}
	.stage-label {
		font-size: 0.6875rem;
		opacity: 0.6;
		min-width: 100px;
		text-align: right;
	}
	.stage-label.error {
		color: var(--color-danger, #ef4444);
		opacity: 1;
	}
</style>
