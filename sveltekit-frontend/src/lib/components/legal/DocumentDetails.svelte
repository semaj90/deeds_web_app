<!-- DocumentDetails — Document analysis modal with cache-first strategy -->
<!-- Session 64: Migrated 8 writable stores → $state runes + fixed corrupted template nesting -->
<script lang="ts">
	import { legalDB } from '$lib/db/client-db.js';

	// Svelte 5 props
	let {
		documentId = '',
		isVisible = false,
		onClose = () => {},
		relatedDocumentsLoaded = (_e: any) => {}
	}: {
		documentId?: string;
		isVisible?: boolean;
		onClose?: () => void;
		relatedDocumentsLoaded?: (_e: any) => void;
	} = $props();

	// Reactive state (migrated from writable stores → $state runes)
	let documentData = $state<any>(null);
	let isLoading = $state<boolean>(false);
	let loadingSource = $state<'cache' | 'server' | null>(null);
	let errorMessage = $state<string | null>(null);
	let relatedDocuments = $state<any[]>([]);
	let graphConnections = $state<any[]>([]);
	let caseAssociations = $state<any[]>([]);
	let gpuAnalysis = $state<any>(null);
	let processingMetrics = $state<any>(null);

	let showGPUAnalysis = $state<boolean>(false);
	let cacheHitTime = $state<number>(0);
	let serverFetchTime = $state<number>(0);

	// Re-run load when documentId changes and isVisible is true
	$effect(() => {
		if (isVisible && documentId) {
			loadDocumentDetails(documentId);
		}
	});

	// Node click handler with cache-first strategy
	async function loadDocumentDetails(docId: string, forceRefresh = false): Promise<any> {
		if (!docId) return;

		const startTime = performance.now();
		isLoading = true;
		errorMessage = null;

		try {
			// THE FAST PATH: Check IndexedDB cache first
			if (!forceRefresh) {
				loadingSource = 'cache';
				const cachedDocument = await legalDB.documentCache.where('documentId').equals(docId).first();

				if (cachedDocument) {
					cacheHitTime = performance.now() - startTime;
					console.log(
						`CACHE HIT! Loaded ${docId} from IndexedDB in ${cacheHitTime.toFixed(2)}ms`
					);
					displayDocumentDetails(cachedDocument);
					loadingSource = null;
					isLoading = false;

					// Check if cache is still fresh (5 minutes)
					const cacheAge =
						Date.now() - new Date(cachedDocument.lastAccessed).getTime();
					const cacheTimeout = 5 * 60 * 1000;

					if (cacheAge < cacheTimeout) {
						console.log('Cache is fresh, using cached data');
						return;
					} else {
						console.log('Cache is stale, fetching fresh data in background');
					}
				} else {
					console.log('CACHE MISS! Document not in IndexedDB');
				}
			}

			// THE SLOW PATH: Fetch from server
			await fetchAndCacheDocument(docId, forceRefresh);
		} catch (error) {
			console.error('Document loading failed:', error);
			errorMessage = error instanceof Error ? error.message : 'Failed to load document';
			isLoading = false;
			loadingSource = null;
		}
	}

	// Server fetch with caching
	async function fetchAndCacheDocument(docId: string, includeGPU = false): Promise<void> {
		const serverStartTime = performance.now();
		loadingSource = 'server';
		console.log('Fetching from server with full analysis...');

		const url = `/api/document/${docId}${includeGPU ? '?gpu=true' : ''}`;

		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Server error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		serverFetchTime = performance.now() - serverStartTime;

		console.log(`Server fetch completed in ${serverFetchTime.toFixed(2)}ms`);

		const doc: any = data.document ?? data;

		const contentStr = doc.content ?? '';
		const cacheEntry: import('$lib/db/client-db.js').DocumentCache = {
			documentId: docId,
			title: doc.title ?? 'Untitled Document',
			content: contentStr,
			contentType: (doc.content_type ?? doc.contentType ?? 'text') as 'text' | 'pdf' | 'docx' | 'md',
			fileSize: contentStr.length,
			metadata: {
				documentType: doc.document_type ?? doc.documentType ?? 'unknown',
				...(doc.metadata ?? {}),
			},
			hash: doc.content_hash ?? `hash_${Date.now()}`,
			lastAccessed: new Date(),
		};

		try {
			await legalDB.documentCache.put(cacheEntry);
			console.log(`Cached ${docId} to IndexedDB`);
		} catch (e) {
			console.warn('Failed to cache document:', e);
		}

		displayDocumentDetails(cacheEntry);
		isLoading = false;
		loadingSource = null;
	}

	function displayDocumentDetails(doc: any) {
		documentData = doc;

		const meta = doc.metadata || {};

		const relDocs = Array.isArray(meta.related_documents) ? meta.related_documents : [];
		const graphConns = Array.isArray(meta.graph_connections) ? meta.graph_connections : [];
		const caseAssoc = Array.isArray(meta.case_associations) ? meta.case_associations : [];

		relatedDocuments = relDocs;
		graphConnections = graphConns;
		caseAssociations = caseAssoc;

		if (relDocs.length > 0 && relatedDocumentsLoaded) {
			relatedDocumentsLoaded({ detail: { relatedDocuments: relDocs } });
		}

		if (meta.gpu_analysis) {
			gpuAnalysis = meta.gpu_analysis;
		}

		if (meta.enhanced_metadata?.server_processing) {
			processingMetrics = meta.enhanced_metadata.server_processing;
		}
	}

	async function toggleGPUAnalysis(): Promise<void> {
		if (!showGPUAnalysis && documentId) {
			showGPUAnalysis = true;
			await fetchAndCacheDocument(documentId, true);
		} else {
			showGPUAnalysis = false;
			gpuAnalysis = null;
		}
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	function formatDuration(ms: number): string {
		if (!ms) return '0ms';
		if (ms < 1000) return `${ms.toFixed(2)}ms`;
		return `${(ms / 1000).toFixed(2)}s`;
	}
</script>

<!-- Document Details Panel (YoRHa / Nier Dark Aesthetic) -->
{#if isVisible}
	<div class="fixed inset-0 z-[150] flex items-center justify-center p-4">
		<!-- Backdrop -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div 
			class="absolute inset-0 bg-black/80 backdrop-blur-md" 
			onclick={onClose}
		></div>

		<!-- Modal Container -->
		<div class="relative w-full max-w-6xl h-[90vh] bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
			<!-- Header -->
			<header class="h-16 border-b border-neutral-800 flex items-center justify-between px-6 bg-neutral-950/50">
				<div class="flex items-center gap-4">
					<div class="h-10 w-10 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
					</div>
					<div>
						<h2 class="text-sm font-bold uppercase tracking-widest text-neutral-100">Document Analysis</h2>
						<p class="text-[10px] text-neutral-500 font-mono uppercase">
							{#if loadingSource === 'cache'}
								<span class="text-emerald-400">CACHE HIT</span> ({formatDuration(cacheHitTime)})
							{:else if loadingSource === 'server'}
								<span class="text-sky-400">SERVER FETCH</span>
							{:else if documentData}
								ID: {documentId.slice(0, 12)}...
							{:else}
								INITIALIZING...
							{/if}
						</p>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<button
						onclick={onClose}
						class="h-8 w-8 flex items-center justify-center rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
					</button>
				</div>
			</header>

			<!-- Loading State -->
			{#if isLoading}
				<div class="flex-1 flex flex-col items-center justify-center gap-4">
					<div class="h-12 w-12 border-2 border-sky-500/20 border-t-sky-500 rounded-full animate-spin"></div>
					<p class="text-xs font-mono text-sky-400 uppercase tracking-widest animate-pulse">Analyzing structures...</p>
				</div>
			{/if}

			<!-- Error State -->
			{#if errorMessage}
				<div class="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
					<div class="h-16 w-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500">
						<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
					</div>
					<div>
						<h3 class="text-lg font-bold text-neutral-100 uppercase">Analysis Error</h3>
						<p class="text-sm text-neutral-400 mt-2 max-w-md">{errorMessage}</p>
					</div>
					<button
						onclick={() => loadDocumentDetails(documentId, true)}
						class="px-6 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-all"
					>
						Retry Analysis
					</button>
				</div>
			{/if}

			<!-- Content -->
			{#if documentData && !isLoading}
				<div class="flex-1 overflow-hidden flex flex-col">
					<!-- Sub-header Metrics -->
					<div class="bg-neutral-950 border-b border-neutral-800 px-6 py-3 flex items-center gap-8 text-[10px] uppercase font-mono tracking-wider">
						<div class="flex flex-col gap-1">
							<span class="text-neutral-500">Performance</span>
							<span class="text-neutral-200">
								{#if cacheHitTime}
									<span class="text-emerald-400">CACHE:</span> {formatDuration(cacheHitTime)}
								{:else if serverFetchTime}
									<span class="text-sky-400">SERVER:</span> {formatDuration(serverFetchTime)}
								{:else}
									LOCAL
								{/if}
							</span>
						</div>
						<div class="h-8 w-px bg-neutral-800"></div>
						<div class="flex flex-col gap-1">
							<span class="text-neutral-500">Associations</span>
							<span class="text-neutral-200">{relatedDocuments.length} RELATED &middot; {graphConnections.length} GRAPH</span>
						</div>
						<div class="h-8 w-px bg-neutral-800"></div>
						<div class="flex flex-col gap-1">
							<span class="text-neutral-500">Status</span>
							<span class="text-emerald-400">VERIFIED HASH</span>
						</div>
					</div>

					<div class="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_320px]">
						<!-- Main viewing area -->
						<div class="overflow-y-auto p-6 space-y-6">
							<!-- Document Info Card -->
							<div class="bg-neutral-950/40 border border-neutral-800 rounded-xl p-6">
								<div class="flex items-start justify-between mb-6">
									<div>
										<h3 class="text-2xl font-bold text-neutral-100">{documentData.title}</h3>
										<div class="flex items-center gap-2 mt-2">
											<span class="px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-[10px] font-bold text-sky-400 uppercase tracking-widest">
												{documentData.documentType || documentData.metadata?.documentType || 'UNSPECIFIED'}
											</span>
											<span class="text-[10px] text-neutral-500 font-mono">
												{formatBytes(documentData.fileSize || 0)}
											</span>
										</div>
									</div>
									
									<div class="flex gap-2">
										<button
											onclick={() => loadDocumentDetails(documentId, true)}
											class="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 transition-all"
											title="Refresh"
										>
											<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
										</button>
										<button
											onclick={toggleGPUAnalysis}
											class="flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest
												{showGPUAnalysis ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-neutral-800 text-neutral-400 border border-transparent'}"
										>
											<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 8h10"/><path d="M7 12h10"/><path d="M7 16h10"/></svg>
											{showGPUAnalysis ? 'Core Active' : 'AI Analysis'}
										</button>
									</div>
								</div>

								<div class="space-y-4">
									<h4 class="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em]">Context Extraction</h4>
									<div class="bg-black/40 border border-neutral-800 rounded-lg p-5 font-mono text-sm leading-relaxed text-neutral-300 pointer-events-auto">
										<div class="overflow-y-auto max-h-[400px] scrollbar-thin">
											{documentData.content || 'Content analysis pending...'}
										</div>
									</div>
								</div>
							</div>

							<!-- GPU Analysis Result -->
							{#if gpuAnalysis}
								<div class="bg-amber-500/5 border border-amber-500/20 rounded-xl p-6">
									<div class="flex items-center gap-3 mb-6">
										<div class="h-8 w-8 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
											<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M2 12h2"/><path d="m4.93 19.07 1.41-1.41"/><path d="M12 20v2"/><path d="m17.66 17.66 1.41 1.41"/><path d="M20 12h2"/><path d="m17.66 6.34 1.41-1.41"/></svg>
										</div>
										<h3 class="text-sm font-bold uppercase tracking-wider text-amber-400">Gemma LLM Reasoning</h3>
									</div>

									<div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
										<div class="space-y-2">
											<div class="flex justify-between text-[10px] font-bold text-neutral-500 uppercase">
												<span>Confidence Score</span>
												<span class="text-amber-400">{(gpuAnalysis.confidence * 100).toFixed(1)}%</span>
											</div>
											<div class="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
												<div class="h-full bg-amber-500" style="width: {gpuAnalysis.confidence * 100}%"></div>
											</div>
										</div>
										<div class="space-y-1">
											<span class="text-[10px] font-bold text-neutral-500 uppercase block">Inference Speed</span>
											<span class="text-neutral-200 font-mono text-sm">{formatDuration(gpuAnalysis.processingTime)}</span>
										</div>
									</div>

									{#if gpuAnalysis.legalAnalysis}
										<div class="space-y-4">
											<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
												<div class="bg-neutral-900 shadow-inner rounded-lg p-4 border border-neutral-800/50">
													<h4 class="text-[10px] font-bold text-neutral-500 uppercase mb-2">Extracted Entities</h4>
													<div class="flex flex-wrap gap-2">
														{#each (gpuAnalysis.legalAnalysis.legalEntities || []) as entity}
															<span class="px-2 py-0.5 rounded bg-neutral-800 text-xs text-neutral-300">{entity}</span>
														{/each}
													</div>
												</div>
												<div class="bg-neutral-900 shadow-inner rounded-lg p-4 border border-neutral-800/50">
													<h4 class="text-[10px] font-bold text-neutral-500 uppercase mb-2">Legal Concepts</h4>
													<div class="flex flex-wrap gap-2">
														{#each (gpuAnalysis.legalAnalysis.conceptClusters || []) as concept}
															<span class="px-2 py-0.5 rounded bg-neutral-800 text-xs text-neutral-300">{concept}</span>
														{/each}
													</div>
												</div>
											</div>
										</div>
									{/if}
								</div>
							{/if}
						</div>

						<!-- Sidebar -->
						<aside class="bg-neutral-950/80 border-l border-neutral-800 p-6 space-y-8 overflow-y-auto">
							<!-- Metadata Section -->
							<section>
								<h3 class="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em] mb-4">Properties</h3>
								<div class="space-y-4 text-xs">
									<div class="flex flex-col gap-1">
										<span class="text-neutral-600">Storage Location</span>
										<span class="text-neutral-300 font-mono">SeaweedFS S3 // bucket-1</span>
									</div>
									<div class="flex flex-col gap-1">
										<span class="text-neutral-600">Indexing Status</span>
										<span class="text-emerald-400 font-bold tracking-tighter italic">SYNCHRONIZED</span>
									</div>
								</div>
							</section>

							<!-- Related Documents -->
							{#if relatedDocuments.length > 0}
								<section>
									<h3 class="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em] mb-4">Related</h3>
									<div class="space-y-2">
										{#each relatedDocuments as doc}
											<div class="p-3 bg-neutral-900 border border-neutral-800 rounded-lg hover:border-sky-500/30 transition-all group cursor-pointer">
												<h4 class="text-xs font-bold text-neutral-200 group-hover:text-sky-400 truncate">{doc.title}</h4>
												<p class="text-[10px] text-neutral-500 mt-1 uppercase">{(doc.similarity * 100).toFixed(0)}% Similarity</p>
											</div>
										{/each}
									</div>
								</section>
							{/if}

							<!-- Graph -->
							{#if graphConnections.length > 0}
								<section>
									<h3 class="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em] mb-4">Knowledge Graph</h3>
									<div class="space-y-2">
										{#each graphConnections as conn}
											<div class="p-3 bg-neutral-900 border border-neutral-800 rounded-lg">
												<div class="flex items-center justify-between mb-1">
													<span class="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 text-[8px] font-bold uppercase">{conn.type}</span>
													<span class="text-[8px] text-neutral-500 font-mono">{(conn.relationship_strength * 100).toFixed(0)}%</span>
												</div>
												<h4 class="text-[11px] font-medium text-neutral-300">{conn.targetTitle}</h4>
											</div>
										{/each}
									</div>
								</section>
							{/if}
						</aside>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Custom scrollbar for premium feel */
	.scrollbar-thin::-webkit-scrollbar {
		width: 4px;
	}
	.scrollbar-thin::-webkit-scrollbar-track {
		background: transparent;
	}
	.scrollbar-thin::-webkit-scrollbar-thumb {
		background: #262626;
		border-radius: 2px;
	}
	.scrollbar-thin::-webkit-scrollbar-thumb:hover {
		background: #404040;
	}
</style>

