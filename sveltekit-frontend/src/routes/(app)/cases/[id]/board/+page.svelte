<script lang="ts">
	import HybridBoard from '$lib/components/canvas/HybridBoard.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { PageData } from './$types';

	// Props
	let { data }: { data: PageData } = $props();
	let caseId = $derived(data.caseId);
	let initialState = $derived(data.initialState);

	// State
	let board: HybridBoard = $state() as HybridBoard;
	let isDirty = $state(false);
	let isSaving = $state(false);
	let activeView = $state<'wall' | 'line' | 'file' | 'list'>('wall');
	let selectedEvidence = $state<any>(null);
	let showAddEvidence = $state(false);

	async function save() {
		if (!board) return;
		isSaving = true;

		try {
			const snapshot = board.serialize();
			const res = await fetch(`/api/cases/${caseId}/canvas`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(snapshot),
			});
			if (!res.ok) {
				console.error('Failed to save', await res.json());
				alert('Failed to save board state');
			} else {
				isDirty = false;
			}
		} catch (e) {
			console.error('Save error', e);
			alert('Error saving board state');
		} finally {
			isSaving = false;
		}
	}

	// Mock evidence data - replace with real data from API
	let evidenceItems = [
		{
			id: 1,
			title: 'Security Camera Feed',
			type: 'video',
			date: '2024-03-15',
			location: 'Main Street, Downtown',
			thumbnail: null,
		},
	];
</script>

<div class="evidence-board-container">
	<!-- Header -->
	<header class="board-header">
		<div class="header-left">
			<div class="board-title">
				<Icon name="layout-grid" class="title-icon" />
				<h1>EVIDENCE BOARD</h1>
			</div>
			<div class="case-meta">
				<span class="case-number">CASE #{caseId.substring(0, 8)}</span>
				<span class="separator">•</span>
				<span class="view-mode">Interactive Investigation Canvas</span>
			</div>
		</div>

		<div class="header-actions">
			<button class="action-btn" title="Active Investigation">
				<Icon name="activity" />
			</button>
			<button class="action-btn" title="Library">
				<Icon name="book-open" />
			</button>
			<button class="btn-primary" onclick={() => (showAddEvidence = true)}>
				<Icon name="plus" />
				Add Evidence
			</button>
		</div>
	</header>

	<!-- View Tabs -->
	<div class="view-tabs">
		<button
			class="tab"
			class:active={activeView === 'wall'}
			onclick={() => (activeView = 'wall')}
		>
			<Icon name="grid-3x3" />
			WALL
		</button>
		<button
			class="tab"
			class:active={activeView === 'line'}
			onclick={() => (activeView = 'line')}
		>
			<Icon name="git-branch" />
			LINE
		</button>
		<button
			class="tab"
			class:active={activeView === 'file'}
			onclick={() => (activeView = 'file')}
		>
			<Icon name="file-text" />
			FILE
		</button>
		<button
			class="tab"
			class:active={activeView === 'list'}
			onclick={() => (activeView = 'list')}
		>
			<Icon name="list" />
			LIST
		</button>

		{#if isDirty}
			<div class="unsaved-indicator">
				<span class="pulse-dot"></span>
				Unsaved changes
			</div>
		{/if}

		<button class="save-btn" onclick={save} disabled={isSaving || !isDirty}>
			<Icon name="save" />
			{isSaving ? 'Saving...' : 'Save Board'}
		</button>
	</div>

	<!-- Main Content Area -->
	<div class="board-content">
		<!-- Left Sidebar - Evidence List -->
		<aside class="evidence-sidebar">
			<div class="sidebar-header">
				<h3>EVIDENCE</h3>
				<span class="count-badge">{evidenceItems.length}</span>
			</div>

			<div class="evidence-list">
				{#each evidenceItems as item (item.id)}
					<div
						class="evidence-card"
						class:selected={selectedEvidence?.id === item.id}
						onclick={() => (selectedEvidence = item)}
					>
						<div class="evidence-thumbnail">
							{#if item.thumbnail}
								<img src={item.thumbnail} alt={item.title} />
							{:else}
								<div class="placeholder">
									<Icon name="play-circle" size={32} />
								</div>
							{/if}
						</div>
						<div class="evidence-info">
							<h4>{item.title}</h4>
							<p class="evidence-meta">{item.date}</p>
							<p class="evidence-location">{item.location}</p>
						</div>
						<button class="evidence-menu">
							<Icon name="more-vertical" />
						</button>
					</div>
				{/each}
			</div>
		</aside>

		<!-- Center Canvas - Board Visualization -->
		<div class="canvas-area">
			{#key caseId}
				<HybridBoard
					bind:this={board}
					initialSnapshot={initialState as any}
					onDirtyChange={(d) => (isDirty = d)}
					{caseId}
				/>
			{/key}
		</div>

		<!-- Right Sidebar - Detailed Evidence -->
		{#if selectedEvidence}
			<aside class="details-sidebar">
				<div class="details-header">
					<h3>Detailed Evidence</h3>
					<button class="close-btn" onclick={() => (selectedEvidence = null)}>
						<Icon name="x" />
					</button>
				</div>

				<div class="details-content">
					<div class="detail-section">
						<h4>Financial Impact</h4>
						<div class="financial-value">$50,000.00</div>
						<p class="financial-subtitle">Total damages • Current Market</p>
					</div>

					<div class="detail-section">
						<h4>AI Case Insights</h4>
						<ul class="insights-list">
							<li>High correlation with suspect timeline</li>
							<li>Location data matches witness statements</li>
							<li>Timestamp aligns with incident report</li>
						</ul>
					</div>

					<div class="detail-section">
						<h4>Document Statistics</h4>
						<div class="stats-grid">
							<div class="stat">
								<span class="stat-label">Created</span>
								<span class="stat-value">2021-11-15</span>
							</div>
							<div class="stat">
								<span class="stat-label">Modified</span>
								<span class="stat-value">Wed 3:12 PM</span>
							</div>
							<div class="stat">
								<span class="stat-label">File ID</span>
								<span class="stat-value">V4-87-2340</span>
							</div>
							<div class="stat">
								<span class="stat-label">Priority</span>
								<span class="stat-value priority-high">HIGH</span>
							</div>
						</div>
					</div>

					<div class="detail-section">
						<h4>Related Items</h4>
						<p class="related-info">4 connected evidence items, 2 witness statements</p>
					</div>
				</div>
			</aside>
		{/if}
	</div>

	<!-- Timeline View -->
	<div class="timeline-section">
		<div class="timeline-header">
			<span class="timeline-label">TIMELINE VIEW</span>
		</div>
		<div class="timeline-track">
			<!-- Timeline nodes - replace with real data -->
			<div class="timeline-node" style="left: 25%">
				<div class="node-dot orange"></div>
			</div>
			<div class="timeline-node" style="left: 50%">
				<div class="node-dot green"></div>
			</div>
			<div class="timeline-node active" style="left: 75%">
				<div class="node-dot blue"></div>
				<div class="node-label">Security Feed</div>
			</div>
		</div>
	</div>
</div>

<style>
	.evidence-board-container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: #fafafa;
		font-family: 'JetBrains Mono', monospace;
	}

	/* Header */
	.board-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.5rem;
		background: white;
		border-bottom: 1px solid #e5e7eb;
	}

	.header-left {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.board-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.title-icon {
		color: #3b82f6;
	}

	.board-title h1 {
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #1f2937;
		margin: 0;
	}

	.case-meta {
		font-size: 0.75rem;
		color: #6b7280;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.case-number {
		font-weight: 600;
	}

	.separator {
		color: #d1d5db;
	}

	.header-actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.action-btn {
		padding: 0.5rem;
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.2s;
	}

	.action-btn:hover {
		background: #e5e7eb;
		color: #1f2937;
	}

	.btn-primary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-primary:hover {
		background: #2563eb;
	}

	/* View Tabs */
	.view-tabs {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: white;
		border-bottom: 1px solid #e5e7eb;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.2s;
	}

	.tab:hover {
		background: #f3f4f6;
		color: #1f2937;
	}

	.tab.active {
		background: #eff6ff;
		border-color: #3b82f6;
		color: #3b82f6;
	}

	.unsaved-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
		font-size: 0.75rem;
		color: #f59e0b;
	}

	.pulse-dot {
		width: 0.5rem;
		height: 0.5rem;
		background: #f59e0b;
		border-radius: 50%;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.save-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: #10b981;
		color: white;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.save-btn:hover:not(:disabled) {
		background: #059669;
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Main Content */
	.board-content {
		display: grid;
		grid-template-columns: 280px 1fr 320px;
		flex: 1;
		overflow: hidden;
		gap: 1px;
		background: #e5e7eb;
	}

	/* Evidence Sidebar */
	.evidence-sidebar {
		background: white;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.sidebar-header h3 {
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #1f2937;
		margin: 0;
	}

	.count-badge {
		padding: 0.125rem 0.5rem;
		background: #eff6ff;
		color: #3b82f6;
		border-radius: 1rem;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.evidence-list {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
	}

	.evidence-card {
		padding: 0.75rem;
		margin-bottom: 0.5rem;
		background: #fafafa;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.evidence-card:hover {
		background: #f3f4f6;
		border-color: #3b82f6;
	}

	.evidence-card.selected {
		background: #eff6ff;
		border-color: #3b82f6;
	}

	.evidence-thumbnail {
		width: 100%;
		height: 120px;
		background: #1f2937;
		border-radius: 0.375rem;
		overflow: hidden;
		margin-bottom: 0.75rem;
	}

	.placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #6b7280;
	}

	.evidence-info h4 {
		font-size: 0.875rem;
		font-weight: 600;
		color: #1f2937;
		margin: 0 0 0.25rem 0;
	}

	.evidence-meta {
		font-size: 0.75rem;
		color: #6b7280;
		margin: 0;
	}

	.evidence-location {
		font-size: 0.75rem;
		color: #9ca3af;
		margin: 0.25rem 0 0 0;
	}

	/* Canvas Area */
	.canvas-area {
		background: white;
		position: relative;
		overflow: hidden;
	}

	/* Details Sidebar */
	.details-sidebar {
		background: white;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.details-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.details-header h3 {
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #1f2937;
		margin: 0;
	}

	.close-btn {
		padding: 0.25rem;
		background: transparent;
		border: none;
		color: #6b7280;
		cursor: pointer;
		transition: color 0.2s;
	}

	.close-btn:hover {
		color: #1f2937;
	}

	.details-content {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
	}

	.detail-section {
		margin-bottom: 1.5rem;
	}

	.detail-section h4 {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #6b7280;
		margin: 0 0 0.75rem 0;
		text-transform: uppercase;
	}

	.financial-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: #1f2937;
		margin-bottom: 0.25rem;
	}

	.financial-subtitle {
		font-size: 0.75rem;
		color: #6b7280;
		margin: 0;
	}

	.insights-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.insights-list li {
		padding: 0.5rem;
		margin-bottom: 0.5rem;
		background: #f3f4f6;
		border-left: 2px solid #3b82f6;
		font-size: 0.75rem;
		color: #1f2937;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stat-label {
		font-size: 0.75rem;
		color: #6b7280;
		text-transform: uppercase;
	}

	.stat-value {
		font-size: 0.875rem;
		font-weight: 600;
		color: #1f2937;
	}

	.stat-value.priority-high {
		color: #dc2626;
	}

	.related-info {
		font-size: 0.75rem;
		color: #6b7280;
		margin: 0;
	}

	/* Timeline */
	.timeline-section {
		background: white;
		border-top: 1px solid #e5e7eb;
		padding: 0.75rem 1.5rem;
	}

	.timeline-header {
		margin-bottom: 0.5rem;
	}

	.timeline-label {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #6b7280;
	}

	.timeline-track {
		position: relative;
		height: 2rem;
		background: #f3f4f6;
		border-radius: 0.25rem;
	}

	.timeline-node {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
	}

	.node-dot {
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		border: 2px solid white;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.node-dot.orange {
		background: #f59e0b;
	}
	.node-dot.green {
		background: #10b981;
	}
	.node-dot.blue {
		background: #3b82f6;
	}

	.timeline-node.active .node-dot {
		width: 1.25rem;
		height: 1.25rem;
	}

	.node-label {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-top: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: #1f2937;
		white-space: nowrap;
	}
</style>
