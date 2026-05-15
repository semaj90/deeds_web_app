<script lang="ts">
	import StatsPanel from '$lib/components/StatsPanel.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	const demoStats = {
		total: 247,
		active: 142,
		highRisk: 38,
		aiGenerated: 85,
		byPriority: { low: 67, medium: 89, high: 53, critical: 38 },
		byStatus: { active: 142, inactive: 68, archived: 37 }
	};

</script>

<div class="p-6 max-w-3xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Stats Panel</h1>
		<p class="text-sm opacity-60">Priority distribution bars, status breakdown, risk metrics, and AI generation percentages with expandable detail view.</p>
	</header>
	<StatsPanel stats={demoStats} />
</div>
