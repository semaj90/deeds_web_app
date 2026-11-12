<script lang="ts">
	import DetectiveModeCanvas from '$lib/components/evidence/DetectiveModeCanvas.svelte';

	const { data }: { data: any } = $props();
	const caseData = $derived(data?.caseData);
	const caseId = $derived(caseData?.id ?? '');
	const caseTitle = $derived(caseData?.title ?? 'Case unavailable');
</script>

<svelte:head>
	<title>Detective Mode Evidence Canvas — {caseTitle}</title>
</svelte:head>

<div class="h-[calc(100vh-100px)] w-full overflow-hidden">
	{#if caseId}
		<DetectiveModeCanvas {caseId} {caseTitle} evidenceItems={data?.evidence ?? []} />
	{:else}
		<div class="m-6 rounded-xl border border-stone-300 bg-stone-50 p-6 text-stone-700" role="status">
			This case is unavailable. Return to the case list and open an authorized case.
		</div>
	{/if}
</div>
