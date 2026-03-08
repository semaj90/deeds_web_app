<script lang="ts">
	import RecommendationWidget from '$lib/components/recommendations/RecommendationWidget.svelte';
	import RecommendationEngine from '$lib/components/ai/RecommendationEngine.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface UserPreferences {
		topicPreferences: Array<{ topicId: number; weight: number }>;
		recentInteractions: Array<{
			documentId: string;
			interactionType: string;
			timestamp: string;
			searchContext?: string;
		}>;
		stats: {
			totalInteractions: number;
			uniqueDocuments: number;
			topInteractionType: string;
		};
	}

	let query = $state('');
	let activeQuery = $state('legal case analysis');
	let caseId = $state('');
	let preferences = $state<UserPreferences | null>(null);
	let prefsLoading = $state(false);
	let prefsError = $state<string | null>(null);
	let activeTab = $state<'documents' | 'strategy'>('documents');
	let appliedRecommendations = $state<string[]>([]);
	let gpuRerank = $state(false);

	// Fetch user preferences on mount
	$effect(() => {
		fetchPreferences();
	});

	async function fetchPreferences() {
		prefsLoading = true;
		prefsError = null;
		try {
			const res = await fetch('/api/recommendations');
			if (res.ok) {
				const data = await res.json();
				if (data.success) {
					preferences = data.data;
				}
			}
		} catch (err) {
			prefsError = err instanceof Error ? err.message : 'Failed to load preferences';
		} finally {
			prefsLoading = false;
		}
	}

	function handleSearch() {
		if (query.trim()) {
			activeQuery = query.trim();
		}
	}

	function handleDocumentSelect(doc: any) {
		activeQuery = doc.title || 'document analysis';
	}

	function handleStrategyApply(recommendation: any) {
		appliedRecommendations = [...appliedRecommendations, recommendation.id];
	}

	function getInteractionIcon(type: string): string {
		const icons: Record<string, string> = {
			view: 'eye',
			click: 'mouse-pointer-click',
			save: 'bookmark',
			share: 'share-2',
			dismiss: 'x'
		};
		return icons[type] || 'activity';
	}
</script>

<svelte:head>
	<title>AI Recommendations - Personalized Intelligence</title>
</svelte:head>

<div class="max-w-7xl mx-auto p-6 space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Icon name="sparkles" size="xl" class="text-accent" />
			<div>
				<h1 class="text-3xl font-bold text-sand-12">AI Recommendations</h1>
				<p class="text-sand-11 mt-1">
					5-signal multi-modal ranking + legal strategy engine
				</p>
			</div>
		</div>
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="px-4 py-2 rounded text-sm transition-colors {activeTab === 'documents' ? 'bg-accent text-white' : 'bg-panel-soft text-sand-11 hover:text-sand-12'}"
				onclick={() => { activeTab = 'documents'; }}
			>
				<span class="flex items-center gap-2">
					<Icon name="file-text" size="sm" />
					Document Recommendations
				</span>
			</button>
			<button
				type="button"
				class="px-4 py-2 rounded text-sm transition-colors {activeTab === 'strategy' ? 'bg-accent text-white' : 'bg-panel-soft text-sand-11 hover:text-sand-12'}"
				onclick={() => { activeTab = 'strategy'; }}
			>
				<span class="flex items-center gap-2">
					<Icon name="brain" size="sm" />
					Strategy Engine
				</span>
			</button>
		</div>
	</div>

	<!-- Search Bar -->
	<div class="panel p-4">
		<form onsubmit={(e) => { e.preventDefault(); handleSearch(); }} class="flex gap-3">
			<div class="flex-1 relative">
				<Icon name="search" size="sm" class="absolute left-3 top-1/2 -translate-y-1/2 text-sand-10" />
				<input
					type="text"
					bind:value={query}
					placeholder="Search for recommendations... (e.g., contract dispute evidence, defense strategy)"
					class="w-full pl-10 pr-4 py-2.5 rounded bg-panel-soft border border-sand-6 text-sand-12 placeholder-sand-10 focus:border-accent focus:outline-none"
				/>
			</div>
			<input
				type="text"
				bind:value={caseId}
				placeholder="Case ID (optional)"
				class="w-48 px-4 py-2.5 rounded bg-panel-soft border border-sand-6 text-sand-12 placeholder-sand-10 focus:border-accent focus:outline-none"
			/>
			<Button onclick={handleSearch}>Search</Button>
		</form>
	</div>

	<!-- Signal Weights Legend -->
	<div class="panel p-4">
		<div class="flex items-center gap-2 mb-3">
			<Icon name="sliders" size="sm" class="text-accent" />
			<h3 class="text-sm font-medium text-sand-12">5-Signal Ranking System</h3>
		</div>
		<div class="grid grid-cols-5 gap-3">
			<div class="text-center">
				<div class="text-lg font-bold text-accent">35%</div>
				<div class="text-xs text-sand-11">Vector Similarity</div>
				<div class="text-xs text-sand-10">Embedding cosine</div>
			</div>
			<div class="text-center">
				<div class="text-lg font-bold text-accent">20%</div>
				<div class="text-xs text-sand-11">Tag Overlap</div>
				<div class="text-xs text-sand-10">Jaccard similarity</div>
			</div>
			<div class="text-center">
				<div class="text-lg font-bold text-accent">20%</div>
				<div class="text-xs text-sand-11">Topic Affinity</div>
				<div class="text-xs text-sand-10">K-means clusters</div>
			</div>
			<div class="text-center">
				<div class="text-lg font-bold text-accent">15%</div>
				<div class="text-xs text-sand-11">Graph Centrality</div>
				<div class="text-xs text-sand-10">Neo4j connections</div>
			</div>
			<div class="text-center">
				<div class="text-lg font-bold text-accent">10%</div>
				<div class="text-xs text-sand-11">Profile Match</div>
				<div class="text-xs text-sand-10">User preferences</div>
			</div>
		</div>
	</div>

	<!-- Main Content -->
	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Left: Main Recommendations Area -->
		<div class="lg:col-span-2">
			{#if activeTab === 'documents'}
				<RecommendationWidget
					query={activeQuery}
					{caseId}
					onSelect={handleDocumentSelect}
					limit={10}
					enableGPURerank={gpuRerank}
				/>
			{:else}
				<RecommendationEngine
					{caseId}
					contextQuery={activeQuery}
					onapply={handleStrategyApply}
				/>
			{/if}
		</div>

		<!-- Right: User Profile & History -->
		<div class="space-y-4">
			<!-- User Preferences Panel -->
			<div class="panel p-4 space-y-3">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Icon name="user" size="sm" class="text-accent" />
						<h3 class="text-sm font-medium text-sand-12">Your Profile</h3>
					</div>
					<button
						type="button"
						onclick={fetchPreferences}
						class="p-1 rounded hover:bg-accent/10 text-sand-11"
						title="Refresh"
					>
						<Icon name="refresh-cw" size="sm" class={prefsLoading ? 'animate-spin' : ''} />
					</button>
				</div>

				{#if prefsError}
					<div class="text-xs text-danger">{prefsError}</div>
				{:else if preferences}
					<!-- Interaction Stats -->
					<div class="grid grid-cols-2 gap-2">
						<div class="panel-soft p-2 text-center">
							<div class="text-lg font-bold text-sand-12">{preferences.stats?.totalInteractions ?? 0}</div>
							<div class="text-xs text-sand-11">Interactions</div>
						</div>
						<div class="panel-soft p-2 text-center">
							<div class="text-lg font-bold text-sand-12">{preferences.stats?.uniqueDocuments ?? 0}</div>
							<div class="text-xs text-sand-11">Documents</div>
						</div>
					</div>

					<!-- Topic Preferences -->
					{#if preferences.topicPreferences?.length > 0}
						<div>
							<div class="text-xs font-medium text-sand-11 mb-2">Topic Preferences</div>
							<div class="space-y-1">
								{#each preferences.topicPreferences.slice(0, 5) as pref}
									<div class="flex items-center gap-2">
										<div class="text-xs text-sand-11 w-16">Topic {pref.topicId}</div>
										<div class="flex-1 h-1.5 bg-sand-4 rounded overflow-hidden">
											<div
												class="h-full bg-accent rounded"
												style="width: {Math.round(pref.weight * 100)}%"
											></div>
										</div>
										<div class="text-xs text-sand-10 w-10 text-right">{Math.round(pref.weight * 100)}%</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Recent Interactions -->
					{#if preferences.recentInteractions?.length > 0}
						<div>
							<div class="text-xs font-medium text-sand-11 mb-2">Recent Activity</div>
							<div class="space-y-1.5 max-h-48 overflow-y-auto">
								{#each preferences.recentInteractions.slice(0, 8) as interaction}
									<div class="flex items-center gap-2 text-xs">
										<Icon name={getInteractionIcon(interaction.interactionType)} size="sm" class="text-sand-10 flex-shrink-0" />
										<div class="flex-1 min-w-0">
											<div class="text-sand-12 truncate">{interaction.searchContext || interaction.documentId}</div>
											<div class="text-sand-10">{new Date(interaction.timestamp).toLocaleDateString()}</div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{:else if prefsLoading}
				<div class="space-y-3 py-2">
					<div class="grid grid-cols-2 gap-2">
						<div class="panel-soft p-2 text-center animate-pulse">
							<div class="h-6 w-10 mx-auto bg-sand-6 rounded mb-1"></div>
							<div class="h-3 w-16 mx-auto bg-sand-6 rounded"></div>
						</div>
						<div class="panel-soft p-2 text-center animate-pulse">
							<div class="h-6 w-10 mx-auto bg-sand-6 rounded mb-1"></div>
							<div class="h-3 w-16 mx-auto bg-sand-6 rounded"></div>
						</div>
					</div>
					<div class="space-y-1.5">
						<div class="h-3 w-24 bg-sand-6 rounded animate-pulse"></div>
						<div class="h-1.5 w-full bg-sand-4 rounded animate-pulse"></div>
						<div class="h-1.5 w-3/4 bg-sand-4 rounded animate-pulse"></div>
						<div class="h-1.5 w-1/2 bg-sand-4 rounded animate-pulse"></div>
					</div>
				</div>
				{:else}
					<div class="text-xs text-sand-11 py-4 text-center">
						No interaction history yet. Start searching to build your profile.
					</div>
				{/if}
			</div>

			<!-- Applied Recommendations -->
			{#if appliedRecommendations.length > 0}
				<div class="panel p-4 space-y-2">
					<div class="flex items-center gap-2">
						<Icon name="check-circle" size="sm" class="text-emerald-400" />
						<h3 class="text-sm font-medium text-sand-12">Applied ({appliedRecommendations.length})</h3>
					</div>
					<div class="text-xs text-sand-11">
						{appliedRecommendations.length} recommendation{appliedRecommendations.length > 1 ? 's' : ''} applied this session
					</div>
				</div>
			{/if}

			<!-- GPU Rerank Toggle -->
			<div class="panel p-4 space-y-2">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Icon name="cpu" size="sm" class="text-emerald-400" />
						<h3 class="text-sm font-medium text-sand-12">GPU Reranking</h3>
					</div>
					<button
						type="button"
						class="w-10 h-5 rounded-full transition-colors {gpuRerank ? 'bg-emerald-500' : 'bg-sand-6'}"
						onclick={() => { gpuRerank = !gpuRerank; }}
					>
						<div class="w-4 h-4 rounded-full bg-white transition-transform {gpuRerank ? 'translate-x-5' : 'translate-x-0.5'}"></div>
					</button>
				</div>
				<p class="text-xs text-sand-11">
					{gpuRerank ? 'WebGPU cosine similarity active — blending 70% server + 30% GPU scores' : 'Enable client-side GPU reranking via RTX 3060 Ti'}
				</p>
			</div>

			<!-- Architecture Info -->
			<div class="panel p-4 space-y-2">
				<div class="flex items-center gap-2">
					<Icon name="cpu" size="sm" class="text-accent" />
					<h3 class="text-sm font-medium text-sand-12">Architecture</h3>
				</div>
				<ul class="text-xs text-sand-11 space-y-1.5">
					<li class="flex items-start gap-1.5">
						<Icon name="check" size="sm" class="text-accent mt-0.5 flex-shrink-0" />
						<span>Multi-modal ranker (5 signals)</span>
					</li>
					<li class="flex items-start gap-1.5">
						<Icon name="check" size="sm" class="text-accent mt-0.5 flex-shrink-0" />
						<span>K-means++ topic clustering (k=15)</span>
					</li>
					<li class="flex items-start gap-1.5">
						<Icon name="check" size="sm" class="text-accent mt-0.5 flex-shrink-0" />
						<span>User history with 7-day decay</span>
					</li>
					<li class="flex items-start gap-1.5">
						<Icon name="check" size="sm" class="text-accent mt-0.5 flex-shrink-0" />
						<span>WebGPU cosine similarity (RTX 3060 Ti)</span>
					</li>
					<li class="flex items-start gap-1.5">
						<Icon name="check" size="sm" class="text-accent mt-0.5 flex-shrink-0" />
						<span>Qdrant vector search (768-dim)</span>
					</li>
					<li class="flex items-start gap-1.5">
						<Icon name="check" size="sm" class="text-accent mt-0.5 flex-shrink-0" />
						<span>ACE context engine (7 sources)</span>
					</li>
					<li class="flex items-start gap-1.5">
						<Icon name="check" size="sm" class="text-accent mt-0.5 flex-shrink-0" />
						<span>Neo4j graph centrality (degree)</span>
					</li>
				</ul>
			</div>
		</div>
	</div>
</div>
