<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		evidenceId: string;
	}

	let { evidenceId }: Props = $props();

	interface FrameAnalysis {
		timestamp: number;
		framePath?: string;
		description: string;
		objects?: string[];
		tags?: string[];
		confidence?: number;
	}

	interface SceneDetection {
		startTime: number;
		endTime: number;
		description: string;
	}

	interface VLMAnalysis {
		summary: string;
		keyObjects: string[];
		activities: string[];
		setting: string;
		timestamp?: string;
	}

	interface VideoMetadata {
		duration: number;
		width: number;
		height: number;
		codec?: string;
		fps?: number;
		bitrate?: number;
	}

	interface Transcription {
		text: string;
		language: string;
		duration: number;
		segments?: any[];
	}

	interface Entity {
		type: string;
		text: string;
		label?: string;
	}

	interface ACEAnalysis {
		summary: string;
		confidence: number;
		tags: string[];
		claims?: string[];
		contradictions?: string[];
	}

	interface VideoAnalysis {
		evidenceId: string;
		title: string;
		fileName: string;
		fileSize: number;
		processingStatus: string;
		transcription: Transcription | null;
		vlmAnalysis: VLMAnalysis | null;
		frameAnalysis: FrameAnalysis[];
		sceneDetection: SceneDetection[];
		entities: Entity[];
		aceAnalysis: ACEAnalysis | null;
		videoMetadata: VideoMetadata;
		createdAt: string;
	}

	let loading = $state(true);
	let error = $state<string | null>(null);
	let analysis = $state<VideoAnalysis | null>(null);
	let activeTab = $state<'overview' | 'frames' | 'scenes' | 'transcription' | 'analysis'>(
		'overview'
	);
	let selectedFrame = $state<number | null>(null);

	onMount(async () => {
		try {
			const response = await fetch(`/api/video/analysis/${evidenceId}`);
			if (!response.ok) {
				throw new Error('Failed to load video analysis');
			}
			analysis = await response.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	});

	function formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatTime(seconds: number): string {
		return seconds.toFixed(2) + 's';
	}

	function formatResolution(width: number, height: number): string {
		if (width >= 3840) return `${width}×${height} (4K)`;
		if (width >= 1920) return `${width}×${height} (1080p)`;
		if (width >= 1280) return `${width}×${height} (720p)`;
		return `${width}×${height}`;
	}
</script>

<div class="video-analysis-view">
	{#if loading}
		<div class="loading-state">
			<Icon name="loader-circle" class="animate-spin text-accent" />
			<p class="text-sm text-neutral-400 mt-2">Loading video analysis...</p>
		</div>
	{:else if error}
		<div class="error-state">
			<Icon name="alert-circle" class="text-danger" />
			<p class="text-sm text-danger mt-2">{error}</p>
		</div>
	{:else if analysis}
		<!-- Header -->
		<div class="analysis-header">
			<div class="header-content">
				<div class="flex items-center gap-2">
					<Icon name="video" class="text-accent" />
					<h1 class="text-xl font-semibold">{analysis.title}</h1>
				</div>
				<div class="metadata-row">
					<span class="metadata-item">
						<Icon name="file-video" class="text-neutral-400" />
						{analysis.fileName}
					</span>
					<span class="metadata-item">
						<Icon name="hard-drive" class="text-neutral-400" />
						{formatFileSize(analysis.fileSize)}
					</span>
					{#if analysis.videoMetadata.duration}
						<span class="metadata-item">
							<Icon name="clock" class="text-neutral-400" />
							{formatDuration(analysis.videoMetadata.duration)}
						</span>
					{/if}
					{#if analysis.videoMetadata.width && analysis.videoMetadata.height}
						<span class="metadata-item">
							<Icon name="monitor" class="text-neutral-400" />
							{formatResolution(analysis.videoMetadata.width, analysis.videoMetadata.height)}
						</span>
					{/if}
					{#if analysis.videoMetadata.fps}
						<span class="metadata-item">
							<Icon name="gauge" class="text-neutral-400" />
							{analysis.videoMetadata.fps} FPS
						</span>
					{/if}
					<span class="metadata-item status-{analysis.processingStatus}">
						<Icon name="check-circle" />
						{analysis.processingStatus}
					</span>
				</div>
			</div>
		</div>

		<!-- Tabs -->
		<div class="tabs-container">
			<button
				type="button"
				class="tab"
				class:active={activeTab === 'overview'}
				onclick={() => (activeTab = 'overview')}
			>
				<Icon name="layout-grid" />
				Overview
			</button>
			<button
				type="button"
				class="tab"
				class:active={activeTab === 'frames'}
				onclick={() => (activeTab = 'frames')}
			>
				<Icon name="image" />
				Frame Analysis ({analysis.frameAnalysis.length})
			</button>
			<button
				type="button"
				class="tab"
				class:active={activeTab === 'scenes'}
				onclick={() => (activeTab = 'scenes')}
			>
				<Icon name="film" />
				Scenes ({analysis.sceneDetection.length})
			</button>
			{#if analysis.transcription}
				<button
					type="button"
					class="tab"
					class:active={activeTab === 'transcription'}
					onclick={() => (activeTab = 'transcription')}
				>
					<Icon name="file-text" />
					Transcription
				</button>
			{/if}
			<button
				type="button"
				class="tab"
				class:active={activeTab === 'analysis'}
				onclick={() => (activeTab = 'analysis')}
			>
				<Icon name="brain" />
				ACE Analysis
			</button>
		</div>

		<!-- Tab Content -->
		<div class="tab-content">
			{#if activeTab === 'overview'}
				<div class="overview-panel">
					{#if analysis.vlmAnalysis}
						<div class="vlm-section">
							<h3 class="section-title">
								<Icon name="eye" />
								Visual Analysis Summary (Gemma4 VLM)
							</h3>
							<p class="vlm-summary">{analysis.vlmAnalysis.summary}</p>

							{#if analysis.vlmAnalysis.keyObjects.length > 0}
								<div class="vlm-objects">
									<h4 class="subsection-title">Key Objects Detected:</h4>
									<div class="tags-list">
										{#each analysis.vlmAnalysis.keyObjects as obj}
											<span class="tag tag-object">{obj}</span>
										{/each}
									</div>
								</div>
							{/if}

							{#if analysis.vlmAnalysis.activities.length > 0}
								<div class="vlm-activities">
									<h4 class="subsection-title">Activities:</h4>
									<div class="tags-list">
										{#each analysis.vlmAnalysis.activities as activity}
											<span class="tag tag-activity">{activity}</span>
										{/each}
									</div>
								</div>
							{/if}

							{#if analysis.vlmAnalysis.setting}
								<div class="vlm-setting">
									<h4 class="subsection-title">Setting:</h4>
									<p class="text-sm text-neutral-400">{analysis.vlmAnalysis.setting}</p>
								</div>
							{/if}
						</div>
					{/if}

					<div class="stats-grid">
						<div class="stat-card">
							<Icon name="image" class="text-accent" />
							<span class="stat-value">{analysis.frameAnalysis.length}</span>
							<span class="stat-label">Frames Analyzed</span>
						</div>
						<div class="stat-card">
							<Icon name="film" class="text-accent" />
							<span class="stat-value">{analysis.sceneDetection.length}</span>
							<span class="stat-label">Scenes Detected</span>
						</div>
						<div class="stat-card">
							<Icon name="tag" class="text-accent" />
							<span class="stat-value">{analysis.entities.length}</span>
							<span class="stat-label">Entities</span>
						</div>
						{#if analysis.transcription}
							<div class="stat-card">
								<Icon name="type" class="text-accent" />
								<span class="stat-value">{analysis.transcription.text.length}</span>
								<span class="stat-label">Transcription Chars</span>
							</div>
						{/if}
					</div>
				</div>
			{:else if activeTab === 'frames'}
				<div class="frames-panel">
					{#if analysis.frameAnalysis.length > 0}
						<div class="frames-grid">
							{#each analysis.frameAnalysis as frame, i}
								<button
									type="button"
									class="frame-card"
									class:active={selectedFrame === i}
									onclick={() => (selectedFrame = i)}
								>
									{#if frame.framePath}
										<img
											src={frame.framePath}
											alt="Frame at {formatTime(frame.timestamp)}"
											class="frame-thumbnail"
										/>
									{:else}
										<div class="frame-placeholder">
											<Icon name="image" class="text-neutral-400" />
										</div>
									{/if}
									<div class="frame-info">
										<div class="frame-time">{formatTime(frame.timestamp)}</div>
										<p class="frame-description">{frame.description}</p>
										{#if frame.objects && frame.objects.length > 0}
											<div class="frame-objects">
												{#each frame.objects.slice(0, 3) as obj}
													<span class="mini-tag">{obj}</span>
												{/each}
												{#if frame.objects.length > 3}
													<span class="mini-tag">+{frame.objects.length - 3}</span>
												{/if}
											</div>
										{/if}
										{#if frame.confidence !== undefined}
											<div class="frame-confidence">
												<Icon name="gauge" class="text-xs" />
												{(frame.confidence * 100).toFixed(0)}%
											</div>
										{/if}
									</div>
								</button>
							{/each}
						</div>
					{:else}
						<div class="empty-state">
							<Icon name="image-x" class="text-neutral-400" />
							<p class="text-sm text-neutral-400 mt-2">No frame analysis available</p>
							<p class="text-xs text-neutral-500 mt-1">
								VLM processing may still be running
							</p>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'scenes'}
				<div class="scenes-panel">
					{#if analysis.sceneDetection.length > 0}
						<div class="scenes-list">
							{#each analysis.sceneDetection as scene, i}
								<div class="scene-card">
									<div class="scene-header">
										<Icon name="film" class="text-accent" />
										<span class="scene-number">Scene {i + 1}</span>
										<span class="scene-duration">
											{formatTime(scene.startTime)} - {formatTime(scene.endTime)}
											({formatTime(scene.endTime - scene.startTime)})
										</span>
									</div>
									<p class="scene-description">{scene.description}</p>
								</div>
							{/each}
						</div>
					{:else}
						<div class="empty-state">
							<Icon name="film-x" class="text-neutral-400" />
							<p class="text-sm text-neutral-400 mt-2">No scene detection available</p>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'transcription'}
				<div class="transcription-panel">
					{#if analysis.transcription?.text}
						<div class="transcription-text">
							{analysis.transcription.text}
						</div>
						<div class="transcription-stats">
							<span>{analysis.transcription.text.length} characters</span>
							<span>Language: {analysis.transcription.language || 'Unknown'}</span>
							{#if analysis.transcription.segments}
								<span>{analysis.transcription.segments.length} segments</span>
							{/if}
						</div>
					{:else}
						<div class="empty-state">
							<Icon name="file-x" class="text-neutral-400" />
							<p class="text-sm text-neutral-400 mt-2">No transcription available</p>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'analysis'}
				<div class="analysis-panel">
					{#if analysis.aceAnalysis}
						<div class="ace-section">
							<h3 class="section-title">
								<Icon name="file-text" />
								Summary
							</h3>
							<p class="ace-summary">{analysis.aceAnalysis.summary}</p>
						</div>

						<div class="ace-section">
							<h3 class="section-title">
								<Icon name="gauge" />
								Confidence
							</h3>
							<div class="confidence-bar">
								<div
									class="confidence-fill"
									style="width: {analysis.aceAnalysis.confidence * 100}%"
								></div>
								<span class="confidence-label"
									>{(analysis.aceAnalysis.confidence * 100).toFixed(0)}%</span
								>
							</div>
						</div>

						{#if analysis.aceAnalysis.tags.length > 0}
							<div class="ace-section">
								<h3 class="section-title">
									<Icon name="tags" />
									Tags
								</h3>
								<div class="tags-list">
									{#each analysis.aceAnalysis.tags as tag}
										<span class="tag">{tag}</span>
									{/each}
								</div>
							</div>
						{/if}

						{#if analysis.entities.length > 0}
							<div class="ace-section">
								<h3 class="section-title">
									<Icon name="user" />
									Entities ({analysis.entities.length})
								</h3>
								<div class="entities-list">
									{#each analysis.entities as entity}
										<div class="entity-item">
											<span class="entity-type">{entity.type}</span>
											<span class="entity-text">"{entity.text}"</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					{:else}
						<div class="empty-state">
							<Icon name="brain-x" class="text-neutral-400" />
							<p class="text-sm text-neutral-400 mt-2">No ACE analysis available</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.video-analysis-view {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		height: 100%;
	}

	.loading-state,
	.error-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
	}

	.analysis-header {
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 0.5rem;
		padding: 1.5rem;
	}

	.header-content {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.metadata-row {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		font-size: 0.875rem;
		color: var(--t-text-secondary);
	}

	.metadata-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.status-complete {
		color: var(--t-success);
	}

	.status-error {
		color: var(--t-danger);
	}

	.status-pending,
	.status-processing {
		color: var(--t-warning);
	}

	.tabs-container {
		display: flex;
		gap: 0.5rem;
		border-bottom: 1px solid var(--t-border);
		padding-bottom: 0.5rem;
		flex-wrap: wrap;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border: none;
		background: transparent;
		color: var(--t-text-secondary);
		cursor: pointer;
		border-radius: 0.375rem;
		transition: all 0.2s;
	}

	.tab:hover {
		background: var(--t-panel-soft);
		color: var(--t-text);
	}

	.tab.active {
		background: var(--t-accent-soft);
		color: var(--t-accent);
	}

	.tab-content {
		flex: 1;
		overflow-y: auto;
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 0.5rem;
		padding: 1.5rem;
	}

	.overview-panel {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.vlm-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		background: var(--t-bg);
		border: 1px solid var(--t-border);
		border-radius: 0.5rem;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1rem;
		font-weight: 600;
		color: var(--t-text);
	}

	.subsection-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--t-text);
		margin-bottom: 0.5rem;
	}

	.vlm-summary {
		line-height: 1.6;
		color: var(--t-text-secondary);
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1rem;
	}

	.stat-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem;
		background: var(--t-bg);
		border: 1px solid var(--t-border);
		border-radius: 0.375rem;
		text-align: center;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--t-text);
	}

	.stat-label {
		font-size: 0.75rem;
		color: var(--t-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.frames-panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.frames-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
	}

	.frame-card {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0;
		background: var(--t-bg);
		border: 2px solid var(--t-border);
		border-radius: 0.5rem;
		overflow: hidden;
		cursor: pointer;
		transition: all 0.2s;
		text-align: left;
	}

	.frame-card:hover {
		border-color: var(--t-accent);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.frame-card.active {
		border-color: var(--t-accent);
		background: var(--t-accent-soft);
	}

	.frame-thumbnail {
		width: 100%;
		height: 180px;
		object-fit: cover;
	}

	.frame-placeholder {
		width: 100%;
		height: 180px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--t-panel);
	}

	.frame-info {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
	}

	.frame-time {
		font-size: 0.75rem;
		color: var(--t-text-secondary);
		font-family: monospace;
	}

	.frame-description {
		font-size: 0.875rem;
		color: var(--t-text);
		line-height: 1.4;
	}

	.frame-objects {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.mini-tag {
		padding: 0.125rem 0.375rem;
		background: var(--t-panel-soft);
		color: var(--t-text-secondary);
		border-radius: 0.25rem;
		font-size: 0.75rem;
	}

	.frame-confidence {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--t-accent);
	}

	.scenes-panel {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.scenes-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.scene-card {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		background: var(--t-bg);
		border: 1px solid var(--t-border);
		border-radius: 0.5rem;
	}

	.scene-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.875rem;
	}

	.scene-number {
		font-weight: 600;
		color: var(--t-text);
	}

	.scene-duration {
		color: var(--t-text-secondary);
		font-family: monospace;
		font-size: 0.75rem;
	}

	.scene-description {
		color: var(--t-text-secondary);
		line-height: 1.6;
	}

	.transcription-panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.transcription-text {
		line-height: 1.8;
		white-space: pre-wrap;
		color: var(--t-text);
		padding: 1rem;
		background: var(--t-bg);
		border-radius: 0.375rem;
	}

	.transcription-stats {
		display: flex;
		gap: 1rem;
		font-size: 0.875rem;
		color: var(--t-text-secondary);
		padding-top: 0.5rem;
		border-top: 1px solid var(--t-border);
	}

	.analysis-panel {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.ace-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.ace-summary {
		line-height: 1.6;
		color: var(--t-text-secondary);
	}

	.confidence-bar {
		position: relative;
		height: 2rem;
		background: var(--t-bg);
		border-radius: 0.375rem;
		overflow: hidden;
	}

	.confidence-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--t-accent), var(--t-success));
		transition: width 0.3s;
	}

	.confidence-label {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-weight: 600;
		color: var(--t-text);
		font-size: 0.875rem;
	}

	.tags-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.tag {
		padding: 0.25rem 0.75rem;
		background: var(--t-accent-soft);
		color: var(--t-accent);
		border-radius: 9999px;
		font-size: 0.875rem;
	}

	.tag-object {
		background: var(--t-info-soft);
		color: var(--t-info);
	}

	.tag-activity {
		background: var(--t-warning-soft);
		color: var(--t-warning);
	}

	.entities-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.entity-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem;
		background: var(--t-bg);
		border-radius: 0.375rem;
	}

	.entity-type {
		padding: 0.25rem 0.5rem;
		background: var(--t-accent-soft);
		color: var(--t-accent);
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.entity-text {
		color: var(--t-text);
		font-size: 0.875rem;
	}
</style>
