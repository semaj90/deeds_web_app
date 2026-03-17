<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/ui/Icon.svelte';

	let { data }: { data: PageData } = $props();

	let uploading = $state(false);
	let uploadProgress = $state<{ stage: string; stageLabel: string; progress: number; status: string } | null>(null);
	let uploadError = $state<string | null>(null);
	let searchQ = $state('');
	let jurisdictionFilter = $state('all');
	let corpusFilter = $state('all');

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
		complete: 'text-green-400 bg-green-950/50',
		failed: 'text-red-400 bg-red-950/50',
		queued: 'text-sand/40 bg-sand/5',
		extracting: 'text-blue-400 bg-blue-950/50',
		structuring: 'text-blue-400 bg-blue-950/50',
		chunking: 'text-yellow-400 bg-yellow-950/50',
		embedding: 'text-purple-400 bg-purple-950/50',
		graphing: 'text-teal-400 bg-teal-950/50',
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
			// Listen to SSE progress
			const es = new EventSource(`/api/library/ingest/${jobId}`);
			es.onmessage = (evt) => {
				const info = JSON.parse(evt.data);
				uploadProgress = info;
				if (info.status === 'complete' || info.status === 'failed') {
					es.close();
					uploading = false;
					if (info.status === 'complete') {
						// Reload to show new document
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

<div class="min-h-screen bg-app-bg text-sand p-6">
	<!-- Header -->
	<header class="mb-8">
		<div class="flex items-start justify-between gap-4">
			<div>
				<h1 class="text-2xl font-bold text-sand">Legal Library</h1>
				<p class="text-sand/50 text-sm mt-0.5">
					Upload · Index · Search · Read — Constitutions, Statutes, Regulations, Case Law
				</p>
			</div>
			<div class="text-xs text-sand/30 text-right leading-relaxed">
				<div>{data.documents.length} documents indexed</div>
				<div>Sources: GovInfo · Open States · Upload</div>
			</div>
		</div>
	</header>

	<div class="grid grid-cols-[300px_1fr] gap-6">
		<!-- Left: Upload + Filters -->
		<aside class="flex flex-col gap-4">
			<!-- Quick nav -->
			<div class="flex gap-2">
				<a
					href="/library"
					class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded border border-accent/50 bg-accent/10 text-xs font-medium text-accent"
				>
					<Icon name="library" class="w-3.5 h-3.5" />
					Documents
				</a>
				<a
					href="/library/glossary"
					class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded border border-sand/15 bg-sand/5 text-xs font-medium text-sand/60 hover:border-accent/40 hover:text-accent transition-colors"
				>
					<Icon name="book-open" class="w-3.5 h-3.5" />
					Glossary
				</a>
			</div>

			<!-- Upload dropzone -->
			<div class="panel rounded-lg border border-sand/10 p-4">
				<h2 class="text-xs font-semibold text-sand/60 uppercase tracking-wider mb-3">Upload Document</h2>
				<form onsubmit={(e) => { e.preventDefault(); handleUpload(e); }}>
					<div class="border-2 border-dashed border-sand/15 rounded-lg p-4 text-center mb-3 hover:border-accent/40 transition-colors">
						<input
							type="file"
							name="file"
							accept=".pdf"
							class="block w-full text-sm text-sand/50 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-accent/20 file:text-accent cursor-pointer"
						/>
						<p class="text-sand/30 text-xs mt-2">PDF up to 200 MB</p>
					</div>

					<div class="flex flex-col gap-2 mb-3">
						<input
							type="text"
							name="title"
							placeholder="Title (optional — inferred from filename)"
							class="w-full bg-sand/5 border border-sand/10 rounded px-3 py-1.5 text-sm text-sand placeholder:text-sand/30 focus:outline-none focus:border-accent/50"
						/>
						<select
							name="corpusType"
							class="w-full bg-sand/5 border border-sand/10 rounded px-3 py-1.5 text-sm text-sand focus:outline-none focus:border-accent/50"
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
							class="w-full bg-sand/5 border border-sand/10 rounded px-3 py-1.5 text-sm text-sand focus:outline-none focus:border-accent/50"
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
						<input
							type="url"
							name="officialUrl"
							placeholder="Official source URL (optional)"
							class="w-full bg-sand/5 border border-sand/10 rounded px-3 py-1.5 text-sm text-sand placeholder:text-sand/30 focus:outline-none focus:border-accent/50"
						/>
					</div>

					<button
						type="submit"
						disabled={uploading}
						class="w-full py-2 rounded text-sm font-medium bg-accent text-black hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					>
						{uploading ? 'Processing…' : 'Upload & Ingest'}
					</button>
				</form>

				<!-- Progress -->
				{#if uploadProgress}
					<div class="mt-3 p-3 bg-sand/5 rounded border border-sand/10">
						<div class="flex items-center justify-between mb-1.5">
							<span class="text-xs text-sand/70">{uploadProgress.stageLabel}</span>
							<span class="text-xs text-sand/50">{Math.round(uploadProgress.progress)}%</span>
						</div>
						<div class="h-1.5 bg-sand/10 rounded-full overflow-hidden">
							<div
								class="h-full bg-accent rounded-full transition-all duration-300"
								style:width="{uploadProgress.progress}%"
							></div>
						</div>
						{#if uploadProgress.status === 'complete'}
							<p class="text-xs text-green-400 mt-1.5">✓ Indexing complete</p>
						{/if}
					</div>
				{/if}

				{#if uploadError}
					<p class="mt-2 text-xs text-red-400">{uploadError}</p>
				{/if}
			</div>

			<!-- Filters -->
			<div class="panel rounded-lg border border-sand/10 p-4">
				<h2 class="text-xs font-semibold text-sand/60 uppercase tracking-wider mb-3">Filter</h2>
				<div class="flex flex-col gap-2">
					<div>
						<label class="text-xs text-sand/40 mb-1 block">Jurisdiction</label>
						<select
							bind:value={jurisdictionFilter}
							class="w-full bg-sand/5 border border-sand/10 rounded px-2 py-1 text-xs text-sand focus:outline-none"
						>
							{#each jurisdictions as j}
								<option value={j}>{j === 'all' ? 'All jurisdictions' : j.toUpperCase()}</option>
							{/each}
						</select>
					</div>
					<div>
						<label class="text-xs text-sand/40 mb-1 block">Corpus type</label>
						<select
							bind:value={corpusFilter}
							class="w-full bg-sand/5 border border-sand/10 rounded px-2 py-1 text-xs text-sand focus:outline-none"
						>
							{#each corpusTypes as c}
								<option value={c}>{c === 'all' ? 'All types' : CORPUS_LABELS[c] ?? c}</option>
							{/each}
						</select>
					</div>
				</div>
			</div>
		</aside>

		<!-- Right: Document grid -->
		<main>
			<div class="mb-4">
				<input
					bind:value={searchQ}
					type="search"
					placeholder="Search documents…"
					class="w-full bg-sand/5 border border-sand/10 rounded-lg px-4 py-2 text-sm text-sand placeholder:text-sand/30 focus:outline-none focus:border-accent/40"
				/>
			</div>

			{#if filteredDocs.length === 0}
				<div class="text-center py-20 text-sand/30">
					<p class="text-4xl mb-3">⚖️</p>
					<p class="text-sm">No documents yet. Upload a PDF to begin.</p>
				</div>
			{:else}
				<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
					{#each filteredDocs as doc}
						<a
							href="/library/{doc.id}"
							class="panel rounded-lg border border-sand/10 p-4 hover:border-accent/30 transition-colors group"
						>
							<!-- Header row -->
							<div class="flex items-start justify-between gap-2 mb-2">
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-sand truncate group-hover:text-accent transition-colors">
										{doc.title}
									</p>
									{#if doc.citation}
										<p class="text-xs text-sand/40 font-mono">{doc.citation}</p>
									{/if}
								</div>
								<span
									class="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded {STATUS_COLOR[doc.processingStatus] ?? 'text-sand/40'}"
								>
									{doc.processingStatus}
								</span>
							</div>

							<!-- Badges -->
							<div class="flex items-center gap-1.5 flex-wrap mb-3">
								{#if doc.jurisdiction?.code}
									<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-700/30 font-mono">
										{doc.jurisdiction.code.toUpperCase()}
									</span>
								{/if}
								{#if doc.corpusType}
									<span class="text-[10px] px-1.5 py-0.5 rounded bg-sand/8 text-sand/50">
										{CORPUS_LABELS[doc.corpusType] ?? doc.corpusType}
									</span>
								{/if}
								{#if doc.isOfficial}
									<span class="text-[10px] px-1.5 py-0.5 rounded bg-green-950/60 text-green-400">✓ Official</span>
								{/if}
							</div>

							<!-- Stats -->
							<div class="flex items-center gap-3 text-[10px] text-sand/30">
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
		</main>
	</div>
</div>
