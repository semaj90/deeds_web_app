<script lang="ts">
	import Button from '$lib/components/ui/button/Button.svelte';
	import { Content as DialogContent, Description as DialogDescription, Overlay as DialogOverlay, Portal as DialogPortal, Root as DialogRoot, Title as DialogTitle } from '$lib/components/ui/dialog';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	// ═══════════════════════════════════════════════════════════════════════
	// Phase 89: RAG+KAG Powered Error Analysis UI
	// Features: Agentic recommendations, next steps, timestamp tracking
	// ═══════════════════════════════════════════════════════════════════════

	let { data }: { data: PageData } = $props();

	let analysisData = $state<any>(null);
	let selectedCluster = $state<any>(null);
	let dialogOpen = $state(false);
	let loading = $state(false);
	let agenticLogs = $state<string[]>([]);
	let showRecommendations = $state(true);

	// Load enhanced analysis from API
	async function loadAnalysis() {
		loading = true;
		try {
			const response = await fetch('/api/phase89/analyze');
			const result = await response.json();

			if (result.success) {
				analysisData = result;
			} else {
				console.error('Analysis failed:', result.error);
			}
		} catch (err) {
			console.error('Failed to load analysis:', err);
		} finally {
			loading = false;
		}
	}

	// Execute agentic fix with function tool calling
	async function executeAgenticFix(clusterId: number) {
		agenticLogs = [`🚀 Starting agentic fix for cluster #${clusterId}...`];

		try {
			const response = await fetch('/api/phase89/agentic-fix', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ cluster_id: clusterId, enable_tools: true })
			});

			if (!response.body) throw new Error('No response body');

			const reader = response.body.getReader();
			const decoder = new TextDecoder();

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value);
				const lines = chunk.split('\n');

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = JSON.parse(line.slice(6));
						if (data.log) {
							agenticLogs = [...agenticLogs, data.log];
						}
					}
				}
			}

			agenticLogs = [...agenticLogs, '✅ Agentic fix completed!'];

			// Reload analysis
			await loadAnalysis();

		} catch (err) {
			agenticLogs = [...agenticLogs, `❌ Error: ${err}`];
		}
	}

	// Execute next step command
	async function executeNextStep(command: string) {
		agenticLogs = [`⚡ Executing: ${command}`];

		try {
			const response = await fetch('/api/phase89/execute-command', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ command })
			});

			const result = await response.json();

			if (result.success) {
				agenticLogs = [...agenticLogs, `✅ ${result.output}`];
			} else {
				agenticLogs = [...agenticLogs, `❌ ${result.error}`];
			}

		} catch (err) {
			agenticLogs = [...agenticLogs, `❌ Error: ${err}`];
		}
	}

	onMount(() => {
		loadAnalysis();
	});
</script>

<svelte:head>
	<title>Phase 89: Error Analysis | RAG+KAG</title>
</svelte:head>

<div class="min-h-screen p-8 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
	<div class="max-w-7xl mx-auto">
		<!-- Header -->
		<header class="mb-8">
			<div class="flex items-center justify-between mb-4">
				<div>
					<h1 class="text-4xl font-bold text-white mb-2 flex items-center gap-3">
						<i class="i-carbon-data-analytics text-purple-400"></i>
						Phase 89: Error Analysis
					</h1>
					<p class="text-gray-300">
						RAG+KAG powered analysis • Agentic recommendations • Duplicate detection
					</p>
				</div>
				<Button
					onclick={() => loadAnalysis()}
					disabled={loading}
					class="bits-btn px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg disabled:opacity-50"
				>
					<i class="i-carbon-renew mr-2"></i>
					{loading ? 'Loading...' : 'Refresh Analysis'}
				</Button>
			</div>

			{#if analysisData}
				<!-- Statistics -->
				<div class="grid grid-cols-2 md, grid-cols-4 gap-4">
					<div class="p-4 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20">
						<div class="text-3xl font-bold text-purple-400">{analysisData.statistics.total_clusters}</div>
						<div class="text-sm text-gray-300">Total Clusters</div>
					</div>
					<div class="p-4 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20">
						<div class="text-3xl font-bold text-pink-400">{analysisData.statistics.total_errors}</div>
						<div class="text-sm text-gray-300">Total Errors</div>
					</div>
					<div class="p-4 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20">
						<div class="text-3xl font-bold text-red-400">{analysisData.statistics.high_priority}</div>
						<div class="text-sm text-gray-300">High Priority</div>
					</div>
					<div class="p-4 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20">
						<div class="text-3xl font-bold text-green-400">{analysisData.statistics.with_summaries}</div>
						<div class="text-sm text-gray-300">With Summaries</div>
					</div>
				</div>
			{/if}
		</header>

		<!-- Agentic Recommendations -->
		{#if analysisData && showRecommendations}
			<section class="mb-8 p-6 bg-gradient-to-r from-purple-500/10 to-pink-500/10 backdrop-blur-lg rounded-2xl border border-purple-500/30 shadow-2xl">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-2xl font-bold text-white flex items-center gap-2">
						<i class="i-carbon-ai-status text-purple-400"></i>
						Agentic Recommendations
					</h2>
					<button
						onclick={() => showRecommendations = false}
						class="text-gray-400 hover:text-white transition-colors"
						aria-label="Close recommendations"
					>
						<i class="i-carbon-close"></i>
					</button>
				</div>

				<div class="space-y-3">
					{#each analysisData.agentic_recommendations as rec}
						<div class="p-4 bg-gray-800/50 rounded-lg border border-{rec.priority === 'High' ? 'red' : rec.priority === 'Medium' ? 'yellow' : 'gray'}-500/30">
							<div class="flex items-center justify-between mb-2">
								<div class="flex items-center gap-2">
									<span class="px-2 py-1 bg-{rec.type === 'merge' ? 'blue' : rec.type === 'fix' ? 'green' : 'yellow'}-500/20 text-{rec.type === 'merge' ? 'blue' : rec.type === 'fix' ? 'green' : 'yellow'}-300 rounded text-xs font-semibold uppercase">
										{rec.type}
									</span>
									<span class="px-2 py-1 bg-{rec.priority === 'High' ? 'red' : rec.priority === 'Medium' ? 'yellow' : 'gray'}-500/20 text-{rec.priority === 'High' ? 'red' : rec.priority === 'Medium' ? 'yellow' : 'gray'}-300 rounded text-xs">
										{rec.priority} Priority
									</span>
								</div>
								<span class="text-xs text-gray-400">Clusters: {rec.affected_clusters.join(', ')}</span>
							</div>
							<p class="text-white">{rec.description}</p>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Duplicate Groups -->
		{#if analysisData && analysisData.duplicate_groups.length > 0}
			<section class="mb-8 p-6 bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 shadow-2xl">
				<h2 class="text-2xl font-bold text-white mb-4 flex items-center gap-2">
					<i class="i-carbon-warning-alt text-yellow-400"></i>
					Duplicate Clusters ({analysisData.duplicate_groups.length})
				</h2>

				<div class="space-y-3">
					{#each analysisData.duplicate_groups as group}
						<div class="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
							<div class="flex items-center justify-between mb-2">
								<span class="text-yellow-400 font-mono text-sm">{group.pattern}</span>
								<span class="px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded text-xs">
									{group.count} duplicates
								</span>
							</div>
							<p class="text-gray-300 text-sm">Cluster IDs: {group.cluster_ids.join(', ')}</p>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Error Clusters -->
		<section class="p-6 bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 shadow-2xl">
			<h2 class="text-2xl font-bold text-white mb-6 flex items-center gap-2">
				<i class="i-carbon-chart-cluster text-pink-400"></i>
				Error Clusters
			</h2>

			<div class="grid grid-cols-1 md: grid-cols-2, lg, grid-cols-3 gap-4">
				{#each analysisData?.clusters ?? [] as cluster}
					<button
						onclick={() => {
							selectedCluster = cluster;
							dialogOpen = true;
						}}
						class="p-5 bg-gray-800/50 rounded-xl border border-{cluster.priority === 'High' ? 'red' : cluster.priority === 'Medium' ? 'yellow' : 'gray'}-500/20 hover:border-{cluster.priority === 'High' ? 'red' : cluster.priority === 'Medium' ? 'yellow' : 'gray'}-500/50 transition-all hover:scale-105 text-left shadow-lg"
					>
						<div class="flex items-center justify-between mb-3">
							<span class="text-lg font-bold text-white">Cluster #{cluster.cluster_id}</span>
							<span class="px-2 py-1 bg-{cluster.priority === 'High' ? 'red' : cluster.priority === 'Medium' ? 'yellow' : 'gray'}-500/20 text-{cluster.priority === 'High' ? 'red' : cluster.priority === 'Medium' ? 'yellow' : 'gray'}-300 rounded text-xs font-semibold">
								{cluster.priority}
							</span>
						</div>

						<p class="text-gray-300 mb-3 line-clamp-2">{cluster.pattern}</p>

						<div class="flex items-center justify-between mb-3">
							<span class="text-sm text-pink-400">{cluster.error_count} errors</span>
							{#if cluster.summary}
								<span class="text-xs text-green-400 flex items-center gap-1">
									<i class="i-carbon-checkmark"></i>
									Has summary
								</span>
							{/if}
						</div>

						{#if cluster.tags && cluster.tags.length > 0}
							<div class="flex gap-2 flex-wrap">
								{#each cluster.tags.slice(0, 3) as tag}
									<span class="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs font-mono">{tag}</span>
								{/each}
								{#if cluster.tags.length > 3}
									<span class="px-2 py-1 bg-gray-500/20 text-gray-400 rounded text-xs">+{cluster.tags.length - 3}</span>
								{/if}
							</div>
						{/if}
					</button>
				{/each}
			</div>
		</section>
	</div>

	<!-- Cluster Details Dialog -->
	<DialogRoot bind:open={dialogOpen}>
		<DialogPortal>
			<DialogOverlay class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
			<DialogContent class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-900 rounded-2xl shadow-2xl border border-purple-500/30 p-8">
				{#if selectedCluster}
					<DialogTitle class="text-3xl font-bold text-white mb-2">
						Cluster #{selectedCluster.cluster_id}
					</DialogTitle>
					<DialogDescription class="text-gray-400 mb-6">
						{selectedCluster.error_count} errors • Priority: {selectedCluster.priority}
					</DialogDescription>

					<div class="h-px bg-purple-500/30 mb-6"></div>

					<!-- Pattern -->
					<div class="mb-6">
						<h3 class="text-xl font-semibold text-white mb-3">Pattern</h3>
						<p class="text-gray-300 font-mono bg-gray-800/50 p-4 rounded-lg">{selectedCluster.pattern}</p>
					</div>

					<!-- Summary -->
					{#if selectedCluster.summary}
						<div class="mb-6">
							<h3 class="text-xl font-semibold text-white mb-3">LLM Summary</h3>
							<div class="text-gray-300 bg-gray-800/50 p-4 rounded-lg">
								{selectedCluster.summary}
							</div>
							{#if selectedCluster.metadata?.summary_age_hours}
								<p class="text-xs text-gray-500 mt-2">
									Generated {selectedCluster.metadata.summary_age_hours} hours ago
								</p>
							{/if}
						</div>
					{/if}

					<!-- Recommendations -->
					{#if selectedCluster.recommendations && selectedCluster.recommendations.length > 0}
						<div class="mb-6">
							<h3 class="text-xl font-semibold text-white mb-3">Recommendations</h3>
							<ul class="space-y-2">
								{#each selectedCluster.recommendations as rec}
									<li class="text-gray-300 flex items-start gap-2">
										<i class="i-carbon-checkmark text-green-400 mt-1"></i>
										{rec}
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					<!-- Next Steps -->
					{#if selectedCluster.next_steps && selectedCluster.next_steps.length > 0}
						<div class="mb-6 p-4 bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-lg border border-green-500/30">
							<h3 class="text-xl font-semibold text-white mb-3 flex items-center gap-2">
								<i class="i-carbon-play-filled text-green-400"></i>
								Next Steps (Agentic Actions)
							</h3>
							<div class="space-y-3">
								{#each selectedCluster.next_steps as step}
									<div class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
										<div>
											<div class="text-white font-semibold mb-1">{step.action}</div>
											<code class="text-xs text-gray-400 font-mono">{step.command}</code>
										</div>
										<Button
											onclick={() => executeNextStep(step.command)}
											class="bits-btn px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
										>
											Execute
										</Button>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Agentic Fix -->
					<div class="mb-6 p-4 bg-gradient-to-r from-pink-500/10 to-purple-500/10 rounded-lg border border-pink-500/30">
						<h3 class="text-xl font-semibold text-white mb-3 flex items-center gap-2">
							<i class="i-carbon-robot text-pink-400"></i>
							Agentic Fix Pipeline
						</h3>
						<p class="text-gray-300 mb-4 text-sm">
							Full automated fix with LLM summarization, ripgrep tagging, and copilot.md/claude.md updates
						</p>
						<Button
							onclick={() => executeAgenticFix(selectedCluster.cluster_id)}
							class="bits-btn px-6 py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-semibold rounded-lg hover:from-pink-700 hover:to-purple-700 transition-all shadow-lg"
						>
							<i class="i-carbon-play-filled mr-2"></i>
							Run Full Pipeline
						</Button>

						{#if agenticLogs.length > 0}
							<div class="mt-4 p-4 bg-gray-800/50 rounded-lg max-h-64 overflow-y-auto">
								{#each agenticLogs as log}
									<p class="text-gray-300 font-mono text-xs mb-1">{log}</p>
								{/each}
							</div>
						{/if}
					</div>

					<div class="h-px bg-purple-500/30 mb-6"></div>

					<div class="flex justify-end gap-3">
						<Button
							onclick={() => dialogOpen = false}
							class="bits-btn px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
						>
							Close
						</Button>
					</div>
				{/if}
			</DialogContent>
		</DialogPortal>
	</DialogRoot>
</div>

<style>
	/* UnoCSS handles most styling */
</style>




