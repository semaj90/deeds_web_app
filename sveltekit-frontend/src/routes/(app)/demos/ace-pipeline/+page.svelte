<script lang="ts">
	import ACEContextBubble from '$lib/components/ai/ACEContextBubble.svelte';
	import RAGPipelineChart from '$lib/components/ai/RAGPipelineChart.svelte';

	let showChart = $state(true);
</script>

<div class="max-w-4xl mx-auto p-6 space-y-8">
	<div>
		<h1 class="text-2xl font-bold text-sand">ACE Pipeline Demo</h1>
		<p class="text-sm text-sand/60 mt-1">Augmented Contextual Engineering — pipeline metadata + RAG+KAG+DAG flow visualization</p>
	</div>

	<!-- ACE Context Bubbles -->
	<section class="space-y-4">
		<h2 class="text-lg font-semibold text-sand/80 border-b border-sand/10 pb-2">ACE Context Bubbles</h2>
		<p class="text-xs text-sand/50">Click each bubble to expand the full pipeline breakdown. Shows confidence, source, RAG hits, KAG neighbors, citations, and cache status.</p>

		<div class="flex flex-wrap gap-4 items-start">
			<!-- High confidence — full server pipeline -->
			<div class="space-y-1">
				<span class="text-[10px] uppercase tracking-wider text-sand/40">High Confidence (Server)</span>
				<ACEContextBubble
					confidence={0.85}
					source="server-ollama"
					confidenceFactors={{
						caseContext: true,
						ragHits: 4,
						topScore: 0.87,
						embeddingModel: 'embeddinggemma:latest',
						codebaseHits: 0,
						kagNeighbors: 3
					}}
					citations={[
						{ sourceNum: 1, documentId: 'evidence_items:abc123', similarity: 0.87 },
						{ sourceNum: 3, documentId: 'legal_cases:def456', similarity: 0.72 }
					]}
					contextUsed={['evidence_items:abc123', 'legal_documents:xyz789']}
					conversationTurns={4}
					routerDecision={{ source: 'server-ollama', reason: 'legal-keywords(3)+case-context-available', confidence: 0.85 }}
				/>
			</div>

			<!-- Low confidence — local ONNX with cache -->
			<div class="space-y-1">
				<span class="text-[10px] uppercase tracking-wider text-sand/40">Low Confidence (Local)</span>
				<ACEContextBubble
					confidence={0.35}
					source="local-onnx"
					cacheHit="idb"
					routerDecision={{ source: 'local-onnx', reason: 'simple-query', confidence: 0.9 }}
				/>
			</div>

			<!-- Medium confidence — with KAG -->
			<div class="space-y-1">
				<span class="text-[10px] uppercase tracking-wider text-sand/40">Medium (KAG Active)</span>
				<ACEContextBubble
					confidence={0.62}
					source="server-ollama"
					confidenceFactors={{
						caseContext: false,
						ragHits: 2,
						topScore: 0.58,
						embeddingModel: 'embeddinggemma:latest',
						codebaseHits: 5,
						kagNeighbors: 1
					}}
					conversationTurns={1}
					routerDecision={{ source: 'server-ollama', reason: 'rag-trigger+long-message', confidence: 0.62 }}
				/>
			</div>

			<!-- No RAG — fallback -->
			<div class="space-y-1">
				<span class="text-[10px] uppercase tracking-wider text-sand/40">No RAG (Fallback)</span>
				<ACEContextBubble
					confidence={0.2}
					source="local-onnx"
					cacheHit="none"
					routerDecision={{ source: 'local-onnx', reason: 'server-unavailable', confidence: 0.2 }}
				/>
			</div>
		</div>
	</section>

	<!-- RAG Pipeline Chart -->
	<section class="space-y-4">
		<div class="flex items-center justify-between border-b border-sand/10 pb-2">
			<h2 class="text-lg font-semibold text-sand/80">RAG + KAG + DAG Pipeline</h2>
			<button
				class="px-3 py-1 text-xs rounded border border-sand/20 hover:border-accent/40 transition text-sand/60"
				onclick={() => (showChart = !showChart)}
			>
				{showChart ? 'Hide' : 'Show'} Chart
			</button>
		</div>

		{#if showChart}
			<RAGPipelineChart />
		{/if}
	</section>

	<!-- Cache Tier Legend -->
	<section class="space-y-3">
		<h2 class="text-lg font-semibold text-sand/80 border-b border-sand/10 pb-2">Cache Tier Architecture</h2>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
			<div class="p-3 rounded-lg border border-sand/10 bg-panel/50">
				<span class="font-bold text-accent">L0 — LokiJS</span>
				<p class="text-sand/50 mt-1">In-memory session cache. 5-10min TTL. Fastest access.</p>
			</div>
			<div class="p-3 rounded-lg border border-sand/10 bg-panel/50">
				<span class="font-bold text-info">L1 — IndexedDB</span>
				<p class="text-sand/50 mt-1">Browser persistent. 7-day TTL. Survives refresh. CHR-ROM97 cartridges.</p>
			</div>
			<div class="p-3 rounded-lg border border-sand/10 bg-panel/50">
				<span class="font-bold text-warning">L2 — Memory Cache</span>
				<p class="text-sand/50 mt-1">Server in-process Map. 5min TTL. Per-request caching.</p>
			</div>
			<div class="p-3 rounded-lg border border-sand/10 bg-panel/50">
				<span class="font-bold text-danger">L3 — Redis</span>
				<p class="text-sand/50 mt-1">Server shared cache. Configurable TTL. Cross-request. Pub/sub sync.</p>
			</div>
		</div>
	</section>
</div>
