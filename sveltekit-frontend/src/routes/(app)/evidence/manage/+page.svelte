<script lang="ts">
	import EvidenceFilesManager from '$lib/components/evidence/EvidenceFilesManager.svelte';
	import type { EvidenceFile } from '$lib/components/evidence/EvidenceFilesManager.svelte';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	let files = $state<EvidenceFile[]>(
		(data.files ?? []).map((f: any) => ({
			id: f.id,
			name: f.title ?? 'Untitled',
			size: f.fileSize ?? 0,
			type: f.evidenceType ?? 'unknown',
			uploadedAt: f.createdAt ? new Date(f.createdAt).toISOString() : undefined,
		}))
	);
	let uploadStatus = $state('');

	async function handleUpload(event: { files: File[] }) {
		for (const file of event.files) {
			try {
				const formData = new FormData();
				formData.append('file', file);

				const response = await fetch('/api/evidence/upload', {
					method: 'POST',
					body: formData
				});

				if (response.ok) {
					const result = await response.json();
					files = [...files, {
						name: file.name,
						size: file.size,
						type: file.type,
						uploadedAt: new Date().toISOString(),
						id: result.data?.id ?? crypto.randomUUID()
					}];
					uploadStatus = `Uploaded: ${file.name}`;
				} else {
					uploadStatus = `Failed to upload: ${file.name}`;
				}
			} catch {
				uploadStatus = `Error uploading: ${file.name}`;
			}
		}
	}

	function handleRemove(event: { index: number }) {
		files = files.filter((_, i) => i !== event.index);
	}
</script>

<main class="evidence-manage-page">
	<div class="page-header">
		<h1>Evidence Manager</h1>
		<p class="subtitle">Upload and manage evidence files
			{#if data.user}
				<span class="user-tag">Agent: {data.user.username ?? data.user.email ?? 'Unknown'}</span>
			{/if}
		</p>
	</div>

	{#if uploadStatus}
		<div class="status-bar">
			<span>{uploadStatus}</span>
			<button onclick={() => (uploadStatus = '')}>Dismiss</button>
		</div>
	{/if}

	<div class="manager-container">
		<EvidenceFilesManager
			bind:files
			maxFiles={20}
			onupload={handleUpload}
			onremove={handleRemove}
		/>
	</div>

	<div class="file-stats">
		<span>{files.length} file{files.length !== 1 ? 's' : ''} loaded</span>
	</div>
</main>

<style>
	.evidence-manage-page {
		padding: 2rem 2.5rem;
		margin: -2.5rem;
		background: #0f0f23;
		min-height: 100vh;
		color: #e0e0e0;
	}
	.evidence-manage-page :global(h1), .evidence-manage-page :global(h2), .evidence-manage-page :global(h3), .evidence-manage-page :global(h4), .evidence-manage-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.evidence-manage-page :global(a) { color: inherit; border-bottom: none; }
	.evidence-manage-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.evidence-manage-page :global(input), .evidence-manage-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.evidence-manage-page :global(.panel), .evidence-manage-page :global(.card), .evidence-manage-page :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	.page-header {
		margin-bottom: 2rem;
	}

	.page-header h1 {
		color: #ffffff;
		font-size: 2rem;
		margin: 0;
	}

	.subtitle {
		color: #9ca3af;
		margin: 0.5rem 0 0 0;
	}

	.status-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: #1a1a2e;
		border: 1px solid #333;
		border-radius: 0.375rem;
		margin-bottom: 1.5rem;
		font-size: 0.875rem;
	}

	.status-bar button {
		background: none;
		border: 1px solid #555;
		color: #9ca3af;
		padding: 0.25rem 0.75rem;
		border-radius: 0.25rem;
		cursor: pointer;
		font-size: 0.75rem;
	}

	.status-bar button:hover {
		border-color: #dc2626;
		color: #fff;
	}

	.manager-container {
		background: #1a1a2e;
		border: 1px solid #333;
		border-radius: 0.5rem;
		padding: 1.5rem;
	}

	.file-stats {
		margin-top: 1rem;
		text-align: right;
		color: #6b7280;
		font-size: 0.8rem;
	}

	.user-tag {
		margin-left: 1rem;
		font-family: monospace;
		font-size: 0.75rem;
		color: #6b7280;
		border: 1px solid #444;
		padding: 0.1rem 0.4rem;
	}
</style>
