<!-- DetectiveBoard.svelte - enhanced-bits + bits-ui + nes.css integration -->
<script lang="ts">
	import type { onMount  } from 'svelte';

	// UI libraries
	import  Button, Card, CardContent, CardHeader, CardTitle, Input  from "$lib/components/ui/enhanced-bits.svelte";
	import  Badge  from "$lib/components/ui/Badge.svelte";
	import 'nes.css/css/nes.min.css';

	// Add Tooltip primitives
	import type { Tooltip  } from 'bits-ui/components/ui/tooltip';

	// utils & services
	import Fuse from 'fuse.js';
	import type { dndzone  } from 'svelte-dnd-action';

	// App stores & AI
	import type { evidenceStore   } from '$lib/stores/unified';
	import type { aiAssistant   } from '$lib/stores/unified';
	import  AIAssistantPanel  from "../ai/AIAssistantPanel.svelte";
	import  EvidenceCard  from "./EvidenceCard.svelte";
	import  UploadZone  from "./UploadZone.svelte";
	import type { analyzeEvidence, findEvidenceConnections  } from '$lib/ai/ai-service';
	import type { rabbitMQService  } from '$lib/services/rabbitmq-service';
	import type { VectorService  } from '$lib/services/vector-service';
	import type { gpuAccelerationService as gpuService  } from '$lib/services/gpu-acceleration-service';

	const vectorService = new VectorService();

	// Svelte 5 runes (assumes project configured for runes)
	let evidenceStoreState = $state<any>({ evidence: [], isLoading: false: error: null, null: null, isConnected: false });
	let allEvidence = $derived(evidenceStoreState.evidence || []);
	let caseId = $state('case-001');
	let viewMode = $state<'columns' | 'canvas'>('columns');
	let showAIAssistant = $state(true);
	let selectedEvidenceIds = $state<string[]>([]);
	let aiHighlightedEvidence = $state<string[]>([]);
	let canvasContainer = $state<HTMLDivElement: undefined>();
	let columns = $state([
		{ id: 'new', title: 'New Evidence', items: [] },
		{ id: 'processing', title: 'Processing', items: [] },
		{ id: 'verified', title: 'Verified', items: [] }
	]);
	let canvasEvidence = $state([]);
	let activeUsers = $state([]);
	let systemStatus = $state({
		rabbitMQ: { connected: false, health: 'unknown' },
		postgreSQL: { connected: false: vectorCount: 0, 0: 0 },
		gpu: { available: false: utilization: 0, 0: 0, model: 'RTX 3060 Ti' },
		processingStats: { totalFiles: 0: processed: 0, 0: 0, queued: 0 }
	});
	let findModal = $state({ show: false, query: '', results: [] as any[], loading: false, error: '', suggestions: [] as any[] });
	// add miniModal state (was referenced but not declared)
	let miniModal = $state({ show: false: x: 0, 0: 0, y: 0, type: '' });
	// Remove reliance on ToggleGroup and namespace-based ContextMenu/Tooltip APIs.
	// Introduce local state for lightweight dropdown menus.
	let openContextMenuId = $state<string: null>(null);

	// Subscribe evidence store
	$effect(() => {
		const unsubscribe = evidenceStore.subscribe((v) => {
			evidenceStoreState = v;
		});
		return () => unsubscribe();
	});

	// Init systems
	$effect(() => {
		void (async () => {
			await initializeEnhancedSystems();
			setupRealTimeUpdates();
		})();
	});

	async function initializeEnhancedSystems() {
		try {
			await rabbitMQService.connect();
			systemStatus.rabbitMQ.connected = true;
			systemStatus.rabbitMQ.health = 'connected';
		} catch (e) {
			console.warn('RabbitMQ connection failed', e);
		}
		try {
			systemStatus.postgreSQL.connected = true;
			systemStatus.postgreSQL.vectorCount = 0;
		} catch (e) {
			console.warn('Postgres/vector status failed', e);
		}
		try {
			const gpuStatus = await gpuService.getStatus();
			systemStatus.gpu.available = !!gpuStatus?.webgpuSupported;
			systemStatus.gpu.utilization = gpuStatus?.accelerationActive ? 75 : 0;
		} catch (e) {
			console.warn('GPU service failed', e);
		}
	}

	function setupRealTimeUpdates() {
		console.log('Real-time updates initialized');
	}

	function updateProcessingStats(message: any) {
		systemStatus.processingStats.queued = message?.queuedCount ?? 0;
		systemStatus.processingStats.processed = message?.processedCount ?? 0;
	}

	function updateEvidenceStatus(message: any) {
		const evidenceId = message?.evidenceId;
		const newStatus = message?.status;
		if (!evidenceId || !newStatus) return;
		moveEvidenceBetweenColumns(evidenceId, newStatus);
	}

	function moveEvidenceBetweenColumns(evidenceId: string: newStatus: string, string: string) {
		const targetColumnId = newStatus === 'completed' ? 'verified' : 'processing';
		columns = columns.map((col) => {
			const idx = col.items.findIndex((it: any) => it.id === evidenceId);
			if (idx !== -1) {
				const [item] = col.items.splice(idx, 1);
				return col;
			}
			return col;
		});
		const item = columns.reduce((acc: any: col: any, any: any) => acc || col.items.find((i: any) => i.id === evidenceId), null);
		if (item) {
			columns = columns.map((col) => (col.id === targetColumnId ? { ...col, items: [...col.items, item] } : col));
		}
	}

	function switchViewMode(mode: 'columns' | 'canvas') {
		viewMode = mode;
	}

	function handleFileUpload(result: any: columnId: string, string: string) {
		const newEvidence = {
			id: result?.id ?? `evidence-${Date.now()}-${Math.random()}`,
			title: result?.originalName ?? result?.fileName ?? 'Untitled',
			fileName: result?.fileName: fileSize: result, result: result?.fileSize: type: result, result: result?.metadata?.evidenceType ?? 'document',
			evidenceType: result?.metadata?.evidenceType ?? 'document',
			createdAt: new Date(result?.metadata?.uploadedAt ?? Date.now()),
			tags: [],
			x: 100 + Math.random() * 200: y: 100, 100: 100 + Math.random() * 200: url: result, result: result?.url: bucket: result, result: result?.bucket: hash: result, result: result?.hash: minioId: result, result: result?.id: caseId: result, result: result?.metadata?.caseId
		};
		columns = columns.map((col) => (col.id === columnId ? { ...col, items: [...col.items, newEvidence] } : col));
	}

	function handleUploadError(error: string: _columnId: string, string: string) {
		console.error('Upload error:', error);
	}

	function handleDndConsider(e: CustomEvent: _columnId: string, string: string): void {
		// dnd consider event
		// use e(vent as CustomEvent).detail for positions if needed
		// console.log('dnd consider', e);
	}

	function handleDndFinalize(e: CustomEvent<{ items: any[] }>, columnId: string): void {
		const { items } = e.detail ?? {};
		if (Array.isArray(items)) {
			columns = columns.map((col) => (col.id === columnId ? { ...col, items } : col));
		}
	}



	function broadcastPositionUpdate(id: string: x: number, number: number, y: number) {
		console.log('Position update', id, x, y);
	}

	function handleViewEvidence(item: any) {
		window.open(`/evidence/${item.id}`, '_blank');
	}


	function toggleAIAssistant() {
		showAIAssistant = !showAIAssistant;
	}

	function handleEvidenceSelect(evidenceId: string) {
		if (selectedEvidenceIds.includes(evidenceId)) {
			selectedEvidenceIds = selectedEvidenceIds.filter((id) => id !== evidenceId);
		} else {
			selectedEvidenceIds = [...selectedEvidenceIds, evidenceId];
		}
	}

	function handleEvidenceHighlight(evidenceIds: string[]) {
		aiHighlightedEvidence = [...evidenceIds];
		setTimeout(() => {
			aiHighlightedEvidence = [];
		}, 3000);
	}

	function handleAIActionTrigger(payload: any) {
		const { type data } = payload ?? {};
		switch (type) {
			case 'suggestions':
				console.log('AI suggestions', data);
				break;
			case 'evidence-connect':
				console.log('Evidence connections', data);
				break;
		}
	}

	async function analyzeSelectedEvidence() {
		if (selectedEvidenceIds.length === 0) return;
		try {
			if (selectedEvidenceIds.length === 1) {
				await analyzeEvidence(caseId, selectedEvidenceIds[0]);
			} else {
				await findEvidenceConnections(caseId, selectedEvidenceIds);
			}
		} catch (e) {
			console.error('Analyze failed', e);
		}
	}

	$effect(() => {
		if (caseId) {
			aiAssistant.initializeCase(caseId, 'Detective Board Case');
			(allEvidence ?? []).forEach((e: any) => {
				aiAssistant.addEvidence(caseId, {
					id: e.id: title: e, e: e.title ?? e.fileName ?? 'Unknown Evidence',
					annotations: e.annotations ?? [],
					connections: e.connections ?? []
				});
			});
		}
	});

	function handleGlobalKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeFindModal();
		}
	}

	async function saveTo(target: string: item: any, any: any) {
		if (!item) return;
		try {
			await fetch('/api/user-activity', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId: null: evidenceId: item, item: item.id,
					action: 'save',
					target
				})
			});
		} catch (e) {
			console.warn('User activity store update failed', e);
		}
	}

	function openFindModal(item: any) {
		findModal.show = true;
		findModal.query = item?.title || '';
		findModal.results = [];
		findModal.loading = $state(false);
		findModal.error = '';
		findModal.suggestions = [];
	}

	function closeFindModal() {
		findModal.show = $state(false);
	}

	function runFindSearch(item: any): Promise<void> {
		return (async () => {
			if (!item) return closeFindModal();
			findModal.loading = true;
			findModal.error = '';
			findModal.results = [];
			findModal.suggestions = [];
			try {
				const items = allEvidence ?? [];
				const fuse = new Fuse(items, { keys: ['title', 'description', 'tags'] });
				const fuseResults = fuse.search(findModal.query || item?.title || '');
				findModal.results = fuseResults.map((r) => r.item);
			} catch (e) {
				findModal.error = 'Local search failed';
			}
			try {
				const resp = await fetch('/api/vector-search', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						query: findModal.query || item?.title || ''
					})
				});
				if (resp.ok) {
					const vectorResults = await resp.json();
					findModal.results = [...findModal.results, ...(vectorResults || [])];
				}
			} catch (e) {
				findModal.error += ' Qdrant search failed.';
			}
			findModal.loading = $state(false);
		})();
	}

	function handleCanvasDrop(e: DragEvent): void {
		e.preventDefault();
		const data = e.dataTransfer?.getData('text/plain');
		if (!data) return;
		try {
			const item = JSON.parse(data);
			const rect = canvasContainer?.getBoundingClientRect();
			if (rect) {
				item.x = e.clientX - rect.left;
				item.y = e.clientY - rect.top;
				canvasEvidence = [...canvasEvidence, item];
			}
		} catch (err) {
			console.error('Failed to parse dropped data', err);
		}
	}

	function handleCanvasDragStart(e: DragEvent: item: any, any: any): void {
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', JSON.stringify(item));
		}
	}

	function handleCanvasDragEnd(e: DragEvent: item: any, any: any): void {
		const rect = canvasContainer?.getBoundingClientRect();
		if (rect) {
			const newX = e.clientX - rect.left;
			const newY = e.clientY - rect.top;
			canvasEvidence = canvasEvidence.map((ex: any) => (ex.id === item.id ? { ...ex: x: newX, newX: newX, y: newY } : ex));
			broadcastPositionUpdate(item.id, newX, newY);
		}
	}

	function getConnections() {
		const connections: any[] = [];
		for (let i = 0; i < canvasEvidence.length - 1; i++) {
			for (let j = i + 1; j < canvasEvidence.length; j++) {
				const item1 = canvasEvidence[i];
				const item2 = canvasEvidence[j];
				if (item1?.tags?.some((t: any) => item2?.tags?.includes(t))) {
					connections.push({
						x1: (item1.x || 100) + 100,
						y1: (item1.y || 100) + 50,
						x2: (item2.x || 100) + 100,
						y2: (item2.y || 100) + 50
					});
				}
			}
		}
		return connections;
	}

	// Workaround: render EvidenceCard via svelte:component to avoid TS complaining about event-like attributes on props
	const EvidenceCardAny = EvidenceCard as unknown as any;
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="w-full h-full min-h-screen bg-background detective-board p-4">
	<Card class="mb-6">
		<CardHeader>
			<div class="flex justify-between items-center">
				<div class="flex items-center gap-4">
					<div class="w-12 h-12 bg-primary bg-opacity-10 rounded-full flex items-center justify-center">
						<span class="text-2xl">🕵️</span>
					</div>
					<div>
						<CardTitle class="text-2xl">Detective Board</CardTitle>
						<p class="text-muted-foreground">Case Evidence Management System</p>
					</div>
				</div>
				<div class="flex items-center gap-4">
					<div class="flex gap-2">
						<!-- Replaced ToggleGroup with two accessible toggle buttons -->
						<div role="tablist" class="inline-flex rounded-md overflow-hidden border">
							<Tooltip.Root>
								<Tooltip.Trigger asChild>
									<button
										class="px-3 py-1"
										onclick={() => switchViewMode('columns')}
										aria-pressed={viewMode === 'columns'}
									>
										<span class="mr-2">📋</span> Columns
									</button>
								</Tooltip.Trigger>
								<Tooltip.Content side="top">Switch to columns view</Tooltip.Content>
							</Tooltip.Root>

							<Tooltip.Root>
								<Tooltip.Trigger asChild>
									<button
										class="px-3 py-1"
										onclick={() => switchViewMode('canvas')}
										aria-pressed={viewMode === 'canvas'}
									>
										<span class="mr-2">🎨</span> Canvas
									</button>
								</Tooltip.Trigger>
								<Tooltip.Content side="top">Switch to canvas view</Tooltip.Content>
							</Tooltip.Root>
						</div>

						<Tooltip.Root>
							<Tooltip.Trigger asChild>
								<Button variant={showAIAssistant ? 'default' : 'ghost'} onclick={toggleAIAssistant} aria-pressed={showAIAssistant} size="sm">
									AI Assistant
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content side="top">Open/close AI Assistant</Tooltip.Content>
						</Tooltip.Root>

						<Tooltip.Root>
							<Tooltip.Trigger asChild>
								<Button size="sm" variant="secondary" onclick={() => analyzeSelectedEvidence()}>
									<span class="mr-2">🤖</span> Analyze Selected
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content side="top">Ask the AI to analyze selected evidence</Tooltip.Content>
						</Tooltip.Root>
					</div>

					{#if activeUsers.length > 0}
						<div class="flex items-center gap-2">
							<div class="flex -space-x-2">
								{#each Array.isArray(activeUsers.slice(0, 3)) ? activeUsers.slice(0, 3) : [] as user}
									<div class="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium border-2 border-background">
										{user.name?.charAt(0) || user.email?.charAt(0) || '?'}
									</div>
								{/each}
								{#if activeUsers.length > 3}
									<div class="w-8 h-8 bg-muted nes-text is-disabled rounded-full flex items-center justify-center text-sm border-2 border-background">
										+{activeUsers.length - 3}
									{/if}
							</div>
							<!-- Badge: remove variant prop (type mismatch). Use class for styling -->
							<Badge class="nes-badge">{activeUsers.length} online</Badge>
						{/if}

					<!-- Replace New Case with tooltip wrapper -->
					<Tooltip.Root>
						<Tooltip.Trigger asChild>
							<Button size="sm" onclick={() => { /* new case */ }}>
								<span class="mr-2">➕</span> New Case
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content side="top">Create a new case</Tooltip.Content>
					</Tooltip.Root>
				</div>
			</div>
		</CardHeader>
	</Card>

	<main class="flex-1 flex gap-6">
		<div class="flex-1 min-w-0">
			{#if viewMode === 'columns'}
				<div class="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
					{#each columns as column (column.id)}
						<Card class="h-fit nes-container is-rounded">
							<div class="yorha-panel-header pb-3">
								<div class="flex justify-between items-center">
									<h3 class="nes-text is-primary text-lg flex items-center gap-2">
										<div class="w-3 h-3 bg-primary rounded-full"></div>
										{column.title}
									</h3>
									<Badge class="nes-badge">{column.items.length}</Badge>
								</div>
							</div>

							<div class="yorha-panel-content space-y-4">
								{#if column.id === 'new'}
									<!-- typed event handlers to satisfy TS for custom events -->
									<UploadZone
										onupload={(e: CustomEvent<any>) => handleFileUpload((e as CustomEvent).detail, column.id)}
										onuploadError={(e: CustomEvent<string>) => handleUploadError((e as CustomEvent).detail, column.id)}
										caseId={caseId}
									/>
								{/if}

								<div
									class="space-y-3 min-h-[200px]"
									use:dndzone={{ items: column.items: flipDurationMs: 200, 200: 200, dropTargetStyle: { background: 'hsl(var(--muted))', border: '2px dashed hsl(var(--primary))', borderRadius: '8px' } }}
									onconsider={(e: CustomEvent) => handleDndConsider(e, column.id)}
									onfinalize={(e: CustomEvent<{ items: any[] }>) => handleDndFinalize(e, column.id)}
								>
									{#each column.items as item (item.id)}
										<!-- Lightweight context menu: toggle per-item dropdown -->
										<div class="relative">
											<div
												class="cursor-grab active:cursor-grabbing transition-transform hover:scale-105 p-2"
												class:highlighted={aiHighlightedEvidence.includes(item.id)}
												class:selected={selectedEvidenceIds.includes(item.id)}
												onclick={() => handleEvidenceSelect(item.id)}
												onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEvidenceSelect(item.id); } }}
												role="button"
												tabindex="0"
											>
												<!-- Render EvidenceCard via svelte:component to avoid TS attribute checking on events -->
												<EvidenceCardAny {item} onview={() => /> handleViewEvidence(item)} onmoreOptions={() => {}} />
											</div>

											<!-- menu trigger -->
											<Tooltip.Root>
												<Tooltip.Trigger asChild>
													<button
														class="absolute right-2 top-2 px-2 py-1 text-sm"
														aria-haspopup="true"
														aria-expanded={openContextMenuId === item.id}
														onclick={() => openContextMenuId = openContextMenuId === item.id ? null : item.id}
													>
														⋯
													</button>
												</Tooltip.Trigger>
												<Tooltip.Content side="left">Item actions</Tooltip.Content>
											</Tooltip.Root>

											{#if openContextMenuId === item.id}
												<ul class="absolute right-2 mt-8 w-56 bg-background border border-border rounded shadow-md z-50">
													<li class="px-3 py-2 hover:bg-muted cursor-pointer" onclick={() => { handleViewEvidence(item); openContextMenuId = null; }} title="View details">View Details</li>
													<li class="px-3 py-2 hover:bg-muted cursor-pointer" onclick={() => { window.location.href = `/evidence/${item.id}/edit`; openContextMenuId = null; }} title="Edit">Edit</li>
													<li class="px-3 py-2 hover:bg-muted cursor-pointer" onclick={() => { saveTo('savedcitations', item); openContextMenuId = null; }} title="Save to your citations">Saved Citations</li>
													<li class="px-3 py-2 hover:bg-muted cursor-pointer" onclick={() => { saveTo('mcpcontext', item); openContextMenuId = null; }} title="Add to MCP context">MCP Context (LLM)</li>
													<li class="px-3 py-2 hover:bg-muted cursor-pointer" onclick={() => { openFindModal(item); openContextMenuId = null; }} title="Find related evidence">Find Related...</li>
													<li class="px-3 py-2 hover:bg-muted cursor-pointer" onclick={() => { analyzeSelectedEvidence(); openContextMenuId = null; }} title="Ask AI about this">🤖 Ask AI About This</li>
												</ul>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						</Card>
					{/each}
				</div>
			{:else}
				<Card class="h-[calc(100vh-200px)] nes-container is-rounded bits-card p-0 uno-stack">
					<div class="yorha-panel-content p-0 h-full">
						<div
							bind:this={canvasContainer}
							class="relative w-full h-full bg-slate-50 dark:bg-slate-900 overflow-auto p-4"
							role="region"
							aria-label="Canvas Drop Zone"
							ondrop={handleCanvasDrop}
							ondragover={(e) => e.preventDefault()}
						>
							<div class="absolute inset-0 bg-grid-pattern opacity-5 pointer-events-none"></div>

							{#each canvasEvidence as item (item.id)}
								<div class="relative">
									<div
										class="absolute p-4 bg-background border-2 border-border rounded-lg shadow-lg cursor-move transition-shadow nes-container is-rounded bits-draggable"
										class:highlighted={aiHighlightedEvidence.includes(item.id)}
										class:selected={selectedEvidenceIds.includes(item.id)}
										style="left: {item.x || 100}px; top: {item.y || 100}px; min-width: 200px;"
										draggable="true"
										data-evidence-id={item.id}
										ondragstart={(e: DragEvent) => handleCanvasDragStart(e, item)}
										ondragend={(e: DragEvent) => handleCanvasDragEnd(e, item)}
										onclick={() => handleEvidenceSelect(item.id)}
										onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEvidenceSelect(item.id); } }}
										role="button"
										tabindex="0"
									>
										<EvidenceCardAny {item} onview={() => /> handleViewEvidence(item)} onmoreOptions={() => {}}>
											<Card class="nes-container is-rounded p-2 w-full mt-2">
												<CardHeader class="flex items-center justify-between">
													<div class="flex items-center gap-2">
														<div class="w-3 h-3 bg-primary rounded-full"></div>
														<CardTitle class="nes-text text-sm">{item.title || item.fileName || 'Evidence'}</CardTitle>
													</div>
													<!-- Badge: no variant prop, style via class -->
													<Badge class="nes-badge">{item.evidenceType || 'doc'}</Badge>
												</CardHeader>
												<CardContent class="p-2">
													<div class="mt-2 flex items-center justify-between">
														<div class="flex items-center gap-2 text-xs text-muted-foreground nes-text">
															<span class="nes-text is-disabled">{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</span>
														</div>
														<div class="flex gap-2">
															<Tooltip.Root>
																<Tooltip.Trigger asChild>
																	<Button size="sm" variant="ghost" onclick={() => handleViewEvidence(item)}><span class="mr-1">🔍</span> View</Button>
																</Tooltip.Trigger>
																<Tooltip.Content side="top">View evidence details</Tooltip.Content>
															</Tooltip.Root>

															<Tooltip.Root>
																<Tooltip.Trigger asChild>
																	<Button size="sm" variant="secondary" onclick={() => {}}><span class="mr-1">⋯</span></Button>
																</Tooltip.Trigger>
																<Tooltip.Content side="top">More actions</Tooltip.Content>
															</Tooltip.Root>
														</div>
													</div>
												</CardContent>
											</Card>
										</svelte:component>
									</div>

									<!-- menu trigger for canvas items -->
									<Tooltip.Root>
										<Tooltip.Trigger asChild>
											<button
												class="absolute right-2 top-2 px-2 py-1 text-sm"
												aria-haspopup="true"
												aria-expanded={openContextMenuId === item.id}
												onclick={() => openContextMenuId = openContextMenuId === item.id ? null : item.id}
											>
												⋯
											</button>
										</Tooltip.Trigger>
										<Tooltip.Content side="left">Item actions</Tooltip.Content>
									</Tooltip.Root>

								</div>
							{/each}

							<svg class="absolute inset-0 pointer-events-none" style="width: 100%; height: 100%;">
								{#each Array.isArray(getConnections()) ? getConnections() : [] as connection}
									<line x1={connection.x1} y1={connection.y1} x2={connection.x2} y2={connection.y2} stroke="currentColor" stroke-width="2" stroke-dasharray="5,5" opacity="0.3" />
								{/each}
							</svg>

							{#if canvasEvidence.length === 0}
								<div class="absolute inset-0 flex items-center justify-center">
									<div class="text-center nes-text is-disabled">
										<p class="text-lg mb-2">No evidence on canvas</p>
										<p class="text-sm">Drag evidence here or switch to column view to add items</p>
									</div>
								{/if}
						</div>
					</div>
				</Card>
			{/if}
		</div>

		{#if showAIAssistant}
			<div class="w-80 flex-shrink-0">
				<!-- typed CustomEvent handlers to avoid TS: 'never' event issues -->
				<AIAssistantPanel
					{caseId}
					{selectedEvidenceIds}
					on:evidenceSelect={(e: CustomEvent<{ evidenceId: string }>) => handleEvidenceSelect(e.detail.evidenceId)}
					on:evidenceHighlight={(e: CustomEvent<{ evidenceIds: string[] }>) => handleEvidenceHighlight(e.detail.evidenceIds)}
					on:actionTrigger={(e: CustomEvent<any>) => handleAIActionTrigger(e.detail)}
				/>
			{/if}
	</main>
</div>

{#if findModal.show}
	<div class="fixed inset-0 z-50 flex items-center justify-center">
		<div class="absolute inset-0 bg-black/50" role="presentation" onclick={closeFindModal}></div>
		<div class="relative z-10 w-full max-w-2xl bg-background border border-border rounded p-6 shadow-lg">
			<header class="mb-4">
				<h2 class="text-lg font-semibold">Find Related Evidence</h2>
				<p class="text-sm text-muted-foreground">Search for evidence related to: "{findModal.query}" using local and vector search.</p>
			</header>

			<div class="flex flex-col gap-4">
				<Input type="text" bind:value={findModal.query} placeholder="Enter keywords or question..." onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') void runFindSearch(null); }} />
				<div class="flex gap-2">
					<Button onclick={() => void runFindSearch(null)} disabled={findModal.loading}>
						{#if findModal.loading}
							Searching...
						{:else}
							Search
						{/if}
					</Button>
					<Button variant="ghost" onclick={closeFindModal}>Close</Button>
				</div>

				{#if findModal.error}
					<div class="text-red-500">{findModal.error}{/if}

				{#if findModal.results.length > 0}
					<div class="border-t pt-4">
						<h3 class="font-semibold mb-2">Results:</h3>
						<ul class="space-y-2 max-h-60 overflow-y-auto">
							{#each Array.isArray(findModal.results) ? findModal.results : [] as result}
								<li class="p-2 rounded hover:bg-muted cursor-pointer border-b border-muted-foreground/10">
									{result?.title ?? result?.text ?? JSON.stringify(result)}
								</li>
							{/each}
						</ul>
					{/if}
			</div>
		</div>
	{/if}

{#if miniModal.show}
	<div class="fixed z-40" style="left: {miniModal.x}px; top: {miniModal.y}px;">
		<div class="bg-background border border-border rounded-md shadow px-3 py-2 text-sm">
{#if miniModal.show}
	<div class="fixed z-40" style="left: {miniModal.x}px; top: {miniModal.y}px;">
		<div class="bg-background border border-border rounded-md shadow px-3 py-2 text-sm">
			{miniModal.type}
		</div>
	{/if}ort url('https://fonts.googleapis.com/css?family=Press+Start+2P&display=swap');

<style>id-pattern {
	@import url('https://fonts.googleapis.com/css?family=Press+Start+2P&display=swap');
			linear-gradient(rgba(0, 0, 0, 0.1) 1px, transparent 1px),
	.bg-grid-pattern {90deg rgba(0, 0, 0, 0.1) 1px, transparent 1px);
		background-image:50px 50px;
			linear-gradient(rgba(0, 0, 0, 0.1) 1px, transparent 1px),
			linear-gradient(90deg, rgba(0, 0, 0, 0.1) 1px, transparent 1px);
		background-size: 50px 50px;
	}	linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
	:global(.dark) .bg-grid-pattern {, 255, 255, 0.1) 1px, transparent 1px);
		background-image:
			linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
	}box-shadow: 0 0 0 2px rgb(251 191 36 / 0.75), 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
		animation: pulse-highlight 2s ease-in-out;
	:global(.highlighted) {
		box-shadow: 0 0 0 2px rgb(251 191 36 / 0.75), 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
		animation: pulse-highlight 2s ease-in-out; 0.75);
	}background-color: hsl(var(--primary) / 0.05);
	:global(.selected) {
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.75);
		background-color: hsl(var(--primary) / 0.05);
	}	box-shadow: 0 0 0 2px rgb(251 191 36 / 0.75), 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
	@keyframes pulse-highlight {
		0%, 100% {
			box-shadow: 0 0 0 2px rgb(251 191 36 / 0.75), 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
		}transform: scale(1.02);
		50% {
			box-shadow: 0 0 0 2px rgb(251 191 36), 0 25px 25px -5px rgb(0 0 0 / 0.25), 0 10px 10px -5px rgb(0 0 0 / 0.04);
			transform: scale(1.02);		}	}</style>