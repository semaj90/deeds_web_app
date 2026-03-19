<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/ui/Icon.svelte';
	import CorpusStatsBar from '$lib/components/legal/CorpusStatsBar.svelte';

	let { data }: { data: PageData } = $props();

	let uploading = $state(false);
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

	const STATUS_COLOR: Record<string, string> = {
		complete: 'text-green-700 bg-green-50',
		failed: 'text-red-700 bg-red-50',
		queued: 'text-gray-500 bg-gray-50',
		extracting: 'text-blue-700 bg-blue-50',
		structuring: 'text-blue-700 bg-blue-50',
		chunking: 'text-amber-700 bg-amber-50',
		embedding: 'text-purple-700 bg-purple-50',
		graphing: 'text-teal-700 bg-teal-50',
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
			const res = await fetch('/api/library/upload', { method: 'POST', body: fd });
			const data = await res.json();
			if (!res.ok || !data.success) throw new Error(data.error ?? 'Upload failed');

			const { jobId } = data;
			const es = new EventSource(`/api/library/ingest/${jobId}`);
			es.onmessage = (evt) => {
				const info = JSON.parse(evt.data);
				uploadProgress = info;
				if (info.status === 'complete' || info.status === 'failed') {
					es.close();
					uploading = false;
					if (info.status === 'complete') {
						setTimeout(() => location.reload(), 800);
					} else {
						uploadError = info.errorText ?? 'Ingestion failed';
					}
				}
			};
			es.onerror = () => {
				es.close();
				uploading = false;
				uploadError = 'Lost connection to server';
			};
		} catch (err) {
			uploading = false;
			uploadError = err instanceof Error ? err.message : 'Upload failed';
		}
	}
</script>

<svelte:head><title>Legal Library</title></svelte:head>

<div class="library-page">
	<header class="mb-6">
		<div class="flex items-start justify-between gap-4">
			<div>
				<h1 class="text-2xl font-bold text-research-text">Documents</h1>
				<p class="text-research-text-muted text-sm mt-0.5">
					Upload · Index · Search · Read — Constitutions, Statutes, Regulations, Case Law
				</p>
			</div>
			<div class="flex items-center gap-3">
				<span class="text-xs text-research-text-muted">{data.documents.length} indexed</span>
				<button
					onclick={() => (showUpload = !showUpload)}
					class="rs-btn rs-btn-primary text-xs"
				>
					<Icon name="upload" class="w-3.5 h-3.5" />
					Upload
				</button>
			</div>
		</div>
	</header>

	<div class="mb-6">
		<CorpusStatsBar {stats} />
	</div>

	{#if showUpload}
		<div class="mb-6 rs-panel p-4 max-w-xl">
			<h2 class="text-xs font-semibold text-research-text-secondary uppercase tracking-wider mb-3">Upload Document</h2>
			<form onsubmit={(e) => { e.preventDefault(); handleUpload(e); }}>
				<div class="border-2 border-dashed border-research-border rounded-lg p-4 text-center mb-3 hover:border-research-accent/40 transition-colors">
					<input
						type="file"
						name="file"
						accept=".pdf"
						class="block w-full text-sm text-research-text-secondary file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-research-accent/10 file:text-research-accent cursor-pointer"
					/>
					<p class="text-research-text-muted text-xs mt-2">PDF up to 200 MB</p>
				</div>

				<div class="flex flex-col gap-2 mb-3">
					<input
						type="text"
						name="title"
						placeholder="Title (optional — inferred from filename)"
						class="rs-input"
					/>
					<div class="grid grid-cols-2 gap-2">
						<select
							name="corpusType"
							class="rs-input"
						>
							<option value="constitution">Constitution</option>
							<option value="statute">Statute</option>
							<option value="regulation">Regulation</option>
							<option value="case">Case Law</option>
							<option value="treatise">Treatise</option>
							<option value="other" selected>Other</option>
						</select>
						<select
							name="jurisdiction"
							class="rs-input"
						>
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
						class="rs-input"
					/>
				</div>

				<button
					type="submit"
					disabled={uploading}
					class="w-full py-2 rounded-lg text-sm font-medium rs-btn-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				>
					{uploading ? 'Processing…' : 'Upload & Ingest'}
				</button>
			</form>

			{#if uploadProgress}
				<div class="mt-3 p-3 bg-research-surface-alt rounded-lg border border-research-border">
					<div class="flex items-center justify-between mb-1.5">
						<span class="text-xs text-research-text-secondary">{uploadProgress.stageLabel}</span>
						<span class="text-xs text-research-text-muted">{Math.round(uploadProgress.progress)}%</span>
					</div>
					<div class="h-1.5 bg-research-border rounded-full overflow-hidden">
						<div
							class="h-full bg-research-accent rounded-full transition-all duration-300"
							style:width="{uploadProgress.progress}%"
						></div>
					</div>
					{#if uploadProgress.status === 'complete'}
						<p class="text-xs text-research-success mt-1.5">Indexing complete</p>
					{/if}
				</div>
			{/if}

			{#if uploadError}
				<p class="mt-2 text-xs text-research-danger">{uploadError}</p>
			{/if}
		</div>
	{/if}

	<div class="flex items-center gap-3 mb-5">
		<div class="flex-1 max-w-md">
			<input
				bind:value={searchQ}
				type="search"
				placeholder="Search documents…"
				class="rs-input"
			/>
		</div>
		<select
			bind:value={jurisdictionFilter}
			class="rs-input w-auto"
		>
			{#each jurisdictions as j}
				<option value={j}>{j === 'all' ? 'All jurisdictions' : j.toUpperCase()}</option>
			{/each}
		</select>
		<select
			bind:value={corpusFilter}
			class="rs-input w-auto"
		>
			{#each corpusTypes as c}
				<option value={c}>{c === 'all' ? 'All types' : CORPUS_LABELS[c] ?? c}</option>
			{/each}
		</select>
		<span class="text-xs text-research-text-muted ml-auto">{filteredDocs.length} results</span>
	</div>

	{#if filteredDocs.length === 0}
		<div class="text-center py-20 text-research-text-muted">
			<Icon name="library-big" class="w-12 h-12 mx-auto mb-3 opacity-30" />
			<p class="text-sm">No documents yet. Upload a PDF to begin.</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
			{#each filteredDocs as doc}
				<a
					href="/library/{doc.id}"
					class="rs-card block group"
				>
					<div class="flex items-start justify-between gap-2 mb-2">
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium text-research-text truncate group-hover:text-research-accent transition-colors">
								{doc.title}
							</p>
							{#if doc.citation}
								<p class="text-xs text-research-text-muted font-mono">{doc.citation}</p>
							{/if}
						</div>
						<span
							class="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded {STATUS_COLOR[doc.processingStatus] ?? 'text-research-text-muted'}"
						>
							{doc.processingStatus}
						</span>
					</div>

					<div class="flex items-center gap-1.5 flex-wrap mb-3">
						{#if doc.jurisdiction?.code}
							<span class="rs-badge rs-badge-statute font-mono">
								{doc.jurisdiction.code.toUpperCase()}
							</span>
						{/if}
						{#if doc.corpusType}
							<span class="rs-badge bg-gray-50 text-gray-600 border border-gray-200">
								{CORPUS_LABELS[doc.corpusType] ?? doc.corpusType}
							</span>
						{/if}
						{#if doc.isOfficial}
							<span class="rs-badge bg-green-50 text-green-700 border border-green-200">Official</span>
						{/if}
					</div>

					<div class="flex items-center gap-3 text-[10px] text-research-text-muted">
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
	.library-page {
		color: #1a1a1a;
		font-family: 'Inter', system-ui, sans-serif;
	}

	.library-page :global(a) {
		text-decoration: none;
	}
</style>
