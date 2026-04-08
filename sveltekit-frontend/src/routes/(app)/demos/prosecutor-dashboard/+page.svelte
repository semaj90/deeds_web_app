<script lang="ts">
	import PhoenixProsecutorDashboard from '$lib/components/yorha/PhoenixProsecutorDashboard.svelte';
	export const ssr = false;
</script>

<div class="p-4">
	<header class="mb-4">
		<h1 class="text-xl font-bold mb-1">Phoenix Prosecutor Dashboard</h1>
		<p class="text-sm opacity-60">Ace Attorney-style prosecution dashboard with evidence comparison, contradiction reveal, event monitor, and prosecutor mode controls.</p>
	</header>
	<PhoenixProsecutorDashboard caseId="demo-case-001" />
</div>