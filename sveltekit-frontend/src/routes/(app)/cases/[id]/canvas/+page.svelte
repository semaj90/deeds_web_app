<script lang="ts">
	import DetectiveModeCanvas from '$lib/components/evidence/DetectiveModeCanvas.svelte';

	const { data }: { data: any } = $props();
	const caseData = $derived(data?.caseData);
	const caseId = $derived(caseData?.id ?? '2007b040-8b33-4613-8fb8-72f90c8c5317');
	const caseTitle = $derived(caseData?.title ?? 'State v. Johnson - Fraud Investigation');
</script>

<svelte:head>
	<title>Detective Mode Evidence Canvas — {caseTitle}</title>
</svelte:head>

<div class="h-[calc(100vh-100px)] w-full overflow-hidden">
	<DetectiveModeCanvas
		{caseId}
		{caseTitle}
		evidenceItems={data?.evidence ?? []}
	/>
</div>
