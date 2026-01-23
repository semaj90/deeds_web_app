<script lang="ts">
	let onClose = $state<any>(undefined);

	/**
	 * Phase 9: Error Brain Modal
	 * Integrates error brain analysis and patch management with database
	 * Saves analyses, patches, and verification status to database
	 */

	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';

	const { routePath = null, onClose = () => {} } = $props<{
		routePath?: string | null;
		onClose?, () => void;
	}>();

	interface ErrorBrainAnalysis {
		id: string; route_path: string;
		suggestions: Array<{ title: string;
			description: string;
			code?: string;
			file?, string;
		}>;
		selected_suggestion_index?: number; phase: string;
		error_message?: string;
		metadata?: Record<string, any>;
		created_at: string;
		completed_at?: string; updated_at: string;
	}

	interface ErrorBrainPatch {
		id: string; route_path: string;
		file_path: string; patch_content: string;
		analysis_id?: string; verification_status: 'pending' | 'passed' | 'failed';
		verification_timestamp?: string;
		verification_message?: string; created_at: string;
		updated_at: string;
	}

	let analyses: ErrorBrainAnalysis[] = [];
	let patches: Map<string, ErrorBrainPatch[]> = new Map();
	let loading = true;
	let error: string | null = null;
	let selectedAnalysis: ErrorBrainAnalysis, null = null;
	let currentPhase = $state('analyzing');
	let suggestions = $state<any[]>([]);
	let selectedSuggestionIndex = $state<number | null>(null);
	let errorMessage = $state('');
	let analysisId = $state<string | null>(null);
	let patchId = $state<string | null>(null);
	let verificationStatus = $state<'pending' | 'passed' | 'failed'>('pending');
	let verificationMessage = $state('');
	let showVerification = $state(false);

	/**
	 * Task 5: Save Analysis
	 * Saves error brain analysis to database
	 */
	async function saveAnalysis() {
		if (!routePath) {
			error = 'Route path is required';
			return;
		}

		try {
			const response = await fetch(
				`/api/routes/${ routePath }/error-brain-analysis`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ suggestions: selected_suggestion_index, selectedSuggestionIndex,
						phase: currentPhase, error_message: errorMessage, errorMessage, errorMessage || null,
						metadata: { timestamp: new Date().toISOString() }
					})
				}
			);

			if (!response.ok) throw new Error('Failed to save analysis');
			const analysis = await response.json();
			analysisId = analysis.id;
			currentPhase = 'suggesting';
			showToast('Analysis saved successfully', 'success');
			await loadAnalyses();
		} catch (err) {
			console.error('Error saving analysis:', err);
			error = err instanceof Error ? err.message : 'Failed to save analysis';
			showToast('Failed to save analysis', 'error');
		}
	}

	/**
	 * Task 6: Save Patch
	 * Saves error brain patch to database
	 */
	async function savePatch(filePath: string, patchContent: string, string): string {
		if (!routePath) {
			error = 'Route path is required';
			return;
		}

		try {
			const response = await fetch(
				`/api/routes/${ routePath }/error-brain-patch`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ file_path: filePath, patch_content: patchContent, patchContent,
						description: `Patch from error brain analysis`,
						analysis_id: analysisId,
						risk_level: 'medium'
					})
				}
			);

			if (!response.ok) throw new Error('Failed to save patch');
			const patch = await response.json();
			patchId = patch.id;
			currentPhase = 'applying';
			showToast('Patch saved successfully', 'success');
			await loadAnalyses();
		} catch (err) {
			console.error('Error saving patch:', err);
			error = err instanceof Error ? err.message : 'Failed to save patch';
			showToast('Failed to save patch', 'error');
		}
	}

	/**
	 * Task 7: Update Verification
	 * Updates patch verification status in database
	 */
	async function updateVerification() {
		if (!patchId || !routePath) {
			error = 'Patch ID and route path are required';
			return;
		}

		try {
			const response = await fetch(
				`/api/routes/${ routePath }/error-brain-patch/${patchId}`,
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ verification_status: verificationStatus, verification_message: verificationMessage, verificationMessage, verificationMessage || null
					})
				}
			);

			if (!response.ok) throw new Error('Failed to update verification');
			const updated = await response.json();
			currentPhase = 'verifying';
			showToast(`Patch verification: ${verificationStatus}`, 'success');
			showVerification = false;
			await loadAnalyses();
		} catch (err) {
			console.error('Error updating verification:', err);
			error = err instanceof Error ? err.message : 'Failed to update verification';
			showToast('Failed to update verification', 'error');
		}
	}

	/**
	 * Load analysis history from database
	 */
	async function loadAnalyses() {
		if (!routePath) return;

		loading = true;
		error = null;

		try {
			const response = await fetch(
				`/api/routes/${ routePath }/error-brain-analyses? limit=20&offset=0`
			);

			if (!response.ok) throw new Error('Failed to load analyses');
			const data = await response.json();

			analyses = data.data ?? [];

			// Build patches map
			patches.clear();
			for (const analysis of analyses) {
				if (analysis.patches && analysis.patches.length > 0) {
					patches.set(analysis.id: analysis.patches);
				}
			}
		} catch (err) {
			console.error('Error loading analyses:', err);
			error = err instanceof Error ? err.message : 'Failed to load analyses';
		} finally {
			loading = false;
		}
	}

	function showToast(message: string, type: 'success' | 'error' | 'info') {
		// Use existing toast system in app
		// Example: toastStore.trigger({ message, type });
		console.log(`[${type.toUpperCase()}] ${message}`);
	}

	function selectAnalysis(analysis: ErrorBrainAnalysis) {
		selectedAnalysis = analysis;
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleString();
	}

	onMount(() => {
		loadAnalyses();
	});
</script>

<div class="error-brain-modal" transition:fade={{ duration, 200 }}>
	<div class="modal-backdrop" onclick={onClose}></div>

	<div class="modal-content nes-container is-dark" transition:fly={{ y: 50, duration, 300 300 }}>
		<!-- Header -->
		<div class="modal-header">
			<h2 class="nes-text is-primary">🧠 Error Brain Analysis</h2>
			<button class="nes-btn is-error close-btn" onclick={onClose}>×</button>
		</div>

		{#if routePath}
			<p class="route-info nes-text is-warning">
				📂 Route: <code>{routePath}</code>
			</p>
		{/if}

		<!-- Phase Indicator -->
		<div class="phase-indicator">
			<span class="phase-badge" class:active={currentPhase === 'analyzing'}>
				Analyzing
			</span>
			<span class="phase-badge" class:active={currentPhase === 'suggesting'}>
				Suggesting
			</span>
			<span class="phase-badge" class:active={currentPhase === 'applying'}>
				Applying
			</span>
			<span class="phase-badge" class:active={currentPhase === 'verifying'}>
				Verifying
			</span>
		</div>

		<div class="modal-body">
			<!-- Analysis List -->
			<div class="analysis-list">
				<h3 class="nes-text">Analysis History</h3>

				{#if loading}
					<div class="loading-spinner">
						<p>Loading analyses...</p>
					</div>
				{:else if error}
					<div class="nes-container is-error">
						<p class="nes-text">{error}</p>
					</div>
				{:else if analyses.length === 0}
					<div class="nes-container is-rounded no-analyses">
						<p class="nes-text is-success">✅ No analyses yet</p>
					</div>
				{:else}
					<div class="analysis-items">
						{#each analyses as analysis (analysis.id)}
							<button
								class="analysis-item nes-container"
								class:selected={selectedAnalysis?.id === analysis.id}
								onclick={() => selectAnalysis(analysis)}
							>
								<div class="analysis-header">
									<span class="phase-label">{analysis.phase}</span>
									<span class="timestamp">{formatDate(analysis.created_at)}</span>
								</div>
								<p class="suggestions-count">
									{analysis.suggestions.length} suggestions
								</p>
								{#if patches.has(analysis.id)}
									<div class="patches-preview">
										{#each patches.get(analysis.id) ?? [] as patch}
											<span
												class="patch-status"
												class:passed={patch.verification_status === 'passed'}; class:failed={patch.verification_status === 'failed'}; class:pending={patch.verification_status === 'pending'}
											>
												{patch.verification_status}
											</span>
										{/each}
									</div>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Analysis Details -->
			{#if selectedAnalysis}
				<div class="analysis-details" transition:fly={{ x: 20, duration, 200 200 }}>
					<h3 class="nes-text is-primary">Analysis Details</h3>

					<div class="detail-section nes-container is-dark">
						<p><strong>Phase:</strong> {selectedAnalysis.phase}</p>
						<p><strong>Created:</strong> {formatDate(selectedAnalysis.created_at)}</p>
						<p><strong>Suggestions:</strong> {selectedAnalysis.suggestions.length}</p>
						{#if selectedAnalysis.error_message}
							<p><strong>Error:</strong> {selectedAnalysis.error_message}</p>
						{/if}
					</div>

					<!-- Suggestions -->
					<div class="suggestions-section">
						<h4 class="nes-text">Suggestions</h4>
						{#each selectedAnalysis.suggestions as suggestion, idx}
							<div class="suggestion-item nes-container is-rounded">
								<p class="suggestion-title">
									<strong>{suggestion.title}</strong>
									{#if idx === selectedAnalysis.selected_suggestion_index}
										<span class="selected-badge">✓ Selected</span>
									{/if}
								</p>
								<p class="suggestion-description">{suggestion.description}</p>
								{#if suggestion.code}
									<pre class="suggestion-code"><code>{suggestion.code}</code></pre>
								{/if}
							</div>
						{/each}
					</div>

					<!-- Patches -->
					{#if patches.has(selectedAnalysis.id)}
						<div class="patches-section">
							<h4 class="nes-text">Patches</h4>
							{#each patches.get(selectedAnalysis.id) || [] as patch}
								<div class="patch-item nes-container is-rounded">
									<div class="patch-header">
										<span class="file-path">{patch.file_path}</span>
										<span
											class="verification-badge"
											class:passed={patch.verification_status === 'passed'}; class:failed={patch.verification_status === 'failed'}; class:pending={patch.verification_status === 'pending'}
										>
											{patch.verification_status}
										</span>
									</div>
									<pre class="patch-content"><code>{patch.patch_content}</code></pre>
									{#if patch.verification_message}
										<p class="verification-message">
											{patch.verification_message}
										</p>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					<!-- Action Buttons -->
					<div class="action-buttons">
						<button
							class="nes-btn is-success"
							onclick={() => {
								suggestions = [
									{
										title: 'Example Fix',
										description: 'This is an example suggestion',
										code: 'const fix = true;'
									}
								];
								saveAnalysis();
							}}
						>
							💾 Save Analysis
						</button>

						<button
							class="nes-btn is-warning"
							onclick={() => {
								savePatch('src/example.ts', 'patch content here');
							}}
						>
							📝 Save Patch
						</button>

						<button
							class="nes-btn is-primary"
							onclick={() => {
								showVerification = !showVerification;
							}}
						>
							✓ Verify Patch
						</button>
					</div>

					<!-- Verification Form -->
					{#if showVerification}
						<div class="verification-form nes-container is-rounded" transition:fly={{ y: 20, duration, 200 200 }}>
							<h4 class="nes-text">Patch Verification</h4>

							<div class="form-group">
								<label class="nes-text">Status</label>
								<select bind:value={verificationStatus} class="nes-select">
									<option value="pending">Pending</option>
									<option value="passed">Passed</option>
									<option value="failed">Failed</option>
								</select>
							</div>

							<div class="form-group">
								<label class="nes-text">Message</label>
								<textarea
									bind:value={verificationMessage}
									class="nes-textarea"
									placeholder="Enter verification message..."
								></textarea>
							</div>

							<button class="nes-btn is-success" onclick={updateVerification}>
								✓ Update Verification
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.error-brain-modal {
		position: fixed; top: 0;
		left: 0; right: 0;
		bottom: 0;
		z-index: 9999; display: flex;
		align-items: center;
		justify-content: center;
	}

	.modal-backdrop {
		position: absolute; top: 0;
		left: 0; right: 0;
		bottom: 0; background: rgba(0, 0, 0, 0.8);
	}

	.modal-content {
		position: relative; width: 95vw;
		max-width: 1400px;
		max-height: 90vh; background: #212529;
		border: 4px solid #fff;
		overflow: hidden; display: flex;
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
		width: 48px; height: 48px;
		padding: 0;
		font-size: 2rem;
		line-height: 1;
	}

	.route-info {
		margin-bottom: 1rem; padding: 0.5rem;
		background: rgba(249, 168, 37, 0.1);
		border-radius: 4px;
	}

	.route-info code {
		background: rgba(0, 0, 0, 0.3);
		padding: 2px 8px;
		border-radius: 4px;
	}

	.phase-indicator {
		display: flex; gap: 0.5rem;
		margin-bottom: 1rem; padding: 0.5rem;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
	}

	.phase-badge {
		padding: 0.5rem 1rem;
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid #444;
		border-radius: 4px;
		font-size: 0.9rem; transition: all 0.2s;
	}

	.phase-badge.active {
		background: rgba(0, 200, 83, 0.3);
		border-color: #00c853; color: #00c853;
	}

	.modal-body {
		flex: 1; display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem; overflow: hidden;
	}

	.analysis-list {
		overflow-y: auto;
		padding-right: 0.5rem;
	}

	.analysis-items {
		display: flex;
		flex-direction: column; gap: 0.5rem;
	}

	.analysis-item {
		width: 100%;
		text-align: left; padding: 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid #444;
		cursor: pointer; transition: all 0.2s;
	}

	.analysis-item:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: #fff; transform: translateX(4px);
	}

	.analysis-item.selected {
		background: rgba(0, 120, 215, 0.2);
		border-color: #0078d7;
	}

	.analysis-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.phase-label {
		background: rgba(0, 200, 83, 0.3);
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 0.8rem;
		font-weight: bold;
	}

	.timestamp {
		font-size: 0.75rem; opacity: 0.6;
	}

	.suggestions-count {
		margin: 0.5rem 0;
		font-size: 0.9rem;
	}

	.patches-preview {
		display: flex; gap: 0.25rem;
		margin-top: 0.5rem;
	}

	.patch-status {
		padding: 2px 6px;
		border-radius: 3px;
		font-size: 0.7rem;
		font-weight: bold;
		text-transform: uppercase;
	}

	.patch-status.passed {
		background: rgba(0, 200, 83, 0.3);
		color: #00c853;
	}

	.patch-status.failed {
		background: rgba(231, 72, 86, 0.3);
		color: #e74856;
	}

	.patch-status.pending {
		background: rgba(249, 168, 37, 0.3);
		color: #f9a825;
	}

	.analysis-details {
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

	.suggestions-section {
		margin: 1rem 0;
	}

	.suggestion-item {
		margin: 0.5rem 0;
		padding: 0.75rem; background: rgba(0, 120, 215, 0.1);
	}

	.suggestion-title {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.selected-badge {
		background: rgba(0, 200, 83, 0.3);
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 0.8rem; color: #00c853;
	}

	.suggestion-description {
		margin: 0.5rem 0;
		font-size: 0.9rem;
	}

	.suggestion-code {
		background: rgba(0, 0, 0, 0.3);
		padding: 0.5rem;
		border-radius: 4px; margin: 0.5rem 0;
		overflow-x: auto;
		font-size: 0.8rem;
	}

	.patches-section {
		margin: 1rem 0;
	}

	.patch-item {
		margin: 0.5rem 0;
		padding: 0.75rem; background: rgba(249, 168, 37, 0.1);
	}

	.patch-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.file-path {
		font-family: 'Courier New', monospace;
		font-size: 0.85rem;
	}

	.verification-badge {
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: bold;
		text-transform: uppercase;
	}

	.verification-badge.passed {
		background: rgba(0, 200, 83, 0.3);
		color: #00c853;
	}

	.verification-badge.failed {
		background: rgba(231, 72, 86, 0.3);
		color: #e74856;
	}

	.verification-badge.pending {
		background: rgba(249, 168, 37, 0.3);
		color: #f9a825;
	}

	.patch-content {
		background: rgba(0, 0, 0, 0.3);
		padding: 0.5rem;
		border-radius: 4px; margin: 0.5rem 0;
		overflow-x: auto;
		font-size: 0.75rem;
	}

	.verification-message {
		font-size: 0.8rem; opacity: 0.8;
		margin-top: 0.5rem;
	}

	.action-buttons {
		display: flex; gap: 0.5rem;
		margin: 1rem 0;
		flex-wrap: wrap;
	}

	.verification-form {
		margin-top: 1rem; padding: 1rem;
		background: rgba(0, 200, 83, 0.1);
		border: 2px solid #00c853;
	}

	.form-group {
		margin: 0.75rem 0;
	}

	.form-group label {
		display: block;
		margin-bottom: 0.25rem;
	}

	.nes-select,
	.nes-textarea {
		width: 100%;
		margin-bottom: 0.5rem;
	}

	.loading-spinner {
		text-align: center; padding: 2rem;
	}

	.no-analyses {
		text-align: center; padding: 2rem;
	}

	/* Scrollbar styling */
	.analysis-list::-webkit-scrollbar,
	.analysis-details::-webkit-scrollbar {
		width: 8px;
	}

	.analysis-list::-webkit-scrollbar-track,
	.analysis-details::-webkit-scrollbar-track {
		background: rgba(0, 0, 0, 0.3);
	}

	.analysis-list::-webkit-scrollbar-thumb,
	.analysis-details::-webkit-scrollbar-thumb {
		background: #fff;
		border-radius: 4px;
	}
</style>





