<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui';
	import { Badge } from '$lib/components/ui/badge';
	import { Dialog, DialogContent } from '$lib/components/ui/dialog';
	import Button from '$lib/components/ui/Button.svelte';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';

	interface ForensicData {
		hasFace?: boolean;
		hasText?: boolean;
		securityFlags?: string[];
		suspiciousElements?: string[];
		perceptualHash?: string;
		lightingConditions?: string;
		imageQuality?: 'high' | 'medium' | 'low';
		dimensions?: { width: number; height: number };
	}

	interface POIPhoto {
		url: string;
		originalName: string;
		size: number;
		mimeType: string;
		uploadedAt: string;
		aiCaption?: string;
		aiTags?: string[];
		exifData?: Record<string, unknown>;
		forensicData?: ForensicData;
	}

	interface Props {
		photos?: POIPhoto[];
		currentIndex?: number;
		open?: boolean;
		onclose?: () => void;
		onFaceMatch?: (photo: POIPhoto) => void;
	}

	let {
		photos = [],
		currentIndex = $bindable(0),
		open = $bindable(false),
		onclose,
		onFaceMatch,
	}: Props = $props();

	let zoomLevel = $state(1);
	let imageRef = $state<HTMLImageElement | null>(null);
	let currentPhoto = $derived(photos[currentIndex]);

	function handleFaceMatch() {
		if (currentPhoto) onFaceMatch?.(currentPhoto);
	}

	function close() {
		open = false;
		zoomLevel = 1;
		onclose?.();
	}

	function nextPhoto() {
		if (currentIndex < photos.length - 1) {
			currentIndex++;
			zoomLevel = 1;
			imageRef?.focus();
		}
	}

	function prevPhoto() {
		if (currentIndex > 0) {
			currentIndex--;
			zoomLevel = 1;
			imageRef?.focus();
		}
	}

	function zoomIn() {
		zoomLevel = Math.min(zoomLevel * 1.2, 3);
	}

	function zoomOut() {
		zoomLevel = Math.max(zoomLevel / 1.2, 0.5);
	}

	function downloadPhoto() {
		if (currentPhoto) {
			const link = document.createElement('a');
			link.href = currentPhoto.url;
			link.download = currentPhoto.originalName;
			link.click();
		}
	}

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleString();
	}
</script>

<Dialog bind:open>
	<DialogContent class="max-w-7xl h-[90vh] p-0 overflow-hidden">
		<div class="flex h-full">
			<!-- Main Image Viewer -->
			<div class="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
				{#if currentPhoto}
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<img
						bind:this={imageRef}
						src={currentPhoto.url}
						alt={currentPhoto.originalName}
						class="max-w-full max-h-full object-contain transition-transform duration-200"
						style="transform: scale({zoomLevel})"
						onkeydown={(e) => {
							if (e.key === 'ArrowLeft') prevPhoto();
							if (e.key === 'ArrowRight') nextPhoto();
							if (e.key === '+') zoomIn();
							if (e.key === '-') zoomOut();
						}}
						tabindex="0"
					/>

					<!-- Navigation Arrows -->
					{#if photos.length > 1}
						<button
							class="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
							onclick={prevPhoto}
							disabled={currentIndex === 0}
						>
							<span class="i-lucide-chevron-left w-6 h-6 inline-block"></span>
						</button>
						<button
							class="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
							onclick={nextPhoto}
							disabled={currentIndex === photos.length - 1}
						>
							<span class="i-lucide-chevron-right w-6 h-6 inline-block"></span>
						</button>
					{/if}

					<!-- Zoom Controls -->
					<div class="absolute top-4 right-4 flex gap-2">
						<Button class="bits-btn" variant="secondary" size="sm" onclick={zoomOut} disabled={zoomLevel <= 0.5}>
							<span class="i-lucide-zoom-out w-4 h-4 inline-block"></span>
						</Button>
						<Button class="bits-btn" variant="secondary" size="sm" onclick={zoomIn} disabled={zoomLevel >= 3}>
							<span class="i-lucide-zoom-in w-4 h-4 inline-block"></span>
						</Button>
						<Button class="bits-btn" variant="secondary" size="sm" onclick={downloadPhoto}>
							<span class="i-lucide-download w-4 h-4 inline-block"></span>
						</Button>
					</div>

					<!-- Photo Counter -->
					{#if photos.length > 1}
						<div class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
							{currentIndex + 1} / {photos.length}
						</div>
					{/if}
				{/if}
			</div>

			<!-- Metadata Panel -->
			<div class="w-96 bg-sand/5 dark:bg-panel border-l overflow-y-auto">
				<div class="p-6">
					<div class="flex items-center justify-between mb-4">
						<h3 class="text-lg font-semibold">Photo Analysis</h3>
						<div class="flex gap-2">
							{#if currentPhoto?.forensicData?.hasFace && onFaceMatch}
								<Button class="bits-btn" variant="outline" size="sm" onclick={handleFaceMatch} title="Find matching faces">
									<span class="i-lucide-face w-4 h-4 inline-block"></span>
								</Button>
							{/if}
							<Button class="bits-btn" variant="ghost" size="sm" onclick={close}>
								<span class="i-lucide-x w-4 h-4 inline-block"></span>
							</Button>
						</div>
					</div>

					{#if currentPhoto}
						<Tabs defaultValue="overview" class="w-full">
							<TabsList class="grid w-full grid-cols-3">
								<TabsTrigger value="overview">Overview</TabsTrigger>
								<TabsTrigger value="analysis">AI Analysis</TabsTrigger>
								<TabsTrigger value="metadata">Metadata</TabsTrigger>
							</TabsList>

							<TabsContent value="overview" class="space-y-4">
								<Card>
									<CardHeader class="pb-3">
										<CardTitle class="text-sm flex items-center gap-2">
											<span class="i-lucide-camera w-4 h-4 inline-block"></span>
											Photo Details
										</CardTitle>
									</CardHeader>
									<CardContent class="space-y-2 text-sm">
										<div class="flex justify-between">
											<span class="text-sand/60">Filename:</span>
											<span class="font-mono">{currentPhoto.originalName}</span>
										</div>
										<div class="flex justify-between">
											<span class="text-sand/60">Size:</span>
											<span>{formatFileSize(currentPhoto.size)}</span>
										</div>
										<div class="flex justify-between">
											<span class="text-sand/60">Type:</span>
											<span>{currentPhoto.mimeType}</span>
										</div>
										<div class="flex justify-between">
											<span class="text-sand/60">Uploaded:</span>
											<span>{formatDate(currentPhoto.uploadedAt)}</span>
										</div>
									</CardContent>
								</Card>

								{#if currentPhoto.forensicData?.dimensions}
									<Card>
										<CardHeader class="pb-3">
											<CardTitle class="text-sm">Dimensions</CardTitle>
										</CardHeader>
										<CardContent class="text-sm">
											<div class="flex justify-between">
												<span class="text-sand/60">Resolution:</span>
												<span>{currentPhoto.forensicData.dimensions.width} × {currentPhoto.forensicData.dimensions.height}</span>
											</div>
											{#if currentPhoto.forensicData.imageQuality}
												<div class="flex justify-between">
													<span class="text-sand/60">Quality:</span>
													<Badge variant={currentPhoto.forensicData.imageQuality === 'high' ? 'default' : 'secondary'}>
														{currentPhoto.forensicData.imageQuality}
													</Badge>
												</div>
											{/if}
										</CardContent>
									</Card>
								{/if}
							</TabsContent>

							<TabsContent value="analysis" class="space-y-4">
								{#if currentPhoto.aiCaption}
									<Card>
										<CardHeader class="pb-3">
											<CardTitle class="text-sm flex items-center gap-2">
												<span class="i-lucide-eye w-4 h-4 inline-block"></span>
												AI Caption
											</CardTitle>
										</CardHeader>
										<CardContent>
											<p class="text-sm text-sand/80 dark:text-sand/40 leading-relaxed">
												{currentPhoto.aiCaption}
											</p>
										</CardContent>
									</Card>
								{/if}

								{#if currentPhoto.aiTags && currentPhoto.aiTags.length > 0}
									<Card>
										<CardHeader class="pb-3">
											<CardTitle class="text-sm">AI Tags</CardTitle>
										</CardHeader>
										<CardContent>
											<div class="flex flex-wrap gap-2">
												{#each currentPhoto.aiTags as tag}
													<span class="px-2 py-1 rounded text-xs font-medium border border-sand/20 text-sand/80">{tag}</span>
												{/each}
											</div>
										</CardContent>
									</Card>
								{/if}

								{#if currentPhoto.forensicData}
									<Card>
										<CardHeader class="pb-3">
											<CardTitle class="text-sm flex items-center gap-2">
												<span class="i-lucide-search w-4 h-4 inline-block"></span>
												Forensic Analysis
											</CardTitle>
										</CardHeader>
										<CardContent class="space-y-4 text-sm">
											{#if currentPhoto.forensicData.hasFace || currentPhoto.forensicData.hasText}
												<div class="bg-accent/10 border border-accent/20 rounded p-3 space-y-1">
													<p class="font-medium text-accent">Detected Elements:</p>
													<ul class="list-disc list-inside text-xs text-sand/80 space-y-0.5">
														{#if currentPhoto.forensicData.hasFace}
															<li>Face(s) detected</li>
														{/if}
														{#if currentPhoto.forensicData.hasText}
															<li>Text detected</li>
														{/if}
													</ul>
												</div>
											{/if}

											{#if currentPhoto.forensicData.securityFlags && currentPhoto.forensicData.securityFlags.length > 0}
												<div class="bg-warning/10 border border-warning/20 rounded p-3 space-y-1">
													<p class="font-medium text-warning flex items-center gap-1">
														<span class="i-lucide-alert-triangle w-4 h-4 inline-block"></span>
														Security Flags ({currentPhoto.forensicData.securityFlags.length})
													</p>
													<ul class="list-disc list-inside text-xs text-warning/80 space-y-0.5">
														{#each currentPhoto.forensicData.securityFlags as flag}
															<li>{flag}</li>
														{/each}
													</ul>
												</div>
											{/if}

											{#if currentPhoto.forensicData.suspiciousElements && currentPhoto.forensicData.suspiciousElements.length > 0}
												<div class="bg-danger/10 border border-danger/20 rounded p-3 space-y-1">
													<p class="font-medium text-danger flex items-center gap-1">
														<span class="i-lucide-alert-circle w-4 h-4 inline-block"></span>
														Suspicious Elements ({currentPhoto.forensicData.suspiciousElements.length})
													</p>
													<ul class="list-disc list-inside text-xs text-danger/80 space-y-0.5">
														{#each currentPhoto.forensicData.suspiciousElements as element}
															<li>{element}</li>
														{/each}
													</ul>
												</div>
											{/if}

											{#if currentPhoto.forensicData.perceptualHash}
												<div class="flex justify-between">
													<span class="text-sand/60">Perceptual Hash:</span>
													<span class="font-mono text-xs">{currentPhoto.forensicData.perceptualHash.slice(0, 16)}...</span>
												</div>
											{/if}
											{#if currentPhoto.forensicData.lightingConditions}
												<div class="flex justify-between">
													<span class="text-sand/60">Lighting:</span>
													<span class="px-2 py-1 rounded text-xs font-medium border border-sand/20 text-sand/80">{currentPhoto.forensicData.lightingConditions}</span>
												</div>
											{/if}
										</CardContent>
									</Card>
								{/if}
							</TabsContent>

							<TabsContent value="metadata" class="space-y-4">
								{#if currentPhoto.exifData && Object.keys(currentPhoto.exifData).length > 0}
									<Card>
										<CardHeader class="pb-3">
											<CardTitle class="text-sm flex items-center gap-2">
												<span class="i-lucide-camera w-4 h-4 inline-block"></span>
												EXIF Data
											</CardTitle>
										</CardHeader>
										<CardContent class="space-y-2 text-sm">
											{#each Object.entries(currentPhoto.exifData) as [key, value]}
												<div class="flex justify-between">
													<span class="text-sand/60">{key}:</span>
													<span class="font-mono text-xs">{String(value)}</span>
												</div>
											{/each}
										</CardContent>
									</Card>
								{:else}
									<Card>
										<CardContent class="text-center py-8 text-sand/60">
											<span class="i-lucide-camera w-8 h-8 mx-auto mb-2 opacity-50 inline-block"></span>
											<p>No EXIF data available</p>
										</CardContent>
									</Card>
								{/if}
							</TabsContent>
						</Tabs>
					{/if}
				</div>
			</div>
		</div>
	</DialogContent>
</Dialog>

<style>
	/* Ensure image doesn't overflow on zoom */
	img {
		image-rendering: -webkit-optimize-contrast;
		image-rendering: crisp-edges;
	}

	/* Custom scrollbar for metadata panel */
	.overflow-y-auto::-webkit-scrollbar {
		width: 6px;
	}

	.overflow-y-auto::-webkit-scrollbar-track {
		background: transparent;
	}

	.overflow-y-auto::-webkit-scrollbar-thumb {
		background: #cbd5e0;
		border-radius: 3px;
	}

	.overflow-y-auto::-webkit-scrollbar-thumb:hover {
		background: #a0aec0;
	}
</style>