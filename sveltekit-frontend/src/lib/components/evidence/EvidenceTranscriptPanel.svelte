<!-- EvidenceTranscriptPanel.svelte — YouTube-Style Interactive Video Transcript Panel -->
<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface TranscriptSegment {
		id: string;
		startMs: number;
		endMs: number;
		text: string;
		words?: Array<{ startMs: number; endMs: number; text: string }>;
		modelText?: string | null;
		speakerId?: string | null;
		confidence?: number;
		model?: string | null;
		sourceRevision?: string;
		analysisRevision?: string | null;
		reviewStatus?: 'approved' | 'unreviewed_proposal' | 'rejected';
	}

	interface TranscriptJobProgress {
		step: string;
		progress: number;
		message: string;
		createdAt: string;
		updatedAt: string;
	}

	interface Props {
		evidenceId: string;
		caseId?: string;
		videoTitle?: string;
		currentTimeMs?: number;
		initialOpen?: boolean;
		onSeek?: (timestampMs: number) => void;
		onSegmentReviewed?: (segmentId: string, status: 'approved' | 'rejected') => void;
	}

	let {
		evidenceId,
		caseId,
		videoTitle = 'Evidence Video',
		currentTimeMs = 0,
		initialOpen = false,
		onSeek,
		onSegmentReviewed
	}: Props = $props();

	// Component State
	let isOpen = $state(false);
	let segments = $state<TranscriptSegment[]>([]);
	let sourceRevision = $state<string | null>(null);
	let analysisRevision = $state<string | null>(null);
	let jobProgress = $state<TranscriptJobProgress | null>(null);
	let elapsedNow = $state(Date.now());
	let isLoading = $state(false);
	let status = $state<'completed' | 'no_audio' | 'processing' | 'failed' | 'empty' | 'unavailable' | 'idle'>('idle');
	let reviewEnabled = $state(false);
	let editingSegmentId = $state<string | null>(null);
	let correctionDraft = $state('');
	let isSavingCorrection = $state(false);
	let reviewError = $state<string | null>(null);
	let searchQuery = $state('');
	let selectedSpeaker = $state<string>('all');
	let autoScrollEnabled = $state(true);
	let isUserScrolling = $state(false);
	let userScrollTimer: ReturnType<typeof setTimeout> | null = null;
	let scrollContainer = $state<HTMLDivElement | null>(null);
	let activeCueElement = $state<HTMLDivElement | null>(null);
	let transcriptPollTimer: ReturnType<typeof setTimeout> | null = null;
	let transcriptPollCount = 0;
	let elapsedTimer: ReturnType<typeof setInterval> | null = null;
	const transcriptPollLimit = 50;

	function stopTranscriptPolling() {
		if (transcriptPollTimer) clearTimeout(transcriptPollTimer);
		transcriptPollTimer = null;
		transcriptPollCount = 0;
	}

	function syncElapsedTimer() {
		if (status === 'processing' && !elapsedTimer) {
			elapsedTimer = setInterval(() => (elapsedNow = Date.now()), 1000);
		} else if (status !== 'processing' && elapsedTimer) {
			clearInterval(elapsedTimer);
			elapsedTimer = null;
		}
	}

	const elapsedSeconds = $derived.by(() => {
		const started = jobProgress?.createdAt ? Date.parse(jobProgress.createdAt) : Number.NaN;
		return Number.isFinite(started) ? Math.max(0, Math.floor((elapsedNow - started) / 1000)) : null;
	});

	function formatElapsed(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const remainder = seconds % 60;
		return minutes > 0 ? `${minutes}m ${String(remainder).padStart(2, '0')}s` : `${remainder}s`;
	}

	function scheduleTranscriptPoll() {
		if (!isOpen || status !== 'processing' || transcriptPollTimer || transcriptPollCount >= transcriptPollLimit) return;
		const delayMs = transcriptPollCount < 3 ? 2000 : transcriptPollCount < 8 ? 5000 : 15000;
		transcriptPollTimer = setTimeout(() => {
			transcriptPollTimer = null;
			transcriptPollCount += 1;
			void loadTranscript();
		}, delayMs);
	}

	// Fetch transcript segments from API
	async function loadTranscript() {
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(evidenceId)) {
			stopTranscriptPolling();
			status = 'unavailable';
			segments = [];
			return;
		}
		isLoading = true;
		try {
			const res = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/transcript`);
			if (!res.ok) {
				if (res.status === 404) status = 'empty';
				else status = 'failed';
				return;
			}
			const data = await res.json();
			if (data.ok) {
				segments = data.segments || [];
				jobProgress = data.jobProgress && typeof data.jobProgress === 'object' ? data.jobProgress : null;
				sourceRevision = typeof data.sourceRevision === 'string' ? data.sourceRevision : null;
				analysisRevision = typeof data.analysisRevision === 'string' ? data.analysisRevision : null;
				reviewEnabled = data.reviewEnabled === true;
				status = data.status || (segments.length > 0 ? 'completed' : 'empty');
			} else {
				status = 'failed';
			}
		} catch {
			status = 'failed';
		} finally {
			isLoading = false;
			if (status === 'processing') scheduleTranscriptPoll();
			else stopTranscriptPolling();
			syncElapsedTimer();
		}
	}

	onMount(() => {
		if (initialOpen) {
			isOpen = true;
			void loadTranscript();
		} else if (isOpen) {
			void loadTranscript();
		}
	});

	function toggleOpen() {
		isOpen = !isOpen;
		if (!isOpen) stopTranscriptPolling();
		if (isOpen && segments.length === 0 && (status === 'idle' || status === 'processing')) {
			transcriptPollCount = 0;
			void loadTranscript();
		}
	}

	onDestroy(() => {
		stopTranscriptPolling();
		if (elapsedTimer) clearInterval(elapsedTimer);
	});

	// Distinct speakers for filtering
	const availableSpeakers = $derived(
		Array.from(
			new Set(
				segments
					.map((s) => s.speakerId)
					.filter((sp): sp is string => typeof sp === 'string' && sp.trim().length > 0)
			)
		)
	);

	// Filtered segments matching search & speaker
	const filteredSegments = $derived(
		segments.filter((s) => {
			if (selectedSpeaker !== 'all' && s.speakerId !== selectedSpeaker) return false;
			if (searchQuery.trim().length > 0 && !s.text.toLowerCase().includes(searchQuery.toLowerCase())) {
				return false;
			}
			return true;
		})
	);

	// Currently active segment based on video playback currentTimeMs
	const activeSegmentId = $derived.by(() => {
		if (typeof currentTimeMs !== 'number' || currentTimeMs < 0) return null;
		const match = segments.find((s) => currentTimeMs >= s.startMs && currentTimeMs < s.endMs);
		return match ? match.id : null;
	});

	// Auto-scroll to active cue without disrupting manual scrolling
	$effect(() => {
		if (!autoScrollEnabled || isUserScrolling || !activeSegmentId || !scrollContainer) return;
		void tick().then(() => {
			const el = scrollContainer?.querySelector(`[data-segment-id="${activeSegmentId}"]`) as HTMLElement;
			if (el && typeof el.scrollIntoView === 'function') {
				el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}
		});
	});

	function handleScroll() {
		isUserScrolling = true;
		if (userScrollTimer) clearTimeout(userScrollTimer);
		userScrollTimer = setTimeout(() => {
			isUserScrolling = false;
		}, 2500);
	}

	function handleCueClick(startMs: number) {
		onSeek?.(startMs);
	}

	function formatTime(ms: number): string {
		const totalSecs = Math.max(0, Math.floor(ms / 1000));
		const m = Math.floor(totalSecs / 60);
		const s = totalSecs % 60;
		return `${m}:${String(s).padStart(2, '0')}`;
	}

	async function reviewSegment(segmentId: string, newStatus: 'approved' | 'rejected') {
		reviewError = null;
		try {
			const res = await fetch(`/api/evidence/${evidenceId}/transcript`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ segmentId, reviewStatus: newStatus })
			});
			if (res.ok) {
				segments = segments.map((s) => (s.id === segmentId ? { ...s, reviewStatus: newStatus } : s));
				onSegmentReviewed?.(segmentId, newStatus);
			} else {
				reviewError = 'Could not save this review. Reload the transcript and try again.';
			}
		} catch (err) {
			console.error('Failed to review segment:', err);
			reviewError = 'Could not save this review. Check the connection and try again.';
		}
	}

	function beginCorrection(cue: TranscriptSegment) {
		reviewError = null;
		editingSegmentId = cue.id;
		correctionDraft = cue.text;
	}

	async function saveCorrection(cue: TranscriptSegment) {
		const correctedText = correctionDraft.trim();
		if (!correctedText || correctedText.length > 10_000) {
			reviewError = 'Enter a correction between 1 and 10,000 characters.';
			return;
		}
		isSavingCorrection = true;
		reviewError = null;
		try {
			const res = await fetch(`/api/evidence/${evidenceId}/transcript`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ segmentId: cue.id, reviewStatus: 'approved', correctedText }),
			});
			if (!res.ok) throw new Error('Transcript correction was rejected');
			segments = segments.map((segment) => segment.id === cue.id
				? { ...segment, modelText: segment.modelText ?? segment.text, text: correctedText, reviewStatus: 'approved' }
				: segment);
			editingSegmentId = null;
			onSegmentReviewed?.(cue.id, 'approved');
		} catch (err) {
			console.error('Failed to correct transcript segment:', err);
			reviewError = 'Could not save this correction. Check the connection and try again.';
		} finally {
			isSavingCorrection = false;
		}
	}

	function handleExport(format: 'vtt' | 'srt' | 'txt' | 'json') {
		if (status === 'unavailable') return;
		window.open(`/api/evidence/${encodeURIComponent(evidenceId)}/transcript?export=${format}`, '_blank');
	}
</script>

<div class="evidence-transcript-wrapper" role="region" aria-label="Evidence Video Transcript">
	<!-- Top Bar Toggle Header -->
	<div class="transcript-header-bar">
		<button
			type="button"
			class="btn-transcript-toggle"
			onclick={toggleOpen}
			aria-expanded={isOpen}
			aria-controls="transcript-panel-body"
		>
			<span class="toggle-icon">{isOpen ? '▼' : '▶'}</span>
			<span class="toggle-title">Transcript ({segments.length})</span>
			{#if status === 'no_audio'}
				<span class="badge-status status-no-audio">Silent Video · No Audio</span>
			{:else if status === 'unavailable'}
				<span class="badge-status">Preview only</span>
			{:else if status === 'processing'}
				<span class="badge-status status-processing">Transcribing…</span>
			{:else if status === 'failed'}
				<span class="badge-status status-failed">Transcription Failed</span>
			{:else if segments.length > 0}
				<span class="badge-status status-ready">Synchronized</span>
			{/if}
		</button>
		{#if isOpen && sourceRevision}
			<p class="transcript-provenance" data-testid="transcript-provenance">
				Source {sourceRevision}{analysisRevision ? ` · Analysis ${analysisRevision}` : ''}
			</p>
		{/if}

		{#if isOpen && segments.length > 0}
			<div class="header-export-actions">
				<label class="autoscroll-toggle">
					<input type="checkbox" bind:checked={autoScrollEnabled} />
					<span>Auto-scroll</span>
				</label>
				{#if status !== 'unavailable'}
				<div class="export-dropdown-group">
					<span class="export-label">Export:</span>
					<button type="button" class="btn-export-pill" onclick={() => handleExport('vtt')}>VTT</button>
					<button type="button" class="btn-export-pill" onclick={() => handleExport('srt')}>SRT</button>
					<button type="button" class="btn-export-pill" onclick={() => handleExport('txt')}>TXT</button>
					<button type="button" class="btn-export-pill" onclick={() => handleExport('json')}>JSON</button>
				</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Expandable Transcript Content Body -->
	{#if isOpen}
		<div id="transcript-panel-body" class="transcript-panel-body">
			{#if status === 'unavailable'}
				<div class="empty-transcript-state">
					<span class="state-icon">ℹ️</span>
					<p class="state-msg">Transcript is available after this exhibit is saved to the case. This local preview has no persisted evidence ID.</p>
				</div>
			{:else if status === 'no_audio'}
				<div class="empty-transcript-state">
					<span class="state-icon">🔇</span>
					<p class="state-msg">No audio stream detected. This file is a silent video recording.</p>
				</div>
			{:else if status === 'processing'}
				<div class="empty-transcript-state">
					<span class="state-icon spin">⏳</span>
					<p class="state-msg">{jobProgress?.message || 'Video analysis is in progress.'}</p>
					{#if jobProgress}
						<div class="transcript-progress" role="group" aria-label="Video analysis progress">
							<div class="transcript-progress-label"><span>{jobProgress.step.replaceAll('-', ' ')}</span><span>{Math.max(0, Math.min(100, Math.round(jobProgress.progress)))}%</span></div>
							<progress max="100" value={Math.max(0, Math.min(100, jobProgress.progress))} aria-label="Video analysis progress"></progress>
							<p>{#if elapsedSeconds !== null}Elapsed {formatElapsed(elapsedSeconds)} · ETA unavailable during this stage{:else}Elapsed time unavailable · ETA unavailable{/if}</p>
						</div>
					{:else}
						<p class="state-msg">Refreshing analysis status automatically.</p>
					{/if}
				</div>
			{:else if status === 'failed'}
				<div class="empty-transcript-state error">
					<span class="state-icon">⚠️</span>
					<p class="state-msg">Transcription failed. The original evidence video is safely retained.</p>
					<button type="button" class="btn-retry" onclick={loadTranscript}>Retry Transcript Load</button>
				</div>
			{:else if isLoading}
				<div class="empty-transcript-state">
					<p class="state-msg">Loading transcript cues…</p>
				</div>
			{:else if segments.length === 0}
				<div class="empty-transcript-state">
					<span class="state-icon">📝</span>
					<p class="state-msg">No transcript segments available for this video yet.</p>
				</div>
			{:else}
				<!-- Search and Filter Toolbar -->
				<div class="transcript-filter-bar">
					<div class="search-box">
						<span class="search-icon">🔍</span>
						<input
							type="search"
							placeholder="Search transcript text…"
							bind:value={searchQuery}
							aria-label="Search transcript"
						/>
						{#if searchQuery}
							<button type="button" class="btn-clear-search" onclick={() => (searchQuery = '')}>✕</button>
						{/if}
					</div>

					{#if availableSpeakers.length > 0}
						<div class="speaker-filter-box">
							<label for="speaker-select" class="filter-lbl">Speaker:</label>
							<select id="speaker-select" bind:value={selectedSpeaker}>
								<option value="all">All Speakers ({segments.length})</option>
								{#each availableSpeakers as spk}
									<option value={spk}>{spk}</option>
								{/each}
							</select>
						</div>
					{/if}
				</div>
				{#if reviewError}
					<p class="review-error" role="alert">{reviewError}</p>
				{/if}

				<!-- Scrollable Transcript Cues -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex: keyboard scrolling is intentional for the cue list -->
				<div
					bind:this={scrollContainer}
					onscroll={handleScroll}
					class="transcript-cue-list"
					tabindex="0"
					role="region"
					aria-label="Transcript Cues"
				>
					{#if filteredSegments.length === 0}
						<div class="no-matches-msg">No transcript cues match "{searchQuery}"</div>
					{:else}
						{#each filteredSegments as cue (cue.id)}
							{@const isActive = cue.id === activeSegmentId}
							<div
								data-segment-id={cue.id}
								class="transcript-cue-card"
								class:active={isActive}
								class:unreviewed={cue.reviewStatus === 'unreviewed_proposal'}
								role="article"
								aria-current={isActive ? 'true' : undefined}
							>
								<!-- Cue Header / Timestamp Button -->
								<div class="cue-left-col">
									<button
										type="button"
										class="cue-timestamp-btn"
										class:active={isActive}
										onclick={() => handleCueClick(cue.startMs)}
										title={`Seek video to ${formatTime(cue.startMs)}`}
										aria-label={`Seek to ${formatTime(cue.startMs)}`}
									>
										{formatTime(cue.startMs)}
									</button>
								</div>

								<!-- Cue Content -->
								<div class="cue-body-col">
									<div class="cue-meta-line">
										{#if cue.speakerId}
											<span class="speaker-badge">{cue.speakerId}</span>
										{/if}
										{#if cue.reviewStatus === 'unreviewed_proposal'}
											<span class="unreviewed-pill" title="Model generated transcript cue — awaiting verification">
												Unreviewed
											</span>
										{:else if cue.reviewStatus === 'approved'}
											<span class="approved-pill">✓ Verified</span>
										{/if}
										{#if cue.confidence}
											<span class="confidence-tag">{Math.round(cue.confidence * 100)}%</span>
										{/if}
									</div>
									{#if editingSegmentId === cue.id}
										<textarea aria-label={`Correct transcript at ${formatTime(cue.startMs)}`} bind:value={correctionDraft} maxlength="10000"></textarea>
										{#if cue.modelText}
											<small class="model-transcript-text">Original model text: {cue.modelText}</small>
										{/if}
										<div class="cue-actions-col">
											<button type="button" class="btn-verify-cue" disabled={isSavingCorrection} onclick={() => saveCorrection(cue)}>{isSavingCorrection ? 'Saving…' : 'Save correction'}</button>
											<button type="button" class="btn-cancel-correction" disabled={isSavingCorrection} onclick={() => (editingSegmentId = null)}>Cancel</button>
										</div>
									{:else}
										<button
											type="button"
											class="cue-text-btn"
											onclick={() => handleCueClick(cue.startMs)}
											title={`Seek to ${formatTime(cue.startMs)}`}
										>
											{cue.text}
										</button>
						{#if cue.words?.length}
							<div class="word-timing-row" aria-label="Word-level transcript timings">
								{#each cue.words as word, wordIndex (`${word.startMs}-${wordIndex}`)}
									<button type="button" class="word-timing-btn" onclick={() => handleCueClick(word.startMs)} title={`Seek to ${formatTime(word.startMs)}–${formatTime(word.endMs)}`} aria-label={`Seek to ${formatTime(word.startMs)}: ${word.text}`}>
										<time>{formatTime(word.startMs)}</time> {word.text}
									</button>
								{/each}
							</div>
						{/if}
										{#if cue.modelText}
											<small class="model-transcript-text">Corrected from: {cue.modelText}</small>
										{/if}
									{/if}
								</div>

								<!-- Verification Action -->
								{#if reviewEnabled && editingSegmentId !== cue.id}
									<div class="cue-actions-col">
										<button type="button" class="btn-correct-cue" title="Correct transcript cue" onclick={() => beginCorrection(cue)}>Edit</button>
										{#if cue.reviewStatus === 'unreviewed_proposal'}
										<button
											type="button"
											class="btn-verify-cue"
											title="Verify transcript cue"
											onclick={() => reviewSegment(cue.id, 'approved')}
										>
											Approve
										</button>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.evidence-transcript-wrapper {
		width: 100%;
		border: 1px solid var(--t-border);
		border-radius: 6px;
		background: var(--t-panel);
		overflow: hidden;
		margin-top: 0.75rem;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
	}

	.transcript-header-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.6rem 0.85rem;
		background: var(--t-panel);
		border-bottom: 1px solid var(--t-border);
	}

	.btn-transcript-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: transparent;
		border: none;
		color: var(--t-fg);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		padding: 0;
	}
	.btn-transcript-toggle:hover {
		color: var(--t-accent);
	}

	.toggle-icon {
		font-size: 0.7rem;
		color: #94a3b8;
	}

	.badge-status {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0.15rem 0.45rem;
		border-radius: 4px;
	}
	.status-ready {
		background: var(--t-panel);
		color: #86efac;
	}
	.status-no-audio {
		background: #475569;
		color: #cbd5e1;
	}
	.status-processing {
		background: var(--t-panel);
		color: #93c5fd;
	}
	.status-failed {
		background: #7f1d1d;
		color: var(--t-danger);
	}

	.header-export-actions {
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}

	.autoscroll-toggle {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.75rem;
		color: #94a3b8;
		cursor: pointer;
	}

	.export-dropdown-group {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.export-label {
		font-size: 0.75rem;
		color: #64748b;
	}

	.btn-export-pill {
		background: var(--t-panel);
		color: #cbd5e1;
		border: 1px solid var(--t-border);
		font-size: 0.68rem;
		font-weight: 600;
		padding: 0.15rem 0.4rem;
		border-radius: 3px;
		cursor: pointer;
		transition: background 0.15s ease;
	}
	.btn-export-pill:hover {
		background: var(--t-panel);
		color: var(--t-fg);
	}

	.transcript-panel-body {
		display: flex;
		flex-direction: column;
		height: 320px;
		background: var(--t-panel);
	}

	.transcript-filter-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.85rem;
		background: var(--t-panel);
		border-bottom: 1px solid var(--t-border);
		gap: 0.75rem;
	}

	.search-box {
		display: flex;
		align-items: center;
		background: var(--t-panel);
		border: 1px solid var(--t-border);
		border-radius: 4px;
		padding: 0.25rem 0.5rem;
		flex: 1;
		max-width: 380px;
		gap: 0.4rem;
	}

	.search-box input {
		background: transparent;
		border: none;
		color: var(--t-fg);
		font-size: 0.78rem;
		width: 100%;
		outline: none;
	}

	.btn-clear-search {
		background: transparent;
		border: none;
		color: #9ca3af;
		font-size: 0.7rem;
		cursor: pointer;
	}

	.speaker-filter-box {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.filter-lbl {
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.speaker-filter-box select {
		background: var(--t-panel);
		color: var(--t-fg);
		border: 1px solid var(--t-border);
		border-radius: 4px;
		font-size: 0.75rem;
		padding: 0.2rem 0.4rem;
	}

	.transcript-cue-list {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.transcript-cue-card {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.45rem 0.65rem;
		border-radius: 5px;
		background: var(--t-panel);
		border: 1px solid transparent;
		transition: all 0.15s ease;
	}
	.transcript-cue-card:hover {
		background: var(--t-panel);
		border-color: var(--t-border);
	}
	.transcript-cue-card.active {
		background: var(--t-panel);
		border-color: var(--t-border);
		box-shadow: 0 0 10px rgba(59, 130, 246, 0.2);
	}

	.cue-timestamp-btn {
		background: var(--t-panel);
		color: var(--t-accent);
		border: 1px solid var(--t-border);
		font-size: 0.72rem;
		font-family: monospace;
		font-weight: 600;
		padding: 0.2rem 0.45rem;
		border-radius: 3px;
		cursor: pointer;
		white-space: nowrap;
	}
	.cue-timestamp-btn:hover {
		background: var(--t-panel);
		color: var(--t-bg-elevated);
	}
	.cue-timestamp-btn.active {
		background: var(--t-panel);
		color: var(--t-fg);
		border-color: #60a5fa;
	}

	.cue-body-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.cue-meta-line {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.speaker-badge {
		font-size: 0.68rem;
		font-weight: 700;
		background: var(--t-panel);
		color: #c7d2fe;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}

	.unreviewed-pill {
		font-size: 0.65rem;
		background: #78350f;
		color: var(--t-fg);
		padding: 0.08rem 0.3rem;
		border-radius: 2px;
		font-weight: 600;
	}

	.approved-pill {
		font-size: 0.65rem;
		background: var(--t-panel);
		color: #a7f3d0;
		padding: 0.08rem 0.3rem;
		border-radius: 2px;
	}

	.confidence-tag {
		font-size: 0.65rem;
		color: #6b7280;
		font-family: monospace;
	}

	.cue-text-btn {
		background: transparent;
		border: none;
		text-align: left;
		padding: 0;
		font-size: 0.83rem;
		color: #e2e8f0;
		margin: 0;
		line-height: 1.45;
		cursor: pointer;
		font-family: inherit;
	}
	.cue-text-btn:hover {
		color: var(--t-accent);
	}
	.word-timing-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.2rem;
	}
	.word-timing-btn {
		border: 1px solid var(--t-border);
		border-radius: 3px;
		background: var(--t-panel);
		color: #cbd5e1;
		padding: 0.12rem 0.3rem;
		font: inherit;
		font-size: 0.68rem;
		cursor: pointer;
	}
	.word-timing-btn time {
		color: var(--t-accent);
		font-family: monospace;
	}
	.word-timing-btn:hover,
	.word-timing-btn:focus-visible {
		border-color: var(--t-accent);
		color: #fff;
	}

	.cue-actions-col {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.cue-body-col textarea {
		width: 100%;
		min-height: 4.5rem;
		box-sizing: border-box;
		padding: 0.45rem;
		border: 1px solid #475569;
		border-radius: 4px;
		background: var(--t-panel);
		color: #e2e8f0;
		font: inherit;
		resize: vertical;
	}

	.model-transcript-text {
		display: block;
		margin-top: 0.25rem;
		color: #94a3b8;
		font-size: 0.7rem;
	}

	.review-error {
		margin: 0.5rem 0;
		color: var(--t-danger);
		font-size: 0.78rem;
	}

	.btn-correct-cue,
	.btn-cancel-correction {
		padding: 0.15rem 0.45rem;
		border: 1px solid #475569;
		border-radius: 3px;
		background: var(--t-panel);
		color: #cbd5e1;
		font-size: 0.68rem;
		cursor: pointer;
	}
	.btn-correct-cue:hover,
	.btn-cancel-correction:hover {
		background: var(--t-panel);
		color: white;
	}

	.btn-verify-cue {
		background: var(--t-panel);
		color: #93c5fd;
		border: 1px solid var(--t-border);
		font-size: 0.68rem;
		padding: 0.15rem 0.45rem;
		border-radius: 3px;
		cursor: pointer;
	}
	.btn-verify-cue:hover {
		background: var(--t-panel);
		color: var(--t-fg);
	}

	.empty-transcript-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: #94a3b8;
		padding: 1.5rem;
		text-align: center;
		gap: 0.5rem;
	}

	.state-icon {
		font-size: 1.75rem;
	}

	.state-msg {
		font-size: 0.85rem;
		margin: 0;
	}

	.transcript-progress {
		width: min(100%, 25rem);
		margin-top: 0.5rem;
		text-align: left;
		color: var(--dossier-text-main, #24201c);
	}
	.transcript-progress-label {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.35rem;
		font-size: 0.75rem;
		text-transform: capitalize;
	}
	.transcript-progress progress {
		width: 100%;
		height: 0.65rem;
		accent-color: var(--dossier-accent, #9a6b28);
	}
	.transcript-progress p {
		margin: 0.35rem 0 0;
		font-size: 0.72rem;
		color: var(--dossier-text-muted, #6e6257);
	}

	.btn-retry {
		background: var(--t-panel);
		color: #e2e8f0;
		border: 1px solid #475569;
		padding: 0.3rem 0.75rem;
		font-size: 0.78rem;
		border-radius: 4px;
		cursor: pointer;
	}

	.no-matches-msg {
		color: #94a3b8;
		font-size: 0.8rem;
		text-align: center;
		padding: 1.5rem 0;
	}
</style>
