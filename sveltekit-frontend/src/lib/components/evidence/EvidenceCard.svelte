<!-- EvidenceCard.svelte - Rich Media Preview + Compare (Svelte 5 + Card/Badge) -->
<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { Evidence } from '$lib/types/evidence';

	interface Props {
		evidence: Evidence;
		draggable?: boolean;
		compact?: boolean;
		expandOnHover?: boolean;
		showCompare?: boolean;
		autoCompare?: boolean;
		oncompare?: (evidence: Evidence) => void;
		oncompared?: (data: { evidence: Evidence; result: unknown }) => void;
	}

	let {
		evidence,
		draggable = true,
		compact = false,
		expandOnHover = false,
		showCompare = false,
		autoCompare = false,
		oncompare,
		oncompared
	}: Props = $props();

	const getIconName = (type: Evidence['evidenceType']): string => {
		switch (type) {
			case 'document': return 'file-text';
			case 'photo': return 'image';
			case 'video': return 'video';
			case 'audio': return 'headphones';
			case 'link' as Evidence['evidenceType']: return 'link';
			default: return 'file-text';
		}
	};

	const formatFileSize = (bytes: number): string => {
		if (!bytes || bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	};

	const fileSize = $derived(Number(evidence?.metadata?.size ?? evidence?.sizeBytes ?? 0));
	let isHovered = $state(false);
	let comparing = $state(false);
	let compareError: string | null = $state(null);

	const evidenceType = $derived(evidence?.evidenceType ?? 'document');
	const iconName = $derived(getIconName(evidenceType));

	function getTypeVariant(type: string): 'primary' | 'success' | 'warning' | 'destructive' | 'default' {
		switch (type) {
			case 'document': case 'link': return 'primary';
			case 'image': return 'success';
			case 'video': return 'primary';
			case 'audio': return 'warning';
			default: return 'default';
		}
	}

	function handleMouseEnter() {
		if (expandOnHover) isHovered = true;
	}

	function handleMouseLeave() {
		if (expandOnHover) isHovered = false;
	}

	async function handleCompareClick(): Promise<void> {
		try {
			compareError = null;
			comparing = true;
			oncompare?.(evidence);
			if (!autoCompare) return;

			const fd = new FormData();
			if ((evidence as { url?: string }).url) fd.append('fileUrl', String((evidence as { url?: string }).url));
			if (evidence.description) fd.append('text', evidence.description);
			if (Array.isArray(evidence.tags) && evidence.tags.length) fd.append('tags', evidence.tags.join(','));
			fd.append('topK', '8');

			const resp = await fetch('/api/v1/legal/compare-pdf', { method: 'POST', body: fd });
			const data = await resp.json();
			if (!resp.ok || !data?.success) throw new Error(data?.error ?? 'Comparison failed');

			oncompared?.({ evidence, result: data.data });
		} catch (e: unknown) {
			compareError = e instanceof Error ? e.message : String(e);
		} finally {
			comparing = false;
		}
	}

	function handleImageError(e: Event) {
		const target = e.target as HTMLImageElement;
		target.style.display = 'none';
	}
</script>

<Card
	variant="elevated"
	padding="none"
	class="overflow-hidden transition-all duration-200 {compact ? 'text-sm' : ''} {draggable ? 'cursor-grab' : ''} {isHovered ? 'scale-105 z-10 shadow-2xl' : ''}"
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		role="article"
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
	>
		<!-- Header -->
		<div class="flex items-center justify-between px-3 py-3 b-b b-sand/10">
			<Badge variant={getTypeVariant(evidenceType)} size="sm" class="capitalize">
				<Icon name={iconName} size={14} class="inline mr-1" />{evidenceType}
			</Badge>
			<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
				{#if showCompare}
					<button
						class="flex items-center justify-center w-7 h-7 rounded text-sand/60 hover:bg-sand/10 transition"
						onclick={handleCompareClick}
						title={comparing ? 'Analyzing...' : 'Analyze & compare'}
						aria-busy={comparing}
						disabled={comparing}
					>
						<Icon name="search" size={14} />
					</button>
				{/if}
			</div>
		</div>

		<!-- Content -->
		<div class="px-3 py-2">
			<!-- Media Preview -->
			{#if evidenceType === 'photo' && evidence?.fileUrl}
				<div class="relative w-full mb-3 rounded-lg overflow-hidden">
					<img
						src={evidence.fileUrl}
						alt={evidence.title ?? 'evidence'}
						loading="lazy"
						class="w-full h-auto max-h-48 object-cover"
						onerror={handleImageError}
					/>
				</div>
			{:else if evidenceType === 'video' && evidence?.fileUrl}
				<div class="relative w-full mb-3 rounded-lg overflow-hidden">
					<video src={evidence.fileUrl} preload="metadata" controls={false} muted class="w-full h-auto max-h-48">
						<track kind="captions" />
					</video>
					<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/60 rounded-full p-3">
						<Icon name="video" size={24} class="text-white" />
					</div>
				</div>
			{/if}

			<!-- Title and Description -->
			<div class="flex flex-col gap-1">
				<h3 class="font-semibold text-base text-sand leading-tight">{evidence?.title}</h3>
				{#if evidence?.description && !compact}
					<p class="text-sm text-sand/60 leading-snug">{evidence.description}</p>
				{/if}

				<!-- Metadata -->
				<div class="flex flex-wrap gap-2 mt-2">
					{#if evidence?.metadata?.createdAt}
						<Badge variant="default" size="sm">
							{new Date(String(evidence?.metadata?.createdAt ?? '')).toLocaleDateString()}
						</Badge>
					{/if}
					{#if fileSize > 0}
						<Badge variant="default" size="sm">{formatFileSize(fileSize)}</Badge>
					{/if}
					{#if evidence?.metadata?.format}
						<Badge variant="default" size="sm">{String(evidence.metadata.format).toUpperCase()}</Badge>
					{/if}
				</div>

				<!-- Tags -->
				{#if evidence?.tags && evidence.tags.length > 0}
					<div class="flex flex-wrap gap-1 mt-2">
						{#each (Array.isArray(evidence.tags) ? evidence.tags.slice(0, 3) : []) as tag}
							<Badge variant="primary" size="sm">
								<Icon name="tag" size={10} class="inline mr-1" />{tag}
							</Badge>
						{/each}
						{#if evidence.tags.length > 3}
							<span class="text-xs text-sand/60">+{evidence.tags.length - 3}</span>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Compare Error -->
			{#if compareError}
				<div class="mt-2 p-2 bg-danger/10 text-danger text-xs rounded">{compareError}</div>
			{/if}
		</div>

		<!-- Footer link -->
		{#if evidence?.fileUrl && (evidenceType as string) === 'link'}
			<div class="px-3 py-3 b-t b-sand/10">
				<a
					href={evidence.fileUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="flex items-center gap-1 text-info text-sm font-medium hover:underline"
				>
					<Icon name="link" size={14} />Open Link
				</a>
			</div>
		{/if}
	</div>
</Card>
