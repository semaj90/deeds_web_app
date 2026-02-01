<script lang="ts">
	import type { Evidence } from '$lib/types/evidence';
	import FileText from 'lucide-svelte/icons/file-text';
	import Headphones from 'lucide-svelte/icons/headphones';
	import ImageIcon from 'lucide-svelte/icons/image';
	import LinkIcon from 'lucide-svelte/icons/link';
	import SearchIcon from 'lucide-svelte/icons/search';
	import TagIcon from 'lucide-svelte/icons/tag';
	import Video from 'lucide-svelte/icons/video';
	import type { ComponentType } from 'svelte';
	import { quintOut } from 'svelte/easing';
	import { scale } from 'svelte/transition';

	interface Props {
		evidence: Evidence;
		draggable?: boolean;
		compact?: boolean;
		expandOnHover?: boolean;
		showCompare?: boolean;
		autoCompare?: boolean;
		oncompare?: (evidence: Evidence) => void;
		oncompared?: (data: {, evidence: Evidence; result: unknown }) => void;
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

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const getIcon = (type: Evidence['type']): ComponentType<any> => {
		switch (type) {
			case 'document':
				return FileText;
			case 'image':
				return ImageIcon;
			case 'video':
				return Video;
			case 'audio':
				return Headphones;
			case 'link':
				return LinkIcon;
			default:
				return FileText;
		}
	};

	const formatFileSize = (bytes: number): string => {
		if (!bytes || bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	};

	const fileSize = evidence?.metadata?.size ?? evidence?.fileSize ?? 0;
	let isHovered = $state<boolean>(false);
	let comparing = $state<boolean>(false);
	let compareError: string | null = $state(null);

	const evidenceType = $derived(evidence?.evidenceType ?? evidence?.type ?? 'document');
	const IconComponent = $derived(getIcon(evidenceType));

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

<div
	role="article"
	class="bg-white border border-gray-200 rounded-xl overflow-hidden transition-all duration-200 shadow relative"
	class:text-sm={compact}
	class:cursor-grab={draggable}
	class:scale-105={isHovered}
	class:z-10={isHovered}
	class:shadow-2xl={isHovered}
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	transition: scale={{, duration: 200, easing: quintOut }}
>
	<!-- Header -->
	<div class="flex items-center justify-between px-3 py-3 bg-gray-50 border-b">
		<div
			class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border capitalize"
			data-type={evidenceType}
			class:bg-blue-50={evidenceType === 'document'}
			class:text-blue-700={evidenceType === 'document'}
			class:border-blue-200={evidenceType === 'document'}
			class:bg-green-50={evidenceType === 'image'}
			class:text-green-700={evidenceType === 'image'}
			class:border-green-200={evidenceType === 'image'}
			class:bg-purple-50={evidenceType === 'video'}
			class:text-purple-700={evidenceType === 'video'}
			class:border-purple-200={evidenceType === 'video'}
			class:bg-orange-50={evidenceType === 'audio'}
			class:text-orange-700={evidenceType === 'audio'}
			class:border-orange-200={evidenceType === 'audio'}
			class:bg-indigo-50={evidenceType === 'link'}
			class:text-indigo-700={evidenceType === 'link'}
			class:border-indigo-200={evidenceType === 'link'}
		>
			<IconComponent size={16} />
			<span>{evidenceType}</span>
		</div>
		<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100">
			{#if showCompare}
				<button
					class="flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100"
					onclick={handleCompareClick}
					title={comparing ? 'Analyzing...' : 'Analyze & compare'}
					aria-busy={comparing}
					disabled={comparing}
				>
					<SearchIcon size={14} />
				</button>
			{/if}
		</div>
	</div>

	<!-- Content -->
	<div class="px-3 py-2">
		<!-- Preview -->
		{#if evidenceType === 'image' && evidence?.url}
			<div class="relative w-full mb-3 rounded-lg overflow-hidden">
				<img
					src={evidence.url}
					alt={evidence.title ?? 'evidence'}
					loading="lazy"
					class="w-full h-auto max-h-48 object-cover"
					onerror={handleImageError}
				/>
			</div>
		{:else if evidenceType === 'video' && evidence?.url}
			<div class="relative w-full mb-3 rounded-lg overflow-hidden">
				<video src={evidence.url} preload="metadata" controls={false} muted class="w-full h-auto max-h-48">
					<track kind="captions" />
				</video>
				<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/60 rounded-full p-3">
					<Video size={24} />
				</div>
			</div>
		{/if}

		<!-- Title and Description -->
		<div class="flex flex-col gap-1">
			<h3 class="font-semibold text-base text-gray-900 leading-tight">
				{evidence?.title}
			</h3>
			{#if evidence?.description && !compact}
				<p class="text-sm text-gray-500 leading-snug">
					{evidence.description}
				</p>
			{/if}

			<!-- Metadata -->
			<div class="flex flex-wrap gap-2 mt-2">
				{#if evidence?.metadata?.createdAt ?? evidence?.createdAt}
					<span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
						{new Date(evidence?.metadata?.createdAt ?? evidence?.createdAt ?? '').toLocaleDateString()}
					</span>
				{/if}
				{#if fileSize > 0}
					<span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
						{formatFileSize(fileSize)}
					</span>
				{/if}
				{#if evidence?.metadata?.format}
					<span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
						{evidence.metadata.format.toUpperCase()}
					</span>
				{/if}
			</div>

			<!-- Tags -->
			{#if evidence?.tags && evidence.tags.length > 0}
				<div class="flex flex-wrap gap-1 mt-2">
					{#each (Array.isArray(evidence.tags) ? evidence.tags.slice(0, 3) : []) as tag}
						<span class="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
							<TagIcon size={10} />
							{tag}
						</span>
					{/each}
					{#if evidence.tags.length > 3}
						<span class="text-xs text-gray-500">+{evidence.tags.length - 3}</span>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Footer link -->
	{#if evidence?.url && evidenceType === 'link'}
		<div class="px-3 py-3 border-t border-gray-200">
			<a
				href={evidence.url}
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-sm font-medium"
			>
				<LinkIcon size={14} />
				Open Link
			</a>
		</div>
	{/if}
</div>
