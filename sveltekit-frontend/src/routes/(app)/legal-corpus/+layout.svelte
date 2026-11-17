<script lang="ts">
	import ResearchShell from '$lib/components/shells/ResearchShell.svelte';

	let { children } = $props();
</script>

<ResearchShell title="" showSidebar={true}>
	<div class="legal-corpus-navy" style="display: contents">
		{@render children()}
	</div>
</ResearchShell>
