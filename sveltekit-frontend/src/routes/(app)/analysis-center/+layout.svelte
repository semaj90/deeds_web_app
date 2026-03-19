<script lang="ts">
	import InvestigationShell from '$lib/components/shells/InvestigationShell.svelte';

	let { children } = $props();
</script>

<InvestigationShell title="Analysis Center" subtitle="Multi-Tool Investigation Hub">
	{@render children()}
</InvestigationShell>
