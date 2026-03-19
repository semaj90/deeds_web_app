<script lang="ts">
	import InvestigationShell from '$lib/components/shells/InvestigationShell.svelte';

	let { children } = $props();
</script>

<InvestigationShell title="Evidence" subtitle="Evidence Management & Analysis">
	{@render children()}
</InvestigationShell>
