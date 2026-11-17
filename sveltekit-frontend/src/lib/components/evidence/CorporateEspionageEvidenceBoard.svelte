<!-- Corporate Espionage Evidence Board — Canonical forensic canvas matching user design -->
<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		caseId?: string;
		caseTitle?: string;
		selectedNodeId?: string;
		onOpenVideoModal?: (evidenceId: string, timestampMs?: number) => void;
		onRunAnalysis?: () => void;
		onOpenLibrary?: () => void;
		onNewEvidence?: () => void;
	}

	let {
		caseId = 'INV-2024',
		caseTitle = 'CORPORATE ESPIONAGE INV-2024',
		selectedNodeId = 'ev-video-042',
		onOpenVideoModal,
		onRunAnalysis,
		onOpenLibrary,
		onNewEvidence
	}: Props = $props();

	// Active selected node ID
	let activeNodeId = $state('ev-video-042');
	$effect(() => {
		if (selectedNodeId) activeNodeId = selectedNodeId;
	});
	let activeTool = $state<'pointer' | 'link' | 'note' | 'media' | 'settings'>('pointer');
	let zoomScale = $state(100);
	let isTimelineOpen = $state(true);
	let investigatorNotes = $state([
		{
			id: 'note-1',
			author: 'JD',
			text: 'Look closely at the 0:14 mark. Is that a badge?',
			timestampMs: 14000,
			timeAgo: '1 hour ago'
		}
	]);
	let newNoteText = $state('');

	function handleSelectNode(id: string) {
		activeNodeId = id;
	}

	function handleSeekToTimestamp(timestampMs: number) {
		onOpenVideoModal?.('ev-video-042', timestampMs);
	}

	function handleAddNote() {
		if (!newNoteText.trim()) return;
		investigatorNotes = [
			...investigatorNotes,
			{
				id: `note-${Date.now()}`,
				author: 'ME',
				text: newNoteText.trim(),
				timestampMs: 14000,
				timeAgo: 'Just now'
			}
		];
		newNoteText = '';
	}
</script>

<div class="evidence-board-root">
	<!-- TOP HEADER BAR -->
	<header class="eb-top-header">
		<div class="eb-header-left">
			<button class="eb-back-btn" aria-label="Back">
				<Icon name="arrow-left" size={16} />
			</button>
			<div class="eb-divider-v"></div>
			<div class="eb-title-block">
				<h1 class="eb-title">EVIDENCE BOARD</h1>
				<span class="eb-case-subtitle">CASE: {caseTitle}</span>
			</div>
		</div>

		<div class="eb-header-right">
			<div class="eb-status-dropdown" role="button" tabindex="0">
				<span class="eb-status-dot active"></span>
				<span class="eb-status-label">Active Investigation</span>
				<Icon name="chevron-down" size={12} />
			</div>

			<button class="eb-btn-secondary" onclick={onOpenLibrary}>
				<Icon name="book-open" size={14} />
				<span>Library</span>
			</button>

			<button class="eb-btn-primary" onclick={onRunAnalysis}>
				<Icon name="bar-chart-2" size={14} />
				<span>Run Analysis</span>
			</button>
		</div>
	</header>

	<!-- MAIN WORKSPACE: CANVAS + RIGHT DRAWER -->
	<div class="eb-main-workspace">
		<!-- CANVAS VIEWPORT -->
		<div class="eb-canvas-container">
			<!-- TOP-LEFT CANVAS ACTION BAR -->
			<div class="eb-canvas-toolbar">
				<div class="eb-pill-tag">
					<span class="eb-mono-tag">SCALE: {zoomScale}%</span>
				</div>
				<div class="eb-pill-tag live-sync">
					<span class="eb-pulse-dot"></span>
					<span>LIVE SYNC</span>
				</div>
				<button class="eb-new-evidence-btn" onclick={onNewEvidence}>
					<Icon name="plus" size={13} />
					<span>NEW EVIDENCE</span>
				</button>
			</div>

			<!-- LEFT VERTICAL TOOL PALETTE -->
			<aside class="eb-left-palette">
				<button
					class="eb-palette-tool"
					class:active={activeTool === 'pointer'}
					onclick={() => (activeTool = 'pointer')}
					title="Select (V)"
				>
					<Icon name="mouse-pointer" size={15} />
				</button>
				<button
					class="eb-palette-tool"
					class:active={activeTool === 'link'}
					onclick={() => (activeTool = 'link')}
					title="Link Relationships (C)"
				>
					<Icon name="share-2" size={15} />
				</button>
				<button
					class="eb-palette-tool"
					class:active={activeTool === 'note'}
					onclick={() => (activeTool = 'note')}
					title="Sticky Note (N)"
				>
					<Icon name="file-text" size={15} />
				</button>
				<button
					class="eb-palette-tool"
					class:active={activeTool === 'media'}
					onclick={() => (activeTool = 'media')}
					title="Media Capture"
				>
					<Icon name="image" size={15} />
				</button>
				<div class="eb-palette-divider"></div>
				<button class="eb-palette-tool" onclick={() => (zoomScale = Math.min(200, zoomScale + 10))} title="Zoom In (+)">
					<Icon name="plus" size={15} />
				</button>
				<button class="eb-palette-tool" onclick={() => (zoomScale = Math.max(50, zoomScale - 10))} title="Zoom Out (-)">
					<Icon name="minus" size={15} />
				</button>
				<div class="eb-palette-divider"></div>
				<button class="eb-palette-tool" title="Canvas Settings">
					<Icon name="settings" size={15} />
				</button>
			</aside>

			<!-- CANVAS GRID SUBSTRATE -->
			<div class="eb-grid-canvas">
				<!-- SVG DIRECTED EDGES -->
				<svg class="eb-connections-svg" width="100%" height="100%">
					<defs>
						<!-- Arrow marker for blue solid edge -->
						<marker id="blue-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
							<path d="M 0 1 L 9 5 L 0 9 z" fill="#2563eb" />
						</marker>
						<!-- Arrow marker for gray dashed edge -->
						<marker id="gray-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
							<path d="M 0 1 L 9 5 L 0 9 z" fill="#94a3b8" />
						</marker>
					</defs>

					<!-- Edge 1: Video #042 -> Transaction $50k -->
					<path
						d="M 390 260 C 480 260, 480 250, 580 250"
						fill="none"
						stroke="#2563eb"
						stroke-width="2"
						marker-end="url(#blue-arrow)"
					/>

					<!-- Edge 2: Video #042 -> Document J. Doe -->
					<path
						d="M 390 320 C 480 320, 480 430, 580 440"
						fill="none"
						stroke="#94a3b8"
						stroke-width="2"
						stroke-dasharray="5,4"
						marker-end="url(#gray-arrow)"
					/>
				</svg>

				<!-- CARD 1: VIDEO EVIDENCE #042 (Selected) -->
				<div
					class="eb-node-card video-card"
					class:selected={activeNodeId === 'ev-video-042'}
					style="left: 170px; top: 210px; width: 230px;"
					role="button"
					tabindex="0"
					onclick={() => handleSelectNode('ev-video-042')}
					onkeydown={(e) => e.key === 'Enter' && handleSelectNode('ev-video-042')}
				>
					<div class="card-select-badge">
						<Icon name="check" size={10} />
					</div>

					<div class="card-header-row">
						<div class="card-type-left">
							<Icon name="video" size={13} class="text-blue-600" />
							<span class="card-type-tag">VIDEO EVIDENCE</span>
						</div>
						<span class="card-id-tag">ID: #042</span>
					</div>

					<!-- Video Player Preview -->
					<div
						class="card-video-box"
						role="button"
						tabindex="0"
						title="Click to review 50-frame filmstrip in modal"
						onclick={(e) => {
							e.stopPropagation();
							handleSeekToTimestamp(14000);
						}}
						onkeydown={(e) => e.key === 'Enter' && handleSeekToTimestamp(14000)}
					>
						<div class="play-circle-btn">
							<Icon name="play" size={16} />
						</div>
						<span class="duration-overlay">14:02:35</span>
					</div>

					<div class="card-body">
						<h3 class="card-title">Security Camera Feed</h3>
						<p class="card-snippet">
							Footage captures suspect entering the main server room via the north...
						</p>
					</div>

					<div class="card-footer-row">
						<span class="reliability-badge">
							<span class="badge-letter">A</span>
							<span>High Reliability</span>
						</span>
						<div class="card-quick-actions">
							<button class="card-icon-btn" title="Link"><Icon name="link" size={12} /></button>
							<button class="card-icon-btn" title="Delete"><Icon name="trash-2" size={12} /></button>
						</div>
					</div>
				</div>

				<!-- CARD 2: TRANSACTION -->
				<div
					class="eb-node-card transaction-card"
					class:selected={activeNodeId === 'ev-trans-001'}
					style="left: 580px; top: 180px; width: 210px;"
					role="button"
					tabindex="0"
					onclick={() => handleSelectNode('ev-trans-001')}
					onkeydown={(e) => e.key === 'Enter' && handleSelectNode('ev-trans-001')}
				>
					<div class="card-header-row">
						<div class="card-type-left text-emerald-600">
							<span class="font-bold text-xs">$</span>
							<span class="card-type-tag">TRANSACTION</span>
						</div>
					</div>
					<div class="card-body">
						<div class="transaction-amount">$50,000.00</div>
						<p class="card-snippet">Wire transfer to offshore account</p>
					</div>
					<div class="card-footer-row">
						<span class="flagged-status">
							<span class="status-dot-red"></span>
							<span>Flagged</span>
						</span>
						<button class="view-analysis-link">View Analysis</button>
					</div>
				</div>

				<!-- CARD 3: DOCUMENT -->
				<div
					class="eb-node-card document-card"
					class:selected={activeNodeId === 'ev-doc-001'}
					style="left: 580px; top: 370px; width: 210px;"
					role="button"
					tabindex="0"
					onclick={() => handleSelectNode('ev-doc-001')}
					onkeydown={(e) => e.key === 'Enter' && handleSelectNode('ev-doc-001')}
				>
					<div class="card-header-row">
						<div class="card-type-left text-amber-600">
							<Icon name="file-text" size={13} />
							<span class="card-type-tag">DOCUMENT</span>
						</div>
					</div>
					<div class="card-body doc-body-flex">
						<div class="doc-pdf-icon">PDF</div>
						<div class="doc-text-wrap">
							<h3 class="card-title">Witness Statement: J. Doe</h3>
							<p class="card-snippet">Confirmed presence of keycard.</p>
						</div>
					</div>
					<div class="card-footer-row">
						<div class="doc-tags-wrap">
							<span class="doc-tag">#witness</span>
							<span class="doc-tag">#keycard</span>
						</div>
					</div>
				</div>
			</div>

			<!-- BOTTOM TIMELINE VIEW -->
			{#if isTimelineOpen}
				<div class="eb-bottom-timeline">
					<div class="timeline-head-row">
						<span class="timeline-title">TIMELINE VIEW</span>
						<div class="timeline-controls">
							<button class="tl-ctrl-btn" title="Zoom Out"><Icon name="zoom-out" size={12} /></button>
							<button class="tl-ctrl-btn" title="Zoom In"><Icon name="zoom-in" size={12} /></button>
							<button class="tl-ctrl-btn" onclick={() => (isTimelineOpen = false)} title="Close">
								<Icon name="x" size={12} />
							</button>
						</div>
					</div>

					<div class="timeline-track-container">
						<div class="timeline-date-labels">
							<span>Oct 12</span>
							<span>Oct 13</span>
							<span>Oct 14</span>
							<span class="text-blue-600 font-bold">Oct 15</span>
							<span>Oct 16</span>
						</div>

						<div class="timeline-axis-bar">
							<!-- Oct 12: Orange Dot -->
							<div class="timeline-marker dot-orange" style="left: 15%;"></div>
							<!-- Oct 14: Green Dot -->
							<div class="timeline-marker dot-green" style="left: 55%;"></div>
							<!-- Oct 15: Blue Dot with CAM FEED Badge -->
							<div
								class="timeline-marker dot-blue selected"
								style="left: 75%;"
								role="button"
								tabindex="0"
								onclick={() => handleSelectNode('ev-video-042')}
								onkeydown={(e) => e.key === 'Enter' && handleSelectNode('ev-video-042')}
							>
								<div class="marker-stem"></div>
								<div class="marker-feed-badge">
									<span>CAM</span>
									<span>FEED</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- RIGHT DRAWER: SELECTED EVIDENCE INSPECTOR -->
		<aside class="eb-right-sidebar">
			<div class="rs-header">
				<h2 class="rs-title">Selected Evidence</h2>
				<div class="rs-subtitle-row">
					<span class="rs-evidence-name">Video Evidence #042</span>
					<span class="rs-primary-badge">PRIMARY</span>
				</div>
			</div>

			<div class="rs-content-scroll">
				<!-- AI LEGAL INSIGHT CARD -->
				<div class="ai-insight-box">
					<div class="ai-insight-top">
						<Icon name="sparkles" size={14} class="text-purple-600" />
						<span class="ai-insight-label">AI Legal Insight</span>
					</div>
					<p class="ai-insight-text">
						The timestamps in this footage align with the server logs found in
						<strong class="text-gray-900 font-semibold">Evidence #012</strong>. This creates a strong circumstantial link for
						unauthorized access.
					</p>
					<button class="ai-case-law-btn" type="button" onclick={onRunAnalysis}>Explore Related Case Law</button>
				</div>

				<!-- METADATA SECTION -->
				<div class="rs-section">
					<h3 class="rs-section-title">METADATA</h3>
					<div class="metadata-table">
						<div class="meta-row">
							<span class="meta-label">Date Created</span>
							<span class="meta-value">2023-10-15</span>
						</div>
						<div class="meta-row">
							<span class="meta-label">Source</span>
							<span class="meta-value font-mono">Cam-N-04</span>
						</div>
						<div class="meta-row">
							<span class="meta-label">Format</span>
							<span class="meta-value">.MP4 (H.264)</span>
						</div>
						<div class="meta-row">
							<span class="meta-label">Chain of Custody</span>
							<span class="meta-value text-emerald-600 flex items-center gap-1 font-medium">
								<Icon name="check-circle-2" size={13} /> Verified
							</span>
						</div>
					</div>
				</div>

				<!-- INVESTIGATOR NOTES SECTION -->
				<div class="rs-section">
					<h3 class="rs-section-title">INVESTIGATOR NOTES</h3>
					<div class="notes-feed">
						{#each investigatorNotes as note (note.id)}
							<div class="note-card">
								<div class="note-avatar">{note.author}</div>
								<div class="note-content">
									<p class="note-text">
										Look closely at the
										<button
											class="timestamp-pill-btn"
											onclick={() => handleSeekToTimestamp(note.timestampMs)}
											title="Open video at 0:14 keyframe"
										>
											0:14 mark
										</button>.
										Is that a badge?
									</p>
									<span class="note-time">{note.timeAgo}</span>
								</div>
							</div>
						{/each}
					</div>

					<!-- ADD A NOTE INPUT -->
					<div class="add-note-box">
						<input
							type="text"
							placeholder="Add a note..."
							bind:value={newNoteText}
							onkeydown={(e) => e.key === 'Enter' && handleAddNote()}
						/>
						<button class="send-note-btn" onclick={handleAddNote} aria-label="Submit note">
							<Icon name="send" size={13} />
						</button>
					</div>
				</div>
			</div>
		</aside>
	</div>
</div>

<style>
	.evidence-board-root {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		background: #ffffff;
		color: #1e293b;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
		overflow: hidden;
	}

	/* TOP HEADER */
	.eb-top-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 52px;
		padding: 0 16px;
		border-bottom: 1px solid #e2e8f0;
		background: #ffffff;
		z-index: 20;
	}

	.eb-header-left {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.eb-back-btn {
		background: none;
		border: none;
		color: #475569;
		cursor: pointer;
		padding: 4px;
		display: flex;
		align-items: center;
		border-radius: 4px;
	}
	.eb-back-btn:hover {
		background: #f1f5f9;
		color: #0f172a;
	}

	.eb-divider-v {
		width: 2px;
		height: 20px;
		background: #0f172a;
	}

	.eb-title-block {
		display: flex;
		flex-direction: column;
	}

	.eb-title {
		font-size: 13px;
		font-weight: 800;
		letter-spacing: 0.05em;
		color: #0f172a;
		margin: 0;
		line-height: 1.1;
	}

	.eb-case-subtitle {
		font-size: 10px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		color: #64748b;
		letter-spacing: 0.04em;
	}

	.eb-header-right {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.eb-status-dropdown {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		color: #334155;
		cursor: pointer;
	}

	.eb-status-dot.active {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #10b981;
	}

	.eb-btn-secondary {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		background: #ffffff;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		color: #334155;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.eb-btn-secondary:hover {
		background: #f8fafc;
		border-color: #94a3b8;
	}

	.eb-btn-primary {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		background: #1e3a8a;
		color: #ffffff;
		border: none;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
		transition: background 0.15s ease;
	}
	.eb-btn-primary:hover {
		background: #1d4ed8;
	}

	/* MAIN WORKSPACE */
	.eb-main-workspace {
		display: flex;
		flex: 1;
		position: relative;
		overflow: hidden;
	}

	/* CANVAS CONTAINER */
	.eb-canvas-container {
		flex: 1;
		position: relative;
		overflow: hidden;
		background-color: #fbfcfd;
		background-image:
			linear-gradient(to right, #f1f5f9 1px, transparent 1px),
			linear-gradient(to bottom, #f1f5f9 1px, transparent 1px);
		background-size: 24px 24px;
	}

	/* CANVAS TOOLBAR */
	.eb-canvas-toolbar {
		position: absolute;
		top: 14px;
		left: 70px;
		display: flex;
		align-items: center;
		gap: 8px;
		z-index: 10;
	}

	.eb-pill-tag {
		display: flex;
		align-items: center;
		gap: 6px;
		background: #ffffff;
		border: 1px solid #e2e8f0;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 600;
		color: #475569;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
	}

	.eb-pill-tag.live-sync {
		color: #059669;
	}

	.eb-pulse-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #10b981;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.4; transform: scale(0.85); }
	}

	.eb-new-evidence-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		background: #ffffff;
		border: 1px solid #cbd5e1;
		padding: 4px 10px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 700;
		color: #1e293b;
		cursor: pointer;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
	}
	.eb-new-evidence-btn:hover {
		background: #f8fafc;
	}

	/* LEFT PALETTE */
	.eb-left-palette {
		position: absolute;
		left: 14px;
		top: 14px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 6px;
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
		z-index: 10;
	}

	.eb-palette-tool {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: #475569;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.eb-palette-tool:hover {
		background: #f1f5f9;
		color: #0f172a;
	}
	.eb-palette-tool.active {
		background: #eff6ff;
		color: #2563eb;
	}

	.eb-palette-divider {
		width: 18px;
		height: 1px;
		background: #e2e8f0;
		margin: 2px 0;
	}

	/* GRID CANVAS AND NODES */
	.eb-grid-canvas {
		width: 100%;
		height: 100%;
		position: absolute;
		top: 0;
		left: 0;
	}

	.eb-connections-svg {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
		z-index: 1;
	}

	/* NODE CARDS */
	.eb-node-card {
		position: absolute;
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
		padding: 10px;
		cursor: pointer;
		user-select: none;
		z-index: 2;
		transition: box-shadow 0.15s, border-color 0.15s;
	}
	.eb-node-card:hover {
		box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08);
	}
	.eb-node-card.selected {
		border: 2px solid #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15), 0 10px 15px -3px rgba(0, 0, 0, 0.08);
	}

	.card-select-badge {
		position: absolute;
		top: -8px;
		right: -8px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #1e3a8a;
		color: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	.card-header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}

	.card-type-left {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: #334155;
	}

	.card-id-tag {
		font-size: 9px;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-weight: 700;
		color: #2563eb;
		background: #eff6ff;
		padding: 2px 6px;
		border-radius: 4px;
	}

	/* Card Video Box */
	.card-video-box {
		position: relative;
		width: 100%;
		height: 110px;
		background: #0f172a;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 8px;
		overflow: hidden;
	}

	.play-circle-btn {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.2);
		border: 2px solid rgba(255, 255, 255, 0.7);
		color: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.15s ease;
	}
	.card-video-box:hover .play-circle-btn {
		transform: scale(1.1);
		background: rgba(255, 255, 255, 0.35);
	}

	.duration-overlay {
		position: absolute;
		bottom: 6px;
		right: 6px;
		background: rgba(0, 0, 0, 0.75);
		color: #ffffff;
		font-size: 9px;
		font-family: ui-monospace, SFMono-Regular, monospace;
		padding: 2px 4px;
		border-radius: 3px;
	}

	.card-title {
		font-size: 12px;
		font-weight: 700;
		color: #0f172a;
		margin: 0 0 4px 0;
	}

	.card-snippet {
		font-size: 10px;
		color: #64748b;
		margin: 0 0 8px 0;
		line-height: 1.35;
	}

	.card-footer-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 6px;
		border-top: 1px solid #f1f5f9;
	}

	.reliability-badge {
		display: flex;
		align-items: center;
		gap: 4px;
		background: #f5f3ff;
		color: #7c3aed;
		font-size: 9px;
		font-weight: 600;
		padding: 2px 6px;
		border-radius: 4px;
	}

	.badge-letter {
		font-weight: 800;
	}

	.card-quick-actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.card-icon-btn {
		background: none;
		border: none;
		color: #94a3b8;
		padding: 2px;
		cursor: pointer;
		display: flex;
		align-items: center;
	}
	.card-icon-btn:hover {
		color: #475569;
	}

	/* TRANSACTION CARD */
	.transaction-amount {
		font-size: 16px;
		font-weight: 800;
		color: #0f172a;
		margin-bottom: 2px;
	}

	.flagged-status {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 10px;
		font-weight: 600;
		color: #dc2626;
	}

	.status-dot-red {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #dc2626;
	}

	.view-analysis-link {
		background: none;
		border: none;
		color: #64748b;
		font-size: 10px;
		cursor: pointer;
	}
	.view-analysis-link:hover {
		color: #0f172a;
		text-decoration: underline;
	}

	/* DOCUMENT CARD */
	.doc-body-flex {
		display: flex;
		gap: 8px;
		align-items: flex-start;
	}

	.doc-pdf-icon {
		background: #f1f5f9;
		border: 1px solid #e2e8f0;
		color: #dc2626;
		font-size: 8px;
		font-weight: 800;
		padding: 6px 4px;
		border-radius: 4px;
	}

	.doc-text-wrap {
		flex: 1;
	}

	.doc-tags-wrap {
		display: flex;
		gap: 4px;
	}

	.doc-tag {
		font-size: 9px;
		background: #f1f5f9;
		color: #64748b;
		padding: 1px 5px;
		border-radius: 3px;
	}

	/* BOTTOM TIMELINE VIEW */
	.eb-bottom-timeline {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 90px;
		background: #ffffff;
		border-top: 1px solid #e2e8f0;
		display: flex;
		flex-direction: column;
		padding: 8px 24px;
		z-index: 15;
		box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.03);
	}

	.timeline-head-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 6px;
	}

	.timeline-title {
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.06em;
		color: #475569;
	}

	.timeline-controls {
		display: flex;
		gap: 6px;
	}

	.tl-ctrl-btn {
		background: none;
		border: none;
		color: #94a3b8;
		cursor: pointer;
		padding: 2px;
		display: flex;
		align-items: center;
	}
	.tl-ctrl-btn:hover {
		color: #0f172a;
	}

	.timeline-track-container {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.timeline-date-labels {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		color: #64748b;
		padding: 0 20px;
	}

	.timeline-axis-bar {
		position: relative;
		height: 2px;
		background: #cbd5e1;
		margin: 6px 20px 0 20px;
	}

	.timeline-marker {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 2px solid #ffffff;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
		cursor: pointer;
	}

	.dot-orange { background: #f59e0b; }
	.dot-green { background: #10b981; }
	.dot-blue { background: #2563eb; }

	.dot-blue.selected {
		width: 12px;
		height: 12px;
		background: #1e3a8a;
	}

	.marker-stem {
		position: absolute;
		top: 10px;
		left: 50%;
		transform: translateX(-50%);
		width: 1px;
		height: 12px;
		background: #1e3a8a;
	}

	.marker-feed-badge {
		position: absolute;
		top: 22px;
		left: 50%;
		transform: translateX(-50%);
		background: #1e3a8a;
		color: #ffffff;
		font-size: 8px;
		font-weight: 800;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2px 4px;
		border-radius: 3px;
		line-height: 1;
		white-space: nowrap;
	}

	/* RIGHT SIDEBAR */
	.eb-right-sidebar {
		width: 310px;
		background: #ffffff;
		border-left: 1px solid #e2e8f0;
		display: flex;
		flex-direction: column;
		z-index: 18;
	}

	.rs-header {
		padding: 14px 16px;
		border-bottom: 1px solid #f1f5f9;
	}

	.rs-title {
		font-size: 13px;
		font-weight: 700;
		color: #0f172a;
		margin: 0 0 4px 0;
	}

	.rs-subtitle-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.rs-evidence-name {
		font-size: 11px;
		color: #475569;
	}

	.rs-primary-badge {
		background: #eff6ff;
		color: #2563eb;
		font-size: 9px;
		font-weight: 700;
		padding: 1px 5px;
		border-radius: 3px;
	}

	.rs-content-scroll {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	/* AI Insight Box */
	.ai-insight-box {
		background: #faf5ff;
		border: 1px solid #f3e8ff;
		border-radius: 8px;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.ai-insight-top {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		font-weight: 700;
		color: #6b21a8;
	}

	.ai-insight-text {
		font-size: 11px;
		color: #334155;
		line-height: 1.45;
		margin: 0;
	}

	.ai-case-law-btn {
		background: #ffffff;
		border: 1px solid #d8b4fe;
		color: #6b21a8;
		font-size: 10px;
		font-weight: 600;
		padding: 6px 10px;
		border-radius: 5px;
		cursor: pointer;
		text-align: center;
		transition: background 0.15s ease;
	}
	.ai-case-law-btn:hover {
		background: #f3e8ff;
	}

	/* METADATA SECTION */
	.rs-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.rs-section-title {
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.05em;
		color: #94a3b8;
		margin: 0;
	}

	.metadata-table {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.meta-row {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
	}

	.meta-label {
		color: #64748b;
	}

	.meta-value {
		font-weight: 500;
		color: #0f172a;
	}

	/* NOTES SECTION */
	.notes-feed {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.note-card {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		background: #f8fafc;
		border: 1px solid #f1f5f9;
		border-radius: 6px;
		padding: 8px;
	}

	.note-avatar {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: #e2e8f0;
		color: #475569;
		font-size: 9px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.note-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.note-text {
		font-size: 11px;
		color: #1e293b;
		margin: 0;
		line-height: 1.35;
	}

	.timestamp-pill-btn {
		background: #dbeafe;
		color: #1d4ed8;
		border: none;
		border-radius: 3px;
		font-size: 10px;
		font-weight: 700;
		padding: 1px 4px;
		cursor: pointer;
		font-family: ui-monospace, monospace;
	}
	.timestamp-pill-btn:hover {
		background: #bfdbfe;
		text-decoration: underline;
	}

	.note-time {
		font-size: 9px;
		color: #94a3b8;
	}

	.add-note-box {
		display: flex;
		align-items: center;
		border: 1px solid #e2e8f0;
		border-radius: 6px;
		padding: 4px 8px;
		background: #ffffff;
	}

	.add-note-box input {
		flex: 1;
		border: none;
		outline: none;
		font-size: 11px;
		color: #1e293b;
		background: transparent;
	}

	.send-note-btn {
		background: none;
		border: none;
		color: #94a3b8;
		cursor: pointer;
		display: flex;
		align-items: center;
		padding: 2px;
	}
	.send-note-btn:hover {
		color: #2563eb;
	}
</style>
