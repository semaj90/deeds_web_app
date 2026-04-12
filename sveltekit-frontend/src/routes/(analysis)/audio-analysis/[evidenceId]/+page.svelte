<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	interface AudioMetadata {
		transcription: {
			text: string;
			language: string;
			duration: number;
			segments: Array<{ start: number; end: number; text: string }>;
		} | null;
		entities: Array<{ type: string; text: string; label?: string }>;
		aceAnalysis: {
			summary: string;
			confidence: number;
			tags: string[];
			claims?: string[];
			contradictions?: string[];
		} | null;
	}

	let loading = $state(true);
	let error = $state<string | null>(null);
	let analysis = $state<AudioMetadata | null>(null);
	let activeTab = $state<'transcription' | 'timeline' | 'analysis' | 'entities'>('transcription');
	let currentTime = $state(0);
	let isPlaying = $state(false);

	// Load analysis data
	$effect(() => {
		if (data.evidenceId) {
			loadAnalysis();
		}
	});

	async function loadAnalysis() {
		try {
			loading = true;
			const response = await fetch(`/api/audio/analysis/${data.evidenceId}`);
			if (!response.ok) throw new Error('Failed to load analysis');
			const result = await response.json();
			analysis = {
				transcription: result.transcription || null,
				entities: result.entities || [],
				aceAnalysis: result.aceAnalysis || null
			};
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

	function handleClose() {
		goto('/evidence');
	}

	function handleExport() {
		if (!analysis) return;

		const exportData = {
			title: data.title,
			evidenceId: data.evidenceId,
			exportDate: new Date().toISOString(),
			transcription: analysis.transcription,
			entities: analysis.entities,
			aceAnalysis: analysis.aceAnalysis
		};

		const blob = new Blob([JSON.stringify(exportData, null, 2)], {
			type: 'application/json'
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `audio-analysis-${data.evidenceId}-${new Date().toISOString().split('T')[0]}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function jumpToSegment(timestamp: number) {
		currentTime = timestamp;
		// Future: integrate with audio player to actually seek
	}

	function handleKeydown(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement)?.tagName;
		const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

		// ESC to close
		if (e.key === 'Escape' && !isInput) {
			e.preventDefault();
			handleClose();
		}

		// Number keys 1-4 to switch tabs
		if (!e.ctrlKey && !e.altKey && !e.shiftKey && !isInput) {
			if (e.key === '1') activeTab = 'transcription';
			if (e.key === '2') activeTab = 'timeline';
			if (e.key === '3') activeTab = 'analysis';
			if (e.key === '4') activeTab = 'entities';
		}

		// Ctrl+E to export
		if (e.ctrlKey && e.key === 'e') {
			e.preventDefault();
			handleExport();
		}

		// Space to play/pause (future)
		if (e.key === ' ' && !isInput && analysis?.transcription) {
			e.preventDefault();
			isPlaying = !isPlaying;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>{data.title || 'Audio Analysis'} | Legal AI</title>
</svelte:head>

<!-- Professional Audio Editor Layout -->
<div class="audio-editor">
	<!-- Top Toolbar -->
	<div class="toolbar">
		<div class="toolbar-left">
			<button type="button" class="tool-btn tool-btn-close" onclick={handleClose} title="Close (ESC)">
				<Icon name="x" />
			</button>
			<div class="toolbar-divider"></div>
			<div class="toolbar-title">
				<Icon name="audio-lines" />
				<span>{data.title || 'Audio Analysis'}</span>
			</div>
		</div>

		<div class="toolbar-center">
			<!-- Audio Player Controls -->
			<button type="button" class="tool-btn" disabled={!analysis?.transcription}>
				<Icon name="skip-back" />
			</button>
			<button type="button" class="tool-btn tool-btn-primary" disabled={!analysis?.transcription}>
				<Icon name={isPlaying ? 'pause' : 'play'} />
			</button>
			<button type="button" class="tool-btn" disabled={!analysis?.transcription}>
				<Icon name="skip-forward" />
			</button>
			<div class="time-display">
				{formatTimestamp(currentTime)} / {formatTimestamp(analysis?.transcription?.duration || 0)}
			</div>
		</div>

		<div class="toolbar-right">
			<button type="button" class="tool-btn" onclick={handleExport} disabled={!analysis} title="Export (Ctrl+E)">
				<Icon name="download" />
			</button>
			<div class="keyboard-hint">Ctrl+E</div>
			<div class="toolbar-divider"></div>
			<button type="button" class="tool-btn" title="Settings">
				<Icon name="settings" />
			</button>
		</div>
	</div>

	{#if loading}
		<div class="loading-state">
			<Icon name="loader-circle" class="animate-spin" />
			<p>Loading audio analysis...</p>
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
						class:active={activeTab === 'transcription'}
						onclick={() => (activeTab = 'transcription')}
					>
						<Icon name="file-text" />
						<span>Transcription</span>
					</button>
					<button
						type="button"
						class="tab"
						class:active={activeTab === 'timeline'}
						onclick={() => (activeTab = 'timeline')}
					>
						<Icon name="clock" />
						<span>Timeline</span>
					</button>
					<button
						type="button"
						class="tab"
						class:active={activeTab === 'analysis'}
						onclick={() => (activeTab = 'analysis')}
					>
						<Icon name="brain" />
						<span>Analysis</span>
					</button>
					<button
						type="button"
						class="tab"
						class:active={activeTab === 'entities'}
						onclick={() => (activeTab = 'entities')}
					>
						<Icon name="tag" />
						<span>Entities</span>
						{#if analysis && analysis.entities.length > 0}
							<span class="badge">{analysis.entities.length}</span>
						{/if}
					</button>
				</div>
			</div>

			<!-- Center Panel: Content -->
			<div class="center-panel">
				{#if activeTab === 'transcription'}
					<div class="panel-content">
						{#if analysis?.transcription}
							<div class="transcription-view">
								<div class="transcription-header">
									<h3>Full Transcription</h3>
									<div class="metadata">
										<span class="meta-item">
											<Icon name="languages" />
											{analysis.transcription.language.toUpperCase()}
										</span>
										<span class="meta-item">
											<Icon name="clock" />
											{formatTimestamp(analysis.transcription.duration)}
										</span>
									</div>
								</div>
								<div class="transcription-text">
									{analysis.transcription.text}
								</div>
							</div>
						{:else}
							<div class="empty-state">
								<Icon name="file-audio" />
								<p>No transcription available</p>
							</div>
						{/if}
					</div>
				{:else if activeTab === 'timeline'}
					<div class="panel-content">
						{#if analysis?.transcription?.segments && analysis.transcription.segments.length > 0}
							<div class="timeline-view">
								<div class="timeline-header">
									<h3>Timeline Segments</h3>
									<span class="segment-count">{analysis.transcription.segments.length} segments</span>
								</div>
								<div class="timeline-list">
									{#each analysis.transcription.segments as segment}
										<button
											type="button"
											class="timeline-segment"
											onclick={() => jumpToSegment(segment.start)}
											class:active={currentTime >= segment.start && currentTime < segment.end}
										>
											<div class="segment-time">
												<Icon name="play-circle" class="segment-play-icon" />
												{formatTimestamp(segment.start)} - {formatTimestamp(segment.end)}
											</div>
											<div class="segment-text">{segment.text}</div>
										</button>
									{/each}
								</div>
							</div>
						{:else}
							<div class="empty-state">
								<Icon name="timeline" />
								<p>No timeline segments available</p>
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
							</div>
						{/if}
					</div>
				{:else if activeTab === 'entities'}
					<div class="panel-content">
						{#if analysis && analysis.entities.length > 0}
							<div class="entities-view">
								<div class="entities-header">
									<h3>Extracted Entities</h3>
									<span class="entity-count">{analysis.entities.length} entities</span>
								</div>
								<div class="entities-list">
									{#each analysis.entities as entity}
										<div class="entity-item">
											<span class="entity-type">{entity.type}</span>
											<span class="entity-text">"{entity.text}"</span>
										</div>
									{/each}
								</div>
							</div>
						{:else}
							<div class="empty-state">
								<Icon name="tag" />
								<p>No entities extracted</p>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.audio-editor {
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

	.tool-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.tool-btn-close:hover {
		background: var(--t-danger);
		color: white;
	}

	.tool-btn-primary {
		background: var(--t-accent);
		color: white;
	}

	.tool-btn-primary:hover:not(:disabled) {
		background: var(--t-accent);
		opacity: 0.9;
	}

	.time-display {
		font-size: 0.875rem;
		font-family: monospace;
		color: var(--t-text-secondary);
		margin-left: 0.5rem;
	}

	.keyboard-hint {
		font-size: 0.65rem;
		font-family: monospace;
		color: var(--t-text-secondary);
		opacity: 0.6;
		padding: 0.125rem 0.375rem;
		background: var(--t-bg);
		border-radius: 0.25rem;
		border: 1px solid var(--t-border);
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

	/* ═══ Center Panel (Content) ═══ */
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

	/* ═══ Transcription View ═══ */
	.transcription-view {
		max-width: 800px;
	}

	.transcription-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}

	.transcription-header h3 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
	}

	.metadata {
		display: flex;
		gap: 1rem;
		font-size: 0.875rem;
		color: var(--t-text-secondary);
	}

	.meta-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.transcription-text {
		line-height: 1.8;
		white-space: pre-wrap;
		padding: 1.5rem;
		background: var(--t-panel);
		border-radius: 0.5rem;
		border: 1px solid var(--t-border);
	}

	/* ═══ Timeline View ═══ */
	.timeline-view {
		max-width: 900px;
	}

	.timeline-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}

	.timeline-header h3 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
	}

	.segment-count {
		font-size: 0.875rem;
		color: var(--t-text-secondary);
	}

	.timeline-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.timeline-segment {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 1rem;
		background: var(--t-panel);
		border-radius: 0.5rem;
		border: 1px solid var(--t-border);
		transition: all 0.2s;
		cursor: pointer;
		text-align: left;
		width: 100%;
	}

	.timeline-segment:hover {
		border-color: var(--t-accent);
		background: var(--t-panel-soft);
		transform: translateX(4px);
	}

	.timeline-segment.active {
		border-color: var(--t-accent);
		background: var(--t-accent-soft);
		box-shadow: 0 0 0 3px rgba(var(--t-accent-rgb), 0.1);
	}

	.segment-time {
		font-family: monospace;
		font-size: 0.875rem;
		color: var(--t-accent);
		font-weight: 600;
		min-width: 100px;
	}

	.segment-text {
		flex: 1;
		line-height: 1.6;
	}

	/* ═══ Analysis View ═══ */
	.analysis-view {
		max-width: 800px;
	}

	.analysis-section {
		margin-bottom: 2rem;
	}

	.analysis-section h3 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.125rem;
		font-weight: 600;
		margin-bottom: 1rem;
	}

	.summary-text {
		line-height: 1.8;
		padding: 1.5rem;
		background: var(--t-panel);
		border-radius: 0.5rem;
		border: 1px solid var(--t-border);
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

	.tags-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.tag {
		padding: 0.5rem 1rem;
		background: var(--t-accent-soft);
		color: var(--t-accent);
		border-radius: 999px;
		font-size: 0.875rem;
		font-weight: 600;
	}

	/* ═══ Entities View ═══ */
	.entities-view {
		max-width: 800px;
	}

	.entities-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}

	.entities-header h3 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
	}

	.entity-count {
		font-size: 0.875rem;
		color: var(--t-text-secondary);
	}

	.entities-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.entity-item {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: var(--t-panel);
		border-radius: 0.5rem;
		border: 1px solid var(--t-border);
	}

	.entity-type {
		padding: 0.25rem 0.75rem;
		background: var(--t-accent-soft);
		color: var(--t-accent);
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.entity-text {
		flex: 1;
		font-size: 0.9375rem;
	}
</style>
