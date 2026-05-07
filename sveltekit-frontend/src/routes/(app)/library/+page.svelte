<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/ui/Icon.svelte';
	import CorpusStatsBar from '$lib/components/legal/CorpusStatsBar.svelte';
	import IngestionProgress from '$lib/components/legal/IngestionProgress.svelte';

	let { data }: { data: PageData } = $props();

	let uploading = $state(false);
	let ingestJobId = $state<string | null>(null);
	let uploadProgress = $state<{ stage: string; stageLabel: string; progress: number; status: string } | null>(null);
	let uploadError = $state<string | null>(null);
	let searchQ = $state('');
	let jurisdictionFilter = $state('all');
	let corpusFilter = $state('all');
	let showUpload = $state(false);

	const CORPUS_LABELS: Record<string, string> = {
		constitution: 'Constitution',
		statute: 'Statute',
		regulation: 'Regulation',
		bill: 'Bill',
		case: 'Case',
		glossary: 'Glossary',
		treatise: 'Treatise',
		other: 'Other',
	};

	const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
		complete: { color: '#34d399', bg: 'rgba(52, 211, 153, 0.1)' },
		failed: { color: '#f87171', bg: 'rgba(248, 113, 113, 0.1)' },
		queued: { color: 'rgba(212, 199, 163, 0.5)', bg: 'rgba(212, 199, 163, 0.06)' },
		extracting: { color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.1)' },
		structuring: { color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.1)' },
		chunking: { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)' },
		embedding: { color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.1)' },
		graphing: { color: '#2dd4bf', bg: 'rgba(45, 212, 191, 0.1)' },
	};

	const filteredDocs = $derived.by(() => {
		return data.documents.filter((d) => {
			if (jurisdictionFilter !== 'all' && d.jurisdiction?.code !== jurisdictionFilter) return false;
			if (corpusFilter !== 'all' && d.corpusType !== corpusFilter) return false;
			if (searchQ.trim()) {
				const q = searchQ.toLowerCase();
				return (
					d.title.toLowerCase().includes(q) ||
					(d.citation ?? '').toLowerCase().includes(q) ||
					(d.jurisdiction?.name ?? '').toLowerCase().includes(q)
				);
			}
			return true;
		});
	});

	const jurisdictions = $derived([
		'all',
		...new Set(data.documents.map((d) => d.jurisdiction?.code).filter(Boolean) as string[]),
	]);

	const corpusTypes = $derived([
		'all',
		...new Set(data.documents.map((d) => d.corpusType).filter(Boolean) as string[]),
	]);

	const stats = $derived({
		documents: data.documents.length,
		nodes: data.documents.reduce((s, d) => s + d.nodeCount, 0),
		chunks: data.documents.reduce((s, d) => s + d.chunkCount, 0),
		embeddings: data.documents.reduce((s, d) => s + d.chunkCount, 0),
	});

	async function handleUpload(e: Event) {
		const form = e.target as HTMLFormElement;
		const fd = new FormData(form);
		if (!fd.get('file') || (fd.get('file') as File).size === 0) return;

		uploading = true;
		uploadError = null;
		uploadProgress = null;

		try {
			const res = await fetch('/api/library/upload', { method: 'POST', body: fd, signal: AbortSignal.timeout(120_000) });
			const data = await res.json();
			if (!res.ok || !data.success) throw new Error(data.error ?? 'Upload failed');
			if (data.documentId && data.alreadyExists && !data.jobId) {
				location.href = `/library/${data.documentId}`;
				return;
			}

			const { jobId } = data;
			ingestJobId = jobId;
			uploading = false;
			// SSE progress handled by <IngestionProgress> component
		} catch (err) {
			uploading = false;
			uploadError = err instanceof Error ? err.message : 'Upload failed';
		}
	}
</script>

<svelte:head><title>Legal Library</title></svelte:head>

<div class="lib-page">
	<header class="lib-header">
		<div class="lib-header-left">
			<div class="lib-header-icon">
				<Icon name="library-big" />
			</div>
			<div>
				<h1 class="lib-title">Documents</h1>
				<p class="lib-subtitle">Upload · Index · Search · Read — Constitutions, Statutes, Regulations, Case Law</p>
			</div>
		</div>
		<div class="lib-header-right">
			<span class="lib-count">{data.documents.length} indexed</span>
			<button
				onclick={() => (showUpload = !showUpload)}
				class="lib-upload-btn"
			>
				<Icon name="upload" />
				Upload
			</button>
		</div>
	</header>

	<div class="lib-stats">
		<CorpusStatsBar {stats} />
	</div>

	{#if showUpload}
		<div class="lib-upload-panel">
			<h2 class="lib-section-label">Upload Document</h2>
			<form onsubmit={(e) => { e.preventDefault(); handleUpload(e); }}>
				<div class="lib-dropzone">
					<input
						type="file"
						name="file"
						accept=".pdf"
						class="lib-file-input"
					/>
					<p class="lib-dropzone-hint">PDF up to 200 MB</p>
				</div>

				<div class="lib-upload-fields">
					<input
						type="text"
						name="title"
						placeholder="Title (optional — inferred from filename)"
						class="lib-input"
					/>
					<div class="lib-upload-row">
						<select name="corpusType" class="lib-input">
							<option value="constitution">Constitution</option>
							<option value="statute">Statute</option>
							<option value="regulation">Regulation</option>
							<option value="case">Case Law</option>
							<option value="treatise">Treatise</option>
							<option value="other" selected>Other</option>
						</select>
						<select name="jurisdiction" class="lib-input">
							<option value="federal">Federal</option>
							<option value="ca">California</option>
							<option value="ny">New York</option>
							<option value="tx">Texas</option>
							<option value="fl">Florida</option>
							<option value="wa">Washington</option>
							<option value="or">Oregon</option>
							<option value="co">Colorado</option>
						</select>
					</div>
					<input
						type="url"
						name="officialUrl"
						placeholder="Official source URL (optional)"
						class="lib-input"
					/>
				</div>

				<button type="submit" disabled={uploading} class="lib-submit-btn">
					{uploading ? 'Processing…' : 'Upload & Ingest'}
				</button>
			</form>

			{#if ingestJobId}
				<IngestionProgress
					jobId={ingestJobId}
					onComplete={() => { ingestJobId = null; setTimeout(() => location.reload(), 800); }}
				/>
			{/if}

			{#if uploadError}
				<p class="lib-error">{uploadError}</p>
			{/if}
		</div>
	{/if}

	<!-- Filters -->
	<div class="lib-filters">
		<div class="lib-search-wrap">
			<input
				bind:value={searchQ}
				type="search"
				placeholder="Search documents…"
				class="lib-input"
			/>
		</div>
		<select bind:value={jurisdictionFilter} class="lib-input lib-select">
			{#each jurisdictions as j}
				<option value={j}>{j === 'all' ? 'All jurisdictions' : j.toUpperCase()}</option>
			{/each}
		</select>
		<select bind:value={corpusFilter} class="lib-input lib-select">
			{#each corpusTypes as c}
				<option value={c}>{c === 'all' ? 'All types' : CORPUS_LABELS[c] ?? c}</option>
			{/each}
		</select>
		<span class="lib-result-count">{filteredDocs.length} results</span>
	</div>

	<!-- Document Grid -->
	{#if filteredDocs.length === 0}
		<div class="lib-empty">
			<Icon name="library-big" class="lib-empty-icon" />
			<p>No documents yet. Upload a PDF to begin.</p>
		</div>
	{:else}
		<div class="lib-grid">
			{#each filteredDocs as doc}
				{@const statusStyle = STATUS_STYLE[doc.processingStatus] ?? { color: 'rgba(212,199,163,0.5)', bg: 'rgba(212,199,163,0.06)' }}
				<a href="/library/{doc.id}" class="lib-card">
					<div class="lib-card-top">
						<div class="lib-card-title-area">
							<p class="lib-card-title">{doc.title}</p>
							{#if doc.citation}
								<p class="lib-card-citation">{doc.citation}</p>
							{/if}
						</div>
						<span
							class="lib-status-badge"
							style="color: {statusStyle.color}; background: {statusStyle.bg}"
						>
							{doc.processingStatus}
						</span>
					</div>

					<div class="lib-card-badges">
						{#if doc.jurisdiction?.code}
							<span class="lib-badge jurisdiction">{doc.jurisdiction.code.toUpperCase()}</span>
						{/if}
						{#if doc.corpusType}
							<span class="lib-badge corpus">{CORPUS_LABELS[doc.corpusType] ?? doc.corpusType}</span>
						{/if}
						{#if doc.isOfficial}
							<span class="lib-badge official">Official</span>
						{/if}
					</div>

					<div class="lib-card-meta">
						{#if doc.pageCount}
							<span>{doc.pageCount} pages</span>
						{/if}
						{#if doc.nodeCount > 0}
							<span>{doc.nodeCount} sections</span>
						{/if}
						{#if doc.chunkCount > 0}
							<span>{doc.chunkCount} chunks</span>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* ── Page ── */
	.lib-page {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		min-height: 100vh;
		background: #0e0d0b;
		margin: -2.5rem;
		padding: 2.5rem;
	}

	.lib-page :global(h1), .lib-page :global(h2), .lib-page :global(h3), .lib-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.lib-page :global(a) { color: inherit; border-bottom: none; }
	.lib-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.lib-page :global(input), .lib-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.lib-page :global([class*="panel"]), .lib-page :global(.card) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	/* ── Header ── */
	.lib-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}
	.lib-header-left {
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
	}
	.lib-header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 0.625rem;
		background: linear-gradient(135deg, rgba(196, 117, 43, 0.15), rgba(167, 139, 250, 0.15));
		border: 1px solid rgba(196, 117, 43, 0.25);
		color: rgba(196, 117, 43, 0.9);
		flex-shrink: 0;
	}
	.lib-title {
		font-size: 1.375rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.95);
		margin: 0;
		letter-spacing: -0.01em;
	}
	.lib-subtitle { font-size: 0.75rem; color: rgba(212, 199, 163, 0.4); margin-top: 0.125rem; }
	.lib-header-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.lib-count { font-size: 0.7rem; color: rgba(212, 199, 163, 0.35); }
	.lib-upload-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.4375rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 600;
		background: rgba(96, 165, 250, 0.12);
		color: rgba(96, 165, 250, 0.9);
		border: 1px solid rgba(96, 165, 250, 0.3);
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.lib-upload-btn:hover { background: rgba(96, 165, 250, 0.2); border-color: rgba(96, 165, 250, 0.5); }

	/* ── Stats ── */
	.lib-stats { margin: 0; }

	/* ── Upload Panel ── */
	.lib-upload-panel {
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.5rem;
		padding: 1rem;
		max-width: 36rem;
	}
	.lib-section-label {
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: rgba(212, 199, 163, 0.4);
		margin: 0 0 0.75rem;
	}
	.lib-dropzone {
		border: 2px dashed rgba(212, 199, 163, 0.12);
		border-radius: 0.5rem;
		padding: 1rem;
		text-align: center;
		margin-bottom: 0.75rem;
		transition: border-color 0.15s;
	}
	.lib-dropzone:hover { border-color: rgba(96, 165, 250, 0.3); }
	.lib-file-input {
		display: block;
		width: 100%;
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.6);
		cursor: pointer;
	}
	.lib-file-input::file-selector-button {
		margin-right: 0.5rem;
		padding: 0.25rem 0.75rem;
		border-radius: 0.25rem;
		border: none;
		font-size: 0.7rem;
		background: rgba(96, 165, 250, 0.1);
		color: rgba(96, 165, 250, 0.9);
		cursor: pointer;
	}
	.lib-dropzone-hint { font-size: 0.7rem; color: rgba(212, 199, 163, 0.3); margin-top: 0.5rem; }
	.lib-upload-fields { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem; }
	.lib-upload-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
	.lib-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(212, 199, 163, 0.12);
		color: rgba(212, 199, 163, 0.9);
		font-size: 0.8rem;
	}
	.lib-input::placeholder { color: rgba(212, 199, 163, 0.35); }
	.lib-input:focus { border-color: rgba(96, 165, 250, 0.5); outline: none; }
	.lib-select { width: auto; }
	.lib-submit-btn {
		width: 100%;
		padding: 0.5rem;
		border-radius: 0.5rem;
		font-size: 0.8rem;
		font-weight: 600;
		background: rgba(96, 165, 250, 0.15);
		color: rgba(96, 165, 250, 0.9);
		border: 1px solid rgba(96, 165, 250, 0.3);
		cursor: pointer;
		transition: all 0.15s;
	}
	.lib-submit-btn:hover { background: rgba(96, 165, 250, 0.25); }
	.lib-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

	/* ── Progress ── */
	.lib-progress {
		margin-top: 0.75rem;
		padding: 0.75rem;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(212, 199, 163, 0.06);
		border-radius: 0.5rem;
	}
	.lib-progress-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.375rem;
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.5);
	}
	.lib-progress-track {
		height: 0.375rem;
		background: rgba(212, 199, 163, 0.08);
		border-radius: 9999px;
		overflow: hidden;
	}
	.lib-progress-fill {
		height: 100%;
		background: rgba(96, 165, 250, 0.7);
		border-radius: 9999px;
		transition: width 0.3s;
	}
	.lib-progress-done { font-size: 0.7rem; color: #34d399; margin-top: 0.375rem; }
	.lib-error { font-size: 0.7rem; color: #f87171; margin-top: 0.5rem; }

	/* ── Filters ── */
	.lib-filters {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.lib-search-wrap { flex: 1; max-width: 20rem; }
	.lib-result-count { font-size: 0.7rem; color: rgba(212, 199, 163, 0.3); margin-left: auto; }

	/* ── Document Grid ── */
	.lib-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
	}
	@media (max-width: 1024px) { .lib-grid { grid-template-columns: repeat(2, 1fr); } }
	@media (max-width: 640px) { .lib-grid { grid-template-columns: 1fr; } }

	.lib-card {
		display: block;
		text-decoration: none;
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 0.5rem;
		padding: 1rem;
		transition: border-color 0.15s, transform 0.15s;
	}
	.lib-card:hover {
		border-color: rgba(96, 165, 250, 0.3);
		transform: translateY(-1px);
	}

	.lib-card-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.lib-card-title-area { flex: 1; min-width: 0; }
	.lib-card-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		transition: color 0.15s;
	}
	.lib-card:hover .lib-card-title { color: rgba(96, 165, 250, 0.9); }
	.lib-card-citation {
		font-size: 0.68rem;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: rgba(212, 199, 163, 0.4);
		margin: 0.125rem 0 0;
	}
	.lib-status-badge {
		flex-shrink: 0;
		font-size: 0.6rem;
		font-weight: 600;
		padding: 0.15rem 0.4rem;
		border-radius: 0.25rem;
		text-transform: capitalize;
	}

	/* ── Badges ── */
	.lib-card-badges {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		flex-wrap: wrap;
		margin-bottom: 0.625rem;
	}
	.lib-badge {
		font-size: 0.6rem;
		font-weight: 600;
		padding: 0.125rem 0.4rem;
		border-radius: 0.25rem;
		border: 1px solid;
	}
	.lib-badge.jurisdiction {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		color: rgba(96, 165, 250, 0.8);
		background: rgba(96, 165, 250, 0.08);
		border-color: rgba(96, 165, 250, 0.2);
	}
	.lib-badge.corpus {
		color: rgba(212, 199, 163, 0.5);
		background: rgba(212, 199, 163, 0.04);
		border-color: rgba(212, 199, 163, 0.12);
	}
	.lib-badge.official {
		color: #34d399;
		background: rgba(52, 211, 153, 0.08);
		border-color: rgba(52, 211, 153, 0.2);
	}

	/* ── Card meta ── */
	.lib-card-meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.6rem;
		color: rgba(212, 199, 163, 0.3);
	}

	/* ── Empty state ── */
	.lib-empty {
		text-align: center;
		padding: 5rem 0;
		color: rgba(212, 199, 163, 0.3);
	}
	:global(.lib-empty-icon) { width: 3rem; height: 3rem; margin: 0 auto 0.75rem; opacity: 0.3; }
	.lib-empty p { font-size: 0.85rem; margin: 0; }
</style>
