<script lang="ts">
	import ResearchShell from '$lib/components/shells/ResearchShell.svelte';

	let { children } = $props();
</script>

<ResearchShell title="" showSidebar={true}>
	{@render children()}
</ResearchShell>