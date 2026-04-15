<script module>
	export const ssr = false;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	// ── Types ─────────────────────────────────────────────────────────────────

	interface LibraryDoc {
		id: string;
		title: string;
		shortTitle?: string;
		citation?: string;
		corpusType: string;
		processingStatus: string;
		jurisdictionCode?: string;
		jurisdiction?: string;
		pageCount?: number;
		nodeCount: number;
		chunkCount: number;
		isOfficial: boolean;
		createdAt: string;
	}

	interface IngestionJob {
		jobId: string;
		documentId: string;
		title: string;
		stage: string;
		progress: number;
		status: string;
		metrics?: Record<string, unknown>;
	}

	interface ScanResult {
		created: number;
		updated: number;
		skipped: number;
		files: string[];
	}

	// ── Constants ─────────────────────────────────────────────────────────────

	const CORPUS_TYPES = [
		{ value: 'constitution', label: 'Constitution' },
		{ value: 'statute',      label: 'Statute' },
		{ value: 'regulation',   label: 'Regulation' },
		{ value: 'bill',         label: 'Bill' },
		{ value: 'case',         label: 'Court Case' },
		{ value: 'glossary',     label: 'Glossary' },
		{ value: 'treatise',     label: 'Treatise' },
		{ value: 'other',        label: 'Other' },
	];

	const STAGES = ['queued', 'extracting', 'ocr', 'structuring', 'chunking', 'embedding', 'graphing', 'complete'];

	const STAGE_LABELS: Record<string, string> = {
		queued:      'Queued',
		extracting:  'Extracting text',
		ocr:         'Running OCR',
		structuring: 'Detecting structure',
		chunking:    'Chunking sections',
		embedding:   'Generating embeddings',
		graphing:    'Building citation graph',
		complete:    'Complete',
		failed:      'Failed',
	};

	const STATUS_COLORS: Record<string, string> = {
		complete:    'text-emerald-400',
		failed:      'text-red-400',
		queued:      'text-gray-400',
		extracting:  'text-sky-400',
		ocr:         'text-sky-400',
		structuring: 'text-indigo-400',
		chunking:    'text-violet-400',
		embedding:   'text-purple-400',
		graphing:    'text-fuchsia-400',
	};

	// ── State ─────────────────────────────────────────────────────────────────

	let activeTab = $state<'upload' | 'codebase' | 'guide'>('upload');

	// Upload form
	let dragOver    = $state(false);
	let selectedFile = $state<File | null>(null);
	let uploading   = $state(false);
	let uploadError = $state<string | null>(null);
	let uploadSuccess = $state<string | null>(null);
	let title       = $state('');
	let corpusType  = $state('other');
	let jurisdiction = $state('federal');
	let citation    = $state('');
	let officialUrl = $state('');
	let isOfficial  = $state(false);

	// Codebase scan
	let scanRunning = $state(false);
	let scanResult  = $state<ScanResult | null>(null);
	let scanError   = $state<string | null>(null);
	let scanExpanded = $state(false);

	// Active ingestion jobs
	let activeJobs = $state<IngestionJob[]>([]);
	let jobPollers = new Map<string, ReturnType<typeof setInterval>>();

	// Document library
	let docs        = $state<LibraryDoc[]>([]);
	let docsLoading = $state(false);
	let docsFilter  = $state({ q: '', corpusType: '', status: '' });
	let docsTotal   = $state(0);

	// ── Derived ───────────────────────────────────────────────────────────────

	let canUpload = $derived(selectedFile !== null && title.trim().length > 0 && !uploading);

	let stats = $derived.by(() => ({
		total:       docsTotal,
		complete:    docs.filter(d => d.processingStatus === 'complete').length,
		totalChunks: docs.reduce((s, d) => s + (d.chunkCount ?? 0), 0),
		pending:     docs.filter(d => !['complete','failed'].includes(d.processingStatus)).length,
	}));

	// ── File Handling ─────────────────────────────────────────────────────────

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const file = e.dataTransfer?.files[0];
		if (file) setFile(file);
	}

	function onFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) setFile(file);
	}

	function setFile(file: File) {
		if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
			uploadError = 'Only PDF files are accepted';
			return;
		}
		selectedFile = file;
		uploadError = null;
		if (!title) title = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
	}

	// ── Upload ────────────────────────────────────────────────────────────────

	async function handleUpload() {
		if (!canUpload) return;
		uploading = true;
		uploadError = null;
		uploadSuccess = null;

		const fd = new FormData();
		fd.append('file',         selectedFile!);
		fd.append('title',        title.trim());
		fd.append('corpusType',   corpusType);
		fd.append('jurisdiction', jurisdiction.trim() || 'federal');
		if (citation.trim())    fd.append('citation',    citation.trim());
		if (officialUrl.trim()) fd.append('officialUrl', officialUrl.trim());

		try {
			const res  = await fetch('/api/library/upload', { method: 'POST', body: fd });
			const data = await res.json();
			if (!res.ok || !data.success) { uploadError = data.error ?? 'Upload failed'; return; }

			if (data.alreadyExists) {
				uploadSuccess = 'Document already exists in library — skipped duplicate';
			} else {
				uploadSuccess = `"${title.trim()}" queued for ingestion`;
				activeJobs = [...activeJobs, {
					jobId: data.jobId, documentId: data.documentId,
					title: title.trim(), stage: 'queued', progress: 0, status: 'queued',
				}];
				pollJob(data.jobId);
			}

			// Reset form
			selectedFile = null; title = ''; corpusType = 'other';
			jurisdiction = 'federal'; citation = ''; officialUrl = ''; isOfficial = false;
			loadDocs();
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploading = false;
		}
	}

	// ── Job Polling ───────────────────────────────────────────────────────────

	function pollJob(jobId: string) {
		const poll = async () => {
			try {
				const res  = await fetch(`/api/library/ingest/${jobId}`, { headers: { Accept: 'application/json' } });
				if (!res.ok) return;
				const data = await res.json();

				activeJobs = activeJobs.map(j =>
					j.jobId === jobId
						? { ...j, stage: data.stage ?? j.stage, progress: data.progress ?? j.progress, status: data.status ?? j.status, metrics: data.metrics }
						: j
				);

				if (data.status === 'complete' || data.status === 'failed') {
					clearInterval(jobPollers.get(jobId));
					jobPollers.delete(jobId);
					loadDocs();
					setTimeout(() => { activeJobs = activeJobs.filter(j => j.jobId !== jobId); }, 8000);
				}
			} catch { /* silent — will retry next interval */ }
		};

		poll();
		const interval = setInterval(poll, 2500);
		jobPollers.set(jobId, interval);
	}

	// ── Codebase Scan ─────────────────────────────────────────────────────────

	async function scanCodebaseDocs() {
		scanRunning = true;
		scanError   = null;
		scanResult  = null;
		try {
			const res  = await fetch('/api/library/ingest-codebase-docs', { method: 'POST' });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? 'Scan failed');
			scanResult  = data;
			scanExpanded = false;
			loadDocs();
		} catch (err) {
			scanError = err instanceof Error ? err.message : 'Scan failed';
		} finally {
			scanRunning = false;
		}
	}

	// ── Document Library ──────────────────────────────────────────────────────

	async function loadDocs() {
		docsLoading = true;
		try {
			const params = new URLSearchParams({ limit: '40', offset: '0' });
			if (docsFilter.q)          params.set('q',          docsFilter.q);
			if (docsFilter.corpusType) params.set('corpusType', docsFilter.corpusType);
			if (docsFilter.status)     params.set('status',     docsFilter.status);

			const res  = await fetch(`/api/library/documents?${params}`);
			if (!res.ok) return;
			const data = await res.json();
			docs      = data.documents ?? [];
			docsTotal = data.total ?? 0;
		} finally {
			docsLoading = false;
		}
	}

	async function deleteDoc(id: string) {
		if (!confirm('Remove this document from the library? Chunks and embeddings will be deleted.')) return;
		try {
			const res = await fetch(`/api/library/documents/${id}`, { method: 'DELETE' });
			if (res.ok) { docs = docs.filter(d => d.id !== id); docsTotal = Math.max(0, docsTotal - 1); }
		} catch { /* silent */ }
	}

	// Initial load on mount; filter effect handles subsequent changes
	onMount(() => loadDocs());

	let filterInitialized = false;
	$effect(() => {
		void docsFilter.q;
		void docsFilter.corpusType;
		void docsFilter.status;
		if (!filterInitialized) { filterInitialized = true; return; }
		const t = setTimeout(loadDocs, 300);
		return () => clearTimeout(t);
	});

	// ── Helpers ───────────────────────────────────────────────────────────────

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function formatSize(file: File) {
		const mb = file.size / 1024 / 1024;
		return mb < 1 ? `${Math.round(file.size / 1024)} KB` : `${mb.toFixed(1)} MB`;
	}
</script>

<!-- ═══════════════════════════════════════════════════════════════════════════ -->
<!-- Layout                                                                      -->
<!-- ═══════════════════════════════════════════════════════════════════════════ -->

<div class="min-h-screen bg-[#0d0d0f] text-gray-100 p-6">
<div class="max-w-6xl mx-auto space-y-6">

	<!-- ── Header ─────────────────────────────────────────────────────────── -->
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-xl font-semibold text-white tracking-tight">Legal Library Admin</h1>
			<p class="text-xs text-gray-500 mt-0.5">Ingest, chunk, embed, and index legal documents for hybrid search</p>
		</div>
		<div class="flex items-center gap-3 text-xs text-gray-500 shrink-0 pt-1">
			<span class="flex items-center gap-1.5">
				<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
				Pipeline active
			</span>
			<span class="text-gray-700">|</span>
			<span>{docsTotal} documents</span>
			{#if stats.totalChunks > 0}
				<span class="text-gray-700">|</span>
				<span>{stats.totalChunks.toLocaleString()} chunks</span>
			{/if}
		</div>
	</div>

	<!-- ── Stats Pills ────────────────────────────────────────────────────── -->
	{#if docsTotal > 0}
		<div class="flex items-center gap-2 flex-wrap">
			<span class="px-3 py-1 rounded-full bg-white/4 border border-white/8 text-xs text-gray-300">
				<span class="text-white font-medium">{stats.complete}</span> complete
			</span>
			{#if stats.pending > 0}
				<span class="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
					<span class="font-medium">{stats.pending}</span> processing
				</span>
			{/if}
			{#if stats.totalChunks > 0}
				<span class="px-3 py-1 rounded-full bg-white/4 border border-white/8 text-xs text-gray-300">
					<span class="text-white font-medium">{stats.totalChunks.toLocaleString()}</span> indexed chunks
				</span>
			{/if}
		</div>
	{/if}

	<!-- ── Tab Bar ────────────────────────────────────────────────────────── -->
	<div class="flex items-center gap-1 border-b border-white/8 pb-0">
		{#each [['upload','upload-cloud','Upload PDF'], ['codebase','folder-code','Codebase Docs'], ['guide','book-open','Dev Guide']] as [tab, icon, label]}
			<button
				onclick={() => { activeTab = tab as typeof activeTab; }}
				class="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px
					{activeTab === tab
						? 'border-indigo-500 text-white'
						: 'border-transparent text-gray-500 hover:text-gray-300'}"
			>
				<Icon name={icon} class="w-3.5 h-3.5" />
				{label}
			</button>
		{/each}
	</div>

	<!-- ── Tab: Upload PDF ────────────────────────────────────────────────── -->
	{#if activeTab === 'upload'}
		<div class="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
			<div class="px-6 py-4 border-b border-white/8 flex items-center justify-between">
				<h2 class="text-sm font-medium text-gray-200">Ingest Document</h2>
				<span class="text-xs text-gray-600">PDF only · max 200 MB</span>
			</div>

			<div class="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">

				<!-- Drop Zone -->
				<div>
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						role="button"
						tabindex="0"
						aria-label="Upload PDF — click or drop file"
						class="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed
							transition-all cursor-pointer min-h-44 select-none
							{dragOver ? 'border-indigo-400 bg-indigo-500/8' : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'}"
						ondragover={(e) => { e.preventDefault(); dragOver = true; }}
						ondragleave={() => { dragOver = false; }}
						ondrop={onDrop}
						onclick={() => document.getElementById('fileInput')?.click()}
						onkeydown={(e) => e.key === 'Enter' && document.getElementById('fileInput')?.click()}
					>
						<input id="fileInput" type="file" accept=".pdf,application/pdf" class="sr-only" onchange={onFileInput} />

						{#if selectedFile}
							<div class="text-center px-4 py-2">
								<div class="w-10 h-10 rounded-full bg-indigo-500/15 flex items-center justify-center mx-auto mb-3">
									<Icon name="file-text" class="w-5 h-5 text-indigo-400" />
								</div>
								<p class="text-sm font-medium text-white">{selectedFile.name}</p>
								<p class="text-xs text-gray-400 mt-1">{formatSize(selectedFile)}</p>
								<button
									class="mt-3 text-xs text-gray-600 hover:text-gray-400 underline underline-offset-2"
									onclick={(e) => { e.stopPropagation(); selectedFile = null; title = ''; }}
								>Change file</button>
							</div>
						{:else}
							<div class="text-center px-6">
								<div class="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
									<Icon name="upload-cloud" class="w-5 h-5 text-gray-400" />
								</div>
								<p class="text-sm text-gray-300">Drop PDF here or <span class="text-indigo-400">browse</span></p>
								<p class="text-xs text-gray-600 mt-1">PDF only · up to 200 MB</p>
							</div>
						{/if}
					</div>

					{#if uploadError}
						<p class="flex items-center gap-1.5 text-xs text-red-400 mt-2">
							<Icon name="alert-circle" class="w-3.5 h-3.5 shrink-0" />{uploadError}
						</p>
					{/if}
					{#if uploadSuccess}
						<p class="flex items-center gap-1.5 text-xs text-emerald-400 mt-2">
							<Icon name="check-circle" class="w-3.5 h-3.5 shrink-0" />{uploadSuccess}
						</p>
					{/if}
				</div>

				<!-- Metadata Form -->
				<div class="space-y-4">
					<div>
						<label class="block text-xs font-medium text-gray-400 mb-1.5" for="doc-title">Title *</label>
						<input
							id="doc-title"
							type="text"
							bind:value={title}
							placeholder="e.g. California Penal Code 2024"
							class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white
								placeholder-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1
								focus:ring-indigo-500/30 transition-colors"
						/>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="block text-xs font-medium text-gray-400 mb-1.5" for="corpus-type">Corpus Type</label>
							<select
								id="corpus-type"
								bind:value={corpusType}
								class="w-full rounded-lg border border-white/10 bg-[#18181c] px-3 py-2 text-sm text-white
									focus:border-indigo-500 focus:outline-none transition-colors"
							>
								{#each CORPUS_TYPES as ct}
									<option value={ct.value}>{ct.label}</option>
								{/each}
							</select>
						</div>
						<div>
							<label class="block text-xs font-medium text-gray-400 mb-1.5" for="jurisdiction">Jurisdiction</label>
							<input
								id="jurisdiction"
								type="text"
								bind:value={jurisdiction}
								placeholder="federal, ca, ny…"
								class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white
									placeholder-gray-600 focus:border-indigo-500 focus:outline-none transition-colors"
							/>
						</div>
					</div>

					<div>
						<label class="block text-xs font-medium text-gray-400 mb-1.5" for="citation">Citation (optional)</label>
						<input
							id="citation"
							type="text"
							bind:value={citation}
							placeholder="18 U.S.C. § 1001"
							class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white
								placeholder-gray-600 focus:border-indigo-500 focus:outline-none transition-colors"
						/>
					</div>

					<div>
						<label class="block text-xs font-medium text-gray-400 mb-1.5" for="official-url">Official URL (optional)</label>
						<input
							id="official-url"
							type="url"
							bind:value={officialUrl}
							placeholder="https://leginfo.legislature.ca.gov/…"
							class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white
								placeholder-gray-600 focus:border-indigo-500 focus:outline-none transition-colors"
						/>
					</div>

					<div class="flex items-center justify-between pt-1">
						<label class="flex items-center gap-2.5 cursor-pointer select-none" for="is-official">
							<button
								id="is-official"
								type="button"
								role="switch"
								aria-checked={isOfficial}
								onclick={() => { isOfficial = !isOfficial; }}
								class="relative w-9 h-5 rounded-full transition-colors focus:outline-none focus:ring-2
									focus:ring-indigo-500/50 {isOfficial ? 'bg-indigo-600' : 'bg-white/10'}"
							>
								<span class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm
									transition-transform {isOfficial ? 'translate-x-4' : ''}"></span>
							</button>
							<span class="text-sm text-gray-300">Official source</span>
						</label>

						<button
							disabled={!canUpload}
							onclick={handleUpload}
							class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
								{canUpload
									? 'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-lg shadow-indigo-900/30'
									: 'bg-white/5 text-gray-600 cursor-not-allowed'}"
						>
							{#if uploading}
								<div class="w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin"></div>
								Uploading…
							{:else}
								<Icon name="upload" class="w-4 h-4" />
								Ingest Document
							{/if}
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- ── Tab: Codebase Docs ─────────────────────────────────────────────── -->
	{#if activeTab === 'codebase'}
		<div class="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
			<div class="px-6 py-4 border-b border-white/8">
				<h2 class="text-sm font-medium text-gray-200">Codebase Documentation Ingest</h2>
				<p class="text-xs text-gray-500 mt-0.5">
					Scans the repository for Markdown files (CLAUDE.md, README.md, docs/*.md) and ingests them
					as searchable treatise documents — chunked and embedded for hybrid search.
				</p>
			</div>

			<div class="p-6 space-y-5">
				<!-- What gets scanned -->
				<div class="rounded-lg bg-white/[0.03] border border-white/6 p-4 text-xs text-gray-400 space-y-1.5">
					<p class="font-medium text-gray-300 mb-2">Files scanned (depth ≤ 4):</p>
					<p class="font-mono">📁 /deeds-web-app/*.md  <span class="text-gray-600">— CLAUDE.md, README.md, *.md</span></p>
					<p class="font-mono">📁 /deeds-web-app/.github/**/*.md  <span class="text-gray-600">— agent specs, workflows</span></p>
					<p class="font-mono">📁 /deeds-web-app/docs/**/*.md  <span class="text-gray-600">— architecture, guides</span></p>
					<p class="font-mono text-gray-600">⛔ node_modules/, .git/, dist/, deeds_labs/ — excluded</p>
				</div>

				<!-- Scan button + result -->
				<div class="flex items-start gap-4">
					<button
						disabled={scanRunning}
						onclick={scanCodebaseDocs}
						class="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all shrink-0
							{scanRunning
								? 'bg-white/5 text-gray-500 cursor-not-allowed'
								: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30'}"
					>
						{#if scanRunning}
							<div class="w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin"></div>
							Scanning…
						{:else}
							<Icon name="folder-search" class="w-4 h-4" />
							Scan &amp; Ingest Codebase Docs
						{/if}
					</button>

					{#if scanError}
						<div class="flex items-center gap-1.5 text-xs text-red-400 pt-2.5">
							<Icon name="alert-circle" class="w-3.5 h-3.5 shrink-0" />{scanError}
						</div>
					{/if}

					{#if scanResult}
						<div class="flex-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs">
							<div class="flex items-center gap-3 flex-wrap">
								<span class="text-emerald-300 font-medium">
									<Icon name="check-circle" class="w-3.5 h-3.5 inline mr-1 mb-0.5" />Scan complete
								</span>
								<span class="text-gray-400">{scanResult.created} created</span>
								<span class="text-gray-400">{scanResult.updated} updated</span>
								<span class="text-gray-600">{scanResult.skipped} skipped</span>
								{#if scanResult.files.length > 0}
									<button
										onclick={() => { scanExpanded = !scanExpanded; }}
										class="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
									>
										{scanExpanded ? 'hide' : 'show'} {scanResult.files.length} files
									</button>
								{/if}
							</div>
							{#if scanExpanded && scanResult.files.length > 0}
								<ul class="mt-3 space-y-0.5 max-h-48 overflow-y-auto font-mono text-gray-500">
									{#each scanResult.files as f}
										<li>{f}</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Note about embeddings -->
				<div class="text-xs text-gray-600 flex items-start gap-1.5 border-t border-white/6 pt-4">
					<Icon name="info" class="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-700" />
					Embeddings are generated via gRPC (embeddinggemma:latest). If the embedding service is
					unavailable, chunks are stored without vectors and can be backfilled later.
					Codebase docs are stored with <code class="text-gray-500">corpus_type = treatise</code>.
				</div>
			</div>
		</div>
	{/if}

	<!-- ── Tab: Dev Guide ─────────────────────────────────────────────────── -->
	{#if activeTab === 'guide'}
		<div class="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
			<div class="px-6 py-4 border-b border-white/8">
				<h2 class="text-sm font-medium text-gray-200">Admin / Developer Testing Guide</h2>
				<p class="text-xs text-gray-500 mt-0.5">How to test and validate the legal ingestion pipeline end-to-end</p>
			</div>
			<div class="p-6 space-y-6 text-sm text-gray-300 max-w-3xl">

				<section class="space-y-2">
					<h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500">1. Prerequisites</h3>
					<ul class="space-y-1 text-xs text-gray-400 list-disc list-inside">
						<li>Dev server running: <code class="text-gray-300 bg-white/5 px-1 rounded">npm run dev</code> (port 5173)</li>
						<li>PostgreSQL with <code class="text-gray-300 bg-white/5 px-1 rounded">library_documents</code>, <code class="text-gray-300 bg-white/5 px-1 rounded">legal_nodes</code>, <code class="text-gray-300 bg-white/5 px-1 rounded">legal_chunks</code> tables</li>
						<li>MinIO running at port 9000 (or set <code class="text-gray-300 bg-white/5 px-1 rounded">MINIO_LIBRARY_BUCKET</code>)</li>
						<li>Ollama with <code class="text-gray-300 bg-white/5 px-1 rounded">embeddinggemma:latest</code> for embeddings</li>
					</ul>
				</section>

				<section class="space-y-2">
					<h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500">2. Ingest a Test PDF</h3>
					<div class="space-y-1 text-xs text-gray-400">
						<p>1. Drag a PDF onto the drop zone in the <span class="text-gray-300">Upload PDF</span> tab</p>
						<p>2. Fill in Title (auto-populated from filename)</p>
						<p>3. Set Corpus Type (e.g. <em>Statute</em>) and Jurisdiction (e.g. <em>federal</em>)</p>
						<p>4. Click <span class="text-gray-300">Ingest Document</span> — watch the 8-stage progress bar</p>
					</div>
					<div class="rounded-lg bg-white/[0.03] border border-white/6 p-3 font-mono text-xs text-gray-500 space-y-1">
						<p># Verify via API (replace JOB_ID)</p>
						<p class="text-gray-400">curl http://localhost:5173/api/library/ingest/JOB_ID -H "Cookie: session=…"</p>
					</div>
				</section>

				<section class="space-y-2">
					<h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500">3. Verify Embeddings</h3>
					<div class="rounded-lg bg-white/[0.03] border border-white/6 p-3 font-mono text-xs text-gray-500 space-y-1">
						<p># Count chunks with embeddings</p>
						<p class="text-gray-400">SELECT count(*) FROM legal_chunks WHERE embedding IS NOT NULL;</p>
						<p class="mt-2"># Check a specific document's chunks</p>
						<p class="text-gray-400">SELECT lc.id, lc.chunk_text, lc.embedding IS NOT NULL as has_embed</p>
						<p class="text-gray-400">FROM legal_chunks lc JOIN legal_nodes ln ON ln.id = lc.legal_node_id</p>
						<p class="text-gray-400">JOIN library_documents ld ON ld.id = ln.document_id</p>
						<p class="text-gray-400">WHERE ld.title ILIKE '%your doc%' LIMIT 10;</p>
					</div>
				</section>

				<section class="space-y-2">
					<h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500">4. Test Library Search</h3>
					<div class="rounded-lg bg-white/[0.03] border border-white/6 p-3 font-mono text-xs text-gray-500 space-y-1">
						<p># Lexical + semantic hybrid search</p>
						<p class="text-gray-400">curl "http://localhost:5173/api/library/search?q=fourth+amendment&limit=5" \</p>
						<p class="text-gray-400 pl-4">-H "Cookie: session=…"</p>
						<p class="mt-2"># With corpus type filter</p>
						<p class="text-gray-400">curl "http://localhost:5173/api/library/search?q=search+warrant&corpusType=statute"</p>
					</div>
				</section>

				<section class="space-y-2">
					<h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500">5. Test Go Search Service (optional)</h3>
					<div class="rounded-lg bg-white/[0.03] border border-white/6 p-3 font-mono text-xs text-gray-500 space-y-1">
						<p># Start the Go service</p>
						<p class="text-gray-400">cd services/go-search-service && ./search-server.exe</p>
						<p class="mt-2"># Set env and test 4-way parallel fan-out</p>
						<p class="text-gray-400">GO_SEARCH_URL=http://localhost:8096 npx vite</p>
						<p class="text-gray-400">curl -X POST http://localhost:8096/search \</p>
						<p class="text-gray-400 pl-4">-d '&#123;"query":"fourth amendment"&#125;'</p>
					</div>
				</section>

				<section class="space-y-2">
					<h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500">6. Ingest Codebase Docs</h3>
					<div class="space-y-1 text-xs text-gray-400">
						<p>1. Switch to <span class="text-gray-300">Codebase Docs</span> tab</p>
						<p>2. Click <span class="text-gray-300">Scan &amp; Ingest Codebase Docs</span></p>
						<p>3. Wait for scan complete — check created/updated counts</p>
						<p>4. Search for <code class="text-gray-300 bg-white/5 px-1 rounded">corpus_type=treatise</code> in the library table below</p>
					</div>
					<div class="rounded-lg bg-white/[0.03] border border-white/6 p-3 font-mono text-xs text-gray-500 space-y-1">
						<p># Verify via API</p>
						<p class="text-gray-400">curl -X POST http://localhost:5173/api/library/ingest-codebase-docs \</p>
						<p class="text-gray-400 pl-4">-H "Cookie: session=…" -H "Content-Type: application/json"</p>
					</div>
				</section>

				<section class="space-y-2">
					<h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500">7. Run Unit Tests</h3>
					<div class="rounded-lg bg-white/[0.03] border border-white/6 p-3 font-mono text-xs text-gray-500 space-y-1">
						<p class="text-gray-400">cd sveltekit-frontend</p>
						<p class="text-gray-400">npx vitest run tests/library-upload-ingest.spec.ts</p>
					</div>
				</section>

				<section class="rounded-lg bg-amber-500/8 border border-amber-500/15 p-4 space-y-1 text-xs text-amber-300/80">
					<p class="font-semibold text-amber-300">Pipeline Stage Enum</p>
					<p class="font-mono text-amber-400/70">queued → extracting → ocr → structuring → chunking → embedding → graphing → complete → failed</p>
					<p class="mt-1 text-amber-300/60">Do not change this sequence — it matches the PostgreSQL <code class="text-amber-300/80">processing_status</code> enum.</p>
				</section>
			</div>
		</div>
	{/if}

	<!-- ── Active Jobs ────────────────────────────────────────────────────── -->
	{#if activeJobs.length > 0}
		<div class="space-y-3">
			<h2 class="text-xs font-semibold uppercase tracking-wider text-gray-500">Active Ingestion</h2>
			{#each activeJobs as job (job.jobId)}
				<div class="rounded-xl border {job.status === 'failed' ? 'border-red-500/20 bg-red-500/5' : 'border-white/8 bg-white/[0.02]'} p-5">
					<div class="flex items-start justify-between gap-3 mb-4">
						<div class="min-w-0">
							<p class="text-sm font-medium text-white truncate">{job.title}</p>
							<p class="text-xs text-gray-500 mt-0.5">{STAGE_LABELS[job.stage] ?? job.stage}</p>
						</div>
						<span class="shrink-0 text-xs px-2.5 py-1 rounded-full border font-medium
							{job.status === 'complete' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
							: job.status === 'failed'  ? 'border-red-500/30 text-red-400 bg-red-500/10'
							: 'border-indigo-500/30 text-indigo-300 bg-indigo-500/10'}">
							{job.status === 'complete' ? 'Complete' : job.status === 'failed' ? 'Failed' : `${job.progress}%`}
						</span>
					</div>

					<!-- Stage segments -->
					<div class="flex items-center gap-1">
						{#each STAGES as stage, i}
							{@const done   = job.stage === 'complete' || (job.status !== 'failed' && STAGES.indexOf(job.stage) > i)}
							{@const active = job.stage === stage && job.stage !== 'complete'}
							{@const failed = job.status === 'failed' && job.stage === stage}
							<div class="flex-1" title={STAGE_LABELS[stage]}>
								<div class="h-1.5 rounded-full transition-colors
									{failed ? 'bg-red-500' : done ? 'bg-indigo-500' : active ? 'bg-indigo-500/50 animate-pulse' : 'bg-white/8'}">
								</div>
							</div>
						{/each}
					</div>
					<div class="flex justify-between mt-1.5">
						<span class="text-[10px] text-gray-700">queued</span>
						<span class="text-[10px] text-gray-700">complete</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- ── Document Library Table ─────────────────────────────────────────── -->
	<div class="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
		<!-- Table header + filters -->
		<div class="px-6 py-4 border-b border-white/8 flex items-center gap-3 flex-wrap">
			<div class="flex items-center gap-2 mr-auto">
				<h2 class="text-sm font-medium text-gray-200">Library</h2>
				<span class="text-xs text-gray-600">{docsTotal.toLocaleString()} documents</span>
			</div>

			<input
				type="text"
				placeholder="Search titles…"
				bind:value={docsFilter.q}
				class="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white
					placeholder-gray-600 focus:border-indigo-500 focus:outline-none w-44 transition-colors"
			/>
			<select
				bind:value={docsFilter.corpusType}
				class="rounded-lg border border-white/10 bg-[#18181c] px-3 py-1.5 text-xs text-white
					focus:border-indigo-500 focus:outline-none transition-colors"
			>
				<option value="">All types</option>
				{#each CORPUS_TYPES as ct}
					<option value={ct.value}>{ct.label}</option>
				{/each}
			</select>
			<select
				bind:value={docsFilter.status}
				class="rounded-lg border border-white/10 bg-[#18181c] px-3 py-1.5 text-xs text-white
					focus:border-indigo-500 focus:outline-none transition-colors"
			>
				<option value="">All statuses</option>
				{#each ['queued','extracting','ocr','structuring','chunking','embedding','graphing','complete','failed'] as s}
					<option value={s}>{STAGE_LABELS[s]}</option>
				{/each}
			</select>
		</div>

		<!-- Table body -->
		{#if docsLoading && docs.length === 0}
			<div class="p-16 flex items-center justify-center">
				<div class="w-5 h-5 border-2 border-indigo-500/25 border-t-indigo-500 rounded-full animate-spin"></div>
			</div>
		{:else if docs.length === 0}
			<div class="p-16 text-center">
				<Icon name="library-big" class="w-8 h-8 text-gray-700 mx-auto mb-3" />
				<p class="text-sm text-gray-500">No documents found</p>
				<p class="text-xs text-gray-700 mt-1">
					{docsFilter.q || docsFilter.corpusType || docsFilter.status
						? 'Try clearing the filters'
						: 'Upload a PDF or scan codebase docs to get started'}
				</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-sm" data-testid="docs-table">
					<thead>
						<tr class="border-b border-white/8 bg-white/[0.01]">
							<th class="text-left px-6 py-3 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Document</th>
							<th class="text-left px-4 py-3 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Type</th>
							<th class="text-left px-4 py-3 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Status</th>
							<th class="text-right px-4 py-3 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Chunks</th>
							<th class="text-left px-4 py-3 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Jurisdiction</th>
							<th class="text-left px-4 py-3 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Added</th>
							<th class="px-4 py-3 w-10"></th>
						</tr>
					</thead>
					<tbody>
						{#each docs as doc (doc.id)}
							<tr class="group border-b border-white/4 hover:bg-white/[0.02] transition-colors">
								<td class="px-6 py-3">
									<div class="flex items-start gap-2">
										{#if doc.isOfficial}
											<Icon name="shield-check" class="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
										{/if}
										<div class="min-w-0">
											<a href="/library/{doc.id}" class="text-sm text-white hover:text-indigo-300 font-medium leading-snug transition-colors truncate block max-w-xs">
												{doc.title}
											</a>
											{#if doc.citation}
												<p class="text-xs text-gray-600 mt-0.5">{doc.citation}</p>
											{/if}
										</div>
									</div>
								</td>
								<td class="px-4 py-3">
									<span class="text-xs text-gray-500 capitalize">{doc.corpusType}</span>
								</td>
								<td class="px-4 py-3">
									<span class="text-xs font-medium {STATUS_COLORS[doc.processingStatus] ?? 'text-gray-500'}">
										{STAGE_LABELS[doc.processingStatus] ?? doc.processingStatus}
									</span>
								</td>
								<td class="px-4 py-3 text-right">
									<span class="text-xs {doc.chunkCount > 0 ? 'text-gray-300' : 'text-gray-700'}">
										{doc.chunkCount.toLocaleString()}
									</span>
								</td>
								<td class="px-4 py-3">
									<span class="text-xs text-gray-600">{doc.jurisdictionCode ?? '—'}</span>
								</td>
								<td class="px-4 py-3">
									<span class="text-xs text-gray-600">{formatDate(doc.createdAt)}</span>
								</td>
								<td class="px-4 py-3">
									<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
										<a
											href="/library/{doc.id}"
											class="w-6 h-6 flex items-center justify-center rounded text-gray-500
												hover:text-gray-200 hover:bg-white/8 transition-colors"
											title="View document"
										>
											<Icon name="external-link" class="w-3.5 h-3.5" />
										</a>
										<button
											onclick={() => deleteDoc(doc.id)}
											class="w-6 h-6 flex items-center justify-center rounded text-gray-600
												hover:text-red-400 hover:bg-red-500/10 transition-colors"
											title="Delete document"
										>
											<Icon name="trash-2" class="w-3.5 h-3.5" />
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

</div>
</div>
