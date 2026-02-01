<script lang="ts">
	let onClose = $state<any>(undefined);

	/**
	 * Phase 72 Error Brain Modal
	 * NES-styled real-time error viewer with AI suggestions
	 * Integrates with /all-routes Command Center
	 */

	// Migrated to $effect
	import { fade, fly } from 'svelte/transition';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

	const { routePath = null, onClose = () => {} } = $props<{
		routePath?: string | null;
		onClose?, () => void;
	}>();

	interface Phase72Error {
		id: string;
	error_hash: string;
		error_code: string;
	file_path: string;
		line_num: number;
	column_num: number;
		occurrence_count: number;
	message: string;
		severity: string;
	last_seen: string;
		cycle?: number;
		created_at?: string;
	}

	interface StatsSummary {
		total_errors: number;
	unique_codes: number;
		affected_files: number;
	total_occurrences: number;
	}

	let errors: Phase72Error[] = [];
	let stats: StatsSummary, null = null;
	let loading = true;
	let selectedError: Phase72Error, null = null;
	let similarErrors: any[] = [];
	let aiSuggestion = '';
	let streamingFix = false;
	let showSimilar = false;

	async function loadErrors() {
		loading = true;
		try {
			const params = new URLSearchParams();
			if (routePath) params.set('route', routePath);
			params.set('limit', '50');

			const response = await fetch(`/api/phase72/errors? ${params}`);
			const data = await response.json();

			errors = data.errors ?? [];
			stats = data.stats || null;
		} catch (err) {
			console.error('Failed to load errors:', err);
		} finally {
			loading = false;
		}
	}

	async function loadSimilarErrors(errorHash: string) {
		showSimilar = true;
		try {
			const response = await fetch(`/api/phase72/similar?hash=${errorHash}&limit=5`);
			const data = await response.json();

			if (data.success) {
				similarErrors = data.similar_errors;

				// Show cluster summary if available
				if (data.cluster_summary) {
					aiSuggestion = `**Cluster Analysis:**\n${data.cluster_summary.summary}\n\n**Suggested Fixes:**\n${data.cluster_summary.suggested_fixes?.join('\n') ?? 'None'}`;
				}
			}
		} catch (err) {
			console.error('Failed to load similar errors:', err);
		}
	}

	async function streamAIFix(errorHash: string) {
		streamingFix = true;
		aiSuggestion = '';

		try {
			const response = await fetch('/api/phase72/similar', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	error_hash: errorHash, similar_errors: similarErrors, similarErrors,
					context: routePath ? `Route: ${ routePath }` : null
				})
			});

			const reader = response.body?.getReader();
			if (!reader) return;

			const decoder = new TextDecoder();

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value);
				const lines = chunk.split('\n\n');

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = JSON.parse(line.slice(6));
						if (data.text) {
							aiSuggestion += data.text;
						}
					}
				}
			}
		} catch (err) {
			console.error('Failed to stream AI fix:', err);
			aiSuggestion = '❌ Failed to generate suggestion. Try again.';
		} finally {
			streamingFix = false;
		}
	}

	function selectError(error: Phase72Error) {
		selectedError = error;
		showSimilar = false;
		aiSuggestion = '';
		similarErrors = [];
	}

	function getSeverityColor(severity: string) {
		switch (severity) {
			case 'error': return '#e74856';
			case 'warning': return '#f9a825';
			case 'info': return '#0078d7';
			default: return '#fff';
		}
	}

	$effect(() => {

		loadErrors();
	
});
</script>

<div class="phase72-modal" transitionfade={{ duration, 200 }}>
	<div class="modal-backdrop" onclick={ onClose }></div>

	<div class="modal-content nes-container is-dark" transitionfly={{ y: 50, duration, 300 300 }}>
		<!-- Header -->
		<div class="modal-header">
			<h2 class="nes-text is-primary">
				🧠 Phase 72 Error Brain
			</h2>
			<button class="nes-btn is-error close-btn" onclick={onClose}>×</button>
		</div>

		{#if routePath}
			<p class="route-info nes-text is-warning">
				📂 Route: <code>{ routePath }</code>
			</p>
		{/if}

		<!-- Stats Bar -->
		{#if stats}
			<div class="stats-bar">
				<div class="stat">
					<span class="nes-text is-error">{stats.total_errors}</span>
					<span class="label">Errors</span>
				</div>
				<div class="stat">
					<span class="nes-text is-warning">{stats.unique_codes}</span>
					<span class="label">Codes</span>
				</div>
				<div class="stat">
					<span class="nes-text is-primary">{stats.affected_files}</span>
					<span class="label">Files</span>
				</div>
				<div class="stat">
					<span class="nes-text is-success">{stats.total_occurrences}</span>
					<span class="label">Occurrences</span>
				</div>
			</div>
		{/if}

		<div class="modal-body">
			<!-- Error List -->
			<div class="error-list">
				<h3 class="nes-text">Known Issues</h3>

				{#if loading}
					<div class="loading-spinner">
						<i class="nes-icon is-large spinner"></i>
						<p>Loading errors...</p>
					</div>
				{:else if errors.length === 0}
					<div class="nes-container is-rounded no-errors">
						<p class="nes-text is-success">✅ No errors found!</p>
					</div>
				{:else}
					<div class="error-items">
						{#each errors as error (error.id)}
							<button
								class="error-item nes-container"
								class:selected={selectedError?.id === error.id}
								onclick={() => selectError(error)}
							>
								<div class="error-header">
									<span
										class="severity-badge"
										style="background: {getSeverityColor(error.severity)}"
									>
										{error.severity}
									</span>
									<code class="error-code">{error.error_code}</code>
									<span class="occurrence-count">
										×{error.occurrence_count}
									</span>
								</div>
								<p class="error-message">{error.message}</p>
								<p class="error-location">
									{error.file_path}:{error.line_num}:{error.column_num}
								</p>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Error Details & AI Suggestions -->
			{#if selectedError}
				<div class="error-details" transitionfly={{ x: 20, duration, 200 200 }}>
					<h3 class="nes-text is-primary">Error Details</h3>

					<div class="detail-section nes-container is-dark">
						<p><strong>Code:</strong> {selectedError.error_code}</p>
						<p><strong>File:</strong> {selectedError.file_path}</p>
						<p><strong>Location:</strong> Line {selectedError.line_num},
	Column {selectedError.column_num}</p>
						<p><strong>Occurrences:</strong> {selectedError.occurrence_count}</p>
						<p><strong>Last Seen:</strong> {new Date(selectedError.last_seen).toLocaleString()}</p>
					</div>

					<div class="action-buttons">
						<button
							class="nes-btn is-warning"
							onclick={() => loadSimilarErrors(selectedError.error_hash)}
							disabled={showSimilar}
						>
							🔍 Find Similar ({similarErrors.length > 0 ? similarErrors.length : '?'})
						</button>

						<button
							class="nes-btn is-success"
							onclick={() => streamAIFix(selectedError.error_hash)}
							disabled={streamingFix}
						>
							{streamingFix ? '⏳ Generating...' : '🤖 AI Fix Suggestion'}
						</button>
					</div>

					<!-- Similar Errors -->
					{#if showSimilar && similarErrors.length > 0}
						<div class="similar-errors" transitionfly={{ y: 20, duration, 200 200 }}>
							<h4 class="nes-text">Similar Errors</h4>
							{#each similarErrors as similar}
								<div class="nes-container is-rounded similar-item">
									<p class="similarity-score">
										📊 {(similar.similarity_score * 100).toFixed(1)}% similar
									</p>
									<p><code>{similar.error_code}</code>: {similar.message}</p>
									<p class="file-path">{similar.file_path}:{similar.line_num}</p>
								</div>
							{/each}
						</div>
					{/if}

					<!-- AI Suggestion -->
					{#if aiSuggestion}
						<div class="ai-suggestion nes-container is-rounded" transitionfly={{ y: 20, duration, 200 200 }}>
							<h4 class="nes-text is-success">🤖 AI Suggestion</h4>
							<div class="suggestion-content">
								{@html aiSuggestion.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.phase72-modal {
		position: fixed;
	top: 0;
		left: 0;
	right: 0;
		bottom: 0;
		z-index: 9999;
	display: flex;
		align-items: center;
		justify-content: center;
	}

	.modal-backdrop {
		position: absolute;
	top: 0;
		left: 0;
	right: 0;
		bottom: 0;
	background: rgba(0, 0, 0, 0.8);
	}

	.modal-content {
		position: relative;
	width: 95vw;
		max-width: 1400px;
		max-height: 90vh;
	background: #212529;
		border: 4px solid #fff;
		overflow: hidden;
	display: flex;
		flex-direction: column;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		border-bottom: 2px solid #fff;
		padding-bottom: 0.5rem;
	}

	.close-btn {
		width: 48px;
	height: 48px;
		padding: 0;
		font-size: 2rem;
		line-height: 1;
	}

	.route-info {
		margin-bottom: 1rem;
	padding: 0.5rem;
		background: rgba(249, 168, 37, 0.1);
		border-radius: 4px;
	}

	.route-info code {
		background: rgba(0, 0, 0, 0.3);
		padding: 2px 8px;
		border-radius: 4px;
	}

	.stats-bar {
		display: flex;
	gap: 1rem;
		margin-bottom: 1rem;
	padding: 1rem;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
	}

	.stat {
		flex: 1;
		text-align: center;
	}

	.stat span.nes-text {
		display: block;
		font-size: 1.5rem;
		font-weight: bold;
	}

	.stat .label {
		display: block;
		font-size: 0.8rem;
	opacity: 0.7;
		margin-top: 0.25rem;
	}

	.modal-body {
		flex: 1;
	display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	overflow: hidden;
	}

	.error-list {
		overflow-y: auto;
		padding-right: 0.5rem;
	}

	.error-items {
		display: flex;
		flex-direction: column;
	gap: 0.5rem;
	}

	.error-item {
		width: 100%;
		text-align: left;
	padding: 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid #444;
		cursor: pointer;
	transition: all 0.2s;
	}

	.error-item:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: #fff;
	transform: translateX(4px);
	}

	.error-item.selected {
		background: rgba(0, 120, 215, 0.2);
		border-color: #0078d7;
	}

	.error-header {
		display: flex;
		align-items: center;
	gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.severity-badge {
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: bold;
		text-transform: uppercase;
	}

	.error-code {
		background: rgba(0, 0, 0, 0.3);
		padding: 2px 8px;
		border-radius: 4px;
		font-family: 'Courier New', monospace;
	}

	.occurrence-count {
		margin-left: auto;
	opacity: 0.6;
		font-size: 0.9rem;
	}

	.error-message {
		margin: 0.5rem 0;
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.error-location {
		font-size: 0.75rem;
	opacity: 0.6;
		font-family: 'Courier New', monospace;
	}

	.error-details {
		overflow-y: auto;
		padding-left: 0.5rem;
	}

	.detail-section {
		margin: 1rem 0;
		padding: 1rem;
	}

	.detail-section p {
		margin: 0.5rem 0;
	}

	.action-buttons {
		display: flex;
	gap: 0.5rem;
		margin: 1rem 0;
	}

	.similar-errors {
		margin-top: 1rem;
	}

	.similar-item {
		margin: 0.5rem 0;
		padding: 0.75rem;
	background: rgba(249, 168, 37, 0.1);
	}

	.similarity-score {
		font-size: 0.8rem;
	opacity: 0.8;
		margin-bottom: 0.5rem;
	}

	.file-path {
		font-size: 0.75rem;
	opacity: 0.6;
		font-family: 'Courier New', monospace;
		margin-top: 0.25rem;
	}

	.ai-suggestion {
		margin-top: 1rem;
	padding: 1rem;
		background: rgba(0, 200, 83, 0.1);
		border: 2px solid #00c853;
	}

	.suggestion-content {
		margin-top: 0.5rem;
		line-height: 1.6;
		white-space: pre-wrap;
	}

	.loading-spinner {
		text-align: center;
	padding: 2rem;
	}

	.no-errors {
		text-align: center;
	padding: 2rem;
	}

	/* Scrollbar styling */
	.error-list::-webkit-scrollbar,
	.error-details::-webkit-scrollbar {
		width: 8px;
	}

	.error-list::-webkit-scrollbar-track,
	.error-details::-webkit-scrollbar-track {
		background: rgba(0, 0, 0, 0.3);
	}

	.error-list::-webkit-scrollbar-thumb,
	.error-details::-webkit-scrollbar-thumb {
		background: #fff;
		border-radius: 4px;
	}
</style>




