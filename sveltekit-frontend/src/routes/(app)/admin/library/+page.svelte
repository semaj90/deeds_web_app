<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';


	// ── Types ─────────────────────────────────────────────────────────────────

	interface LibraryDoc {
		id: string;
		title: string;
		short_title?: string;
		citation?: string;
		corpus_type: string;
		processing_status: string;
		jurisdiction_code?: string;
		jurisdiction_name?: string;
		page_count?: number;
		node_count: number;
		chunk_count: number;
		is_official: boolean;
		created_at: string;
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

	const CORPUS_TYPES = [
		{ value: 'constitution', label: 'Constitution' },
		{ value: 'statute', label: 'Statute' },
		{ value: 'regulation', label: 'Regulation' },
		{ value: 'bill', label: 'Bill' },
		{ value: 'case', label: 'Court Case' },
		{ value: 'glossary', label: 'Glossary' },
		{ value: 'treatise', label: 'Treatise' },
		{ value: 'other', label: 'Other' },
	];

	const STAGES = ['queued', 'extracting', 'ocr', 'structuring', 'chunking', 'embedding', 'graphing', 'complete'];

	const STAGE_LABELS: Record<string, string> = {
		queued: 'Queued',
		extracting: 'Extracting text',
		ocr: 'Running OCR',
		structuring: 'Detecting structure',
		chunking: 'Chunking sections',
		embedding: 'Generating embeddings',
		graphing: 'Building citation graph',
		complete: 'Complete',
		failed: 'Failed',
	};

	const STATUS_COLORS: Record<string, string> = {
		complete: 'text-green-400',
		failed: 'text-red-400',
		queued: 'text-gray-400',
		extracting: 'text-blue-400',
		ocr: 'text-blue-400',
		structuring: 'text-indigo-400',
		chunking: 'text-violet-400',
		embedding: 'text-purple-400',
		graphing: 'text-fuchsia-400',
	};

	// ── State ─────────────────────────────────────────────────────────────────

	let dragOver = $state(false);
	let selectedFile = $state<File | null>(null);
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);

	// Form fields
	let title = $state('');
	let corpusType = $state<string>('other');
	let jurisdiction = $state('federal');
	let citation = $state('');
	let officialUrl = $state('');
	let isOfficial = $state(false);

	// Active ingestion jobs (polling)
	let activeJobs = $state<IngestionJob[]>([]);
	let jobPollers = new Map<string, ReturnType<typeof setInterval>>();

	// Document library
	let docs = $state<LibraryDoc[]>([]);
	let docsLoading = $state(false);
	let docsFilter = $state<{ q: string; corpusType: string; status: string }>({ q: '', corpusType: '', status: '' });
	let docsTotal = $state(0);

	// ── Computed ──────────────────────────────────────────────────────────────

	let canUpload = $derived(selectedFile !== null && title.trim().length > 0 && !uploading);

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
			uploadError = 'Only PDF files are supported';
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

		const formData = new FormData();
		formData.append('file', selectedFile!);
		formData.append('title', title.trim());
		formData.append('corpusType', corpusType);
		formData.append('jurisdiction', jurisdiction.trim() || 'federal');
		if (citation.trim()) formData.append('citation', citation.trim());
		if (officialUrl.trim()) formData.append('officialUrl', officialUrl.trim());

		try {
			const res = await fetch('/api/library/upload', { method: 'POST', body: formData });
			const data = await res.json();
			if (!res.ok || !data.success) {
				uploadError = data.error ?? 'Upload failed';
				return;
			}

			// Start polling the job
			const job: IngestionJob = {
				jobId: data.jobId,
				documentId: data.documentId,
				title: title.trim(),
				stage: 'queued',
				progress: 0,
				status: 'queued',
			};
			activeJobs = [...activeJobs, job];
			pollJob(job.jobId);

			// Reset form
			selectedFile = null;
			title = '';
			corpusType = 'other';
			jurisdiction = 'federal';
			citation = '';
			officialUrl = '';
			isOfficial = false;

			// Reload docs
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
				const res = await fetch(`/api/library/ingest/${jobId}`, {
					headers: { Accept: 'application/json' },
				});
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
					// Remove from active jobs after 8s
					setTimeout(() => {
						activeJobs = activeJobs.filter(j => j.jobId !== jobId);
					}, 8000);
				}
			} catch {
				// silent
			}
		};
		poll();
		const interval = setInterval(poll, 2500);
		jobPollers.set(jobId, interval);
	}

	// ── Document Library ──────────────────────────────────────────────────────

	async function loadDocs() {
		docsLoading = true;
		try {
			const params = new URLSearchParams({ limit: '40', offset: '0' });
			if (docsFilter.q) params.set('q', docsFilter.q);
			if (docsFilter.corpusType) params.set('corpusType', docsFilter.corpusType);
			if (docsFilter.status) params.set('status', docsFilter.status);
			const res = await fetch(`/api/library/documents?${params}`);
			if (!res.ok) return;
			const data = await res.json();
			docs = data.documents ?? [];
			docsTotal = data.total ?? 0;
		} finally {
			docsLoading = false;
		}
	}

	$effect(() => {
		loadDocs();
	});

	let docsFilterDebounce: ReturnType<typeof setTimeout>;
	function onFilterChange() {
		clearTimeout(docsFilterDebounce);
		docsFilterDebounce = setTimeout(loadDocs, 300);
	}

	$effect(() => {
		// track filter changes
		void docsFilter.q;
		void docsFilter.corpusType;
		void docsFilter.status;
		onFilterChange();
	});

	function stageIndex(stage: string) {
		return STAGES.indexOf(stage);
	}

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function formatSize(file: File) {
		const mb = file.size / 1024 / 1024;
		return mb < 1 ? `${Math.round(file.size / 1024)} KB` : `${mb.toFixed(1)} MB`;
	}
</script>

<div class="min-h-screen bg-[#0d0d0f] text-gray-100 p-6">
	<div class="max-w-6xl mx-auto space-y-8">

		<!-- Header -->
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-semibold text-white tracking-tight">Legal Library</h1>
				<p class="text-sm text-gray-400 mt-0.5">Ingest PDFs into the searchable legal corpus — chunked, embedded, and indexed</p>
			</div>
			<div class="flex items-center gap-2 text-xs text-gray-500">
				<span class="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
				Pipeline ready
			</div>
		</div>

		<!-- Upload Card -->
		<div class="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
			<div class="px-6 py-4 border-b border-white/8">
				<h2 class="text-sm font-medium text-gray-200">Ingest Document</h2>
			</div>
			<div class="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">

				<!-- Drop Zone -->
				<div>
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors cursor-pointer min-h-44
							{dragOver ? 'border-indigo-500 bg-indigo-500/5' : 'border-white/10 hover:border-white/20'}"
						ondragover={(e) => { e.preventDefault(); dragOver = true; }}
						ondragleave={() => { dragOver = false; }}
						ondrop={onDrop}
						onclick={() => document.getElementById('fileInput')?.click()}
					>
						<input id="fileInput" type="file" accept=".pdf,application/pdf" class="sr-only" onchange={onFileInput} />
						{#if selectedFile}
							<div class="text-center px-4">
								<div class="w-10 h-10 rounded-full bg-indigo-500/15 flex items-center justify-center mx-auto mb-3">
									<Icon name="file-text" class="w-5 h-5 text-indigo-400" />
								</div>
								<p class="text-sm font-medium text-white">{selectedFile.name}</p>
								<p class="text-xs text-gray-400 mt-1">{formatSize(selectedFile)}</p>
								<button
									class="mt-3 text-xs text-gray-500 hover:text-gray-300 underline"
									onclick={(e) => { e.stopPropagation(); selectedFile = null; title = ''; }}
								>Change file</button>
							</div>
						{:else}
							<div class="text-center px-4">
								<div class="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
									<Icon name="upload-cloud" class="w-5 h-5 text-gray-400" />
								</div>
								<p class="text-sm text-gray-300">Drop PDF here or <span class="text-indigo-400">browse</span></p>
								<p class="text-xs text-gray-500 mt-1">Up to 200 MB · PDF only</p>
							</div>
						{/if}
					</div>
					{#if uploadError}
						<p class="text-xs text-red-400 mt-2">{uploadError}</p>
					{/if}
				</div>

				<!-- Metadata Form -->
				<div class="space-y-4">
					<div>
						<label class="block text-xs font-medium text-gray-400 mb-1" for="doc-title">Title *</label>
						<input
							id="doc-title"
							type="text"
							bind:value={title}
							placeholder="e.g. California Penal Code 2024"
							class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500
								focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
						/>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="block text-xs font-medium text-gray-400 mb-1" for="corpus-type">Corpus Type</label>
							<select
								id="corpus-type"
								bind:value={corpusType}
								class="w-full rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-sm text-white
									focus:border-indigo-500 focus:outline-none"
							>
								{#each CORPUS_TYPES as ct}
									<option value={ct.value}>{ct.label}</option>
								{/each}
							</select>
						</div>
						<div>
							<label class="block text-xs font-medium text-gray-400 mb-1" for="jurisdiction">Jurisdiction</label>
							<input
								id="jurisdiction"
								type="text"
								bind:value={jurisdiction}
								placeholder="federal, california…"
								class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500
									focus:border-indigo-500 focus:outline-none"
							/>
						</div>
					</div>

					<div>
						<label class="block text-xs font-medium text-gray-400 mb-1" for="citation">Citation (optional)</label>
						<input
							id="citation"
							type="text"
							bind:value={citation}
							placeholder="e.g. 18 U.S.C. § 1001"
							class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500
								focus:border-indigo-500 focus:outline-none"
						/>
					</div>

					<div>
						<label class="block text-xs font-medium text-gray-400 mb-1" for="official-url">Official URL (optional)</label>
						<input
							id="official-url"
							type="url"
							bind:value={officialUrl}
							placeholder="https://leginfo.legislature.ca.gov/…"
							class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500
								focus:border-indigo-500 focus:outline-none"
						/>
					</div>

					<div class="flex items-center justify-between pt-1">
						<label class="flex items-center gap-2 cursor-pointer" for="is-official">
							<div
								class="relative w-9 h-5 rounded-full transition-colors {isOfficial ? 'bg-indigo-600' : 'bg-white/10'}"
								onclick={() => { isOfficial = !isOfficial; }}
							>
								<div class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform {isOfficial ? 'translate-x-4' : ''}"></div>
							</div>
							<span class="text-sm text-gray-300">Official source</span>
						</label>

						<button
							disabled={!canUpload}
							onclick={handleUpload}
							class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
								{canUpload
									? 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'
									: 'bg-white/5 text-gray-500 cursor-not-allowed'}"
						>
							{#if uploading}
								<div class="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
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

		<!-- Active Jobs -->
		{#if activeJobs.length > 0}
			<div class="space-y-3">
				<h2 class="text-sm font-medium text-gray-400 uppercase tracking-wider">Active Ingestion</h2>
				{#each activeJobs as job}
					<div class="rounded-xl border border-white/8 bg-white/3 p-5">
						<div class="flex items-start justify-between mb-4">
							<div>
								<p class="text-sm font-medium text-white">{job.title}</p>
								<p class="text-xs text-gray-500 mt-0.5">{STAGE_LABELS[job.stage] ?? job.stage}</p>
							</div>
							<span class="text-xs px-2 py-0.5 rounded-full border {job.status === 'complete' ? 'border-green-500/30 text-green-400 bg-green-500/10' : job.status === 'failed' ? 'border-red-500/30 text-red-400 bg-red-500/10' : 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10'}">
								{job.status === 'complete' ? 'Complete' : job.status === 'failed' ? 'Failed' : `${job.progress}%`}
							</span>
						</div>

						<!-- Stage progress -->
						<div class="flex items-center gap-1">
							{#each STAGES as stage, i}
								{@const done = stageIndex(job.stage) > i || job.stage === 'complete'}
								{@const active = job.stage === stage && job.stage !== 'complete'}
								<div class="flex-1">
									<div class="h-1.5 rounded-full {done ? 'bg-indigo-500' : active ? 'bg-indigo-500/60 animate-pulse' : 'bg-white/8'}"></div>
								</div>
							{/each}
						</div>
						<div class="flex justify-between mt-1.5">
							<span class="text-[10px] text-gray-600">queued</span>
							<span class="text-[10px] text-gray-600">complete</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Document Library -->
		<div class="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
			<div class="px-6 py-4 border-b border-white/8 flex items-center justify-between gap-4 flex-wrap">
				<div class="flex items-center gap-2">
					<h2 class="text-sm font-medium text-gray-200">Library</h2>
					<span class="text-xs text-gray-500">{docsTotal} documents</span>
				</div>
				<div class="flex items-center gap-2">
					<input
						type="text"
						placeholder="Search titles…"
						bind:value={docsFilter.q}
						class="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-gray-500
							focus:border-indigo-500 focus:outline-none w-48"
					/>
					<select
						bind:value={docsFilter.corpusType}
						class="rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
					>
						<option value="">All types</option>
						{#each CORPUS_TYPES as ct}
							<option value={ct.value}>{ct.label}</option>
						{/each}
					</select>
					<select
						bind:value={docsFilter.status}
						class="rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
					>
						<option value="">All statuses</option>
						{#each ['queued','extracting','ocr','structuring','chunking','embedding','graphing','complete','failed'] as s}
							<option value={s}>{STAGE_LABELS[s]}</option>
						{/each}
					</select>
				</div>
			</div>

			{#if docsLoading && docs.length === 0}
				<div class="p-12 flex items-center justify-center">
					<div class="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
				</div>
			{:else if docs.length === 0}
				<div class="p-12 text-center">
					<Icon name="library" class="w-8 h-8 text-gray-600 mx-auto mb-2" />
					<p class="text-sm text-gray-500">No documents ingested yet</p>
					<p class="text-xs text-gray-600 mt-1">Upload a PDF above to get started</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-white/8">
								<th class="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Document</th>
								<th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
								<th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
								<th class="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Chunks</th>
								<th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Jurisdiction</th>
								<th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Added</th>
							</tr>
						</thead>
						<tbody>
							{#each docs as doc}
								<tr class="border-b border-white/4 hover:bg-white/2 transition-colors">
									<td class="px-6 py-3">
										<div class="flex items-start gap-2">
											{#if doc.is_official}
												<Icon name="shield-check" class="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
											{/if}
											<div>
												<p class="text-white text-sm font-medium leading-snug">{doc.title}</p>
												{#if doc.citation}
													<p class="text-xs text-gray-500 mt-0.5">{doc.citation}</p>
												{/if}
											</div>
										</div>
									</td>
									<td class="px-4 py-3">
										<span class="text-xs text-gray-400 capitalize">{doc.corpus_type}</span>
									</td>
									<td class="px-4 py-3">
										<span class="text-xs {STATUS_COLORS[doc.processing_status] ?? 'text-gray-400'}">
											{STAGE_LABELS[doc.processing_status] ?? doc.processing_status}
										</span>
									</td>
									<td class="px-4 py-3 text-right">
										<span class="text-xs text-gray-400">{doc.chunk_count.toLocaleString()}</span>
									</td>
									<td class="px-4 py-3">
										<span class="text-xs text-gray-500">{doc.jurisdiction_code ?? '—'}</span>
									</td>
									<td class="px-4 py-3">
										<span class="text-xs text-gray-500">{formatDate(doc.created_at)}</span>
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