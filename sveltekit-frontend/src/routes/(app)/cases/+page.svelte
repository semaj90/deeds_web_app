<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import CaseCard from '$lib/components/cases/CaseCard.svelte';
	import CaseViewModal from '$lib/components/cases/CaseViewModal.svelte';
	import { analytics } from '$lib/stores/analytics.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// View mode + display
	let viewMode = $state<'list' | 'cards' | 'rich'>('cards');
	let showNewCaseModal = $state(false);
	let statusFilter = $state('all');
	let priorityFilter = $state('');
	let searchQuery = $state('');
	let selectedCases = $state<Set<string>>(new Set());
	let searchInputEl = $state<HTMLInputElement | null>(null);

	// Case detail view modal
	let viewCaseId = $state<string | null>(null);
	let showViewModal = $state(false);

	// AI analysis
	let analyzingCaseId = $state<string | null>(null);
	let lastAnalyzedCase = $state<{ id: string; title: string } | null>(null);
	let analysisResult = $state<any>(null);
	let analysisError = $state<string | null>(null);

	// Bulk action state
	let bulkStatus = $state<string>('');
	let showBulkActions = $derived(selectedCases.size > 0);

	// Computed stats from loaded cases
	let stats = $derived.by(() => {
		const all = data.cases ?? [];
		return {
			total: all.length,
			open: all.filter((c: any) => c.status === 'open').length,
			inProgress: all.filter((c: any) => c.status === 'in_progress').length,
			pendingReview: all.filter((c: any) => c.status === 'pending_review').length,
			closed: all.filter((c: any) => c.status === 'closed').length,
			archived: all.filter((c: any) => c.status === 'archived').length,
			critical: all.filter((c: any) => c.priority === 'critical' || c.priority === 'urgent').length,
			high: all.filter((c: any) => c.priority === 'high').length,
			medium: all.filter((c: any) => c.priority === 'medium').length,
			low: all.filter((c: any) => c.priority === 'low').length,
		};
	});

	// Client-side filtering on top of server results
	let filteredCases = $derived.by(() => {
		const all = data.cases ?? [];
		if (!searchQuery) return all;
		const q = searchQuery.toLowerCase();
		return all.filter((c: any) =>
			(c.title ?? '').toLowerCase().includes(q) ||
			(c.caseNumber ?? '').toLowerCase().includes(q) ||
			(c.description ?? '').toLowerCase().includes(q) ||
			(c.practiceArea ?? '').toLowerCase().includes(q) ||
			(c.jurisdiction ?? '').toLowerCase().includes(q)
		);
	});

	// Adapter for CaseCard rich view
	let richCaseCards = $derived(
		filteredCases.map((c: any) => ({
			id: c.id,
			title: c.title ?? 'Untitled',
			description: c.description ?? '',
			status: (c.status === 'open' || c.status === 'in_progress') ? 'active' as const
				: c.status === 'pending_review' ? 'pending' as const
				: c.status === 'closed' ? 'closed' as const
				: 'archived' as const,
			priority: (['critical', 'high', 'medium', 'low'].includes(c.priority) ? c.priority : 'medium') as 'critical' | 'high' | 'medium' | 'low',
			created: c.createdAt ?? new Date().toISOString(),
			updated: c.updatedAt,
			stats: { evidence: 0, witnesses: 0, documents: 0 },
			tags: c.practiceArea ? [c.practiceArea] : [],
		}))
	);

	let hasActiveFilters = $derived(statusFilter !== 'all' || !!priorityFilter || !!searchQuery);

	// Auto-open modal if ?create=true
	$effect(() => {
		statusFilter = data.filters?.status ?? 'all';
		priorityFilter = data.filters?.priority || '';
		searchQuery = data.filters?.search || '';

		const urlParams = new URLSearchParams(window.location.search);
		if (urlParams.get('create') === 'true') {
			showNewCaseModal = true;
			window.history.replaceState({}, '', '/cases');
		}
	});

	// Track case creation on form success
	$effect(() => {
		if (form?.success) {
			analytics.track('case_created', { message: form.message });
		}
	});

	function openNewCase() { showNewCaseModal = true; }
	function closeModal() { showNewCaseModal = false; }

	function priorityClass(priority: string): string {
		switch (priority) {
			case 'critical': return 'cs-badge-critical';
			case 'urgent': return 'cs-badge-urgent';
			case 'high': return 'cs-badge-high';
			case 'medium': return 'cs-badge-medium';
			case 'low': return 'cs-badge-low';
			default: return 'cs-badge-default';
		}
	}

	function statusClass(status: string): string {
		switch (status) {
			case 'open': return 'cs-badge-open';
			case 'in_progress': return 'cs-badge-inprogress';
			case 'pending_review': return 'cs-badge-pending';
			case 'closed': return 'cs-badge-closed';
			case 'archived': return 'cs-badge-archived';
			default: return 'cs-badge-default';
		}
	}

	function toggleCaseSelection(caseId: string) {
		if (selectedCases.has(caseId)) {
			selectedCases.delete(caseId);
		} else {
			selectedCases.add(caseId);
		}
	}

	function clearSelection() { selectedCases.clear(); }

	function applyFilters() {
		const params = new URLSearchParams();
		if (statusFilter !== 'all') params.set('status', statusFilter);
		if (priorityFilter) params.set('priority', priorityFilter);
		if (searchQuery) params.set('search', searchQuery);
		goto(`/cases?${params.toString()}`);
	}

	function openCaseDetail(caseId: string) {
		viewCaseId = caseId;
		showViewModal = true;
		analytics.track('case_updated', { action: 'view_detail', caseId });
	}

	function isFictional(caseItem: any): boolean {
		const t = (caseItem.title ?? '').toLowerCase();
		const d = (caseItem.description ?? '').toLowerCase();
		return t.includes('fictional') || d.includes('fictional') ||
			t.includes('[fictional]') || d.includes('this case is entirely fictional');
	}

	function formatDate(val: string | null | undefined) {
		if (!val) return '—';
		const d = new Date(val);
		if (isNaN(d.getTime())) return val;
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	// AI Analysis
	async function analyzeCase(caseId: string, caseTitle: string) {
		analyzingCaseId = caseId;
		lastAnalyzedCase = { id: caseId, title: caseTitle };
		analysisError = null;
		analysisResult = null;

		try {
			const response = await fetch('/api/orchestrator/analyze', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					task: 'analyze-case',
					payload: {
						caseId,
						query: `Analyze case "${caseTitle}" and provide:
1. Case strength assessment
2. Key legal issues identified
3. Evidence gaps or weaknesses
4. Recommended next steps
5. Potential legal precedents`
					}
				})
			});
			const result = await response.json();
			if (result.success) {
				analysisResult = { caseId, caseTitle, ...result.data };
			} else {
				analysisError = result.error || 'Analysis failed';
			}
		} catch (error) {
			analysisError = error instanceof Error ? error.message : 'Network error';
		} finally {
			analyzingCaseId = null;
		}
	}

	function closeAnalysis() {
		analysisResult = null;
		analysisError = null;
	}

	// Keyboard shortcuts
	function handleKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

		if (e.key === 'Escape') {
			if (showNewCaseModal) { closeModal(); return; }
			if (analysisResult || analysisError) { closeAnalysis(); return; }
			if (showViewModal) { showViewModal = false; viewCaseId = null; return; }
		}

		if (isInput) return;

		if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openNewCase(); }
		if (e.key === '1') { e.preventDefault(); viewMode = 'list'; }
		if (e.key === '2') { e.preventDefault(); viewMode = 'cards'; }
		if (e.key === '3') { e.preventDefault(); viewMode = 'rich'; }
		if (e.key === '/') { e.preventDefault(); searchInputEl?.focus(); }
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>Cases | YoRHa Legal AI</title>
</svelte:head>

<div class="cases-page">
	<!-- Header -->
	<header class="cases-header">
		<div class="cases-header-left">
			<div class="cases-icon-badge">
				<Icon name="briefcase" />
			</div>
			<div>
				<h1 class="cases-title">Cases</h1>
				<p class="cases-subtitle">
					{stats.total} loaded
					{#if hasActiveFilters}
						<span class="filter-active-dot"></span> filtered
					{/if}
				</p>
			</div>
		</div>
		<div class="cases-header-right">
			<!-- View Mode Toggle -->
			<div class="view-mode-toggle">
				<button
					onclick={() => (viewMode = 'list')}
					class="vm-btn"
					class:active={viewMode === 'list'}
					title="List view (1)"
				>
					<Icon name="list" />
				</button>
				<button
					onclick={() => (viewMode = 'cards')}
					class="vm-btn"
					class:active={viewMode === 'cards'}
					title="Card view (2)"
				>
					<Icon name="layout-grid" />
				</button>
				<button
					onclick={() => (viewMode = 'rich')}
					class="vm-btn"
					class:active={viewMode === 'rich'}
					title="Rich view (3)"
				>
					<Icon name="gallery-horizontal-end" />
				</button>
			</div>
			<button class="cases-new-btn" onclick={openNewCase}>
				<Icon name="plus" />
				New Case
			</button>
		</div>
	</header>

	<!-- Stats Row -->
	<div class="stats-row">
		<div class="stat-chip stat-open">
			<span class="stat-value">{stats.open}</span>
			<span class="stat-label">Open</span>
		</div>
		<div class="stat-chip stat-inprogress">
			<span class="stat-value">{stats.inProgress}</span>
			<span class="stat-label">In Progress</span>
		</div>
		<div class="stat-chip stat-pending">
			<span class="stat-value">{stats.pendingReview}</span>
			<span class="stat-label">Review</span>
		</div>
		<div class="stat-chip stat-high">
			<span class="stat-value">{stats.critical + stats.high}</span>
			<span class="stat-label">High+</span>
		</div>
		<div class="stat-chip stat-closed">
			<span class="stat-value">{stats.closed}</span>
			<span class="stat-label">Closed</span>
		</div>
	</div>

	<!-- Filters Bar -->
	<div class="cs-filter-bar">
		<div class="cs-filter-row">
			<div class="cs-search-wrap">
				<SearchBar
					placeholder="Search cases by title, number, area..."
					value={searchQuery}
					onsearch={(q) => { searchQuery = q; applyFilters(); }}
				/>
			</div>
			<select
				bind:value={statusFilter}
				onchange={applyFilters}
				class="cs-select"
			>
				<option value="all">All Status</option>
				<option value="open">Open</option>
				<option value="in_progress">In Progress</option>
				<option value="pending_review">Pending Review</option>
				<option value="closed">Closed</option>
				<option value="archived">Archived</option>
			</select>
			<select
				bind:value={priorityFilter}
				onchange={applyFilters}
				class="cs-select"
			>
				<option value="">All Priorities</option>
				<option value="critical">Critical</option>
				<option value="urgent">Urgent</option>
				<option value="high">High</option>
				<option value="medium">Medium</option>
				<option value="low">Low</option>
			</select>
			{#if hasActiveFilters}
				<button onclick={() => { statusFilter = 'all'; priorityFilter = ''; searchQuery = ''; goto('/cases'); }} class="cs-clear-filters-btn">
					<Icon name="x" />
					Clear
				</button>
			{/if}
			{#if searchQuery && filteredCases.length !== (data.cases ?? []).length}
				<span class="cs-match-count">{filteredCases.length} / {(data.cases ?? []).length} matched</span>
			{/if}
		</div>
	</div>

	<!-- Bulk Actions Bar -->
	{#if showBulkActions}
		<div class="cs-bulk-bar">
			<div class="cs-bulk-row">
				<span class="cs-bulk-label">
					{selectedCases.size} case(s) selected
				</span>
				<form method="POST" action="?/updateStatus" use:enhance class="cs-bulk-form">
					{#each Array.from(selectedCases) as caseId}
						<input type="hidden" name="caseIds" value={caseId} />
					{/each}
					<select name="status" bind:value={bulkStatus} class="cs-bulk-select">
						<option value="">Update Status...</option>
						<option value="open">Open</option>
						<option value="in_progress">In Progress</option>
						<option value="pending_review">Pending Review</option>
						<option value="closed">Closed</option>
					</select>
					<button type="submit" disabled={!bulkStatus} class="cs-bulk-submit">
						Update
					</button>
					<button type="button" onclick={clearSelection} class="cs-bulk-clear">
						Clear
					</button>
				</form>
			</div>
		</div>
	{/if}

	<!-- Cases Display -->
	<div class="cs-list-area">
		<div class="cs-container">
			{#if data.databaseStatus && !data.databaseStatus.available}
				<div class="cs-alert cs-alert-warning">
					Database unavailable — showing cached or empty results. {data.databaseStatus.error ?? ''}
				</div>
			{/if}

			{#if form?.success}
				<div class="cs-alert cs-alert-success">
					{form.message}
				</div>
			{/if}

			{#if !data.cases}
				<!-- Loading skeleton -->
				<div class="cs-grid">
					{#each Array(6) as _}
						<div class="cs-card">
							<Skeleton variant="text" width="70%" height="1.25em" />
							<div class="cs-skel-row"><Skeleton variant="text" width="40%" height="0.75em" /></div>
							<div class="cs-skel-row2"><Skeleton variant="text" width="100%" height="2em" /></div>
							<div class="cs-skel-badges">
								<Skeleton variant="rect" width="80px" height="24px" />
								<Skeleton variant="rect" width="60px" height="24px" />
							</div>
							<div class="cs-skel-row"><Skeleton variant="text" width="50%" height="0.75em" /></div>
						</div>
					{/each}
				</div>
			{:else if filteredCases.length === 0}
				<div class="cs-empty">
					<div class="cs-empty-icon"><Icon name="folder-open" /></div>
					<h2 class="cs-empty-title">No Cases Found</h2>
					<p class="cs-empty-desc">
						{#if hasActiveFilters}
							No cases match your current filters. Try adjusting your search criteria.
						{:else}
							Create your first case to get started.
						{/if}
					</p>
					{#if !hasActiveFilters}
						<button onclick={openNewCase} class="cs-empty-cta">
							<Icon name="plus" /> Create First Case
						</button>
					{/if}
				</div>

			<!-- LIST VIEW -->
			{:else if viewMode === 'list'}
				<div class="cs-table-wrap">
					<table class="cs-table">
						<thead>
							<tr>
								<th class="cs-th-check">
									<input type="checkbox" class="cs-checkbox-head"
										onchange={(e) => {
											const target = e.target as HTMLInputElement;
											if (target.checked) {
												filteredCases.forEach((c: any) => selectedCases.add(c.id));
											} else {
												selectedCases.clear();
											}
										}}
									/>
								</th>
								<th>Title</th>
								<th>Case No.</th>
								<th>Status</th>
								<th>Priority</th>
								<th>Practice Area</th>
								<th>Updated</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredCases as caseItem (caseItem.id)}
								<tr class="cs-row" class:cs-row-selected={selectedCases.has(caseItem.id)}>
									<td>
										<input
											type="checkbox"
											checked={selectedCases.has(caseItem.id)}
											onchange={() => toggleCaseSelection(caseItem.id)}
											class="cs-checkbox"
										/>
									</td>
									<td>
										<button
											onclick={() => openCaseDetail(caseItem.id)}
											class="cs-row-title"
										>
											{caseItem.title}
											{#if isFictional(caseItem)}
												<span class="cs-fictional-badge">SIM</span>
											{/if}
										</button>
									</td>
									<td class="cs-row-mono">{caseItem.caseNumber ?? '—'}</td>
									<td>
										<span class="cs-badge {statusClass(caseItem.status)}">
											{caseItem.status ? caseItem.status.replace('_', ' ') : 'unknown'}
										</span>
									</td>
									<td>
										<span class="cs-badge {priorityClass(caseItem.priority)}">
											{caseItem.priority || 'normal'}
										</span>
									</td>
									<td class="cs-row-dim">{caseItem.practiceArea ?? '—'}</td>
									<td class="cs-row-dim">{formatDate(caseItem.updatedAt)}</td>
									<td class="cs-row-actions">
										<button
											onclick={() => analyzeCase(caseItem.id, caseItem.title ?? 'Untitled')}
											class="cs-action-icon"
											title="AI Analysis"
											disabled={analyzingCaseId === caseItem.id}
										>
											{#if analyzingCaseId === caseItem.id}
												<Icon name="loader-circle" />
											{:else}
												<Icon name="brain" />
											{/if}
										</button>
										<button
											onclick={() => openCaseDetail(caseItem.id)}
											class="cs-action-icon"
											title="Quick view"
										>
											<Icon name="eye" />
										</button>
										<a
											href="/cases/{caseItem.id}"
											class="cs-action-icon"
											title="Open full case"
										>
											<Icon name="arrow-right" />
										</a>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

			<!-- CARDS VIEW -->
			{:else if viewMode === 'cards'}
				<div class="cs-grid">
					{#each filteredCases as caseItem (caseItem.id)}
						<div class="cs-card" class:cs-card-selected={selectedCases.has(caseItem.id)}>
							<!-- Selection Checkbox -->
							<input
								type="checkbox"
								checked={selectedCases.has(caseItem.id)}
								onchange={() => toggleCaseSelection(caseItem.id)}
								class="cs-checkbox cs-checkbox-card"
							/>

							{#if isFictional(caseItem)}
								<span class="cs-fictional-badge cs-fictional-corner">SIM</span>
							{/if}

							<!-- Case Header -->
							<button
								onclick={() => openCaseDetail(caseItem.id)}
								class="cs-card-body"
							>
								<h3 class="cs-card-title">
									{caseItem.title}
								</h3>
								{#if caseItem.caseNumber}
									<p class="cs-card-number">Case #{caseItem.caseNumber}</p>
								{/if}
								{#if caseItem.description}
									<p class="cs-card-desc">
										{caseItem.description}
									</p>
								{/if}

								<!-- Badges -->
								<div class="cs-badge-row">
									<span class="cs-badge {statusClass(caseItem.status)}">
										{caseItem.status ? caseItem.status.replace('_', ' ') : 'unknown'}
									</span>
									<span class="cs-badge {priorityClass(caseItem.priority)}">
										{caseItem.priority || 'normal'}
									</span>
								</div>

								<!-- Metadata -->
								<div class="cs-card-meta">
									{#if caseItem.practiceArea}
										<div class="cs-meta-item">
											<Icon name="scale" />
											{caseItem.practiceArea}
										</div>
									{/if}
									{#if caseItem.jurisdiction}
										<div class="cs-meta-item">
											<Icon name="landmark" />
											{caseItem.jurisdiction}
										</div>
									{/if}
									{#if caseItem.updatedAt}
										<div class="cs-meta-item">
											<Icon name="clock" />
											{formatDate(caseItem.updatedAt)}
										</div>
									{/if}
								</div>
							</button>

							<!-- Card Actions -->
							<div class="cs-card-actions">
								<button
									onclick={() => analyzeCase(caseItem.id, caseItem.title ?? 'Untitled')}
									class="cs-action-icon"
									title="AI Analysis"
									disabled={analyzingCaseId === caseItem.id}
								>
									{#if analyzingCaseId === caseItem.id}
										<Icon name="loader-circle" />
									{:else}
										<Icon name="brain" />
									{/if}
								</button>
								<a href="/cases/{caseItem.id}" class="cs-action-icon" title="Open full case">
									<Icon name="arrow-right" />
								</a>
							</div>
						</div>
					{/each}
				</div>

			<!-- RICH VIEW -->
			{:else if viewMode === 'rich'}
				<div class="cs-rich-grid">
					{#each richCaseCards as caseItem (caseItem.id)}
						<CaseCard
							{caseItem}
							onView={(id) => { viewCaseId = id; showViewModal = true; }}
							onEdit={(id) => goto(`/cases/${id}`)}
						/>
					{/each}
					{#if richCaseCards.length === 0}
						<p class="cs-empty-msg">No cases found</p>
					{/if}
				</div>
			{/if}

			<!-- Pagination -->
			{#if data.pagination && data.pagination.hasMore}
				<div class="cs-pagination">
					<a
						href="/cases?offset={data.pagination.offset + data.pagination.limit}&status={statusFilter}&priority={priorityFilter}&search={searchQuery}"
						class="cs-load-more"
					>
						Load More Cases
					</a>
				</div>
			{/if}
		</div>
	</div>

	<!-- Keyboard hints -->
	<div class="cs-kbd-hints">
		<span><kbd>N</kbd> New</span>
		<span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> View</span>
		<span><kbd>/</kbd> Search</span>
	</div>
</div>

<!-- New Case Modal -->
{#if showNewCaseModal}
	<div class="cs-modal-overlay" onclick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
		<div class="cs-modal">
			<div class="cs-modal-header">
				<h2 class="cs-modal-title">Create New Case</h2>
				<button type="button" class="cs-modal-close" onclick={closeModal}>
					<Icon name="x" />
				</button>
			</div>

			<form method="POST" action="?/create" use:enhance class="cs-modal-form">
				{#if form?.error}
					<div class="cs-alert cs-alert-error">
						{form.error}
					</div>
				{/if}

				<div class="cs-field">
					<label for="title" class="cs-label">
						Case Title <span class="cs-required">*</span>
					</label>
					<input type="text" id="title" name="title" required class="cs-input" placeholder="e.g., State v. Smith" />
				</div>

				<div class="cs-field">
					<label for="description" class="cs-label">
						Description <span class="cs-required">*</span>
					</label>
					<textarea id="description" name="description" required rows="4" class="cs-textarea" placeholder="Brief overview of the case..."></textarea>
				</div>

				<div class="cs-field-grid">
					<div class="cs-field">
						<label for="priority" class="cs-label">Priority</label>
						<select id="priority" name="priority" class="cs-select">
							<option value="low">Low</option>
							<option value="medium" selected>Medium</option>
							<option value="high">High</option>
							<option value="urgent">Urgent</option>
							<option value="critical">Critical</option>
						</select>
					</div>
					<div class="cs-field">
						<label for="caseNumber" class="cs-label">Case Number</label>
						<input type="text" id="caseNumber" name="caseNumber" class="cs-input" placeholder="e.g., 2026-CR-0042" />
					</div>
				</div>

				<div class="cs-field-grid">
					<div class="cs-field">
						<label for="practiceArea" class="cs-label">Practice Area</label>
						<input type="text" id="practiceArea" name="practiceArea" class="cs-input" placeholder="e.g., Criminal Law" />
					</div>
					<div class="cs-field">
						<label for="jurisdiction" class="cs-label">Jurisdiction</label>
						<input type="text" id="jurisdiction" name="jurisdiction" class="cs-input" placeholder="e.g., Federal District Court" />
					</div>
				</div>

				<div class="cs-modal-actions">
					<button type="button" onclick={closeModal} class="cs-cancel-btn">Cancel</button>
					<button type="submit" class="cs-submit-btn">Create Case</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- AI Analysis Modal -->
{#if analysisResult || analysisError}
	<div class="cs-modal-overlay" onclick={closeAnalysis}>
		<div class="cs-analysis-modal" onclick={(e) => e.stopPropagation()}>
			<div class="cs-modal-header">
				<div class="cs-analysis-title">
					<Icon name="brain" />
					<span>AI Case Analysis</span>
				</div>
				<button type="button" class="cs-modal-close" onclick={closeAnalysis}>
					<Icon name="x" />
				</button>
			</div>

			<div class="cs-analysis-body">
				{#if analysisError}
					<div class="cs-alert cs-alert-error">
						<Icon name="triangle-alert" />
						<div>
							<strong>Analysis failed</strong>
							<p>{analysisError}</p>
						</div>
					</div>
					<button
						class="cs-retry-btn"
						onclick={() => { if (lastAnalyzedCase) analyzeCase(lastAnalyzedCase.id, lastAnalyzedCase.title); }}
					>
						<Icon name="refresh-cw" /> Retry
					</button>
				{:else if analysisResult}
					<div class="cs-analysis-case-info">
						<span class="cs-analysis-label">Case:</span>
						<span class="cs-analysis-value">{analysisResult.caseTitle}</span>
					</div>
					<div class="cs-analysis-content">
						{#if typeof analysisResult.result === 'string'}
							<pre class="cs-analysis-text">{analysisResult.result}</pre>
						{:else if analysisResult.response}
							<pre class="cs-analysis-text">{JSON.stringify(analysisResult.response, null, 2)}</pre>
						{:else}
							<pre class="cs-analysis-text">{JSON.stringify(analysisResult, null, 2)}</pre>
						{/if}
					</div>
					<div class="cs-analysis-meta">
						<span>Provider: {analysisResult.provider || 'legal-orchestrator'}</span>
						<span>{new Date(analysisResult.timestamp || Date.now()).toLocaleString()}</span>
					</div>
				{/if}
			</div>

			<div class="cs-modal-footer">
				<button type="button" class="cs-cancel-btn" onclick={closeAnalysis}>Close</button>
				{#if analysisResult}
					<a href="/cases/{analysisResult.caseId}" class="cs-submit-btn">
						View Full Case <Icon name="arrow-right" />
					</a>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Case detail view modal -->
<CaseViewModal
	bind:open={showViewModal}
	caseId={viewCaseId}
	onClose={() => { showViewModal = false; viewCaseId = null; }}
	onEdit={(id) => goto(`/cases/${id}?edit=true`)}
/>

<style>
	/* ── Page Layout — Theme-Aware ── */
	.cases-page {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background: var(--t-bg, #0e0d0b);
		margin: -2.5rem;
		color: var(--t-text, rgba(212, 199, 163, 0.85));
	}

	.cases-page :global(h1),
	.cases-page :global(h2),
	.cases-page :global(h3),
	.cases-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.cases-page :global(a) { color: inherit; border-bottom: none; }
	.cases-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.cases-page :global(input), .cases-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.cases-page :global([class*="panel"]), .cases-page :global(.card) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	/* ── Header ── */
	.cases-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid var(--t-border, rgba(212, 199, 163, 0.08));
		background: var(--t-bg-elevated, rgba(0, 0, 0, 0.4));
		backdrop-filter: blur(8px);
	}

	.cases-header-left {
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
	}

	.cases-header-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.cases-icon-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--t-accent, #34d399) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--t-accent, #34d399) 25%, transparent);
		color: var(--t-accent, #34d399);
		flex-shrink: 0;
		margin-top: 0.125rem;
	}

	.cases-title {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--t-text, rgba(212, 199, 163, 0.95));
		margin: 0;
		line-height: 1.3;
	}

	.cases-subtitle {
		font-size: 0.75rem;
		color: var(--t-text-muted, rgba(212, 199, 163, 0.4));
		margin-top: 0.125rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.filter-active-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--t-accent, #34d399);
	}

	.cases-new-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--t-accent, #34d399);
		background: color-mix(in srgb, var(--t-accent, #34d399) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--t-accent, #34d399) 30%, transparent);
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.cases-new-btn:hover {
		background: color-mix(in srgb, var(--t-accent, #34d399) 20%, transparent);
		border-color: color-mix(in srgb, var(--t-accent, #34d399) 45%, transparent);
	}

	/* ── View Mode Toggle ── */
	.view-mode-toggle {
		display: flex;
		border: 1px solid var(--t-border, rgba(212, 199, 163, 0.15));
		border-radius: 0.375rem;
		overflow: hidden;
	}

	.vm-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		background: transparent;
		border: none;
		border-right: 1px solid var(--t-border, rgba(212, 199, 163, 0.1));
		color: var(--t-text-muted, rgba(212, 199, 163, 0.35));
		cursor: pointer;
		transition: all 0.15s;
	}

	.vm-btn:last-child { border-right: none; }
	.vm-btn:hover { color: var(--t-text, rgba(212, 199, 163, 0.8)); background: color-mix(in srgb, var(--t-text, #fff) 5%, transparent); }
	.vm-btn.active { color: var(--t-accent, #34d399); background: color-mix(in srgb, var(--t-accent, #34d399) 10%, transparent); }

	/* ── Stats Row ── */
	.stats-row {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		border-bottom: 1px solid var(--t-border, rgba(212, 199, 163, 0.08));
		background: color-mix(in srgb, var(--t-bg-elevated, #000) 50%, transparent);
		overflow-x: auto;
	}

	.stat-chip {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		border-radius: 0.375rem;
		border: 1px solid;
		font-size: 0.75rem;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.stat-value { font-weight: 700; font-size: 0.875rem; }
	.stat-label { color: inherit; opacity: 0.7; }

	.stat-open { border-color: rgba(52, 211, 153, 0.3); color: #34d399; background: rgba(52, 211, 153, 0.06); }
	.stat-inprogress { border-color: rgba(96, 165, 250, 0.3); color: #60a5fa; background: rgba(96, 165, 250, 0.06); }
	.stat-pending { border-color: rgba(251, 191, 36, 0.3); color: #fbbf24; background: rgba(251, 191, 36, 0.06); }
	.stat-high { border-color: rgba(248, 113, 113, 0.3); color: #f87171; background: rgba(248, 113, 113, 0.06); }
	.stat-closed { border-color: rgba(148, 163, 184, 0.25); color: #94a3b8; background: rgba(148, 163, 184, 0.05); }

	/* ── Shared Inputs ── */
	.cs-input {
		width: 100%;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		border: 1px solid var(--t-border, rgba(212, 199, 163, 0.15));
		background: color-mix(in srgb, var(--t-bg, #000) 80%, transparent);
		color: var(--t-text, rgba(212, 199, 163, 0.9));
		font-size: 0.875rem;
		outline: none;
		transition: border-color 0.15s;
	}
	.cs-input::placeholder { color: var(--t-text-muted, rgba(212, 199, 163, 0.3)); }
	.cs-input:focus { border-color: var(--t-accent, rgba(52, 211, 153, 0.5)); }

	.cs-select {
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		border: 1px solid var(--t-border, rgba(212, 199, 163, 0.15));
		background: color-mix(in srgb, var(--t-bg, #000) 80%, transparent);
		color: var(--t-text, rgba(212, 199, 163, 0.9));
		font-size: 0.875rem;
		outline: none;
		transition: border-color 0.15s;
	}
	.cs-select:focus { border-color: var(--t-accent, rgba(52, 211, 153, 0.5)); }

	.cs-textarea {
		width: 100%;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		border: 1px solid var(--t-border, rgba(212, 199, 163, 0.15));
		background: color-mix(in srgb, var(--t-bg, #000) 80%, transparent);
		color: var(--t-text, rgba(212, 199, 163, 0.9));
		font-size: 0.875rem;
		outline: none;
		resize: none;
		transition: border-color 0.15s;
	}
	.cs-textarea:focus { border-color: var(--t-accent, rgba(52, 211, 153, 0.5)); }

	/* ── Filter Bar ── */
	.cs-filter-bar {
		border-bottom: 1px solid var(--t-border, rgba(212, 199, 163, 0.08));
		background: color-mix(in srgb, var(--t-bg-elevated, #000) 60%, transparent);
		padding: 0.75rem 1.5rem;
	}

	.cs-filter-row {
		max-width: 80rem;
		margin: 0 auto;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
	}

	.cs-search-wrap {
		flex: 1;
		min-width: 200px;
	}

	.cs-clear-filters-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.375rem 0.75rem;
		border-radius: 0.375rem;
		border: 1px solid var(--t-border, rgba(212, 199, 163, 0.15));
		color: var(--t-text-muted, rgba(212, 199, 163, 0.5));
		font-size: 0.8125rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.cs-clear-filters-btn:hover { color: var(--t-text, rgba(212, 199, 163, 0.9)); border-color: var(--t-text-muted); }

	.cs-match-count {
		font-size: 0.75rem;
		color: var(--t-text-muted, rgba(212, 199, 163, 0.45));
		white-space: nowrap;
	}

	/* ── Bulk Actions ── */
	.cs-bulk-bar {
		border-bottom: 1px solid rgba(251, 191, 36, 0.25);
		background: rgba(251, 191, 36, 0.06);
		padding: 0.75rem 1.5rem;
	}

	.cs-bulk-row {
		max-width: 80rem;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.cs-bulk-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgba(251, 191, 36, 0.9);
	}

	.cs-bulk-form { display: flex; gap: 0.5rem; }

	.cs-bulk-select {
		padding: 0.25rem 0.75rem;
		border-radius: 0.375rem;
		border: 1px solid rgba(251, 191, 36, 0.3);
		background: rgba(251, 191, 36, 0.1);
		color: rgba(251, 191, 36, 0.9);
		font-size: 0.875rem;
	}

	.cs-bulk-submit {
		padding: 0.25rem 1rem;
		border-radius: 0.375rem;
		background: rgba(251, 191, 36, 0.15);
		border: 1px solid rgba(251, 191, 36, 0.3);
		color: rgba(251, 191, 36, 0.9);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
	}
	.cs-bulk-submit:hover { background: rgba(251, 191, 36, 0.25); }
	.cs-bulk-submit:disabled { opacity: 0.5; cursor: not-allowed; }

	.cs-bulk-clear {
		padding: 0.25rem 1rem;
		border-radius: 0.375rem;
		border: 1px solid var(--t-border, rgba(212, 199, 163, 0.15));
		background: transparent;
		color: var(--t-text-muted, rgba(212, 199, 163, 0.6));
		font-size: 0.875rem;
		cursor: pointer;
		transition: background 0.15s;
	}
	.cs-bulk-clear:hover { background: color-mix(in srgb, var(--t-text, #fff) 5%, transparent); }

	/* ── Alerts ── */
	.cs-alert {
		margin-bottom: 1rem;
		border-radius: 0.5rem;
		padding: 0.75rem 1rem;
		font-size: 0.875rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.cs-alert-warning { border: 1px solid rgba(251, 191, 36, 0.25); background: rgba(251, 191, 36, 0.06); color: rgba(251, 191, 36, 0.9); }
	.cs-alert-success { border: 1px solid rgba(52, 211, 153, 0.3); background: rgba(52, 211, 153, 0.06); color: rgba(52, 211, 153, 0.9); }
	.cs-alert-error { border: 1px solid rgba(248, 113, 113, 0.3); background: rgba(248, 113, 113, 0.06); color: rgba(248, 113, 113, 0.9); }

	/* ── Cases List Area ── */
	.cs-list-area {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
	}

	.cs-container {
		max-width: 80rem;
		margin: 0 auto;
	}

	/* ── LIST VIEW: Table ── */
	.cs-table-wrap {
		overflow-x: auto;
		border: 1px solid var(--t-border, rgba(212, 199, 163, 0.1));
		border-radius: 0.5rem;
	}

	.cs-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.cs-table thead {
		background: var(--t-bg-elevated, rgba(0, 0, 0, 0.3));
		border-bottom: 1px solid var(--t-border, rgba(212, 199, 163, 0.1));
	}

	.cs-table th {
		text-align: left;
		padding: 0.625rem 0.75rem;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--t-text-muted, rgba(212, 199, 163, 0.45));
		white-space: nowrap;
	}

	.cs-th-check { width: 2.5rem; text-align: center; }

	.cs-row {
		border-bottom: 1px solid var(--t-border, rgba(212, 199, 163, 0.06));
		transition: background 0.1s;
	}

	.cs-row:hover { background: color-mix(in srgb, var(--t-accent, #34d399) 3%, transparent); }
	.cs-row-selected { background: color-mix(in srgb, var(--t-accent, #34d399) 5%, transparent); }

	.cs-table td {
		padding: 0.75rem;
		vertical-align: middle;
	}

	.cs-row-title {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: none;
		border: none;
		color: var(--t-text, rgba(212, 199, 163, 0.9));
		font-weight: 500;
		font-size: 0.875rem;
		cursor: pointer;
		padding: 0;
		text-align: left;
		transition: color 0.15s;
	}
	.cs-row-title:hover { color: var(--t-accent, #34d399); }

	.cs-row-mono { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: var(--t-text-muted); }
	.cs-row-dim { font-size: 0.8125rem; color: var(--t-text-muted); }

	.cs-row-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.cs-action-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 0.25rem;
		color: var(--t-text-muted, rgba(212, 199, 163, 0.4));
		cursor: pointer;
		transition: all 0.15s;
		text-decoration: none;
		background: none;
		border: none;
		padding: 0;
	}
	.cs-action-icon:hover { color: var(--t-accent, #34d399); background: color-mix(in srgb, var(--t-accent, #34d399) 8%, transparent); }
	.cs-action-icon:disabled { opacity: 0.4; cursor: not-allowed; }

	.cs-checkbox, .cs-checkbox-head {
		width: 1rem;
		height: 1rem;
		border-radius: 0.25rem;
		border: 1px solid var(--t-border, rgba(212, 199, 163, 0.2));
		background: color-mix(in srgb, var(--t-bg, #000) 80%, transparent);
		cursor: pointer;
		accent-color: var(--t-accent, #34d399);
	}

	/* ── Fictional Badge ── */
	.cs-fictional-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.0625rem 0.375rem;
		border-radius: 0.25rem;
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		background: rgba(139, 92, 246, 0.15);
		color: #a78bfa;
		border: 1px solid rgba(139, 92, 246, 0.3);
	}

	.cs-fictional-corner {
		position: absolute;
		top: 0.5rem;
		right: 2.25rem;
	}

	/* ── CARDS VIEW: Grid ── */
	.cs-grid {
		display: grid;
		gap: 1rem;
	}
	@media (min-width: 768px) { .cs-grid { grid-template-columns: repeat(2, 1fr); } }
	@media (min-width: 1280px) { .cs-grid { grid-template-columns: repeat(3, 1fr); } }

	.cs-card {
		position: relative;
		border-radius: 0.75rem;
		border: 1px solid var(--t-border, rgba(212, 199, 163, 0.08));
		background: var(--t-panel, rgba(0, 0, 0, 0.25));
		padding: 1.25rem;
		transition: all 0.2s ease;
	}
	.cs-card:hover {
		border-color: color-mix(in srgb, var(--t-accent, #34d399) 30%, transparent);
		background: color-mix(in srgb, var(--t-panel, #000) 90%, var(--t-accent, #34d399));
	}
	.cs-card-selected { border-color: color-mix(in srgb, var(--t-accent, #34d399) 40%, transparent); }

	.cs-checkbox-card {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
	}

	.cs-card-body {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		cursor: pointer;
		color: inherit;
		padding: 0;
	}

	.cs-card-title {
		font-size: 1.0625rem;
		font-weight: 600;
		color: var(--t-accent, rgba(52, 211, 153, 0.9));
		margin-bottom: 0.5rem;
		padding-right: 2rem;
		transition: color 0.15s;
	}
	.cs-card:hover .cs-card-title { color: var(--t-accent, rgba(52, 211, 153, 1)); }

	.cs-card-number {
		font-size: 0.75rem;
		color: var(--t-text-muted, rgba(212, 199, 163, 0.35));
		margin-bottom: 0.75rem;
	}

	.cs-card-desc {
		font-size: 0.875rem;
		color: var(--t-text-muted, rgba(212, 199, 163, 0.55));
		margin-bottom: 1rem;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.cs-card-actions {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--t-border, rgba(212, 199, 163, 0.06));
		justify-content: flex-end;
	}

	/* ── Badges ── */
	.cs-badge-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.cs-badge {
		display: inline-block;
		padding: 0.125rem 0.5rem;
		border-radius: 0.25rem;
		border: 1px solid;
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: capitalize;
	}

	.cs-badge-open { border-color: rgba(52, 211, 153, 0.4); background: rgba(52, 211, 153, 0.12); color: rgba(52, 211, 153, 0.9); }
	.cs-badge-inprogress { border-color: rgba(96, 165, 250, 0.4); background: rgba(96, 165, 250, 0.12); color: rgba(96, 165, 250, 0.9); }
	.cs-badge-pending { border-color: rgba(251, 191, 36, 0.4); background: rgba(251, 191, 36, 0.12); color: rgba(251, 191, 36, 0.9); }
	.cs-badge-closed { border-color: rgba(148, 163, 184, 0.3); background: rgba(148, 163, 184, 0.1); color: rgba(148, 163, 184, 0.8); }
	.cs-badge-archived { border-color: rgba(107, 114, 128, 0.3); background: rgba(107, 114, 128, 0.1); color: rgba(107, 114, 128, 0.7); }
	.cs-badge-critical { border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.12); color: rgba(239, 68, 68, 0.9); }
	.cs-badge-urgent { border-color: rgba(249, 115, 22, 0.4); background: rgba(249, 115, 22, 0.12); color: rgba(249, 115, 22, 0.9); }
	.cs-badge-high { border-color: rgba(234, 179, 8, 0.4); background: rgba(234, 179, 8, 0.12); color: rgba(234, 179, 8, 0.9); }
	.cs-badge-medium { border-color: rgba(96, 165, 250, 0.4); background: rgba(96, 165, 250, 0.12); color: rgba(96, 165, 250, 0.9); }
	.cs-badge-low { border-color: rgba(52, 211, 153, 0.4); background: rgba(52, 211, 153, 0.12); color: rgba(52, 211, 153, 0.9); }
	.cs-badge-default { border-color: rgba(148, 163, 184, 0.3); background: rgba(148, 163, 184, 0.1); color: rgba(148, 163, 184, 0.7); }

	/* ── Card Metadata ── */
	.cs-card-meta {
		font-size: 0.75rem;
		color: var(--t-text-muted, rgba(212, 199, 163, 0.35));
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.cs-meta-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	/* ── RICH VIEW: Grid ── */
	.cs-rich-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
		gap: 1.25rem;
	}

	.cs-empty-msg {
		color: var(--t-text-muted);
		text-align: center;
		padding: 2rem;
		grid-column: 1 / -1;
	}

	/* ── Skeleton placeholders ── */
	.cs-skel-row { margin-top: 0.5rem; }
	.cs-skel-row2 { margin-top: 0.75rem; }
	.cs-skel-badges {
		margin-top: 0.75rem;
		display: flex;
		gap: 0.5rem;
	}

	/* ── Empty State ── */
	.cs-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 5rem 1.5rem;
		text-align: center;
	}
	.cs-empty-icon {
		font-size: 2.5rem;
		margin-bottom: 1rem;
		color: var(--t-text-muted);
		opacity: 0.5;
	}
	.cs-empty-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--t-text, rgba(212, 199, 163, 0.8));
		margin-bottom: 0.5rem;
	}
	.cs-empty-desc {
		color: var(--t-text-muted, rgba(212, 199, 163, 0.4));
		margin-bottom: 1.5rem;
		font-size: 0.875rem;
	}
	.cs-empty-cta {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--t-accent, #34d399) 15%, transparent);
		border: 1px solid color-mix(in srgb, var(--t-accent, #34d399) 30%, transparent);
		color: var(--t-accent, rgba(52, 211, 153, 0.95));
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}
	.cs-empty-cta:hover { background: color-mix(in srgb, var(--t-accent, #34d399) 25%, transparent); }

	/* ── Pagination ── */
	.cs-pagination {
		margin-top: 2rem;
		text-align: center;
	}
	.cs-load-more {
		display: inline-block;
		padding: 0.5rem 1.5rem;
		border-radius: 0.375rem;
		border: 1px solid color-mix(in srgb, var(--t-accent, #34d399) 30%, transparent);
		background: color-mix(in srgb, var(--t-accent, #34d399) 10%, transparent);
		color: var(--t-accent, rgba(52, 211, 153, 0.9));
		font-size: 0.875rem;
		font-weight: 500;
		text-decoration: none;
		transition: background 0.15s;
	}
	.cs-load-more:hover { background: color-mix(in srgb, var(--t-accent, #34d399) 20%, transparent); }

	/* ── Keyboard Hints ── */
	.cs-kbd-hints {
		display: flex;
		gap: 1rem;
		padding: 0.5rem 1.5rem;
		border-top: 1px solid var(--t-border, rgba(212, 199, 163, 0.06));
		background: var(--t-bg-elevated, rgba(0, 0, 0, 0.3));
		font-size: 0.7rem;
		color: var(--t-text-muted, rgba(212, 199, 163, 0.25));
	}

	.cs-kbd-hints kbd {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.25rem;
		height: 1.25rem;
		padding: 0 0.25rem;
		border: 1px solid var(--t-border, rgba(212, 199, 163, 0.15));
		border-radius: 0.25rem;
		font-family: inherit;
		font-size: 0.65rem;
		color: var(--t-text-muted);
		background: color-mix(in srgb, var(--t-bg, #000) 80%, transparent);
		margin-right: 0.25rem;
	}

	/* ── Modal (shared) ── */
	.cs-modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
		padding: 1rem;
	}

	.cs-modal {
		width: 100%;
		max-width: 42rem;
		border-radius: 0.75rem;
		border: 1px solid var(--t-border, rgba(212, 199, 163, 0.1));
		background: var(--t-bg-elevated, rgba(19, 21, 25, 0.98));
		box-shadow: 0 24px 80px -20px rgba(0, 0, 0, 0.6);
	}

	.cs-analysis-modal {
		width: 100%;
		max-width: 56rem;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		border-radius: 0.75rem;
		border: 1px solid var(--t-border, rgba(212, 199, 163, 0.1));
		background: var(--t-bg-elevated, rgba(19, 21, 25, 0.98));
		box-shadow: 0 24px 80px -20px rgba(0, 0, 0, 0.6);
	}

	.cs-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid var(--t-border, rgba(212, 199, 163, 0.08));
		padding: 1rem 1.5rem;
	}

	.cs-modal-title {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--t-text, rgba(212, 199, 163, 0.95));
		margin: 0;
	}

	.cs-modal-close {
		color: var(--t-text-muted);
		cursor: pointer;
		border-radius: 0.25rem;
		transition: color 0.15s;
	}
	.cs-modal-close:hover { color: var(--t-text); }

	.cs-modal-form {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.cs-field { display: flex; flex-direction: column; }

	.cs-field-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.cs-label {
		font-size: 0.875rem;
		font-weight: 500;
		margin-bottom: 0.5rem;
		color: var(--t-text-muted, rgba(212, 199, 163, 0.7));
	}

	.cs-required { color: rgba(248, 113, 113, 0.8); }

	.cs-modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding-top: 1rem;
	}

	.cs-modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		border-top: 1px solid var(--t-border, rgba(212, 199, 163, 0.08));
	}

	.cs-cancel-btn {
		padding: 0.5rem 1.5rem;
		border-radius: 0.375rem;
		border: 1px solid var(--t-border, rgba(212, 199, 163, 0.15));
		background: transparent;
		color: var(--t-text-muted, rgba(212, 199, 163, 0.6));
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}
	.cs-cancel-btn:hover {
		background: color-mix(in srgb, var(--t-text, #fff) 5%, transparent);
		color: var(--t-text, rgba(212, 199, 163, 0.8));
	}

	.cs-submit-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1.5rem;
		border-radius: 0.375rem;
		background: color-mix(in srgb, var(--t-accent, #34d399) 15%, transparent);
		border: 1px solid color-mix(in srgb, var(--t-accent, #34d399) 30%, transparent);
		color: var(--t-accent, rgba(52, 211, 153, 0.95));
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
		text-decoration: none;
	}
	.cs-submit-btn:hover { background: color-mix(in srgb, var(--t-accent, #34d399) 25%, transparent); }

	/* ── Analysis Modal Specific ── */
	.cs-analysis-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1rem;
		font-weight: 700;
		color: var(--t-accent, #34d399);
	}

	.cs-analysis-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.cs-analysis-case-info {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--t-bg, #000) 80%, transparent);
		border: 1px solid var(--t-border);
		border-radius: 0.375rem;
	}

	.cs-analysis-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--t-text-muted); }
	.cs-analysis-value { font-size: 0.9rem; font-weight: 600; color: var(--t-text); }

	.cs-analysis-content {
		background: color-mix(in srgb, var(--t-bg, #000) 80%, transparent);
		border: 1px solid var(--t-border);
		border-radius: 0.375rem;
		overflow: hidden;
	}

	.cs-analysis-text {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.825rem;
		line-height: 1.6;
		color: var(--t-text);
		white-space: pre-wrap;
		margin: 0;
		padding: 1rem;
	}

	.cs-analysis-meta {
		display: flex;
		gap: 1.5rem;
		font-size: 0.75rem;
		color: var(--t-text-muted);
	}

	.cs-retry-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		border: 1px solid var(--t-accent);
		background: color-mix(in srgb, var(--t-accent) 10%, transparent);
		color: var(--t-accent);
		border-radius: 0.375rem;
		font-size: 0.8125rem;
		cursor: pointer;
		transition: background 0.15s;
		align-self: flex-start;
	}
	.cs-retry-btn:hover { background: color-mix(in srgb, var(--t-accent) 20%, transparent); }
</style>
