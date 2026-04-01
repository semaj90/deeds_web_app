<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/ui/Icon.svelte';
	import IngestionProgress from '$lib/components/legal/IngestionProgress.svelte';

	let { data }: { data: PageData } = $props();

	type Source = (typeof data.sources)[number];

	let filter = $state<'all' | 'complete' | 'in_progress' | 'failed' | 'not_started'>('all');
	let searchQ = $state('');
	let bulkRunning = $state(false);
	let bulkMessage = $state<string | null>(null);
	let perStateRunning = $state(new Set<string>());

	// Upload modal state
	let uploadModal = $state<{ stateCode: string; stateName: string } | null>(null);
	let uploadFile = $state<File | null>(null);
	let uploadRunning = $state(false);
	let uploadJobId = $state<string | null>(null);
	let uploadDocumentId = $state<string | null>(null);
	let uploadError = $state<string | null>(null);
	let fileInputEl = $state<HTMLInputElement | null>(null);

	function openUpload(src: Source) {
		uploadModal = { stateCode: src.stateCode, stateName: src.stateName };
		uploadFile = null;
		uploadRunning = false;
		uploadJobId = null;
		uploadDocumentId = null;
		uploadError = null;
	}

	function closeUpload() {
		if (uploadRunning) return;
		uploadModal = null;
	}

	function onFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		uploadFile = input.files?.[0] ?? null;
	}

	async function submitUpload() {
		if (!uploadModal || !uploadFile) return;
		uploadRunning = true;
		uploadError = null;
		try {
			const fd = new FormData();
			fd.append('file', uploadFile);
			fd.append('title', `${uploadModal.stateName} Constitution`);
			fd.append('corpusType', 'constitution');
			fd.append('jurisdiction', uploadModal.stateCode);
			fd.append('jurisdictionType', 'state');
			const res = await fetch('/api/library/upload', { method: 'POST', body: fd });
			const d = await res.json();
			if (!res.ok) {
				uploadError = d.error ?? 'Upload failed';
				uploadRunning = false;
				return;
			}
			if (d.documentId && d.alreadyExists && !d.jobId) {
				location.href = `/library/${d.documentId}`;
				return;
			}
			uploadJobId = d.jobId;
			uploadDocumentId = d.documentId;
		} catch (err) {
			uploadError = String(err);
			uploadRunning = false;
		}
	}

	function onUploadComplete() {
		uploadRunning = false;
		// Give user time to read the success state then close
		setTimeout(() => { uploadModal = null; }, 2000);
	}

	const filtered = $derived.by(() => {
		let list = data.sources;
		if (filter !== 'all') {
			list = list.filter((s) => {
				if (filter === 'complete') return s.processingStatus === 'complete';
				if (filter === 'failed') return s.processingStatus === 'failed';
				if (filter === 'not_started') return s.processingStatus === 'not_started';
				if (filter === 'in_progress')
					return !['complete', 'failed', 'not_started'].includes(s.processingStatus ?? '');
				return true;
			});
		}
		if (searchQ.trim()) {
			const q = searchQ.toLowerCase();
			list = list.filter(
				(s) => s.stateName.toLowerCase().includes(q) || s.stateCode.includes(q)
			);
		}
		return list;
	});

	function formatDate(iso: string | null) {
		if (!iso) return null;
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	async function ingestState(src: Source) {
		perStateRunning = new Set([...perStateRunning, src.stateCode]);
		try {
			const res = await fetch('/api/library/corpus/constitutions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ stateCode: src.stateCode }),
			});
			if (!res.ok) {
				const d = await res.json();
				alert(`Failed to start ${src.stateName}: ${d.error}`);
			}
		} finally {
			perStateRunning = new Set([...perStateRunning].filter((c) => c !== src.stateCode));
		}
	}

	async function ingestAll() {
		if (!confirm('Start ingestion for all 50 states? This will run sequentially in the background and may take several hours.')) return;
		bulkRunning = true;
		bulkMessage = null;
		try {
			const res = await fetch('/api/library/corpus/constitutions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ all: true }),
			});
			const d = await res.json();
			bulkMessage = res.ok
				? `Started ingestion for ${d.count} states. Running in background.`
				: `Error: ${d.error}`;
		} finally {
			bulkRunning = false;
		}
	}
</script>

<svelte:head><title>State Constitution Corpus — Legal Library</title></svelte:head>

<div class="co-page">
	<!-- Header -->
	<header class="co-header">
		<div>
			<h1 class="co-h1">50-State Constitution Corpus</h1>
			<p class="co-subtitle">
				Official state legislature sources &middot; LII discovery layer &middot; Qdrant + pgvector mirrored
			</p>
		</div>
		<button
			onclick={ingestAll}
			disabled={bulkRunning}
			class="co-ingest-btn"
		>
			{#if bulkRunning}
				<span class="co-pulse">Running&hellip;</span>
			{:else}
				Ingest All States
			{/if}
		</button>
	</header>

	{#if bulkMessage}
		<div class="co-bulk-msg">{bulkMessage}</div>
	{/if}

	<!-- Stats bar -->
	<div class="co-stats-grid">
		{#each [
			{ label: 'Total States', value: data.stats.total, cls: 'co-stat-default' },
			{ label: 'Complete', value: data.stats.complete, cls: 'co-stat-green' },
			{ label: 'In Progress', value: data.stats.inProgress, cls: 'co-stat-blue' },
			{ label: 'Failed', value: data.stats.failed, cls: 'co-stat-red' },
			{ label: 'Not Started', value: data.stats.notStarted, cls: 'co-stat-muted' },
		] as stat}
			<div class="co-stat-card">
				<div class="co-stat-value {stat.cls}">{stat.value}</div>
				<div class="co-stat-label">{stat.label}</div>
			</div>
		{/each}
	</div>

	<!-- Filter + Search -->
	<div class="co-filter-bar">
		<input
			bind:value={searchQ}
			type="search"
			placeholder="Search states..."
			class="co-search-input"
		/>
		<div class="co-filter-tabs">
			{#each [
				{ key: 'all', label: 'All' },
				{ key: 'complete', label: 'Complete' },
				{ key: 'in_progress', label: 'Running' },
				{ key: 'failed', label: 'Failed' },
				{ key: 'not_started', label: 'Pending' },
			] as tab}
				<button
					onclick={() => (filter = tab.key as typeof filter)}
					class="co-filter-btn"
					class:active={filter === tab.key}
				>
					{tab.label}
				</button>
			{/each}
		</div>
		<span class="co-filter-count">{filtered.length} states</span>
	</div>

	<!-- State grid -->
	<div class="co-state-list">
		{#each filtered as src}
			<div class="co-state-row">
				<!-- State badge -->
				<div class="co-state-badge">
					<span class="co-state-code">{src.stateCode}</span>
				</div>

				<!-- Name + metadata -->
				<div class="co-state-info">
					<div class="co-state-name-row">
						<span class="co-state-name">{src.stateName}</span>
						{#if src.isOfficial}
							<span class="co-tag co-tag-official">official</span>
						{:else}
							<span class="co-tag co-tag-scraped">scraped</span>
						{/if}
						<span class="co-confidence-dot co-confidence-{src.sourceConfidence}" title="Source confidence: {src.sourceConfidence}"></span>
						<span class="co-format-tag">{src.format.toUpperCase()}</span>
					</div>
					<div class="co-state-meta">
						{#if src.wordCount}
							<span>{src.wordCount.toLocaleString()} words</span>
						{/if}
						{#if src.nodeCount}
							<span>{src.nodeCount} nodes</span>
						{/if}
						{#if src.chunkCount}
							<span>{src.chunkCount} chunks</span>
						{/if}
						{#if src.lastFetchedAt}
							<span>Fetched {formatDate(src.lastFetchedAt)}</span>
						{/if}
						{#if src.notes}
							<span class="co-state-warning" title={src.notes}>{src.notes}</span>
						{/if}
					</div>

					{#if src.stage && src.processingStatus !== 'complete' && src.processingStatus !== 'failed'}
						<div class="co-progress-row">
							<div class="co-progress-track">
								<div
									class="co-progress-fill"
									style:width="{src.progress}%"
								></div>
							</div>
							<span class="co-progress-label">{src.stage} {src.progress}%</span>
						</div>
					{/if}

					{#if src.errorText && src.processingStatus === 'failed'}
						<p class="co-error-text" title={src.errorText}>{src.errorText}</p>
					{/if}
				</div>

				<!-- Status badge -->
				<div class="co-status-badge-wrap">
					<span class="co-status-badge co-status-{src.processingStatus ?? 'pending'}">
						{src.processingStatus ?? 'pending'}
					</span>
				</div>

				<!-- Actions -->
				<div class="co-actions">
					{#if src.documentId}
						<a href="/library/{src.documentId}" class="co-action-btn">View</a>
					{/if}
					<button
						onclick={() => ingestState(src)}
						disabled={perStateRunning.has(src.stateCode)}
						class="co-action-btn"
						title={src.processingStatus === 'complete' ? 'Re-fetch (checks hash, skips if unchanged)' : 'Start ingestion'}
					>
						{#if perStateRunning.has(src.stateCode)}
							<span class="co-pulse">&hellip;</span>
						{:else if src.processingStatus === 'complete'}
							Refresh
						{:else}
							Ingest
						{/if}
					</button>
					<button
						onclick={() => openUpload(src)}
						class="co-action-btn co-upload-btn"
						title="Upload a local PDF for {src.stateName}"
					>
						Upload PDF
					</button>
					<a
						href={src.sourceUrl ?? src.discoveryUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="co-external-link"
						title="View source"
					>
						<Icon name="external-link" />
					</a>
				</div>
			</div>
		{/each}
	</div>
</div>

<!-- Upload PDF modal -->
{#if uploadModal}
	<div class="co-modal-backdrop" onclick={closeUpload} role="presentation">
		<div class="co-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Upload PDF for {uploadModal.stateName}">
			<div class="co-modal-header">
				<h2 class="co-modal-title">Upload PDF — {uploadModal.stateName}</h2>
				<button onclick={closeUpload} class="co-modal-close" disabled={uploadRunning} aria-label="Close">
					<Icon name="x" />
				</button>
			</div>

			{#if uploadJobId}
				<!-- Ingestion in progress -->
				<IngestionProgress jobId={uploadJobId} onComplete={onUploadComplete} />
				{#if uploadDocumentId}
					<div class="co-modal-actions" style="margin-top:1rem">
						<a href="/library/{uploadDocumentId}" class="co-action-btn">View Document</a>
					</div>
				{/if}
			{:else}
				<!-- File picker + submit -->
				<div class="co-modal-body">
					<p class="co-modal-hint">
						Select the <strong>{uploadModal.stateName} Constitution</strong> PDF from your local files.
						The document will be extracted, chunked (512 token windows), embedded (768-dim), and indexed in Qdrant + pgvector.
					</p>
					<label class="co-file-label">
						<input
							bind:this={fileInputEl}
							type="file"
							accept=".pdf,application/pdf"
							onchange={onFileChange}
							class="co-file-input"
						/>
						<div class="co-file-drop">
							<Icon name="file-text" />
							{#if uploadFile}
								<span class="co-file-name">{uploadFile.name}</span>
								<span class="co-file-size">({(uploadFile.size / 1_048_576).toFixed(1)} MB)</span>
							{:else}
								<span class="co-file-placeholder">Click to select PDF&hellip;</span>
							{/if}
						</div>
					</label>

					{#if uploadError}
						<p class="co-upload-error">{uploadError}</p>
					{/if}
				</div>
				<div class="co-modal-actions">
					<button onclick={closeUpload} class="co-action-btn" disabled={uploadRunning}>Cancel</button>
					<button
						onclick={submitUpload}
						class="co-ingest-btn"
						disabled={!uploadFile || uploadRunning}
					>
						{#if uploadRunning}<span class="co-pulse">Uploading&hellip;</span>{:else}Upload & Ingest{/if}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* ── Page ── */
	.co-page { padding: 1.5rem 2.5rem; margin: -2.5rem; min-height: 100vh; background: #0e0d0b; color: rgba(212, 199, 163, 0.9); }
	.co-page :global(h1), .co-page :global(h2), .co-page :global(h3), .co-page :global(h4), .co-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.co-page :global(a) { color: inherit; border-bottom: none; }
	.co-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.co-page :global(input), .co-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.co-page :global(.panel), .co-page :global(.card), .co-page :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	/* ── Header ── */
	.co-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	.co-h1 { font-size: 1.5rem; font-weight: 700; color: rgba(212, 199, 163, 0.95); margin: 0; }
	.co-subtitle { font-size: 0.8rem; color: rgba(212, 199, 163, 0.4); margin-top: 0.125rem; }

	.co-ingest-btn {
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		background: rgba(96, 165, 250, 0.15);
		border: 1px solid rgba(96, 165, 250, 0.3);
		color: rgba(96, 165, 250, 0.9);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
		flex-shrink: 0;
	}
	.co-ingest-btn:hover { background: rgba(96, 165, 250, 0.25); }
	.co-ingest-btn:disabled { opacity: 0.5; cursor: not-allowed; }

	.co-pulse { animation: pulse 1.5s ease-in-out infinite; }

	/* ── Bulk message ── */
	.co-bulk-msg {
		margin-bottom: 1rem;
		padding: 0.75rem;
		border-radius: 0.5rem;
		background: rgba(96, 165, 250, 0.08);
		border: 1px solid rgba(96, 165, 250, 0.15);
		color: rgba(96, 165, 250, 0.8);
		font-size: 0.85rem;
	}

	/* ── Stats ── */
	.co-stats-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}
	.co-stat-card {
		border-radius: 0.5rem;
		border: 1px solid rgba(212, 199, 163, 0.08);
		background: rgba(0, 0, 0, 0.2);
		padding: 0.75rem;
		text-align: center;
	}
	.co-stat-value { font-size: 1.5rem; font-weight: 700; }
	.co-stat-label { font-size: 0.6875rem; color: rgba(212, 199, 163, 0.3); margin-top: 0.125rem; }
	.co-stat-default { color: rgba(212, 199, 163, 0.6); }
	.co-stat-green { color: #34d399; }
	.co-stat-blue { color: rgba(96, 165, 250, 0.9); }
	.co-stat-red { color: #f87171; }
	.co-stat-muted { color: rgba(212, 199, 163, 0.25); }

	/* ── Filter bar ── */
	.co-filter-bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	.co-search-input {
		flex: 1;
		max-width: 16rem;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(212, 199, 163, 0.1);
		border-radius: 0.375rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.85rem;
		color: rgba(212, 199, 163, 0.9);
	}
	.co-search-input::placeholder { color: rgba(212, 199, 163, 0.25); }
	.co-search-input:focus { outline: none; border-color: rgba(96, 165, 250, 0.4); }
	.co-filter-tabs { display: flex; gap: 0.25rem; }
	.co-filter-btn {
		padding: 0.375rem 0.75rem;
		border-radius: 0.375rem;
		font-size: 0.7rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
		background: rgba(212, 199, 163, 0.04);
		border: 1px solid transparent;
		color: rgba(212, 199, 163, 0.3);
	}
	.co-filter-btn:hover { color: rgba(212, 199, 163, 0.6); }
	.co-filter-btn.active {
		background: rgba(96, 165, 250, 0.12);
		border-color: rgba(96, 165, 250, 0.25);
		color: rgba(96, 165, 250, 0.9);
	}
	.co-filter-count { font-size: 0.7rem; color: rgba(212, 199, 163, 0.25); margin-left: auto; }

	/* ── State list ── */
	.co-state-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.co-state-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(212, 199, 163, 0.06);
		background: rgba(0, 0, 0, 0.2);
		transition: border-color 0.15s;
	}
	.co-state-row:hover { border-color: rgba(212, 199, 163, 0.12); }

	/* ── State badge ── */
	.co-state-badge {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.375rem;
		background: rgba(96, 165, 250, 0.08);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.co-state-code {
		font-size: 0.85rem;
		font-weight: 700;
		color: rgba(96, 165, 250, 0.7);
		text-transform: uppercase;
	}

	/* ── State info ── */
	.co-state-info { flex: 1; min-width: 0; }
	.co-state-name-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.125rem; }
	.co-state-name { font-size: 0.85rem; font-weight: 500; color: rgba(212, 199, 163, 0.9); }
	.co-tag {
		font-size: 0.6rem;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
	}
	.co-tag-official { background: rgba(52, 211, 153, 0.1); color: #34d399; }
	.co-tag-scraped { background: rgba(212, 199, 163, 0.06); color: rgba(212, 199, 163, 0.25); }
	.co-confidence-dot { width: 0.375rem; height: 0.375rem; border-radius: 50%; flex-shrink: 0; }
	.co-confidence-high { background: #34d399; }
	.co-confidence-medium { background: #fbbf24; }
	.co-confidence-low { background: #f87171; }
	.co-format-tag {
		font-size: 0.6rem;
		color: rgba(212, 199, 163, 0.25);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
	}
	.co-state-meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.6875rem;
		color: rgba(212, 199, 163, 0.3);
	}
	.co-state-warning {
		color: rgba(251, 191, 36, 0.5);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 16rem;
	}

	/* ── Progress bar ── */
	.co-progress-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	.co-progress-track {
		flex: 1;
		height: 0.25rem;
		background: rgba(212, 199, 163, 0.08);
		border-radius: 9999px;
		overflow: hidden;
	}
	.co-progress-fill {
		height: 100%;
		background: rgba(96, 165, 250, 0.7);
		border-radius: 9999px;
		transition: width 0.5s;
	}
	.co-progress-label { font-size: 0.6rem; color: rgba(212, 199, 163, 0.3); }
	.co-error-text {
		margin-top: 0.25rem;
		font-size: 0.6rem;
		color: rgba(248, 113, 113, 0.6);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* ── Status badge ── */
	.co-status-badge-wrap { flex-shrink: 0; }
	.co-status-badge {
		font-size: 0.6rem;
		padding: 0.125rem 0.5rem;
		border-radius: 0.25rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
	}
	.co-status-complete { color: #34d399; background: rgba(52, 211, 153, 0.08); }
	.co-status-failed { color: #f87171; background: rgba(248, 113, 113, 0.08); }
	.co-status-extracting,
	.co-status-structuring,
	.co-status-chunking,
	.co-status-embedding,
	.co-status-graphing { color: rgba(96, 165, 250, 0.9); background: rgba(96, 165, 250, 0.08); }
	.co-status-queued { color: #fbbf24; background: rgba(251, 191, 36, 0.08); }
	.co-status-pending { color: rgba(212, 199, 163, 0.25); background: rgba(212, 199, 163, 0.04); }

	/* ── Actions ── */
	.co-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}
	.co-action-btn {
		font-size: 0.7rem;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		background: rgba(212, 199, 163, 0.04);
		border: 1px solid transparent;
		color: rgba(212, 199, 163, 0.4);
		cursor: pointer;
		text-decoration: none;
		transition: all 0.15s;
	}
	.co-action-btn:hover { color: rgba(96, 165, 250, 0.9); background: rgba(96, 165, 250, 0.08); }
	.co-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.co-external-link {
		color: rgba(212, 199, 163, 0.2);
		transition: color 0.15s;
	}
	.co-external-link:hover { color: rgba(96, 165, 250, 0.6); }

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	/* ── Upload btn ── */
	.co-upload-btn {
		color: rgba(167, 139, 250, 0.6);
	}
	.co-upload-btn:hover {
		color: rgba(167, 139, 250, 0.9);
		background: rgba(167, 139, 250, 0.08);
	}

	/* ── Upload modal ── */
	.co-modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
	}
	.co-modal {
		background: #141210;
		border: 1px solid rgba(212, 199, 163, 0.12);
		border-radius: 0.75rem;
		width: 100%;
		max-width: 28rem;
		padding: 1.5rem;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
	}
	.co-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.25rem;
	}
	.co-modal-title {
		font-size: 1rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.95);
		margin: 0;
	}
	.co-modal-close {
		cursor: pointer;
		color: rgba(212, 199, 163, 0.3);
		transition: color 0.15s;
		padding: 0.25rem;
	}
	.co-modal-close:hover { color: rgba(212, 199, 163, 0.7); }
	.co-modal-close:disabled { opacity: 0.3; cursor: not-allowed; }
	.co-modal-body { margin-bottom: 1.25rem; }
	.co-modal-hint {
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.4);
		line-height: 1.5;
		margin-bottom: 1rem;
	}
	.co-modal-hint strong { color: rgba(212, 199, 163, 0.7); font-weight: 600; }
	.co-modal-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	/* ── File picker ── */
	.co-file-label { display: block; cursor: pointer; }
	.co-file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.co-file-drop {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		border: 1px dashed rgba(167, 139, 250, 0.3);
		background: rgba(167, 139, 250, 0.04);
		transition: border-color 0.15s, background 0.15s;
	}
	.co-file-label:hover .co-file-drop {
		border-color: rgba(167, 139, 250, 0.55);
		background: rgba(167, 139, 250, 0.08);
	}
	.co-file-drop :global(svg) { color: rgba(167, 139, 250, 0.5); flex-shrink: 0; }
	.co-file-placeholder { font-size: 0.8rem; color: rgba(212, 199, 163, 0.3); }
	.co-file-name {
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.85);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
	}
	.co-file-size { font-size: 0.7rem; color: rgba(212, 199, 163, 0.3); flex-shrink: 0; }
	.co-upload-error {
		margin-top: 0.5rem;
		font-size: 0.75rem;
		color: #f87171;
	}
</style>
