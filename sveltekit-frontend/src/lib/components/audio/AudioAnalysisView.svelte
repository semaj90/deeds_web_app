<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		evidenceId: string;
	}

	let { evidenceId }: Props = $props();

	interface TranscriptionSegment {
		id: number;
		start: number;
		end: number;
		text: string;
		avg_logprob?: number;
		no_speech_prob?: number;
	}

	interface Transcription {
		text: string;
		language: string;
		duration: number;
		segments?: TranscriptionSegment[];
	}

	interface Entity {
		type: string;
		text: string;
		label?: string;
		start?: number;
		end?: number;
	}

	interface ACEAnalysis {
		summary: string;
		confidence: number;
		tags: string[];
		claims?: string[];
		contradictions?: string[];
	}

	interface AudioAnalysis {
		evidenceId: string;
		title: string;
		fileName: string;
		fileSize: number;
		processingStatus: string;
		transcription: Transcription | null;
		entities: Entity[];
		aceAnalysis: ACEAnalysis | null;
		createdAt: string;
	}

	let loading = $state(true);
	let error = $state<string | null>(null);
	let analysis = $state<AudioAnalysis | null>(null);
	let activeTab = $state<'transcription' | 'timeline' | 'analysis' | 'entities'>('transcription');
	let currentSegment = $state<number | null>(null);

	onMount(async () => {
		try {
			const response = await fetch(`/api/audio/analysis/${evidenceId}`);
			if (!response.ok) {
				throw new Error('Failed to load audio analysis');
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
</script>

<div class="audio-analysis-view">
	{#if loading}
		<div class="loading-state">
			<Icon name="loader-circle" class="animate-spin text-accent" />
			<p class="text-sm text-neutral-400 mt-2">Loading audio analysis...</p>
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
					<Icon name="audio-lines" class="text-accent" />
					<h1 class="text-xl font-semibold">{analysis.title}</h1>
				</div>
				<div class="metadata-row">
					<span class="metadata-item">
						<Icon name="file-audio" class="text-neutral-400" />
						{analysis.fileName}
					</span>
					<span class="metadata-item">
						<Icon name="hard-drive" class="text-neutral-400" />
						{formatFileSize(analysis.fileSize)}
					</span>
					{#if analysis.transcription?.language}
						<span class="metadata-item">
							<Icon name="languages" class="text-neutral-400" />
							{analysis.transcription.language.toUpperCase()}
						</span>
					{/if}
					{#if analysis.transcription?.duration}
						<span class="metadata-item">
							<Icon name="clock" class="text-neutral-400" />
							{formatDuration(analysis.transcription.duration)}
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
				class:active={activeTab === 'transcription'}
				onclick={() => (activeTab = 'transcription')}
			>
				<Icon name="file-text" />
				Transcription
			</button>
			<button
				type="button"
				class="tab"
				class:active={activeTab === 'timeline'}
				onclick={() => (activeTab = 'timeline')}
			>
				<Icon name="clock" />
				Timeline
			</button>
			<button
				type="button"
				class="tab"
				class:active={activeTab === 'analysis'}
				onclick={() => (activeTab = 'analysis')}
			>
				<Icon name="brain" />
				ACE Analysis
			</button>
			<button
				type="button"
				class="tab"
				class:active={activeTab === 'entities'}
				onclick={() => (activeTab = 'entities')}
			>
				<Icon name="tag" />
				Entities ({analysis.entities.length})
			</button>
		</div>

		<!-- Tab Content -->
		<div class="tab-content">
			{#if activeTab === 'transcription'}
				<div class="transcription-panel">
					{#if analysis.transcription?.text}
						<div class="transcription-text">
							{analysis.transcription.text}
						</div>
						<div class="transcription-stats">
							<span>{analysis.transcription.text.length} characters</span>
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
			{:else if activeTab === 'timeline'}
				<div class="timeline-panel">
					{#if analysis.transcription?.segments && analysis.transcription.segments.length > 0}
						<div class="timeline-list">
							{#each analysis.transcription.segments as segment, i (segment.id)}
								<button
									type="button"
									class="timeline-segment"
									class:active={currentSegment === i}
									onclick={() => (currentSegment = i)}
								>
									<div class="segment-time">
										{formatTime(segment.start)} - {formatTime(segment.end)}
									</div>
									<div class="segment-text">{segment.text}</div>
									{#if segment.no_speech_prob !== undefined && segment.no_speech_prob > 0.5}
										<div class="segment-warning">
											<Icon name="alert-triangle" class="text-warning" />
											Low confidence
										</div>
									{/if}
								</button>
							{/each}
						</div>
					{:else}
						<div class="empty-state">
							<Icon name="clock-x" class="text-neutral-400" />
							<p class="text-sm text-neutral-400 mt-2">No timeline segments available</p>
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

						{#if analysis.aceAnalysis.claims && analysis.aceAnalysis.claims.length > 0}
							<div class="ace-section">
								<h3 class="section-title">
									<Icon name="check-square" />
									Claims
								</h3>
								<ul class="claims-list">
									{#each analysis.aceAnalysis.claims as claim}
										<li>{claim}</li>
									{/each}
								</ul>
							</div>
						{/if}

						{#if analysis.aceAnalysis.contradictions && analysis.aceAnalysis.contradictions.length > 0}
							<div class="ace-section">
								<h3 class="section-title">
									<Icon name="alert-triangle" />
									Contradictions
								</h3>
								<ul class="contradictions-list">
									{#each analysis.aceAnalysis.contradictions as contradiction}
										<li>{contradiction}</li>
									{/each}
								</ul>
							</div>
						{/if}
					{:else}
						<div class="empty-state">
							<Icon name="brain-x" class="text-neutral-400" />
							<p class="text-sm text-neutral-400 mt-2">No ACE analysis available</p>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'entities'}
				<div class="entities-panel">
					{#if analysis.entities.length > 0}
						<div class="entities-list">
							{#each analysis.entities as entity}
								<div class="entity-item">
									<span class="entity-type">{entity.type}</span>
									<span class="entity-text">"{entity.text}"</span>
									{#if entity.label}
										<span class="entity-label">{entity.label}</span>
									{/if}
								</div>
							{/each}
						</div>
					{:else}
						<div class="empty-state">
							<Icon name="tag-x" class="text-neutral-400" />
							<p class="text-sm text-neutral-400 mt-2">No entities extracted</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.audio-analysis-view {
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

	.timeline-panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.timeline-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.timeline-segment {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		background: var(--t-bg);
		border: 1px solid var(--t-border);
		border-radius: 0.375rem;
		text-align: left;
		cursor: pointer;
		transition: all 0.2s;
	}

	.timeline-segment:hover {
		background: var(--t-panel-soft);
		border-color: var(--t-accent);
	}

	.timeline-segment.active {
		background: var(--t-accent-soft);
		border-color: var(--t-accent);
	}

	.segment-time {
		font-size: 0.75rem;
		color: var(--t-text-secondary);
		font-family: monospace;
	}

	.segment-text {
		color: var(--t-text);
		line-height: 1.6;
	}

	.segment-warning {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		color: var(--t-warning);
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

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1rem;
		font-weight: 600;
		color: var(--t-text);
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

	.claims-list,
	.contradictions-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-left: 1.5rem;
	}

	.claims-list li,
	.contradictions-list li {
		color: var(--t-text-secondary);
		line-height: 1.6;
	}

	.contradictions-list {
		color: var(--t-warning);
	}

	.entities-panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.entities-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.entity-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: var(--t-bg);
		border: 1px solid var(--t-border);
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
		flex: 1;
		color: var(--t-text);
	}

	.entity-label {
		font-size: 0.875rem;
		color: var(--t-text-secondary);
	}
</style>
