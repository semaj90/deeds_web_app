<script lang="ts">
	import EvidenceViewModal from '$lib/components/evidence/EvidenceViewModal.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
	let open = $state(true);
</script>

<svelte:head>
	<title>Evidence video viewer fixture</title>
</svelte:head>

<main aria-label="Video viewer browser fixture">
	<EvidenceViewModal bind:open evidenceId={data.evidenceId} caseId={data.caseId} />
</main>
