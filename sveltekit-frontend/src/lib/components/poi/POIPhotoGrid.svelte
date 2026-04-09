<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';

	export interface Photo {
		id?: string;
		url?: string;
		thumbnailUrl?: string | null;
		aiCaption?: string | null;
		aiTags?: string[];
		forensicData?: {
			hasFace?: boolean;
			hasText?: boolean;
			securityFlags?: string[];
			suspiciousElements?: string[];
		} | null;
		uploadedAt?: string;
		ai?: {
			caption?: string;
		};
	}

	interface Props {
		photos?: Photo[];
		editable?: boolean;
		onview?: (photo: Photo) => void;
		onupload?: () => void;
		ondelete?: (index: number) => void;
		onfaceMatch?: (photo: Photo) => void;
	}

	let {
		photos = [],
		editable = false,
		onview,
		onupload,
		ondelete,
		onfaceMatch,
	}: Props = $props();

	let failedSrcs = $state(new Set<string>());

	function handlePhotoClick(photo: Photo) {
		onview?.(photo);
	}

	function handleUpload() {
		onupload?.();
	}

	function handleDelete(index: number, e?: Event) {
		e?.stopPropagation?.();
		ondelete?.(index);
	}

	function handleFaceMatch(photo: Photo, e: Event) {
		e.stopPropagation();
		onfaceMatch?.(photo);
	}

	function getCaption(photo: Photo): string {
		return photo.aiCaption || photo.ai?.caption || '';
	}

	function getTags(photo: Photo): string[] {
		return photo.aiTags || [];
	}

	function hasForensicFlags(photo: Photo): boolean {
		const forensic = photo.forensicData;
		if (!forensic) return false;
		return !!(
			forensic.securityFlags?.length ||
			forensic.suspiciousElements?.length
		);
	}

	function getForensicSummary(photo: Photo): string {
		const forensic = photo.forensicData;
		if (!forensic) return '';
		const parts: string[] = [];
		if (forensic.hasFace) parts.push('Face detected');
		if (forensic.hasText) parts.push('Text detected');
		if (forensic.securityFlags?.length) parts.push(`${forensic.securityFlags.length} security flags`);
		if (forensic.suspiciousElements?.length) parts.push(`${forensic.suspiciousElements.length} suspicious elements`);
		return parts.join(', ');
	}
</script>

<div class="space-y-4">
	{#if editable}
		<div class="flex items-center justify-between">
			<h3 class="text-lg font-semibold flex items-center gap-2">
				<span class="i-lucide-camera w-5 h-5 inline-block"></span>
				POI Photos ({photos.length})
			</h3>
			<Button class="bits-btn" onclick={handleUpload} variant="outline" size="sm">
				<span class="i-lucide-upload w-4 h-4 mr-2 inline-block"></span>
				Upload Photo
			</Button>
		</div>
	{:else}
		<h3 class="text-lg font-semibold flex items-center gap-2">
			<span class="i-lucide-camera w-5 h-5 inline-block"></span>
			POI Photos ({photos.length})
		</h3>
	{/if}

	{#if photos.length === 0}
		<div class="border-2 border-dashed border-sand/20 rounded-lg p-8 text-center">
			<span class="i-lucide-camera w-12 h-12 text-sand/40 mx-auto mb-4 inline-block"></span>
			<p class="text-sand/60 mb-4">No photos uploaded yet</p>
			{#if editable}
				<Button class="bits-btn" onclick={handleUpload} variant="outline">
					<span class="i-lucide-upload w-4 h-4 mr-2 inline-block"></span>
					Upload First Photo
				</Button>
			{/if}
		</div>
	{:else}
		<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
			{#each photos as photo, index}
				<div class="relative group">
					<div
						class="aspect-square bg-sand/10 rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow border-2 border-sand/20"
						role="button"
						tabindex="0"
						title={getCaption(photo) ? `Caption: ${getCaption(photo).slice(0, 100)}` : ''}
						onclick={() => handlePhotoClick(photo)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								handlePhotoClick(photo);
								e.preventDefault();
							}
						}}
					>
						{#if failedSrcs.has(photo.thumbnailUrl ?? photo.url ?? '')}
							<div class="w-full h-full flex flex-col items-center justify-center text-sand/40">
								<span class="i-lucide-image-off w-8 h-8 inline-block mb-1"></span>
								<span class="text-xs">Unavailable</span>
							</div>
						{:else}
							<img
								src={photo.thumbnailUrl ?? photo.url ?? ''}
								alt="POI photo {index + 1}"
								class="w-full h-full object-cover"
								onerror={() => {
									failedSrcs = new Set([
										...failedSrcs,
										photo.thumbnailUrl ?? photo.url ?? '',
									]);
								}}
							/>
						{/if}
					</div>

					<!-- Overlay with actions -->
					<div
						class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 rounded-lg flex items-center justify-center gap-2"
					>
						<Button
							size="sm"
							variant="secondary"
							class="opacity-0 group-hover:opacity-100 transition-opacity bits-btn"
							onclick={() => handlePhotoClick(photo)}
							title="View photo details"
						>
							<span class="i-lucide-eye w-4 h-4 inline-block"></span>
						</Button>
						{#if photo.forensicData?.hasFace && onfaceMatch}
							<Button
								size="sm"
								variant="outline"
								class="opacity-0 group-hover:opacity-100 transition-opacity bits-btn"
								onclick={(e) => handleFaceMatch(photo, e)}
								title="Find matching faces"
							>
								<span class="i-lucide-face w-4 h-4 inline-block"></span>
							</Button>
						{/if}
						{#if editable}
							<Button
								size="sm"
								variant="destructive"
								class="opacity-0 group-hover:opacity-100 transition-opacity bits-btn"
								onclick={(e) => {
									e.stopPropagation();
									handleDelete(index, e);
								}}
								title="Delete photo"
							>
								<span class="i-lucide-trash-2 w-4 h-4 inline-block"></span>
							</Button>
						{/if}
					</div>

					<!-- Analysis badges and metadata -->
					<div class="absolute top-2 right-2 flex flex-col gap-1">
						<!-- VLM Analysis Status -->
						{#if getCaption(photo)}
							<div
								class="px-2 py-1 rounded text-xs font-medium bg-accent/20 text-accent flex items-center gap-1 cursor-help"
								title={`AI Caption: ${getCaption(photo).slice(0, 150)}`}
							>
								<span class="i-lucide-sparkles w-3 h-3 inline-block"></span>
								AI
							</div>
						{/if}

						<!-- Forensic Flags -->
						{#if hasForensicFlags(photo)}
							<div
								class="px-2 py-1 rounded text-xs font-medium bg-warning/20 text-warning flex items-center gap-1 cursor-help"
								title={`Forensic Analysis: ${getForensicSummary(photo)}`}
							>
								<span class="i-lucide-alert-triangle w-3 h-3 inline-block"></span>
								Flags
							</div>
						{/if}
					</div>

					<!-- Tags section -->
					{#if getTags(photo).length > 0}
						<div class="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
							{#each getTags(photo).slice(0, 2) as tag}
								<span
									class="px-2 py-0.5 rounded text-xs font-medium bg-sand/20 text-sand/90 cursor-help"
									title={tag}
								>
									{tag.length > 12 ? tag.slice(0, 10) + '…' : tag}
								</span>
							{/each}
							{#if getTags(photo).length > 2}
								<span
									class="px-2 py-0.5 rounded text-xs font-medium bg-sand/20 text-sand/90 cursor-help"
									title={getTags(photo)
										.slice(2)
										.join(', ')}
								>
									+{getTags(photo).length - 2} more
								</span>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* Ensure tooltips are visible over grid items */
	:global([data-bits-tooltip-content]) {
		z-index: 50;
	}
</style>
