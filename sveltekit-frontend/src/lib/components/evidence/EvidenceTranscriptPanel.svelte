<!-- EvidenceTranscriptPanel.svelte — YouTube-Style Interactive Video Transcript Panel -->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface TranscriptSegment {
		id: string;
		startMs: number;
		endMs: number;
		text: string;
		speakerId?: string | null;
		confidence?: number;
		model?: string | null;
		sourceRevision?: string;
		analysisRevision?: string | null;
		reviewStatus?: 'approved' | 'unreviewed_proposal' | 'rejected';
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
	let isLoading = $state(false);
	let status = $state<'completed' | 'no_audio' | 'processing' | 'failed' | 'empty' | 'idle'>('idle');
	let searchQuery = $state('');
	let selectedSpeaker = $state<string>('all');
	let autoScrollEnabled = $state(true);
	let isUserScrolling = $state(false);
	let userScrollTimer: ReturnType<typeof setTimeout> | null = null;
	let scrollContainer = $state<HTMLDivElement | null>(null);
	let activeCueElement = $state<HTMLDivElement | null>(null);

	// Fetch transcript segments from API
	async function loadTranscript() {
		if (!evidenceId) return;
		isLoading = true;
		try {
			const res = await fetch(`/api/evidence/${evidenceId}/transcript`);
			if (!res.ok) {
				if (res.status === 404) status = 'empty';
				else status = 'failed';
				return;
			}
			const data = await res.json();
			if (data.ok) {
				segments = data.segments || [];
				sourceRevision = typeof data.sourceRevision === 'string' ? data.sourceRevision : null;
				analysisRevision = typeof data.analysisRevision === 'string' ? data.analysisRevision : null;
				status = data.status || (segments.length > 0 ? 'completed' : 'empty');
			} else {
				status = 'failed';
			}
		} catch {
			status = 'failed';
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		if (initialOpen) isOpen = true;
		if (isOpen) {
			void loadTranscript();
		}
	});

	function toggleOpen() {
		isOpen = !isOpen;
		if (isOpen && segments.length === 0 && status === 'idle') {
			void loadTranscript();
		}
	}

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
		try {
			const res = await fetch(`/api/evidence/${evidenceId}/transcript`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ segmentId, reviewStatus: newStatus })
			});
			if (res.ok) {
				segments = segments.map((s) => (s.id === segmentId ? { ...s, reviewStatus: newStatus } : s));
				onSegmentReviewed?.(segmentId, newStatus);
			}
		} catch (err) {
			console.error('Failed to review segment:', err);
		}
	}

	function handleExport(format: 'vtt' | 'srt' | 'txt' | 'json') {
		window.open(`/api/evidence/${evidenceId}/transcript?export=${format}`, '_blank');
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
				<div class="export-dropdown-group">
					<span class="export-label">Export:</span>
					<button type="button" class="btn-export-pill" onclick={() => handleExport('vtt')}>VTT</button>
					<button type="button" class="btn-export-pill" onclick={() => handleExport('srt')}>SRT</button>
					<button type="button" class="btn-export-pill" onclick={() => handleExport('txt')}>TXT</button>
					<button type="button" class="btn-export-pill" onclick={() => handleExport('json')}>JSON</button>
				</div>
			</div>
		{/if}
	</div>

	<!-- Expandable Transcript Content Body -->
	{#if isOpen}
		<div id="transcript-panel-body" class="transcript-panel-body">
			{#if status === 'no_audio'}
				<div class="empty-transcript-state">
					<span class="state-icon">🔇</span>
					<p class="state-msg">No audio stream detected. This file is a silent video recording.</p>
				</div>
			{:else if status === 'processing'}
				<div class="empty-transcript-state">
					<span class="state-icon spin">⏳</span>
					<p class="state-msg">Whisper transcription in progress. Cues will appear once durable analysis completes.</p>
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
									<button
										type="button"
										class="cue-text-btn"
										onclick={() => handleCueClick(cue.startMs)}
										title={`Seek to ${formatTime(cue.startMs)}`}
									>
										{cue.text}
									</button>
								</div>

								<!-- Verification Action -->
								{#if cue.reviewStatus === 'unreviewed_proposal'}
									<div class="cue-actions-col">
										<button
											type="button"
											class="btn-verify-cue"
											title="Verify transcript cue"
											onclick={() => reviewSegment(cue.id, 'approved')}
										>
											Approve
										</button>
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
		border: 1px solid #334155;
		border-radius: 6px;
		background: #0f172a;
		overflow: hidden;
		margin-top: 0.75rem;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
	}

	.transcript-header-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.6rem 0.85rem;
		background: #1e293b;
		border-bottom: 1px solid #334155;
	}

	.btn-transcript-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: transparent;
		border: none;
		color: #f1f5f9;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		padding: 0;
	}
	.btn-transcript-toggle:hover {
		color: #38bdf8;
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
		background: #14532d;
		color: #86efac;
	}
	.status-no-audio {
		background: #475569;
		color: #cbd5e1;
	}
	.status-processing {
		background: #1e3a8a;
		color: #93c5fd;
	}
	.status-failed {
		background: #7f1d1d;
		color: #fca5a5;
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
		background: #0f172a;
		color: #cbd5e1;
		border: 1px solid #334155;
		font-size: 0.68rem;
		font-weight: 600;
		padding: 0.15rem 0.4rem;
		border-radius: 3px;
		cursor: pointer;
		transition: background 0.15s ease;
	}
	.btn-export-pill:hover {
		background: #334155;
		color: #ffffff;
	}

	.transcript-panel-body {
		display: flex;
		flex-direction: column;
		height: 320px;
		background: #0b0f19;
	}

	.transcript-filter-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.85rem;
		background: #111827;
		border-bottom: 1px solid #1f2937;
		gap: 0.75rem;
	}

	.search-box {
		display: flex;
		align-items: center;
		background: #1f2937;
		border: 1px solid #374151;
		border-radius: 4px;
		padding: 0.25rem 0.5rem;
		flex: 1;
		max-width: 380px;
		gap: 0.4rem;
	}

	.search-box input {
		background: transparent;
		border: none;
		color: #e5e7eb;
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
		background: #1f2937;
		color: #e5e7eb;
		border: 1px solid #374151;
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
		background: #111827;
		border: 1px solid transparent;
		transition: all 0.15s ease;
	}
	.transcript-cue-card:hover {
		background: #1e293b;
		border-color: #334155;
	}
	.transcript-cue-card.active {
		background: #172554;
		border-color: #3b82f6;
		box-shadow: 0 0 10px rgba(59, 130, 246, 0.2);
	}

	.cue-timestamp-btn {
		background: #1f2937;
		color: #38bdf8;
		border: 1px solid #374151;
		font-size: 0.72rem;
		font-family: monospace;
		font-weight: 600;
		padding: 0.2rem 0.45rem;
		border-radius: 3px;
		cursor: pointer;
		white-space: nowrap;
	}
	.cue-timestamp-btn:hover {
		background: #38bdf8;
		color: #0f172a;
	}
	.cue-timestamp-btn.active {
		background: #2563eb;
		color: #ffffff;
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
		background: #312e81;
		color: #c7d2fe;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}

	.unreviewed-pill {
		font-size: 0.65rem;
		background: #78350f;
		color: #fde68a;
		padding: 0.08rem 0.3rem;
		border-radius: 2px;
		font-weight: 600;
	}

	.approved-pill {
		font-size: 0.65rem;
		background: #064e3b;
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
		color: #38bdf8;
	}

	.cue-actions-col {
		display: flex;
		align-items: center;
	}

	.btn-verify-cue {
		background: #1e3a8a;
		color: #93c5fd;
		border: 1px solid #2563eb;
		font-size: 0.68rem;
		padding: 0.15rem 0.45rem;
		border-radius: 3px;
		cursor: pointer;
	}
	.btn-verify-cue:hover {
		background: #2563eb;
		color: #ffffff;
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

	.btn-retry {
		background: #1e293b;
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
