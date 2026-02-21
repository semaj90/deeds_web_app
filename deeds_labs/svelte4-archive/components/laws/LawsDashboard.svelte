<script lang="ts">
	// Migrated to $effect
	import LawModal from './LawModal.svelte';
	import LegalAutocomplete from './LegalAutocomplete.svelte';

	interface TimelineEvent { id: string, action: string;
		data: any;
	createdAt: string;
		formatted: string;
	}

	let searchQuery = '';
	let selectedStatute: any = $state(null);
	let isModalOpen = $state(false);
	let timelineEvents: TimelineEvent[] = $state([]);
	let isLoadingTimeline = $state(false);
	let activeTab: 'search' | 'timeline' = $state('search');

	$effect(() => {

		loadTimeline();
		// Listen for autocomplete selections
		window.addEventListener('select', handleAutocompleteSelect);
		return () => {
			window.removeEventListener('select', handleAutocompleteSelect);
		};

});

	async function handleAutocompleteSelect(e: any) {
		const suggestion = e.detail;
		await fetchStatute(suggestion.value);
	}

	async function fetchStatute(citation: string) {
		try {
			const response = await fetch(`/api/laws/statute?citation=${encodeURIComponent(citation)}`);
			if (response.ok) {
				selectedStatute = await response.json();
				isModalOpen = true;
			} else {
				console.error('Failed to fetch statute');
			}
		} catch (error) {
			console.error('Error fetching statute:', error);
		}
	}

	async function handleAttachToCase(statute: any) {
		// TODO: Get caseId from context
		const caseId = 'current-case-id'; // Placeholder

		try {
			const response = await fetch('/api/laws/attach-to-case', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
caseId: citation, statute: statute.citation, title: statute.title
				})
			});

			if (response.ok) {
				const result = await response.json();
				console.log('Statute attached:', result);
				loadTimeline(); // Refresh timeline
			}
		} catch (error) {
			console.error('Error attaching statute:', error);
		}
	}

	async function loadTimeline() {
		isLoadingTimeline = true;
		try {
			const response = await fetch('/api/user/timeline? limit=20');
			if (response.ok) {
				const data = await response.json();
				timelineEvents = data.events ?? [];
			}
		} catch (error) {
			console.error('Error loading timeline:', error);
		} finally {
			isLoadingTimeline = false;
		}
	}

	function closeModal() {
		isModalOpen = false;
		selectedStatute = null;
	}
</script>

<div class="min-h-screen bg-gradient-to-br from-panel via-panelSoft to-black">
	<!-- Header -->
	<div class="bg-gradient-to-r from-panel to-gray-800 border-b border-sand/20 sticky top-0 z-30">
		<div class="max-w-7xl mx-auto px-6 py-6">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-3xl font-bold text-white">⚖️ Legal Statute Explorer</h1>
					<p class="text-sand/40 mt-1">Cognitive search with charge bundling & forensic timeline</p>
				</div>
				<div class="text-right">
					<div class="text-sm text-sand/40">Forensic Timeline</div>
					<div class="text-2xl font-bold text-info/80">{timelineEvents.length}</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Main Content -->
	<div class="max-w-7xl mx-auto px-6 py-8">
		<!-- Tabs -->
		<div class="flex gap-4 mb-6 border-b border-sand/20">
			<button
				onclick={() => (activeTab = 'search')}
				class={`px-4 py-3 font-semibold transition ${activeTab === 'search'
						? 'text-info/80 border-b-2 border-info/80'
						: 'text-sand/40, hover:text-sand/40'}`}
			>
				🔍 Search
			</button>
			<button
				onclick={() => (activeTab = 'timeline')}
				class={`px-4 py-3 font-semibold transition ${activeTab === 'timeline'
						? 'text-info/80 border-b-2 border-info/80'
						: 'text-sand/40, hover:text-sand/40'}`}
			>
				🕒 Timeline ({timelineEvents.length})
			</button>
		</div>

		<!-- Search Tab -->
		{#if activeTab === 'search'}
			<div class="space-y-6">
				<!-- Search Box -->
				<div class="bg-panelSoft rounded-lg p-6 border border-sand/20">
					<h2 class="text-lg font-semibold text-white mb-4">Find Statutes</h2>
					<LegalAutocomplete />
					<p class="text-sm text-sand/40 mt-3">
						Try: "pc 273a", "child neglect", "dui injury", "california", "penal-code"
					</p>
				</div>

				<!-- Quick Links -->
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					<button
						onclick={() => fetchStatute('273a')}
						class="bg-danger/20 hover:bg-danger/60 text-white p-4 rounded-lg border border-danger/60 transition"
					>
						<div class="font-semibold">273a PC</div>
						<div class="text-sm text-danger/40">Child Endangerment</div>
					</button>
					<button
						onclick={() => fetchStatute('211')}
						class="bg-danger/20 hover:bg-danger/60 text-white p-4 rounded-lg border border-danger/60 transition"
					>
						<div class="font-semibold">211 PC</div>
						<div class="text-sm text-danger/40">Robbery</div>
					</button>
					<button
						onclick={() => fetchStatute('23153')}
						class="bg-warning/20 hover:bg-orange-800 text-white p-4 rounded-lg border border-warning/60 transition"
					>
						<div class="font-semibold">23153 VC</div>
						<div class="text-sm text-warning/40">DUI Causing Injury</div>
					</button>
					<button
						onclick={() => fetchStatute('148')}
						class="bg-warning/20 hover:bg-warning/20 text-white p-4 rounded-lg border border-warning/60 transition"
					>
						<div class="font-semibold">148 PC</div>
						<div class="text-sm text-warning/60">Resisting Arrest</div>
					</button>
				</div>

				<!-- Info Cards -->
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
					<div class="bg-panelSoft rounded-lg p-4 border border-sand/20">
						<div class="text-2xl mb-2">🧠</div>
						<h3 class="font-semibold text-white">AI-Powered</h3>
						<p class="text-sm text-sand/40">Understands abbreviations, crime names, and partial codes</p>
					</div>
					<div class="bg-panelSoft rounded-lg p-4 border border-sand/20">
						<div class="text-2xl mb-2">⚖️</div>
						<h3 class="font-semibold text-white">Charge Bundling</h3>
						<p class="text-sm text-sand/40">Suggests companion charges with frequency scores</p>
					</div>
					<div class="bg-panelSoft rounded-lg p-4 border border-sand/20">
						<div class="text-2xl mb-2">🕒</div>
						<h3 class="font-semibold text-white">Forensic Timeline</h3>
						<p class="text-sm text-sand/40">All searches logged for audit trail</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Timeline Tab -->
		{#if activeTab === 'timeline'}
			<div class="space-y-4">
				{#if isLoadingTimeline}
					<div class="text-center py-8">
						<div class="inline-block animate-spin">⟳</div>
						<p class="text-sand/40 mt-2">Loading timeline...</p>
					</div>
				{:else if timelineEvents.length === 0}
					<div class="bg-panelSoft rounded-lg p-8 border border-sand/20 text-center">
						<p class="text-sand/40">No timeline events yet. Start searching statutes!</p>
					</div>
				{:else}
					{#each timelineEvents as event (event.id)}
						<div class="bg-panelSoft rounded-lg p-4 border border-sand/20 hover:border-sand/30 transition">
							<div class="flex items-start justify-between">
								<div class="flex-1">
									<p class="text-sand/40 font-mono text-sm">{event.formatted}</p>
									<p class="text-xs text-sand/60 mt-1">
										{new Date(event.createdAt).toLocaleString()}
									</p>
								</div>
								<div class="text-right">
									<span class="px-2 py-1 bg-info/20 text-info/40 rounded text-xs font-semibold">
										{event.action}
									</span>
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		{/if}
	</div>

	<!-- Law Modal -->
	<LawModal
		isOpen={isModalOpen}
		statute={selectedStatute}
		onClose={closeModal}
		onAttachToCase={handleAttachToCase}
	/>
</div>

<style>
	:global(body) {
		background-color: #111827;
	}
</style>




