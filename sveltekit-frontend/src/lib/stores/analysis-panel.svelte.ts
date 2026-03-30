/**
 * Analysis Panel Store — Svelte 5 Runes
 *
 * Global state for the app-wide analysis slide-out panel.
 * Consumes existing /api/codebase-index/* + /api/gpu/* endpoints.
 * Tracks performance metrics (SIMD vs V8 parsing, GPU vs CPU compute).
 */

interface CodebaseStats {
	totalFiles: number;
	indexedFiles: number;
	totalErrors: number;
	errorClusters: number;
	topErrorCodes: { code: string; count: number }[];
	surfaceBreakdown: Record<string, number>;
	lastIndexed: string | null;
	_perf?: PerfMeta;
}

interface ErrorCluster {
	id: string;
	summary: string;
	member_count: number;
	top_codes?: string[];
	top_files?: string[];
}

interface AiAnalysis {
	summary?: string;
	risks?: string[];
	dependencies?: { import: string; role: string }[];
	suggestions?: string[];
	couplingScore?: number;
	complexityScore?: number;
	healthGrade?: string;
}

interface RelatedFile {
	filePath: string;
	score: number;
	symbol: string;
	kind: string;
	content: string;
	language: string;
}

interface GpuStatus {
	available: boolean;
	queueLength: number;
	lastCheckMs: number;
}

interface GpuDeviceInfo {
	cudaAvailable: boolean;
	device: string;
	capabilities: string[];
}

interface GpuComputeResult {
	operation: string;
	source: 'gpu' | 'cpu';
	latencyMs: number;
	n?: number;
	k?: number;
	dimension?: number;
}

interface PerfMeta {
	totalMs: number;
	parser?: string;
	simdAvailable?: boolean;
}

interface ActivityLogEntry {
	timestamp: number;
	action: string;
	detail: string;
	durationMs?: number;
	parser?: string;
	source?: 'gpu' | 'cpu' | string;
}

interface PageComponents {
	page: string[];
	pageServer: string[];
	pageLoad: string[];
	layouts: string[];
	layoutServers: string[];
	components: string[];
	stores: string[];
	apiEndpoints: string[];
}

interface RuntimeError {
	id: string;
	kind: string;
	severity: string;
	message: string;
	stack: string | null;
	file: string | null;
	lineNumber: number | null;
	clusterId: string | null;
	collectedAt: string;
}

interface NetworkFailure {
	path: string;
	statusCode: number;
	count: number;
	lastSeen: string;
}

interface PageCluster {
	id: string;
	pattern: string;
	severity: string;
	errorCount: number;
	lastUpdated: string;
}

interface PlaywrightSnapshot {
	timestamp: string;
	status: number;
	ok: boolean;
	consoleErrors: string[];
	consoleWarnings: string[];
	failedRequests: string[];
	loadTimeMs: number;
	domElements: number;
}

// ── Diagnosis Result (typed to match /api/error-brain/diagnose output) ──

interface DiagnosisEvidenceItem {
	kind: 'runtime-error' | 'network-failure' | 'graph-edge' | 'similar-fix' | 'semantic-match';
	source: string;
	snippet: string;
	score?: number;
}

interface DiagnosisFixStep {
	step: number;
	action: string;
	file: string;
	code?: string;
}

interface DiagnosisSuggestedTest {
	type: 'playwright' | 'unit' | 'integration';
	target: string;
}

interface DiagnosisImpactedFile {
	path: string;
	reason: string;
	confidence: number;
}

interface DiagnosisSimilarError {
	message: string;
	resolution: string;
}

interface DiagnosisSources {
	astSubgraph: { nodeCount: number; edgeCount: number };
	semanticMatches: number;
	errorHistoryMatches: number;
	graphNeighborMatches: number;
	runtimeEvidenceMatches: number;
}

interface DiagnosisRankedFile {
	filePath: string;
	finalScore: number;
	signals: Record<string, number>;
	source: string;
}

interface DiagnosisPerf {
	totalMs: number;
	cached?: boolean;
	stages?: Record<string, number>;
}

export interface DiagnosisResult {
	diagnosisId?: string;
	diagnosis: string;
	probableRootCauseType: string;
	likelyFiles: string[];
	impactedFiles: DiagnosisImpactedFile[];
	fixPlan: DiagnosisFixStep[];
	similarPastErrors: DiagnosisSimilarError[];
	suggestedTests: DiagnosisSuggestedTest[];
	riskLevel: 'low' | 'medium' | 'high';
	needsHumanReview: boolean;
	unsafeToAutoPatch: boolean;
	evidence: DiagnosisEvidenceItem[];
	mode?: string;
	sources?: DiagnosisSources;
	rankedFiles?: DiagnosisRankedFile[];
	_perf?: DiagnosisPerf;
	timing?: Record<string, number>;
	cached?: boolean;
	error?: string;
}

type TabId = 'context' | 'errors' | 'gpu' | 'recs';

const CACHE_TTL_MS = 60_000;
const MAX_LOG_ENTRIES = 50;

class AnalysisPanelStore {
	// ── Panel UI ──
	isOpen = $state(false);
	activeTab = $state<TabId>('context');

	// ── Route awareness ──
	currentRoute = $state('');
	currentCaseId = $state<string | null>(null);

	// ── Cached data ──
	codebaseStats = $state<CodebaseStats | null>(null);
	errorClusters = $state<ErrorCluster[]>([]);
	relatedFiles = $state<RelatedFile[]>([]);
	analysisResult = $state<AiAnalysis | null>(null);
	analysisFilePath = $state('');
	gpuStatus = $state<GpuStatus>({ available: false, queueLength: 0, lastCheckMs: 0 });
	gpuDeviceInfo = $state<GpuDeviceInfo | null>(null);
	gpuComputeResult = $state<GpuComputeResult | null>(null);
	aceRecommendations = $state<string | null>(null);

	// ── Page context (Phase 2) ──
	pageComponents = $state<PageComponents | null>(null);
	runtimeErrors = $state<RuntimeError[]>([]);
	networkFailures = $state<NetworkFailure[]>([]);
	pageClusters = $state<PageCluster[]>([]);
	playwrightSnapshot = $state<PlaywrightSnapshot | null>(null);
	pageContextLoading = $state(false);
	pageContextError = $state('');
	private lastPageContextFetch = 0;
	private pageContextRoute = '';

	// ── Page diagnosis ──
	lastDiagnosis = $state<DiagnosisResult | null>(null);
	diagnosisLoading = $state(false);
	diagnosisError = $state('');

	pageErrorCount = $derived(this.runtimeErrors.length + this.networkFailures.length);

	// ── Performance metrics ──
	lastPerfMeta = $state<PerfMeta | null>(null);
	activityLog = $state<ActivityLogEntry[]>([]);

	// ── Loading states ──
	statsLoading = $state(false);
	clustersLoading = $state(false);
	analysisLoading = $state(false);
	relatedLoading = $state(false);
	gpuLoading = $state(false);
	gpuComputeLoading = $state(false);
	recsLoading = $state(false);
	reindexing = $state(false);

	// ── Errors ──
	statsError = $state('');
	clustersError = $state('');
	analysisError = $state('');
	relatedError = $state('');
	gpuError = $state('');
	recsError = $state('');

	// ── Cache timestamps ──
	private lastStatsFetch = 0;
	private lastClustersFetch = 0;
	private lastGpuCheck = 0;

	// ── Derived ──
	hasActiveWork = $derived(
		this.statsLoading || this.analysisLoading || this.relatedLoading || this.reindexing || this.gpuComputeLoading,
	);

	contextLabel = $derived.by(() => {
		const r = this.currentRoute;
		if (r.includes('/cases/')) return 'Case Analysis';
		if (r.includes('/evidence')) return 'Evidence Pipeline';
		if (r.includes('/codebase-graph') || r.includes('/codebase')) return 'Codebase Graph';
		if (r.includes('/terminal') || r.includes('/ai-dashboard')) return 'AI Systems';
		if (r.includes('/simulation')) return 'Courtroom Sim';
		if (r.includes('/persons-of-interest')) return 'Persons of Interest';
		if (r.includes('/admin')) return 'Administration';
		if (r.includes('/dashboard')) return 'Dashboard';
		return 'Platform Analysis';
	});

	// ── Activity logging ──

	private log(action: string, detail: string, durationMs?: number, parser?: string, source?: string) {
		this.activityLog = [
			{ timestamp: Date.now(), action, detail, durationMs, parser, source },
			...this.activityLog.slice(0, MAX_LOG_ENTRIES - 1),
		];
	}

	// ── Panel actions ──

	toggle() {
		this.isOpen = !this.isOpen;
	}

	open(tab?: TabId) {
		this.isOpen = true;
		if (tab) this.activeTab = tab;
	}

	close() {
		this.isOpen = false;
	}

	setRoute(route: string, caseId?: string) {
		this.currentRoute = route;
		const caseMatch = route.match(/\/cases\/([0-9a-f-]{36})/i);
		this.currentCaseId = caseId ?? caseMatch?.[1] ?? null;
		// Auto-fetch page context when panel is open and route changes
		if (this.isOpen && route !== this.pageContextRoute) {
			this.fetchPageContext();
		}
	}

	// ── API methods ──

	async fetchStats() {
		if (this.statsLoading) return;
		if (Date.now() - this.lastStatsFetch < CACHE_TTL_MS && this.codebaseStats) return;
		this.statsLoading = true;
		this.statsError = '';
		const t0 = performance.now();
		try {
			const res = await fetch('/api/codebase-index/stats');
			const data = await res.json();
			const clientMs = Math.round(performance.now() - t0);
			console.group(`[AnalysisPanel] fetchStats — ${clientMs}ms`);
			console.log('status:', res.status);
			console.log('response:', data);
			if (data._perf) console.log('perf:', data._perf);
			console.groupEnd();
			if (res.ok) {
				this.codebaseStats = data;
				this.lastStatsFetch = Date.now();
				this.lastPerfMeta = data._perf ?? { totalMs: clientMs };
				this.log('fetchStats', `${data.totalErrors} errors, ${data.errorClusters} clusters`, data._perf?.totalMs ?? clientMs, data._perf?.parser);
			} else {
				this.statsError = data.error ?? `HTTP ${res.status}`;
				this.log('fetchStats', `ERROR: ${this.statsError}`, clientMs);
			}
		} catch {
			this.statsError = 'Failed to fetch stats';
			this.log('fetchStats', 'ERROR: network failure', Math.round(performance.now() - t0));
		} finally {
			this.statsLoading = false;
		}
	}

	async fetchClusters() {
		if (this.clustersLoading) return;
		if (Date.now() - this.lastClustersFetch < CACHE_TTL_MS && this.errorClusters.length > 0) return;
		this.clustersLoading = true;
		this.clustersError = '';
		const t0 = performance.now();
		try {
			const res = await fetch('/api/codebase-index/clusters?limit=8');
			const data = await res.json();
			const ms = Math.round(performance.now() - t0);
			console.group(`[AnalysisPanel] fetchClusters — ${ms}ms`);
			console.log('status:', res.status);
			console.log('response:', data);
			console.groupEnd();
			if (res.ok) {
				this.errorClusters = data.clusters ?? [];
				this.lastClustersFetch = Date.now();
				this.log('fetchClusters', `${this.errorClusters.length} clusters loaded`, ms);
			} else {
				this.clustersError = data.error ?? `HTTP ${res.status}`;
				this.log('fetchClusters', `ERROR: ${this.clustersError}`, ms);
			}
		} catch {
			this.clustersError = 'Failed to fetch clusters';
			this.log('fetchClusters', 'ERROR: network failure', Math.round(performance.now() - t0));
		} finally {
			this.clustersLoading = false;
		}
	}

	async analyzeFile(filePath: string) {
		if (this.analysisLoading || !filePath.trim()) return;
		this.analysisLoading = true;
		this.analysisError = '';
		this.analysisResult = null;
		this.analysisFilePath = filePath;
		this.relatedFiles = [];
		const t0 = performance.now();
		try {
			const res = await fetch('/api/codebase-index/analyze', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filePath }),
			});
			const data = await res.json();
			const ms = Math.round(performance.now() - t0);
			console.group(`[AnalysisPanel] analyzeFile (${filePath}) — ${ms}ms`);
			console.log('status:', res.status);
			console.log('response:', data);
			if (data._perf) console.log('perf:', data._perf);
			console.groupEnd();
			if (!res.ok && !data.analysis) {
				this.analysisError = data.error ?? `HTTP ${res.status}`;
				this.log('analyzeFile', `ERROR: ${this.analysisError} (${filePath})`, ms);
				return;
			}
			this.analysisResult = data.analysis;
			this.lastPerfMeta = data._perf ?? { totalMs: ms };
			if (!res.ok) this.analysisError = data.error ?? '';
			this.log('analyzeFile', `${filePath} → ${data.analysis?.healthGrade ?? '?'}`, data._perf?.totalMs ?? ms, data._perf?.parser);
		} catch {
			this.analysisError = 'Network error — is the dev server running?';
			this.log('analyzeFile', 'ERROR: network failure', Math.round(performance.now() - t0));
		} finally {
			this.analysisLoading = false;
		}
	}

	async findRelated(filePath: string) {
		if (this.relatedLoading || !filePath.trim()) return;
		this.relatedLoading = true;
		this.relatedError = '';
		this.relatedFiles = [];
		const t0 = performance.now();
		try {
			const res = await fetch('/api/codebase-index/related', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filePath, limit: 6 }),
			});
			const data = await res.json();
			const ms = Math.round(performance.now() - t0);
			if (res.ok) {
				this.relatedFiles = data.related ?? [];
				this.log('findRelated', `${this.relatedFiles.length} similar files (${data.timing?.searchType ?? 'unknown'})`, data.timing?.totalMs ?? ms);
			} else {
				this.relatedError = data.error ?? `HTTP ${res.status}`;
				this.log('findRelated', `ERROR: ${this.relatedError}`, ms);
			}
		} catch {
			this.relatedError = 'Qdrant search unavailable';
			this.log('findRelated', 'ERROR: network failure', Math.round(performance.now() - t0));
		} finally {
			this.relatedLoading = false;
		}
	}

	async checkGpu() {
		if (this.gpuLoading) return;
		if (Date.now() - this.lastGpuCheck < CACHE_TTL_MS) return;
		this.gpuLoading = true;
		this.gpuError = '';
		const t0 = performance.now();
		try {
			// Fetch device info via compute endpoint
			const [queueRes, deviceRes] = await Promise.allSettled([
				fetch('/api/gpu/queue'),
				fetch('/api/gpu/compute', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ operation: 'device_info' }),
				}),
			]);
			const ms = Math.round(performance.now() - t0);
			console.group(`[AnalysisPanel] checkGpu — ${ms}ms`);
			console.log('queue:', queueRes.status === 'fulfilled' ? queueRes.value.status : 'rejected');
			console.log('device:', deviceRes.status === 'fulfilled' ? deviceRes.value.status : 'rejected');
			console.groupEnd();

			if (queueRes.status === 'fulfilled' && queueRes.value.ok) {
				const data = await queueRes.value.json();
				this.gpuStatus = {
					available: data.cudaAvailable ?? false,
					queueLength: data.queueDepth ?? data.queueLength ?? 0,
					lastCheckMs: Date.now(),
				};
			} else {
				this.gpuStatus = { available: false, queueLength: 0, lastCheckMs: Date.now() };
			}

			if (deviceRes.status === 'fulfilled' && deviceRes.value.ok) {
				this.gpuDeviceInfo = await deviceRes.value.json();
			}

			this.lastGpuCheck = Date.now();
			this.log('checkGpu', `CUDA: ${this.gpuStatus.available ? 'YES' : 'NO'}, queue: ${this.gpuStatus.queueLength}`, ms, undefined, this.gpuStatus.available ? 'gpu' : 'cpu');
		} catch {
			this.gpuError = 'GPU service unreachable';
			this.gpuStatus = { available: false, queueLength: 0, lastCheckMs: Date.now() };
			this.log('checkGpu', 'ERROR: unreachable', Math.round(performance.now() - t0));
		} finally {
			this.gpuLoading = false;
		}
	}

	async runGpuCompute(operation: 'similarity' | 'cluster', embeddings: number[][], k?: number) {
		if (this.gpuComputeLoading) return;
		this.gpuComputeLoading = true;
		this.gpuComputeResult = null;
		const t0 = performance.now();
		try {
			const body: Record<string, unknown> = { operation, embeddings };
			if (k) body.k = k;
			const res = await fetch('/api/gpu/compute', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			const data = await res.json();
			const ms = Math.round(performance.now() - t0);
			console.group(`[AnalysisPanel] gpuCompute (${operation}) — ${ms}ms`);
			console.log('status:', res.status);
			console.log('response:', data);
			console.groupEnd();
			if (res.ok) {
				this.gpuComputeResult = {
					operation,
					source: data.source ?? (this.gpuStatus.available ? 'gpu' : 'cpu'),
					latencyMs: data.latencyMs ?? ms,
					n: data.n ?? embeddings.length,
					k: data.k,
					dimension: embeddings[0]?.length,
				};
				this.log('gpuCompute', `${operation} (${embeddings.length} vectors) → ${data.source ?? 'done'}`, data.latencyMs ?? ms, undefined, data.source);
			} else {
				this.log('gpuCompute', `ERROR: ${data.error ?? res.status}`, ms);
			}
		} catch {
			this.log('gpuCompute', 'ERROR: compute failed', Math.round(performance.now() - t0));
		} finally {
			this.gpuComputeLoading = false;
		}
	}

	async triggerReindex() {
		if (this.reindexing) return;
		this.reindexing = true;
		const t0 = performance.now();
		try {
			await fetch('/api/codebase-index/reindex', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ runClustering: true }),
			});
			this.lastStatsFetch = 0;
			this.lastClustersFetch = 0;
			this.log('reindex', 'Reindex + clustering triggered', Math.round(performance.now() - t0));
		} catch {
			this.log('reindex', 'ERROR: reindex failed', Math.round(performance.now() - t0));
		} finally {
			this.reindexing = false;
		}
	}

	async fetchPageContext() {
		const route = this.currentRoute;
		if (this.pageContextLoading || !route) return;
		if (Date.now() - this.lastPageContextFetch < CACHE_TTL_MS && route === this.pageContextRoute) return;

		this.pageContextLoading = true;
		this.pageContextError = '';
		const t0 = performance.now();
		try {
			const res = await fetch('/api/analysis/page-context', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ route, includePlaywright: true }),
			});
			const data = await res.json();
			const ms = Math.round(performance.now() - t0);
			console.group(`[AnalysisPanel] fetchPageContext (${route}) — ${ms}ms`);
			console.log('status:', res.status);
			console.log('response:', data);
			if (data.timing) console.table(data.timing);
			console.groupEnd();
			if (res.ok) {
				this.pageComponents = data.components ?? null;
				this.runtimeErrors = data.runtimeErrors ?? [];
				this.networkFailures = data.networkFailures ?? [];
				this.pageClusters = data.clusters ?? [];
				this.playwrightSnapshot = data.playwrightSnapshot ?? null;
				this.lastPageContextFetch = Date.now();
				this.pageContextRoute = route;
				const totalFiles = data.totalFiles ?? 0;
				this.log('fetchPageContext', `${totalFiles} files, ${this.runtimeErrors.length} errors`, data.timing?.totalMs ?? ms);
			} else {
				this.pageContextError = data.error ?? `HTTP ${res.status}`;
				this.log('fetchPageContext', `ERROR: ${this.pageContextError}`, ms);
			}
		} catch {
			this.pageContextError = 'Failed to fetch page context';
			this.log('fetchPageContext', 'ERROR: network failure', Math.round(performance.now() - t0));
		} finally {
			this.pageContextLoading = false;
		}
	}

	/**
	 * One-click page diagnosis: auto-fetches page context (if stale), then runs
	 * the error-brain diagnose pipeline with full runtime evidence + page context.
	 */
	async diagnosePage(mode: 'page' | 'route' = 'page') {
		if (this.diagnosisLoading || !this.currentRoute) return;

		this.diagnosisLoading = true;
		this.diagnosisError = '';
		this.lastDiagnosis = null;
		const t0 = performance.now();

		try {
			// 1. Ensure page context is loaded (auto-fetch if stale)
			if (!this.pageComponents || this.pageContextRoute !== this.currentRoute) {
				await this.fetchPageContext();
			}

			// 2. Build query from top runtime errors
			const topErrors = this.runtimeErrors.slice(0, 5);
			const query = topErrors.length > 0
				? topErrors.map(e => e.message).join('; ')
				: `Analyze page health for route ${this.currentRoute}`;

			// 3. Build enriched console errors (message + stack + source + level)
			const consoleErrors = topErrors.map(e => ({
				message: e.message,
				source: e.file ?? undefined,
				stack: e.stack ?? undefined,
				level: (e.severity === 'critical' || e.severity === 'error' ? 'error'
					: e.severity === 'warn' ? 'warn' : 'info') as 'error' | 'warn' | 'info',
			}));

			// 4. Build enriched network failures (url + method + status)
			const networkFailures = this.networkFailures.slice(0, 10).map(nf => ({
				url: nf.path,
				method: 'GET' as const,
				status: nf.statusCode,
			}));

			// 5. Build page context bundle for diagnose endpoint
			const pageContext: Record<string, unknown> = {};
			if (this.pageComponents) {
				pageContext.components = this.pageComponents;
			}
			if (this.playwrightSnapshot) {
				pageContext.playwrightSnapshot = this.playwrightSnapshot;
			}
			pageContext.runtimeErrorCount = this.runtimeErrors.length;
			pageContext.networkFailureCount = this.networkFailures.length;

			// 6. Call diagnose endpoint with full context
			const res = await fetch('/api/error-brain/diagnose', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query,
					filePath: this.pageComponents?.page?.[0] ?? '',
					routePath: this.currentRoute,
					componentPath: this.pageComponents?.components?.[0] ?? '',
					consoleErrors: consoleErrors.length > 0 ? consoleErrors : undefined,
					networkFailures: networkFailures.length > 0 ? networkFailures : undefined,
					pageContext,
					mode,
					limit: 10,
				}),
			});

			const data = await res.json();
			const ms = Math.round(performance.now() - t0);

			// Console logging for verification
			console.group(`[AnalysisPanel] diagnosePage (${mode}) — ${ms}ms`);
			console.log('route:', this.currentRoute);
			console.log('page components:', this.pageComponents?.page);
			console.log('console errors sent:', consoleErrors.length);
			console.log('network failures sent:', networkFailures.length);
			console.log('status:', res.status);
			console.log('response:', data);
			if (data._perf) console.log('_perf:', data._perf);
			if (data.sources) console.log('sources:', data.sources);
			if (data.evidence) console.log('evidence:', data.evidence);
			if (data.suggestedTests) console.log('suggestedTests:', data.suggestedTests);
			console.groupEnd();

			if (res.ok && data.diagnosis) {
				this.lastDiagnosis = data as DiagnosisResult;
				this.log('diagnosePage', `${mode} — ${data.probableRootCauseType ?? 'unknown'} (${data.riskLevel ?? '?'})`, ms);
			} else {
				this.diagnosisError = data.error ?? `HTTP ${res.status}`;
				this.log('diagnosePage', `ERROR: ${this.diagnosisError}`, ms);
			}
		} catch {
			this.diagnosisError = 'Diagnosis failed — server unreachable';
			this.log('diagnosePage', 'ERROR: network failure', Math.round(performance.now() - t0));
		} finally {
			this.diagnosisLoading = false;
		}
	}

	invalidateCaches() {
		this.lastStatsFetch = 0;
		this.lastClustersFetch = 0;
		this.lastGpuCheck = 0;
		this.lastPageContextFetch = 0;
		this.pageContextRoute = '';
	}

	clearLog() {
		this.activityLog = [];
	}
}

export const analysisPanel = new AnalysisPanelStore();
