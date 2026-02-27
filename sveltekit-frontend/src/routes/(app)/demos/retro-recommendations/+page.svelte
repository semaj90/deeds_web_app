<script lang="ts">
	import RetroRecommendationModal from '$lib/components/ui/gaming/modals/RetroRecommendationModal.svelte';

	let showModal = $state(true);
</script>

<div class="max-w-4xl mx-auto py-8 px-6">
	<div class="mb-6">
		<h1 class="text-2xl font-bold m-0 mb-2">Retro Recommendation Engine</h1>
		<p class="text-sm opacity-50 m-0">NES-style AI recommendation modal with multi-modal scoring, category filters, sort controls, and signal tokens.</p>
	</div>

	<button
		class="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:bg-accent/80 transition"
		onclick={() => showModal = true}
	>
		Open Recommendation Modal
	</button>

	<RetroRecommendationModal
		bind:open={showModal}
		onclose={() => showModal = false}
		onselect={(rec) => console.log('Selected:', rec)}
	/>
</div>
