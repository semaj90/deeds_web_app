<script lang="ts">
	import * as Bits from 'bits-ui';
	import type {
		AtlasNode,
		AtlasEdge,
		AtlasChunk,
		TraceStep,
		AtlasHealthStatus,
		AtlasCacheStats,
		AtlasRoutingSignals,
		AtlasWeightProfile,
	} from '$lib/types/atlas.js';
	import { NODE_COLORS, NODE_RADIUS } from '$lib/types/atlas.js';

	type AdminCacheStats = {
		timestamp: string;
		l1_redis?: {
			totalKeys: number;
			llmCacheKeys: number;
			memoryMB: string;
			usedMemoryMB: string;
			hitRate: string;
			keyspaceHits: number;
			keyspaceMisses: number;
		};
		performance?: {
			expectedHitRate: string;
			avgCacheLatency: string;
			avgColdLatency: string;
			speedup: string;
		};
		recommendations?: string[];
	};

	type TaskPacketWorkflowStatus = {
		mode: 'task' | 'queue' | 'next';
		taskId: number | null;
		queueId: string | null;
		packetId: string | null;
		task: Record<string, unknown> | null;
		queue: Record<string, unknown> | null;
		packet: Record<string, unknown> | null;
		cached: Record<string, unknown> | null;
		fileLinks: string[];
		clusterLinks: Array<Record<string, unknown>>;
		nextQueuedTask: {
			queueId: string;
			taskId: number;
			packetId: string | null;
			status: string | null;
			featureId: string | null;
			sourceRef: string | null;
			nextAction: string | null;
			confidence: number;
			clusterId: string | null;
			centroidId: string | null;
			taskTitle: string | null;
		} | null;
	};

	type AtlasPageData = {
		health: AtlasHealthStatus | null;
		cacheStats?: AdminCacheStats | null;
		workflowStatus?: TaskPacketWorkflowStatus | null;
		chatModel?: string;
		embedModel?: string;
		kvProfile?: string;
	};

	let { data }: { data: AtlasPageData } = $props();

	// ── Health & Collections ──────────────────────────────────────────────────
	let health = $state<AtlasHealthStatus | null>(null);
	let cacheStats = $state<AdminCacheStats | null>(null);
	let healthLoading = $state(false);
	let workflowTaskId = $state('');
	let workflowQueueId = $state('');
	let workflowStatus = $state<TaskPacketWorkflowStatus | null>(null);
	let workflowLoading = $state(false);
	let workflowError = $state('');
	let workflowAction = $state('idle');

	$effect(() => {
		health = data.health;
		cacheStats = data.cacheStats ?? null;
		workflowStatus = data.workflowStatus ?? workflowStatus;
		if (data.workflowStatus?.taskId != null) workflowTaskId = String(data.workflowStatus.taskId);
		if (data.workflowStatus?.queueId) workflowQueueId = data.workflowStatus.queueId;
	});

	async function refreshHealth() {
		healthLoading = true;
		try {
			const [healthRes, cacheRes] = await Promise.all([
				fetch('/api/admin/atlas/health'),
				fetch('/api/admin/cache-stats')
			]);
			if (healthRes.ok) health = await healthRes.json();
			if (cacheRes.ok) cacheStats = await cacheRes.json();
		} finally {
			healthLoading = false;
		}
	}

	// ── Retrieval Parameters & Tuning ─────────────────────────────────────────
	let blendCosine = $state(0.45);
	let blendPageRank = $state(0.20);
	let blendTopology = $state(0.15);
	let openTuningDialog = $state(false);

	// Reset parameters to baseline
	function resetParameters() {
		blendCosine = 0.45;
		blendPageRank = 0.20;
		blendTopology = 0.15;
	}

	async function refreshWorkflowStatus() {
		if (workflowLoading) return;
		workflowLoading = true;
		workflowError = '';
		try {
			const params = new URLSearchParams();
			if (workflowTaskId.trim()) params.set('taskId', workflowTaskId.trim());
			if (workflowQueueId.trim()) params.set('queueId', workflowQueueId.trim());
			const r = await fetch(`/api/tasks/packets/workflow${params.toString() ? `?${params.toString()}` : ''}`);
			const d = await r.json();
			if (!r.ok || !d.ok) {
				workflowError = d.error ?? 'Failed to load workflow status';
				return;
			}
			workflowStatus = d.status ?? null;
			workflowAction = 'status_refreshed';
			if (workflowStatus?.taskId != null) workflowTaskId = String(workflowStatus.taskId);
			if (workflowStatus?.queueId) workflowQueueId = workflowStatus.queueId;
		} catch (e) {
			workflowError = String(e);
		} finally {
			workflowLoading = false;
		}
	}

	async function pickNextTask() {
		if (workflowLoading) return;
		workflowLoading = true;
		workflowError = '';
		workflowAction = 'claiming';
		try {
			const r = await fetch('/api/tasks/packets/workflow', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'claim' }),
			});
			const d = await r.json();
			if (!r.ok || !d.ok) {
				workflowError = d.error ?? 'Claim failed';
				return;
			}
			workflowStatus = d.status ?? null;
			workflowAction = d.claimed ? 'claimed' : 'no_queued_tasks';
			if (d.claimed?.taskId != null) workflowTaskId = String(d.claimed.taskId);
			if (d.claimed?.queueId) workflowQueueId = d.claimed.queueId;
		} catch (e) {
			workflowError = String(e);
		} finally {
			workflowLoading = false;
		}
	}

	async function runWorkflow(dryRun = false) {
		if (!workflowTaskId.trim()) {
			workflowError = 'Task ID is required';
			return;
		}
		if (workflowLoading) return;
		workflowLoading = true;
		workflowError = '';
		workflowAction = dryRun ? 'dry_run' : 'running';
		try {
			const r = await fetch('/api/tasks/packets/workflow', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					taskId: Number(workflowTaskId.trim()),
					dryRun,
				}),
			});
			const d = await r.json();
			if (!r.ok || !d.ok) {
				workflowError = d.error ?? 'Workflow run failed';
				return;
			}
			if (dryRun) {
				workflowStatus = d.status ?? null;
				workflowAction = 'dry_run_ready';
			} else {
				workflowAction = 'workflow_run';
				await refreshWorkflowStatus();
			}
		} catch (e) {
			workflowError = String(e);
		} finally {
			workflowLoading = false;
		}
	}

	// ── Query Panel ───────────────────────────────────────────────────────────
	let queryText = $state('');
	let noCache = $state(false);
	let querying = $state(false);
	let queryError = $state('');

	// Result state
	let mode = $state('');
	let confidence = $state(0);
	let latencyMs = $state(0);
	let cacheHit = $state(false);
	let lexicalFallback = $state(false);
	let lexicalHitCount = $state(0);
	let codebaseHitCount = $state(0);
	let wikiHitCount = $state(0);
	let karpathyRev = $state('');
	let effectiveWeights = $state<AtlasWeightProfile | null>(null);
	let routingSignals = $state<AtlasRoutingSignals | null>(null);
	let chunks = $state<AtlasChunk[]>([]);
	let sourceRefs = $state<string[]>([]);
	let graphPaths = $state<string[]>([]);
	let nodes = $state<AtlasNode[]>([]);
	let edges = $state<AtlasEdge[]>([]);
	let trace = $state<TraceStep[]>([]);

	async function runQuery() {
		if (!queryText.trim() || querying) return;
		querying = true;
		queryError = '';
		try {
			const r = await fetch('/api/admin/atlas/query', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: queryText.trim(),
					noCache,
					blendCosine,
					blendPageRank,
					blendTopology
				}),
			});
			const d = await r.json();
			if (!r.ok) { queryError = d.error ?? 'Query failed'; return; }

			const res = d.result ?? d;
			mode = res.mode ?? '';
			confidence = res.confidence ?? 0;
			latencyMs = d.latencyMs ?? res.latencyMs ?? 0;
			cacheHit = d.cacheHit ?? false;
			lexicalFallback = d.lexicalFallback ?? res.lexicalFallback ?? false;
			lexicalHitCount = d.lexicalHitCount ?? res.lexicalHitCount ?? 0;
			codebaseHitCount = d.codebaseHitCount ?? res.codebaseHitCount ?? 0;
			wikiHitCount = d.wikiHitCount ?? res.wikiHitCount ?? 0;
			effectiveWeights = d.effectiveWeights ?? res.effectiveWeights ?? null;
			routingSignals = d.routingSignals ?? res.routingSignals ?? null;
			karpathyRev = res.karpathyRev ?? '';
			chunks = res.chunks ?? [];
			sourceRefs = res.sourceRefs ?? [];
			graphPaths = res.graphPaths ?? [];
			nodes = d.nodes ?? [];
			edges = d.edges ?? [];
			trace = d.trace ?? [];
			selectedNode = null;
		} catch (e) {
			queryError = String(e);
		} finally {
			querying = false;
		}
	}

	// ── HyperRAG Pipeline ────────────────────────────────────────────────────
	type HyperRAGResult = {
		query: string;
		latencyMs: number;
		resultCount: number;
		phaseLatency?: { embed: number; cluster: number; qdrant: number; couchdb: number };
		phaseC?: { wikiDocsFetched: number; hitsEnriched: number };
		phaseD?: { cudaBackend: string; centroidCount: number; synthesis: string | null; inferLatencyMs: number; inferError: string | null };
		phaseE?: { sortedHitCount: number; clusterSidecarCount: number; auditLogWritten: boolean };
		results: Array<{ id: string; rank: number; source_ref: string | null; rrfScore: number; karpathyBlend: number | null; text: string | null; wikiEnrichment?: unknown[] }>;
	};
	let hyperRunning = $state(false);
	let hyperResult = $state<HyperRAGResult | null>(null);
	let hyperError = $state('');
	let hyperNoInfer = $state(false);
	let phase18Loading = $state(false);
	let phase18Error = $state('');
	let phase18Report = $state<Record<string, unknown> | null>(null);
	let hyperElapsedMs = $state(0);
	let hyperTimedOut = $state(false);
	let hyperAbortController: AbortController | null = null;
	let hyperElapsedInterval: number | null = null;
	let hyperTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

	function clearHyperTimer() {
		if (hyperElapsedInterval !== null) {
			clearInterval(hyperElapsedInterval);
			hyperElapsedInterval = null;
		}
		if (hyperTimeoutHandle !== null) {
			clearTimeout(hyperTimeoutHandle);
			hyperTimeoutHandle = null;
		}
	}

	function cancelHyperRAG() {
		if (!hyperRunning || !hyperAbortController) return;
		hyperAbortController.abort();
		hyperAbortController = null;
	}

	async function runHyperRAG() {
		if (!queryText.trim()) {
			hyperError = 'Query text is required for HyperRAG';
			return;
		}
		if (hyperRunning) return;
		hyperRunning = true;
		hyperError = '';
		hyperResult = null;
		hyperElapsedMs = 0;
		hyperTimedOut = false;
		hyperAbortController = new AbortController();
		const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
		if (typeof window !== 'undefined') {
			hyperElapsedInterval = window.setInterval(() => {
				hyperElapsedMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime);
			}, 100);
			// 60s cancel guard — abort automatically if pipeline stalls
			hyperTimeoutHandle = setTimeout(() => {
				hyperTimedOut = true;
				hyperAbortController?.abort();
				hyperAbortController = null;
			}, 60_000);
		}
		try {
			const r = await fetch('/api/admin/atlas/hyperrag', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: queryText.trim(), topK: 10, topClusters: 5, noInference: hyperNoInfer }),
				signal: hyperAbortController.signal,
			});
			const d = await r.json();
			if (!r.ok) { hyperError = d.error ?? 'HyperRAG pipeline failed'; return; }
			hyperResult = d;
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') {
				hyperError = hyperTimedOut
					? 'HyperRAG timed out after 60s — pipeline stalled. Try a shorter query or check server logs.'
					: 'HyperRAG request cancelled';
			} else {
				hyperError = String(e);
			}
		} finally {
			hyperRunning = false;
			clearHyperTimer();
			hyperAbortController = null;
		}
	}

	async function loadPhase18Report() {
		if (phase18Loading) return;
		phase18Loading = true;
		phase18Error = '';
		phase18Report = null;
		try {
			const r = await fetch('/api/admin/atlas/messy-routing');
			if (!r.ok) {
				const d = await r.json().catch(() => ({}));
				phase18Error = d.error ?? 'Failed to load Phase 18 report';
				return;
			}
			phase18Report = await r.json();
		} catch (e) {
			phase18Error = String(e);
		} finally {
			phase18Loading = false;
		}
	}

	// ── Graph Canvas ──────────────────────────────────────────────────────────
	let selectedNode = $state<AtlasNode | null>(null);
	let svgEl = $state<SVGSVGElement | null>(null);

	// Camera / Pan-Zoom State
	let panX = $state(0);
	let panY = $state(0);
	let zoom = $state(1);
	let panning = $state(false);
	let panStart = $state({ x: 0, y: 0, px: 0, py: 0 });

	function onSvgMouseDown(e: MouseEvent) {
		if ((e.target as SVGElement).closest('.atlas-node')) return;
		panning = true;
		panStart = { x: e.clientX, y: e.clientY, px: panX, py: panY };
	}
	function onSvgMouseMove(e: MouseEvent) {
		if (!panning) return;
		panX = panStart.px + (e.clientX - panStart.x);
		panY = panStart.py + (e.clientY - panStart.y);
	}
	function onSvgMouseUp() { panning = false; }
	function onWheel(e: WheelEvent) {
		e.preventDefault();
		zoom = Math.max(0.25, Math.min(3, zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
	}
	function resetView() { panX = 0; panY = 0; zoom = 1; }

	function clickNode(n: AtlasNode) {
		selectedNode = selectedNode?.id === n.id ? null : n;
	}

	// ── Node Inspector ────────────────────────────────────────────────────────
	let inspectorData = $state<Record<string, unknown> | null>(null);
	let inspectorLoading = $state(false);

	$effect(() => {
		if (!selectedNode?.data?.source_ref) { inspectorData = null; return; }
		const path = selectedNode.data.source_ref;
		inspectorLoading = true;
		fetch(`/api/admin/atlas/node/${encodeURIComponent(path)}`)
			.then(r => r.json())
			.then(d => { inspectorData = d; })
			.catch(() => { inspectorData = null; })
			.finally(() => { inspectorLoading = false; });
	});

	// ── Cache View ────────────────────────────────────────────────────────────
	let cacheView = $state<AtlasCacheStats | null>(null);
	let cacheLoading = $state(false);

	async function loadCache() {
		cacheLoading = true;
		try {
			const r = await fetch('/api/admin/atlas/cache');
			if (r.ok) cacheView = await r.json();
		} finally {
			cacheLoading = false;
		}
	}

	async function flushCache(key: string) {
		const allowed = ['ace:cartridge:*', 'ace:feature:*', 'ace:topo:*'];
		if (!allowed.includes(key)) return;
		await fetch(`/api/admin/atlas/cache?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
		await loadCache();
	}

	// ── TurboVec Panel ───────────────────────────────────────────────────────
	type TurboVecHealth = { ok: boolean; indexed: number; dim: number; bits: number; backend: string } | null;
	type TurboVecClusterResult = { clusterIds: number[]; centroidScores: Record<string, number>; backend: string; qdrantFilter: unknown };
	let tvHealth = $state<TurboVecHealth>(null);
	let tvLoading = $state(false);
	let tvQuery = $state('');
	let tvResult = $state<TurboVecClusterResult | null>(null);
	let tvResultLoading = $state(false);

	async function loadTurboVec() {
		tvLoading = true;
		try {
			const r = await fetch('http://localhost:8099/health');
			tvHealth = r.ok ? await r.json() : null;
		} catch { tvHealth = null; } finally { tvLoading = false; }
	}

	async function runTvPrefilter() {
		if (!tvQuery.trim()) return;
		tvResultLoading = true;
		tvResult = null;
		try {
			const r = await fetch('/api/admin/atlas/turbovec-prefilter', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: tvQuery.trim(), topClusters: 5 }),
			});
			if (r.ok) tvResult = await r.json();
		} finally { tvResultLoading = false; }
	}

	// ── CouchDB Panel ────────────────────────────────────────────────────────
	type CouchDbStatus = {
		ok: boolean;
		dbName: string;
		docCount: number;
		indexes: string[];
		lastRunId?: string;
	} | null;
	let couchDbStatus = $state<CouchDbStatus>(null);
	let couchDbLoading = $state(false);
	let rollbackRunId = $state('');
	let rollbackLoading = $state(false);
	let rollbackResult = $state<{ deleted: number; failed: number } | null>(null);

	async function loadCouchDb() {
		couchDbLoading = true;
		try {
			const r = await fetch('/api/admin/atlas/couchdb-status');
			if (r.ok) couchDbStatus = await r.json();
		} finally {
			couchDbLoading = false;
		}
	}

	async function doRollback() {
		if (!rollbackRunId.trim()) return;
		rollbackLoading = true;
		rollbackResult = null;
		try {
			const r = await fetch('/api/admin/atlas/couchdb-rollback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ runId: rollbackRunId.trim(), dryRun: false }),
			});
			if (r.ok) rollbackResult = await r.json();
		} finally {
			rollbackLoading = false;
		}
	}

	// ── Cluster Search Panel ─────────────────────────────────────────────────
	type SearchHit = {
		id: string; score: number; filePath: string;
		tags: string[]; cluster: string | null; somCluster: string | null; snippet: string;
	};
	let searchQuery       = $state('');
	let searchTags        = $state<string[]>([]);
	let searchTagInput    = $state('');
	let searchClusters    = $state<number[]>([]);
	let searchMultiQuery  = $state(false);
	let searchLoading     = $state(false);
	let searchResults     = $state<SearchHit[]>([]);
	let searchMeta        = $state<{ queriesUsed: number; totalHits: number } | null>(null);
	let synthesizeLoading = $state(false);
	let synthesizeResult  = $state<{ clustersProcessed: number; durationMs: number } | null>(null);

	function addSearchTag() {
		const t = searchTagInput.trim();
		if (t && !searchTags.includes(t)) searchTags = [...searchTags, t];
		searchTagInput = '';
	}

	async function runClusterSearch() {
		if (!searchQuery.trim()) return;
		searchLoading = true;
		searchResults = [];
		searchMeta    = null;
		try {
			const r = await fetch('/api/admin/atlas/cluster-search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query:      searchQuery.trim(),
					tags:       searchTags,
					clusters:   searchClusters,
					multiQuery: searchMultiQuery,
					limit:      20,
				}),
			});
			if (r.ok) {
				const d = await r.json() as { results: SearchHit[]; queriesUsed: number; totalHits: number };
				searchResults = d.results;
				searchMeta    = { queriesUsed: d.queriesUsed, totalHits: d.totalHits };
			}
		} finally { searchLoading = false; }
	}

	async function runCouchSynthesize(dryRun: boolean) {
		synthesizeLoading = true;
		synthesizeResult  = null;
		try {
			const r = await fetch('/api/admin/atlas/couchdb-synthesize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ maxClusters: 10, dryRun }),
			});
			if (r.ok) {
				const d = await r.json() as { clustersProcessed: number; durationMs: number };
				synthesizeResult = d;
			}
		} finally { synthesizeLoading = false; }
	}

	// ── Active Tab ────────────────────────────────────────────────────────────
	type Tab = 'graph' | 'chunks' | 'trace' | 'cache' | 'turbovec' | 'couchdb' | 'hyperrag' | 'search';
	let activeTab = $state<Tab>('graph');

	// ── Helpers ───────────────────────────────────────────────────────────────
	function serviceStatus(svc: { ok: boolean; latencyMs: number } | undefined) {
		if (!svc) return { label: 'offline', color: 'text-[#c25953]' };
		return svc.ok
			? { label: `${svc.latencyMs}ms`, color: 'text-[#8c9f7a]' }
			: { label: 'offline', color: 'text-[#c25953]' };
	}

	function modeColor(m: string) {
		if (m === 'fast') return 'text-[#8c9f7a]';
		if (m === 'hybrid') return 'text-[#c8a635]';
		return 'text-[#8b9dbb]';
	}

	function confidenceBar(c: number) {
		const pct = Math.round(c * 100);
		const color = c >= 0.75 ? '#8c9f7a' : c >= 0.45 ? '#c8a635' : '#c25953';
		return { pct, color };
	}

	function modelOnline(models: string[] | undefined, expected: string) {
		if (!models) return false;
		const needle = expected.replace(/:latest$/, '');
		return models.some((model) => model === expected || model.includes(needle));
	}

	function kvPair(profile: string) {
		if (profile === 'turboquant') return 'q8_0 / turbo3';
		if (profile === 'turboquant-safe') return 'q8_0 / q8_0';
		return 'q8_0 / q8_0';
	}

	function traceMaxMs(steps: TraceStep[]) {
		return Math.max(1, ...steps.map((step) => step.durationMs));
	}

	function traceSourceLabel() {
		if (cacheHit) return 'REDIS CARTRIDGE CACHE';
		if (lexicalHitCount > 0) return 'RG PARALLEL LANE';
		if (effectiveWeights?.adaptive) return 'ADAPTIVE WEIGHT PLAN';
		if (mode === 'fast') return 'QDRANT FAST PATH';
		if (mode === 'hybrid') return 'QDRANT + WIKI HYBRID';
		if (mode === 'deep') return 'DEEP TRACE ROUTE';
		return 'UNSET';
	}

	let runtime = $derived.by(() => {
		const models = health?.ollama?.models ?? [];
		const chatModel = data.chatModel ?? 'gemma4-legal-vlm:latest';
		const embedModel = data.embedModel ?? 'embeddinggemma:latest';
		const profile = data.kvProfile ?? 'stock';

		return {
			gemma4: {
				online: modelOnline(models, chatModel),
				model: chatModel,
			},
			embedding: {
				online: modelOnline(models, embedModel),
				model: embedModel,
			},
			kvProfile: profile,
			kvPair: kvPair(profile),
			redis: {
				hitRate: cacheStats?.l1_redis?.hitRate ?? '—',
				keyspaceHits: cacheStats?.l1_redis?.keyspaceHits ?? 0,
				keyspaceMisses: cacheStats?.l1_redis?.keyspaceMisses ?? 0,
				totalKeys: cacheStats?.l1_redis?.totalKeys ?? 0,
				llmCacheKeys: cacheStats?.l1_redis?.llmCacheKeys ?? 0,
				memoryMB: cacheStats?.l1_redis?.memoryMB ?? '0.00',
				usedMemoryMB: cacheStats?.l1_redis?.usedMemoryMB ?? '0.00',
			},
			qdrant: {
				codebasePoints: health?.qdrant?.points?.codebase_chunks_768 ?? 0,
				wikiPoints: health?.qdrant?.points?.llm_wiki_chunks ?? 0,
				parentPoints: health?.qdrant?.points?.parents_atlas_chunks ?? 0,
			},
			refreshedAt: cacheStats?.timestamp ?? health?.timestamp ?? '',
		};
	});
</script>

<svelte:head>
	<title>Admin Atlas Studio // YoRHa HUD</title>
</svelte:head>

<div class="yorha-container min-h-screen bg-[#1c1b18] text-[#d1cdb8] flex flex-col font-mono relative overflow-hidden selection:bg-[#d1cdb8] selection:text-[#1c1b18]">

	<!-- Scanlines overlay -->
	<div class="yorha-scanlines absolute inset-0 pointer-events-none opacity-5"></div>

	<!-- ══ Header ══════════════════════════════════════════════════════════════ -->
	<header class="flex flex-col md:flex-row md:items-center justify-between px-6 py-4 border-b border-[#3f3e37] bg-[#23221c] z-10 gap-3">
		<div class="flex items-center gap-3">
			<span class="text-[#efede4] font-bold text-lg tracking-[0.1em] yorha-bracket-l yorha-bracket-r">ATLAS_STUDIO_V2.0</span>
			<span class="px-2 py-0.5 text-[0.65rem] border border-[#5c594c] bg-[#313028] text-[#a39f90] uppercase tracking-wider font-bold">YoRHa Network Layer</span>
		</div>
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
			{#if health}
				{#each [['REDIS', health.redis], ['QDRANT', health.qdrant], ['NEO4J', health.neo4j], ['OLLAMA', health.ollama]] as [name, svc] (name)}
					{@const st = serviceStatus(svc as { ok: boolean; latencyMs: number })}
					<span class="flex items-center gap-1.5 border border-[#3f3e37] px-2 py-1 bg-[#1c1b18]">
						<span class={`w-1.5 h-1.5 rounded-none ${st.label === 'offline' ? 'bg-[#c25953]' : 'bg-[#8c9f7a]'}`}></span>
						<span class="text-[#a39f90] font-bold text-[0.7rem]">{name}:</span>
						<span class={`${st.color} font-bold`}>{st.label}</span>
					</span>
				{/each}
			{:else}
				<span class="text-[#c25953] border border-[#c25953]/20 px-2 py-1 bg-[#c25953]/5 font-bold uppercase tracking-wider">SYSTEMS DEGRADED // OFF-GRID</span>
			{/if}
			<button
				onclick={refreshHealth}
				disabled={healthLoading}
				class="px-2.5 py-1 border border-[#5c594c] bg-[#2c2b23] hover:bg-[#d1cdb8] hover:text-[#1c1b18] text-[#d1cdb8] font-bold transition-all disabled:opacity-40"
				title="Refresh Systems Status"
			>
				{healthLoading ? 'PROBING…' : 'SYSTEM_CHECK'}
			</button>
		</div>
	</header>

	<!-- ══ Body ════════════════════════════════════════════════════════════════ -->
	<div class="flex flex-1 overflow-hidden z-10">

		<!-- ── Left Sidebar: Query + Results ─────────────────────────────────── -->
		<aside class="w-80 flex flex-col border-r border-[#3f3e37] bg-[#23221c] overflow-y-auto shrink-0">

			<!-- Runtime Lane Snapshot -->
			<div class="p-4 border-b border-[#3f3e37] bg-[#1c1b18]/55 space-y-3">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-[0.68rem] text-[#a39f90] font-bold uppercase tracking-wider">// Runtime Lanes</p>
						<p class="mt-1 text-[0.62rem] text-[#5c594c] leading-relaxed">
							Gemma4 handles synthesis, embeddinggemma handles retrieval, KV cache stays runtime-only, Redis backs app memory, and Qdrant stores vector hits.
						</p>
					</div>
					<span class={`px-2 py-1 border text-[0.6rem] font-bold uppercase tracking-wider ${runtime.gemma4.online && runtime.embedding.online ? 'border-[#8c9f7a] text-[#8c9f7a]' : 'border-[#c8a635] text-[#c8a635]'}`}>
						{healthLoading ? 'SYNCING' : 'LANE_SYNC'}
					</span>
				</div>

				<div class="grid grid-cols-1 gap-2 text-[0.68rem]">
					<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2">
						<div class="flex items-center justify-between gap-3">
							<span class="text-[#a39f90] font-bold">GEMMA4_STATUS</span>
							<span class={runtime.gemma4.online ? 'text-[#8c9f7a] font-bold' : 'text-[#c25953] font-bold'}>
								{runtime.gemma4.online ? 'READY' : 'MISSING'}
							</span>
						</div>
						<div class="mt-1 text-[#efede4] truncate font-bold">{runtime.gemma4.model}</div>
					</div>

					<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2">
						<div class="flex items-center justify-between gap-3">
							<span class="text-[#a39f90] font-bold">EMBEDDING_LANE</span>
							<span class={runtime.embedding.online ? 'text-[#8c9f7a] font-bold' : 'text-[#c25953] font-bold'}>
								{runtime.embedding.online ? 'READY' : 'MISSING'}
							</span>
						</div>
						<div class="mt-1 text-[#efede4] truncate font-bold">{runtime.embedding.model}</div>
					</div>

					<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2">
						<div class="flex items-center justify-between gap-3">
							<span class="text-[#a39f90] font-bold">KV_PROFILE</span>
							<span class="text-[#d1cdb8] font-bold">{runtime.kvProfile}</span>
						</div>
						<div class="mt-1 text-[#5c594c]">{runtime.kvPair}</div>
					</div>

					<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2">
						<div class="flex items-center justify-between gap-3">
							<span class="text-[#a39f90] font-bold">REDIS_ACE_HIT_RATE</span>
							<span class="text-[#efede4] font-bold">{runtime.redis.hitRate}</span>
						</div>
						<div class="mt-1 text-[#5c594c]">
							{runtime.redis.keyspaceHits.toLocaleString()} hits / {runtime.redis.keyspaceMisses.toLocaleString()} misses · {runtime.redis.llmCacheKeys.toLocaleString()} llm keys
						</div>
						<div class="text-[#5c594c]">memory {runtime.redis.usedMemoryMB} MB · total {runtime.redis.totalKeys.toLocaleString()}</div>
					</div>

					<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2">
						<div class="flex items-center justify-between gap-3">
							<span class="text-[#a39f90] font-bold">QDRANT_HIT_COUNT</span>
							<span class="text-[#efede4] font-bold">{runtime.qdrant.codebasePoints.toLocaleString()}</span>
						</div>
						<div class="mt-1 text-[#5c594c]">
							codebase_chunks_768 · wiki {runtime.qdrant.wikiPoints.toLocaleString()} · parent {runtime.qdrant.parentPoints.toLocaleString()}
						</div>
					</div>

					<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2 space-y-1.5">
						<div class="flex items-center justify-between gap-3">
							<span class="text-[#a39f90] font-bold">MODALITY_NOTE</span>
							<span class="text-[#d1cdb8] font-bold">TEXT / MULTIMODAL</span>
						</div>
						<div class="space-y-1 text-[#5c594c] leading-relaxed">
							<p>Legal model: gemma4-legal-iq4xs-direct.gguf is the merged LoRA path for synthesis and final answers.</p>
							<p>Text-only GGUF works for chat; image inputs require a build that includes the vision encoder and projector.</p>
							<p>Embeddings stay on embeddinggemma, KV cache stays runtime-only, Redis / BitFrost is cross-request memory, and MTP only speeds generation.</p>
						</div>
					</div>
				</div>

				<p class="text-[0.6rem] text-[#5c594c] leading-relaxed">
					Last sync: {runtime.refreshedAt || 'pending'}
				</p>
			</div>

			<!-- Task Packet Workflow -->
			<div class="p-4 border-b border-[#3f3e37] bg-[#1c1b18]/40 space-y-3">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-[0.68rem] text-[#a39f90] font-bold uppercase tracking-wider">// Task Packet Workflow</p>
						<p class="mt-1 text-[0.62rem] text-[#5c594c] leading-relaxed">
							Inspect the next Kanban packet, dry-run the lifecycle, or run the live workflow for a task.
						</p>
					</div>
					<span class={`px-2 py-1 border text-[0.6rem] font-bold uppercase tracking-wider ${workflowLoading ? 'border-[#c8a635] text-[#c8a635]' : 'border-[#5c594c] text-[#a39f90]'}`}>
						{workflowLoading ? 'SYNCING' : workflowAction.toUpperCase()}
					</span>
				</div>

				<div class="grid grid-cols-1 gap-2 text-[0.68rem]">
					<label class="space-y-1">
						<span class="text-[#a39f90] font-bold uppercase tracking-wider">TASK_ID</span>
						<input
							type="text"
							bind:value={workflowTaskId}
							placeholder="1"
							class="w-full bg-[#1c1b18] border border-[#3f3e37] px-3 py-2 text-xs font-mono text-[#efede4] placeholder-[#5c594c] focus:outline-none focus:border-[#d1cdb8]"
						/>
					</label>
					<label class="space-y-1">
						<span class="text-[#a39f90] font-bold uppercase tracking-wider">QUEUE_ID</span>
						<input
							type="text"
							bind:value={workflowQueueId}
							placeholder="optional queue id"
							class="w-full bg-[#1c1b18] border border-[#3f3e37] px-3 py-2 text-xs font-mono text-[#efede4] placeholder-[#5c594c] focus:outline-none focus:border-[#d1cdb8]"
						/>
					</label>
				</div>

				<div class="grid grid-cols-3 gap-2">
					<button
						onclick={pickNextTask}
						class="px-2.5 py-2 border border-[#5c594c] bg-[#1c1b18] text-[#a39f90] hover:text-[#efede4] hover:border-[#d1cdb8] text-[0.62rem] font-bold uppercase tracking-widest transition-all"
					>
						PICK_NEXT
					</button>
					<button
						onclick={refreshWorkflowStatus}
						class="px-2.5 py-2 border border-[#5c594c] bg-[#1c1b18] text-[#a39f90] hover:text-[#efede4] hover:border-[#d1cdb8] text-[0.62rem] font-bold uppercase tracking-widest transition-all"
					>
						REFRESH_STATUS
					</button>
					<button
						onclick={() => runWorkflow(false)}
						class="px-2.5 py-2 bg-[#d1cdb8] hover:bg-[#efede4] text-[#1c1b18] text-[0.62rem] font-bold uppercase tracking-widest transition-all"
					>
						RUN_WORKFLOW
					</button>
				</div>

				<div class="grid grid-cols-2 gap-2">
					<button
						onclick={() => runWorkflow(true)}
						class="px-2.5 py-2 border border-[#4a5568] bg-[#1c2030] text-[#8b9dbb] hover:text-[#b8c9e8] hover:border-[#8b9dbb] text-[0.62rem] font-bold uppercase tracking-widest transition-all"
					>
						DRY_RUN
					</button>
					<button
						onclick={() => {
							if (workflowStatus?.nextQueuedTask) {
								workflowTaskId = String(workflowStatus.nextQueuedTask.taskId);
								workflowQueueId = workflowStatus.nextQueuedTask.queueId;
							}
						}}
						disabled={!workflowStatus?.nextQueuedTask}
						class="px-2.5 py-2 border border-[#3f3e37] bg-[#1c1b18] text-[#a39f90] hover:text-[#efede4] hover:border-[#d1cdb8] text-[0.62rem] font-bold uppercase tracking-widest transition-all disabled:opacity-30"
					>
						LOAD_NEXT
					</button>
				</div>

				{#if workflowError}
					<div class="p-2.5 border border-[#c25953] bg-[#c25953]/10 text-[#c25953] text-[0.7rem] leading-relaxed">
						<span class="font-bold">WORKFLOW_ERROR:</span> {workflowError}
					</div>
				{/if}

				{#if workflowStatus}
					<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2 space-y-2 text-[0.68rem]">
						<div class="flex items-center justify-between gap-3">
							<span class="text-[#a39f90] font-bold uppercase tracking-wider">STATUS</span>
							<span class="text-[#efede4] font-bold uppercase">{workflowStatus.mode}</span>
						</div>
						<div class="grid grid-cols-2 gap-2 text-[#d1cdb8]">
							<div><span class="text-[#a39f90]">task:</span> {workflowStatus.taskId ?? '—'}</div>
							<div><span class="text-[#a39f90]">queue:</span> {workflowStatus.queueId ?? '—'}</div>
							<div><span class="text-[#a39f90]">packet:</span> {workflowStatus.packetId ?? '—'}</div>
							<div><span class="text-[#a39f90]">cached:</span> {workflowStatus.cached ? 'yes' : 'no'}</div>
						</div>
						<div class="space-y-1 text-[#d1cdb8]">
							<div><span class="text-[#a39f90]">feature:</span> {workflowStatus.packet?.feature_id ?? workflowStatus.cached?.featureId ?? '—'}</div>
							<div><span class="text-[#a39f90]">source:</span> <span class="break-all">{workflowStatus.packet?.source_ref ?? workflowStatus.cached?.sourceRef ?? '—'}</span></div>
							<div><span class="text-[#a39f90]">next:</span> {workflowStatus.packet?.next_action ?? workflowStatus.cached?.nextAction ?? '—'}</div>
							<div><span class="text-[#a39f90]">cluster:</span> {workflowStatus.packet?.cluster_id ?? workflowStatus.cached?.clusterId ?? '—'} · <span class="text-[#a39f90]">centroid:</span> {workflowStatus.packet?.centroid_id ?? workflowStatus.cached?.centroidId ?? '—'}</div>
						</div>
						{#if workflowStatus.nextQueuedTask}
							<div class="border-t border-[#3f3e37] pt-2 space-y-1 text-[#a39f90]">
								<div class="flex items-center justify-between gap-2">
									<span class="font-bold uppercase tracking-wider">NEXT_READY</span>
									<span class="text-[#8c9f7a] font-bold">{workflowStatus.nextQueuedTask.confidence.toFixed(2)}</span>
								</div>
								<div class="text-[#d1cdb8] break-all">{workflowStatus.nextQueuedTask.sourceRef ?? '—'}</div>
								<div class="text-[#d1cdb8]">task {workflowStatus.nextQueuedTask.taskId} · queue {workflowStatus.nextQueuedTask.queueId}</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Query Panel -->
			<div class="p-4 border-b border-[#3f3e37] space-y-4">
				<div>
					<p class="text-[0.68rem] text-[#a39f90] font-bold mb-2 uppercase tracking-[0.15em]">Enter Query Prompt</p>
					<textarea
						bind:value={queryText}
						placeholder="Analyze backpropagation, KV Cache compression..."
						class="w-full h-24 bg-[#1c1b18] border border-[#3f3e37] rounded-none px-3 py-2 text-xs font-mono text-[#efede4] placeholder-[#5c594c] resize-none focus:outline-none focus:border-[#d1cdb8] focus:ring-1 focus:ring-[#d1cdb8]"
						onkeydown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runQuery(); }}
					></textarea>
				</div>

				<div class="flex items-center justify-between gap-2">
					<label class="flex items-center gap-2 text-xs text-[#a39f90] cursor-pointer select-none">
						<input type="checkbox" bind:checked={noCache} class="accent-[#d1cdb8] rounded-none w-3.5 h-3.5 border-[#3f3e37]" />
						<span>BYPASS_CACHE</span>
					</label>

					<button
						onclick={() => openTuningDialog = true}
						class="px-2 py-1.5 border border-[#5c594c] bg-[#1c1b18] text-[#a39f90] hover:text-[#efede4] hover:border-[#d1cdb8] text-[0.7rem] font-bold tracking-wider transition-all"
					>
						[ TUNING ]
					</button>
				</div>

				<button
					onclick={runQuery}
					disabled={querying || !queryText.trim()}
					class="w-full py-2 bg-[#d1cdb8] hover:bg-[#efede4] text-[#1c1b18] text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-30 disabled:hover:bg-[#d1cdb8] disabled:hover:text-[#1c1b18]"
				>
					{querying ? 'EXEC_RETRIEVAL_SWEEP…' : 'RUN_QUERY_RETRIEVAL'}
				</button>

				<!-- HyperRAG Pipeline button -->
				<div class="flex items-center gap-1.5">
					<button
						onclick={runHyperRAG}
						disabled={hyperRunning || !queryText.trim()}
						class="flex-1 py-2 border border-[#4a5568] bg-[#1c1b18] hover:bg-[#2a3444] text-[#8b9dbb] hover:text-[#b8c9e8] text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-30"
					>
						{hyperRunning ? 'HYPERRAG_EXEC…' : '⬡ RUN_HYPERRAG_PIPELINE'}
					</button>
			<button
				onclick={cancelHyperRAG}
				disabled={!hyperRunning}
				class="px-3 py-2 border border-[#c25953] bg-[#1c1b18] text-[#c25953] text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-30"
			>
				CANCEL
			</button>
			<label class="flex items-center gap-1 text-[0.65rem] text-[#a39f90] cursor-pointer select-none">
				<input type="checkbox" bind:checked={hyperNoInfer} class="accent-[#8b9dbb]" />
				<span>fast</span>
			</label>
		</div>
		{#if hyperRunning}
			<div class="text-[0.65rem] text-[#a39f90] uppercase tracking-wider">Elapsed: {hyperElapsedMs}ms</div>
		{/if}
		{#if queryError}
			<div class="p-2.5 border border-[#c25953] bg-[#c25953]/10 text-[#c25953] text-[0.7rem] leading-relaxed">
				<span class="font-bold">QUERY_ERROR:</span> {queryError}
			</div>
		{/if}
		{#if hyperError}
			<div class="p-2.5 border border-[#c25953] bg-[#c25953]/10 text-[#c25953] text-[0.7rem] leading-relaxed">
				<span class="font-bold">HYPERRAG_ERROR:</span> {hyperError}
			</div>
		{/if}
		<button
			onclick={loadPhase18Report}
			disabled={phase18Loading}
			class="w-full py-2 border border-[#5c594c] bg-[#1c1b18] hover:bg-[#2a3444] text-[#a39f90] hover:text-[#efede4] text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-30"
		>
			{phase18Loading ? 'LOADING_PHASE_18…' : 'LOAD_PHASE_18_REPORT'}
		</button>
		{#if phase18Error}
			<div class="p-2.5 border border-[#c25953] bg-[#c25953]/10 text-[#c25953] text-[0.7rem] leading-relaxed">
				<span class="font-bold">PHASE_18_ERROR:</span> {phase18Error}
			</div>
		{/if}
		{#if phase18Report}
			<div class="p-3 border border-[#3f3e37] bg-[#1c1b18]/60 text-xs text-[#d1d0c0] font-mono whitespace-pre-wrap overflow-x-auto max-h-72">
				<pre>{JSON.stringify(phase18Report, null, 2)}</pre>
			</div>
		{/if}
	</div>

			<!-- Dynamic Parameter Indicators -->
			<div class="p-4 border-b border-[#3f3e37] bg-[#1c1b18]/40 space-y-1">
				<p class="text-[0.62rem] text-[#a39f90] font-bold uppercase tracking-wider">Active Search Weights</p>
				<div class="grid grid-cols-3 gap-1 text-[0.68rem] text-center font-bold">
					<div class="border border-[#3f3e37] p-1 bg-[#23221c]">
						<div class="text-[#a39f90]">COS</div>
						<div class="text-[#efede4]">{blendCosine.toFixed(2)}</div>
					</div>
					<div class="border border-[#3f3e37] p-1 bg-[#23221c]">
						<div class="text-[#a39f90]">PR</div>
						<div class="text-[#efede4]">{blendPageRank.toFixed(2)}</div>
					</div>
					<div class="border border-[#3f3e37] p-1 bg-[#23221c]">
						<div class="text-[#a39f90]">TOPO</div>
						<div class="text-[#efede4]">{blendTopology.toFixed(2)}</div>
					</div>
				</div>
			</div>

			{#if effectiveWeights}
				<div class="p-4 border-b border-[#3f3e37] bg-[#1c1b18]/55 space-y-2">
					<p class="text-[0.62rem] text-[#a39f90] font-bold uppercase tracking-wider">// Design Mapping</p>
					<div class="grid grid-cols-3 gap-1 text-[0.68rem] text-center font-bold">
						<div class="border border-[#3f3e37] p-1 bg-[#23221c]">
							<div class="text-[#a39f90]">COS</div>
							<div class="text-[#efede4]">{effectiveWeights.cosine.toFixed(2)}</div>
						</div>
						<div class="border border-[#3f3e37] p-1 bg-[#23221c]">
							<div class="text-[#a39f90]">PR</div>
							<div class="text-[#efede4]">{effectiveWeights.pagerank.toFixed(2)}</div>
						</div>
						<div class="border border-[#3f3e37] p-1 bg-[#23221c]">
							<div class="text-[#a39f90]">TOPO</div>
							<div class="text-[#efede4]">{effectiveWeights.topology.toFixed(2)}</div>
						</div>
					</div>
					<div class="flex items-center justify-between text-[0.62rem] text-[#5c594c] uppercase tracking-wider">
						<span>{effectiveWeights.adaptive ? 'Adaptive' : 'Manual'}</span>
						<span>Total {effectiveWeights.total.toFixed(2)}</span>
					</div>
					<div class="flex flex-wrap gap-1.5 text-[0.62rem] uppercase tracking-wider">
						{#if routingSignals?.shortQuery}
							<span class="px-1.5 py-0.5 border border-[#3f3e37] bg-[#23221c] text-[#c8a635]">SHORT</span>
						{/if}
						{#if routingSignals?.codeAnchors}
							<span class="px-1.5 py-0.5 border border-[#3f3e37] bg-[#23221c] text-[#8c9f7a]">CODE</span>
						{/if}
						{#if routingSignals?.procedural}
							<span class="px-1.5 py-0.5 border border-[#3f3e37] bg-[#23221c] text-[#8b9dbb]">PROC</span>
						{/if}
						{#if routingSignals?.debugging}
							<span class="px-1.5 py-0.5 border border-[#3f3e37] bg-[#23221c] text-[#c25953]">DEBUG</span>
						{/if}
						{#if routingSignals?.lexicalHint}
							<span class="px-1.5 py-0.5 border border-[#3f3e37] bg-[#23221c] text-[#d1cdb8]">RG</span>
						{/if}
					</div>
					<div class="space-y-1 text-[0.62rem] text-[#5c594c] leading-relaxed">
						{#each effectiveWeights.reasons as reason (reason)}
							<p>• {reason}</p>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Result Stats -->
			{#if mode}
				<div class="p-4 border-b border-[#3f3e37] space-y-3">
					<p class="text-[0.68rem] text-[#a39f90] font-bold uppercase tracking-wider border-b border-[#3f3e37] pb-1">// Retrieval Metrics</p>

					<div class="space-y-1.5 text-xs">
						<div class="flex items-center justify-between">
							<span class="text-[#a39f90]">ROUTE_MODE:</span>
							<span class={`font-bold uppercase ${modeColor(mode)}`}>{mode}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-[#a39f90]">CONFIDENCE:</span>
							<span class="text-[#efede4] font-bold">{(confidence * 100).toFixed(1)}%</span>
						</div>
						<div class="w-full h-1 bg-[#3f3e37] overflow-hidden">
							<div class="h-full transition-all" style={`width:${confidenceBar(confidence).pct}%;background:${confidenceBar(confidence).color}`}></div>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-[#a39f90]">LATENCY:</span>
							<span class="text-[#efede4] font-bold">{latencyMs}ms</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-[#a39f90]">CACHE_STATUS:</span>
							<span class={cacheHit ? 'text-[#8c9f7a] font-bold' : 'text-[#a39f90]'}>{cacheHit ? 'HIT (L1)' : 'MISS'}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-[#a39f90]">LEXICAL_LANE:</span>
							<span class={lexicalFallback ? 'text-[#c8a635] font-bold' : 'text-[#a39f90]'}>{lexicalFallback ? 'ON (RG)' : 'OFF'}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-[#a39f90]">LEXICAL_HITS:</span>
							<span class={lexicalHitCount > 0 ? 'text-[#8c9f7a] font-bold' : 'text-[#a39f90]'}>{lexicalHitCount}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-[#a39f90]">ROUTING_MAP:</span>
							<span class={effectiveWeights?.adaptive ? 'text-[#8c9f7a] font-bold' : 'text-[#a39f90]'}>{effectiveWeights?.adaptive ? 'ADAPTIVE' : 'MANUAL'}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-[#a39f90]">CODEBASE_HITS:</span>
							<span class="text-[#efede4] font-bold">{codebaseHitCount}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-[#a39f90]">WIKI_HITS:</span>
							<span class="text-[#efede4] font-bold">{wikiHitCount}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-[#a39f90]">KARPATHY_PR:</span>
							<span class="text-[#d1cdb8] font-bold">{karpathyRev}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-[#a39f90]">ACTIVE_CHUNKS:</span>
							<span class="text-[#efede4] font-bold">{chunks.length} / 10</span>
						</div>
					</div>
				</div>
			{/if}

			<!-- Source Refs -->
			{#if sourceRefs.length > 0}
				<div class="p-4 border-b border-[#3f3e37]">
					<p class="text-[0.68rem] text-[#a39f90] font-bold uppercase tracking-wider mb-2 border-b border-[#3f3e37] pb-1">// Source Documents</p>
					<ul class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
						{#each sourceRefs as ref (ref)}
							<li class="text-[0.68rem] text-[#d1cdb8] truncate flex items-center gap-1.5" title={ref}>
								<span class="w-1.5 h-1.5 bg-[#d1cdb8]/30"></span>
								<span class="font-bold text-[#efede4]">{ref.split('/').pop()}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if graphPaths.length > 0}
				<div class="p-4 border-b border-[#3f3e37]">
					<p class="text-[0.68rem] text-[#a39f90] font-bold uppercase tracking-wider mb-2 border-b border-[#3f3e37] pb-1">// Graph Paths</p>
					<ul class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
						{#each graphPaths as path (path)}
							<li class="text-[0.68rem] text-[#d1cdb8] truncate flex items-center gap-1.5" title={path}>
								<span class="w-1.5 h-1.5 bg-[#8c9f7a]/40"></span>
								<span class="font-bold text-[#efede4]">{path}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Node Inspector -->
			{#if selectedNode}
				<div class="p-4 border-b border-[#3f3e37] space-y-3 bg-[#1e1d18]">
					<p class="text-[0.68rem] text-[#a39f90] font-bold uppercase tracking-wider border-b border-[#3f3e37] pb-1">// Element Inspector</p>
					<div class="text-[0.68rem] space-y-2">
						<div class="flex items-center justify-between gap-2 border border-[#3f3e37] p-1.5 bg-[#23221c]">
							<span class="text-[#efede4] font-bold truncate">{selectedNode.label}</span>
							<span class="px-1 bg-[#d1cdb8] text-[#1c1b18] font-bold text-[0.6rem] uppercase tracking-wider">{selectedNode.type}</span>
						</div>

						{#if selectedNode.data.source_ref}
							<div class="text-[#a39f90] break-all leading-tight">
								<span class="font-bold text-[#d1cdb8]">ref_path:</span> {selectedNode.data.source_ref}
							</div>
						{/if}

						<div class="grid grid-cols-2 gap-1 font-bold text-center border-t border-b border-[#3f3e37] py-1.5">
							{#if selectedNode.data.qdrant_score != null}
								<div>
									<div class="text-[#a39f90] text-[0.6rem]">COSINE</div>
									<div class="text-[#efede4]">{selectedNode.data.qdrant_score.toFixed(3)}</div>
								</div>
							{/if}
							{#if selectedNode.data.pagerank_score != null}
								<div>
									<div class="text-[#a39f90] text-[0.6rem]">PAGE_RANK</div>
									<div class="text-[#efede4]">{selectedNode.data.pagerank_score.toFixed(3)}</div>
								</div>
							{/if}
						</div>

						{#if selectedNode.data.llm_synthesis_weight != null}
							<div class="flex items-center justify-between text-xs">
								<span class="text-[#a39f90] font-bold">SYNTHESIS_WEIGHT:</span>
								<span class="text-[#8c9f7a] font-bold">{selectedNode.data.llm_synthesis_weight.toFixed(4)}</span>
							</div>
						{/if}

						{#if selectedNode.data.text}
							<div class="mt-2 text-[#a39f90] leading-relaxed border border-[#3f3e37]/45 p-2 bg-[#1c1b18]">
								"{selectedNode.data.text}"
							</div>
						{/if}

						{#if inspectorLoading}
							<div class="text-[#c8a635] animate-pulse">PROBING MANIFOLD PERSISTENCE KEY…</div>
						{:else if inspectorData}
							{#if inspectorData.karpathy}
								<div class="border-t border-[#3f3e37] pt-1.5 space-y-1">
									<div class="text-[#efede4] font-bold">Karpathy Model Metrics:</div>
									<div class="flex items-center justify-between text-[0.65rem]">
										<span class="text-[#a39f90]">RAW_PAGE_RANK:</span>
										<span class="text-[#efede4]">{(inspectorData.karpathy as any).pr?.toFixed(4)}</span>
									</div>
									<div class="flex items-center justify-between text-[0.65rem]">
										<span class="text-[#a39f90]">ATTN_ENTROPY:</span>
										<span class="text-[#efede4]">{(inspectorData.karpathy as any).attn?.toFixed(4)}</span>
									</div>
								</div>
							{/if}
						{/if}
					</div>
				</div>
			{/if}
		</aside>

		<!-- ── Main Workspace ────────────────────────────────────────────────── -->
		<main class="flex-1 flex flex-col overflow-hidden relative bg-[#171613]">

			<!-- Tabs Header -->
			<div class="flex items-center justify-between px-4 py-2 border-b border-[#3f3e37] bg-[#23221c] z-10">
				<div class="flex items-center gap-1.5">
					{#each (['graph', 'chunks', 'trace', 'cache', 'turbovec', 'couchdb', 'hyperrag', 'search'] as Tab[]) as tab (tab)}
						<button
							onclick={() => { activeTab = tab; if (tab === 'cache' && !cacheView) loadCache(); if (tab === 'turbovec' && !tvHealth) loadTurboVec(); if (tab === 'couchdb' && !couchDbStatus) loadCouchDb(); if (tab === 'hyperrag' && !hyperResult) runHyperRAG(); }}
							class={`px-3 py-1 text-xs uppercase tracking-wider font-bold transition-all ${activeTab === tab ? 'bg-[#8b9dbb] text-[#1c1b18]' : 'text-[#a39f90] hover:text-[#efede4] hover:bg-[#313028]'} ${tab === 'hyperrag' ? 'border border-[#4a5568]' : ''} ${tab === 'hyperrag' && hyperRunning ? 'animate-pulse' : ''}`}
						>
							{tab === 'hyperrag' ? '⬡' : ''}[{tab}]
						</button>
					{/each}
				</div>
				{#if activeTab === 'graph' && nodes.length > 0}
					<div class="flex items-center gap-3 text-xs">
						<span class="text-[#a39f90] font-bold">{nodes.length} NODES · {edges.length} EDGES</span>
						<button
							onclick={resetView}
							class="px-2 py-0.5 border border-[#5c594c] bg-[#1c1b18] text-[#a39f90] hover:text-[#efede4] hover:border-[#d1cdb8] transition-all"
						>
							[RESET_CAMERA]
						</button>
					</div>
				{/if}
			</div>

			<!-- ── Graph Tab ────────────────────────────────────────────────────── -->
			{#if activeTab === 'graph'}
				<div class="flex-1 relative overflow-hidden">
					{#if nodes.length === 0}
						<!-- System Overview HUD (Welcome screen) -->
						<div class="absolute inset-0 flex flex-col items-center justify-center p-6 overflow-y-auto">
							<div class="max-w-3xl w-full space-y-6">

								<!-- System Welcome Header -->
								<div class="border border-[#3f3e37] bg-[#23221c] p-6 text-center space-y-2 relative shadow-lg">
									<div class="text-[#d1cdb8] text-4xl font-bold tracking-[0.2em] mb-1">⬡ SYSTEM_MONITOR</div>
									<p class="text-[#efede4] font-bold text-sm tracking-widest uppercase">ACE Hybrid Retrieval Manifold Controller</p>
									<p class="text-xs text-[#a39f90] leading-relaxed max-w-lg mx-auto">
										Real-time topological hypergraph visualizer, indexing audit ledger, and multi-lane semantic router interface. Select parameter tuning or query above to initiate sweep.
									</p>
									<div class="absolute top-2 right-2 text-[0.6rem] text-[#3f3e37]">YoRHa Tactical HUD v2.0</div>
								</div>

								<!-- Premium Qdrant Points Counts HUD -->
								<div class="grid grid-cols-1 md:grid-cols-3 gap-4">

									<div class="border border-[#3f3e37] bg-[#23221c] p-4 space-y-3 relative hover:border-[#d1cdb8] transition-all group cursor-default">
										<div class="flex justify-between items-start border-b border-[#3f3e37]/60 pb-1.5">
											<span class="text-[0.62rem] text-[#a39f90] font-bold tracking-wider">COLL: CODEBASE_768</span>
											<span class="px-1 text-[0.55rem] bg-[#8c9f7a]/15 text-[#8c9f7a] font-bold border border-[#8c9f7a]/25">ONLINE</span>
										</div>
										<div class="space-y-1">
											<div class="text-[0.62rem] text-[#a39f90] font-bold">TOTAL_EMBEDDINGS:</div>
											<div class="text-3xl font-extrabold text-[#efede4] group-hover:text-[#d1cdb8] transition-all font-mono">
												{health?.qdrant?.points?.['codebase_chunks_768']?.toLocaleString() ?? '44,045'}
											</div>
											<div class="text-[0.62rem] text-[#a39f90]">768-dim Named Vectors</div>
										</div>
										<div class="text-[0.55rem] text-[#a39f90] tracking-tight leading-none text-right opacity-60">gemma:latest</div>
									</div>

									<div class="border border-[#3f3e37] bg-[#23221c] p-4 space-y-3 relative hover:border-[#d1cdb8] transition-all group cursor-default">
										<div class="flex justify-between items-start border-b border-[#3f3e37]/60 pb-1.5">
											<span class="text-[0.62rem] text-[#a39f90] font-bold tracking-wider">COLL: WIKI_CHUNKS</span>
											<span class="px-1 text-[0.55rem] bg-[#8c9f7a]/15 text-[#8c9f7a] font-bold border border-[#8c9f7a]/25">ONLINE</span>
										</div>
										<div class="space-y-1">
											<div class="text-[0.62rem] text-[#a39f90] font-bold">TOTAL_EMBEDDINGS:</div>
											<div class="text-3xl font-extrabold text-[#efede4] group-hover:text-[#d1cdb8] transition-all font-mono">
												{health?.qdrant?.points?.['llm_wiki_chunks']?.toLocaleString() ?? '1,248'}
											</div>
											<div class="text-[0.62rem] text-[#a39f90]">Dense Feature Cards</div>
										</div>
										<div class="text-[0.55rem] text-[#a39f90] tracking-tight leading-none text-right opacity-60">gemma:latest</div>
									</div>

									<div class="border border-[#3f3e37] bg-[#23221c] p-4 space-y-3 relative hover:border-[#d1cdb8] transition-all group cursor-default">
										<div class="flex justify-between items-start border-b border-[#3f3e37]/60 pb-1.5">
											<span class="text-[0.62rem] text-[#a39f90] font-bold tracking-wider">COLL: PARENT_CHUNKS</span>
											<span class="px-1 text-[0.55rem] bg-[#8c9f7a]/15 text-[#8c9f7a] font-bold border border-[#8c9f7a]/25">ONLINE</span>
										</div>
										<div class="space-y-1">
											<div class="text-[0.62rem] text-[#a39f90] font-bold">TOTAL_EMBEDDINGS:</div>
											<div class="text-3xl font-extrabold text-[#efede4] group-hover:text-[#d1cdb8] transition-all font-mono">
												{health?.qdrant?.points?.['parents_atlas_chunks']?.toLocaleString() ?? '15'}
											</div>
											<div class="text-[0.62rem] text-[#a39f90]">Structured Ingest points</div>
										</div>
										<div class="text-[0.55rem] text-[#a39f90] tracking-tight leading-none text-right opacity-60">gemma:latest</div>
									</div>

								</div>

								<!-- Diagnostics timeline logs -->
								<div class="border border-[#3f3e37] bg-[#23221c]/40 p-4 font-mono text-[0.68rem] text-[#a39f90] space-y-2">
									<div class="flex items-center justify-between border-b border-[#3f3e37]/50 pb-1.5 font-bold">
										<span>SYSTEM_TRACE_AUDIT_LOG</span>
										<span class="text-[#8c9f7a]">SECURE</span>
									</div>
									<div class="space-y-1 select-all max-h-36 overflow-y-auto pr-1">
										<div>[SYSTEM] Booting NieR tactical visualizer interface... done</div>
										<div>[QDRANT] Named vector mapping codebase_chunks_768 validated successfully</div>
										<div>[REDIS] Sub-millisecond exact cache indexer ready</div>
										<div>[BIFROST] OpenAI L2 semantic proxy bound on port 3040</div>
										<div>[OLLAMA] Vector embedding service running via /api/embed</div>
										{#if health?.neo4j?.ok}
											<div>[NEO4J] Manifold database containing {health.neo4j.nodeCount ?? 0} active topological nodes connected</div>
										{/if}
									</div>
								</div>

							</div>
						</div>
					{:else}
						<!-- SVG Canvas with Pan/Zoom -->
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<svg
							bind:this={svgEl}
							class="w-full h-full cursor-grab active:cursor-grabbing select-none"
							onmousedown={onSvgMouseDown}
							onmousemove={onSvgMouseMove}
							onmouseup={onSvgMouseUp}
							onmouseleave={onSvgMouseUp}
							onwheel={onWheel}
							role="img"
							aria-label="Atlas graph canvas"
						>
							<defs>
								<pattern id="dot" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
									<circle cx="1.5" cy="1.5" r="0.75" fill="#3f3e37" opacity="0.3" />
								</pattern>
							</defs>
							<rect width="100%" height="100%" fill="url(#dot)" />

							<!-- Graph Transform Group -->
							<g transform={`translate(${panX},${panY}) scale(${zoom})`}>

								<!-- Edges -->
								{#each edges as edge (edge.id)}
									{@const src = nodes.find(n => n.id === edge.source)}
									{@const tgt = nodes.find(n => n.id === edge.target)}
									{#if src && tgt}
										<line
											x1={src.position.x} y1={src.position.y}
											x2={tgt.position.x} y2={tgt.position.y}
											stroke="#3f3e37" stroke-width="1" opacity="0.7"
										/>
										{#if edge.label}
											{@const mx = (src.position.x + tgt.position.x) / 2}
											{@const my = (src.position.y + tgt.position.y) / 2}
											<text x={mx} y={my} text-anchor="middle" font-size="8" fill="#a39f90" dy="-3">{edge.label}</text>
										{/if}
									{/if}
								{/each}

								<!-- Nodes -->
								{#each nodes as node (node.id)}
									{@const r = NODE_RADIUS[node.type]}
									{@const col = NODE_COLORS[node.type]}
									{@const selected = selectedNode?.id === node.id}
									<g
										class="atlas-node"
										transform={`translate(${node.position.x},${node.position.y})`}
										onclick={() => clickNode(node)}
										style="cursor:pointer"
									>
										<!-- YoRHa Square/Brackets Border on Selected -->
										{#if selected}
											<rect
												x={-r - 6} y={-r - 6} width={r * 2 + 12} height={r * 2 + 12}
												fill="none" stroke="#d1cdb8" stroke-width="1.5"
												stroke-dasharray="4 2"
											/>
										{/if}

										<circle
											cx="0" cy="0" r={r}
											fill={col}
											opacity={selected ? 1 : 0.8}
											stroke={selected ? '#efede4' : '#3f3e37'}
											stroke-width={selected ? 2 : 1}
										/>

										<!-- Central Dot -->
										<circle cx="0" cy="0" r="2.5" fill="#1c1b18" />

										<text
											x="0" y={r + 14}
											text-anchor="middle"
											font-size="9"
											fill={selected ? '#efede4' : '#a39f90'}
											font-weight={selected ? 'bold' : 'normal'}
											font-family="monospace"
										>
											{node.label.length > 20 ? node.label.slice(0, 18) + '…' : node.label}
										</text>
									</g>
								{/each}
							</g>
						</svg>

						<!-- Legend Overlay -->
						<div class="absolute bottom-4 left-4 border border-[#3f3e37] bg-[#23221c]/95 p-3 flex flex-wrap gap-x-4 gap-y-1.5 shadow-lg select-none">
							{#each Object.entries(NODE_COLORS) as [type, color] (type)}
								<span class="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#a39f90]">
									<span class="w-3 h-3 border border-[#1c1b18] inline-block" style="background:{color}"></span>
									{type}
								</span>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- ── Chunks Tab ───────────────────────────────────────────────────── -->
			{#if activeTab === 'chunks'}
				<div class="flex-1 overflow-y-auto p-4 space-y-4">
					{#if chunks.length === 0}
						<div class="text-center py-16 text-[#a39f90] border border-dashed border-[#3f3e37] p-8">
							<div class="text-2xl font-bold uppercase mb-1">NO_CHUNKS_LOADED</div>
							<p class="text-xs">Run a query search to populate the manifold workspace.</p>
						</div>
					{:else}
						{#each chunks as chunk, i (chunk.chunk_id)}
							<div class="border border-[#3f3e37] bg-[#23221c] p-4 space-y-2 hover:border-[#d1cdb8] transition-all relative group">
								<div class="flex justify-between items-center border-b border-[#3f3e37]/60 pb-1.5">
									<span class="text-[0.62rem] text-[#a39f90] font-bold uppercase tracking-wider">
										#{i + 1} · {chunk.aceFeatureKey ? '🌐 WIKI_COLLECTION' : '⬡ CODEBASE_INDEX'}
									</span>
									<span class="text-xs font-bold text-[#efede4] border border-[#d1cdb8]/30 px-1.5 py-0.5 bg-[#1c1b18]">
										{(chunk.score * 100).toFixed(1)}% CONF
									</span>
								</div>

								<div class="text-[0.68rem] text-[#a39f90] truncate leading-none">
									<span class="font-bold text-[#efede4]">source_ref:</span> {chunk.source_ref}
								</div>

								<p class="text-xs text-[#d1cdb8] leading-relaxed italic bg-[#1c1b18]/40 p-2 border-l border-[#d1cdb8]/20">
									"{chunk.text}"
								</p>

								<div class="flex flex-wrap gap-x-4 gap-y-1 text-[0.65rem] text-[#a39f90] font-bold border-t border-[#3f3e37]/40 pt-2">
									<span>COSINE: {chunk.signals.cosine.toFixed(3)}</span>
									<span>PAGERANK: {chunk.signals.pagerank.toFixed(3)}</span>
									<span>TOPOLOGY: {chunk.signals.topology.toFixed(3)}</span>
									{#if chunk.signals.hotness > 0}
										<span class="text-[#c25953] blink">🔥 REDIS_HOT</span>
									{/if}
								</div>
							</div>
						{/each}
					{/if}
				</div>
			{/if}

			<!-- ── Trace Tab ────────────────────────────────────────────────────── -->
			{#if activeTab === 'trace'}
				<div class="flex-1 overflow-y-auto p-4 space-y-4">
					{#if trace.length === 0}
						<div class="text-center py-16 text-[#a39f90] border border-dashed border-[#3f3e37] p-8">
							<div class="text-2xl font-bold uppercase mb-1">NO_TRACE_LOADED</div>
							<p class="text-xs">Exert a query to inspect process routing traces.</p>
						</div>
					{:else}
						<div class="border border-[#3f3e37] bg-[#23221c] p-4 space-y-3 font-mono text-[0.68rem]">
							<div class="grid grid-cols-1 md:grid-cols-3 gap-2 border-b border-[#3f3e37] pb-3">
								<div class="border border-[#3f3e37] bg-[#1c1b18] px-3 py-2 space-y-1">
									<div class="text-[#a39f90] font-bold uppercase tracking-wider">TRACE_MODE</div>
									<div class={`font-bold uppercase ${modeColor(mode)}`}>{mode || 'unset'}</div>
								</div>
								<div class="border border-[#3f3e37] bg-[#1c1b18] px-3 py-2 space-y-1">
									<div class="text-[#a39f90] font-bold uppercase tracking-wider">FALLBACK_SOURCE</div>
									<div class={lexicalFallback ? 'text-[#c8a635] font-bold' : 'text-[#efede4] font-bold'}>{traceSourceLabel()}</div>
								</div>
								<div class="border border-[#3f3e37] bg-[#1c1b18] px-3 py-2 space-y-1">
									<div class="text-[#a39f90] font-bold uppercase tracking-wider">SOURCE_REFS</div>
									<div class="text-[#efede4] font-bold">{sourceRefs.length}</div>
								</div>
							</div>
							<div class="flex items-center justify-between border-b border-[#3f3e37] pb-1.5 font-bold">
								<span>STAGE_PROCESS_ROUTING_TRACE</span>
								<span class="text-[#8c9f7a]">{latencyMs}ms TOTAL</span>
							</div>

							<div class="space-y-2">
								{#each trace as step, i (step.stage + '-' + i)}
									<div class="flex items-center gap-3 border border-[#3f3e37] p-2 bg-[#1c1b18]/60 relative group hover:border-[#d1cdb8]/60 transition-all">
										<span class="text-[#a39f90] w-6 text-right font-bold">[{i + 1}]</span>
										<span class="text-[#efede4] w-28 shrink-0 font-bold uppercase tracking-wider">{step.stage}</span>

										<!-- Latency visualization bar -->
										<div class="flex-1 h-2 bg-[#3f3e37] rounded-none overflow-hidden relative">
											<div class="h-full bg-[#d1cdb8]" style={`width:${Math.round(step.durationMs / traceMaxMs(trace) * 100)}%`}></div>
										</div>

										<span class="text-[#efede4] w-14 text-right font-bold border-l border-[#3f3e37] pl-2">{step.durationMs}ms</span>
										<span class="text-[#a39f90] truncate max-w-40 font-bold">[ {step.detail} ]</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- ── Cache Tab ────────────────────────────────────────────────────── -->
			{#if activeTab === 'cache'}
				<div class="flex-1 overflow-y-auto p-4 space-y-4">
					{#if cacheLoading}
						<div class="text-center py-16 text-[#c8a635] animate-pulse">
							<div class="text-2xl font-bold uppercase mb-1">PROBING_REDIS_PIPELINE…</div>
							<p class="text-xs">Retrieving active memory keys from cache.</p>
						</div>
					{:else if !cacheView}
						<div class="text-center py-16 text-[#c25953] border border-[#c25953]/25 bg-[#c25953]/5 p-8">
							<div class="text-2xl font-bold uppercase mb-1">CACHE_UNAVAILABLE</div>
							<p class="text-xs">Redis server is currently off-grid or unreachable.</p>
						</div>
					{:else}
						<div class="flex items-center justify-between border-b border-[#3f3e37] pb-2 gap-3">
							<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[0.68rem] uppercase tracking-wider">
								<span class="px-2 py-1 border border-[#3f3e37] bg-[#1c1b18] text-[#d1cdb8]">Cartridges {cacheView.cartridgeCount}</span>
								<span class="px-2 py-1 border border-[#3f3e37] bg-[#1c1b18] text-[#d1cdb8]">Features {cacheView.featureCardCount}</span>
								<span class="px-2 py-1 border border-[#3f3e37] bg-[#1c1b18] text-[#d1cdb8]">Topo {cacheView.topoCacheCount}</span>
								<span class="px-2 py-1 border border-[#3f3e37] bg-[#1c1b18] text-[#d1cdb8]">Karpathy {cacheView.karpathyScoreCount}</span>
							</div>
							<button onclick={loadCache} class="px-2.5 py-1 border border-[#5c594c] bg-[#1c1b18] hover:bg-[#d1cdb8] hover:text-[#1c1b18] text-xs font-bold transition-all">
								REFRESH_CACHE
							</button>
						</div>

						<div class="space-y-2">
							<p class="text-xs font-bold text-[#d1cdb8] uppercase tracking-wider border-b border-[#3f3e37] pb-1">
								// Top Scored Files
							</p>
							{#if cacheView.topScoredFiles.length}
								<div class="space-y-1 max-h-60 overflow-y-auto pr-1">
									{#each cacheView.topScoredFiles as entry, i (entry.path)}
										<div class="border border-[#3f3e37] bg-[#23221c]/60 px-3 py-2 font-mono text-[0.68rem] flex items-center gap-3 hover:border-[#d1cdb8]/60 transition-all">
											<span class="text-[#c25953] shrink-0 font-bold w-8 text-right">#{i + 1}</span>
											<span class="text-[#efede4] truncate flex-1 font-bold">{entry.path}</span>
											<span class="text-[#a39f90] shrink-0 font-bold">blend {entry.blend.toFixed(3)}</span>
										</div>
									{/each}
								</div>
							{:else}
								<div class="text-center py-10 text-[#a39f90] border border-[#3f3e37] bg-[#1c1b18]">
									No scored files are cached yet.
								</div>
							{/if}
						</div>

						<div class="flex gap-2 pt-2 border-t border-[#3f3e37]">
							{#each ['ace:cartridge:*', 'ace:feature:*', 'ace:topo:*'] as key (key)}
								<button
									class="px-2.5 py-1 border border-[#c25953]/40 bg-[#c25953]/10 hover:bg-[#c25953]/25 text-[#c25953] text-[0.68rem] font-bold uppercase tracking-wider transition-all"
									onclick={() => flushCache(key)}
								>
									flush {key.split(':')[1]}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- ── TurboVec Tab ──────────────────────────────────────────────────── -->
			{#if activeTab === 'turbovec'}
				<div class="flex-1 overflow-y-auto p-4 space-y-4">
					<div class="flex items-center justify-between border-b border-[#3f3e37] pb-2 gap-3">
						<div class="text-xs font-bold text-[#d1cdb8] uppercase tracking-wider">// TurboVec ANN Sidecar :8099</div>
						<button onclick={loadTurboVec} disabled={tvLoading} class="px-2.5 py-1 border border-[#5c594c] bg-[#1c1b18] hover:bg-[#d1cdb8] hover:text-[#1c1b18] text-xs font-bold transition-all disabled:opacity-40">
							{tvLoading ? 'PROBING…' : 'REFRESH_HEALTH'}
						</button>
					</div>
					{#if tvHealth}
						<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[0.68rem]">
							<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2">
								<div class="text-[#a39f90] font-bold uppercase">STATUS</div>
								<div class={`mt-1 font-bold ${tvHealth.ok ? 'text-[#8c9f7a]' : 'text-[#c25953]'}`}>{tvHealth.ok ? 'ONLINE' : 'DEGRADED'}</div>
							</div>
							<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2">
								<div class="text-[#a39f90] font-bold uppercase">INDEXED</div>
								<div class="mt-1 font-bold text-[#efede4]">{tvHealth.indexed.toLocaleString()}</div>
							</div>
							<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2">
								<div class="text-[#a39f90] font-bold uppercase">DIM / BITS</div>
								<div class="mt-1 font-bold text-[#efede4]">{tvHealth.dim}d / {tvHealth.bits}b</div>
							</div>
							<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2">
								<div class="text-[#a39f90] font-bold uppercase">BACKEND</div>
								<div class="mt-1 font-bold text-[#d1cdb8] uppercase">{tvHealth.backend}</div>
							</div>
						</div>
					{:else if !tvLoading}
						<div class="text-center py-6 text-[#c25953] border border-[#c25953]/25 bg-[#c25953]/5 p-4">
							<div class="font-bold uppercase">SIDECAR_OFFLINE</div>
							<p class="text-xs mt-1">TurboVec not reachable at localhost:8099</p>
						</div>
					{/if}
					<div class="space-y-2 pt-2 border-t border-[#3f3e37]">
						<p class="text-xs font-bold text-[#d1cdb8] uppercase tracking-wider">// Cluster Prefilter Probe</p>
						<div class="flex gap-2">
							<input
								type="text"
								bind:value={tvQuery}
								placeholder="Enter query to prefilter clusters…"
								onkeydown={(e) => { if (e.key === 'Enter') runTvPrefilter(); }}
								class="flex-1 bg-[#1c1b18] border border-[#3f3e37] px-3 py-2 text-[#d1cdb8] placeholder-[#5c594c] text-xs font-mono focus:outline-none focus:border-[#d1cdb8] transition-all"
							/>
							<button onclick={runTvPrefilter} disabled={tvResultLoading || !tvQuery.trim()} class="px-3 py-2 bg-[#d1cdb8] hover:bg-[#efede4] text-[#1c1b18] text-xs font-bold transition-all disabled:opacity-40">
								{tvResultLoading ? 'SCANNING…' : 'PREFILTER'}
							</button>
						</div>
					</div>
					{#if tvResult}
						<div class="space-y-3 border border-[#3f3e37] bg-[#23221c]/60 p-4">
							<div class="flex items-center justify-between text-[0.68rem]">
								<span class="font-bold text-[#d1cdb8] uppercase">Cluster IDs</span>
								<span class="text-[#a39f90] uppercase font-bold border border-[#3f3e37] px-2 py-0.5">backend: {tvResult.backend}</span>
							</div>
							<div class="flex flex-wrap gap-2">
								{#each tvResult.clusterIds as cid (cid)}
									<span class="px-3 py-1 border border-[#8c9f7a]/50 bg-[#8c9f7a]/10 text-[#8c9f7a] font-bold text-xs font-mono">GPU:{cid}</span>
								{/each}
							</div>
							{#if Object.keys(tvResult.centroidScores).length > 0}
								<div class="space-y-1">
									<p class="text-[0.65rem] font-bold text-[#a39f90] uppercase tracking-wider">Centroid Scores</p>
									<div class="space-y-1 max-h-40 overflow-y-auto pr-1">
										{#each Object.entries(tvResult.centroidScores).sort(([, a], [, b]) => b - a) as [cid, score] (cid)}
											<div class="flex items-center gap-3 text-[0.68rem]">
												<span class="text-[#a39f90] font-bold w-12 shrink-0">GPU:{cid}</span>
												<div class="flex-1 h-1.5 bg-[#3f3e37]">
													<div class="h-full bg-[#8c9f7a]" style={`width:${Math.round(score * 100)}%`}></div>
												</div>
												<span class="text-[#efede4] font-bold w-14 text-right">{score.toFixed(4)}</span>
											</div>
										{/each}
									</div>
								</div>
							{/if}
							<div class="space-y-1">
								<p class="text-[0.65rem] font-bold text-[#a39f90] uppercase tracking-wider">Qdrant Filter (injected into must[])</p>
								<pre class="text-[0.65rem] bg-[#1c1b18] border border-[#3f3e37] p-3 overflow-x-auto text-[#d1cdb8] whitespace-pre-wrap">{JSON.stringify(tvResult.qdrantFilter, null, 2)}</pre>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- ── CouchDB Writer Tab ──────────────────────────────────────────────── -->
			{#if activeTab === 'couchdb'}
				<div class="flex-1 overflow-y-auto p-4 space-y-4">
					<div class="flex items-center justify-between border-b border-[#3f3e37] pb-2 gap-3">
						<div class="text-xs font-bold text-[#d1cdb8] uppercase tracking-wider">// CouchDB Atlas Writer — karpathy_wiki</div>
						<button onclick={loadCouchDb} disabled={couchDbLoading} class="px-2.5 py-1 border border-[#5c594c] bg-[#1c1b18] hover:bg-[#d1cdb8] hover:text-[#1c1b18] text-xs font-bold transition-all disabled:opacity-40">
							{couchDbLoading ? 'PROBING…' : 'REFRESH_STATUS'}
						</button>
					</div>
					{#if couchDbStatus}
						<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[0.68rem]">
							<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2">
								<div class="text-[#a39f90] font-bold uppercase">STATUS</div>
								<div class={`mt-1 font-bold ${couchDbStatus.ok ? 'text-[#8c9f7a]' : 'text-[#c25953]'}`}>{couchDbStatus.ok ? 'ONLINE' : 'DEGRADED'}</div>
							</div>
							<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2">
								<div class="text-[#a39f90] font-bold uppercase">DOC_COUNT</div>
								<div class="mt-1 font-bold text-[#efede4]">{couchDbStatus.docCount.toLocaleString()}</div>
							</div>
							<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2">
								<div class="text-[#a39f90] font-bold uppercase">MANGO_INDEXES</div>
								<div class="mt-1 font-bold text-[#efede4]">{couchDbStatus.indexes.length}</div>
							</div>
						</div>
						{#if couchDbStatus.indexes.length > 0}
							<div class="space-y-1">
								<p class="text-[0.65rem] font-bold text-[#a39f90] uppercase tracking-wider border-b border-[#3f3e37] pb-1">Mango Indexes</p>
								<div class="flex flex-wrap gap-1.5 pt-1">
									{#each couchDbStatus.indexes as idx (idx)}
										<span class="px-2 py-0.5 border border-[#3f3e37] bg-[#1c1b18] text-[#a39f90] text-[0.65rem] font-mono">{idx}</span>
									{/each}
								</div>
							</div>
						{/if}
						{#if couchDbStatus.lastRunId}
							<div class="border border-[#3f3e37] bg-[#23221c] px-3 py-2 text-[0.68rem]">
								<span class="text-[#a39f90] font-bold uppercase">LAST_RUN_ID:</span>
								<span class="ml-2 text-[#efede4] font-mono">{couchDbStatus.lastRunId}</span>
							</div>
						{/if}
					{:else if !couchDbLoading}
						<div class="text-center py-6 text-[#c25953] border border-[#c25953]/25 bg-[#c25953]/5 p-4">
							<div class="font-bold uppercase">COUCHDB_OFFLINE</div>
							<p class="text-xs mt-1">karpathy_wiki not reachable</p>
						</div>
					{/if}
					<!-- Rollback panel -->
					<div class="space-y-2 pt-2 border-t border-[#3f3e37]">
						<p class="text-xs font-bold text-[#c25953] uppercase tracking-wider">// Rollback by runId — DESTRUCTIVE</p>
						<p class="text-[0.65rem] text-[#a39f90]">Deletes all karpathy_wiki docs stamped with the given runId. Requires explicit runId — no wildcard.</p>
						<div class="flex gap-2">
							<input
								type="text"
								bind:value={rollbackRunId}
								placeholder="run-2026-05-18-abc123…"
								class="flex-1 bg-[#1c1b18] border border-[#c25953]/40 px-3 py-2 text-[#d1cdb8] placeholder-[#5c594c] text-xs font-mono focus:outline-none focus:border-[#c25953] transition-all"
							/>
							<button
								onclick={doRollback}
								disabled={rollbackLoading || !rollbackRunId.trim()}
								class="px-3 py-2 border border-[#c25953]/60 bg-[#c25953]/10 hover:bg-[#c25953]/25 text-[#c25953] text-xs font-bold transition-all disabled:opacity-40"
							>
								{rollbackLoading ? 'DELETING…' : 'ROLLBACK'}
							</button>
						</div>
						{#if rollbackResult}
							<div class={`border px-3 py-2 text-[0.68rem] font-bold ${rollbackResult.failed > 0 ? 'border-[#c8a635] text-[#c8a635]' : 'border-[#8c9f7a] text-[#8c9f7a]'}`}>
								deleted: {rollbackResult.deleted} · failed: {rollbackResult.failed}
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- ── Cluster Search Tab ────────────────────────────────────────────────── -->
			{#if activeTab === 'search'}
				<div class="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-[#d1cdb8]">

					<!-- Query row -->
					<div class="flex gap-2 items-start">
						<input
							bind:value={searchQuery}
							onkeydown={(e) => e.key === 'Enter' && runClusterSearch()}
							placeholder="search codebase clusters…"
							class="flex-1 bg-[#1c1b18] border border-[#5c594c] text-[#efede4] px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#8b9dbb] placeholder:text-[#5c594c]"
						/>
						<label class="flex items-center gap-1.5 text-[0.65rem] text-[#a39f90] cursor-pointer select-none">
							<input type="checkbox" bind:checked={searchMultiQuery} class="accent-[#8b9dbb]" />
							MULTI_QUERY
						</label>
						<button
							onclick={runClusterSearch}
							disabled={searchLoading || !searchQuery.trim()}
							class="px-3 py-1.5 border border-[#5c594c] bg-[#1c1b18] hover:bg-[#d1cdb8] hover:text-[#1c1b18] text-xs font-bold transition-all disabled:opacity-40"
						>
							{searchLoading ? 'SEARCHING…' : '[SEARCH]'}
						</button>
					</div>

					<!-- Tag filter -->
					<div class="space-y-1">
						<div class="text-[#a39f90] text-[0.6rem] font-bold">CLUSTER TAGS</div>
						<div class="flex gap-1.5 flex-wrap items-center">
							{#each searchTags as tag}
								<span class="inline-flex items-center gap-1 px-2 py-0.5 text-[0.6rem] border border-[#8b9dbb] text-[#8b9dbb] font-bold">
									{tag}
									<button onclick={() => { searchTags = searchTags.filter(t => t !== tag); }} class="hover:text-[#c25953]">×</button>
								</span>
							{/each}
							<input
								bind:value={searchTagInput}
								onkeydown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSearchTag(); } }}
								placeholder="add tag…"
								class="bg-transparent border-b border-[#5c594c] text-[#efede4] px-1 py-0.5 text-[0.65rem] font-mono focus:outline-none focus:border-[#8b9dbb] w-28 placeholder:text-[#5c594c]"
							/>
						</div>
					</div>

					<!-- Meta row -->
					{#if searchMeta}
						<div class="text-[0.6rem] text-[#a39f90] flex gap-4">
							<span>HITS: <span class="text-[#efede4] font-bold">{searchMeta.totalHits}</span></span>
							<span>QUERIES_USED: <span class="text-[#efede4] font-bold">{searchMeta.queriesUsed}</span></span>
						</div>
					{/if}

					<!-- Results -->
					{#if searchResults.length > 0}
						<div class="space-y-2">
							{#each searchResults as hit}
								<div class="border border-[#3f3e37] bg-[#1c1b18] p-3 space-y-1.5">
									<div class="flex items-center justify-between gap-2">
										<span class="text-[#8b9dbb] text-xs font-bold truncate">{hit.filePath || hit.id}</span>
										<span class="text-[#8c9f7a] text-[0.6rem] font-bold shrink-0">
											{hit.score.toFixed(4)}
										</span>
									</div>
									<div class="flex flex-wrap gap-1">
										{#if hit.cluster != null}
											<span class="px-1.5 py-0.5 text-[0.55rem] border border-[#c8a635] text-[#c8a635] font-bold">GPU:{hit.cluster}</span>
										{/if}
										{#if hit.somCluster != null}
											<span class="px-1.5 py-0.5 text-[0.55rem] border border-[#6b7f8b] text-[#6b7f8b]">SOM:{hit.somCluster}</span>
										{/if}
										{#each (hit.tags as string[]).slice(0, 5) as tag}
											<span class="px-1.5 py-0.5 text-[0.55rem] border border-[#3f3e37] text-[#a39f90]">{tag}</span>
										{/each}
									</div>
									{#if hit.snippet}
										<div class="text-[#a39f90] text-[0.65rem] leading-relaxed border-l-2 border-[#3f3e37] pl-2 line-clamp-2">
											{hit.snippet}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{:else if !searchLoading && searchMeta}
						<div class="text-[#a39f90] text-xs">NO_RESULTS</div>
					{/if}

					<!-- CouchDB cluster synthesis -->
					<div class="border-t border-[#3f3e37] pt-4 space-y-2">
						<div class="text-[#a39f90] text-[0.6rem] font-bold">COUCHDB_MAPREDUCE_SYNTHESIS</div>
						<p class="text-[0.6rem] text-[#5c594c]">Bootstrap `_design/cluster_synthesis` view and synthesize Gemma3 summaries per cluster into karpathy_wiki.</p>
						<div class="flex gap-2">
							<button
								onclick={() => runCouchSynthesize(true)}
								disabled={synthesizeLoading}
								class="px-2.5 py-1 border border-[#5c594c] bg-[#1c1b18] text-[#a39f90] hover:text-[#efede4] text-xs font-bold transition-all disabled:opacity-40"
							>
								{synthesizeLoading ? '…' : '[DRY_RUN]'}
							</button>
							<button
								onclick={() => runCouchSynthesize(false)}
								disabled={synthesizeLoading}
								class="px-2.5 py-1 border border-[#c8a635] bg-[#1c1b18] text-[#c8a635] hover:bg-[#c8a635] hover:text-[#1c1b18] text-xs font-bold transition-all disabled:opacity-40"
							>
								{synthesizeLoading ? 'RUNNING…' : '[SYNTHESIZE_10_CLUSTERS]'}
							</button>
						</div>
						{#if synthesizeResult}
							<div class="text-[0.65rem] text-[#8c9f7a]">
								OK — {synthesizeResult.clustersProcessed} clusters processed in {synthesizeResult.durationMs}ms
							</div>
						{/if}
					</div>

				</div>
			{/if}

			<!-- ── HyperRAG Pipeline Results ───────────────────────────────────────── -->
			{#if activeTab === 'hyperrag'}
				<div class="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-[#d1cdb8]">
					{#if hyperRunning}
						<div class="text-center py-12 text-[#8b9dbb]">
							<div class="text-2xl font-bold uppercase mb-2 animate-pulse">⬡ HYPERRAG_EXEC…</div>
							<p class="text-xs">Phases B→C→D→E running. Synthesis may take ~30s.</p>
							<p class="text-xs mt-2 text-[#a39f90]">{(hyperElapsedMs / 1000).toFixed(1)}s elapsed · auto-abort at 60s</p>
							{#if hyperElapsedMs >= 30000}
								<p class="text-xs mt-1 text-[#c8a635]">Taking longer than expected — server may be busy.</p>
							{/if}
							<button
								onclick={cancelHyperRAG}
								class="mt-4 px-4 py-1.5 border border-[#c25953]/60 bg-[#c25953]/10 hover:bg-[#c25953]/20 text-[#c25953] text-xs font-bold tracking-wider transition-all"
							>[CANCEL]</button>
						</div>
					{:else if hyperError}
						<div class="p-4 border border-[#c25953] bg-[#c25953]/10 text-[#c25953] text-xs">
							<span class="font-bold">PIPELINE_ERROR:</span> {hyperError}
						</div>
					{:else if !hyperResult}
						<div class="text-center py-16 text-[#4a5568] border border-[#3f3e37]">
							<div class="text-4xl mb-3">⬡</div>
							<div class="text-sm font-bold uppercase tracking-widest">HYPERRAG_STANDBY</div>
							<p class="text-xs text-[#a39f90] mt-2">Enter a query and click ⬡ RUN_HYPERRAG_PIPELINE or click this tab.</p>
						</div>
					{:else}
						<!-- Pipeline summary bar -->
						<div class="flex items-center gap-3 text-[0.68rem] border border-[#4a5568] bg-[#1c2030] px-3 py-2 flex-wrap">
							<span class="text-[#8b9dbb] font-bold">⬡ HYPERRAG</span>
							<span class="text-[#a39f90]">query: <span class="text-[#efede4]">"{hyperResult.query}"</span></span>
							<span class="text-[#a39f90]">hits: <span class="text-[#efede4]">{hyperResult.resultCount}</span></span>
							<span class="text-[#a39f90]">B: <span class="text-[#efede4]">{hyperResult.latencyMs}ms</span></span>
							{#if hyperResult.phaseC}
								<span class="text-[#a39f90]">C: <span class="text-[#8c9f7a]">{hyperResult.phaseC.hitsEnriched} wiki</span></span>
							{/if}
							{#if hyperResult.phaseD}
								<span class="text-[#a39f90]">D: <span class="text-[#efede4]">{hyperResult.phaseD.cudaBackend} · {hyperResult.phaseD.centroidCount}k · {hyperResult.phaseD.inferLatencyMs}ms</span></span>
							{/if}
							{#if hyperResult.phaseE}
								<span class="text-[#a39f90]">E: <span class="text-[#8c9f7a]">log ✓</span></span>
							{/if}
						</div>

				{#if hyperResult.phaseLatency}
					<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[0.68rem] border border-[#4a5568] bg-[#1c2030]/70 p-3 mt-2">
						<div>
							<div class="text-[#a39f90] uppercase tracking-wider text-[0.65rem] font-bold">Embed</div>
							<div class="text-[#efede4] font-bold">{hyperResult.phaseLatency.embed}ms</div>
						</div>
						<div>
							<div class="text-[#a39f90] uppercase tracking-wider text-[0.65rem] font-bold">Cluster</div>
							<div class="text-[#efede4] font-bold">{hyperResult.phaseLatency.cluster}ms</div>
						</div>
						<div>
							<div class="text-[#a39f90] uppercase tracking-wider text-[0.65rem] font-bold">Qdrant</div>
							<div class="text-[#efede4] font-bold">{hyperResult.phaseLatency.qdrant}ms</div>
						</div>
						<div>
							<div class="text-[#a39f90] uppercase tracking-wider text-[0.65rem] font-bold">CouchDB</div>
							<div class="text-[#efede4] font-bold">{hyperResult.phaseLatency.couchdb}ms</div>
						</div>
					</div>
				{/if}
				{#if hyperResult.phaseD || hyperResult.results.length > 0}
					<div class="grid grid-cols-3 gap-2 text-[0.68rem] border border-[#4a5568] bg-[#1c2030]/70 p-3">
						<div>
							<div class="text-[#a39f90] uppercase tracking-wider text-[0.65rem] font-bold">RotorQuant</div>
							<div class="text-[#efede4] font-bold">{hyperResult.phaseD?.inferLatencyMs ?? 0}ms</div>
						</div>
						<div>
							<div class="text-[#a39f90] uppercase tracking-wider text-[0.65rem] font-bold">Top Blend</div>
							<div class="text-[#8c9f7a] font-bold">{hyperResult.results[0]?.karpathyBlend?.toFixed(3) ?? '—'}</div>
						</div>
						<div>
							<div class="text-[#a39f90] uppercase tracking-wider text-[0.65rem] font-bold">Src Refs</div>
							<div class="text-[#efede4] font-bold">{hyperResult.results.filter((h) => h.source_ref).length}</div>
						</div>
					</div>
				{/if}
				{#if hyperResult.phaseD?.synthesis}
						<div class="border border-[#4a5568] bg-[#1c2030]/60 p-4 space-y-2">
								<p class="text-[0.62rem] text-[#8b9dbb] font-bold uppercase tracking-wider">// RotorQuant Synthesis</p>
								<div class="text-[0.75rem] text-[#efede4] leading-relaxed whitespace-pre-wrap">{hyperResult.phaseD.synthesis}</div>
							</div>
				{:else if hyperResult.phaseD?.inferError}
							<div class="border border-[#c25953]/40 bg-[#c25953]/5 p-3 text-[0.68rem] text-[#c25953]">
								Inference error: {hyperResult.phaseD.inferError}
							</div>
						{:else if !hyperNoInfer}
							<div class="border border-[#3f3e37] p-3 text-[0.68rem] text-[#a39f90] text-center">No synthesis — Phase D did not run.</div>
						{/if}

						<!-- Ranked hits -->
						<div class="space-y-1">
							<p class="text-[0.62rem] text-[#a39f90] font-bold uppercase tracking-wider border-b border-[#3f3e37] pb-1">
								// Ranked Results ({hyperResult.results.length})
							</p>
							{#each hyperResult.results as hit (hit.rank)}
								<div class="border border-[#3f3e37] bg-[#23221c]/60 px-3 py-2 text-[0.68rem] hover:border-[#4a5568] transition-all">
									<div class="flex items-center gap-3">
										<span class="text-[#4a5568] font-bold w-6 shrink-0">#{hit.rank}</span>
										<span class="text-[#efede4] truncate flex-1 font-bold">{hit.source_ref ?? hit.id}</span>
										<span class="text-[#8b9dbb] shrink-0">rrf {hit.rrfScore?.toFixed(4)}</span>
										{#if hit.karpathyBlend != null}
											<span class="text-[#8c9f7a] shrink-0">blend {hit.karpathyBlend.toFixed(3)}</span>
										{/if}
										{#if (hit.wikiEnrichment?.length ?? 0) > 0}
											<span class="text-[#c8a635] shrink-0 text-[0.6rem] font-bold">WIKI</span>
										{/if}
									</div>
									{#if hit.text}
										<p class="text-[#a39f90] mt-1 ml-9 leading-relaxed line-clamp-2">{hit.text}</p>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

		</main>
	</div>

	<!-- ── Dynamic Parameter Tuning Dialog (Bits UI v2) ──────────────────────── -->
	<Bits.Dialog.Root bind:open={openTuningDialog}>
		<Bits.Dialog.Portal>
			<Bits.Dialog.Overlay forceMount>
				{#snippet child({ props, open: isOpen })}
					{#if isOpen}
						<div {...props} class="fixed inset-0 bg-black/75 backdrop-blur-sm z-45" onclick={() => openTuningDialog = false}></div>
					{/if}
				{/snippet}
			</Bits.Dialog.Overlay>
			<Bits.Dialog.Content forceMount>
				{#snippet child({ props, open: isOpen })}
					{#if isOpen}
						<div {...props} class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[#23221c] border border-[#5c594c] p-6 shadow-2xl font-mono text-[#d1cdb8] flex flex-col gap-4 focus:outline-none">

							<!-- Dialog Title -->
							<Bits.Dialog.Title class="text-sm font-bold border-b border-[#5c594c] pb-2 uppercase tracking-widest text-[#efede4] yorha-bracket-l yorha-bracket-r">
								ATLAS_RETRIEVAL_WEIGHT_TUNING
							</Bits.Dialog.Title>

							<!-- Dialog Description -->
							<Bits.Dialog.Description class="text-[0.68rem] text-[#a39f90] leading-relaxed">
								Configure dynamic similarity weights computed in the Stage A3 Karpathy blend. Tuning parameters forces live re-evaluations and bypasses exact-match cartridge caching.
							</Bits.Dialog.Description>

							<hr class="border-[#3f3e37] my-1" />

							<!-- Tuning Parameters Panel -->
							<div class="space-y-4">

								<!-- Cosine Slider -->
								<div class="space-y-1.5">
									<div class="flex justify-between text-xs font-bold">
										<span class="text-[#a39f90]">COSINE_WEIGHT:</span>
										<span class="text-[#efede4]">{blendCosine.toFixed(2)}</span>
									</div>
									<input
										type="range" min="0" max="1" step="0.05"
										bind:value={blendCosine}
										class="w-full accent-[#d1cdb8] bg-[#1c1b18] border border-[#3f3e37] h-2 rounded-none cursor-pointer"
									/>
								</div>

								<!-- PageRank Slider -->
								<div class="space-y-1.5">
									<div class="flex justify-between text-xs font-bold">
										<span class="text-[#a39f90]">PAGERANK_WEIGHT:</span>
										<span class="text-[#efede4]">{blendPageRank.toFixed(2)}</span>
									</div>
									<input
										type="range" min="0" max="1" step="0.05"
										bind:value={blendPageRank}
										class="w-full accent-[#d1cdb8] bg-[#1c1b18] border border-[#3f3e37] h-2 rounded-none cursor-pointer"
									/>
								</div>

								<!-- Topology Slider -->
								<div class="space-y-1.5">
									<div class="flex justify-between text-xs font-bold">
										<span class="text-[#a39f90]">TOPOLOGY_WEIGHT:</span>
										<span class="text-[#efede4]">{blendTopology.toFixed(2)}</span>
									</div>
									<input
										type="range" min="0" max="1" step="0.05"
										bind:value={blendTopology}
										class="w-full accent-[#d1cdb8] bg-[#1c1b18] border border-[#3f3e37] h-2 rounded-none cursor-pointer"
									/>
								</div>

							</div>

							<hr class="border-[#3f3e37] my-1" />

							<!-- Action buttons -->
							<div class="flex gap-3">
								<button
									onclick={resetParameters}
									class="flex-1 py-1.5 border border-[#5c594c] bg-[#1c1b18] text-[#a39f90] hover:text-[#efede4] hover:border-[#d1cdb8] text-xs font-bold transition-all"
								>
									[RESET_DEFAULTS]
								</button>
								<button
									onclick={() => openTuningDialog = false}
									class="flex-1 py-1.5 bg-[#d1cdb8] hover:bg-[#efede4] text-[#1c1b18] text-xs font-bold transition-all"
								>
									[CONFIRM_TUNING]
								</button>
							</div>

							<Bits.Dialog.Close class="absolute right-4 top-4 border border-transparent hover:border-[#5c594c] p-1 transition-all bg-transparent">
								<span class="text-xs text-[#a39f90] hover:text-[#efede4] font-bold">[X]</span>
							</Bits.Dialog.Close>

						</div>
					{/if}
				{/snippet}
			</Bits.Dialog.Content>
		</Bits.Dialog.Portal>
	</Bits.Dialog.Root>

</div>

<style>
	:global(:root) {
		--yorha-bg: #1c1b18;
		--yorha-panel: #23221c;
		--yorha-border: #3f3e37;
		--yorha-text: #d1cdb8;
		--yorha-accent: #a39f90;
	}

	.yorha-container {
		background-color: var(--yorha-bg);
		color: var(--yorha-text);
	}

	/* Scanlines */
	.yorha-scanlines {
		background: linear-gradient(
			rgba(28, 27, 24, 0) 50%,
			rgba(0, 0, 0, 0.15) 50%
		);
		background-size: 100% 4px;
	}

	/* Brackets decoration */
	.yorha-bracket-l::before {
		content: '[';
		font-family: monospace;
		color: var(--yorha-accent);
		margin-right: 0.4rem;
		font-weight: bold;
	}

	.yorha-bracket-r::after {
		content: ']';
		font-family: monospace;
		color: var(--yorha-accent);
		margin-left: 0.4rem;
		font-weight: bold;
	}

	/* Blink effect for warning states */
	@keyframes yorha-blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}
	.blink {
		animation: yorha-blink 1.5s infinite;
	}
</style>
