<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { formatFileSize } from './evidence-utils.js';

	let {
		evidenceId = '',
		fileName = '',
		extractedText = '',
		chunks = [],
		gpuAnalysis = null,
		caseId = '',
		previewUrl = '',
		onBack = () => {},
	}: {
		evidenceId?: string;
		fileName?: string;
		extractedText?: string;
		chunks?: any[];
		gpuAnalysis?: any;
		caseId?: string;
		previewUrl?: string;
		onBack?: () => void;
	} = $props();

	let expandedChunks = $state<Set<number>>(new Set());

	function toggleChunk(index: number) {
		if (expandedChunks.has(index)) {
			expandedChunks.delete(index);
		} else {
			expandedChunks.add(index);
		}
		expandedChunks = expandedChunks; // trigger reactivity
	}

	function getPreviewText(text: string, maxChars = 300): string {
		return text.length > maxChars ? text.slice(0, maxChars) + '...' : text;
	}

	function getChunkTypeColor(type?: string): string {
		switch (type?.toUpperCase()) {
			case 'ARTICLE':
				return 'rgba(126, 231, 255, 0.14)'; // cyan
			case 'SECTION':
				return 'rgba(255, 212, 121, 0.14)'; // orange
			case 'SUBSECTION':
				return 'rgba(200, 180, 255, 0.14)'; // purple
			default:
				return 'rgba(200, 200, 200, 0.08)'; // gray
		}
	}

	function getChunkTypeBorder(type?: string): string {
		switch (type?.toUpperCase()) {
			case 'ARTICLE':
				return 'rgba(126, 231, 255, 0.24)';
			case 'SECTION':
				return 'rgba(255, 212, 121, 0.24)';
			case 'SUBSECTION':
				return 'rgba(200, 180, 255, 0.24)';
			default:
				return 'rgba(200, 200, 200, 0.12)';
		}
	}
</script>

<div class="results-container">
	<!-- Header -->
	<div class="results-header">
		<div class="header-icon">
			<Icon name="check-circle-2" class="w-5 h-5" />
		</div>
		<div class="header-text">
			<h3 class="header-title">Evidence Uploaded Successfully</h3>
			<p class="header-subtitle">{fileName}</p>
		</div>
		{#if previewUrl}
			<a href={previewUrl} target="_blank" rel="noopener noreferrer" class="header-download" title="Download or preview file">
				<Icon name="download" class="w-4 h-4" />
			</a>
		{/if}
	</div>

	<!-- Extracted Text Preview -->
	{#if extractedText}
		<div class="section">
			<div class="section-header">
				<div class="section-title-group">
					<Icon name="file-text" class="w-4 h-4" />
					<h4 class="section-title">Extracted Text</h4>
				</div>
				<span class="section-stat">{extractedText.length} characters</span>
			</div>
			<div class="text-preview">
				<p>{getPreviewText(extractedText, 500)}</p>
			</div>
		</div>
	{/if}

	<!-- Chunks Grid -->
	{#if chunks.length > 0}
		<div class="section">
			<div class="section-header">
				<div class="section-title-group">
					<Icon name="layers" class="w-4 h-4" />
					<h4 class="section-title">Document Chunks</h4>
				</div>
				<span class="section-stat">{chunks.length} chunks</span>
			</div>

			<div class="chunks-grid">
				{#each chunks as chunk, idx (idx)}
					<div
						class="chunk-card"
						style="--bg: {getChunkTypeColor(chunk.type)}; --border: {getChunkTypeBorder(chunk.type)};"
					>
						<div class="chunk-header">
							<div class="chunk-type-badge">
								{#if chunk.type}
									<span class="badge-text">{chunk.type.toUpperCase()}</span>
								{:else}
									<span class="badge-text">TEXT</span>
								{/if}
							</div>
							<button
								class="chunk-expand-btn"
								onclick={() => toggleChunk(idx)}
								aria-label={expandedChunks.has(idx) ? 'Collapse' : 'Expand'}
							>
								<Icon name={expandedChunks.has(idx) ? 'chevron-up' : 'chevron-down'} class="w-4 h-4" />
							</button>
						</div>

						<div class="chunk-preview">
							<p>{getPreviewText(chunk.content, 150)}</p>
						</div>

						{#if expandedChunks.has(idx)}
							<div class="chunk-expanded">
								<div class="chunk-full-text">{chunk.content}</div>
								{#if chunk.start !== undefined && chunk.end !== undefined}
									<div class="chunk-meta">
										<span class="meta-item">
											<Icon name="map-pin" class="w-3 h-3" />
											Characters {chunk.start}–{chunk.end}
										</span>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- GPU Analysis Results -->
	{#if gpuAnalysis}
		<div class="section">
			<div class="section-header">
				<div class="section-title-group">
					<Icon name="zap" class="w-4 h-4" />
					<h4 class="section-title">GPU Analysis</h4>
				</div>
				<span class="section-stat gpu-stat">{gpuAnalysis.source?.toUpperCase() ?? 'GPU'}</span>
			</div>

			<div class="gpu-results">
				{#if gpuAnalysis.similarEvidence && gpuAnalysis.similarEvidence.length > 0}
					<div class="gpu-subsection">
						<h5 class="subsection-title">Similar Evidence</h5>
						<div class="similar-list">
							{#each gpuAnalysis.similarEvidence.slice(0, 5) as similar}
								<div class="similar-item">
									<div class="similarity-score">
										<span class="score-value">{(similar.score * 100).toFixed(0)}%</span>
									</div>
									<span class="similar-id">{similar.id.slice(0, 8)}...</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if gpuAnalysis.clusterAssignment !== undefined}
					<div class="gpu-subsection">
						<h5 class="subsection-title">Cluster Assignment</h5>
						<div class="cluster-badge">
							<Icon name="grid-3x3" class="w-4 h-4" />
							<span>Cluster {gpuAnalysis.clusterAssignment}</span>
							{#if gpuAnalysis.clusterCount}
								<span class="cluster-count">(of {gpuAnalysis.clusterCount} clusters)</span>
							{/if}
						</div>
					</div>
				{/if}

				{#if gpuAnalysis.caseEmbeddingUpdated}
					<div class="gpu-subsection">
						<h5 class="subsection-title">Case Embedding</h5>
						<div class="embedding-status">
							<Icon name="check" class="w-4 h-4" />
							<span>Aggregated into case embedding</span>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Actions -->
	<div class="results-actions">
		<button class="action-link back-btn" onclick={onBack} type="button">
			<Icon name="arrow-left" class="w-4 h-4" />
			Upload More Evidence
		</button>
		<a href="/evidence/{evidenceId}" class="action-link">
			<Icon name="eye" class="w-4 h-4" />
			View Details
		</a>
		{#if caseId}
			<a href="/cases/{caseId}" class="action-link">
				<Icon name="briefcase" class="w-4 h-4" />
				Back to Case
			</a>
		{/if}
	</div>
</div>

<style>
	.results-container {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding: 1rem;
		border-radius: 16px;
		background: linear-gradient(135deg, rgba(13, 23, 39, 0.5) 0%, rgba(7, 13, 22, 0.5) 100%);
		border: 1px solid rgba(126, 231, 255, 0.12);
	}

	.results-header {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0.75rem;
		border-radius: 12px;
		background: linear-gradient(135deg, rgba(126, 231, 255, 0.08) 0%, rgba(83, 183, 255, 0.04) 100%);
		border: 1px solid rgba(126, 231, 255, 0.14);
	}

	.header-icon {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		background: rgba(126, 231, 255, 0.16);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #7ee7ff;
		flex-shrink: 0;
	}

	.header-text {
		min-width: 0;
	}

	.header-title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: rgba(240, 248, 255, 0.95);
		margin: 0;
	}

	.header-subtitle {
		font-size: 0.8rem;
		color: rgba(184, 198, 226, 0.64);
		margin: 0.25rem 0 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.header-download {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 6px;
		background: rgba(126, 231, 255, 0.12);
		border: 1px solid rgba(126, 231, 255, 0.18);
		color: rgba(240, 248, 255, 0.8);
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.header-download:hover {
		background: rgba(126, 231, 255, 0.2);
		border-color: rgba(126, 231, 255, 0.28);
		color: rgba(240, 248, 255, 1);
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.75rem;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(120, 160, 220, 0.08);
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.section-title-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: rgba(126, 231, 255, 0.8);
	}

	.section-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: rgba(214, 226, 248, 0.9);
		margin: 0;
	}

	.section-stat {
		font-size: 0.75rem;
		color: rgba(184, 198, 226, 0.56);
		padding: 0.375rem 0.75rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 6px;
		border: 1px solid rgba(120, 160, 220, 0.08);
		white-space: nowrap;
	}

	.gpu-stat {
		background: linear-gradient(135deg, rgba(200, 180, 255, 0.12) 0%, rgba(126, 231, 255, 0.08) 100%);
		border-color: rgba(200, 180, 255, 0.16);
		color: rgba(200, 180, 255, 0.8);
	}

	.text-preview {
		padding: 0.75rem;
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(120, 160, 220, 0.06);
		max-height: 150px;
		overflow-y: auto;
	}

	.text-preview p {
		font-size: 0.8125rem;
		color: rgba(184, 198, 226, 0.78);
		margin: 0;
		line-height: 1.4;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.chunks-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.75rem;
	}

	.chunk-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		border-radius: 10px;
		background: var(--bg);
		border: 1px solid var(--border);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.chunk-card:hover {
		background: var(--bg);
		border-color: var(--border);
		filter: brightness(1.1);
	}

	.chunk-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.chunk-type-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.3rem 0.6rem;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(120, 160, 220, 0.12);
	}

	.badge-text {
		font-size: 0.65rem;
		font-weight: 700;
		color: rgba(214, 226, 248, 0.8);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.chunk-expand-btn {
		background: transparent;
		border: none;
		color: rgba(126, 231, 255, 0.6);
		cursor: pointer;
		padding: 0.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.15s ease;
	}

	.chunk-expand-btn:hover {
		color: rgba(126, 231, 255, 1);
	}

	.chunk-preview {
		padding: 0.5rem;
		border-radius: 6px;
		background: rgba(0, 0, 0, 0.15);
		border: 1px solid rgba(120, 160, 220, 0.08);
	}

	.chunk-preview p {
		font-size: 0.75rem;
		color: rgba(184, 198, 226, 0.72);
		margin: 0;
		line-height: 1.3;
	}

	.chunk-expanded {
		padding: 0.5rem;
		border-radius: 6px;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(120, 160, 220, 0.1);
	}

	.chunk-full-text {
		font-size: 0.75rem;
		color: rgba(214, 226, 248, 0.72);
		line-height: 1.4;
		max-height: 200px;
		overflow-y: auto;
		white-space: pre-wrap;
		word-break: break-word;
		margin-bottom: 0.5rem;
	}

	.chunk-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(120, 160, 220, 0.1);
	}

	.meta-item {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.7rem;
		color: rgba(184, 198, 226, 0.56);
	}

	.gpu-results {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.gpu-subsection {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.subsection-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: rgba(200, 180, 255, 0.8);
		margin: 0;
	}

	.similar-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.similar-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem;
		border-radius: 6px;
		background: rgba(200, 180, 255, 0.08);
		border: 1px solid rgba(200, 180, 255, 0.12);
	}

	.similarity-score {
		width: 48px;
		height: 28px;
		border-radius: 4px;
		background: linear-gradient(135deg, rgba(126, 231, 255, 0.2) 0%, rgba(200, 180, 255, 0.1) 100%);
		border: 1px solid rgba(126, 231, 255, 0.16);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.score-value {
		font-size: 0.75rem;
		font-weight: 700;
		color: #7ee7ff;
	}

	.similar-id {
		font-size: 0.75rem;
		color: rgba(184, 198, 226, 0.64);
		font-family: monospace;
	}

	.cluster-badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		background: rgba(200, 180, 255, 0.08);
		border: 1px solid rgba(200, 180, 255, 0.16);
		color: rgba(200, 180, 255, 0.8);
		font-size: 0.8rem;
		font-weight: 500;
	}

	.cluster-count {
		font-size: 0.75rem;
		color: rgba(184, 198, 226, 0.56);
	}

	.embedding-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		background: rgba(126, 231, 255, 0.08);
		border: 1px solid rgba(126, 231, 255, 0.16);
		color: #7ee7ff;
		font-size: 0.8rem;
		font-weight: 500;
	}

	.results-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(120, 160, 220, 0.08);
	}

	.action-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		background: rgba(126, 231, 255, 0.12);
		border: 1px solid rgba(126, 231, 255, 0.18);
		color: rgba(240, 248, 255, 0.9);
		text-decoration: none;
		font-size: 0.8rem;
		font-weight: 600;
		transition: all 0.15s ease;
		cursor: pointer;
	}

	.action-link:hover {
		background: rgba(126, 231, 255, 0.18);
		border-color: rgba(126, 231, 255, 0.28);
		color: rgba(240, 248, 255, 1);
	}

	.back-btn {
		background: rgba(126, 231, 255, 0.16);
		border-color: rgba(126, 231, 255, 0.24);
	}

	.back-btn:hover {
		background: rgba(126, 231, 255, 0.24);
		border-color: rgba(126, 231, 255, 0.32);
	}
</style>
