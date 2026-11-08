<!--
  EvidenceCarouselGallery.svelte
  Bits UI v2-driven horizontal evidence slide gallery with Drag & Drop,
  smooth scrolling navigation, card hover tooltips, and click-to-expand document viewer.
-->
<script lang="ts">
	import { ScrollArea, Tooltip } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { EvidenceItem } from './evidence-types.js';
	import { DEFAULT_EVIDENCE_ITEMS } from './evidence-types.js';

	interface Props {
		exhibits?: EvidenceItem[];
		selectedId?: string;
		theme?: 'light' | 'dark';
		onSelect?: (item: EvidenceItem) => void;
		onExpand?: (item: EvidenceItem) => void;
		onUploadFiles?: (files: File[]) => void;
		onDropOnCanvas?: (item: EvidenceItem, coords: { x: number; y: number }) => void;
	}

	let {
		exhibits = DEFAULT_EVIDENCE_ITEMS,
		selectedId = $bindable('e-002'),
		theme = 'dark',
		onSelect,
		onExpand,
		onUploadFiles,
		onDropOnCanvas
	}: Props = $props();

	let viewportEl = $state<HTMLElement | null>(null);
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let isDragOver = $state(false);

	// Scroll left / right handlers
	function scrollGallery(direction: 'left' | 'right') {
		if (!viewportEl) return;
		const offset = direction === 'left' ? -280 : 280;
		viewportEl.scrollBy({ left: offset, behavior: 'smooth' });
	}

	// File Drop Handling
	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.dataTransfer!.dropEffect = 'copy';
		isDragOver = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;
	}

	function handleFileDrop(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;
		if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
			const files = Array.from(e.dataTransfer.files);
			onUploadFiles?.(files);
		}
	}

	function handleFileInputChange(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			const files = Array.from(target.files);
			onUploadFiles?.(files);
			target.value = '';
		}
	}

	function handleCardDragStart(e: DragEvent, item: EvidenceItem) {
		if (e.dataTransfer) {
			e.dataTransfer.setData('application/json', JSON.stringify(item));
			e.dataTransfer.setData('text/plain', item.exhibitNumber);
			e.dataTransfer.effectAllowed = 'copyMove';
		}
	}

	function handleCardClick(item: EvidenceItem) {
		selectedId = item.id;
		onSelect?.(item);
	}

	function handleExpandClick(e: MouseEvent, item: EvidenceItem) {
		e.stopPropagation();
		selectedId = item.id;
		onSelect?.(item);
		onExpand?.(item);
	}
</script>

<div class="evidence-carousel-gallery {theme === 'light' ? 'light-gallery' : 'dark-gallery'}" data-testid="evidence-carousel-gallery">
	<!-- Hidden File Input for Browse -->
	<input
		type="file"
		bind:this={fileInputEl}
		class="hidden-file-input"
		multiple
		accept=".pdf,.mp4,.png,.jpg,.jpeg,.flac,.wav,.json,.spz,.las,.laz"
		onchange={handleFileInputChange}
		aria-label="Upload evidence files"
	/>

	<!-- Left Navigation Chevron -->
	<button
		type="button"
		class="gallery-nav-btn prev-btn"
		onclick={() => scrollGallery('left')}
		aria-label="Scroll evidence gallery left"
		data-testid="carousel-prev-btn"
	>
		<Icon name="chevron-left" size={14} />
	</button>

	<!-- Bits UI ScrollArea Horizontal Gallery -->
	<ScrollArea.Root type="hover" class="gallery-scroll-root">
		<ScrollArea.Viewport
			bind:ref={viewportEl}
			class="gallery-scroll-viewport"
		>
			<div
				class="gallery-cards-track"
				role="region"
				aria-label="Evidence Filmstrip Gallery"
			>
				<!-- Drop Zone Card (Card 1) -->
				<button
					type="button"
					class="gallery-card drop-card {isDragOver ? 'drag-over' : ''}"
					ondragover={handleDragOver}
					ondragleave={handleDragLeave}
					ondrop={handleFileDrop}
					onclick={() => fileInputEl?.click()}
					data-testid="evidence-drop-card"
					title="Click to browse or drop PDF, MP4, LAS/LAZ point cloud"
				>
					<div class="drop-icon-wrapper">
						<Icon name="upload-cloud" size={18} />
					</div>
					<span class="drop-label">Drag & Drop</span>
					<span class="drop-sub">(or browse)</span>
					<span class="drop-formats">PDF, MP4, LAS/SPZ</span>
				</button>

				<!-- Exhibit Cards -->
				{#each exhibits as item (item.id)}
					{@const isSelected = selectedId === item.id}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<div
									{...props}
									role="button"
									tabindex="0"
									draggable="true"
									ondragstart={(e) => handleCardDragStart(e, item)}
									onclick={() => handleCardClick(item)}
									ondblclick={(e) => handleExpandClick(e, item)}
									onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCardClick(item); }}
									class="gallery-card exhibit-card
										{isSelected ? 'is-selected' : ''}
										{item.isActiveNode ? 'is-active-splat' : ''}
										badge-{item.badgeColor || 'default'}"
									data-testid="evidence-card-{item.id}"
								>
									<!-- Card Top Header -->
									<div class="gc-header">
										<span class="exhibit-badge {item.badgeColor || 'default'}">{item.exhibitNumber}</span>
										<button
											type="button"
											class="expand-icon-btn"
											title="Expand Full Document/Evidence Viewer"
											onclick={(e) => handleExpandClick(e, item)}
											aria-label="Expand {item.exhibitNumber}"
											data-testid="expand-btn-{item.id}"
										>
											<Icon name="maximize-2" size={11} />
										</button>
										{#if item.isCurrent}
											<span class="pulse-live-dot" title="Live incident tracking"></span>
										{/if}
									</div>

									<!-- Card Body / Thumbnail -->
									<div class="gc-body">
										{#if item.type === 'video' || item.type === 'cctv'}
											<div class="gc-thumb-media {item.type === 'video' ? 'corridor-thumb' : 'cctv-thumb'}">
												<div class="media-overlay-icon">
													<Icon name={item.type === 'video' ? 'video' : 'camera'} size={14} />
												</div>
												{#if item.metrics?.fps}
													<span class="media-tag">{item.metrics.fps} FPS</span>
												{/if}
											</div>
										{:else if item.type === 'document'}
											<div class="gc-thumb-doc">
												<Icon name="file-text" size={18} />
												{#if item.metrics?.pages}
													<span class="doc-pages">{item.metrics.pages}P</span>
												{/if}
											</div>
										{:else if item.type === 'audio'}
											<div class="gc-thumb-audio">
												<div class="wave-bars">
													<span class="bar b1"></span>
													<span class="bar b2"></span>
													<span class="bar b3"></span>
													<span class="bar b4"></span>
													<span class="bar b5"></span>
												</div>
												<span class="audio-tag">24-BIT</span>
											</div>
										{:else if item.type === 'biometric'}
											<div class="gc-thumb-bio">
												<Icon name="fingerprint" size={20} />
												<span class="bio-tag">98.4%</span>
											</div>
										{:else if item.type === 'forensic'}
											<div class="gc-thumb-forensic">
												<Icon name="activity" size={18} />
												<span class="forensic-tag">STR-DNA</span>
											</div>
										{:else if item.type === 'splat'}
											<div class="gc-thumb-splat">
												<span class="splat-density">{item.metrics?.splatPoints || '1.48M'}</span>
												<span class="splat-sub">Active Splat</span>
											</div>
										{:else}
											<div class="gc-thumb-generic">
												<Icon name="box" size={16} />
											</div>
										{/if}
									</div>

									<!-- Card Title & Metadata -->
									<div class="gc-footer">
										<span class="gc-title" title={item.title}>{item.title}</span>
										<div class="gc-sub-line">
											<span class="gc-category">{item.categoryBadge}</span>
											{#if item.confidence}
												<span class="gc-conf">{Math.round(item.confidence)}%</span>
											{/if}
										</div>
									</div>
								</div>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content
							side="top"
							sideOffset={6}
							class="gallery-tooltip-content"
						>
							<div class="tt-header">
								<span class="tt-badge">{item.exhibitNumber}</span>
								<span class="tt-title">{item.title}</span>
							</div>
							<p class="tt-summary">{item.summary || 'Click to view full forensic telemetry.'}</p>
							{#if item.statutes && item.statutes.length > 0}
								<div class="tt-statute-row">
									<Icon name="shield" size={11} />
									<span>{item.statutes[0]}</span>
								</div>
							{/if}
							<div class="tt-footer-meta">
								<span>Double-click or click [⤢] to expand</span>
							</div>
						</Tooltip.Content>
					</Tooltip.Root>
				{/each}
			</div>
		</ScrollArea.Viewport>
		<ScrollArea.Scrollbar orientation="horizontal" class="gallery-scrollbar">
			<ScrollArea.Thumb class="gallery-scrollbar-thumb" />
		</ScrollArea.Scrollbar>
	</ScrollArea.Root>

	<!-- Right Navigation Chevron -->
	<button
		type="button"
		class="gallery-nav-btn next-btn"
		onclick={() => scrollGallery('right')}
		aria-label="Scroll evidence gallery right"
		data-testid="carousel-next-btn"
	>
		<Icon name="chevron-right" size={14} />
	</button>
</div>

<style>
	.evidence-carousel-gallery {
		display: flex;
		align-items: center;
		position: relative;
		width: 100%;
		height: 84px;
		padding: 4px 6px;
		user-select: none;
		box-sizing: border-box;
		border-radius: 6px;
	}

	.hidden-file-input {
		display: none;
	}

	/* Navigation Chevrons */
	.gallery-nav-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 72px;
		flex-shrink: 0;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(15, 22, 34, 0.7);
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		transition: all 0.15s ease;
		z-index: 5;
	}

	.gallery-nav-btn:hover {
		background: rgba(30, 41, 59, 0.95);
		color: #38bdf8;
		border-color: rgba(56, 189, 248, 0.4);
	}

	.gallery-nav-btn.prev-btn {
		margin-right: 4px;
	}

	.gallery-nav-btn.next-btn {
		margin-left: 4px;
	}

	/* ScrollArea integration */
	:global(.gallery-scroll-root) {
		flex: 1;
		height: 100%;
		overflow: hidden;
		position: relative;
	}

	:global(.gallery-scroll-viewport) {
		width: 100%;
		height: 100%;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
	}

	:global(.gallery-scroll-viewport::-webkit-scrollbar) {
		display: none;
	}

	:global(.gallery-scrollbar) {
		display: flex;
		user-select: none;
		touch-action: none;
		padding: 1px;
		background: rgba(0, 0, 0, 0.2);
		height: 4px;
		border-radius: 2px;
		transition: opacity 0.2s ease;
	}

	:global(.gallery-scrollbar-thumb) {
		flex: 1;
		background: rgba(56, 189, 248, 0.3);
		border-radius: 2px;
		position: relative;
	}

	.gallery-cards-track {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 100%;
		padding-right: 8px;
	}

	/* Individual Gallery Cards */
	.gallery-card {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		width: 98px;
		min-width: 98px;
		height: 72px;
		border-radius: 4px;
		padding: 5px 6px;
		box-sizing: border-box;
		position: relative;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
	}

	/* Dark Theme Styles */
	.dark-gallery {
		background: rgba(9, 13, 20, 0.85);
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.dark-gallery .gallery-card {
		background: rgba(17, 24, 39, 0.7);
		border: 1px solid rgba(255, 255, 255, 0.09);
		color: #e2e8f0;
	}

	.dark-gallery .gallery-card:hover {
		background: rgba(30, 41, 59, 0.85);
		border-color: rgba(56, 189, 248, 0.35);
		transform: translateY(-1px);
	}

	.dark-gallery .gallery-card.is-selected {
		border-color: #38bdf8;
		background: rgba(14, 165, 233, 0.12);
		box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
	}

	.dark-gallery .gallery-card.is-active-splat {
		border-color: #06b6d4;
		box-shadow: 0 0 12px rgba(6, 182, 212, 0.35);
		background: rgba(6, 182, 212, 0.1);
	}

	/* Light Theme Styles */
	.light-gallery {
		background: #f8fafc;
		border: 1px solid #e2e8f0;
	}

	.light-gallery .gallery-nav-btn {
		background: #ffffff;
		border-color: #cbd5e1;
		color: #475569;
	}

	.light-gallery .gallery-nav-btn:hover {
		background: #f1f5f9;
		color: #0284c7;
		border-color: #0284c7;
	}

	.light-gallery .gallery-card {
		background: #ffffff;
		border: 1px solid #e2e8f0;
		color: #0f172a;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
	}

	.light-gallery .gallery-card:hover {
		background: #f8fafc;
		border-color: #0284c7;
		transform: translateY(-1px);
	}

	.light-gallery .gallery-card.is-selected {
		border-color: #0284c7;
		background: #f0f9ff;
		box-shadow: 0 0 0 1px #0284c7, 0 2px 6px rgba(2, 132, 199, 0.15);
	}

	.light-gallery .gallery-card.is-active-splat {
		border-color: #0891b2;
		background: #ecfeff;
	}

	/* Drop Zone Card */
	.gallery-card.drop-card {
		border-style: dashed;
		border-width: 1.5px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		cursor: pointer;
		padding: 4px;
	}

	.dark-gallery .drop-card {
		border-color: rgba(56, 189, 248, 0.3);
		background: rgba(14, 165, 233, 0.04);
		color: #38bdf8;
	}

	.dark-gallery .drop-card.drag-over {
		border-color: #38bdf8;
		background: rgba(14, 165, 233, 0.15);
		box-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
	}

	.light-gallery .drop-card {
		border-color: #94a3b8;
		background: #f8fafc;
		color: #0284c7;
	}

	.light-gallery .drop-card.drag-over {
		border-color: #0284c7;
		background: #f0f9ff;
		box-shadow: 0 0 8px rgba(2, 132, 199, 0.3);
	}

	.drop-icon-wrapper {
		margin-bottom: 2px;
	}

	.drop-label {
		font-size: 10px;
		font-weight: 700;
		line-height: 1.1;
	}

	.drop-sub {
		font-size: 8.5px;
		opacity: 0.7;
	}

	.drop-formats {
		font-size: 7.5px;
		font-family: monospace;
		opacity: 0.55;
		margin-top: 1px;
	}

	/* Card Header Elements */
	.gc-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
	}

	.exhibit-badge {
		font-size: 8.5px;
		font-family: monospace;
		font-weight: 700;
		padding: 1px 4px;
		border-radius: 2px;
		line-height: 1;
	}

	.exhibit-badge.blue {
		background: rgba(14, 165, 233, 0.2);
		color: #38bdf8;
		border: 1px solid rgba(56, 189, 248, 0.3);
	}

	.exhibit-badge.red {
		background: rgba(239, 68, 68, 0.2);
		color: #f87171;
		border: 1px solid rgba(239, 68, 68, 0.3);
	}

	.exhibit-badge.purple {
		background: rgba(168, 85, 247, 0.2);
		color: #c084fc;
		border: 1px solid rgba(168, 85, 247, 0.3);
	}

	.exhibit-badge.amber {
		background: rgba(245, 158, 11, 0.2);
		color: #fbbf24;
		border: 1px solid rgba(245, 158, 11, 0.3);
	}

	.exhibit-badge.cyan {
		background: rgba(6, 182, 212, 0.2);
		color: #22d3ee;
		border: 1px solid rgba(6, 182, 212, 0.3);
	}

	.exhibit-badge.default {
		background: rgba(148, 163, 184, 0.2);
		color: #94a3b8;
		border: 1px solid rgba(148, 163, 184, 0.3);
	}

	.expand-icon-btn {
		background: none;
		border: none;
		padding: 1px;
		cursor: pointer;
		opacity: 0.45;
		color: inherit;
		border-radius: 2px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: opacity 0.15s ease;
	}

	.expand-icon-btn:hover {
		opacity: 1;
		color: #38bdf8;
	}

	.pulse-live-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #10b981;
		box-shadow: 0 0 5px #10b981;
	}

	/* Card Body Visuals */
	.gc-body {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 24px;
		width: 100%;
		margin: 2px 0;
	}

	.gc-thumb-media {
		width: 100%;
		height: 100%;
		border-radius: 2px;
		background: #0f172a;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.corridor-thumb {
		background: linear-gradient(135deg, #1e293b 0%, #090d14 100%);
		border: 1px solid rgba(56, 189, 248, 0.2);
	}

	.cctv-thumb {
		background: linear-gradient(135deg, #27272a 0%, #09090b 100%);
		border: 1px solid rgba(245, 158, 11, 0.2);
	}

	.media-overlay-icon {
		opacity: 0.6;
		color: #38bdf8;
	}

	.media-tag {
		position: absolute;
		bottom: 1px;
		right: 2px;
		font-size: 7px;
		font-family: monospace;
		background: rgba(0, 0, 0, 0.7);
		color: #e2e8f0;
		padding: 0 2px;
		border-radius: 1px;
	}

	.gc-thumb-doc {
		display: flex;
		align-items: center;
		gap: 3px;
		color: #f87171;
	}

	.doc-pages {
		font-size: 7.5px;
		font-family: monospace;
		background: rgba(239, 68, 68, 0.15);
		padding: 1px 3px;
		border-radius: 2px;
	}

	.gc-thumb-audio {
		display: flex;
		align-items: center;
		gap: 3px;
	}

	.wave-bars {
		display: flex;
		align-items: flex-end;
		gap: 1.5px;
		height: 14px;
	}

	.wave-bars .bar {
		width: 2px;
		background: #c084fc;
		border-radius: 1px;
	}

	.b1 { height: 6px; }
	.b2 { height: 12px; }
	.b3 { height: 8px; }
	.b4 { height: 14px; }
	.b5 { height: 9px; }

	.audio-tag {
		font-size: 7px;
		font-family: monospace;
		color: #c084fc;
	}

	.gc-thumb-bio {
		display: flex;
		align-items: center;
		gap: 2px;
		color: #94a3b8;
	}

	.bio-tag {
		font-size: 7.5px;
		font-family: monospace;
		color: #10b981;
	}

	.gc-thumb-forensic {
		display: flex;
		align-items: center;
		gap: 3px;
		color: #38bdf8;
	}

	.forensic-tag {
		font-size: 7px;
		font-family: monospace;
		color: #38bdf8;
	}

	.gc-thumb-splat {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	.splat-density {
		font-size: 11px;
		font-family: monospace;
		font-weight: 700;
		color: #22d3ee;
		text-shadow: 0 0 6px rgba(34, 211, 238, 0.4);
	}

	.splat-sub {
		font-size: 7.5px;
		color: #22d3ee;
		opacity: 0.8;
	}

	.gc-thumb-generic {
		opacity: 0.5;
	}

	/* Card Footer Elements */
	.gc-footer {
		display: flex;
		flex-direction: column;
		gap: 1px;
		width: 100%;
		overflow: hidden;
	}

	.gc-title {
		font-size: 8.5px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		line-height: 1.1;
	}

	.gc-sub-line {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 7px;
		font-family: monospace;
		opacity: 0.65;
	}

	.gc-category {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 60px;
	}

	.gc-conf {
		color: #10b981;
		font-weight: 700;
	}

	/* Tooltip Styling */
	:global(.gallery-tooltip-content) {
		background: #0f172a;
		border: 1px solid rgba(56, 189, 248, 0.3);
		border-radius: 4px;
		padding: 6px 8px;
		max-width: 220px;
		font-size: 10px;
		color: #f1f5f9;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
		z-index: 100;
	}

	.tt-header {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 4px;
	}

	.tt-badge {
		font-size: 9px;
		font-weight: 700;
		color: #38bdf8;
		font-family: monospace;
	}

	.tt-title {
		font-size: 10px;
		font-weight: 600;
	}

	.tt-summary {
		font-size: 9px;
		color: #94a3b8;
		line-height: 1.25;
		margin: 0 0 4px 0;
	}

	.tt-statute-row {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 8.5px;
		color: #f59e0b;
		margin-bottom: 3px;
	}

	.tt-footer-meta {
		font-size: 8px;
		font-family: monospace;
		color: #64748b;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		padding-top: 3px;
	}
</style>
