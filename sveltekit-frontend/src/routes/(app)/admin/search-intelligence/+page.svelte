<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import FeedbackButtons from '$lib/components/ui/FeedbackButtons.svelte';
	import ResearchSummariesBrowser from '$lib/components/analytics/ResearchSummariesBrowser.svelte';
	import LiveResearchPanel from '$lib/components/analytics/LiveResearchPanel.svelte';
	import GlyphAtlasViewer from '$lib/components/graph/GlyphAtlasViewer.svelte';
	import { contextualChat } from '$lib/stores/contextual-chat.svelte.js';

	// ── Types ─────────────────────────────────────────────────────────────────

	type HotQuery    = { query: string; hits: number; hash: string };
	type VPair       = { query_a: string; query_b: string; similarity: number; hit_count: number };
	type ClusterHeat = { gpu_cluster: number; total_hits: number; unique_queries: number; avg_rerank: number | null };
	type ChunkQ      = { chunk_id: string; relative_path: string | null; hit_count: number; avg_rerank: number | null; unique_queries: number; pipelines: string[]; quality_score: number };
	type PipelineMem = { pipeline: string; total_hits: number; unique_chunks: number; unique_queries: number; avg_rerank: number | null; top_chunk_path: string | null };
	type Champion    = { chunk_id: string; relative_path: string | null; pipeline_count: number; pipelines: string; total_hits: number; avg_rerank: number | null; quality_score: number };
	type Trending    = { query_hash: string; query: string | null; recent_hits: number; prior_hits: number; growth_rate: number };
	type DYM         = { suggestion: string; similarity: number; hitCount: number; source: 'redis' | 'pg' | 'qlora'; qualityTier?: string };
	type QloraStat   = { quality_tier: string; cnt: number; avg_score: number };
	type PromptLeaderEntry = { prompt: string; promptSource: string; section: string; clicks: number; rank: number };
	type IdxEvent = { event: string; data: Record<string, unknown> };
	type IdxFinalCounts = {
		files: number | null;
		chunks: number | null;
		embeddings: number | null;
		stored: number | null;
		summaryClusters: number | null;
		tagged: number | null;
		processed: number | null;
	};
	type IdxPgMirror = {
		table: string;
		healthy: boolean;
		exists: boolean | null;
		missingColumns: string[];
		error: string | null;
	};

	type IntentExample = { label: string; query: string };
	const INTENT_EXAMPLES: IntentExample[] = [
		{ label: 'evidence_upload', query: 'upload the pdf evidence and hash it' },
		{ label: 'schema_drift', query: 'schema drift in the column types' },
		{ label: 'graph_search', query: 'expand the neighborhood of this node in the graph' },
		{ label: 'gpu_rerank', query: 'rerank these by the attention score' },
		{ label: 'ui_bug', query: 'the button click is broken in the modal' },
		{ label: 'legal_research', query: 'search case law for hearsay precedent' },
	];

	// ── State ─────────────────────────────────────────────────────────────────

	let days        = $state(7);
	let temperature = $state(0.5);
	let qFilter     = $state('');
	let suggestFor  = $state('');
	let loading     = $state(false);
	let error       = $state<string | null>(null);
	let autoRefresh = $state(false);
	let activeSection = $state<'queries' | 'pipeline' | 'chunks' | 'training' | 'research' | 'summaries' | 'live' | 'assist' | 'tags' | 'graph' | 'index'>('queries');

	// ── Codebase Index Orchestrator state ─────────────────────────────────────
	let idxRunning   = $state(false);
	let idxEvents    = $state<IdxEvent[]>([]);
	let idxError     = $state<string | null>(null);
	let idxStatus    = $state<Record<string, unknown> | null>(null);
	let idxStatusLoading = $state(false);
	let idxRunId     = $state<string | null>(null);
	let idxResume    = $state(false);

	type IdxPreset = 'sync' | 'quick' | 'full' | 'topology' | 'custom';
	type IdxPresetConfig = {
		scope: 'lib' | 'all';
		clusterCount: number;
		gpuTag: boolean;
		summarize: boolean;
		somTopology: boolean;
		neo4jSync: boolean;
		pageRank: boolean;
		exportWiki: boolean;
		hypergraph: boolean;
		indexFileLimit?: number;
		recompute?: boolean;
	};
	let idxPreset    = $state<IdxPreset>('sync');
	let intentDraft  = $state('');
	let intentBusy   = $derived(contextualChat.isThinking);

	const IDX_PRESETS: Record<IdxPreset, IdxPresetConfig> = {
		sync: { scope: 'all', clusterCount: 20, gpuTag: true, summarize: true, somTopology: false, neo4jSync: false, pageRank: false, exportWiki: false, hypergraph: false },
		quick: { scope: 'lib', clusterCount: 12, gpuTag: true, summarize: false, somTopology: false, neo4jSync: false, pageRank: false, exportWiki: false, hypergraph: false, indexFileLimit: 50 },
		full: { scope: 'all', clusterCount: 20, gpuTag: true, summarize: true, somTopology: true, neo4jSync: true, pageRank: true, exportWiki: true, hypergraph: true },
		topology: { scope: 'all', clusterCount: 20, gpuTag: false, summarize: false, recompute: true, somTopology: true, neo4jSync: true, pageRank: true, exportWiki: false, hypergraph: false },
		custom: { scope: 'all', clusterCount: 20, gpuTag: false, summarize: false, somTopology: false, neo4jSync: false, pageRank: false, exportWiki: false, hypergraph: false },
	};
	const IDX_PRESET_LABELS: Record<IdxPreset, string> = {
		sync: 'sync core',
		quick: 'quick (lib)',
		full: 'full graph',
		topology: 'topology',
		custom: 'custom',
	};
	let idxPresetConfig = $derived(IDX_PRESETS[idxPreset]);

	function idxNumber(value: unknown): number | null {
		return typeof value === 'number' ? value : null;
	}

	function idxRecord(value: unknown): Record<string, unknown> | null {
		return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
	}

	let idxFinalCounts = $derived.by<IdxFinalCounts>(() => {
		const scanDone = idxEvents.find((event) => event.event === 'scan_done');
		const chunkDone = idxEvents.find((event) => event.event === 'chunk_done');
		const embedDone = idxEvents.find((event) => event.event === 'embed_done');
		const summaryDone = idxEvents.find((event) => event.event === 'summary_done');
		const tagDone = idxEvents.find((event) => event.event === 'tag_done');
		const tagDetails = idxRecord(tagDone?.data?.details);

		return {
			files: idxNumber(scanDone?.data?.filesProcessed),
			chunks: idxNumber(chunkDone?.data?.chunksProcessed),
			embeddings: idxNumber(embedDone?.data?.embeddingsGenerated),
			stored: idxNumber(embedDone?.data?.storedInQdrant),
			summaryClusters: idxNumber(summaryDone?.data?.count),
			tagged: idxNumber(tagDetails?.totalTagged),
			processed: idxNumber(tagDetails?.totalProcessed),
		};
	});
	let idxPgMirror = $derived.by<IdxPgMirror>(() => {
		const status = idxRecord(idxStatus);
		const mirror = idxRecord(status?.pgMirror);

		return {
			table: typeof mirror?.table === 'string' ? mirror.table : 'codebase_chunk_index',
			healthy: mirror?.healthy === true,
			exists: typeof mirror?.exists === 'boolean' ? mirror.exists : null,
			missingColumns: Array.isArray(mirror?.missingColumns)
				? mirror.missingColumns.filter((value): value is string => typeof value === 'string')
				: [],
			error: typeof mirror?.error === 'string' ? mirror.error : null,
		};
	});
	let idxStartTime = $state<number | null>(null);
	let idxElapsed = $state<string>('');

	$effect(() => {
		if (!idxRunning) { idxStartTime = null; return; }
		if (!idxStartTime) idxStartTime = Date.now();
		const interval = setInterval(() => {
			const s = Math.round((Date.now() - (idxStartTime ?? Date.now())) / 1000);
			idxElapsed = s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
		}, 500);
		return () => clearInterval(interval);
	});

	async function loadIdxStatus() {
		idxStatusLoading = true;
		try {
			const res = await fetch('/api/codebase-index/orchestrate', { signal: AbortSignal.timeout(15_000) });
			if (res.ok) idxStatus = await res.json();
		} catch { /* ignore */ }
		idxStatusLoading = false;
	}

	async function runIdxPipeline() {
		idxRunning = true;
		idxEvents = [];
		idxError = null;
		const body = {
			...IDX_PRESETS[idxPreset],
			...(idxRunId && idxResume ? { runId: idxRunId, resume: true } : {}),
		};

		try {
			const res = await fetch('/api/codebase-index/orchestrate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(120_000)
			});
			if (!res.ok) {
				idxError = `HTTP ${res.status}: ${await res.text().catch(() => '')}`;
				idxRunning = false;
				return;
			}
			const reader = res.body?.getReader();
			if (!reader) { idxError = 'No response body'; idxRunning = false; return; }

			const decoder = new TextDecoder();
			let buffer = '';
			while (true) {
				const { done, value } = await reader.read();
				buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
				let boundary = buffer.indexOf('\n\n');
				while (boundary !== -1) {
					const chunk = buffer.slice(0, boundary).trim();
					buffer = buffer.slice(boundary + 2);
					if (chunk) {
						let event = 'message';
						const dataLines: string[] = [];
						for (const line of chunk.split(/\r?\n/)) {
							if (line.startsWith('event:')) event = line.slice(6).trim();
							if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
						}
						let data: Record<string, unknown> = {};
						try { data = JSON.parse(dataLines.join('\n')); } catch { data = { raw: dataLines.join('\n') }; }
						idxEvents = [...idxEvents, { event, data }];
						if (event === 'started' && data.runId) { idxRunId = String(data.runId); idxResume = false; }
						if (event === 'failed') idxError = String(data.message ?? 'Pipeline failed');
					}
					boundary = buffer.indexOf('\n\n');
				}
				if (done) break;
			}
		} catch (e) {
			idxError = (e as Error).message;
		}
		idxRunning = false;
		void loadIdxStatus();
	}

	// Distillation runner state
	let distillRunning  = $state(false);
	let distillResult   = $state<{
		candidates: number;
		inserted?:  number;
		skipped?:   number;
		dryRun?:    boolean;
		queued?:    boolean;
		background?: boolean;
	} | null>(null);

	// ── Predictive Todos (generate-todos post-graph pipeline) ────────────────
	type PredictiveTodo = {
		id: string;
		todo_type: string;
		gpu_cluster: number | null;
		reason: string;
		suggested_action: string;
		estimated_impact: string;
		status: string;
		generated_at: string;
	};
	let todosLoading  = $state(false);
	let todosRunning  = $state(false);
	let todosError    = $state<string | null>(null);
	let todosDays     = $state(7);
	let todosResult   = $state<PredictiveTodo[]>([]);
	let todosJobId    = $state<string | null>(null);

	async function loadTodos() {
		todosLoading = true;
		try {
			const r = await fetch('/api/analytics/generate-todos', { signal: AbortSignal.timeout(30_000) });
			if (r.ok) { const d = await r.json() as { todos: PredictiveTodo[] }; todosResult = d.todos ?? []; }
		} catch { /* ignore */ }
		finally { todosLoading = false; }
	}

	async function runGenerateTodos(dryRun: boolean) {
		todosRunning = true;
		todosError   = null;
		try {
			const r = await fetch('/api/analytics/generate-todos', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ days: todosDays, dryRun }),
				signal: AbortSignal.timeout(120_000)
			});
			const d = await r.json() as { jobId?: string; error?: string };
			if (!r.ok) { todosError = d.error ?? 'Failed'; return; }
			todosJobId = d.jobId ?? null;
			// Poll for completion
			if (todosJobId) {
				let attempts = 0;
				const poll = setInterval(async () => {
					attempts++;
					const pr = await fetch(`/api/analytics/generate-todos?jobId=${todosJobId}`, { signal: AbortSignal.timeout(15_000) });
					const pd = await pr.json() as { status: string; inserted?: number; error?: string };
					if (pd.status === 'done' || pd.status === 'error' || attempts > 30) {
						clearInterval(poll);
						todosRunning = false;
						if (pd.status === 'error') todosError = pd.error ?? 'Analysis failed';
						else loadTodos();
					}
				}, 2000);
			} else {
				todosRunning = false;
			}
		} catch (e) {
			todosError = String((e as { message?: string })?.message ?? e);
			todosRunning = false;
		}
	}

	async function dismissTodo(id: string) {
		await fetch(`/api/analytics/generate-todos`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, status: 'dismissed' }),
			signal: AbortSignal.timeout(15_000)
		}).catch(() => {});
		todosResult = todosResult.filter(t => t.id !== id);
	}

	// ── Karpathy tag backfill state ──────────────────────────────────────────
	let tagBackfillRunning  = $state(false);
	let tagBackfillDryRun   = $state(false);
	let tagBackfillBatch    = $state(0);
	let tagBackfillTotal    = $state(0);
	let tagBackfillTagged   = $state(0);
	let tagBackfillSkipped  = $state(0);
	let tagBackfillElapsed  = $state(0);
	let tagBackfillDist     = $state<Record<string, number>>({});
	let tagBackfillDone     = $state(false);
	let tagBackfillError    = $state<string | null>(null);
	let tagBackfillAbort    = $state<AbortController | null>(null);

	// Tag status (loaded on tab switch)
	let tagStatusLoading = $state(false);
	let tagStatus = $state<{ tagged: number; total: number; pct: number; semanticTagDist: Record<string, number> } | null>(null);

	async function loadTagStatus() {
		tagStatusLoading = true;
		try {
			const res = await fetch('/api/codebase-index/karpathy-tag', { signal: AbortSignal.timeout(15_000) });
			if (res.ok) tagStatus = await res.json();
		} catch { /* ignore */ }
		finally { tagStatusLoading = false; }
	}

	async function startTagBackfill() {
		if (tagBackfillRunning) return;
		tagBackfillRunning = true;
		tagBackfillBatch   = 0;
		tagBackfillTotal   = 0;
		tagBackfillTagged  = 0;
		tagBackfillSkipped = 0;
		tagBackfillElapsed = 0;
		tagBackfillDist    = {};
		tagBackfillDone    = false;
		tagBackfillError   = null;

		const ctrl = new AbortController();
		tagBackfillAbort = ctrl;

		try {
			const params = new URLSearchParams({ batchSize: '20' });
			if (tagBackfillDryRun) params.set('dryRun', 'true');

			const res = await fetch(`/api/codebase-index/karpathy-tag/backfill?${params}`, {
				signal: ctrl.signal,
			});
			if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

			const reader = res.body.getReader();
			const dec    = new TextDecoder();
			let buf = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buf += dec.decode(value, { stream: true });

				let idx;
				while ((idx = buf.indexOf('\n\n')) !== -1) {
					const block = buf.slice(0, idx).trim();
					buf = buf.slice(idx + 2);
					if (!block) continue;

					const eventMatch = block.match(/^event:\s*(.+)$/m);
					const dataMatch  = block.match(/^data:\s*(.+)$/m);
					if (!eventMatch || !dataMatch) continue;

					const evt = eventMatch[1];
					let d: Record<string, unknown>;
					try { d = JSON.parse(dataMatch[1]); } catch { continue; }

					if (evt === 'batch') {
						tagBackfillBatch   = (d.batch as number) ?? 0;
						tagBackfillTotal   = (d.totalProcessed as number) ?? 0;
						tagBackfillTagged  = (d.totalTagged as number) ?? 0;
						tagBackfillSkipped = (d.totalSkipped as number) ?? 0;
						tagBackfillElapsed = (d.elapsed as number) ?? 0;
						tagBackfillDist    = (d.tagDist as Record<string, number>) ?? {};
					} else if (evt === 'done') {
						tagBackfillDone    = true;
						tagBackfillTotal   = (d.totalProcessed as number) ?? tagBackfillTotal;
						tagBackfillTagged  = (d.totalTagged as number) ?? tagBackfillTagged;
						tagBackfillElapsed = (d.elapsed as number) ?? tagBackfillElapsed;
						tagBackfillDist    = (d.tagDist as Record<string, number>) ?? tagBackfillDist;
					} else if (evt === 'error') {
						tagBackfillError = (d.message as string) ?? 'Unknown error';
					}
				}
			}
		} catch (err) {
			if ((err as Error).name !== 'AbortError') {
				tagBackfillError = (err as Error).message;
			}
		} finally {
			tagBackfillRunning = false;
			tagBackfillAbort   = null;
			void loadTagStatus();
		}
	}

	function cancelTagBackfill() {
		tagBackfillAbort?.abort();
		tagBackfillRunning = false;
	}

	// ── Claude-Assist debug panel state ────────────────────────────────────
	let assistDebugQuery    = $state('');
	let assistDebugLoading  = $state(false);
	let assistDebugResult   = $state<Record<string, unknown> | null>(null);
	let assistDebugError    = $state<string | null>(null);

	async function runAssistDebug() {
		if (!assistDebugQuery.trim() || assistDebugLoading) return;
		assistDebugLoading = true;
		assistDebugResult  = null;
		assistDebugError   = null;
		feedbackSent       = false;
		try {
			const res = await fetch('/api/codebase-index/claude-assist', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: assistDebugQuery.trim(),
					compact: true,
					compactContext: true,
					preferCachedResearch: true,
					debug: true,
				}),
				signal: AbortSignal.timeout(120_000)
			});
			if (res.ok) {
				assistDebugResult = await res.json();
			} else {
				assistDebugError = `HTTP ${res.status}: ${await res.text().catch(() => 'failed')}`;
			}
		} catch (err) {
			assistDebugError = (err as Error).message;
		} finally {
			assistDebugLoading = false;
		}
	}

	// ── Feedback state ────────────────────────────────────────────────────
	let feedbackSent     = $state(false);
	let feedbackLoading  = $state(false);
	let feedbackStats    = $state<{ total: number; useful: number; notUseful: number; usefulPct: number; recent: any[] } | null>(null);

	async function sendFeedback(useful: boolean) {
		if (!assistDebugResult || feedbackLoading) return;
		const r = assistDebugResult as Record<string, any>;
		feedbackLoading = true;
		try {
			await fetch('/api/codebase-index/claude-assist/feedback', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					queryHash: r.cache?.key?.split(':').pop() ?? 'unknown',
					cacheSlot: r.cache?.key ?? '',
					useful,
				}),
				signal: AbortSignal.timeout(15_000)
			});
			feedbackSent = true;
		} catch { /* non-fatal */ }
		feedbackLoading = false;
	}

	async function loadFeedbackStats() {
		try {
			const res = await fetch('/api/codebase-index/claude-assist/feedback?limit=20', { signal: AbortSignal.timeout(15_000) });
			if (res.ok) feedbackStats = await res.json();
		} catch { /* non-fatal */ }
	}

	// ── Feedback analysis state ───────────────────────────────────────────
	let analysisData    = $state<Record<string, any> | null>(null);
	let analysisLoading = $state(false);
	let analysisWindow  = $state<string>('all');

	async function loadAnalysis() {
		analysisLoading = true;
		try {
			const params = new URLSearchParams({ limit: '200' });
			if (analysisWindow !== 'all') params.set('window', analysisWindow);
			const res = await fetch(`/api/codebase-index/claude-assist/feedback/analysis?${params}`, { signal: AbortSignal.timeout(30_000) });
			if (res.ok) {
				analysisData = await res.json();
				loadAppliedDefaults();
			}
		} catch { /* non-fatal */ }
		analysisLoading = false;
	}

	// ── Applied defaults state ────────────────────────────────────────────
	let appliedDefaults = $state<{ codeDefaults: Record<string, any>; applied: Record<string, any> | null; appliedAt: string | null } | null>(null);
	let defaultsLoading = $state(false);
	let applyingDefaults = $state(false);
	let applyMessage = $state<string | null>(null);

	async function loadAppliedDefaults() {
		defaultsLoading = true;
		try {
			const res = await fetch('/api/codebase-index/claude-assist/defaults', { signal: AbortSignal.timeout(15_000) });
			if (res.ok) appliedDefaults = await res.json();
		} catch { /* non-fatal */ }
		defaultsLoading = false;
	}

	async function applyDefaults(defaults: Record<string, any>) {
		applyingDefaults = true;
		applyMessage = null;
		try {
			const res = await fetch('/api/codebase-index/claude-assist/defaults', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(defaults),
				signal: AbortSignal.timeout(30_000)
			});
			if (res.ok) {
				applyMessage = 'Defaults applied successfully';
				await loadAppliedDefaults();
				await loadAnalysis();
			} else {
				const data = await res.json().catch(() => ({}));
				applyMessage = data.error ?? 'Failed to apply';
			}
		} catch {
			applyMessage = 'Network error';
		}
		applyingDefaults = false;
	}

	let revertingDefaults = $state(false);
	let revertMessage = $state<string | null>(null);

	async function revertDefaults() {
		if (!analysisData?.defaultsImpact?.previous) return;
		revertingDefaults = true;
		revertMessage = null;
		try {
			const res = await fetch('/api/codebase-index/claude-assist/defaults', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(analysisData.defaultsImpact.previous),
				signal: AbortSignal.timeout(30_000)
			});
			if (res.ok) {
				revertMessage = 'Reverted to previous defaults';
				await loadAppliedDefaults();
				await loadAnalysis();
			} else {
				const data = await res.json().catch(() => ({}));
				revertMessage = data.error ?? 'Failed to revert';
			}
		} catch {
			revertMessage = 'Network error';
		}
		revertingDefaults = false;
	}

	let distillError    = $state<string | null>(null);
	let minRerankScore  = $state(0.8);
	let distillLimit    = $state(100);

	// Prompt leaderboard state
	let promptLeader    = $state<{ entries: PromptLeaderEntry[]; total: number; sections: string[] } | null>(null);
	let leaderSection   = $state('');
	let leaderLoading   = $state(false);

	// Checkpoint validator state
	type ValidateVerdict = 'pass' | 'fail' | 'degraded';
	type ValidateResult  = { query: string; candidateScore: number; baselineScore: number; delta: number; candidateIssues: string[]; candidateMs: number };
	type ValidateReport  = { verdict: ValidateVerdict; model: string; baseline: string; avgCandidate: number; avgBaseline: number; delta: number; improvements: number; regressions: number; results: ValidateResult[]; validatedAt: string };
	let ckptModel       = $state('');
	let ckptBaseline    = $state('gemma4-legal:latest');
	let ckptRunning     = $state(false);
	let ckptReport      = $state<ValidateReport | null>(null);
	let ckptError       = $state<string | null>(null);

	// Cluster narrative state
	type ClusterNarrative = { clusterId: number; summary: string; purpose: string; patterns: string[]; keyFiles: string[]; warnings: string[]; generatedAt: string };
	let expandedCluster     = $state<number | null>(null);
	let clusterNarrative    = $state<ClusterNarrative | null>(null);
	let clusterNarrLoading  = $state(false);
	let clusterNarrError    = $state<string | null>(null);

	// ── Research topics state ─────────────────────────────────────────────────
	type ResearchTopic = {
		queryHash:       string;
		query:           string;
		pipeline:        string;
		pipelines:       string[];
		qualityTier:     string | null;
		confidence:      number;
		feedbackRatio:   number;
		feedbackUp:      number;
		feedbackDown:    number;
		entityTags:      string[];
		graphSummary:    string | null;
		selfPromptChain: string[];
	};
	type ResearchData = {
		topics:          ResearchTopic[];
		seedTopics:      string[];
		hotQueryTags:    string[];
		graphExpansions: string[];
		meta: {
			pipeline:        string;
			cacheBuiltAt:    string | null;
			totalByPipeline: Record<string, number>;
		};
	};
	let researchPipeline   = $state<'all' | 'ace' | 'rag' | 'kag' | 'dag' | 'codebase'>('all');
	let researchDomains    = $state('typescript,sveltekit,ripgrep,ollama');
	let researchLoading    = $state(false);
	let researchData       = $state<ResearchData | null>(null);
	let researchError      = $state<string | null>(null);
	let expandedTopic      = $state<string | null>(null);

	// ── Corpus search state ───────────────────────────────────────────────────
	type CorpusJob = {
		jobId: string;
		status: 'queued' | 'running' | 'completed' | 'failed' | 'timed_out' | 'cancelled';
		action: 'crawl' | 'corpus-search' | 'invalidate';
		totalSummaries?: number;
		source?: string;
		indexedAt?: string;
		error?: string;
		batches?: Array<{ summaries: CorpusResult[] }>;
	};
	let corpusQuery        = $state('');
	let corpusLoading      = $state(false);
	let corpusError        = $state<string | null>(null);
	let corpusResults      = $state<CorpusResult[]>([]);
	let corpusJob          = $state<CorpusJob | null>(null);

	// ── Research Graph RL state ───────────────────────────────────────────────
	type GraphCluster = { id: number; memberIds: string[]; pageRank: number; size: number };
	type RlPolicy = { ace: number; kag: number; dag: number; rag: number; codebase: number; updatedAt: string };
	type GraphStats = { clusters: GraphCluster[]; totalSummaries: number; builtAt: string | null };
	let graphLoading   = $state(false);
	let graphError     = $state<string | null>(null);
	let graphStats     = $state<GraphStats | null>(null);
	let rlPolicy       = $state<RlPolicy | null>(null);
	let graphBuilding  = $state(false);
	let graphBuildMsg  = $state<string | null>(null);

	// ── RL Audit Trail (context_timeline) ────────────────────────────────────
	type TimelineEvent = {
		id: string; eventType: string; pipeline: string; sessionId: string;
		signal: string | null; grpoReward: number | null; pipelineWeightAfter: number | null;
		triggeredRebuild: boolean; hyperedgeHash: string | null;
		payload: Record<string, unknown>; createdAt: string;
	};
	let tlEvents      = $state<TimelineEvent[]>([]);
	let tlLoading     = $state(false);
	let tlError       = $state<string | null>(null);
	let tlNextCursor  = $state<string | null>(null);
	let tlEventType   = $state('');
	let tlPipeline    = $state('');

	let atlasManifest = $state<any>(null);
	let atlasBase64   = $state<string | null>(null);
	let atlasLoading  = $state(false);

	let triples       = $state<any[]>([]);
	let triplesLoading = $state(false);
	let tripleFilter  = $state('');

	let filteredTriples = $derived(
		tripleFilter ? triples.filter(t => t.relation.toLowerCase().includes(tripleFilter.toLowerCase()) || t.source.label.toLowerCase().includes(tripleFilter.toLowerCase())) : triples
	);

	async function loadAtlas() {
		atlasLoading = true;
		try {
			const res = await fetch('/api/graph/glyph-atlas', { signal: AbortSignal.timeout(30_000) });
			if (res.ok) {
				const d = await res.json();
				atlasManifest = d;
			}
		} catch { /* ignore */ }
		finally { atlasLoading = false; }
	}

	async function loadTriples() {
		triplesLoading = true;
		try {
			const res = await fetch('/api/analytics/knowledge-triples?limit=100', { signal: AbortSignal.timeout(30_000) });
			if (res.ok) {
				const d = await res.json();
				triples = d.triples ?? [];
			}
		} catch { /* ignore */ }
		finally { triplesLoading = false; }
	}

	async function fetch_timeline(cursor?: string) {
		tlLoading = true;
		tlError   = null;
		try {
			const params = new URLSearchParams({ limit: '20' });
			if (cursor)       params.set('cursor',    cursor);
			if (tlEventType)  params.set('eventType', tlEventType);
			if (tlPipeline)   params.set('pipeline',  tlPipeline);
			const res = await fetch(`/api/analytics/context-timeline?${params}`, { signal: AbortSignal.timeout(30_000) });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const d = await res.json() as { events: TimelineEvent[]; nextCursor: string | null };
			if (cursor) {
				tlEvents = [...tlEvents, ...(d.events ?? [])];
			} else {
				tlEvents = d.events ?? [];
			}
			tlNextCursor = d.nextCursor ?? null;
		} catch (e) {
			tlError = e instanceof Error ? e.message : String(e);
		} finally {
			tlLoading = false;
		}
	}

	$effect(() => {
		void tlEventType; void tlPipeline;
		if (activeSection === 'graph') {
			void fetch_timeline();
			if (!atlasManifest) void loadAtlas();
			if (triples.length === 0) void loadTriples();
		}
	});

	async function fetch_graph() {
		graphLoading = true;
		graphError   = null;
		try {
			const res = await fetch('/api/analytics/research-graph', { signal: AbortSignal.timeout(30_000) });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const d = await res.json();
			graphStats = d.graph  ?? null;
			rlPolicy   = d.policy ?? null;
		} catch (e) {
			graphError = e instanceof Error ? e.message : String(e);
		} finally {
			graphLoading = false;
		}
	}

	async function rebuild_graph(action: 'build' | 'policy') {
		graphBuilding = true;
		graphBuildMsg = null;
		try {
			const res = await fetch('/api/analytics/research-graph', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ action }),
				signal: AbortSignal.timeout(120_000)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const d = await res.json();
			if (action === 'build') {
				graphBuildMsg = `Built — ${d.clusters?.length ?? 0} clusters, ${d.totalSummaries ?? 0} summaries (${d.durationMs ?? 0}ms, ${d.source ?? '?'})`;
				await fetch_graph();
			} else {
				graphBuildMsg = `Policy updated — ace:${d.weights?.ace?.toFixed(3) ?? '?'} rag:${d.weights?.rag?.toFixed(3) ?? '?'} kag:${d.weights?.kag?.toFixed(3) ?? '?'}`;
				rlPolicy = d.weights ?? null;
			}
		} catch (e) {
			graphBuildMsg = 'Error: ' + (e instanceof Error ? e.message : String(e));
		} finally {
			graphBuilding = false;
		}
	}

	// ── Hyperedges (Grade A/B from /api/graph/hypergraph) ────────────────────
	type HyperEdge = {
		hash: string; gradeLabel: string; gradeScore: number; pipeline: string;
		memberCount: number; summary: string | null; loraHint: string | null;
	};
	let hyperedgeGrade   = $state<'A' | 'B' | 'C'>('A');
	let hyperedges       = $state<HyperEdge[]>([]);
	let hyperedgeLoading = $state(false);
	let hyperedgeError   = $state<string | null>(null);

	async function fetch_hyperedges() {
		hyperedgeLoading = true;
		hyperedgeError   = null;
		try {
			const res = await fetch(`/api/graph/hypergraph?grade=${hyperedgeGrade}&limit=10`, { signal: AbortSignal.timeout(30_000) });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const d = await res.json() as { edges: HyperEdge[] };
			hyperedges = d.edges ?? [];
		} catch (e) {
			hyperedgeError = e instanceof Error ? e.message : String(e);
		} finally {
			hyperedgeLoading = false;
		}
	}

	$effect(() => {
		void hyperedgeGrade;
		if (activeSection === 'graph') void fetch_hyperedges();
	});

	// ── Agent test ────────────────────────────────────────────────────────────
	let agentQuery   = $state('');
	let agentRunning = $state(false);
	let agentResult  = $state<{ answer: string; toolsUsed: string[]; rounds: number; durationMs: number } | null>(null);
	let agentError   = $state<string | null>(null);

	async function run_agent() {
		if (!agentQuery.trim() || agentRunning) return;
		agentRunning = true;
		agentError   = null;
		agentResult  = null;
		try {
			const res = await fetch('/api/ai/agent', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ query: agentQuery, pipeline: 'ace' }),
				signal: AbortSignal.timeout(120_000)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
			agentResult = await res.json();
		} catch (e) {
			agentError = e instanceof Error ? e.message : String(e);
		} finally {
			agentRunning = false;
		}
	}

	// ── Ingest state ─────────────────────────────────────────────────────────
	let ingestStateCode    = $state('ca');
	let ingestLoading      = $state(false);
	let ingestResult       = $state<IngestResult | null>(null);
	let corpusStats        = $state<CorpusStats | null>(null);

	type CorpusResult = {
		pointId: string; collection: string; collectionLabel: string;
		query: string; summary: string; entityTags: string[];
		jurisdiction: string | null; corpusType: string | null;
		citationLabel: string | null; sectionPath: string | null;
		relevanceScore: number;
	};
	type IngestResult   = { queued?: boolean; skipped?: boolean; error?: string; stateName?: string; message?: string };
	type CorpusStats    = { byType: Record<string, { complete: number; total: number }>; constitutionCoverage: number; totalDocuments: number; totalComplete: number };

	function sleep(ms: number) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	async function poll_corpus_job(jobId: string) {
		for (let attempt = 0; attempt < 30; attempt += 1) {
			const res = await fetch(`/api/analytics/web-research?jobId=${encodeURIComponent(jobId)}`, { signal: AbortSignal.timeout(15_000) });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const d = await res.json() as { job: CorpusJob };
			if (!d.job) throw new Error('Research job not found');
			corpusJob = d.job;
			if (d.job.status === 'completed' || d.job.status === 'failed' || d.job.status === 'timed_out' || d.job.status === 'cancelled') {
				if (d.job.status !== 'completed') {
					corpusError = d.job.error ?? 'Research job did not complete';
				}
				return d.job;
			}
			await sleep(Math.min(1000 + attempt * 250, 2500));
		}
		throw new Error('Timed out waiting for corpus search');
	}

	async function run_corpus_search() {
		if (!corpusQuery.trim()) return;
		corpusLoading = true;
		corpusError   = null;
		corpusResults = [];
		corpusJob     = null;
		try {
			const res = await fetch('/api/analytics/web-research', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'corpus-search', selfPrompts: [corpusQuery.trim()], pipeline: researchPipeline, maxResults: 6, defer: true }),
				signal: AbortSignal.timeout(120_000)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const d = await res.json() as { jobId?: string; status?: string; batches?: Array<{ summaries: CorpusResult[] }> };
			if (d.jobId) {
				corpusJob = { jobId: d.jobId, status: (d.status as CorpusJob['status']) ?? 'queued', action: 'corpus-search' };
				const job = await poll_corpus_job(d.jobId);
				corpusJob = job;
				corpusResults = job.batches?.[0]?.summaries ?? [];
			} else {
				corpusResults = d.batches?.[0]?.summaries ?? [];
			}
		} catch (e) {
			corpusError = e instanceof Error ? e.message : String(e);
		} finally {
			corpusLoading = false;
		}
	}

	async function ingest_constitution(stateCode: string) {
		ingestLoading = true;
		ingestResult  = null;
		try {
			const res = await fetch('/api/ingest/legal', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'constitution', stateCode }),
				signal: AbortSignal.timeout(120_000)
			});
			ingestResult = await res.json();
		} catch (e) {
			ingestResult = { error: e instanceof Error ? e.message : String(e) };
		} finally {
			ingestLoading = false;
		}
	}

	async function load_corpus_stats() {
		try {
			const res = await fetch('/api/ingest/legal?type=corpus', { signal: AbortSignal.timeout(30_000) });
			if (!res.ok) return;
			const d = await res.json();
			corpusStats = { byType: d.byCorpusType ? buildByTypeMap(d.byCorpusType) : {}, constitutionCoverage: d.constitutionCoverage?.pct ?? 0, totalDocuments: Object.values<{ total: number }>(d.byCorpusType ? buildByTypeMap(d.byCorpusType) : {}).reduce((s, v) => s + v.total, 0), totalComplete: d.constitutionCoverage?.complete ?? 0 };
		} catch { /* non-fatal */ }
	}

	function buildByTypeMap(rows: { corpus_type: string; processing_status: string; cnt: number }[]): Record<string, { complete: number; total: number }> {
		const m: Record<string, { complete: number; total: number }> = {};
		for (const r of rows) {
			if (!m[r.corpus_type]) m[r.corpus_type] = { complete: 0, total: 0 };
			m[r.corpus_type].total += r.cnt;
			if (r.processing_status === 'complete') m[r.corpus_type].complete += r.cnt;
		}
		return m;
	}

	async function fetch_research_topics(rebuild = false) {
		researchLoading = true;
		researchError   = null;
		try {
			const params = new URLSearchParams({
				pipeline: researchPipeline,
				domains:  researchDomains,
				limit:    '15',
				depth:    '3',
			});
			if (rebuild) params.set('rebuild', '1');
			const res = await fetch(`/api/analytics/research-topics?${params}`, { signal: AbortSignal.timeout(120_000) });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			researchData = await res.json();
		} catch (e) {
			researchError = e instanceof Error ? e.message : String(e);
		} finally {
			researchLoading = false;
		}
	}

	let data = $state<{
		hotQueries:          HotQuery[];
		clusterHeat:         ClusterHeat[];
		variancePairs:       VPair[];
		chunkQuality:        ChunkQ[];
		pipelineMemory:      PipelineMem[];
		crossPipelineChamps: Champion[];
		trending:            Trending[];
		didYouMean:          DYM[];
		qloraStats:          QloraStat[];
		meta:                { minSimilarity: number; windowDays: number; temperature: number };
	} | null>(null);

	let debounceTimer: ReturnType<typeof setTimeout>;

	// ── Derived ───────────────────────────────────────────────────────────────

	const MAX_HITS      = $derived(data?.hotQueries[0]?.hits ?? 1);
	const totalHits     = $derived(data?.hotQueries.reduce((s, q) => s + q.hits, 0) ?? 0);
	const totalExamples = $derived(data?.qloraStats.reduce((s, r) => s + r.cnt, 0) ?? 0);
	// Hash lookup for click-through attribution: suggestion → source query hash
	const hotHashByQuery = $derived(new Map(data?.hotQueries.map((q) => [q.query, q.hash]) ?? []));

	// ── Suggestion click-through ──────────────────────────────────────────────

	async function recordSuggestionClick(_suggestion: string) {
		const sourceHash = hotHashByQuery.get(suggestFor) ?? null;
		if (!sourceHash) return;
		fetch('/api/analytics/feedback', {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify({ queryHash: sourceHash, rating: null, pipeline: 'did-you-mean' }),
			signal: AbortSignal.timeout(15_000)
		}).catch(() => {});
	}

	// ── Fetch ─────────────────────────────────────────────────────────────────

	async function fetch_data() {
		loading = true;
		error   = null;
		try {
			const params = new URLSearchParams({
				days:        String(days),
				temperature: temperature.toFixed(2),
			});
			if (qFilter)    params.set('q',       qFilter);
			if (suggestFor) params.set('suggest',  suggestFor);

			const res = await fetch(`/api/analytics/search-patterns?${params}`, { signal: AbortSignal.timeout(30_000) });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			data = await res.json();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	function schedule_refresh() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => { fetch_data(); }, 300);
	}

	async function fetch_leaderboard() {
		leaderLoading = true;
		try {
			const params = new URLSearchParams({ limit: '100' });
			if (leaderSection) params.set('section', leaderSection);
			const res = await fetch(`/api/analytics/prompt-leaderboard?${params}`, { signal: AbortSignal.timeout(30_000) });
			if (res.ok) promptLeader = await res.json();
		} catch { /* non-fatal */ } finally {
			leaderLoading = false;
		}
	}

	async function fetchClusterNarrative(clusterId: number, force = false) {
		clusterNarrLoading = true;
		clusterNarrError   = null;
		clusterNarrative   = null;
		try {
			const url = force
				? '/api/codebase-index/cluster-summary'
				: `/api/codebase-index/cluster-summary?clusterId=${clusterId}`;
			const opts = force
				? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clusterId, force: true }), signal: AbortSignal.timeout(120_000) }
				: { signal: AbortSignal.timeout(30_000) };
			const res = await fetch(url, opts);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = await res.json();
			if (json.error) throw new Error(json.error);
			clusterNarrative = json as ClusterNarrative;
		} catch (e) {
			clusterNarrError = e instanceof Error ? e.message : String(e);
		} finally {
			clusterNarrLoading = false;
		}
	}

	function toggleClusterExpand(clusterId: number) {
		if (expandedCluster === clusterId) {
			expandedCluster  = null;
			clusterNarrative = null;
			clusterNarrError = null;
		} else {
			expandedCluster = clusterId;
			fetchClusterNarrative(clusterId);
		}
	}

	// Auto-load on days/temperature change; qFilter debounces via oninput
	$effect(() => {
		void days; void temperature;
		schedule_refresh();
	});

	// Load research topics + corpus stats when Research tab is opened
	$effect(() => {
		if (activeSection === 'research' && !researchData && !researchLoading) {
			fetch_research_topics();
			load_corpus_stats();
		}
	});

	// Load graph stats when Graph tab is opened
	$effect(() => {
		if (activeSection === 'graph' && !graphStats && !graphLoading) {
			fetch_graph();
		}
	});

	// Load leaderboard when Training tab is opened or section filter changes
	$effect(() => {
		if (activeSection === 'training') {
			void leaderSection;
			fetch_leaderboard();
			if (!todosResult.length && !todosLoading) loadTodos();
		}
	});

	// Auto-refresh interval
	$effect(() => {
		if (!autoRefresh) return;
		const id = setInterval(fetch_data, 30_000);
		return () => clearInterval(id);
	});

	// ── Distillation ──────────────────────────────────────────────────────────

	async function runDistill(dryRun: boolean) {
		distillRunning = true;
		distillResult  = null;
		distillError   = null;
		try {
			const r = await fetch('/api/analytics/qlora-dataset', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ minRerankScore, limit: distillLimit, dryRun }),
				signal: AbortSignal.timeout(120_000)
			});
			const d = await r.json() as typeof distillResult;
			distillResult = d;
			if (!dryRun && !d?.background) fetch_data(); // refresh QLoRA stats
		} catch (e) {
			distillError = e instanceof Error ? e.message : String(e);
		} finally {
			distillRunning = false;
		}
	}

	async function runValidation() {
		if (!ckptModel.trim()) return;
		ckptRunning = true;
		ckptReport  = null;
		ckptError   = null;
		try {
			const r = await fetch('/api/admin/model/validate-checkpoint', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ model: ckptModel.trim(), baseline: ckptBaseline.trim() }),
				signal: AbortSignal.timeout(120_000)
			});
			const d = await r.json() as ValidateReport & { error?: string };
			if (d.error) throw new Error(d.error);
			ckptReport = d;
		} catch (e) {
			ckptError = e instanceof Error ? e.message : String(e);
		} finally {
			ckptRunning = false;
		}
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	function pct(n: number, of: number) { return of ? Math.round((n / of) * 100) : 0; }
	function fmt_pct(n: number)         { return (n * 100).toFixed(1) + '%'; }
	function fmt_sim(n: number)         { return (n * 100).toFixed(0) + '%'; }

	function score_color(v: number | null): string {
		if (v == null) return '#6b7280';
		if (v >= 0.9)  return '#f59e0b';
		if (v >= 0.75) return '#4ade80';
		if (v >= 0.6)  return '#60a5fa';
		return '#f87171';
	}

	const PIPELINE_CFG: Record<string, { color: string; label: string }> = {
		ace:      { color: '#7c6ff7', label: 'ACE' },
		kag:      { color: '#4ade80', label: 'KAG' },
		dag:      { color: '#f59e0b', label: 'DAG' },
		rag:      { color: '#38bdf8', label: 'RAG' },
		reranker: { color: '#fb7185', label: 'Reranker' },
		codebase: { color: '#a78bfa', label: 'Codebase' },
	};
	const TIER_CFG: Record<string, string> = { gold: '#f59e0b', silver: '#9ca3af', bronze: '#b45309' };

	function short_path(p: string | null): string {
		if (!p) return '—';
		const parts = p.replace(/\\/g, '/').split('/');
		return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p;
	}

	async function sendIntentDraft(query = intentDraft) {
		const text = query.trim();
		if (!text) return;
		intentDraft = text;
		await contextualChat.send(text);
		intentDraft = '';
	}
</script>

<div class="si-page">

<!-- ══════════════════════════════════════════════════════════════════════
     HEADER
══════════════════════════════════════════════════════════════════════ -->
<header class="si-header">
	<div class="header-left">
		<p class="eyebrow"><Icon name="bar-chart-3" class="w-3.5 h-3.5" /> Admin · Analytics</p>
		<h1>Search Intelligence</h1>
		<p class="subtitle">
			Live retrieval patterns · Query variance · Pipeline memory · QLoRA signals
		</p>
	</div>

	<div class="header-right">
		{#if loading}
			<span class="status-chip loading">
				<Icon name="loader" class="w-3.5 h-3.5 spin" /> Refreshing…
			</span>
		{:else if data}
			<span class="status-chip ok">
				<Icon name="check-circle" class="w-3.5 h-3.5" />
				{data.meta.windowDays}d · sim≥{data.meta.minSimilarity.toFixed(2)}
			</span>
		{/if}
		<button
			class="btn-icon"
			class:active={autoRefresh}
			title="Auto-refresh every 30s"
			onclick={() => { autoRefresh = !autoRefresh; }}
		>
			<Icon name="activity" class="w-4 h-4" />
		</button>
	</div>
</header>

{#if error}
	<div class="err-banner"><Icon name="alert-triangle" class="w-4 h-4" /> {error}</div>
{/if}

<!-- ══════════════════════════════════════════════════════════════════════
     CONTROLS
══════════════════════════════════════════════════════════════════════ -->
<div class="controls-bar">
	<!-- Window -->
	<div class="ctrl-group">
		<span class="ctrl-label">Window</span>
		<div class="btn-seg">
			{#each [1, 3, 7, 14, 30] as d}
				<button class="seg-btn" class:active={days === d} onclick={() => { days = d; }}>
					{d}d
				</button>
			{/each}
		</div>
	</div>

	<!-- Temperature -->
	<div class="ctrl-group temp-group">
		<span class="ctrl-label">
			Temperature <code class="val">{temperature.toFixed(2)}</code>
			<span class="sim-hint">sim≥{(1 - temperature * 0.5).toFixed(2)}</span>
		</span>
		<input
			type="range" min="0" max="1" step="0.01"
			bind:value={temperature}
			oninput={schedule_refresh}
			class="temp-slider"
		/>
		<div class="temp-labels"><span>exact</span><span>Bifrost</span><span>fuzzy</span></div>
	</div>

	<!-- Filter -->
	<div class="ctrl-group">
		<span class="ctrl-label">Filter queries <span class="ctrl-sub">(regex)</span></span>
		<div class="input-row">
			<input
				type="text" placeholder="e.g. hearsay|statute"
				bind:value={qFilter}
				oninput={schedule_refresh}
				class="text-input"
			/>
		</div>
	</div>

	<!-- Did you mean -->
	<div class="ctrl-group">
		<span class="ctrl-label">Did you mean? <span class="ctrl-sub">(semantic)</span></span>
		<div class="input-row">
			<input
				type="text" placeholder="Type a query…"
				bind:value={suggestFor}
				class="text-input"
			/>
			<button onclick={fetch_data} class="btn-search" title="Search suggestions">
				<Icon name="search" class="w-3.5 h-3.5" />
			</button>
		</div>
	</div>

	<button class="btn-refresh" onclick={fetch_data} disabled={loading}>
		<Icon name="refresh-cw" class="w-4 h-4 {loading ? 'spin' : ''}" />
		{loading ? 'Loading…' : 'Refresh'}
	</button>
</div>

<!-- ══════════════════════════════════════════════════════════════════════
     STAT STRIP
══════════════════════════════════════════════════════════════════════ -->
<div class="stat-strip">
	<div class="stat-pill">
		<span class="sp-label">Total hits</span>
		<span class="sp-val" style="color:#7c6ff7">{totalHits.toLocaleString()}</span>
	</div>
	<div class="stat-pill">
		<span class="sp-label">Hot queries</span>
		<span class="sp-val" style="color:#4ade80">{data?.hotQueries.length ?? 0}</span>
	</div>
	<div class="stat-pill">
		<span class="sp-label">Trending 24h</span>
		<span class="sp-val" style="color:#f59e0b">{data?.trending.length ?? 0}</span>
	</div>
	<div class="stat-pill">
		<span class="sp-label">Variance pairs</span>
		<span class="sp-val" style="color:#a78bfa">{data?.variancePairs.length ?? 0}</span>
	</div>
	<div class="stat-pill">
		<span class="sp-label">Active clusters</span>
		<span class="sp-val" style="color:#38bdf8">{data?.clusterHeat.length ?? 0}</span>
	</div>
	<div class="stat-pill">
		<span class="sp-label">QLoRA examples</span>
		<span class="sp-val" style="color:#fb7185">{totalExamples.toLocaleString()}</span>
	</div>
</div>

<!-- ══════════════════════════════════════════════════════════════════════
     SECTION TABS
══════════════════════════════════════════════════════════════════════ -->
<div class="section-tabs">
	<button class="s-tab" class:active={activeSection === 'queries'}  onclick={() => activeSection = 'queries'}>
		<Icon name="search" class="w-3.5 h-3.5" /> Queries
	</button>
	<button class="s-tab" class:active={activeSection === 'pipeline'} onclick={() => activeSection = 'pipeline'}>
		<Icon name="git-branch" class="w-3.5 h-3.5" /> Pipeline
	</button>
	<button class="s-tab" class:active={activeSection === 'chunks'}   onclick={() => activeSection = 'chunks'}>
		<Icon name="file-text" class="w-3.5 h-3.5" /> Chunks
	</button>
	<button class="s-tab" class:active={activeSection === 'training'} onclick={() => activeSection = 'training'}>
		<Icon name="brain" class="w-3.5 h-3.5" /> Training
	</button>
	<button class="s-tab" class:active={activeSection === 'research'} onclick={() => activeSection = 'research'}>
		<Icon name="telescope" class="w-3.5 h-3.5" /> Research
	</button>
	<button class="s-tab" class:active={activeSection === 'summaries'} onclick={() => activeSection = 'summaries'}>
		<Icon name="library" class="w-3.5 h-3.5" /> Summaries
	</button>
	<button class="s-tab" class:active={activeSection === 'live'} onclick={() => activeSection = 'live'}>
		<Icon name="radio" class="w-3.5 h-3.5" /> Live Research
	</button>
	<button class="s-tab" class:active={activeSection === 'assist'} onclick={() => activeSection = 'assist'}>
		<Icon name="sparkles" class="w-3.5 h-3.5" /> Assist
	</button>
	<button class="s-tab" class:active={activeSection === 'tags'} onclick={() => { activeSection = 'tags'; if (!tagStatus && !tagStatusLoading) void loadTagStatus(); }}>
		<Icon name="tag" class="w-3.5 h-3.5" /> Tags
	</button>
	<button class="s-tab" class:active={activeSection === 'graph'} onclick={() => activeSection = 'graph'}>
		<Icon name="network" class="w-3.5 h-3.5" /> Graph RL
	</button>
	<button class="s-tab" class:active={activeSection === 'index'} onclick={() => { activeSection = 'index'; if (!idxStatus && !idxStatusLoading) void loadIdxStatus(); }}>
		<Icon name="database" class="w-3.5 h-3.5" /> Index
	</button>
</div>

{#if data}
<div class="si-grid" class:wide={activeSection === 'chunks'}>

	<!-- ═══════════════════════════ QUERIES ═══════════════════════════════ -->
	{#if activeSection === 'queries'}

	<!-- Hot Queries -->
	<section class="panel span2">
		<h2><Icon name="flame" class="w-4 h-4" style="color:#f59e0b" /> Hot Queries
			<span class="h2-badge">{data.hotQueries.length}</span>
		</h2>
		{#if !data.hotQueries.length}
			<p class="empty">No matching queries in this window</p>
		{:else}
			<ul class="query-list">
				{#each data.hotQueries as q, i}
					<li>
						<span class="rank">{i + 1}</span>
						<div class="qbar-wrap">
							<div class="qbar-fill" style="width:{pct(q.hits, MAX_HITS)}%"></div>
						</div>
						<span class="q-text">{q.query}</span>
						<span class="q-hits">{q.hits}</span>
						<FeedbackButtons queryHash={q.hash} compact={true} showCounts={true} />
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Trending -->
	<section class="panel">
		<h2><Icon name="trending-up" class="w-4 h-4" style="color:#4ade80" /> Trending
			<span class="h2-badge">{data.trending.length}</span>
			<span class="h2-sub">24h growth rate</span>
		</h2>
		{#if !data.trending.length}
			<p class="empty">No trending data yet</p>
		{:else}
			<ul class="trending-list">
				{#each data.trending as t}
					<li>
						<span class="t-query">{t.query ?? t.query_hash.slice(0, 14) + '…'}</span>
						<div class="t-right">
							<span class="t-growth"
								style="color:{t.growth_rate > 3 ? '#f59e0b' : t.growth_rate > 1 ? '#4ade80' : '#6b7280'}">
								×{t.growth_rate.toFixed(1)}
							</span>
							<span class="t-meta">{t.recent_hits}↑</span>
							<FeedbackButtons queryHash={t.query_hash} pipeline="ace" compact={true} />
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Variance Pairs -->
	<section class="panel span2">
		<h2>
			<Icon name="git-merge" class="w-4 h-4" style="color:#a78bfa" /> Variance Pairs
			<span class="h2-badge">{data.variancePairs.length}</span>
			<span class="h2-sub">temp={temperature.toFixed(2)} · min_sim={data.meta.minSimilarity.toFixed(2)}</span>
		</h2>
		{#if !data.variancePairs.length}
			<p class="empty">No pairs at this threshold — increase temperature to see more</p>
		{:else}
			<table class="data-table">
				<thead>
					<tr><th>Query A</th><th>Query B</th><th style="text-align:right">Sim</th><th style="text-align:right">Hits</th></tr>
				</thead>
				<tbody>
					{#each data.variancePairs as p}
						<tr>
							<td class="q-cell">{p.query_a}</td>
							<td class="q-cell muted">{p.query_b}</td>
							<td class="r-cell">
								<span class="sim-chip"
									style="background:{p.similarity >= 0.95 ? '#f59e0b22' : p.similarity >= 0.85 ? '#4ade8022' : '#38bdf822'};
									       color:{p.similarity >= 0.95 ? '#f59e0b' : p.similarity >= 0.85 ? '#4ade80' : '#38bdf8'}">
									{fmt_sim(p.similarity)}
								</span>
							</td>
							<td class="r-cell">{p.hit_count}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<!-- Did You Mean -->
	{#if data.didYouMean.length || suggestFor}
	<section class="panel">
		<h2><Icon name="lightbulb" class="w-4 h-4" style="color:#fbbf24" /> Did You Mean?</h2>
		{#if data.didYouMean.length}
			<ul class="dym-list">
				{#each data.didYouMean as s}
					<li>
						<div class="dym-top">
							<button class="dym-btn" onclick={() => { recordSuggestionClick(s.suggestion); suggestFor = s.suggestion; fetch_data(); }}>
								"{s.suggestion}"
							</button>
							{#if s.qualityTier}
								<span class="tier-badge tier-{s.qualityTier}">{s.qualityTier}</span>
							{/if}
						</div>
						<div class="dym-bottom">
							<span class="dym-meta">
								{fmt_sim(s.similarity)} sim · {s.hitCount} hits
								<span class="src-badge src-{s.source}">{s.source}</span>
							</span>
							<FeedbackButtons queryHash={hotHashByQuery.get(s.suggestion) ?? s.suggestion} pipeline="did-you-mean" compact={true} />
						</div>
					</li>
				{/each}
			</ul>
		{:else if suggestFor}
			<p class="empty">No suggestions for "{suggestFor}"</p>
		{/if}
	</section>
	{/if}

	<!-- ═══════════════════════════ PIPELINE ══════════════════════════════ -->
	{:else if activeSection === 'pipeline'}

	<!-- Pipeline Memory -->
	<section class="panel">
		<h2><Icon name="cpu" class="w-4 h-4" style="color:#38bdf8" /> Pipeline Memory
			<span class="h2-sub">{days}d window</span>
		</h2>
		{#if !data.pipelineMemory.length}
			<p class="empty">No pipeline data in this window</p>
		{:else}
			{@const maxPhits = Math.max(...data.pipelineMemory.map((p) => p.total_hits), 1)}
			<div class="pipeline-list">
				{#each data.pipelineMemory as pm}
					{@const cfg = PIPELINE_CFG[pm.pipeline] ?? { color: '#9ca3af', label: pm.pipeline }}
					<div class="pip-row">
						<div class="pip-head">
							<span class="pip-dot" style="background:{cfg.color}"></span>
							<span class="pip-name">{cfg.label}</span>
							{#if pm.avg_rerank != null}
								<span class="pip-score" style="color:{score_color(pm.avg_rerank)}">
									{fmt_pct(pm.avg_rerank)}
								</span>
							{/if}
							<span class="pip-hits">{pm.total_hits.toLocaleString()}</span>
						</div>
						<div class="pip-bar-bg">
							<div class="pip-bar-fill"
								style="width:{pct(pm.total_hits, maxPhits)}%; background:{cfg.color}50; border-right:2px solid {cfg.color}">
							</div>
						</div>
						<div class="pip-meta">
							<span>{pm.unique_chunks} chunks</span>
							<span>{pm.unique_queries} queries</span>
							{#if pm.top_chunk_path}
								<span class="top-chunk" title={pm.top_chunk_path ?? ''}>
									<Icon name="file" class="w-3 h-3" />{short_path(pm.top_chunk_path)}
								</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Cross-Pipeline Champions -->
	<section class="panel">
		<h2><Icon name="trophy" class="w-4 h-4" style="color:#f59e0b" /> Cross-Pipeline Champions
			<span class="h2-badge">{data.crossPipelineChamps.length}</span>
			<span class="h2-sub">≥2 pipelines</span>
		</h2>
		{#if !data.crossPipelineChamps.length}
			<p class="empty">No chunks hit across multiple pipelines yet</p>
		{:else}
			<ul class="champ-list">
				{#each data.crossPipelineChamps as c}
					<li>
						<div class="champ-path" title={c.chunk_id}>{short_path(c.relative_path)}</div>
						<div class="champ-meta">
							<span class="pip-count-badge">{c.pipeline_count}×</span>
							<div class="pipe-tags">
								{#each c.pipelines.split(', ') as pipe}
									{@const cfg = PIPELINE_CFG[pipe.trim()] ?? { color: '#9ca3af' }}
									<span class="pipe-tag" style="border-color:{cfg.color}; color:{cfg.color}">{pipe.trim()}</span>
								{/each}
							</div>
							<span class="champ-hits">{c.total_hits} hits</span>
							{#if c.avg_rerank != null}
								<span style="color:{score_color(c.avg_rerank)}">{fmt_pct(c.avg_rerank)}</span>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Cluster Heatmap -->
	<section class="panel span2">
		<h2><Icon name="layers" class="w-4 h-4" style="color:#38bdf8" /> GPU Cluster Heatmap
			<span class="h2-badge">{data.clusterHeat.length} active</span>
		</h2>
		{#if !data.clusterHeat.length}
			<p class="empty">No cluster data in this window</p>
		{:else}
			{@const maxCH = data.clusterHeat[0]?.total_hits ?? 1}
			<ul class="cluster-list">
				{#each data.clusterHeat as c}
					<li title="Cluster {c.gpu_cluster} — {c.total_hits} hits, {c.unique_queries} queries">
						<button class="c-expand-btn" onclick={() => toggleClusterExpand(c.gpu_cluster)}
							aria-expanded={expandedCluster === c.gpu_cluster}>
							<Icon name={expandedCluster === c.gpu_cluster ? 'chevron-down' : 'chevron-right'} class="w-3 h-3" />
						</button>
						<span class="c-id">C{c.gpu_cluster}</span>
						<div class="c-bar-bg">
							<div class="c-bar-fill" style="width:{pct(c.total_hits, maxCH)}%"></div>
						</div>
						<span class="c-hits">{c.total_hits}</span>
						<span class="c-q muted">{c.unique_queries}q</span>
						{#if c.avg_rerank != null}
							<span class="c-score" style="color:{score_color(c.avg_rerank)}">{fmt_pct(c.avg_rerank)}</span>
						{/if}
					</li>
					{#if expandedCluster === c.gpu_cluster}
						<li class="cluster-narrative">
							{#if clusterNarrLoading}
								<p class="muted">Loading narrative…</p>
							{:else if clusterNarrError}
								<p class="error-text">{clusterNarrError}</p>
							{:else if clusterNarrative}
								<div class="narr-header">
									<strong>{clusterNarrative.purpose}</strong>
									<button class="btn-regen" onclick={() => fetchClusterNarrative(c.gpu_cluster, true)}
										title="Regenerate narrative">
										<Icon name="refresh-cw" class="w-3 h-3" /> Regenerate
									</button>
								</div>
								<p class="narr-summary">{clusterNarrative.summary}</p>
								{#if clusterNarrative.patterns.length}
									<div class="narr-section">
										<span class="narr-label">Patterns</span>
										<ul class="narr-list">{#each clusterNarrative.patterns as p}<li>{p}</li>{/each}</ul>
									</div>
								{/if}
								{#if clusterNarrative.keyFiles.length}
									<div class="narr-section">
										<span class="narr-label">Key Files</span>
										<ul class="narr-list mono">{#each clusterNarrative.keyFiles as f}<li>{f}</li>{/each}</ul>
									</div>
								{/if}
								{#if clusterNarrative.warnings.length}
									<div class="narr-section">
										<span class="narr-label">Warnings</span>
										<ul class="narr-list warn">{#each clusterNarrative.warnings as w}<li>{w}</li>{/each}</ul>
									</div>
								{/if}
								<p class="narr-footer muted">Generated {new Date(clusterNarrative.generatedAt).toLocaleString()}</p>
							{/if}
						</li>
					{/if}
				{/each}
			</ul>
		{/if}
	</section>

	<!-- ═══════════════════════════ CHUNKS ════════════════════════════════ -->
	{:else if activeSection === 'chunks'}

	<section class="panel span-full">
		<h2>
			<Icon name="bar-chart-2" class="w-4 h-4" style="color:#4ade80" /> Chunk Quality Signals
			<span class="h2-badge">{data.chunkQuality.length}</span>
			<span class="h2-sub">quality = hit_count × avg_rerank</span>
		</h2>
		{#if !data.chunkQuality.length}
			<p class="empty">No chunk data in this window</p>
		{:else}
			{@const maxQS = Math.max(...data.chunkQuality.map((c) => c.quality_score), 1)}
			<table class="data-table">
				<thead>
					<tr>
						<th style="width:2rem">#</th>
						<th>Path</th>
						<th>Pipelines</th>
						<th style="text-align:right">Hits</th>
						<th style="text-align:right">Queries</th>
						<th style="text-align:right">Avg rerank</th>
						<th style="text-align:right; width:120px">Quality score</th>
						<th style="text-align:center; width:60px">Rate</th>
					</tr>
				</thead>
				<tbody>
					{#each data.chunkQuality as cq, i}
						<tr>
							<td class="rank">{i + 1}</td>
							<td><span class="mono" title={cq.chunk_id}>{short_path(cq.relative_path)}</span></td>
							<td>
								<div class="pipe-tags sm">
									{#each cq.pipelines as pipe}
										{@const cfg = PIPELINE_CFG[pipe] ?? { color: '#9ca3af' }}
										<span class="pipe-tag" style="border-color:{cfg.color}; color:{cfg.color}">{pipe}</span>
									{/each}
								</div>
							</td>
							<td class="r-cell">{cq.hit_count}</td>
							<td class="r-cell">{cq.unique_queries}</td>
							<td class="r-cell">
								<span style="color:{score_color(cq.avg_rerank)}">
									{cq.avg_rerank != null ? fmt_pct(cq.avg_rerank) : '—'}
								</span>
							</td>
							<td class="r-cell">
								<div class="qs-bar-wrap">
									<div class="qs-bar" style="width:{pct(cq.quality_score, maxQS)}%; background:{score_color(cq.avg_rerank)}"></div>
									<span class="qs-val">{cq.quality_score.toFixed(1)}</span>
								</div>
							</td>
							<td class="r-cell">
								<FeedbackButtons queryHash={cq.chunk_id} pipeline="chunk-quality" compact={true} />
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<!-- ═══════════════════════════ TRAINING ══════════════════════════════ -->
	{:else if activeSection === 'training'}

	<!-- QLoRA Stats -->
	<section class="panel">
		<h2>
			<Icon name="brain" class="w-4 h-4" style="color:#a78bfa" /> QLoRA Training Examples
			<span class="h2-badge">{totalExamples.toLocaleString()} total</span>
		</h2>
		{#if !data.qloraStats.length}
			<p class="empty">No training examples yet — run distillation to populate</p>
		{:else}
			<div class="tier-list">
				{#each data.qloraStats as tier}
					{@const color = TIER_CFG[tier.quality_tier] ?? '#6b7280'}
					{@const p = totalExamples ? (tier.cnt / totalExamples) * 100 : 0}
					<div class="tier-row">
						<div class="tier-label">
							<span class="tier-dot" style="background:{color}"></span>
							<span class="tier-name">{tier.quality_tier.charAt(0).toUpperCase() + tier.quality_tier.slice(1)}</span>
						</div>
						<div class="tier-bar-bg">
							<div class="tier-bar-fill" style="width:{p}%; background:{color}50; border-right:2px solid {color}"></div>
						</div>
						<div class="tier-stats">
							<span class="tier-cnt">{tier.cnt.toLocaleString()}</span>
							<span class="tier-pct muted">{p.toFixed(1)}%</span>
							<span class="tier-score" style="color:{color}">avg {fmt_pct(tier.avg_score)}</span>
						</div>
					</div>
				{/each}
			</div>
			<!-- Stacked bar -->
			<div class="stacked-bar">
				{#each data.qloraStats as tier}
					{@const color = TIER_CFG[tier.quality_tier] ?? '#6b7280'}
					{@const p = totalExamples ? (tier.cnt / totalExamples) * 100 : 0}
					<div class="stack-seg" style="width:{p}%; background:{color}" title="{tier.quality_tier}: {tier.cnt}"></div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Feedback Legend -->
	<section class="panel">
		<h2><Icon name="thumbs-up" class="w-4 h-4" style="color:#4ade80" /> Feedback → QLoRA Loop</h2>
		<div class="feedback-legend">
			<div class="fl-row">
				<span class="fl-icon up">👍</span>
				<div class="fl-text">
					<span class="fl-title">Thumbs up — promotes to training</span>
					<span class="fl-desc">Sets <code>qlora:promote:{'{hash}'}</code> Redis flag · Upgrades quality tier (bronze→silver→gold) · Boosts chunk rerank_score to 1.0 · Included in next distillation pass</span>
				</div>
			</div>
			<div class="fl-row">
				<span class="fl-icon down">👎</span>
				<div class="fl-text">
					<span class="fl-title">Thumbs down — marks for review</span>
					<span class="fl-desc">Sets <code>qlora:skip:{'{hash}'}</code> Redis flag · Demotes quality tier (gold→silver→bronze) · Excluded from distillation · Flagged for KAG review</span>
				</div>
			</div>
			<div class="fl-row">
				<span class="fl-icon neutral">↺</span>
				<div class="fl-text">
					<span class="fl-title">Toggle off — clears vote</span>
					<span class="fl-desc">Removes <code>response_feedback</code> row · Deletes both Redis flags · Query returns to neutral state for next pipeline pass</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Distillation Runner -->
	<section class="panel">
		<h2><Icon name="flask-conical" class="w-4 h-4" style="color:#2dd4bf" /> Distillation Runner</h2>
		<p class="distill-desc">
			Trigger the <code>qlora.distill</code> pipeline to scan high-quality <code>rag_query_log</code>
			entries and insert them into <code>qlora_examples</code>.
		</p>

		<div class="distill-fields">
			<label class="field">
				<span>Min rerank score</span>
				<input type="number" min="0" max="1" step="0.05"
					bind:value={minRerankScore} class="num-input" />
			</label>
			<label class="field">
				<span>Limit</span>
				<input type="number" min="1" max="500"
					bind:value={distillLimit} class="num-input" />
			</label>
		</div>

		<div class="distill-actions">
			<button class="btn-distill dry" disabled={distillRunning}
				onclick={() => runDistill(true)}>
				<Icon name="eye" class="w-3.5 h-3.5" /> Dry run
			</button>
			<button class="btn-distill run" disabled={distillRunning}
				onclick={() => runDistill(false)}>
				<Icon name="play" class="w-3.5 h-3.5" />
				{distillRunning ? 'Running…' : 'Run distillation'}
			</button>
			<a href="/api/analytics/qlora-dataset?export=jsonl" download="qlora-training.jsonl"
				class="btn-distill export">
				<Icon name="download" class="w-3.5 h-3.5" /> Export JSONL
			</a>
			<a href="/api/analytics/qlora-dataset?export=summaries&minScore=0.7" download="research-summaries-ft.jsonl"
				class="btn-distill export" title="Export curated research summaries as Alpaca-format JSONL for topological summary fine-tuning">
				<Icon name="book-open" class="w-3.5 h-3.5" /> Export Summaries FT
			</a>
		</div>

		{#if distillResult}
			<div class="distill-result">
				{#if distillResult.background}
					<span class="dr-item ok"><Icon name="list-checks" class="w-3 h-3" /> Queued in background</span>
				{:else}
					{#if distillResult.dryRun}
						<span class="dr-item warn"><Icon name="eye" class="w-3 h-3" /> Preview — no changes written</span>
					{/if}
					<span class="dr-item"><Icon name="list" class="w-3 h-3" /> {distillResult.candidates} candidates</span>
					{#if (distillResult.inserted ?? 0) > 0}
						<span class="dr-item ok"><Icon name="check" class="w-3 h-3" /> {distillResult.inserted} inserted</span>
					{/if}
					{#if (distillResult.skipped ?? 0) > 0}
						<span class="dr-item warn"><Icon name="skip-forward" class="w-3 h-3" /> {distillResult.skipped} skipped</span>
					{/if}
				{/if}
			</div>
		{/if}
		{#if distillError}
			<div class="distill-err">{distillError}</div>
		{/if}
	</section>

	<!-- Checkpoint Validator -->
	<section class="panel">
		<h2>
			<Icon name="shield-check" class="w-4 h-4" style="color:#22c55e" /> Checkpoint Validator
			<span class="h2-sub">Quality gate before promoting a fine-tuned model to production</span>
		</h2>

		<div class="ckpt-fields">
			<label class="field">
				<span>Candidate model</span>
				<input class="text-input" style="width:220px" placeholder="gemma4-legal-v2:latest"
					bind:value={ckptModel} />
			</label>
			<label class="field">
				<span>Baseline</span>
				<input class="text-input" style="width:200px"
					bind:value={ckptBaseline} />
			</label>
			<button class="btn-distill run" style="align-self:flex-end"
				disabled={ckptRunning || !ckptModel.trim()}
				onclick={runValidation}>
				<Icon name="play" class="w-3.5 h-3.5" />
				{ckptRunning ? 'Validating…' : 'Run validation'}
			</button>
		</div>

		{#if ckptError}
			<div class="distill-err">{ckptError}</div>
		{/if}

		{#if ckptReport}
			{@const vcolor = ckptReport.verdict === 'pass' ? '#22c55e' : ckptReport.verdict === 'fail' ? '#f87171' : '#f59e0b'}
			<div class="ckpt-verdict" style="border-color:{vcolor}30; background:{vcolor}0a">
				<span class="ckpt-badge" style="color:{vcolor}; border-color:{vcolor}40">
					{ckptReport.verdict.toUpperCase()}
				</span>
				<div class="ckpt-scores">
					<span>Candidate <strong style="color:{vcolor}">{fmt_pct(ckptReport.avgCandidate)}</strong></span>
					<span class="muted">vs</span>
					<span>Baseline <strong>{fmt_pct(ckptReport.avgBaseline)}</strong></span>
					<span class="ckpt-delta" style="color:{ckptReport.delta >= 0 ? '#4ade80' : '#f87171'}">
						{ckptReport.delta >= 0 ? '+' : ''}{(ckptReport.delta * 100).toFixed(1)}pp
					</span>
				</div>
				<div class="ckpt-meta">
					<span class="dr-item ok"><Icon name="trending-up" class="w-3 h-3" /> {ckptReport.improvements} improved</span>
					{#if ckptReport.regressions > 0}
						<span class="dr-item warn"><Icon name="trending-down" class="w-3 h-3" /> {ckptReport.regressions} regressed</span>
					{/if}
					<span class="muted" style="font-size:0.62rem">{new Date(ckptReport.validatedAt).toLocaleString()}</span>
				</div>
			</div>

			<table class="data-table" style="margin-top:0.75rem">
				<thead>
					<tr>
						<th>Probe query</th>
						<th class="r-cell" style="width:70px">Candidate</th>
						<th class="r-cell" style="width:70px">Baseline</th>
						<th class="r-cell" style="width:55px">Δ</th>
					</tr>
				</thead>
				<tbody>
					{#each ckptReport.results as r}
						{@const dc = r.delta >= 0.05 ? '#4ade80' : r.delta <= -0.05 ? '#f87171' : '#6b7280'}
						<tr>
							<td class="q-cell" title={r.query}>{r.query}</td>
							<td class="r-cell" style="color:{score_color(r.candidateScore)}">{fmt_pct(r.candidateScore)}</td>
							<td class="r-cell" style="color:{score_color(r.baselineScore)}">{fmt_pct(r.baselineScore)}</td>
							<td class="r-cell" style="color:{dc}; font-weight:600">
								{r.delta >= 0 ? '+' : ''}{(r.delta * 100).toFixed(0)}pp
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<!-- Prompt Leaderboard -->
	<section class="panel">
		<h2>
			<Icon name="trophy" class="w-4 h-4" style="color:#f59e0b" />
			Prompt Leaderboard
			{#if promptLeader}
				<span class="h2-badge">{promptLeader.total} prompts</span>
			{/if}
			<span class="h2-sub">Top prompts by click count from ACE synthesis sessions</span>
		</h2>

		<div class="leader-controls">
			<label class="ctrl-label">
				<Icon name="filter" class="w-3 h-3" /> Section
				<select class="leader-select" bind:value={leaderSection}
					onchange={fetch_leaderboard}>
					<option value="">All sections</option>
					{#each promptLeader?.sections ?? [] as sec}
						<option value={sec}>{sec}</option>
					{/each}
				</select>
			</label>
			<button class="btn-leader-refresh" onclick={fetch_leaderboard} disabled={leaderLoading}>
				<Icon name="refresh-cw" class="w-3 h-3" />
				{leaderLoading ? 'Loading…' : 'Refresh'}
			</button>
		</div>

		{#if leaderLoading && !promptLeader}
			<div class="empty">Loading leaderboard…</div>
		{:else if !promptLeader?.entries?.length}
			<div class="empty">No prompt clicks recorded yet. Prompts are tracked when users click synthesis suggestions.</div>
		{:else}
			<table class="data-table">
				<thead>
					<tr>
						<th class="r-cell" style="width:2.5rem">#</th>
						<th>Prompt</th>
						<th style="width:100px">Source</th>
						<th style="width:110px">Section</th>
						<th class="r-cell" style="width:60px">Clicks</th>
					</tr>
				</thead>
				<tbody>
					{#each promptLeader.entries as entry}
						<tr>
							<td class="rank">{entry.rank}</td>
							<td class="q-cell" title={entry.prompt}>{entry.prompt}</td>
							<td><span class="leader-src-badge">{entry.promptSource}</span></td>
							<td class="mono muted">{entry.section || '—'}</td>
							<td class="r-cell"><span class="leader-clicks">{entry.clicks}</span></td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<!-- Predictive Todos — post-graph pipeline: LLM gap analysis → actionable tasks -->
	<section class="panel span2">
		<h2>
			<Icon name="list-checks" class="w-4 h-4" style="color:#38bdf8" /> Predictive To-Do List
			<span class="h2-sub">Gap analysis from cluster heat + low-rerank queries → actionable dev tasks</span>
			{#if todosResult.length}
				<span class="h2-badge">{todosResult.filter(t => t.status === 'pending').length} pending</span>
			{/if}
		</h2>

		<div class="distill-controls" style="margin-bottom:0.75rem">
			<label class="field" style="flex-direction:row;align-items:center;gap:0.5rem">
				<span class="muted" style="font-size:0.75rem">Lookback</span>
				<select class="ctrl-select" style="width:90px" bind:value={todosDays}>
					{#each [1,3,7,14,30] as d}<option value={d}>{d}d</option>{/each}
				</select>
			</label>
			<button class="btn-distill dry"
				disabled={todosRunning}
				onclick={() => runGenerateTodos(true)}>
				<Icon name="eye" class="w-3.5 h-3.5" /> Preview
			</button>
			<button class="btn-distill run"
				disabled={todosRunning}
				onclick={() => runGenerateTodos(false)}>
				<Icon name="cpu" class="w-3.5 h-3.5" />
				{todosRunning ? 'Analysing…' : 'Generate todos'}
			</button>
			<button class="btn-distill export" onclick={loadTodos} disabled={todosLoading}>
				<Icon name="refresh-cw" class="w-3.5 h-3.5" />
				{todosLoading ? 'Loading…' : 'Refresh'}
			</button>
		</div>

		{#if todosError}
			<div class="distill-err">{todosError}</div>
		{/if}

		{#if todosResult.length === 0 && !todosLoading && !todosRunning}
			<p class="muted" style="font-size:0.8rem">No todos yet — click Generate to run LLM gap analysis.</p>
		{:else}
			<div class="todo-list">
				{#each todosResult.filter(t => t.status !== 'dismissed') as todo (todo.id)}
					{@const impactColor = todo.estimated_impact === 'high' ? '#f87171' : todo.estimated_impact === 'medium' ? '#f59e0b' : '#94a3b8'}
					<div class="todo-row" class:done={todo.status === 'done'}>
						<span class="todo-impact" style="color:{impactColor};border-color:{impactColor}40">{todo.estimated_impact}</span>
						<span class="todo-type mono">{todo.todo_type.replace(/_/g, ' ')}</span>
						{#if todo.gpu_cluster != null}
							<span class="todo-cluster muted">cluster {todo.gpu_cluster}</span>
						{/if}
						<span class="todo-reason" title={todo.suggested_action}>{todo.reason}</span>
						<code class="todo-action">{todo.suggested_action.slice(0, 80)}{todo.suggested_action.length > 80 ? '…' : ''}</code>
						<button class="todo-dismiss" onclick={() => dismissTodo(todo.id)} title="Dismiss">
							<Icon name="x" class="w-3 h-3" />
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	{/if}

</div>
{:else if !loading}
	<div class="no-data">
		<Icon name="database" class="w-8 h-8" />
		<p>No data loaded yet</p>
	</div>
{/if}

<!-- ══════════════════════════════════════════════════════════════════════
     RESEARCH TOPICS — independent of search-patterns data
══════════════════════════════════════════════════════════════════════ -->
{#if activeSection === 'research'}
<div class="si-grid">

	<!-- Controls -->
	<section class="panel span2">
		<div class="research-controls">
			<div class="ctrl-group">
				<label class="ctrl-label">Pipeline</label>
				<select bind:value={researchPipeline} class="ctrl-select" onchange={() => fetch_research_topics()}>
					<option value="all">All pipelines</option>
					<option value="ace">ACE</option>
					<option value="rag">RAG</option>
					<option value="kag">KAG</option>
					<option value="dag">DAG</option>
					<option value="codebase">Codebase</option>
				</select>
			</div>
			<div class="ctrl-group" style="flex:1">
				<label class="ctrl-label">Domains (comma-separated)</label>
				<input
					type="text"
					bind:value={researchDomains}
					class="ctrl-input"
					placeholder="typescript,sveltekit,ripgrep,ollama,awk"
				/>
			</div>
			<button class="btn-sm" onclick={() => fetch_research_topics(false)} disabled={researchLoading}>
				<Icon name="refresh-cw" class="w-3 h-3" />
				{researchLoading ? 'Loading…' : 'Refresh'}
			</button>
			<button class="btn-sm" onclick={() => fetch_research_topics(true)} disabled={researchLoading} title="Force-rebuild Redis index">
				<Icon name="database" class="w-3 h-3" /> Rebuild
			</button>
		</div>
		{#if researchData?.meta}
			<p class="cache-hint">
				Cache built: {researchData.meta.cacheBuiltAt
					? new Date(researchData.meta.cacheBuiltAt).toLocaleTimeString()
					: 'never'} &nbsp;·&nbsp;
				{Object.entries(researchData.meta.totalByPipeline)
					.filter(([, n]) => n > 0)
					.map(([k, n]) => `${k}:${n}`)
					.join(' · ')}
			</p>
		{/if}
	</section>

	<!-- Hot query tags + Graph expansions -->
	{#if researchData && (researchData.hotQueryTags.length || researchData.graphExpansions.length || researchData.seedTopics.length)}
	<section class="panel span2">
		<h2><Icon name="zap" class="w-4 h-4 text-yellow-400" /> Live Signals</h2>
		<div class="signal-row">
			{#if researchData.hotQueryTags.length}
			<div class="signal-group">
				<span class="signal-label">Hot queries</span>
				<div class="tag-cloud">
					{#each researchData.hotQueryTags.slice(0,8) as q}
						<span class="tag hot-tag" title={q}>{q.slice(0,50)}</span>
					{/each}
				</div>
			</div>
			{/if}
			{#if researchData.graphExpansions.length}
			<div class="signal-group">
				<span class="signal-label">Graph-connected questions</span>
				<ul class="signal-list">
					{#each researchData.graphExpansions as exp}
						<li>{exp}</li>
					{/each}
				</ul>
			</div>
			{/if}
			{#if researchData.seedTopics.length}
			<div class="signal-group">
				<span class="signal-label">Domain seed topics</span>
				<ul class="signal-list">
					{#each researchData.seedTopics as st}
						<li>{st}</li>
					{/each}
				</ul>
			</div>
			{/if}
		</div>
	</section>
	{/if}

	<!-- Research topic cards -->
	{#if researchLoading && !researchData}
		<section class="panel span2"><div class="empty">Building research index…</div></section>
	{:else if researchError}
		<section class="panel span2"><div class="empty error-text">{researchError}</div></section>
	{:else if !researchData?.topics?.length}
		<section class="panel span2">
			<div class="empty">
				No research topics yet. Run distillation first to populate the QLoRA examples, then rebuild the index.
			</div>
		</section>
	{:else}
		{#each researchData.topics as topic}
		<section class="panel research-card" class:expanded={expandedTopic === topic.queryHash}>

			<!-- Card header -->
			<div class="rc-header" role="button" tabindex="0"
				onclick={() => expandedTopic = expandedTopic === topic.queryHash ? null : topic.queryHash}
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') expandedTopic = expandedTopic === topic.queryHash ? null : topic.queryHash; }}>
				<div class="rc-meta">
					<span class="pipeline-badge {topic.pipeline}">{topic.pipeline.toUpperCase()}</span>
					{#if topic.qualityTier}
						<span class="tier-badge {topic.qualityTier}">{topic.qualityTier}</span>
					{/if}
					<span class="rc-conf" title="Composite score">
						{Math.round(topic.confidence * 100)}%
					</span>
					<span class="feedback-inline">
						<Icon name="thumbs-up" class="w-3 h-3" />{topic.feedbackUp}
						<Icon name="thumbs-down" class="w-3 h-3" />{topic.feedbackDown}
					</span>
				</div>
				<p class="rc-query">{topic.query || '(no query text)'}</p>
				{#if topic.entityTags.length}
					<div class="rc-tags">
						{#each topic.entityTags.slice(0,5) as tag}
							<span class="tag">{tag}</span>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Expanded detail -->
			{#if expandedTopic === topic.queryHash}
			<div class="rc-detail">
				{#if topic.graphSummary}
					<p class="rc-graph-summary"><strong>Graph context:</strong> {topic.graphSummary}</p>
				{/if}

				{#if topic.selfPromptChain.length}
				<div class="rc-chain">
					<h4><Icon name="link" class="w-3.5 h-3.5" /> Self-prompt chain</h4>
					<ol class="chain-list">
						{#each topic.selfPromptChain as step, i}
							<li class="chain-step">
								<span class="step-num">{i + 1}</span>
								<span class="step-text">{step}</span>
							</li>
						{/each}
					</ol>
				</div>
				{:else}
					<p class="muted chain-hint">No chain generated — run rebuild or use gold/platinum tier topics to trigger Ollama synthesis.</p>
				{/if}

				<div class="rc-pipelines">
					<span class="muted">Pipelines: </span>
					{#each topic.pipelines as pl}
						<span class="pipeline-badge {pl}">{pl}</span>
					{/each}
				</div>
			</div>
			{/if}

		</section>
		{/each}
	{/if}

	<!-- ── Corpus Search ─────────────────────────────────────────────────── -->
	<section class="panel corpus-panel">
		<h3 class="section-title">Local Legal Search</h3>
		<p class="corpus-desc">Search authoritative sources in <code>legal_canon_chunks</code> and <code>court_opinions</code>, plus contextual records in <code>legal_documents</code>, via gemma4-legal — offline, no external calls.</p>
		<div class="corpus-controls">
			<input
				class="corpus-input"
				placeholder="e.g. hearsay exceptions under FRE 803 …"
				bind:value={corpusQuery}
				onkeydown={(e) => { if (e.key === 'Enter') run_corpus_search(); }}
			/>
			<button class="btn-sm primary" onclick={run_corpus_search} disabled={corpusLoading || !corpusQuery.trim()}>
				{corpusLoading ? 'Searching…' : corpusJob?.status === 'completed' ? 'Search Again' : 'Search Corpus'}
			</button>
		</div>
		{#if corpusJob}
			<p class="corpus-status">Job {corpusJob.status}{corpusJob.totalSummaries ? ` · ${corpusJob.totalSummaries} summaries` : ''}{corpusJob.error ? ` · ${corpusJob.error}` : ''}</p>
		{/if}
		{#if corpusError}
			<p class="err-msg">{corpusError}</p>
		{/if}
		{#if corpusResults.length}
			<div class="corpus-results">
				{#each corpusResults as r}
					<div class="corpus-result">
						<div class="corpus-result-header">
							<span class="corpus-badge {r.collection}">{r.collectionLabel}</span>
							{#if r.jurisdiction}<span class="juris-badge">{r.jurisdiction.toUpperCase()}</span>{/if}
							{#if r.citationLabel}<span class="citation-badge">{r.citationLabel}</span>{/if}
							<span class="score-badge">{(r.relevanceScore * 100).toFixed(0)}%</span>
						</div>
						{#if r.sectionPath}<p class="section-path">{r.sectionPath}</p>{/if}
						<p class="corpus-summary">{r.summary}</p>
						{#if r.entityTags.length}
							<div class="tag-row">
								{#each r.entityTags.slice(0, 6) as tag}
									<span class="tag">{tag}</span>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else if !corpusLoading}
			<p class="empty-msg">Enter a legal question to search the local corpus.</p>
		{/if}
	</section>

	<!-- ── Legal Corpus Ingestion ────────────────────────────────────────── -->
	<section class="panel ingest-panel">
		<h3 class="section-title">Legal Corpus Ingestion</h3>

		{#if corpusStats}
			<div class="corpus-coverage">
				<div class="coverage-stat">
					<span class="cov-label">Constitutions</span>
					<div class="cov-bar-wrap">
						<div class="cov-bar" style="width: {corpusStats.constitutionCoverage}%"></div>
					</div>
					<span class="cov-pct">{corpusStats.constitutionCoverage}%</span>
					<span class="cov-detail">({corpusStats.byType['constitution']?.complete ?? 0}/53 ingested)</span>
				</div>
				{#each Object.entries(corpusStats.byType).filter(([k]) => k !== 'constitution') as [type, counts]}
					<div class="coverage-stat">
						<span class="cov-label">{type}</span>
						<span class="cov-detail">{counts.complete}/{counts.total} complete</span>
					</div>
				{/each}
			</div>
		{/if}

		<div class="ingest-controls">
			<label class="ctrl-label" for="ingest-state">State / Federal Code</label>
			<select id="ingest-state" class="ctrl-select" bind:value={ingestStateCode}>
				<option value="us">United States (Federal)</option>
				<option value="ca">California</option>
				<option value="ny">New York</option>
				<option value="tx">Texas</option>
				<option value="fl">Florida</option>
				<option value="wa">Washington</option>
				<option value="or">Oregon</option>
				<option value="co">Colorado</option>
				<option value="il">Illinois</option>
				<option value="pa">Pennsylvania</option>
				<option value="oh">Ohio</option>
				<option value="ga">Georgia</option>
				<option value="nc">North Carolina</option>
				<option value="all">All 53 constitutions (background)</option>
			</select>
			<button class="btn-sm primary" onclick={() => ingest_constitution(ingestStateCode)} disabled={ingestLoading}>
				{ingestLoading ? 'Queuing…' : 'Ingest Constitution'}
			</button>
			<button class="btn-sm" onclick={load_corpus_stats} title="Refresh coverage stats">
				Refresh Stats
			</button>
		</div>

		{#if ingestResult}
			<div class="ingest-result" class:success={ingestResult.queued} class:skip={ingestResult.skipped} class:fail={!!ingestResult.error}>
				{#if ingestResult.queued}
					Queued: <strong>{ingestResult.stateName ?? ingestResult.message}</strong> — pipeline running in background.
				{:else if ingestResult.skipped}
					Already complete. Pass <code>force: true</code> to re-ingest.
				{:else if ingestResult.error}
					Error: {ingestResult.error}
				{/if}
			</div>
		{/if}
	</section>

</div>
{/if}

<!-- ══════════════════════════════════════════════════════════════════════
     SUMMARIES BROWSER — paginated research_summaries (web + corpus + docs)
══════════════════════════════════════════════════════════════════════ -->
{#if activeSection === 'summaries'}
<div class="si-grid wide">
	<section class="panel span2">
		<div class="panel-hdr">
			<span class="panel-title">Research Summaries Browser</span>
			<span class="panel-sub">
				Paginated browse of all persisted web + corpus + document summaries.
				Filter by source, pipeline, and entity tags. Fuse.js instant search on current page.
				"Did you mean?" via pg_trgm. Cursor-based pagination — no OFFSET scans.
			</span>
		</div>
		<div class="summaries-browser-wrap">
			<ResearchSummariesBrowser />
		</div>
	</section>
</div>
{/if}

<!-- ══════════════════════════════════════════════════════════════════════
     LIVE RESEARCH — SSE streaming concurrent research panel
══════════════════════════════════════════════════════════════════════ -->
{#if activeSection === 'live'}
<div class="si-grid wide">
	<section class="panel span2">
		<div class="panel-hdr">
			<span class="panel-title"><Icon name="radio" class="w-4 h-4" style="color:#4ade80" /> Live Concurrent Research</span>
			<span class="panel-sub">
				Stream a LangGraph supervisor → parallel domain workers → Ollama synthesis pipeline.
				Worker results appear as they arrive. Persisted summaries link back to the Summaries tab.
			</span>
		</div>
		<LiveResearchPanel />
	</section>
</div>
{/if}

<!-- ══════════════════════════════════════════════════════════════════════
     CLAUDE ASSIST DEBUG — compact pipeline diagnostics
══════════════════════════════════════════════════════════════════════ -->
{#if activeSection === 'assist'}
<div class="si-grid wide">
	<section class="panel span2">
		<div class="panel-hdr">
			<span class="panel-title"><Icon name="sparkles" class="w-4 h-4" style="color:#a78bfa" /> Claude Assist Debug</span>
			<span class="panel-sub">
				Run a compact claude-assist query with debug=true to inspect latency, cache, budgets, and retrieval counts.
			</span>
		</div>

		<div class="ad-input-row">
			<input
				type="text"
				class="ad-query"
				placeholder="Claude-assist query — e.g. 'How does the evidence pipeline handle OCR fallback?'"
				bind:value={assistDebugQuery}
				onkeydown={(e) => { if (e.key === 'Enter') runAssistDebug(); }}
				disabled={assistDebugLoading}
			/>
			<button class="ad-btn" onclick={runAssistDebug} disabled={!assistDebugQuery.trim() || assistDebugLoading}>
				{assistDebugLoading ? 'Running…' : 'Run'}
			</button>
		</div>

		{#if assistDebugError}
			<div class="ad-error">❌ {assistDebugError}</div>
		{/if}

		{#if assistDebugResult}
			{@const r = assistDebugResult as Record<string, any>}
			<div class="ad-cards">
				<div class="ad-card">
					<span class="ad-label">Latency</span>
					<span class="ad-value">{r.timing?.totalMs ?? '–'}ms</span>
				</div>
				<div class="ad-card">
					<span class="ad-label">Cache</span>
					<span class="ad-value" class:hit={r.cache?.hit} class:miss={!r.cache?.hit}>
						{r.cache?.hit ? 'HIT' : 'MISS'}
					</span>
				</div>
				<div class="ad-card">
					<span class="ad-label">Content Hits</span>
					<span class="ad-value">{r.retrieval?.content_hits ?? 0}</span>
				</div>
				<div class="ad-card">
					<span class="ad-label">Error Hits</span>
					<span class="ad-value">{r.retrieval?.error_hits ?? 0}</span>
				</div>
				<div class="ad-card">
					<span class="ad-label">ACE Chunks</span>
					<span class="ad-value">{r.ace_context?.top_chunks?.length ?? 0}</span>
				</div>
				<div class="ad-card">
					<span class="ad-label">Research Workers</span>
					<span class="ad-value">{r.research?.workers ?? 0}</span>
				</div>
				<div class="ad-card">
					<span class="ad-label">Schema IDs</span>
					<span class="ad-value">{r.retrieval?.schema_ids ?? 0}</span>
				</div>
				<div class="ad-card">
					<span class="ad-label">Compact</span>
					<span class="ad-value">{r.compact ? 'ON' : 'OFF'}</span>
				</div>
			</div>

			<!-- TRACE: topo prefilter timeline -->
			{#if r.trace?.topo_prefilter}
				{@const tp = r.trace.topo_prefilter}
				<div class="ad-trace">
					<span class="ad-trace-hdr">
						<Icon name="zap" class="w-3 h-3" style="color:#a78bfa" />
						TRACE · Topo Prefilter
					</span>
					<span class="ad-trace-badge" class:hit={tp.cacheHit} class:miss={!tp.cacheHit}>
						{tp.cacheHit ? 'CACHE HIT' : 'CACHE MISS'}
					</span>
					<span class="ad-trace-class">{tp.queryClass}</span>
					{#if tp.cacheHit && tp.candidateCount != null}
						<span class="ad-trace-stat">{tp.candidateCount} candidates recalled · Qdrant skipped</span>
					{:else}
						<span class="ad-trace-stat">Qdrant ANN sweep required</span>
					{/if}
					<span class="ad-trace-hash" title="Query hash">{tp.queryHash}</span>
				</div>
			{/if}

			<!-- Timing breakdown -->
			<div class="ad-timing">
				<h4>Timing</h4>
				{#each Object.entries(r.timing ?? {}) as [k, v]}
					<span class="ad-timing-item"><strong>{k}</strong>: {v}ms</span>
				{/each}
			</div>

			<!-- Debug diagnostics (only when debug=true returned them) -->
			{#if r.diagnostics}
				<details class="ad-details">
					<summary>Diagnostics (budgets + raw counts)</summary>
					<pre class="ad-pre">{JSON.stringify(r.diagnostics, null, 2)}</pre>
				</details>
			{/if}

			<!-- Research summary preview -->
			{#if r.research?.markdown}
				<details class="ad-details">
					<summary>Research Summary ({r.research.markdown.length} chars)</summary>
					<pre class="ad-pre">{r.research.markdown}</pre>
				</details>
			{/if}

			<div class="ad-cache-key">
				<Icon name="key" class="w-3 h-3" /> {r.cache?.key ?? '–'}
			</div>

			<!-- Feedback row -->
			<div class="fb-row">
				{#if feedbackSent}
					<span class="fb-thanks">Thanks for feedback</span>
				{:else}
					<span class="fb-label">Was this useful?</span>
					<button class="fb-btn fb-up" onclick={() => sendFeedback(true)} disabled={feedbackLoading}>
						<Icon name="thumbs-up" class="w-4 h-4" /> Yes
					</button>
					<button class="fb-btn fb-down" onclick={() => sendFeedback(false)} disabled={feedbackLoading}>
						<Icon name="thumbs-down" class="w-4 h-4" /> No
					</button>
				{/if}
				<button class="fb-stats-btn" onclick={loadFeedbackStats} style="margin-left:auto">
					<Icon name="bar-chart-2" class="w-3 h-3" /> Stats
				</button>
			</div>

			<!-- Feedback stats (if loaded) -->
			{#if feedbackStats}
				<div class="fb-stats">
					<span class="fb-stat">Total: <strong>{feedbackStats.total}</strong></span>
					<span class="fb-stat">Useful: <strong>{feedbackStats.useful}</strong></span>
					<span class="fb-stat">Not useful: <strong>{feedbackStats.notUseful}</strong></span>
					<span class="fb-stat fb-pct" class:fb-good={feedbackStats.usefulPct >= 70} class:fb-warn={feedbackStats.usefulPct >= 40 && feedbackStats.usefulPct < 70} class:fb-low={feedbackStats.usefulPct < 40}>
						{feedbackStats.usefulPct}% useful
					</span>
				</div>
			{/if}
		{/if}
	</section>

	<!-- ── Feedback Analysis Panel ──────────────────────────────────────── -->
	<section class="panel span2">
		<div class="panel-hdr">
			<span class="panel-title"><Icon name="bar-chart-2" class="w-4 h-4" style="color:#60a5fa" /> Retrieval Quality Analysis</span>
			<span class="panel-sub">
				Correlates human feedback with assist run telemetry. The key metric: do retrieved files match what the operator actually edits?
			</span>
		</div>

		<div class="fa-toolbar">
			<button class="ad-btn" onclick={loadAnalysis} disabled={analysisLoading}>
				{analysisLoading ? 'Loading…' : 'Load Analysis'}
			</button>
			<select class="fa-window-select" bind:value={analysisWindow} onchange={loadAnalysis}>
				<option value="all">All time</option>
				<option value="7d">Last 7 days</option>
				<option value="25">Last 25 runs</option>
				<option value="50">Last 50 runs</option>
			</select>
		</div>

		{#if analysisData}
			{@const a = analysisData}

			<!-- Top-line KPIs -->
			<div class="ad-cards">
				<div class="ad-card">
					<span class="ad-label">Useful Rate</span>
					<span class="ad-value" class:fb-good={a.overallStats.usefulPct >= 70} class:fb-warn={a.overallStats.usefulPct >= 40 && a.overallStats.usefulPct < 70} class:fb-low={a.overallStats.usefulPct < 40}>
						{a.overallStats.usefulPct}%
					</span>
				</div>
				<div class="ad-card">
					<span class="ad-label">Overlap Rate</span>
					<span class="ad-value" class:fb-good={a.overlapRate.mean >= 50} class:fb-warn={a.overlapRate.mean >= 20 && a.overlapRate.mean < 50} class:fb-low={a.overlapRate.mean < 20}>
						{a.overlapRate.mean}%
					</span>
				</div>
				<div class="ad-card">
					<span class="ad-label">Feedback Samples</span>
					<span class="ad-value">{a.overallStats.total}</span>
				</div>
				<div class="ad-card">
					<span class="ad-label">With Edits</span>
					<span class="ad-value">{a.overlapRate.withEdits}</span>
				</div>
			</div>

			<!-- Auto-suggested recommendations -->
			{#if a.recommendations?.length > 0}
				<div class="fa-recs">
					<h4 class="fa-heading">Suggested Tuning</h4>
					{#each a.recommendations as rec}
						<div class="fa-rec" class:fa-rec-high={rec.confidence === 'high'} class:fa-rec-medium={rec.confidence === 'medium'} class:fa-rec-low={rec.confidence === 'low'}>
							<Icon name={rec.icon} class="w-3.5 h-3.5 shrink-0" />
							<span class="fa-rec-text">{rec.text}</span>
							<span class="fa-rec-conf">{rec.confidence}</span>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Apply Suggested Defaults panel -->
			{#if a.suggestedDefaults}
				<div class="fa-apply-panel">
					<h4 class="fa-heading">Apply Suggested Defaults</h4>
					<div class="fa-apply-grid">
						{#if a.suggestedDefaults.maxGraphNeighbors != null}
							<div class="fa-apply-row">
								<span class="fa-apply-label">Max Graph Neighbors</span>
								<span class="fa-apply-current">current: {appliedDefaults?.applied?.maxGraphNeighbors ?? 10}</span>
								<span class="fa-apply-arrow">→</span>
								<span class="fa-apply-suggested">{a.suggestedDefaults.maxGraphNeighbors}</span>
							</div>
						{/if}
						{#if a.suggestedDefaults.maxAceChunks != null}
							<div class="fa-apply-row">
								<span class="fa-apply-label">Max ACE Chunks</span>
								<span class="fa-apply-current">current: {appliedDefaults?.applied?.maxAceChunks ?? 6}</span>
								<span class="fa-apply-arrow">→</span>
								<span class="fa-apply-suggested">{a.suggestedDefaults.maxAceChunks}</span>
							</div>
						{/if}
						{#if a.suggestedDefaults.compact != null}
							<div class="fa-apply-row">
								<span class="fa-apply-label">Default Mode</span>
								<span class="fa-apply-current">current: {appliedDefaults?.applied?.compact !== false ? 'compact' : 'debug'}</span>
								<span class="fa-apply-arrow">→</span>
								<span class="fa-apply-suggested">{a.suggestedDefaults.compact ? 'compact' : 'debug'}</span>
							</div>
						{/if}
						{#if a.suggestedDefaults.cacheTtlHint}
							<div class="fa-apply-row">
								<span class="fa-apply-label">Cache TTL</span>
								<span class="fa-apply-current">current: {appliedDefaults?.applied?.cacheTtlHint ?? 'keep'}</span>
								<span class="fa-apply-arrow">→</span>
								<span class="fa-apply-suggested">{a.suggestedDefaults.cacheTtlHint}</span>
							</div>
						{/if}
					</div>
					<div class="fa-apply-actions">
						<button class="ad-btn" onclick={() => applyDefaults(a.suggestedDefaults)} disabled={applyingDefaults}>
							{applyingDefaults ? 'Applying…' : 'Apply Suggested Defaults'}
						</button>
						<button class="ad-btn" onclick={loadAppliedDefaults} disabled={defaultsLoading}>
							{defaultsLoading ? 'Loading…' : 'Refresh Current'}
						</button>
						{#if applyMessage}
							<span class="fa-apply-msg">{applyMessage}</span>
						{/if}
					</div>
					{#if appliedDefaults?.appliedAt}
						<div class="fa-apply-meta">Last applied: {new Date(appliedDefaults.appliedAt).toLocaleString()}</div>
					{/if}
				</div>
			{/if}

			<!-- Defaults impact: before/after comparison -->
			{#if a.defaultsImpact}
				{@const d = a.defaultsImpact}
				<div class="fa-impact-panel">
					<h4 class="fa-heading">Defaults Impact</h4>
					<div class="fa-impact-meta">
						Applied: {new Date(d.appliedAt).toLocaleString()}
						· Before: {d.before.total} samples · After: {d.after.total} samples
					</div>
					<div class="fa-impact-grid">
						<div class="fa-impact-col">
							<span class="fa-impact-label">Before</span>
							<span class="fa-impact-val">{d.before.usefulPct}% useful</span>
							<span class="fa-impact-val">{d.before.overlapMean}% overlap</span>
						</div>
						<div class="fa-impact-col fa-impact-arrow-col">
							<span class="fa-impact-arrow">→</span>
						</div>
						<div class="fa-impact-col">
							<span class="fa-impact-label">After</span>
							<span class="fa-impact-val">{d.after.usefulPct}% useful</span>
							<span class="fa-impact-val">{d.after.overlapMean}% overlap</span>
						</div>
						<div class="fa-impact-col">
							<span class="fa-impact-label">Delta</span>
							<span class="fa-impact-delta" class:fa-delta-pos={d.delta.usefulPct > 0} class:fa-delta-neg={d.delta.usefulPct < 0}>
								{d.delta.usefulPct > 0 ? '+' : ''}{d.delta.usefulPct}% useful
							</span>
							<span class="fa-impact-delta" class:fa-delta-pos={d.delta.overlapMean > 0} class:fa-delta-neg={d.delta.overlapMean < 0}>
								{d.delta.overlapMean > 0 ? '+' : ''}{d.delta.overlapMean}% overlap
							</span>
						</div>
					</div>
					{#if d.current}
						<div class="fa-impact-defaults">
							<span class="fa-impact-def-label">Current defaults:</span>
							{#each Object.entries(d.current) as [k, v]}
								<span class="fa-pill">{k}: {v}</span>
							{/each}
						</div>
					{/if}
					{#if d.previous}
						<div class="fa-impact-defaults">
							<span class="fa-impact-def-label">Previous defaults:</span>
							{#each Object.entries(d.previous) as [k, v]}
								<span class="fa-pill">{k}: {v}</span>
							{/each}
						</div>
					{/if}
					{#if d.previous}
						<div class="fa-impact-actions">
							<button class="ad-btn fa-revert-btn" onclick={revertDefaults} disabled={revertingDefaults}>
								{revertingDefaults ? 'Reverting…' : 'Revert to Previous Defaults'}
							</button>
							{#if revertMessage}
								<span class="fa-apply-msg">{revertMessage}</span>
							{/if}
						</div>
					{/if}
					{#if d.domainImpact && d.domainImpact.length > 0}
						<div class="fa-impact-domain-section">
							<span class="fa-impact-def-label">Per-domain deltas:</span>
							<div class="fa-impact-domain-grid">
								{#each d.domainImpact as di}
									<div class="fa-impact-domain-row">
										<span class="fa-domain-name">{di.domain}</span>
										<span class="fa-impact-delta" class:fa-delta-pos={di.delta.usefulPct > 0} class:fa-delta-neg={di.delta.usefulPct < 0}>
											{di.delta.usefulPct > 0 ? '+' : ''}{di.delta.usefulPct}% useful
										</span>
										<span class="fa-impact-delta" class:fa-delta-pos={di.delta.overlapMean > 0} class:fa-delta-neg={di.delta.overlapMean < 0}>
											{di.delta.overlapMean > 0 ? '+' : ''}{di.delta.overlapMean}% overlap
										</span>
										<span class="fa-impact-counts">{di.before.total}→{di.after.total}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Cache hit vs miss usefulness -->
			<div class="fa-section">
				<h4 class="fa-heading">Cache Hit vs Miss</h4>
				<div class="fa-row">
					<span class="fa-pill">HIT: {a.byCacheHit.hit.pct}% useful ({a.byCacheHit.hit.total})</span>
					<span class="fa-pill">MISS: {a.byCacheHit.miss.pct}% useful ({a.byCacheHit.miss.total})</span>
				</div>
			</div>

			<!-- Compact vs debug usefulness -->
			<div class="fa-section">
				<h4 class="fa-heading">Compact vs Debug</h4>
				<div class="fa-row">
					<span class="fa-pill">Compact: {a.byCompactMode.compact.pct}% useful ({a.byCompactMode.compact.total})</span>
					<span class="fa-pill">Debug: {a.byCompactMode.debug.pct}% useful ({a.byCompactMode.debug.total})</span>
				</div>
			</div>

			<!-- Domain breakdown -->
			{#if a.byDomain.length > 0}
				<div class="fa-section">
					<h4 class="fa-heading">By Research Domain</h4>
					<div class="fa-domain-grid">
						{#each a.byDomain as d}
							<div class="fa-domain-row">
								<span class="fa-domain-name">{d.domain}</span>
								<div class="fa-bar-track">
									<div class="fa-bar-fill" class:fb-good={d.pct >= 70} class:fb-warn={d.pct >= 40 && d.pct < 70} class:fb-low={d.pct < 40}
										style="width:{d.pct}%"></div>
								</div>
								<span class="fa-domain-pct">{d.pct}% ({d.total})</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Graph neighbor buckets -->
			{#if a.byGraphBucket.length > 0}
				<div class="fa-section">
					<h4 class="fa-heading">By Graph Neighbors</h4>
					<div class="fa-row">
						{#each a.byGraphBucket as g}
							<span class="fa-pill">{g.bucket}: {g.pct}% ({g.total})</span>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Latency buckets -->
			{#if a.latencyBuckets.length > 0}
				<div class="fa-section">
					<h4 class="fa-heading">By Latency</h4>
					<div class="fa-row">
						{#each a.latencyBuckets as l}
							<span class="fa-pill">{l.bucket}: {l.pct}% useful ({l.total})</span>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Recent correlated feedback -->
			{#if a.recentCorrelated.length > 0}
				<details class="ad-details">
					<summary>Recent Correlated Feedback ({a.recentCorrelated.length})</summary>
					<div class="fa-table-wrap">
						<table class="fa-table">
							<thead>
								<tr>
									<th>Useful</th>
									<th>Domains</th>
									<th>Top Paths</th>
									<th>Edited</th>
									<th>Cache</th>
									<th>Graph</th>
									<th>ms</th>
								</tr>
							</thead>
							<tbody>
								{#each a.recentCorrelated as c}
									<tr>
										<td>{c.useful ? 'Yes' : 'No'}</td>
										<td class="fa-cell-sm">{(c.domains ?? []).join(', ') || '–'}</td>
										<td class="fa-cell-sm">{(c.topPaths ?? []).map((p: string) => p.split('/').pop()).join(', ') || '–'}</td>
										<td class="fa-cell-sm">{(c.editedFiles ?? []).map((p: string) => p.split('/').pop()).join(', ') || '–'}</td>
										<td>{c.cacheHit ? 'HIT' : c.cacheHit === false ? 'MISS' : '–'}</td>
										<td>{c.graphNeighbors ?? '–'}</td>
										<td>{c.totalMs ?? '–'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</details>
			{/if}
		{/if}
	</section>
</div>
{/if}

<!-- ══════════════════════════════════════════════════════════════════════
     KARPATHY TAG BACKFILL — semantic tag enrichment + status
══════════════════════════════════════════════════════════════════════ -->
{#if activeSection === 'tags'}
<div class="si-grid wide">
	<section class="panel span2">
		<div class="panel-hdr">
			<span class="panel-title"><Icon name="tag" class="w-4 h-4" style="color:#4ade80" /> Karpathy Semantic Tags</span>
			<span class="panel-sub">
				Classifies codebase chunks into 20 semantic categories via Ollama. Tags enable precise domain filtering in concurrent research.
			</span>
		</div>

		<!-- Status bar -->
		{#if tagStatusLoading}
			<div class="ad-timing"><span class="ad-timing-item">Loading tag status…</span></div>
		{:else if tagStatus}
			<div class="tb-status-bar">
				<div class="tb-stat">
					<span class="tb-stat-label">Tagged</span>
					<span class="tb-stat-value">{tagStatus.tagged}</span>
				</div>
				<div class="tb-stat">
					<span class="tb-stat-label">Total</span>
					<span class="tb-stat-value">{tagStatus.total}</span>
				</div>
				<div class="tb-stat">
					<span class="tb-stat-label">Coverage</span>
					<span class="tb-stat-value" class:tb-good={tagStatus.pct >= 80} class:tb-warn={tagStatus.pct >= 30 && tagStatus.pct < 80} class:tb-low={tagStatus.pct < 30}>
						{tagStatus.pct}%
					</span>
				</div>
				<button class="ad-btn" onclick={loadTagStatus} style="margin-left:auto">
					<Icon name="refresh-cw" class="w-3 h-3" /> Refresh
				</button>
			</div>

			<!-- Tag distribution -->
			{#if Object.keys(tagStatus.semanticTagDist).length > 0}
				<div class="tb-dist">
					{#each Object.entries(tagStatus.semanticTagDist).sort((a, b) => b[1] - a[1]) as [tag, count]}
						<span class="tb-tag">{tag} <strong>{count}</strong></span>
					{/each}
				</div>
			{/if}
		{/if}

		<!-- Backfill controls -->
		<div class="tb-controls">
			<label class="lr-opt">
				<input type="checkbox" bind:checked={tagBackfillDryRun} disabled={tagBackfillRunning} />
				<span class="lr-opt-label">Dry Run</span>
			</label>
			{#if tagBackfillRunning}
				<button class="lr-btn lr-btn-cancel" onclick={cancelTagBackfill}>
					<Icon name="x" class="w-3.5 h-3.5" /> Cancel
				</button>
			{:else}
				<button class="ad-btn" onclick={startTagBackfill}>
					<Icon name="play" class="w-3.5 h-3.5" /> Run Backfill
				</button>
			{/if}
		</div>

		<!-- Backfill progress -->
		{#if tagBackfillRunning || tagBackfillDone || tagBackfillError}
			<div class="tb-progress">
				<div class="ad-cards">
					<div class="ad-card">
						<span class="ad-label">Batch</span>
						<span class="ad-value">{tagBackfillBatch}</span>
					</div>
					<div class="ad-card">
						<span class="ad-label">Processed</span>
						<span class="ad-value">{tagBackfillTotal}</span>
					</div>
					<div class="ad-card">
						<span class="ad-label">Tagged</span>
						<span class="ad-value" style="color:#4ade80">{tagBackfillTagged}</span>
					</div>
					<div class="ad-card">
						<span class="ad-label">Skipped</span>
						<span class="ad-value">{tagBackfillSkipped}</span>
					</div>
					<div class="ad-card">
						<span class="ad-label">Elapsed</span>
						<span class="ad-value">{tagBackfillElapsed < 1000 ? `${tagBackfillElapsed}ms` : `${(tagBackfillElapsed / 1000).toFixed(1)}s`}</span>
					</div>
					<div class="ad-card">
						<span class="ad-label">Status</span>
						<span class="ad-value" style="color:{tagBackfillDone ? '#4ade80' : tagBackfillError ? '#f87171' : '#a78bfa'}">
							{tagBackfillDone ? 'Done' : tagBackfillError ? 'Error' : 'Running…'}
						</span>
					</div>
				</div>

				{#if tagBackfillError}
					<div class="ad-error">❌ {tagBackfillError}</div>
				{/if}

				{#if Object.keys(tagBackfillDist).length > 0}
					<div class="tb-dist">
						{#each Object.entries(tagBackfillDist).sort((a, b) => b[1] - a[1]) as [tag, count]}
							<span class="tb-tag">{tag} <strong>{count}</strong></span>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</section>
</div>
{/if}

<!-- ══════════════════════════════════════════════════════════════════════
     RESEARCH GRAPH RL — cluster bar chart + RL policy weights + rebuild
══════════════════════════════════════════════════════════════════════ -->
{#if activeSection === 'graph'}
<div class="si-grid">

	<!-- Controls -->
 	<section class="panel span2">
		<div class="panel-hdr">
			<span class="panel-title"><Icon name="network" class="w-4 h-4" /> Research Graph RL</span>
			<span class="panel-sub">
				GPU k-means clusters over <code>research_summaries</code> · PageRank authority scores ·
				RL policy weights from GRPO feedback · Auto-rebuilds every 100 new embedded rows.
			</span>
		</div>
		<div class="graph-controls">
			<button
				class="btn-sm"
				disabled={graphBuilding}
				onclick={() => rebuild_graph('build')}
				title="Re-cluster all research_summaries with GPU k-means + PageRank"
			>
				{graphBuilding ? 'Building…' : 'Rebuild Graph'}
			</button>
			<button
				class="btn-sm"
				disabled={graphBuilding}
				onclick={() => rebuild_graph('policy')}
				title="Recompute RL policy weights from feedback + QLoRA rewards"
			>
				{graphBuilding ? 'Computing…' : 'Recompute Policy'}
			</button>
			<button class="btn-sm btn-ghost" disabled={graphLoading} onclick={fetch_graph}>
				<Icon name="refresh-cw" class="w-3 h-3" /> Refresh
			</button>
			{#if graphBuildMsg}
				<span class="build-msg">{graphBuildMsg}</span>
			{/if}
		</div>
		{#if graphError}
			<p class="err-inline"><Icon name="alert-triangle" class="w-3.5 h-3.5" /> {graphError}</p>
		{/if}
	</section>

	<section class="panel span2">
		<div class="panel-hdr">
			<span class="panel-title"><Icon name="sparkles" class="w-4 h-4" /> Intent Router Demo</span>
			<span class="panel-sub">Type a query and inspect the label badge, confidence pill, and route trace.</span>
		</div>
		<div class="intent-demo-shell">
			<div class="intent-demo-composer">
				<input
					class="text-input intent-input"
					bind:value={intentDraft}
					placeholder="Try: upload the pdf evidence and hash it"
					onkeydown={(e) => { if (e.key === 'Enter') void sendIntentDraft(); }}
				/>
				<button class="btn-sm primary" onclick={() => void sendIntentDraft()} disabled={intentBusy || !intentDraft.trim()}>
					{intentBusy ? 'Routing…' : 'Send'}
				</button>
			</div>
			<div class="intent-example-row">
				{#each INTENT_EXAMPLES as example}
					<button class="btn-sm btn-ghost" onclick={() => { intentDraft = example.query; void sendIntentDraft(example.query); }}>
						{example.label}
					</button>
				{/each}
			</div>
			<div class="intent-message-list">
				{#each contextualChat.messages as message, index}
					<div class="intent-message intent-{message.role}">
						<div class="intent-message-head">
							<span class="intent-role">{message.role}</span>
							{#if message.role === 'user' && message.metadata?.intent}
								{@const intent = message.metadata.intent as { label: string; confidence: number; fallback: boolean }}
								<span class="intent-badge intent-{intent.fallback ? 'neutral' : intent.label}">{intent.label}</span>
								<span class="intent-confidence">{(intent.confidence * 100).toFixed(0)}%</span>
							{/if}
							{#if message.role === 'assistant' && contextualChat.hasPartialResults}
								<span class="intent-confidence neutral">partial-results</span>
							{/if}
						</div>
						<p class="intent-message-body">{message.content}</p>
					</div>
				{/each}
			</div>
			{#if contextualChat.lastRoute}
				<div class="intent-route-card">
					<div class="intent-route-row">
						<span class="intent-confidence">{contextualChat.lastRoute.reason}</span>
						{#if contextualChat.lastRoute.fallback}
							<span class="intent-confidence neutral">fallback</span>
						{/if}
					</div>
					<div class="intent-route-steps">
						{#each contextualChat.lastRoute.chain as step}
							<span class="intent-step">{step.tool}</span>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</section>

	<!-- Graph stats summary -->
	{#if graphStats}
	<section class="panel">
		<div class="panel-hdr"><span class="panel-title">Graph Summary</span></div>
		<dl class="stat-dl">
			<div class="stat-row">
				<dt>Total summaries</dt>
				<dd>{graphStats.totalSummaries ?? 0}</dd>
			</div>
			<div class="stat-row">
				<dt>Clusters (k)</dt>
				<dd>{graphStats.clusters?.length ?? 0}</dd>
			</div>
			<div class="stat-row">
				<dt>Built at</dt>
				<dd>{graphStats.builtAt ? new Date(graphStats.builtAt).toLocaleTimeString() : '—'}</dd>
			</div>
		</dl>
		{#if graphStats.totalSummaries < 40}
			<p class="warn-note">
				<Icon name="info" class="w-3.5 h-3.5" />
				Needs ≥40 embedded rows for k=20 clusters. Current: {graphStats.totalSummaries}.
				Run a web-research crawl to seed data.
			</p>
		{/if}
	</section>
	{/if}

	<!-- RL Policy weights -->
	{#if rlPolicy}
	<section class="panel">
		<div class="panel-hdr"><span class="panel-title">RL Policy Weights</span></div>
		<div class="policy-bars">
			{#each Object.entries(rlPolicy).filter(([k]) => k !== 'updatedAt') as [pipeline, weight]}
				{@const cfg = PIPELINE_CFG[pipeline]}
				{@const pct_val = Math.round(Number(weight) * 100)}
				<div class="policy-row">
					<span class="policy-label" style="color:{cfg?.color ?? '#9ca3af'}">{cfg?.label ?? pipeline}</span>
					<div class="policy-bar-track">
						<div
							class="policy-bar-fill"
							style="width:{Math.min(pct_val, 100)}%; background:{cfg?.color ?? '#9ca3af'}22; border-color:{cfg?.color ?? '#9ca3af'}"
						></div>
					</div>
					<span class="policy-val">{Number(weight).toFixed(3)}</span>
				</div>
			{/each}
			<p class="policy-updated">Updated {rlPolicy.updatedAt ? new Date(rlPolicy.updatedAt).toLocaleTimeString() : '—'}</p>
		</div>
	</section>
	{/if}

	<!-- Cluster bar chart -->
	{#if graphStats?.clusters?.length}
	<section class="panel span2">
		<div class="panel-hdr">
			<span class="panel-title">Cluster PageRank Scores</span>
			<span class="panel-sub">Sorted by authority score descending. Each bar = one k-means cluster.</span>
		</div>
		<div class="cluster-chart">
			{#each graphStats.clusters.slice(0, 20) as cluster}
				{@const maxPR = graphStats.clusters[0]?.pageRank ?? 1}
				{@const barPct = maxPR > 0 ? Math.round((cluster.pageRank / maxPR) * 100) : 0}
				<div class="cluster-bar-row">
					<span class="cluster-id">C{cluster.id}</span>
					<div class="cluster-bar-track">
						<div class="cluster-bar-fill" style="width:{barPct}%"></div>
					</div>
					<span class="cluster-meta">{cluster.size} docs · PR {cluster.pageRank.toFixed(4)}</span>
				</div>
			{/each}
		</div>
	</section>
	{:else if graphLoading}
	<section class="panel span2">
		<p class="loading-note"><Icon name="loader" class="w-4 h-4 spin" /> Loading graph data…</p>
	</section>
	{:else if !graphError}
	<section class="panel span2">
		<p class="empty-note">
			<Icon name="info" class="w-4 h-4" />
			No graph built yet. Crawl some research summaries first, then click <strong>Rebuild Graph</strong>.
		</p>
	</section>
	{/if}

	<!-- ── Top Hyperedges ───────────────────────────────────────────────────── -->
	<section class="panel span2">
		<div class="panel-hdr">
			<span class="panel-title"><Icon name="layers" class="w-4 h-4" /> Top Hyperedges</span>
			<span class="panel-sub">HGNN-enriched knowledge clusters · Grades A–C by GRPO reward score</span>
			<div style="display:flex;gap:0.3rem;margin-left:auto">
				{#each (['A','B','C'] as const) as g}
					<button
						class="btn-sm {hyperedgeGrade === g ? 'primary' : ''}"
						onclick={() => { hyperedgeGrade = g; }}
					>{g}</button>
				{/each}
				<button class="btn-sm btn-ghost" disabled={hyperedgeLoading} onclick={fetch_hyperedges}>
					<Icon name="refresh-cw" class="w-3 h-3" />
				</button>
			</div>
		</div>
		{#if hyperedgeError}
			<p class="err-inline"><Icon name="alert-triangle" class="w-3.5 h-3.5" /> {hyperedgeError}</p>
		{:else if hyperedgeLoading}
			<p class="loading-note"><Icon name="loader" class="w-4 h-4 spin" /> Loading hyperedges…</p>
		{:else if hyperedges.length === 0}
			<p class="empty-note">No Grade {hyperedgeGrade} hyperedges yet — rebuild graph after seeding ≥40 summaries.</p>
		{:else}
			<table class="data-table">
				<thead><tr>
					<th>Hash</th><th>Grade</th><th>Score</th><th>Pipeline</th><th>Members</th><th>LoRA hint</th><th>Summary</th>
				</tr></thead>
				<tbody>
					{#each hyperedges as e}
						<tr>
							<td><code class="mono">{e.hash}</code></td>
							<td><span class="tier-badge {e.gradeLabel}">{e.gradeLabel}</span></td>
							<td class="r-cell">{(e.gradeScore * 100).toFixed(0)}%</td>
							<td><span class="pipeline-badge {e.pipeline}">{e.pipeline.toUpperCase()}</span></td>
							<td class="r-cell">{e.memberCount}</td>
							<td class="q-cell muted">{e.loraHint ?? '—'}</td>
							<td class="q-cell">{e.summary?.slice(0, 80) ?? '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<!-- ── RL Audit Trail ──────────────────────────────────────────────────── -->
	<section class="panel span2">
		<div class="panel-hdr">
			<span class="panel-title"><Icon name="activity" class="w-4 h-4" /> RL Audit Trail</span>
			<span class="panel-sub">Live <code>context_timeline</code> events — feedback, citations, summaries, adapts, tool calls</span>
			<div style="display:flex;gap:0.4rem;margin-left:auto;align-items:center">
				<select
					class="ctrl-select"
					bind:value={tlEventType}
					title="Filter by event type"
				>
					<option value="">All events</option>
					<option value="feedback">feedback</option>
					<option value="citation">citation</option>
					<option value="summary">summary</option>
					<option value="rl_adapt">rl_adapt</option>
					<option value="tool_call">tool_call</option>
					<option value="research">research</option>
				</select>
				<select
					class="ctrl-select"
					bind:value={tlPipeline}
					title="Filter by pipeline"
				>
					<option value="">All pipelines</option>
					<option value="ace">ace</option>
					<option value="rag">rag</option>
					<option value="kag">kag</option>
					<option value="dag">dag</option>
					<option value="codebase">codebase</option>
				</select>
				<button class="btn-sm btn-ghost" disabled={tlLoading} onclick={() => fetch_timeline()}>
					<Icon name="refresh-cw" class="w-3 h-3" />
				</button>
			</div>
		</div>
		{#if tlError}
			<p class="err-inline"><Icon name="alert-triangle" class="w-3.5 h-3.5" /> {tlError}</p>
		{:else if tlLoading && tlEvents.length === 0}
			<p class="loading-note"><Icon name="loader" class="w-4 h-4 spin" /> Loading audit trail…</p>
		{:else if tlEvents.length === 0}
			<p class="empty-note"><Icon name="info" class="w-4 h-4" /> No events yet — interact with the system to generate RL signals.</p>
		{:else}
			<table class="data-table tl-table">
				<thead><tr>
					<th>Time</th><th>Event</th><th>Pipeline</th><th>Signal</th>
					<th class="r-cell">Reward</th><th class="r-cell">Weight after</th><th>Rebuild</th><th>Payload</th>
				</tr></thead>
				<tbody>
					{#each tlEvents as ev}
						{@const cfg = PIPELINE_CFG[ev.pipeline]}
						{@const reward = ev.grpoReward}
						<tr>
							<td class="tl-time">{new Date(ev.createdAt).toLocaleTimeString()}</td>
							<td><span class="tl-event-badge {ev.eventType}">{ev.eventType}</span></td>
							<td><span class="pipeline-badge {ev.pipeline}" style="color:{cfg?.color ?? '#9ca3af'}">{ev.pipeline}</span></td>
							<td class="muted">{ev.signal ?? '—'}</td>
							<td class="r-cell" style="color:{reward != null ? (reward >= 0 ? '#4ade80' : '#f87171') : '#6b7280'}">
								{reward != null ? (reward >= 0 ? '+' : '') + reward.toFixed(3) : '—'}
							</td>
							<td class="r-cell muted">{ev.pipelineWeightAfter != null ? ev.pipelineWeightAfter.toFixed(3) : '—'}</td>
							<td class="r-cell">{ev.triggeredRebuild ? '✓' : ''}</td>
							<td class="tl-payload muted">
								{#if ev.payload && Object.keys(ev.payload).length}
									{Object.entries(ev.payload).slice(0, 3).map(([k,v]) => `${k}:${typeof v === 'number' ? (v as number).toFixed(2) : String(v).slice(0,20)}`).join(' · ')}
								{:else}—{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if tlNextCursor}
				<div style="text-align:center;margin-top:0.75rem">
					<button class="btn-sm btn-ghost" disabled={tlLoading} onclick={() => fetch_timeline(tlNextCursor ?? undefined)}>
						{tlLoading ? 'Loading…' : 'Load more'}
					</button>
				</div>
			{/if}
		{/if}
	</section>

	<!-- ── Agent Test ───────────────────────────────────────────────────────── -->
	<section class="panel span2">
		<div class="panel-hdr">
			<span class="panel-title"><Icon name="bot" class="w-4 h-4" /> Gemma4 Agent Test</span>
			<span class="panel-sub">rag_search · case_search · memory_recall · hyperedge_stats — max 5 tool rounds</span>
		</div>
		<div class="input-row" style="margin-bottom:0.6rem">
			<input
				class="text-input"
				style="flex:1;width:auto"
				placeholder="Ask the agent a legal research question…"
				bind:value={agentQuery}
				disabled={agentRunning}
				onkeydown={(e) => { if (e.key === 'Enter') void run_agent(); }}
			/>
			<button class="btn-sm primary" onclick={run_agent} disabled={agentRunning || !agentQuery.trim()}>
				{agentRunning ? 'Running…' : 'Run Agent'}
			</button>
		</div>
		{#if agentError}
			<p class="err-inline"><Icon name="alert-triangle" class="w-3.5 h-3.5" /> {agentError}</p>
		{/if}
		{#if agentResult}
			<div class="agent-result">
				<div class="agent-meta">
					<span class="agent-badge">Tools: {agentResult.toolsUsed.join(', ') || 'none'}</span>
					<span class="agent-badge">Rounds: {agentResult.rounds}</span>
					<span class="agent-badge">{agentResult.durationMs}ms</span>
				</div>
				<p class="agent-answer">{agentResult.answer}</p>
			</div>
		{/if}
	</section>

	<!-- ── Glyph Atlas & Density ────────────────────────────────────────── -->
	<section class="panel span2">
		<div class="panel-hdr">
			<span class="panel-title"><Icon name="cpu" class="w-4 h-4" /> NES Glyph Density & Topology</span>
			<span class="panel-sub">Visual clustering of 10M-density codebase chunks via On-Disk HNSW.</span>
		</div>
		<div class="atlas-container" style="min-height: 400px; max-height: 800px; overflow-y: auto;">
			<GlyphAtlasViewer manifest={atlasManifest} atlasBase64={atlasBase64} />
		</div>
	</section>

	<!-- ── Neo4j Triple Viewer ─────────────────────────────────────────── -->
	<section class="panel span2">
		<div class="panel-hdr">
			<span class="panel-title"><Icon name="network" class="w-4 h-4" /> Neo4j Knowledge Triples</span>
			<span class="panel-sub">Raw relational triples extracted from the latest synthesis run.</span>
			<div class="hdr-actions" style="margin-left: auto; display: flex; gap: 0.5rem;">
				<input
					type="text"
					class="ctrl-select"
					placeholder="Filter triples..."
					bind:value={tripleFilter}
					style="width: 150px;"
				/>
				<button
					class="btn-sm btn-ghost"
					style="color: #f87171;"
					onclick={async () => {
						if (confirm('Prune all triples with confidence < 50%?')) {
							const res = await fetch('/api/analytics/knowledge-triples/prune', {
								method: 'POST',
								body: JSON.stringify({ threshold: 0.5 })
							});
							if (res.ok) void loadTriples();
						}
					}}
				>
					<Icon name="trash-2" class="w-3.5 h-3.5" /> Prune &lt; 50%
				</button>
			</div>
		</div>
		<div class="triples-browser" style="max-height: 500px; overflow-y: auto;">
			{#if triplesLoading && triples.length === 0}
				<p class="loading-note"><Icon name="loader" class="w-4 h-4 spin" /> Loading triples…</p>
			{:else if filteredTriples.length === 0}
				<p class="empty-note">No matching triples found.</p>
			{:else}
				<table class="data-table">
					<thead>
						<tr>
							<th>Source</th>
							<th>Relation</th>
							<th>Target</th>
							<th>Conf</th>
							<th>Origin</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredTriples as t}
							<tr>
								<td>
									<div class="triple-entity">
										<span class="entity-kind">{t.source.kind}</span>
										<span class="entity-label" title={t.source.id}>{t.source.label}</span>
									</div>
								</td>
								<td class="triple-relation">{t.relation}</td>
								<td>
									<div class="triple-entity">
										<span class="entity-label" title={t.target.id}>{t.target.id.split('/').pop()}</span>
									</div>
								</td>
								<td class="r-cell">{(t.confidence * 100).toFixed(0)}%</td>
								<td class="muted">{t.metadata.source}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	</section>

</div>
{/if}

<!-- ═══════════════════════════ INDEX ORCHESTRATOR ═══════════════════════ -->
{#if activeSection === 'index'}
<div class="si-grid">

	<!-- Status + Controls -->
	<section class="panel span2">
		<h3>Codebase Index Orchestrator</h3>
		<p class="sub">Unified pipeline: AST scan, embed, cluster, SOM, Neo4j, PageRank, summaries, tags, wiki, 4D hypergraph</p>

		<div class="idx-controls">
			<div class="idx-presets">
				<button class="btn-sm" class:active={idxPreset === 'sync'} onclick={() => idxPreset = 'sync'}>Sync Core</button>
				<button class="btn-sm" class:active={idxPreset === 'quick'} onclick={() => idxPreset = 'quick'}>Quick (lib)</button>
				<button class="btn-sm" class:active={idxPreset === 'topology'} onclick={() => idxPreset = 'topology'}>Topology</button>
				<button class="btn-sm" class:active={idxPreset === 'full'} onclick={() => idxPreset = 'full'}>Full Graph</button>
				<button class="btn-sm" class:active={idxPreset === 'custom'} onclick={() => idxPreset = 'custom'}>Custom</button>
			</div>

			<div class="idx-actions">
				<button class="btn-sm primary" disabled={idxRunning} onclick={() => { idxResume = false; void runIdxPipeline(); }}>
					{idxRunning ? `Running… ${idxElapsed}` : `Run ${IDX_PRESET_LABELS[idxPreset]}`}
				</button>
				{#if idxRunId && !idxRunning}
				<button class="btn-sm btn-resume" onclick={() => { idxResume = true; void runIdxPipeline(); }}
					title="Resume run {idxRunId} — skip cached stages">
					Resume {idxRunId}
				</button>
				{/if}
				<button class="btn-sm btn-ghost" disabled={idxStatusLoading} onclick={loadIdxStatus}>
					<Icon name="refresh-cw" class="w-3 h-3" /> Status
				</button>
			</div>
		</div>

		{#if idxError}
			<div class="idx-error">{idxError}</div>
		{/if}

		<!-- Preset details -->
		<div class="idx-preset-info">
			<span>action: <b>{IDX_PRESET_LABELS[idxPreset]}</b></span>
			{#if idxRunning}<span>elapsed: <b>{idxElapsed}</b></span>{/if}
			{#if idxRunId}<span>run: <b>{idxRunId}</b></span>{/if}
			<span>scope: <b>{idxPresetConfig.scope}</b></span>
			<span>k: <b>{idxPresetConfig.clusterCount}</b></span>
			{#if idxPresetConfig.gpuTag}<span class="idx-flag on">tags</span>{/if}
			{#if idxPresetConfig.summarize}<span class="idx-flag on">summaries</span>{/if}
			{#if idxPresetConfig.somTopology}<span class="idx-flag on">SOM</span>{/if}
			{#if idxPresetConfig.neo4jSync}<span class="idx-flag on">Neo4j</span>{/if}
			{#if idxPresetConfig.pageRank}<span class="idx-flag on">PageRank</span>{/if}
			{#if idxPresetConfig.exportWiki}<span class="idx-flag on">wiki</span>{/if}
			{#if idxPresetConfig.hypergraph}<span class="idx-flag on">4D</span>{/if}
			{#if idxPresetConfig.recompute}<span class="idx-flag warn">recompute</span>{/if}
		</div>
	</section>

	<!-- Collection Status -->
	{#if idxStatus}
	<section class="panel">
		<h4>Collection</h4>
		<div class="idx-stats">
			<div class="stat-row"><span>Points</span><span>{(idxStatus as Record<string, any>).collection?.points?.toLocaleString() ?? '–'}</span></div>
			<div class="stat-row"><span>Vectors</span><span>{(idxStatus as Record<string, any>).collection?.vectors?.toLocaleString() ?? '–'}</span></div>
			<div class="stat-row"><span>Status</span><span>{(idxStatus as Record<string, any>).collection?.status ?? '–'}</span></div>
			<div class="stat-row"><span>PG Mirror</span><span class:cuda-on={idxPgMirror.healthy}>{idxPgMirror.healthy ? 'Healthy' : idxPgMirror.exists === false ? 'Missing' : idxPgMirror.error ? 'Error' : 'Unknown'}</span></div>
			{#if idxPgMirror.missingColumns.length > 0}
				<div class="stat-row"><span>Missing Columns</span><span>{idxPgMirror.missingColumns.join(', ')}</span></div>
			{/if}
			{#if idxPgMirror.error}
				<div class="stat-row"><span>Mirror Error</span><span>{idxPgMirror.error}</span></div>
			{/if}
			<div class="stat-row"><span>Tag Coverage</span><span>{(idxStatus as Record<string, any>).tagCoverage?.pct ?? 0}%</span></div>
			<div class="stat-row"><span>CUDA</span><span class:cuda-on={(idxStatus as Record<string, any>).cuda}>{(idxStatus as Record<string, any>).cuda ? 'Available' : 'Unavailable'}</span></div>
		</div>
	</section>
	{/if}

	<!-- SSE Event Log -->
	{#if idxEvents.length > 0}
	{@const completeEv = idxEvents.find(e => e.event === 'complete')}
	{@const failedEv = idxEvents.find(e => e.event === 'failed')}
	{@const stagesDone = (completeEv?.data?.completedStages as string[] | undefined) ?? []}
	{@const stagesResumed = new Set((completeEv?.data?.resumedStages as string[] | undefined) ?? [])}
	{@const totalMs = completeEv?.data?.totalMs as number | undefined}
	<section class="panel span2">
		<h4>Pipeline Events ({idxEvents.length}){totalMs ? ` — ${(totalMs / 1000).toFixed(1)}s total` : ''}</h4>

		<!-- Completed stages summary -->
		{#if stagesDone.length > 0}
		<div class="idx-stages-bar">
			{#each stagesDone as stage}
				<span class="idx-stage-chip" class:done={!stagesResumed.has(stage)} class:cached={stagesResumed.has(stage)}>
					{stage}{stagesResumed.has(stage) ? ' (cached)' : ''}
				</span>
			{/each}
		</div>
		{/if}
		{#if failedEv}
		<div class="idx-error">{failedEv.data?.message ?? 'Pipeline failed'}</div>
		{/if}

		<!-- Final counts -->
		{#if completeEv?.data}
		<div class="idx-final-counts">
			{#if completeEv.data.cuda != null}<span>CUDA: <b>{completeEv.data.cuda ? 'Yes' : 'No'}</b></span>{/if}
			{#if idxFinalCounts.files != null}<span>Files: <b>{idxFinalCounts.files}</b></span>{/if}
			{#if idxFinalCounts.chunks != null}<span>Chunks: <b>{idxFinalCounts.chunks}</b></span>{/if}
			{#if idxFinalCounts.embeddings != null}<span>Embeddings: <b>{idxFinalCounts.embeddings}</b></span>{/if}
			{#if idxFinalCounts.stored != null}<span>Stored: <b>{idxFinalCounts.stored}</b></span>{/if}
			{#if idxFinalCounts.summaryClusters != null}<span>Summary Clusters: <b>{idxFinalCounts.summaryClusters}</b></span>{/if}
			{#if idxFinalCounts.tagged != null}<span>Tagged: <b>{idxFinalCounts.tagged}</b></span>{/if}
			{#if idxFinalCounts.processed != null}<span>Processed: <b>{idxFinalCounts.processed}</b></span>{/if}
		</div>
		{/if}

		<div class="idx-events">
			{#each idxEvents as ev}
				<div class="idx-ev" class:ev-done={ev.event.endsWith('_done') || ev.event === 'complete'}
					class:ev-fail={ev.event === 'failed' || ev.data?.step === 'failed'}
					class:ev-skip={ev.data?.step === 'skipped'}
					class:ev-cached={ev.data?.step === 'cached'}
					class:ev-start={ev.event.endsWith('_started') || ev.event === 'started'}>
					<span class="ev-name">{ev.event}</span>
					{#if ev.data?.stage}<span class="ev-stage">{ev.data.stage}</span>{/if}
					{#if ev.data?.totalMs}<span class="ev-ms">{ev.data.totalMs}ms</span>{/if}
					{#if ev.data?.durationMs}<span class="ev-ms">{ev.data.durationMs}ms</span>{/if}
					{#if ev.data?.filesProcessed}<span class="ev-detail">{ev.data.filesProcessed} files</span>{/if}
					{#if ev.data?.chunksProcessed}<span class="ev-detail">{ev.data.chunksProcessed} chunks</span>{/if}
					{#if ev.data?.embeddingsGenerated != null}<span class="ev-detail">{ev.data.embeddingsGenerated} embeds</span>{/if}
					{#if ev.data?.storedInQdrant != null}<span class="ev-detail">{ev.data.storedInQdrant} stored</span>{/if}
					{#if ev.data?.skippedExisting}<span class="ev-detail">{ev.data.skippedExisting} skipped</span>{/if}
					{#if ev.data?.k}<span class="ev-detail">k={ev.data.k}</span>{/if}
					{#if ev.data?.completedStages}<span class="ev-detail">{(ev.data.completedStages as string[]).join(', ')}</span>{/if}
					{#if ev.data?.cachedAt}<span class="ev-cached-at">cached</span>{/if}
					{#if ev.data?.reason}<span class="ev-reason">{ev.data.reason}</span>{/if}
					{#if ev.data?.error}<span class="ev-error">{ev.data.error}</span>{/if}
				</div>
			{/each}
		</div>
	</section>
	{/if}

</div>
{/if}

</div>

<style>
/* ── Root ──────────────────────────────────────────────────────────────── */
.si-page {
	padding: 2rem 2.5rem 4rem;
	max-width: 1440px;
	margin: 0 auto;
	color: #d4c7a3;
	font-family: 'JetBrains Mono', 'Cascadia Code', ui-monospace, monospace;
}

/* ── Header ────────────────────────────────────────────────────────────── */
.si-header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	margin-bottom: 1.5rem;
	gap: 1rem;
}
.header-right { display: flex; align-items: center; gap: 0.5rem; }
.eyebrow {
	display: flex; align-items: center; gap: 0.35rem;
	font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.12em;
	color: #60a5fa; opacity: 0.75; margin: 0 0 0.25rem;
}
h1 { font-size: 1.65rem; font-weight: 700; letter-spacing: -0.02em; color: #f0e8d0; margin: 0 0 0.3rem; }
.subtitle { font-size: 0.72rem; color: #6b7280; margin: 0; }

.status-chip {
	display: flex; align-items: center; gap: 0.35rem;
	font-size: 0.7rem; padding: 0.25rem 0.6rem; border-radius: 999px; border: 1px solid; white-space: nowrap;
}
.status-chip.ok      { border-color: #22c55e; color: #22c55e; }
.status-chip.loading { border-color: #6b7280; color: #6b7280; }

.btn-icon {
	width: 2rem; height: 2rem; display: flex; align-items: center; justify-content: center;
	border: 1px solid #2d2b24; border-radius: 5px; background: transparent; color: #6b7280; cursor: pointer;
}
.btn-icon:hover { border-color: #4ade80; color: #4ade80; }
.btn-icon.active { border-color: #4ade80; color: #4ade80; background: #4ade8018; }

.err-banner {
	display: flex; align-items: center; gap: 0.5rem;
	background: #7f1d1d22; border: 1px solid #7f1d1d; border-radius: 6px;
	padding: 0.5rem 0.9rem; color: #f87171; font-size: 0.75rem; margin-bottom: 1rem;
}

/* ── Controls ──────────────────────────────────────────────────────────── */
.controls-bar {
	display: flex; flex-wrap: wrap; align-items: flex-end; gap: 1.25rem;
	padding: 1rem 1.25rem; background: #13120f;
	border: 1px solid #2d2b24; border-radius: 8px; margin-bottom: 1.25rem;
}
.ctrl-group { display: flex; flex-direction: column; gap: 0.35rem; }
.ctrl-label {
	font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280;
	display: flex; align-items: center; gap: 0.35rem;
}
.ctrl-sub { opacity: 0.65; }
.val { color: #7c6ff7; font-size: 0.72rem; }
.sim-hint { color: #4b5563; font-size: 0.6rem; }

.btn-seg { display: flex; gap: 0.2rem; }
.seg-btn {
	padding: 0.25rem 0.55rem; font-size: 0.7rem; font-family: inherit;
	border: 1px solid #2d2b24; border-radius: 4px; background: transparent; color: #6b7280; cursor: pointer;
}
.seg-btn:hover { border-color: #7c6ff7; color: #7c6ff7; }
.seg-btn.active { background: #7c6ff718; border-color: #7c6ff7; color: #7c6ff7; font-weight: 600; }

.temp-group { min-width: 220px; }
.temp-slider { width: 100%; accent-color: #7c6ff7; cursor: pointer; margin: 0; }
.temp-labels { display: flex; justify-content: space-between; font-size: 0.6rem; color: #4b5563; }

.input-row { display: flex; gap: 0.3rem; }
.text-input {
	background: #0f0e0c; border: 1px solid #2d2b24; border-radius: 4px;
	padding: 0.3rem 0.5rem; font-size: 0.72rem; color: #d4c7a3; font-family: inherit; width: 170px;
}
.text-input:focus { outline: none; border-color: #7c6ff7; }

.btn-search {
	padding: 0.3rem 0.45rem; border: 1px solid #2d2b24; border-radius: 4px;
	background: transparent; color: #6b7280; cursor: pointer;
}
.btn-search:hover { border-color: #7c6ff7; color: #7c6ff7; }

.btn-refresh {
	display: flex; align-items: center; gap: 0.35rem; align-self: flex-end;
	padding: 0.3rem 0.75rem; border: 1px solid #374151; border-radius: 4px;
	background: transparent; color: #9ca3af; font-size: 0.72rem; font-family: inherit; cursor: pointer;
}
.btn-refresh:hover:not(:disabled) { border-color: #7c6ff7; color: #7c6ff7; }
.btn-refresh:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Stat strip ─────────────────────────────────────────────────────────── */
.stat-strip {
	display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem;
}
.stat-pill {
	display: flex; flex-direction: column; gap: 0.1rem;
	padding: 0.55rem 0.9rem; background: #13120f;
	border: 1px solid #2d2b24; border-radius: 6px; min-width: 100px;
}
.sp-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em; color: #4b5563; }
.sp-val   { font-size: 1.1rem; font-weight: 700; }

/* ── Section tabs ───────────────────────────────────────────────────────── */
.section-tabs {
	display: flex; gap: 0.15rem;
	border-bottom: 1px solid #2d2b24; margin-bottom: 1.25rem;
}
.s-tab {
	display: flex; align-items: center; gap: 0.3rem;
	padding: 0.45rem 0.9rem; font-size: 0.72rem; font-family: inherit;
	border: none; border-bottom: 2px solid transparent; background: transparent;
	color: #4b5563; cursor: pointer; margin-bottom: -1px;
}
.s-tab:hover { color: #9ca3af; }
.s-tab.active { color: #7c6ff7; border-bottom-color: #7c6ff7; }

/* ── Grid ───────────────────────────────────────────────────────────────── */
.si-grid {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 1rem;
}
.si-grid.wide { grid-template-columns: 1fr; }
.span2      { grid-column: span 2; }
.span-full  { grid-column: 1 / -1; }

@media (max-width: 860px) {
	.si-grid { grid-template-columns: 1fr; }
	.span2   { grid-column: span 1; }
}

/* ── Panel ──────────────────────────────────────────────────────────────── */
.panel {
	background: #13120f; border: 1px solid #2d2b24; border-radius: 8px;
	padding: 0.9rem 1rem; overflow: hidden;
}
.panel h2 {
	font-size: 0.78rem; font-weight: 600; color: #d4c7a3;
	display: flex; align-items: center; gap: 0.4rem; margin: 0 0 0.85rem; flex-wrap: wrap;
}
.h2-badge {
	font-size: 0.62rem; padding: 0.1rem 0.4rem; border-radius: 999px;
	background: #2d2b24; color: #9ca3af;
}
.h2-sub { font-size: 0.65rem; color: #4b5563; font-weight: 400; }
.empty { font-size: 0.75rem; color: #374151; padding: 1.5rem 0; text-align: center; }

.no-data {
	display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
	padding: 4rem; color: #374151; font-size: 0.8rem;
}

/* ── Data table ─────────────────────────────────────────────────────────── */
.data-table { width: 100%; border-collapse: collapse; font-size: 0.72rem; }
.data-table th {
	padding: 0.35rem 0.5rem; text-align: left; font-size: 0.62rem;
	text-transform: uppercase; letter-spacing: 0.08em; color: #4b5563;
	border-bottom: 1px solid #2d2b24;
}
.data-table td { padding: 0.35rem 0.5rem; border-bottom: 1px solid #1a1914; vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.data-table tr:hover td { background: #1a1914; }
.r-cell { text-align: right; white-space: nowrap; }
.q-cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
.q-cell.muted { color: #9ca3af; }
.mono { font-family: inherit; font-size: 0.7rem; color: #d4c7a3; }
.rank { color: #4b5563; font-size: 0.65rem; text-align: right; padding-right: 0.5rem; }
.sim-chip { font-size: 0.65rem; padding: 0.1rem 0.35rem; border-radius: 3px; font-weight: 600; }

/* ── Hot queries ────────────────────────────────────────────────────────── */
.query-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
.query-list li {
	display: grid; grid-template-columns: 1.5rem 56px 1fr auto auto;
	align-items: center; gap: 0.5rem; font-size: 0.72rem;
}
.qbar-wrap { height: 5px; background: #1a1914; border-radius: 2px; overflow: hidden; }
.qbar-fill { height: 100%; background: #7c6ff7; border-radius: 2px; }
.q-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #d4c7a3; }
.q-hits { color: #7c6ff7; font-weight: 600; white-space: nowrap; min-width: 2.5rem; text-align: right; }

/* ── Trending ───────────────────────────────────────────────────────────── */
.trending-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.45rem; }
.trending-list li { display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; gap: 0.5rem; }
.t-query { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.t-right { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
.t-growth { font-weight: 700; font-size: 0.8rem; }
.t-meta { color: #6b7280; }

/* ── Variance pairs ─────────────────────────────────────────────────────── */
/* (uses .data-table) */

/* ── Did You Mean ───────────────────────────────────────────────────────── */
.dym-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.dym-list li { display: flex; flex-direction: column; gap: 0.2rem; }
.dym-btn {
	background: #7c6ff718; border: 1px solid #7c6ff740; color: #a89cf5;
	padding: 0.3rem 0.6rem; border-radius: 5px; font-size: 0.78rem; cursor: pointer; text-align: left;
	font-family: inherit;
}
.dym-btn:hover { background: #7c6ff730; }
.dym-meta { font-size: 0.68rem; color: #6b7280; display: flex; align-items: center; gap: 0.4rem; }
.src-badge { font-size: 0.62rem; padding: 0.05rem 0.3rem; border-radius: 3px; }
.src-badge.src-redis { background: #dc262640; color: #fca5a5; }
.src-badge.src-pg    { background: #2563eb40; color: #93c5fd; }

/* ── Pipeline memory ────────────────────────────────────────────────────── */
.pipeline-list { display: flex; flex-direction: column; gap: 0.85rem; }
.pip-row { display: flex; flex-direction: column; gap: 0.25rem; }
.pip-head { display: flex; align-items: center; gap: 0.4rem; }
.pip-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.pip-name { font-size: 0.75rem; font-weight: 600; flex: 1; }
.pip-score{ font-size: 0.68rem; font-weight: 600; }
.pip-hits { font-size: 0.68rem; color: #6b7280; }
.pip-bar-bg { height: 6px; background: #1a1914; border-radius: 3px; overflow: hidden; }
.pip-bar-fill { height: 100%; border-radius: 3px; min-width: 4px; }
.pip-meta { display: flex; gap: 0.75rem; font-size: 0.62rem; color: #4b5563; }
.top-chunk { display: flex; align-items: center; gap: 0.2rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Champions ──────────────────────────────────────────────────────────── */
.champ-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.65rem; }
.champ-list li { padding-bottom: 0.65rem; border-bottom: 1px solid #1a1914; }
.champ-list li:last-child { border-bottom: none; padding-bottom: 0; }
.champ-path { font-size: 0.72rem; color: #d4c7a3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 0.25rem; }
.champ-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; font-size: 0.68rem; color: #6b7280; }
.champ-hits { color: #9ca3af; }
.pip-count-badge { font-size: 0.65rem; font-weight: 700; color: #f59e0b; background: #f59e0b20; padding: 0.1rem 0.35rem; border-radius: 3px; }
.pipe-tags { display: flex; flex-wrap: wrap; gap: 0.2rem; }
.pipe-tags.sm .pipe-tag { font-size: 0.55rem; }
.pipe-tag { font-size: 0.6rem; padding: 0.05rem 0.25rem; border: 1px solid; border-radius: 3px; }

/* ── Cluster heatmap ────────────────────────────────────────────────────── */
.cluster-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
.cluster-list li {
	display: grid; grid-template-columns: 20px 36px 1fr 46px 36px 52px;
	align-items: center; gap: 0.4rem; font-size: 0.72rem;
}
.c-expand-btn {
	background: none; border: none; padding: 0; cursor: pointer; color: #6b7280;
	display: flex; align-items: center; justify-content: center;
}
.c-expand-btn:hover { color: #f59e0b; }
.c-id    { color: #f59e0b; font-weight: 600; font-size: 0.68rem; }
.c-bar-bg { height: 5px; background: #1a1914; border-radius: 2px; overflow: hidden; }
.c-bar-fill { height: 100%; background: #f59e0b; border-radius: 2px; }
.c-hits  { text-align: right; }
.c-q     { text-align: right; }
.c-score { text-align: right; font-weight: 600; font-size: 0.68rem; }
.muted   { color: #6b7280; }

/* ── Cluster narrative ──────────────────────────────────────────────────── */
.cluster-narrative {
	display: block; grid-column: 1 / -1;
	background: #1a1914; border-radius: 6px; padding: 0.7rem 0.85rem;
	font-size: 0.72rem; line-height: 1.5; margin: 0.15rem 0 0.3rem;
}
.narr-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.4rem; }
.narr-header strong { color: #f5f5dc; font-size: 0.78rem; }
.btn-regen {
	display: inline-flex; align-items: center; gap: 0.3rem;
	background: none; border: 1px solid #333; border-radius: 4px;
	padding: 0.15rem 0.5rem; color: #9ca3af; font-size: 0.65rem; cursor: pointer;
}
.btn-regen:hover { border-color: #f59e0b; color: #f59e0b; }
.narr-summary { color: #d1d5db; margin-bottom: 0.5rem; }
.narr-section { margin-bottom: 0.4rem; }
.narr-label { display: block; color: #9ca3af; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.15rem; }
.narr-list { list-style: disc; padding-left: 1.2rem; margin: 0; color: #d1d5db; }
.narr-list li { margin-bottom: 0.1rem; }
.narr-list.mono li { font-family: monospace; font-size: 0.68rem; color: #a78bfa; }
.narr-list.warn li { color: #f59e0b; }
.narr-footer { font-size: 0.62rem; margin-top: 0.3rem; }
.error-text { color: #ef4444; }

/* ── Chunk quality ──────────────────────────────────────────────────────── */
.qs-bar-wrap { display: flex; align-items: center; gap: 0.4rem; justify-content: flex-end; }
.qs-bar { height: 4px; border-radius: 2px; min-width: 2px; max-width: 60px; }
.qs-val { font-size: 0.68rem; color: #9ca3af; min-width: 2.8rem; text-align: right; }

/* ── QLoRA tiers ────────────────────────────────────────────────────────── */
.tier-list { display: flex; flex-direction: column; gap: 0.7rem; margin-bottom: 0.85rem; }
.tier-row { display: grid; grid-template-columns: 90px 1fr auto; align-items: center; gap: 0.6rem; }
.tier-label { display: flex; align-items: center; gap: 0.35rem; }
.tier-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.tier-name { font-size: 0.75rem; }
.tier-bar-bg { height: 8px; background: #1a1914; border-radius: 4px; overflow: hidden; }
.tier-bar-fill { height: 100%; border-radius: 4px; min-width: 2px; }
.tier-stats { display: flex; flex-direction: column; align-items: flex-end; gap: 0.05rem; min-width: 76px; }
.tier-cnt   { font-size: 0.75rem; font-weight: 600; }
.tier-pct   { font-size: 0.6rem; }
.tier-score { font-size: 0.65rem; font-weight: 600; }
.stacked-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; gap: 1px; }
.stack-seg   { height: 100%; min-width: 2px; }

/* ── Distillation runner ────────────────────────────────────────────────── */
.distill-desc {
	font-size: 0.7rem; color: #6b7280; line-height: 1.6; margin: 0 0 1rem;
}
.distill-desc code {
	background: #1a1914; border: 1px solid #2d2b24; border-radius: 3px;
	padding: 0.1rem 0.3rem; font-family: inherit; color: #7c6ff7; font-size: 0.68rem;
}
.distill-fields { display: flex; gap: 1rem; margin-bottom: 0.85rem; flex-wrap: wrap; }
.field { display: flex; flex-direction: column; gap: 0.3rem; }
.field span { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; }
.num-input {
	width: 80px; background: #0f0e0c; border: 1px solid #2d2b24; border-radius: 4px;
	padding: 0.3rem 0.5rem; font-family: inherit; font-size: 0.75rem; color: #d4c7a3;
}
.num-input:focus { outline: none; border-color: #7c6ff7; }
.distill-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
.btn-distill {
	display: flex; align-items: center; gap: 0.3rem;
	padding: 0.3rem 0.7rem; border-radius: 4px; font-size: 0.72rem;
	font-family: inherit; cursor: pointer; border: 1px solid;
}
.btn-distill:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-distill.dry { border-color: #374151; background: transparent; color: #9ca3af; }
.btn-distill.run { border-color: #16a34a; background: #16a34a18; color: #4ade80; }
.btn-distill.run:hover:not(:disabled) { background: #16a34a30; }
.btn-distill.export { border-color: #7c6ff7; background: #7c6ff718; color: #a89ff7; text-decoration: none; }
.btn-distill.export:hover { background: #7c6ff730; }
.distill-result {
	display: flex; gap: 0.75rem; flex-wrap: wrap;
	padding: 0.45rem 0.7rem; background: #1a1914; border-radius: 4px; font-size: 0.7rem;
}
.dr-item { display: flex; align-items: center; gap: 0.25rem; color: #9ca3af; }
.dr-item.ok   { color: #4ade80; }
.dr-item.warn { color: #f59e0b; }
.distill-err {
	font-size: 0.7rem; color: #f87171; padding: 0.4rem 0.7rem;
	background: #7f1d1d18; border: 1px solid #7f1d1d40; border-radius: 4px;
}

/* ── DYM enhanced ───────────────────────────────────────────────────────── */
.dym-top { display: flex; align-items: center; gap: 0.4rem; }
.dym-bottom { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; margin-top: 0.2rem; }
.src-badge.src-qlora { background: #7c6ff740; color: #a89cf5; }
.tier-badge {
	font-size: 0.58rem; padding: 0.05rem 0.3rem; border-radius: 3px;
	font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
}
.tier-badge.tier-gold   { background: #f59e0b30; color: #f59e0b; border: 1px solid #f59e0b40; }
.tier-badge.tier-silver { background: #9ca3af30; color: #9ca3af; border: 1px solid #9ca3af40; }
.tier-badge.tier-bronze { background: #b4530930; color: #b45309; border: 1px solid #b4530940; }

/* ── Checkpoint validator ───────────────────────────────────────────────── */
.ckpt-fields { display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end; margin-bottom: 0.85rem; }
.ckpt-verdict {
	display: flex; flex-direction: column; gap: 0.5rem;
	padding: 0.75rem 1rem; border: 1px solid; border-radius: 6px; margin-bottom: 0.5rem;
}
.ckpt-badge {
	display: inline-flex; align-items: center;
	font-size: 0.72rem; font-weight: 700; letter-spacing: 0.1em;
	border: 1px solid; border-radius: 4px; padding: 0.2rem 0.6rem; align-self: flex-start;
}
.ckpt-scores {
	display: flex; align-items: center; gap: 0.75rem; font-size: 0.78rem; flex-wrap: wrap;
}
.ckpt-delta { font-weight: 700; font-size: 0.9rem; }
.ckpt-meta  { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }

/* ── Prompt leaderboard ─────────────────────────────────────────────────── */
.leader-controls {
	display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.85rem;
}
.leader-select {
	background: #0f0e0c; border: 1px solid #2d2b24; border-radius: 4px;
	padding: 0.25rem 0.5rem; font-family: inherit; font-size: 0.72rem; color: #d4c7a3;
	margin-left: 0.35rem;
}
.leader-select:focus { outline: none; border-color: #7c6ff7; }
.btn-leader-refresh {
	display: flex; align-items: center; gap: 0.3rem;
	padding: 0.25rem 0.6rem; border: 1px solid #374151; border-radius: 4px;
	background: transparent; color: #9ca3af; font-size: 0.72rem; font-family: inherit; cursor: pointer;
}
.btn-leader-refresh:hover:not(:disabled) { border-color: #f59e0b; color: #f59e0b; }
.btn-leader-refresh:disabled { opacity: 0.4; cursor: not-allowed; }
.leader-src-badge {
	font-size: 0.62rem; padding: 0.08rem 0.35rem; border-radius: 3px;
	background: #7c6ff718; border: 1px solid #7c6ff740; color: #a89cf5;
}
.leader-clicks {
	font-weight: 700; color: #f59e0b; font-size: 0.8rem;
}

/* ── Feedback legend ────────────────────────────────────────────────────── */
.feedback-legend { display: flex; flex-direction: column; gap: 0.75rem; }
.fl-row { display: flex; align-items: flex-start; gap: 0.75rem; }
.fl-icon { font-size: 1.25rem; flex-shrink: 0; width: 1.75rem; text-align: center; line-height: 1.3; }
.fl-icon.neutral { font-size: 1rem; color: #6b7280; }
.fl-text { display: flex; flex-direction: column; gap: 0.2rem; }
.fl-title { font-size: 0.72rem; font-weight: 600; color: #d4c7a3; }
.fl-desc { font-size: 0.67rem; color: #6b7280; line-height: 1.5; }
.fl-desc code {
	background: #1a1914; border: 1px solid #2d2b24; border-radius: 3px;
	padding: 0.05rem 0.25rem; font-family: inherit; color: #7c6ff7; font-size: 0.62rem;
}

/* ── Animations ─────────────────────────────────────────────────────────── */
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.7s linear infinite; display: inline-block; }

/* ── Research panel ────────────────────────────────────────────────────── */
.research-controls {
	display: flex; align-items: flex-end; gap: 0.75rem; flex-wrap: wrap;
}
.ctrl-group { display: flex; flex-direction: column; gap: 0.25rem; }
.ctrl-label { font-size: 0.65rem; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }
.ctrl-select, .ctrl-input {
	background: #181818; border: 1px solid #333; color: #ccc;
	padding: 0.3rem 0.5rem; border-radius: 4px; font-size: 0.75rem;
}
.ctrl-input { min-width: 240px; }
.cache-hint { font-size: 0.65rem; color: #555; margin-top: 0.5rem; }

.signal-row { display: flex; flex-wrap: wrap; gap: 1.25rem; }
.signal-group { display: flex; flex-direction: column; gap: 0.4rem; flex: 1; min-width: 180px; }
.signal-label { font-size: 0.65rem; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }
.signal-list { margin: 0; padding-left: 1rem; list-style: disc; }
.signal-list li { font-size: 0.75rem; color: #aaa; margin-bottom: 0.2rem; }
.tag-cloud { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.hot-tag { background: #f59e0b18; border-color: #f59e0b40; color: #f59e0b; }

.research-card { cursor: pointer; transition: border-color 0.15s; }
.research-card:hover { border-color: #7c6ff740; }
.research-card.expanded { border-color: #7c6ff7; }

.rc-header { padding: 0; }
.rc-meta { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.4rem; flex-wrap: wrap; }
.rc-conf { font-size: 0.7rem; color: #a89cf5; font-weight: 600; }
.feedback-inline { display: flex; align-items: center; gap: 0.2rem; font-size: 0.65rem; color: #666; margin-left: auto; }
.rc-query { font-size: 0.8rem; color: #e0e0e0; line-height: 1.4; margin: 0 0 0.35rem; }
.rc-tags { display: flex; flex-wrap: wrap; gap: 0.3rem; }

.rc-detail { border-top: 1px solid #2a2a2a; padding-top: 0.75rem; margin-top: 0.75rem; }
.rc-graph-summary { font-size: 0.72rem; color: #aaa; margin-bottom: 0.6rem; }
.rc-chain h4 { font-size: 0.7rem; color: #7c6ff7; margin: 0 0 0.4rem; display: flex; align-items: center; gap: 0.3rem; }
.chain-list { margin: 0; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 0.4rem; }
.chain-step { display: flex; gap: 0.5rem; align-items: flex-start; }
.step-num {
	flex-shrink: 0; width: 1.2rem; height: 1.2rem; border-radius: 50%;
	background: #7c6ff720; border: 1px solid #7c6ff750;
	font-size: 0.6rem; color: #7c6ff7; display: flex; align-items: center; justify-content: center;
	font-weight: 700; margin-top: 0.1rem;
}
.step-text { font-size: 0.75rem; color: #ccc; line-height: 1.4; }

/* ── Assist Debug Panel ──────────────────────────────────────────────── */
.ad-input-row {
	display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem;
}
.ad-query {
	flex: 1; min-width: 240px; height: 2rem; padding: 0 0.75rem;
	font-size: 0.78rem; font-family: inherit;
	background: #0f0e0c; border: 1px solid #2d2b24; border-radius: 5px;
	color: #d4c7a3; outline: none;
}
.ad-query:focus { border-color: #a78bfa; }
.ad-query::placeholder { color: #6b7280; }
.ad-btn {
	height: 2rem; padding: 0 1rem; font-size: 0.75rem; font-weight: 600;
	background: #a78bfa18; border: 1px solid #a78bfa44; color: #a78bfa;
	border-radius: 5px; cursor: pointer; transition: background 0.15s;
}
.ad-btn:hover:not(:disabled) { background: #a78bfa28; }
.ad-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ad-error {
	font-size: 0.72rem; color: #f87171; padding: 0.4rem 0.6rem;
	background: #f871710d; border: 1px solid #f8717122; border-radius: 5px;
	margin-bottom: 0.6rem;
}
.ad-cards {
	display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.5rem;
	margin-bottom: 0.75rem;
}
.ad-card {
	padding: 0.5rem 0.6rem; background: #13120f;
	border: 1px solid #2d2b24; border-radius: 5px;
	display: flex; flex-direction: column; gap: 0.15rem;
}
.ad-label { font-size: 0.62rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
.ad-value { font-size: 0.85rem; font-weight: 700; color: #d4c7a3; }
.ad-value.hit  { color: #4ade80; }
.ad-value.miss { color: #f59e0b; }
.ad-trace {
	display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem;
	padding: 0.4rem 0.6rem; border-radius: 6px;
	background: #13121080; border: 1px solid #2a2760;
	font-size: 0.68rem; margin-bottom: 0.6rem;
}
.ad-trace-hdr {
	display: flex; align-items: center; gap: 0.25rem;
	font-weight: 600; color: #a78bfa; white-space: nowrap;
}
.ad-trace-badge {
	padding: 0.1rem 0.45rem; border-radius: 4px; font-weight: 700;
	font-size: 0.62rem; letter-spacing: 0.05em;
}
.ad-trace-badge.hit  { background: #14532d; color: #86efac; }
.ad-trace-badge.miss { background: #1c1917; color: #78716c; }
.ad-trace-class { color: #60a5fa; font-family: 'JetBrains Mono', monospace; }
.ad-trace-stat  { color: #d4c7a3; }
.ad-trace-hash  {
	margin-left: auto; color: #4b5563;
	font-family: 'JetBrains Mono', monospace; font-size: 0.6rem;
}
.ad-timing {
	display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;
	font-size: 0.7rem; color: #9ca3af; margin-bottom: 0.6rem;
}
.ad-timing h4 { margin: 0; font-size: 0.7rem; color: #d4c7a3; }
.ad-timing-item { padding: 0.15rem 0.5rem; background: #1a1914; border-radius: 4px; }
.ad-details {
	margin-bottom: 0.5rem;
}
.ad-details summary {
	font-size: 0.72rem; color: #a78bfa; cursor: pointer; user-select: none;
}
.ad-pre {
	font-size: 0.68rem; color: #d4c7a3; background: #0f0e0c;
	padding: 0.5rem; border-radius: 5px; border: 1px solid #2d2b24;
	overflow-x: auto; max-height: 300px; white-space: pre-wrap; word-break: break-all;
}
.ad-cache-key {
	display: flex; align-items: center; gap: 0.3rem;
	font-size: 0.62rem; color: #6b7280; font-family: 'JetBrains Mono', monospace;
	margin-top: 0.3rem;
}

/* ── Feedback Widget ─────────────────────────────────────────────────── */
.fb-row {
	display: flex; align-items: center; gap: 0.5rem;
	margin-top: 0.6rem; padding: 0.4rem 0.5rem;
	background: #13120f; border: 1px solid #2d2b24; border-radius: 5px;
}
.fb-label { font-size: 0.72rem; color: #9ca3af; }
.fb-btn {
	display: inline-flex; align-items: center; gap: 0.25rem;
	padding: 0.25rem 0.6rem; border-radius: 4px; border: 1px solid #3f3e36;
	background: transparent; color: #d4c7a3; font-size: 0.72rem; cursor: pointer;
	transition: background 0.15s, border-color 0.15s;
}
.fb-btn:hover:not(:disabled) { background: #1e1d18; border-color: #a78bfa; }
.fb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.fb-up:hover:not(:disabled) { border-color: #4ade80; color: #4ade80; }
.fb-down:hover:not(:disabled) { border-color: #f87171; color: #f87171; }
.fb-thanks { font-size: 0.72rem; color: #4ade80; }
.fb-stats-btn {
	display: inline-flex; align-items: center; gap: 0.2rem;
	padding: 0.2rem 0.5rem; border-radius: 4px; border: 1px solid #2d2b24;
	background: transparent; color: #6b7280; font-size: 0.65rem; cursor: pointer;
}
.fb-stats-btn:hover { color: #a78bfa; border-color: #a78bfa; }
.fb-stats {
	display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;
	margin-top: 0.4rem; padding: 0.35rem 0.5rem;
	background: #0d0c0a; border: 1px solid #2d2b24; border-radius: 5px;
	font-size: 0.68rem; color: #9ca3af;
}
.fb-stat strong { color: #d4c7a3; }
.fb-pct { font-weight: 700; }
.fb-pct.fb-good { color: #4ade80; }
.fb-pct.fb-warn { color: #f59e0b; }
.fb-pct.fb-low  { color: #f87171; }

/* ── Feedback Analysis Panel ─────────────────────────────────────────── */
.fa-toolbar { margin-bottom: 0.6rem; }
.fa-section { margin-top: 0.75rem; }
.fa-heading {
	font-size: 0.68rem; font-weight: 700; color: #9ca3af;
	text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.35rem;
}
.fa-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.fa-pill {
	padding: 0.2rem 0.55rem; border-radius: 4px;
	background: #13120f; border: 1px solid #2d2b24;
	font-size: 0.68rem; color: #d4c7a3;
}
.fa-domain-grid { display: flex; flex-direction: column; gap: 0.3rem; }
.fa-domain-row { display: flex; align-items: center; gap: 0.5rem; }
.fa-domain-name {
	width: 8rem; font-size: 0.68rem; color: #9ca3af;
	overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fa-bar-track {
	flex: 1; height: 6px; background: #1e1d18; border-radius: 3px; overflow: hidden;
}
.fa-bar-fill {
	height: 100%; border-radius: 3px; transition: width 0.3s;
}
.fa-bar-fill.fb-good { background: #4ade80; }
.fa-bar-fill.fb-warn { background: #f59e0b; }
.fa-bar-fill.fb-low  { background: #f87171; }
.fa-domain-pct { font-size: 0.62rem; color: #6b7280; min-width: 5rem; }
.fa-table-wrap { overflow-x: auto; margin-top: 0.4rem; }
.fa-table {
	width: 100%; border-collapse: collapse; font-size: 0.65rem;
}
.fa-table th {
	text-align: left; padding: 0.3rem 0.5rem; color: #6b7280;
	border-bottom: 1px solid #2d2b24; font-weight: 600;
}
.fa-table td { padding: 0.3rem 0.5rem; border-bottom: 1px solid #1e1d18; color: #d4c7a3; }
.fa-cell-sm { max-width: 10rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fa-recs { margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.35rem; }
.fa-rec {
	display: flex; align-items: flex-start; gap: 0.5rem;
	padding: 0.4rem 0.6rem; border-radius: 5px;
	border-left: 3px solid #4d4a3d; background: #1a1914; color: #d4c7a3; font-size: 0.82rem;
}
.fa-rec-high { border-left-color: #22c55e; }
.fa-rec-medium { border-left-color: #f59e0b; }
.fa-rec-low { border-left-color: #6b7280; }
.fa-rec-text { flex: 1; line-height: 1.35; }
.fa-rec-conf {
	font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em;
	padding: 0.1rem 0.35rem; border-radius: 3px; background: #2d2b24; color: #9ca3af; white-space: nowrap;
}
.fa-apply-panel {
	margin-top: 0.75rem; padding: 0.6rem; border: 1px solid #2d2b24;
	border-radius: 6px; background: #13120f;
}
.fa-apply-grid { display: flex; flex-direction: column; gap: 0.3rem; margin: 0.4rem 0; }
.fa-apply-row {
	display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem;
	padding: 0.25rem 0.4rem; border-radius: 4px; background: #1a1914;
}
.fa-apply-label { flex: 1; color: #d4c7a3; font-weight: 600; }
.fa-apply-current { color: #6b7280; font-size: 0.75rem; }
.fa-apply-arrow { color: #4ade80; font-weight: bold; }
.fa-apply-suggested { color: #f59e0b; font-weight: 600; }
.fa-apply-actions { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.4rem; }
.fa-apply-msg { font-size: 0.75rem; color: #4ade80; }
.fa-apply-meta { font-size: 0.7rem; color: #6b7280; margin-top: 0.3rem; }

/* ── Defaults Impact Panel ──────────────────────────────────────────── */
.fa-impact-panel { background: #13120f; border: 1px solid #2d2b24; border-radius: 6px; padding: 0.6rem 0.7rem; margin-top: 0.5rem; }
.fa-impact-meta { font-size: 0.7rem; color: #9ca3af; margin-bottom: 0.4rem; }
.fa-impact-grid { display: flex; gap: 0.6rem; align-items: center; }
.fa-impact-col { display: flex; flex-direction: column; gap: 0.15rem; }
.fa-impact-arrow-col { font-size: 1.1rem; color: #6b7280; padding: 0 0.2rem; }
.fa-impact-label { font-size: 0.65rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
.fa-impact-val { font-size: 0.8rem; color: #d4d0c8; }
.fa-impact-delta { font-size: 0.8rem; font-weight: 600; }
.fa-delta-pos { color: #4ade80; }
.fa-delta-neg { color: #f87171; }
.fa-impact-defaults { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; margin-top: 0.35rem; }
.fa-impact-def-label { font-size: 0.7rem; color: #6b7280; }
.fa-impact-actions { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px solid #1f1e1a; }
.fa-revert-btn { border-color: #f87171 !important; color: #f87171 !important; }
.fa-revert-btn:hover:not(:disabled) { background: rgba(248, 113, 113, 0.1) !important; }
.fa-window-select { background: #1a1914; border: 1px solid #2d2b24; border-radius: 4px; color: #d4d0c8; font-size: 0.75rem; padding: 0.25rem 0.4rem; }
.fa-impact-domain-section { margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px solid #1f1e1a; }
.fa-impact-domain-grid { display: flex; flex-direction: column; gap: 0.2rem; margin-top: 0.25rem; }
.fa-impact-domain-row { display: flex; gap: 0.5rem; align-items: center; font-size: 0.75rem; }
.fa-impact-counts { color: #6b7280; font-size: 0.65rem; }

/* ── Tag Backfill Panel ──────────────────────────────────────────────── */
.tb-status-bar {
	display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;
	margin-bottom: 0.75rem; padding: 0.5rem 0.6rem;
	background: #13120f; border: 1px solid #2d2b24; border-radius: 5px;
}
.tb-stat { display: flex; flex-direction: column; gap: 0.1rem; }
.tb-stat-label { font-size: 0.6rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
.tb-stat-value { font-size: 0.85rem; font-weight: 700; color: #d4c7a3; }
.tb-stat-value.tb-good { color: #4ade80; }
.tb-stat-value.tb-warn { color: #f59e0b; }
.tb-stat-value.tb-low  { color: #f87171; }
.tb-dist {
	display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.75rem;
}
.tb-tag {
	font-size: 0.65rem; padding: 0.15rem 0.45rem; border-radius: 4px;
	background: #1a1914; border: 1px solid #2d2b24; color: #9ca3af;
}
.tb-tag strong { color: #4ade80; margin-left: 0.2rem; }
.tb-controls {
	display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;
}
.tb-progress { margin-top: 0.5rem; }
.chain-hint { font-size: 0.7rem; font-style: italic; margin: 0.3rem 0; }
.rc-pipelines { margin-top: 0.6rem; display: flex; align-items: center; gap: 0.3rem; font-size: 0.7rem; }

.pipeline-badge { font-size: 0.58rem; padding: 0.1rem 0.4rem; border-radius: 3px; font-weight: 600; }
.pipeline-badge.ace      { background: #7c6ff718; border: 1px solid #7c6ff740; color: #a89cf5; }
.pipeline-badge.rag      { background: #3b82f618; border: 1px solid #3b82f640; color: #93c5fd; }
.pipeline-badge.kag      { background: #10b98118; border: 1px solid #10b98140; color: #6ee7b7; }
.pipeline-badge.dag      { background: #f59e0b18; border: 1px solid #f59e0b40; color: #fcd34d; }
.pipeline-badge.codebase { background: #ec489918; border: 1px solid #ec489940; color: #f9a8d4; }
.pipeline-badge.reranker { background: #f9731618; border: 1px solid #f9731640; color: #fdba74; }

.tier-badge { font-size: 0.58rem; padding: 0.1rem 0.4rem; border-radius: 3px; font-weight: 600; }
.tier-badge.platinum { background: #e2e8f018; border: 1px solid #e2e8f040; color: #e2e8f0; }
.tier-badge.gold     { background: #f59e0b18; border: 1px solid #f59e0b40; color: #fcd34d; }
.tier-badge.silver   { background: #9ca3af18; border: 1px solid #9ca3af40; color: #d1d5db; }
.tier-badge.bronze   { background: #b4530918; border: 1px solid #b4530930; color: #fbbf24; }

/* ── Corpus Search Panel ───────────────────────────────────────────────── */
.corpus-panel, .ingest-panel {
	margin-top: 1.5rem;
	padding: 1.25rem 1.5rem;
	background: rgba(30, 28, 22, 0.7);
	border: 1px solid #3a3520;
	border-radius: 6px;
}
.corpus-desc {
	font-size: 0.72rem;
	color: #a09070;
	margin: 0.25rem 0 1rem;
}
.corpus-desc code {
	background: #2a2618;
	padding: 0.1em 0.35em;
	border-radius: 3px;
	color: #c8b560;
}
.corpus-controls {
	display: flex;
	gap: 0.6rem;
	margin-bottom: 1rem;
}
.corpus-input {
	flex: 1;
	background: #1a1810;
	border: 1px solid #3a3520;
	border-radius: 4px;
	padding: 0.45rem 0.75rem;
	color: #d4c7a3;
	font-family: inherit;
	font-size: 0.8rem;
}
.corpus-input:focus { outline: none; border-color: #786030; }
.corpus-results { display: flex; flex-direction: column; gap: 0.75rem; }
.corpus-result {
	padding: 0.9rem 1rem;
	background: #16140e;
	border: 1px solid #2a2818;
	border-radius: 5px;
}
.corpus-result-header {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
	align-items: center;
	margin-bottom: 0.4rem;
}
.corpus-badge {
	font-size: 0.6rem;
	padding: 0.15rem 0.45rem;
	border-radius: 3px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}
.corpus-badge.legal_canon_chunks { background: #1a3a1a; border: 1px solid #2a5a2a; color: #6bdd6b; }
.corpus-badge.court_opinions     { background: #1a1a3a; border: 1px solid #2a2a5a; color: #6b8bdd; }
.corpus-badge.documents          { background: #2a1a1a; border: 1px solid #4a2a2a; color: #dd8b6b; }
.juris-badge   { font-size: 0.6rem; padding: 0.1rem 0.35rem; border-radius: 2px; background: #2a2010; border: 1px solid #4a3818; color: #c8a040; font-weight: 700; }
.citation-badge { font-size: 0.6rem; padding: 0.1rem 0.4rem; border-radius: 2px; background: #201e14; border: 1px solid #3a3620; color: #b0a080; font-style: italic; }
.score-badge   { font-size: 0.6rem; padding: 0.1rem 0.3rem; border-radius: 2px; background: #0e1a1e; border: 1px solid #1a3040; color: #60b0d0; margin-left: auto; }
.section-path  { font-size: 0.65rem; color: #786840; margin: 0 0 0.3rem; font-style: italic; }
.corpus-summary { font-size: 0.76rem; color: #c0b090; line-height: 1.55; margin: 0 0 0.5rem; }

/* ── Corpus Ingestion Panel ────────────────────────────────────────────── */
.corpus-coverage { margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
.coverage-stat   { display: flex; align-items: center; gap: 0.75rem; font-size: 0.72rem; }
.cov-label   { width: 110px; color: #a09070; flex-shrink: 0; }
.cov-bar-wrap { flex: 1; max-width: 200px; height: 6px; background: #2a2618; border-radius: 3px; overflow: hidden; }
.cov-bar     { height: 100%; background: linear-gradient(90deg, #786030, #c8a040); border-radius: 3px; transition: width 0.4s ease; }
.cov-pct     { width: 36px; text-align: right; color: #c8a040; font-weight: 600; }
.cov-detail  { color: #786840; font-size: 0.68rem; }
.ingest-controls { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; margin-top: 0.75rem; }
.ingest-result {
	margin-top: 0.75rem;
	padding: 0.6rem 0.9rem;
	border-radius: 4px;
	font-size: 0.74rem;
}
.ingest-result.success { background: #0e1e10; border: 1px solid #1e4a20; color: #6bdd6b; }
.ingest-result.skip    { background: #1a1a0e; border: 1px solid #3a3a20; color: #a0a060; }
.ingest-result.fail    { background: #1e0e0e; border: 1px solid #4a1a1a; color: #dd6b6b; }

/* ── Summaries browser wrapper ─────────────────────────────────────────── */
.summaries-browser-wrap {
	padding: 0.75rem 0;
	min-height: 400px;
}
.panel-sub {
	font-size: 0.72rem;
	color: #6b7280;
	margin-top: 0.25rem;
	line-height: 1.5;
}

/* ── Graph RL section ───────────────────────────────────────────────────── */
.graph-controls   { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; margin-top: 0.75rem; }
.build-msg        { font-size: 0.72rem; color: #a0c080; margin-left: 0.5rem; }
.err-inline       { font-size: 0.72rem; color: #f87171; margin-top: 0.5rem; display: flex; align-items: center; gap: 0.35rem; }
.warn-note        { font-size: 0.72rem; color: #f59e0b; margin-top: 0.75rem; display: flex; align-items: center; gap: 0.35rem; line-height: 1.5; }
.loading-note     { font-size: 0.8rem; color: #6b7280; padding: 1.5rem; text-align: center; display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
.empty-note       { font-size: 0.8rem; color: #6b7280; padding: 1.5rem; display: flex; align-items: center; gap: 0.5rem; }
.stat-dl          { display: grid; grid-template-columns: 1fr; gap: 0.4rem; margin-top: 0.5rem; }
.stat-row         { display: flex; justify-content: space-between; align-items: center; padding: 0.3rem 0; border-bottom: 1px solid #2a2618; }
.stat-row dt      { font-size: 0.74rem; color: #8b7860; }
.stat-row dd      { font-size: 0.8rem; color: #d4c7a3; font-weight: 600; }
.policy-bars      { margin-top: 0.6rem; display: flex; flex-direction: column; gap: 0.5rem; }
.policy-row       { display: flex; align-items: center; gap: 0.5rem; }
.policy-label     { width: 70px; font-size: 0.72rem; font-weight: 600; flex-shrink: 0; }
.policy-bar-track { flex: 1; height: 8px; background: #1e1c14; border-radius: 4px; overflow: hidden; }
.policy-bar-fill  { height: 100%; border-radius: 4px; border: 1px solid; transition: width 0.4s ease; }
.policy-val       { width: 50px; text-align: right; font-size: 0.72rem; color: #a09070; }
.policy-updated   { font-size: 0.66rem; color: #6b7280; margin-top: 0.5rem; }
.cluster-chart    { margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
.cluster-bar-row  { display: flex; align-items: center; gap: 0.5rem; }
.cluster-id       { width: 28px; font-size: 0.66rem; color: #6b7280; flex-shrink: 0; text-align: right; }
.cluster-bar-track{ flex: 1; height: 10px; background: #1e1c14; border-radius: 3px; overflow: hidden; }
.cluster-bar-fill { height: 100%; background: linear-gradient(90deg, #4b5563, #7c6ff7); border-radius: 3px; transition: width 0.4s ease; }
.cluster-meta     { width: 160px; font-size: 0.68rem; color: #8b7860; text-align: right; flex-shrink: 0; }

/* ── Agent result ───────────────────────────────────────────────────────── */
.agent-result {
	border: 1px solid #2d2b24; border-radius: 6px;
	padding: 0.75rem; background: #0f0e0c;
}
.agent-meta {
	display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.5rem;
}
.agent-badge {
	font-size: 0.62rem; padding: 0.1rem 0.45rem; border-radius: 3px;
	background: #2d2b24; color: #9ca3af; font-family: inherit;
}
.agent-answer {
	font-size: 0.75rem; color: #d4c7a3; line-height: 1.6;
	white-space: pre-wrap; word-break: break-word; margin: 0;
}

/* ── RL Audit Trail ─────────────────────────────────────────────────────── */
.tl-table { font-size: 0.68rem; }
.tl-time  { color: #6b7280; white-space: nowrap; font-size: 0.65rem; }
.tl-payload { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.65rem; }
.tl-event-badge {
	display: inline-block; padding: 0.1rem 0.4rem; border-radius: 3px;
	font-size: 0.65rem; font-weight: 600; letter-spacing: 0.04em;
	border: 1px solid;
}
.tl-event-badge.feedback   { color: #60a5fa; border-color: #60a5fa44; background: #60a5fa0d; }
.tl-event-badge.citation   { color: #f59e0b; border-color: #f59e0b44; background: #f59e0b0d; }
.tl-event-badge.summary    { color: #4ade80; border-color: #4ade8044; background: #4ade800d; }
.tl-event-badge.rl_adapt   { color: #a78bfa; border-color: #a78bfa44; background: #a78bfa0d; }
.tl-event-badge.tool_call  { color: #f87171; border-color: #f8717144; background: #f871710d; }
.tl-event-badge.research   { color: #38bdf8; border-color: #38bdf844; background: #38bdf80d; }
.tl-event-badge.graph_edge { color: #34d399; border-color: #34d39944; background: #34d3990d; }
.ctrl-select {
	height: 1.75rem; padding: 0 0.5rem; font-size: 0.7rem; font-family: inherit;
	background: #13120f; border: 1px solid #2d2b24; border-radius: 4px; color: #9ca3af; cursor: pointer;
}
.ctrl-select:focus { outline: none; border-color: #7c6ff7; }

/* ── Intent Router Demo ───────────────────────────────────────────────── */
.intent-demo-shell { display: grid; gap: 0.75rem; }
.intent-demo-composer { display: flex; gap: 0.5rem; align-items: center; }
.intent-input { flex: 1 1 auto; }
.intent-example-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.intent-message-list { display: grid; gap: 0.65rem; }
.intent-message { border: 1px solid rgba(255,255,255,0.08); border-radius: 0.75rem; padding: 0.75rem 0.85rem; background: rgba(255,255,255,0.02); }
.intent-user { border-color: rgba(99,102,241,0.35); }
.intent-assistant { border-color: rgba(74,222,128,0.25); }
.intent-system { border-color: rgba(248,113,113,0.25); }
.intent-message-head { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-bottom: 0.35rem; }
.intent-role { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.7; }
.intent-message-body { margin: 0; color: rgba(236, 240, 244, 0.92); line-height: 1.45; }
.intent-badge, .intent-confidence, .intent-step { display: inline-flex; align-items: center; border-radius: 999px; padding: 0.15rem 0.55rem; font-size: 0.72rem; border: 1px solid rgba(255,255,255,0.12); }
.intent-confidence { background: rgba(124, 111, 247, 0.18); color: #ddd6fe; }
.intent-confidence.neutral { background: rgba(156, 163, 175, 0.16); color: #d1d5db; }
.intent-badge { background: rgba(74, 222, 128, 0.16); color: #bbf7d0; }
.intent-badge.intent-neutral { background: rgba(156, 163, 175, 0.16); color: #d1d5db; }
.intent-badge.intent-evidence_upload { background: rgba(251, 191, 36, 0.16); color: #fde68a; }
.intent-badge.intent-schema_drift { background: rgba(248, 113, 113, 0.16); color: #fecaca; }
.intent-badge.intent-graph_search { background: rgba(59, 130, 246, 0.16); color: #bfdbfe; }
.intent-badge.intent-gpu_rerank { background: rgba(168, 85, 247, 0.16); color: #e9d5ff; }
.intent-badge.intent-ui_bug { background: rgba(251, 146, 60, 0.16); color: #fed7aa; }
.intent-badge.intent-legal_research { background: rgba(20, 184, 166, 0.16); color: #99f6e4; }
.intent-route-card { border: 1px solid rgba(255,255,255,0.08); border-radius: 0.75rem; padding: 0.75rem 0.85rem; background: rgba(255,255,255,0.02); }
.intent-route-row { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-bottom: 0.5rem; }
.intent-route-steps { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.intent-step { background: rgba(255,255,255,0.06); color: #e5e7eb; }

/* ── Predictive Todos ───────────────────────────────────────────────────── */
.todo-list { display: flex; flex-direction: column; gap: 0.4rem; }
.todo-row {
	display: grid;
	grid-template-columns: 3.5rem 8rem auto 1fr 1fr 1.5rem;
	gap: 0.5rem;
	align-items: center;
	padding: 0.45rem 0.6rem;
	background: #1a1916;
	border: 1px solid #2a2825;
	border-radius: 5px;
	font-size: 0.75rem;
}
.todo-row.done { opacity: 0.45; }
.todo-impact {
	font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
	border: 1px solid; border-radius: 3px; padding: 1px 5px; text-align: center;
}
.todo-type { color: #e2e8f0; font-size: 0.7rem; }
.todo-cluster { font-size: 0.68rem; }
.todo-reason { color: #94a3b8; }
.todo-action { font-size: 0.68rem; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.todo-dismiss {
	background: transparent; border: none; color: #475569; cursor: pointer; padding: 2px;
	border-radius: 3px; display: flex; align-items: center; justify-content: center;
}
.todo-dismiss:hover { color: #f87171; background: #f8717115; }

/* ── Index Orchestrator ────────────────────────────────────────────────── */
.idx-controls { display: flex; justify-content: space-between; align-items: center; margin-top: 0.75rem; gap: 0.75rem; flex-wrap: wrap; }
.idx-presets  { display: flex; gap: 0.35rem; }
.idx-presets .btn-sm { background: #1e1c14; color: #8b7860; border: 1px solid #2a2618; }
.idx-presets .btn-sm.active { background: #2a2618; color: #d4c7a3; border-color: #7c6ff7; }
.idx-actions  { display: flex; gap: 0.35rem; }
.idx-error    { font-size: 0.75rem; color: #f87171; margin-top: 0.5rem; padding: 0.4rem 0.6rem; background: #f8717110; border: 1px solid #f8717130; border-radius: 4px; }
.idx-preset-info { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.6rem; font-size: 0.72rem; color: #6b7280; align-items: center; }
.idx-flag     { padding: 1px 6px; border-radius: 3px; font-size: 0.65rem; font-weight: 600; letter-spacing: 0.04em; }
.idx-flag.on  { color: #4ade80; border: 1px solid #4ade8044; background: #4ade800d; }
.idx-flag.warn{ color: #f59e0b; border: 1px solid #f59e0b44; background: #f59e0b0d; }
.idx-stats    { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.5rem; }
.idx-stats .stat-row span:first-child { font-size: 0.74rem; color: #8b7860; }
.idx-stats .stat-row span:last-child  { font-size: 0.8rem; color: #d4c7a3; font-weight: 600; }
.cuda-on      { color: #4ade80 !important; }
.idx-events   { display: flex; flex-direction: column; gap: 0.25rem; max-height: 400px; overflow-y: auto; }
.idx-ev       { display: flex; gap: 0.5rem; align-items: center; padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.72rem; background: #1a1916; border: 1px solid #2a2618; flex-wrap: wrap; }
.idx-ev.ev-done  { border-color: #4ade8044; background: #4ade800a; }
.idx-ev.ev-fail  { border-color: #f8717144; background: #f871710a; }
.idx-ev.ev-skip  { opacity: 0.5; }
.idx-ev.ev-cached { border-color: #a78bfa44; background: #a78bfa0a; }
.idx-ev.ev-start { border-color: #60a5fa33; }
.btn-resume { background: #2d2150; color: #a78bfa; border: 1px solid #a78bfa44; }
.ev-name      { font-weight: 600; color: #d4c7a3; min-width: 120px; }
.ev-stage     { color: #7c6ff7; font-size: 0.68rem; }
.ev-ms        { color: #4ade80; font-size: 0.68rem; }
.ev-detail    { color: #9ca3af; font-size: 0.68rem; }
.ev-reason    { color: #f59e0b; font-size: 0.68rem; }
.ev-error     { color: #f87171; font-size: 0.68rem; }
.ev-cached-at { color: #a78bfa; font-size: 0.68rem; font-weight: 600; }
.idx-stages-bar { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.idx-stage-chip { padding: 2px 8px; border-radius: 4px; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.03em; }
.idx-stage-chip.done { color: #4ade80; background: #4ade800d; border: 1px solid #4ade8044; }
.idx-stage-chip.cached { color: #a78bfa; background: #a78bfa0d; border: 1px solid #a78bfa44; }
.idx-final-counts { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.5rem; font-size: 0.72rem; color: #9ca3af; }
.idx-final-counts b { color: #d4c7a3; }

/* ── Knowledge Triples ────────────────────────────────────────────────── */
.triples-browser { border: 1px solid rgba(255,255,255,0.05); border-radius: 6px; background: rgba(0,0,0,0.2); }
.triple-entity { display: flex; flex-direction: column; gap: 0.1rem; }
.entity-kind { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; color: #7c6ff7; font-weight: 700; }
.entity-label { font-size: 0.75rem; color: #e5e7eb; font-weight: 500; }
.triple-relation { font-family: monospace; font-size: 0.7rem; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em; }
</style>
