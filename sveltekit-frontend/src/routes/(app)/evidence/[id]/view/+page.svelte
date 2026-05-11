<script lang="ts">
	import EvidenceMediaViewer from '$lib/components/evidence/EvidenceMediaViewer.svelte';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();

	const item = $derived(data.item);
	const downloadUrl = $derived(item ? `/api/evidence/${item.id}/download` : null);
	// fileUrl may be a backend storage URL (minio://, s3://, seaweed://) the browser cannot fetch.
	// Only use it directly when it's already HTTP(S); otherwise fall back to the proxying API.
	const viewerUrl = $derived(
		item?.fileUrl && /^https?:\/\//i.test(item.fileUrl) ? item.fileUrl : downloadUrl
	);
</script>

<svelte:head>
	<title>{item?.title ?? 'Evidence'} — View</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-8">
	{#if data.loadError}
		<div class="rounded-lg border border-warning bg-panelSoft p-6 text-center">
			<h1 class="mb-2 text-lg font-semibold text-warning">Cannot display evidence</h1>
			<p class="text-sm text-sand">{data.loadError}</p>
		</div>
	{:else if item}
		<header class="mb-6">
			<h1 class="text-2xl font-semibold text-sand">{item.title}</h1>
			{#if item.description}
				<p class="mt-1 text-sm text-sand opacity-75">{item.description}</p>
			{/if}
			<div class="mt-3 flex flex-wrap gap-2 text-xs text-sand opacity-60">
				{#if item.evidenceNumber}<span class="tag">#{item.evidenceNumber}</span>{/if}
				{#if item.type}<span class="tag">{item.type}</span>{/if}
				{#if item.mimeType}<span class="tag">{item.mimeType}</span>{/if}
				{#if item.fileSize}<span class="tag">{(item.fileSize / 1024).toFixed(1)} KB</span>{/if}
			</div>
		</header>

		<EvidenceMediaViewer
			url={viewerUrl}
			fileName={item.fileName}
			mimeType={item.mimeType}
			fileType={item.fileType}
			evidenceType={item.evidenceType}
			title={item.title}
		/>
	{/if}
</div>