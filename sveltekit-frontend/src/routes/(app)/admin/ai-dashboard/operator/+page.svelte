<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/card/Card.svelte';
	import CardContent from '$lib/components/ui/card/CardContent.svelte';
	import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
	import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
	import ProactiveAIAssistant from '$lib/components/ai/ProactiveAIAssistant.svelte';
	import YoRHaAIChat from '$lib/components/yorha/YoRHaAIChat.svelte';
	import EnhancedYoRHaAIAssistant from '$lib/components/yorha/EnhancedYoRHaAIAssistant.svelte';
	import SourceValidator from '$lib/components/rag/SourceValidator.svelte';
	import AnswerWithCitations from '$lib/components/rag/AnswerWithCitations.svelte';
	import RAGAssistantChat from '$lib/components/ai/RAGAssistantChat.svelte';
	import SmartSearchInterface from '$lib/components/ai/SmartSearchInterface.svelte';
	import LLMSelector from '$lib/components/ai/LLMSelector.svelte';
	import type { AnswerWithCitations as AnswerData } from '$lib/types/rag-source-validation';
	import { goto } from '$app/navigation';

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

	interface ModelInfo {
		name: string;
		size: string;
		modified_at: string;
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
	let models = $state<ModelInfo[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let selectedLLM = $state<any>(null);
	let showChat = $state(false);
	let showAssistant = $state(false);
	let showRagPipeline = $state(false);
	let showCaseWorkflow = $state(false);
	let showSmartSearch = $state(false);
	let showLLMSelector = $state(false);
	let ragQuery = $state('');
	let ragChunks = $state<any[]>([]);
	let ragAnswer = $state<AnswerData | null>(null);
	let ragStep = $state<'search' | 'validate' | 'answer'>('search');
	let ragLoading = $state(false);
	let ragQueryId = $state('');

	$effect(() => {
		loadDashboard();
	});

	async function loadDashboard() {
		loading = true;
		error = null;
		try {
			const [statsRes, modelsRes] = await Promise.all([
				fetch('/api/ai/stats').catch(() => null),
				fetch('/api/ai/models').catch(() => null),
			]);

			if (statsRes?.ok) {
				const data = await statsRes.json();
				stats = { ...stats, ...data };
			}

			if (modelsRes?.ok) {
				const data = await modelsRes.json();
				models = data.models ?? [];
				stats.ollamaStatus = 'connected';
			} else {
				stats.ollamaStatus = 'disconnected';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load operator dashboard';
			stats.ollamaStatus = 'error';
		} finally {
			loading = false;
		}
	}

	async function runRagSearch() {
		if (ragQuery.length < 3) return;
		ragLoading = true;
		try {
			const res = await fetch('/api/rag/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: ragQuery, top_k: 10 }),
			});
			if (!res.ok) throw new Error(`Search failed: ${res.status}`);
			const data = await res.json();
			ragQueryId = data.query_id ?? '';
			const chunks = data.chunks ?? data.results ?? [];
			ragChunks = chunks.map((c: any, i: number) => ({
				chunk_id: c.chunk_id ?? c.id ?? `chunk-${i}`,
				confidence: c.score >= 0.85 ? 'high' : c.score >= 0.7 ? 'medium' : c.score >= 0.5 ? 'low' : 'marginal',
				source_title: c.source_title ?? c.metadata?.fileName ?? c.collection ?? `Source ${i + 1}`,
				score: c.score ?? 0,
				text: c.text ?? c.content ?? '',
				snippet: (c.text ?? c.content ?? '').slice(0, 300),
				source_type: c.source_type ?? c.metadata?.type ?? 'document',
				related_entities: c.metadata?.entities ?? [],
			}));
			ragStep = 'validate';
		} catch (err) {
			console.error('[operator/rag/search]', err);
		} finally {
			ragLoading = false;
		}
	}

	async function handleRagValidate(selectedIds: string[]) {
		ragLoading = true;
		try {
			const validations = ragChunks.map((c: any) => ({
				chunk_id: c.chunk_id,
				status: selectedIds.includes(c.chunk_id) ? 'approved' : 'rejected',
			}));

			const valRes = await fetch('/api/rag/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query_id: ragQueryId, case_id: crypto.randomUUID(), validations }),
			});
			if (!valRes.ok) throw new Error(`Validate failed: ${valRes.status}`);
			const context = await valRes.json();

			const ansRes = await fetch('/api/rag/answer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					context_id: context.context_id,
					query: ragQuery,
					case_id: crypto.randomUUID(),
					include_citations: true,
					include_todos: true,
				}),
			});
			if (!ansRes.ok) throw new Error(`Answer failed: ${ansRes.status}`);
			ragAnswer = await ansRes.json();
			ragStep = 'answer';
		} catch (err) {
			console.error('[operator/rag/validate]', err);
		} finally {
			ragLoading = false;
		}
	}

	const statusTone = $derived(
		stats.ollamaStatus === 'connected' ? 'connected' : stats.ollamaStatus === 'disconnected' ? 'disconnected' : 'warning'
	);
</script>

<div class="ai-surface">
	<header class="surface-header">
		<div>
			<p class="eyebrow">Production Operator</p>
			<h1>AI Operator Console</h1>
			<p class="subtitle">Route-backed workflows for legal chat, evidence-aware retrieval review, case intake, search, and model operations.</p>
		</div>
		<nav class="surface-nav">
			<a href="/admin/ai-dashboard">Overview</a>
			<a href="/admin/ai-dashboard/lab">Lab</a>
		</nav>
	</header>

	{#if loading}
		<div class="loading">Loading operator status...</div>
	{:else}
		<Card class="mb-6 bg-panel border-sand/10">
			<CardHeader>
				<CardTitle class="text-sm flex items-center gap-2">
					<span class={`dot ${statusTone}`}></span>
					Ollama Status: {stats.ollamaStatus}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="grid grid-cols-2 gap-4 text-sm">
					<div><span class="label">Embedding Model</span><span class="value mono">{stats.embeddingModel}</span></div>
					<div><span class="label">LLM Model</span><span class="value mono">{stats.llmModel}</span></div>
				</div>
			</CardContent>
		</Card>

		<div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
			{#each [
				{ label: 'RAG Queries', value: stats.ragQueries },
				{ label: 'Documents Analyzed', value: stats.documentsAnalyzed },
				{ label: 'Citations Found', value: stats.citationsFound },
				{ label: 'Cases Processed', value: stats.casesProcessed },
				{ label: 'Active Chats', value: stats.activeChats },
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

		<div class="mb-6">
			<ProactiveAIAssistant context="general" />
		</div>

		{#if models.length > 0}
			<Card class="bg-panel border-sand/10 mb-6">
				<CardHeader>
					<CardTitle class="text-sm text-sand/80">Available Models ({models.length})</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="grid gap-2">
						{#each models as model}
							<div class="model-row">
								<span class="font-mono text-accent">{model.name}</span>
								<div class="model-meta">
									<span>{model.size}</span>
									<span>{new Date(model.modified_at).toLocaleDateString()}</span>
								</div>
							</div>
						{/each}
					</div>
				</CardContent>
			</Card>
		{/if}

		<div class="panel-block">
			<p class="section-kicker">Operator workflow</p>
			<button class="panel-toggle" onclick={() => (showChat = !showChat)}>
				{showChat ? 'Hide YoRHa AI Chat' : 'YoRHa AI Chat (RAG + Ollama Direct)'}
			</button>
			{#if showChat}
				<div class="panel-body tall"><YoRHaAIChat /></div>
			{/if}
		</div>

		<div class="panel-block">
			<p class="section-kicker">Evidence-aware operator</p>
			<button class="panel-toggle" onclick={() => (showAssistant = !showAssistant)}>
				{showAssistant ? 'Hide Enhanced Assistant' : 'Enhanced YoRHa AI Assistant (RAG + Evidence + Analysis)'}
			</button>
			{#if showAssistant}
				<div class="panel-body">
					<EnhancedYoRHaAIAssistant isOpen={showAssistant} onClose={() => (showAssistant = false)} userRole="prosecutor" />
				</div>
			{/if}
		</div>

		<div class="panel-block">
			<p class="section-kicker">Retrieval review</p>
			<button class="panel-toggle" onclick={() => (showRagPipeline = !showRagPipeline)}>
				{showRagPipeline ? 'Hide RAG Validation' : 'RAG Source Validation (Search → Validate → Answer)'}
			</button>
			{#if showRagPipeline}
				<div class="panel-body pipeline">
					<div class="step-row">
						<span class:text-accent={ragStep === 'search'}>1. Search</span>
						<span>→</span>
						<span class:text-accent={ragStep === 'validate'}>2. Validate</span>
						<span>→</span>
						<span class:text-accent={ragStep === 'answer'}>3. Answer</span>
					</div>
					{#if ragStep === 'search'}
						<div class="search-row">
							<input
								type="text"
								bind:value={ragQuery}
								class="search-input"
								placeholder="Enter legal query"
								onkeydown={(e) => e.key === 'Enter' && ragQuery.length >= 3 && runRagSearch()}
							/>
							<Button onclick={runRagSearch} disabled={ragLoading || ragQuery.length < 3}>{ragLoading ? 'Searching...' : 'Search'}</Button>
						</div>
					{:else if ragStep === 'validate'}
						<SourceValidator caseId="" initialQuery={ragQuery} chunks={ragChunks} isLoading={ragLoading} onValidate={handleRagValidate} onCancel={() => { ragStep = 'search'; ragChunks = []; }} />
					{:else if ragStep === 'answer' && ragAnswer}
						<AnswerWithCitations answer={ragAnswer} />
						<div class="action-row">
							<Button onclick={() => { ragStep = 'search'; ragAnswer = null; ragChunks = []; ragQuery = ''; }}>New Query</Button>
							<Button onclick={() => { ragStep = 'validate'; ragAnswer = null; }}>Back to Sources</Button>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<div class="panel-block">
			<p class="section-kicker">Case intake</p>
			<button class="panel-toggle" onclick={() => (showCaseWorkflow = !showCaseWorkflow)}>
				{showCaseWorkflow ? 'Hide Case Workflow' : 'RAG Case Intake Workflow (WHO/WHAT/WHEN/WHERE/WHY/HOW)'}
			</button>
			{#if showCaseWorkflow}
				<div class="panel-body"><RAGAssistantChat onCaseCreated={(id) => goto('/cases/' + id)} /></div>
			{/if}
		</div>

		<div class="panel-block">
			<p class="section-kicker">Search</p>
			<button class="panel-toggle" onclick={() => (showSmartSearch = !showSmartSearch)}>
				{showSmartSearch ? 'Hide Smart Search' : 'Smart Legal AI Search (RAG Context Modes)'}
			</button>
			{#if showSmartSearch}
				<div class="panel-body"><SmartSearchInterface contextMode="legal" maxResults={10} /></div>
			{/if}
		</div>

		<div class="panel-block">
			<p class="section-kicker">Model operations</p>
			<button class="panel-toggle" onclick={() => (showLLMSelector = !showLLMSelector)}>
				{showLLMSelector ? 'Hide LLM Selector' : 'LLM Model Selector (Ollama Status + Pull + Metrics)'}
			</button>
			{#if showLLMSelector}
				<div class="panel-body"><LLMSelector bind:selectedModel={selectedLLM} /></div>
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
	.ai-surface {
		min-height: 100vh;
		margin: -2.5rem;
		padding: 2.5rem;
		background:
			radial-gradient(circle at top left, rgba(34, 197, 94, 0.08), transparent 30%),
			radial-gradient(circle at bottom right, rgba(96, 165, 250, 0.08), transparent 28%),
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
	.subtitle { margin: 0.8rem 0 0; max-width: 52rem; color: rgba(212, 199, 163, 0.72); line-height: 1.6; }
	.surface-nav { display: flex; gap: 0.75rem; }
	.surface-nav a {
		color: #93c5fd;
		text-decoration: none;
		border: 1px solid rgba(96, 165, 250, 0.18);
		background: rgba(96, 165, 250, 0.08);
		padding: 0.55rem 0.85rem;
		border-radius: 999px;
		font-size: 0.8rem;
	}
	.loading { padding: 4rem 0; text-align: center; color: rgba(212, 199, 163, 0.5); }
	.dot { width: 0.55rem; height: 0.55rem; border-radius: 999px; display: inline-block; }
	.dot.connected { background: #4ade80; }
	.dot.disconnected { background: #f87171; }
	.dot.warning { background: #fbbf24; }
	.label { color: rgba(212, 199, 163, 0.48); margin-right: 0.5rem; }
	.value { color: rgba(245, 240, 223, 0.9); }
	.mono { font-family: 'JetBrains Mono', 'Courier New', monospace; }
	.metric-value { font-size: 1.8rem; font-weight: 700; color: #93c5fd; }
	.metric-label { margin-top: 0.25rem; font-size: 0.75rem; color: rgba(212, 199, 163, 0.5); }
	.model-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 0.85rem;
		border-radius: 0.75rem;
		background: rgba(0, 0, 0, 0.2);
	}
	.model-meta { display: flex; gap: 1rem; color: rgba(212, 199, 163, 0.45); font-size: 0.75rem; }
	.panel-block { margin-top: 1rem; }
	.section-kicker {
		margin: 0 0 0.35rem;
		font-size: 0.7rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(74, 222, 128, 0.74);
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
	.pipeline { display: flex; flex-direction: column; gap: 1rem; }
	.step-row { display: flex; gap: 0.5rem; font-size: 0.8rem; color: rgba(212, 199, 163, 0.56); }
	.search-row { display: flex; gap: 0.75rem; }
	.search-input {
		flex: 1;
		padding: 0.7rem 0.9rem;
		border-radius: 0.75rem;
		border: 1px solid rgba(212, 199, 163, 0.14);
		background: rgba(0, 0, 0, 0.22);
		color: rgba(245, 240, 223, 0.95);
	}
	.action-row { display: flex; gap: 0.75rem; margin-top: 0.75rem; }
	@media (max-width: 720px) {
		.surface-header { flex-direction: column; }
		.search-row, .action-row, .surface-nav { flex-direction: column; }
	}
</style>
