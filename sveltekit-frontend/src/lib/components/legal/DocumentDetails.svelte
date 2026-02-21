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

<!-- Document Details Modal -->
{#if isVisible}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
		<div class="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
			<!-- Header -->
			<div class="bg-info text-white px-6 py-4 flex justify-between rounded-t-lg">
				<div>
					<h2 class="text-2xl">Document Analysis</h2>
					<p class="text-info/20">
						{#if loadingSource === 'cache'}
							Loading from cache... ({formatDuration(cacheHitTime)})
						{:else if loadingSource === 'server'}
							Fetching from server...
						{:else if documentData}
							{documentData.title || `Document ${documentId}`}
						{:else}
							Document ID: {documentId}
						{/if}
					</p>
				</div>
				<button
					onclick={onClose}
					class="text-white hover:text-info/40 text-2xl"
					aria-label="Close"
				>
					&times;
				</button>
			</div>

			<!-- Loading State -->
			{#if isLoading}
				<div class="p-8 text-center">
					<div
						class="animate-spin rounded-full h-12 w-12 border-b-2 border-info mx-auto"
					></div>
					<p class="text-sand/60 mt-4">
						{#if loadingSource === 'cache'}
							Checking cache...
						{:else if loadingSource === 'server'}
							Performing comprehensive analysis...
						{:else}
							Loading document details...
						{/if}
					</p>
				</div>
			{/if}

			<!-- Error State -->
			{#if errorMessage}
				<div class="p-8">
					<div class="text-danger text-xl">Error</div>
					<p class="text-danger">{errorMessage}</p>
					<button
						onclick={() => loadDocumentDetails(documentId, true)}
						class="mt-4 bg-info text-white px-6 py-2 rounded hover:bg-info/60"
					>
						Retry
					</button>
				</div>
			{/if}

			<!-- Document Content -->
			{#if documentData && !isLoading}
				<div class="overflow-y-auto flex-1">
					<!-- Performance Metrics Bar -->
					<div
						class="bg-sand/10 px-6 py-3 border-b grid grid-cols-2 md:grid-cols-4 gap-4 text-sm"
					>
						<div>
							<span class="font-semibold">Cache Hit:</span>
							{cacheHitTime ? formatDuration(cacheHitTime) : 'No cache'}
						</div>
						<div>
							<span class="font-semibold">Server Fetch:</span>
							{serverFetchTime ? formatDuration(serverFetchTime) : 'Not fetched'}
						</div>
						<div>
							<span class="font-semibold">Related Docs:</span>
							{relatedDocuments.length}
						</div>
						<div>
							<span class="font-semibold">Graph Links:</span>
							{graphConnections.length}
						</div>
					</div>

					<!-- Main Content Grid -->
					<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
						<!-- Document Content Column -->
						<div class="lg:col-span-2 space-y-6">
							<div class="bg-white rounded-lg border border-sand/20 p-4">
								<div class="flex justify-between items-start mb-4">
									<h3 class="text-xl font-semibold">Document Content</h3>
									<div class="flex gap-2">
										<button
											onclick={() => loadDocumentDetails(documentId, true)}
											class="text-sm bg-sand/10 hover:bg-sand/20 px-3 py-1 rounded"
										>
											Refresh
										</button>
										<button
											onclick={toggleGPUAnalysis}
											class="text-sm {showGPUAnalysis
												? 'bg-info/10 text-info'
												: 'bg-sand/10'} hover:bg-info/20 px-3 py-1 rounded"
										>
											{showGPUAnalysis ? 'GPU Active' : 'GPU Analysis'}
										</button>
									</div>
								</div>
								<div class="space-y-4">
									<div>
										<span class="font-medium">Title:</span>
										<p class="text-sand">{documentData.title}</p>
									</div>
									<div>
										<span class="font-medium">Type:</span>
										<span
											class="inline-block bg-info/10 text-info px-2 py-1 rounded text-sm"
										>
											{documentData.document_type || 'Unknown'}
										</span>
									</div>
									<div>
										<span class="font-medium">Content:</span>
										<div class="mt-2 p-4 bg-sand/5 rounded-lg max-h-96 overflow-y-auto">
											<pre class="whitespace-pre-wrap text-sm">{documentData.content
													? documentData.content.substring(0, 2000) +
														(documentData.content.length > 2000 ? '...' : '')
													: 'No content available'}</pre>
										</div>
									</div>
								</div>
							</div>

							<!-- GPU Analysis Results -->
							{#if gpuAnalysis}
								<div class="bg-info/5 rounded-lg border border-info/20 p-6">
									<h3 class="text-xl font-semibold text-info mb-4">
										GPU Analysis (FlashAttention2 RTX 3060 Ti)
									</h3>
									<div class="grid grid-cols-2 gap-4">
										<div>
											<span class="font-medium">Confidence:</span>
											<div class="w-full bg-info/20 rounded-full h-2 mt-1">
												<div
													class="bg-info/60 h-2 rounded-full"
													style="width: {(gpuAnalysis.confidence * 100).toFixed(1)}%"
												></div>
											</div>
											<p class="text-sm text-info mt-1">
												{(gpuAnalysis.confidence * 100).toFixed(1)}%
											</p>
										</div>
										<div>
											<span class="font-medium">Processing Time:</span>
											<p class="text-info">
												{formatDuration(gpuAnalysis.processingTime)}
											</p>
										</div>
									</div>
									{#if gpuAnalysis.legalAnalysis}
										<div class="mt-4">
											<h4 class="font-medium text-info">Legal Analysis:</h4>
											<div class="bg-white rounded p-3 mt-2">
												<p>
													<strong>Relevance:</strong>
													{(
														gpuAnalysis.legalAnalysis.relevanceScore * 100
													).toFixed(1)}%
												</p>
												<p>
													<strong>Entities:</strong>
													{gpuAnalysis.legalAnalysis.legalEntities?.join(', ') ??
														'None detected'}
												</p>
												<p>
													<strong>Concepts:</strong>
													{gpuAnalysis.legalAnalysis.conceptClusters?.join(
														', '
													) ?? 'None detected'}
												</p>
											</div>
										</div>
									{/if}
								</div>
							{/if}
						</div>

						<!-- Sidebar -->
						<div class="space-y-6">
							<!-- Related Documents -->
							{#if relatedDocuments.length > 0}
								<div class="bg-white rounded-lg border border-sand/20 p-4">
									<h3 class="text-lg font-semibold text-sand mb-3">
										Related Documents ({relatedDocuments.length})
									</h3>
									<div class="space-y-3 max-h-64 overflow-y-auto">
										{#each relatedDocuments as doc}
											<div class="bg-sand/5 rounded p-3">
												<h4 class="font-medium">{doc.title}</h4>
												<p class="text-sand/60 text-xs">
													Similarity: {(doc.similarity * 100).toFixed(1)}% | {doc.documentType ||
														'Document'}
												</p>
												{#if doc.content}
													<p class="text-sand/80 text-xs mt-2">
														{doc.content.substring(0, 100)}...
													</p>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Graph Connections -->
							{#if graphConnections.length > 0}
								<div class="bg-white rounded-lg border border-sand/20 p-4">
									<h3 class="text-lg font-semibold text-sand mb-3">
										Knowledge Graph ({graphConnections.length})
									</h3>
									<div class="space-y-3 max-h-64 overflow-y-auto">
										{#each graphConnections as conn}
											<div class="bg-sand/5 rounded p-3">
												<div class="flex items-center gap-2">
													<span
														class="bg-info/10 text-info px-2 py-1 rounded text-xs"
													>
														{conn.type}
													</span>
													<span class="text-sand/60">
														{(conn.relationship_strength * 100).toFixed(0)}%
													</span>
												</div>
												<h4 class="font-medium">{conn.targetTitle}</h4>
												<p class="text-sand/60 text-xs">{conn.connection_type}</p>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Case Associations -->
							{#if caseAssociations.length > 0}
								<div class="bg-white rounded-lg border border-sand/20 p-4">
									<h3 class="text-lg font-semibold text-sand mb-3">
										Associated Cases ({caseAssociations.length})
									</h3>
									<div class="space-y-3 max-h-64 overflow-y-auto">
										{#each caseAssociations as caseItem}
											<div class="bg-sand/5 rounded p-3">
												<h4 class="font-medium">{caseItem.title}</h4>
												<div class="flex items-center gap-2 mt-1">
													<span class="bg-accent/10 text-accent px-2 py-1 rounded text-xs">
														{caseItem.status}
													</span>
													<span class="bg-warning/10 text-warning px-2 py-1 rounded text-xs">
														{caseItem.priority}
													</span>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Processing Metrics -->
							{#if processingMetrics}
								<div class="bg-white rounded-lg border border-sand/20 p-4">
									<h3 class="text-lg font-semibold text-sand mb-3">
										Processing Metrics
									</h3>
									<div class="space-y-2 text-sm">
										<div class="flex justify-between">
											<span class="text-sand/60">Content Length:</span>
											<span class="font-medium"
												>{formatBytes(processingMetrics.content_length || 0)}</span
											>
										</div>
										<div class="flex justify-between">
											<span class="text-sand/60">Vector Embedding:</span>
											<span
												class="font-medium {processingMetrics.has_vector_embedding
													? 'text-accent'
													: 'text-danger'}"
											>
												{processingMetrics.has_vector_embedding
													? 'Available'
													: 'Missing'}
											</span>
										</div>
										<div class="flex justify-between">
											<span class="text-sand/60">Last Accessed:</span>
											<span class="font-medium">
												{new Date(
													processingMetrics.last_accessed
												).toLocaleTimeString()}
											</span>
										</div>
										{#if processingMetrics.server_processing}
											<div class="mt-3 pt-3 border-t">
												<p class="text-xs text-sand/60 mb-2">
													Server Performance:
												</p>
												<div class="space-y-1">
													<div class="flex justify-between">
														<span>Total Time:</span>
														<span class="font-mono"
															>{processingMetrics.server_processing
																.total_server_time}</span
														>
													</div>
													<div class="flex justify-between">
														<span>Vector Search:</span>
														<span class="font-mono"
															>{processingMetrics.server_processing
																.vector_search_time}</span
														>
													</div>
												</div>
											</div>
										{/if}
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

