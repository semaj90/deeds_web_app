<script lang="ts">
	import TournamentExpBar from '$lib/components/admin/parents-atlas/TournamentExpBar.svelte';

	const { data, children } = $props();
</script>

<div class="tournament-shell">
	<TournamentExpBar
		progress={data.tournament.progress}
		gates={data.tournament.gates}
		agentic={data.tournament.agenticTelemetry}
		cache={data.tournament.cacheTelemetry}
	/>
</div>

{@render children()}

<style>
	.tournament-shell {
		position: relative;
		z-index: 2;
		max-width: 1600px;
		margin: 0 auto;
		padding: 1.5rem 1.5rem 0;
		background: radial-gradient(circle at 50% 0%, #1e1b4b 0%, #0a0a0f 80%);
	}
</style>
