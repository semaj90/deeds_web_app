<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/card/Card.svelte';
	import CardContent from '$lib/components/ui/card/CardContent.svelte';
	import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
	import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
	import ProactiveAIAssistant from '$lib/components/ai/ProactiveAIAssistant.svelte';
	import IntelligentModelOrchestrator from '$lib/components/ai/IntelligentModelOrchestrator.svelte';
	import Gemma270MWebAssembly from '$lib/components/ai/Gemma270MWebAssembly.svelte';
	import RAGPipelineChart from '$lib/components/ai/RAGPipelineChart.svelte';
	import ACEContextBubble from '$lib/components/ai/ACEContextBubble.svelte';
	import RecommendationEngine from '$lib/components/ai/RecommendationEngine.svelte';
	import QLoRAMonitoringDashboard from '$lib/components/ai/QLoRAMonitoringDashboard.svelte';
	import AuditResults from '$lib/components/ai/AuditResults.svelte';
	import LocalImageGenerator from '$lib/components/ai/LocalImageGenerator.svelte';
	import GPUAIAssistant from '$lib/components/ai/GPUAIAssistant.svelte';
	import DeedAnalysis from '$lib/components/ai/DeedAnalysis.svelte';
	import AdminMonitoringDashboard from '$lib/components/admin/AdminMonitoringDashboard.svelte';


	interface AIStats {
		activeChats: number;
		ragQueries: number;
		documentsAnalyzed: number;
		citationsFound: number;
		casesProcessed: number;
		assistantSessions: number;
		embeddingModel: string;
		llmModel: string;
		ollamaStatus: string;
	}

	let stats = $state<AIStats>({
		activeChats: 0,
		ragQueries: 0,
		documentsAnalyzed: 0,
		citationsFound: 0,
		casesProcessed: 0,
		assistantSessions: 0,
		embeddingModel: 'embeddinggemma:latest',
		llmModel: 'gemma4-legal:latest',
		ollamaStatus: 'unknown',
	});
	let loading = $state(true);
	let error = $state<string | null>(null);
	let showOrchestrator = $state(false);
	let showVlm = $state(false);
	let showPipelineChart = $state(false);
	let showAceBubble = $state(false);
	let showRecommendations = $state(false);
	let showQloRA = $state(false);
	let showAudit = $state(false);
	let showDetective = $state(false);
	let showImageGen = $state(false);
	let showDeedAnalysis = $state(false);
	let showMonitoring = $state(false);


	$effect(() => {
		loadDashboard();
	});

	async function loadDashboard() {
		loading = true;
		error = null;
		try {
			const statsRes = await fetch('/api/ai/stats').catch(() => null);
			if (statsRes?.ok) {
				const data = await statsRes.json();
				stats = { ...stats, ...data };
				stats.ollamaStatus = 'connected';
			} else {
				stats.ollamaStatus = 'disconnected';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load lab dashboard';
			stats.ollamaStatus = 'error';
		} finally {
			loading = false;
		}
	}
</script>

<div class="ai-lab-surface">
	<header class="surface-header">
		<div>
			<p class="eyebrow">Experimental + Demo</p>
			<h1>AI Lab Console</h1>
			<p class="subtitle">Validation surfaces, architecture demos, GPU-heavy experiments, VLM tooling, and training or audit views that are not part of the core operator workflow.</p>
		</div>
		<nav class="surface-nav">
			<a href="/admin/ai-dashboard">Overview</a>
			<a href="/admin/ai-dashboard/operator">Operator</a>
		</nav>
	</header>

	{#if loading}
		<div class="loading">Loading lab status...</div>
	{:else}
		<Card class="mb-6 bg-panel border-sand/10">
			<CardHeader>
				<CardTitle class="text-sm flex items-center gap-2">
					<span class="status-chip">Lab routing active</span>
					Ollama: {stats.ollamaStatus}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<p class="status-copy">This route is for validation, demo, and experimental AI surfaces. Keep operational review on the operator route.</p>
			</CardContent>
		</Card>

		<div class="mb-6">
			<ProactiveAIAssistant context="general" />
		</div>

		<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
			{#each [
				{ label: 'Documents Analyzed', value: stats.documentsAnalyzed },
				{ label: 'RAG Queries', value: stats.ragQueries },
				{ label: 'Cases Processed', value: stats.casesProcessed },
				{ label: 'Assistant Sessions', value: stats.assistantSessions },
			] as stat}
				<Card class="bg-panel border-sand/10">
					<CardContent class="p-4 text-center">
						<p class="metric-value">{stat.value}</p>
						<p class="metric-label">{stat.label}</p>
					</CardContent>
				</Card>
			{/each}
		</div>

		<div class="panel-block">
			<p class="section-kicker">Pipeline experimentation</p>
			<button class="panel-toggle" onclick={() => (showOrchestrator = !showOrchestrator)}>
				{showOrchestrator ? 'Hide Pipeline Orchestrator' : 'RAG + KAG + DAG Pipeline Orchestrator'}
			</button>
			{#if showOrchestrator}<div class="panel-body"><IntelligentModelOrchestrator /></div>{/if}
		</div>

		<div class="panel-block">
			<p class="section-kicker">Vision + VLM</p>
			<button class="panel-toggle" onclick={() => (showVlm = !showVlm)}>
				{showVlm ? 'Hide VLM Analyzer' : 'VLM Image Analysis (Client ONNX + YOLO + Gemma4 Vision)'}
			</button>
			{#if showVlm}<div class="panel-body"><Gemma270MWebAssembly /></div>{/if}
		</div>

		<div class="panel-block">
			<p class="section-kicker">Architecture demo</p>
			<button class="panel-toggle" onclick={() => (showPipelineChart = !showPipelineChart)}>
				{showPipelineChart ? 'Hide Pipeline Chart' : 'RAG + KAG + DAG Pipeline Chart'}
			</button>
			{#if showPipelineChart}<div class="panel-body"><RAGPipelineChart /></div>{/if}
		</div>

		<div class="panel-block">
			<p class="section-kicker">Diagnostics visualization</p>
			<button class="panel-toggle" onclick={() => (showAceBubble = !showAceBubble)}>
				{showAceBubble ? 'Hide ACE Bubble' : 'ACE Context Bubble'}
			</button>
			{#if showAceBubble}
				<div class="panel-body">
					<div class="ace-grid">
						<ACEContextBubble confidence={0.85} source="server-ollama" confidenceFactors={{ caseContext: true, ragHits: 4, topScore: 0.87, embeddingModel: 'embeddinggemma:latest', codebaseHits: 0, kagNeighbors: 3 }} citations={[{ sourceNum: 1, documentId: 'evidence_items:abc123', similarity: 0.87 }]} contextUsed={['evidence_items:abc123']} conversationTurns={4} routerDecision={{ source: 'server-ollama', reason: 'legal-keywords(3)+case-context-available', confidence: 0.85 }} />
						<ACEContextBubble confidence={0.35} source="local-onnx" cacheHit="idb" routerDecision={{ source: 'local-onnx', reason: 'simple-query', confidence: 0.9 }} />
					</div>
				</div>
			{/if}
		</div>

		<div class="panel-block">
			<p class="section-kicker">Advisory experiments</p>
			<button class="panel-toggle" onclick={() => (showRecommendations = !showRecommendations)}>
				{showRecommendations ? 'Hide Recommendations' : 'AI Recommendation Engine'}
			</button>
			{#if showRecommendations}<div class="panel-body"><RecommendationEngine contextQuery="Generate legal case strategy recommendations" /></div>{/if}
		</div>

		<div class="panel-block">
			<p class="section-kicker">Training + telemetry</p>
			<button class="panel-toggle" onclick={() => (showQloRA = !showQloRA)}>
				{showQloRA ? 'Hide QLoRA Monitor' : 'QLoRA Training Monitor'}
			</button>
			{#if showQloRA}<div class="panel-body"><QLoRAMonitoringDashboard /></div>{/if}
		</div>

		<div class="panel-block">
			<p class="section-kicker">Audit output</p>
			<button class="panel-toggle" onclick={() => (showAudit = !showAudit)}>
				{showAudit ? 'Hide Audit Results' : 'Pipeline Audit Results'}
			</button>
			{#if showAudit}<div class="panel-body"><AuditResults /></div>{/if}
		</div>

		<div class="panel-block">
			<p class="section-kicker">GPU-heavy investigation</p>
			<button class="panel-toggle" onclick={() => (showDetective = !showDetective)}>
				{showDetective ? 'Hide Detective Mode' : 'Detective Mode (GPU Evidence Analysis + Streaming Chat)'}
			</button>
			{#if showDetective}<div class="panel-body tall"><GPUAIAssistant /></div>{/if}
		</div>

		<div class="panel-block">
			<p class="section-kicker">Image generation</p>
			<button class="panel-toggle" onclick={() => (showImageGen = !showImageGen)}>
				{showImageGen ? 'Hide Image Generator' : 'AI Image Generation'}
			</button>
			{#if showImageGen}<div class="panel-body"><LocalImageGenerator /></div>{/if}
		</div>

		<div class="panel-block">
			<p class="section-kicker">Document experiments</p>
			<button class="panel-toggle" onclick={() => (showDeedAnalysis = !showDeedAnalysis)}>
				{showDeedAnalysis ? 'Hide Deed Analysis' : 'Deed Analysis (Semantic Document Search + Similarity Scoring)'}
			</button>
			{#if showDeedAnalysis}<div class="panel-body"><DeedAnalysis /></div>{/if}
		</div>

		<div class="panel-block">
			<p class="section-kicker">Infrastructure Observability</p>
			<button class="panel-toggle" onclick={() => (showMonitoring = !showMonitoring)}>
				{showMonitoring ? 'Hide Monitoring Dashboard' : 'Admin Infrastructure Monitoring (Phase D)'}
			</button>
			{#if showMonitoring}
				<div class="panel-body no-padding overflow-hidden">
					<AdminMonitoringDashboard />
				</div>
			{/if}
		</div>


		{#if error}
			<Card class="mt-4 bg-panel border-danger/40">
				<CardContent class="p-4 text-center">
					<p class="text-danger text-sm">{error}</p>
					<Button onclick={() => loadDashboard()} class="mt-2">Retry</Button>
				</CardContent>
			</Card>
		{/if}
	{/if}
</div>

<style>
	.ai-lab-surface {
		min-height: 100vh;
		margin: -2.5rem;
		padding: 2.5rem;
		background:
			radial-gradient(circle at top left, rgba(245, 158, 11, 0.09), transparent 30%),
			radial-gradient(circle at bottom right, rgba(168, 85, 247, 0.08), transparent 30%),
			#0e0d0b;
		color: rgb(212 199 163);
	}
	.surface-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 2rem;
	}
	.eyebrow {
		margin: 0 0 0.5rem;
		font-size: 0.72rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: rgba(212, 199, 163, 0.48);
	}
	h1 { margin: 0; font-size: clamp(2rem, 4vw, 3rem); color: rgba(245, 240, 223, 0.96); }
	.subtitle { margin: 0.8rem 0 0; max-width: 56rem; color: rgba(212, 199, 163, 0.72); line-height: 1.6; }
	.surface-nav { display: flex; gap: 0.75rem; }
	.surface-nav a {
		color: #fbbf24;
		text-decoration: none;
		border: 1px solid rgba(245, 158, 11, 0.18);
		background: rgba(245, 158, 11, 0.08);
		padding: 0.55rem 0.85rem;
		border-radius: 999px;
		font-size: 0.8rem;
	}
	.loading { padding: 4rem 0; text-align: center; color: rgba(212, 199, 163, 0.5); }
	.status-chip {
		display: inline-flex;
		padding: 0.18rem 0.55rem;
		border-radius: 999px;
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.2);
		color: #fbbf24;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.status-copy { margin: 0; color: rgba(212, 199, 163, 0.68); line-height: 1.55; }
	.metric-value { font-size: 1.8rem; font-weight: 700; color: #fbbf24; }
	.metric-label { margin-top: 0.25rem; font-size: 0.75rem; color: rgba(212, 199, 163, 0.5); }
	.panel-block { margin-top: 1rem; }
	.section-kicker {
		margin: 0 0 0.35rem;
		font-size: 0.7rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(251, 191, 36, 0.76);
	}
	.panel-toggle {
		width: 100%;
		text-align: left;
		padding: 0.9rem 1rem;
		background: rgba(19, 21, 25, 0.86);
		border: 1px solid rgba(212, 199, 163, 0.12);
		border-radius: 0.9rem;
		color: rgba(212, 199, 163, 0.84);
		cursor: pointer;
	}
	.panel-body {
		margin-top: 0.75rem;
		padding: 1rem;
		border-radius: 1rem;
		background: rgba(19, 21, 25, 0.74);
		border: 1px solid rgba(212, 199, 163, 0.08);
	}
	.panel-body.tall { min-height: 520px; }
	.panel-body.no-padding { padding: 0; }
	.ace-grid { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-start; }

	@media (max-width: 720px) {
		.surface-header, .surface-nav { flex-direction: column; }
	}
</style>
