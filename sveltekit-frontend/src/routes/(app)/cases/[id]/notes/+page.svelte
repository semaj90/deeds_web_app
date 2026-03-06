<script lang="ts">
	import CaseNotesEditor from '$lib/components/cases/CaseNotesEditor.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const caseId = $derived(data?.caseData?.id ?? '');
</script>

{#if caseId}
	<CaseNotesEditor {caseId} />
{:else}
	<div class="p-8 text-center text-black/60">
		<p>Case not found or still loading.</p>
	</div>
{/if}
