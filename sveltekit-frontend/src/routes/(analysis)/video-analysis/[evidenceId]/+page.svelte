<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	interface VideoAnalysisData {
		vlmAnalysis: {
			summary: string;
			keyObjects: string[];
			activities: string[];
			setting: string;
		} | null;
		frameAnalysis: Array<{
			timestamp: number;
			framePath: string;
			description: string;
			objects: string[];
			tags: string[];
			confidence: number;
		}>;
		sceneDetection: Array<{
			startTime: number;
			endTime: number;
			description: string;
		}>;
		videoMetadata: {
			duration: number;
			width: number;
			height: number;
			fps: number;
			codec: string;
		};
		transcription: { text: string } | null;
		aceAnalysis: {
			summary: string;
			confidence: number;
			tags: string[];
		} | null;
	}

	let loading = $state(true);
	let error = $state<string | null>(null);
	let analysis = $state<VideoAnalysisData | null>(null);
	let activeTab = $state<'overview' | 'frames' | 'scenes' | 'transcription' | 'analysis'>('overview');
	let currentFrame = $state(0);

	// Load analysis data
	$effect(() => {
		if (data.evidenceId) {
			loadAnalysis();
		}
	});

	async function loadAnalysis() {
		try {
			loading = true;
			const response = await fetch(`/api/video/analysis/${data.evidenceId}`);
			if (!response.ok) throw new Error('Failed to load analysis');
			analysis = await response.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	function formatTimestamp(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function formatResolution(width?: number, height?: number): string {
		if (!width || !height) return 'Unknown';
		if (height >= 2160) return '4K';
		if (height >= 1080) return '1080p';
		if (height >= 720) return '720p';
		return `${width}×${height}`;
	}

	function handleClose() {
		goto('/evidence');
	}
</script>

<svelte:head>
	<title>{data.title || 'Video Analysis'} | Legal AI</title>
</svelte:head>

<!-- Professional Video Editor Layout -->
<div class="video-editor">
	<!-- Top Toolbar -->
	<div class="toolbar">
		<div class="toolbar-left">
			<button type="button" class="tool-btn tool-btn-close" onclick={handleClose} title="Close (ESC)">
				<Icon name="x" />
			</button>
			<div class="toolbar-divider"></div>
			<div class="toolbar-title">
				<Icon name="video" />
				<span>{data.title || 'Video Analysis'}</span>
			</div>
		</div>

		<div class="toolbar-center">
			{#if analysis?.videoMetadata}
				<div class="video-metadata">
					<span class="meta-chip">
						<Icon name="monitor" />
						{formatResolution(analysis.videoMetadata.width, analysis.videoMetadata.height)}
					</span>
					<span class="meta-chip">
						<Icon name="zap" />
						{analysis.videoMetadata.fps} FPS
					</span>
					<span class="meta-chip">
						<Icon name="clock" />
						{formatTimestamp(analysis.videoMetadata.duration)}
					</span>
				</div>
			{/if}
		</div>

		<div class="toolbar-right">
			<button type="button" class="tool-btn" title="Export">
				<Icon name="download" />
			</button>
			<button type="button" class="tool-btn" title="Settings">
				<Icon name="settings" />
			</button>
		</div>
	</div>

	{#if loading}
		<div class="loading-state">
			<Icon name="loader-circle" class="animate-spin" />
			<p>Loading video analysis...</p>
		</div>
	{:else if error || data.loadError}
		<div class="error-state">
			<Icon name="alert-circle" />
			<p>{error || data.loadError}</p>
			<button type="button" class="btn-primary" onclick={handleClose}>
				Back to Evidence
			</button>
		</div>
	{:else}
		<!-- Main Content Area -->
		<div class="content-area">
			<!-- Left Panel: Tabs -->
			<div class="left-panel">
				<div class="tab-list">
					<button
						type="button"
						class="tab"
						class:active={activeTab === 'overview'}
						onclick={() => (activeTab = 'overview')}
					>
						<Icon name="layout-dashboard" />
						<span>Overview</span>
					</button>
					<button
						type="button"
						class="tab"
						class:active={activeTab === 'frames'}
						onclick={() => (activeTab = 'frames')}
					>
						<Icon name="film" />
						<span>Frames</span>
						{#if analysis && analysis.frameAnalysis.length > 0}
							<span class="badge">{analysis.frameAnalysis.length}</span>
						{/if}
					</button>
					<button
						type="button"
						class="tab"
						class:active={activeTab === 'scenes'}
						onclick={() => (activeTab = 'scenes')}
					>
						<Icon name="scissors" />
						<span>Scenes</span>
						{#if analysis && analysis.sceneDetection.length > 0}
							<span class="badge">{analysis.sceneDetection.length}</span>
						{/if}
					</button>
					<button
						type="button"
						class="tab"
						class:active={activeTab === 'transcription'}
						onclick={() => (activeTab = 'transcription')}
					>
						<Icon name="file-text" />
						<span>Transcription</span>
					</button>
					<button
						type="button"
						class="tab"
						class:active={activeTab === 'analysis'}
						onclick={() => (activeTab = 'analysis')}
					>
						<Icon name="brain" />
						<span>AI Analysis</span>
					</button>
				</div>
			</div>

			<!-- Center Panel: Content -->
			<div class="center-panel">
				{#if activeTab === 'overview'}
					<div class="panel-content">
						{#if analysis?.vlmAnalysis}
							<div class="overview-grid">
								<!-- VLM Summary Card -->
								<div class="overview-card overview-card-wide">
									<h3><Icon name="sparkles" /> AI Visual Analysis</h3>
									<p class="summary-text">{analysis.vlmAnalysis.summary}</p>
								</div>

								<!-- Key Objects Card -->
								<div class="overview-card">
									<h3><Icon name="cube" /> Key Objects</h3>
									<div class="tags-grid">
										{#each analysis.vlmAnalysis.keyObjects as obj}
											<span class="tag tag-object">{obj}</span>
										{/each}
									</div>
								</div>

								<!-- Activities Card -->
								<div class="overview-card">
									<h3><Icon name="activity" /> Activities</h3>
									<div class="tags-grid">
										{#each analysis.vlmAnalysis.activities as activity}
											<span class="tag tag-activity">{activity}</span>
										{/each}
									</div>
								</div>

								<!-- Setting Card -->
								<div class="overview-card overview-card-wide">
									<h3><Icon name="map-pin" /> Setting</h3>
									<p class="setting-text">{analysis.vlmAnalysis.setting}</p>
								</div>

								<!-- Stats Card -->
								<div class="overview-card">
									<h3><Icon name="bar-chart-3" /> Statistics</h3>
									<div class="stats-grid">
										<div class="stat">
											<div class="stat-value">{analysis.frameAnalysis.length}</div>
											<div class="stat-label">Frames Analyzed</div>
										</div>
										<div class="stat">
											<div class="stat-value">{analysis.sceneDetection.length}</div>
											<div class="stat-label">Scenes Detected</div>
										</div>
									</div>
								</div>
							</div>
						{:else}
							<div class="empty-state">
								<Icon name="video-off" />
								<p>No VLM analysis available</p>
							</div>
						{/if}
					</div>
				{:else if activeTab === 'frames'}
					<div class="panel-content">
						{#if analysis && analysis.frameAnalysis.length > 0}
							<div class="frames-grid">
								{#each analysis.frameAnalysis as frame, idx}
									<div class="frame-card" class:selected={currentFrame === idx} onclick={() => (currentFrame = idx)}>
										{#if frame.framePath}
											<div class="frame-thumbnail">
												<img src={frame.framePath} alt="Frame at {formatTimestamp(frame.timestamp)}" />
												<div class="frame-time">{formatTimestamp(frame.timestamp)}</div>
											</div>
										{:else}
											<div class="frame-thumbnail frame-thumbnail-empty">
												<Icon name="image-off" />
											</div>
										{/if}
										<div class="frame-details">
											<p class="frame-description">{frame.description}</p>
											{#if frame.objects.length > 0}
												<div class="frame-tags">
													{#each frame.objects.slice(0, 3) as obj}
														<span class="mini-tag">{obj}</span>
													{/each}
													{#if frame.objects.length > 3}
														<span class="mini-tag">+{frame.objects.length - 3}</span>
													{/if}
												</div>
											{/if}
											<div class="frame-confidence">
												<div class="confidence-bar-mini">
													<div class="confidence-fill-mini" style="width: {frame.confidence * 100}%"></div>
												</div>
												<span class="confidence-text">{Math.round(frame.confidence * 100)}%</span>
											</div>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<div class="empty-state">
								<Icon name="film" />
								<p>No frame analysis available</p>
							</div>
						{/if}
					</div>
				{:else if activeTab === 'scenes'}
					<div class="panel-content">
						{#if analysis && analysis.sceneDetection.length > 0}
							<div class="scenes-list">
								{#each analysis.sceneDetection as scene, idx}
									<div class="scene-card">
										<div class="scene-header">
											<span class="scene-number">Scene {idx + 1}</span>
											<span class="scene-duration">
												{formatTimestamp(scene.startTime)} - {formatTimestamp(scene.endTime)}
												<span class="duration-badge">{formatTimestamp(scene.endTime - scene.startTime)}</span>
											</span>
										</div>
										<p class="scene-description">{scene.description}</p>
									</div>
								{/each}
							</div>
						{:else}
							<div class="empty-state">
								<Icon name="scissors" />
								<p>No scenes detected</p>
							</div>
						{/if}
					</div>
				{:else if activeTab === 'transcription'}
					<div class="panel-content">
						{#if analysis?.transcription}
							<div class="transcription-view">
								<h3><Icon name="file-text" /> Audio Transcription</h3>
								<div class="transcription-text">{analysis.transcription.text}</div>
							</div>
						{:else}
							<div class="empty-state">
								<Icon name="mic-off" />
								<p>No audio transcription available</p>
							</div>
						{/if}
					</div>
				{:else if activeTab === 'analysis'}
					<div class="panel-content">
						{#if analysis?.aceAnalysis}
							<div class="analysis-view">
								<div class="analysis-section">
									<h3><Icon name="file-text" /> Summary</h3>
									<p class="summary-text">{analysis.aceAnalysis.summary}</p>
								</div>
								{#if analysis.aceAnalysis.confidence}
									<div class="analysis-section">
										<h3><Icon name="gauge" /> Confidence</h3>
										<div class="confidence-bar">
											<div class="confidence-fill" style="width: {analysis.aceAnalysis.confidence * 100}%"></div>
											<span class="confidence-value">{Math.round(analysis.aceAnalysis.confidence * 100)}%</span>
										</div>
									</div>
								{/if}
								{#if analysis.aceAnalysis.tags.length > 0}
									<div class="analysis-section">
										<h3><Icon name="tags" /> Tags</h3>
										<div class="tags-grid">
											{#each analysis.aceAnalysis.tags as tag}
												<span class="tag">{tag}</span>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{:else}
							<div class="empty-state">
								<Icon name="brain" />
								<p>No ACE analysis available</p>
							</div}
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.video-editor {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: var(--t-bg);
		color: var(--t-text);
	}

	/* ═══ Toolbar ═══ */
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 52px;
		padding: 0 0.75rem;
		background: var(--t-panel);
		border-bottom: 1px solid var(--t-border);
		flex-shrink: 0;
	}

	.toolbar-left,
	.toolbar-center,
	.toolbar-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.toolbar-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--t-text);
	}

	.toolbar-divider {
		width: 1px;
		height: 24px;
		background: var(--t-border);
		margin: 0 0.25rem;
	}

	.tool-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 0.375rem;
		background: transparent;
		border: none;
		color: var(--t-text-secondary);
		cursor: pointer;
		transition: all 0.2s;
	}

	.tool-btn:hover:not(:disabled) {
		background: var(--t-panel-soft);
		color: var(--t-text);
	}

	.tool-btn-close:hover {
		background: var(--t-danger);
		color: white;
	}

	.video-metadata {
		display: flex;
		gap: 0.75rem;
	}

	.meta-chip {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		background: var(--t-panel-soft);
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--t-text-secondary);
	}

	/* ═══ Content Area ═══ */
	.content-area {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	/* ═══ Left Panel (Tabs) ═══ */
	.left-panel {
		width: 200px;
		background: var(--t-panel);
		border-right: 1px solid var(--t-border);
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.tab-list {
		display: flex;
		flex-direction: column;
		padding: 0.5rem;
		gap: 0.25rem;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-radius: 0.375rem;
		background: transparent;
		border: none;
		color: var(--t-text-secondary);
		cursor: pointer;
		transition: all 0.2s;
		font-size: 0.875rem;
		text-align: left;
	}

	.tab:hover {
		background: var(--t-panel-soft);
		color: var(--t-text);
	}

	.tab.active {
		background: var(--t-accent-soft);
		color: var(--t-accent);
		font-weight: 600;
	}

	.badge {
		margin-left: auto;
		padding: 0.125rem 0.5rem;
		background: var(--t-accent-soft);
		color: var(--t-accent);
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	/* ═══ Center Panel ═══ */
	.center-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
	}

	/* ═══ States ═══ */
	.loading-state,
	.error-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: 1rem;
		color: var(--t-text-secondary);
	}

	/* ═══ Overview Grid ═══ */
	.overview-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.5rem;
		max-width: 1200px;
	}

	.overview-card {
		padding: 1.5rem;
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 0.75rem;
	}

	.overview-card-wide {
		grid-column: span 2;
	}

	.overview-card h3 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: 1rem;
		color: var(--t-text);
	}

	.summary-text,
	.setting-text {
		line-height: 1.6;
		color: var(--t-text-secondary);
	}

	.tags-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.tag {
		padding: 0.5rem 0.875rem;
		background: var(--t-accent-soft);
		color: var(--t-accent);
		border-radius: 999px;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.tag-object {
		background: rgba(59, 130, 246, 0.1);
		color: #60a5fa;
	}

	.tag-activity {
		background: rgba(168, 85, 247, 0.1);
		color: #c084fc;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
	}

	.stat {
		text-align: center;
		padding: 1rem;
		background: var(--t-bg);
		border-radius: 0.5rem;
	}

	.stat-value {
		font-size: 2rem;
		font-weight: 700;
		color: var(--t-accent);
		margin-bottom: 0.25rem;
	}

	.stat-label {
		font-size: 0.75rem;
		color: var(--t-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* ═══ Frames Grid ═══ */
	.frames-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
		max-width: 1400px;
	}

	.frame-card {
		background: var(--t-panel);
		border: 2px solid var(--t-border);
		border-radius: 0.75rem;
		overflow: hidden;
		cursor: pointer;
		transition: all 0.2s;
	}

	.frame-card:hover {
		border-color: var(--t-accent);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.frame-card.selected {
		border-color: var(--t-accent);
		box-shadow: 0 0 0 3px var(--t-accent-soft);
	}

	.frame-thumbnail {
		position: relative;
		aspect-ratio: 16 / 9;
		background: var(--t-bg);
		overflow: hidden;
	}

	.frame-thumbnail img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.frame-thumbnail-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--t-text-secondary);
	}

	.frame-time {
		position: absolute;
		bottom: 0.5rem;
		right: 0.5rem;
		padding: 0.25rem 0.5rem;
		background: rgba(0, 0, 0, 0.75);
		color: white;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-family: monospace;
		font-weight: 600;
		backdrop-filter: blur(8px);
	}

	.frame-details {
		padding: 1rem;
	}

	.frame-description {
		font-size: 0.875rem;
		line-height: 1.5;
		margin-bottom: 0.75rem;
		color: var(--t-text-secondary);
	}

	.frame-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-bottom: 0.75rem;
	}

	.mini-tag {
		padding: 0.125rem 0.5rem;
		background: var(--t-accent-soft);
		color: var(--t-accent);
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 600;
	}

	.frame-confidence {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.confidence-bar-mini {
		flex: 1;
		height: 4px;
		background: var(--t-bg);
		border-radius: 999px;
		overflow: hidden;
	}

	.confidence-fill-mini {
		height: 100%;
		background: var(--t-accent);
		transition: width 0.3s ease;
	}

	.confidence-text {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--t-text-secondary);
	}

	/* ═══ Scenes List ═══ */
	.scenes-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 900px;
	}

	.scene-card {
		padding: 1.5rem;
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 0.75rem;
	}

	.scene-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.scene-number {
		font-weight: 700;
		color: var(--t-accent);
	}

	.scene-duration {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: monospace;
		font-size: 0.875rem;
		color: var(--t-text-secondary);
	}

	.duration-badge {
		padding: 0.25rem 0.5rem;
		background: var(--t-accent-soft);
		color: var(--t-accent);
		border-radius: 0.25rem;
		font-weight: 600;
	}

	.scene-description {
		line-height: 1.6;
		color: var(--t-text-secondary);
	}

	/* ═══ Transcription/Analysis Views ═══ */
	.transcription-view,
	.analysis-view {
		max-width: 800px;
	}

	.transcription-view h3,
	.analysis-section h3 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.125rem;
		font-weight: 600;
		margin-bottom: 1rem;
	}

	.transcription-text {
		line-height: 1.8;
		white-space: pre-wrap;
		padding: 1.5rem;
		background: var(--t-panel);
		border-radius: 0.5rem;
		border: 1px solid var(--t-border);
	}

	.analysis-section {
		margin-bottom: 2rem;
	}

	.confidence-bar {
		position: relative;
		height: 48px;
		background: var(--t-panel);
		border-radius: 0.5rem;
		border: 1px solid var(--t-border);
		overflow: hidden;
	}

	.confidence-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--t-accent-soft), var(--t-accent));
		transition: width 0.5s ease;
	}

	.confidence-value {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-weight: 700;
		font-size: 1.125rem;
		color: var(--t-text);
	}
</style>
