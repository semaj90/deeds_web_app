<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { analytics } from '$lib/stores/analytics.svelte';
	import CaseViewModal from '$lib/components/cases/CaseViewModal.svelte';
	// Migrated to $effect
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// State for modal and filters (derived from initial data)
	let showNewCaseModal = $state(false);
	let statusFilter = $state('all');
	let priorityFilter = $state('');
	let searchQuery = $state('');
	let selectedCases = $state<Set<string>>(new Set());

	// Case detail view modal
	let viewCaseId = $state<string | null>(null);
	let showViewModal = $state(false);

	// Bulk action state
	let bulkStatus = $state<string>('');
	let showBulkActions = $derived(selectedCases.size > 0);

	// Auto-open modal if ?create=true (for /cases/create and /cases/new redirects)
	$effect(() => {

		// Initialize filters from URL on mount
		statusFilter = data.filters?.status ?? 'all';
		priorityFilter = data.filters?.priority || '';
		searchQuery = data.filters?.search || '';

		const urlParams = new URLSearchParams(window.location.search);
		if (urlParams.get('create') === 'true') {
			showNewCaseModal = true;
			// Clean URL
			window.history.replaceState({},
	'', '/cases');
		}

});

	function openNewCase() {
		showNewCaseModal = true;
	}

	function closeModal() {
		showNewCaseModal = false;
	}

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

	function clearSelection() {
		selectedCases.clear();
	}

	function applyFilters() {
		const params = new URLSearchParams();
		if (statusFilter !== 'all') params.set('status', statusFilter);
		if (priorityFilter) params.set('priority', priorityFilter);
		if (searchQuery) params.set('search', searchQuery);
		goto(`/cases?${params.toString()}`);
	}

	// Track case creation on form success
	$effect(() => {
		if (form?.success) {
			analytics.track('case_created', { message: form.message });
		}
	});

	function openCaseDetail(caseId: string) {
		viewCaseId = caseId;
		showViewModal = true;
	}

	async function navigateToCase(caseId: string) {
		await goto(`/cases/${caseId}`);
	}
</script>

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
				<p class="cases-subtitle">Manage your legal cases and investigations</p>
			</div>
		</div>
		<button class="cases-new-btn" onclick={openNewCase}>
			<Icon name="plus" />
			New Case
		</button>
	</header>

	<!-- Filters Bar -->
	<div class="cs-filter-bar">
		<div class="cs-filter-row">
			<div class="cs-search-wrap">
				<input
					type="text"
					placeholder="Search cases..."
					bind:value={searchQuery}
					onkeydown={(e) => e.key === 'Enter' && applyFilters()}
					class="cs-input"
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
			<button onclick={applyFilters} class="cs-apply-btn">
				Apply Filters
			</button>
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
					<button
						type="submit"
						disabled={!bulkStatus}
						class="cs-bulk-submit"
					>
						Update
					</button>
					<button type="button" onclick={clearSelection} class="cs-bulk-clear">
						Clear
					</button>
				</form>
			</div>
		</div>
	{/if}

	<!-- Cases List -->
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
			{:else if data.cases.length === 0}
				<div class="cs-empty">
					<div class="cs-empty-icon">📂</div>
					<h2 class="cs-empty-title">No Cases Found</h2>
					<p class="cs-empty-desc">
						{#if searchQuery || statusFilter !== 'all' || priorityFilter}
							No cases match your current filters. Try adjusting your search criteria.
						{:else}
							Create your first case to get started.
						{/if}
					</p>
					{#if !searchQuery && statusFilter === 'all' && !priorityFilter}
						<button onclick={openNewCase} class="cs-empty-cta">
							+ Create First Case
						</button>
					{/if}
				</div>
			{:else}
				<div class="cs-grid">
					{#each data.cases as caseItem (caseItem.id)}
						<div class="cs-card">
							<!-- Selection Checkbox -->
							<input
								type="checkbox"
								checked={selectedCases.has(caseItem.id)}
								onchange={() => toggleCaseSelection(caseItem.id)}
								class="cs-checkbox"
							/>

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
										<div>📋 {caseItem.practiceArea}</div>
									{/if}
									{#if caseItem.jurisdiction}
										<div>⚖️ {caseItem.jurisdiction}</div>
									{/if}
									{#if caseItem.updatedAt}
										<div>
											Updated: {new Date(caseItem.updatedAt).toLocaleDateString()}
										</div>
									{/if}
								</div>
							</button>
						</div>
					{/each}
				</div>

				<!-- Pagination -->
				{#if data.pagination && data.pagination.hasMore}
					<div class="cs-pagination">
						<a
							href="/cases?offset={data.pagination.offset + data.pagination.limit}&status={statusFilter}&priority={priorityFilter}&search={searchQuery}"
							class="cs-load-more"
						>
							Load More
						</a>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>

<!-- New Case Modal -->
{#if showNewCaseModal}
	<div class="cs-modal-overlay">
		<div class="cs-modal">
			<div class="cs-modal-header">
				<h2 class="cs-modal-title">Create New Case</h2>
			</div>

		<!-- Progressive Enhancement, Form with SSR fallback -->
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
					<input
						type="text"
						id="title"
						name="title"
						required
						class="cs-input"
						placeholder="e.g., State v. Smith"
					/>
				</div>

				<div class="cs-field">
					<label for="description" class="cs-label">
						Description <span class="cs-required">*</span>
					</label>
				<textarea
					id="description"
					name="description"
					required
					rows="4"
					class="cs-textarea"
					placeholder="Brief overview of the case..."
				></textarea>
				</div>

				<div class="cs-field-grid">
					<div class="cs-field">
						<label for="priority" class="cs-label">Priority</label>
					<select id="priority" name="priority" class="cs-select">
							<option value="low">Low</option>
							<option value="medium">Medium</option>
							<option value="high">High</option>
							<option value="urgent">Urgent</option>
							<option value="critical">Critical</option>
						</select>
					</div>

					<div class="cs-field">
						<label for="caseNumber" class="cs-label">Case Number</label>
					<input
						type="text"
						id="caseNumber"
						name="caseNumber"
						class="cs-input"
						placeholder="e.g., 2026-CR-0042"
					/>
					</div>
				</div>

				<div class="cs-field-grid">
					<div class="cs-field">
						<label for="practiceArea" class="cs-label">Practice Area</label>
					<input
						type="text"
						id="practiceArea"
						name="practiceArea"
						class="cs-input"
						placeholder="e.g., Criminal Law"
					/>
					</div>

					<div class="cs-field">
						<label for="jurisdiction" class="cs-label">Jurisdiction</label>
					<input
						type="text"
						id="jurisdiction"
						name="jurisdiction"
						class="cs-input"
						placeholder="e.g., Federal District Court"
					/>
					</div>
				</div>

				<div class="cs-modal-actions">
					<button type="button" onclick={closeModal} class="cs-cancel-btn">
						Cancel
					</button>
					<button type="submit" class="cs-submit-btn">
						Create Case
					</button>
				</div>
			</form>
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
	/* ── Page Layout ── */
	.cases-page {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background: #0e0d0b;
		margin: -2.5rem;
		color: rgba(212, 199, 163, 0.85);
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
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(8px);
	}

	.cases-header-left {
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
	}

	.cases-icon-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.5rem;
		background: linear-gradient(135deg, rgba(52, 211, 153, 0.15), rgba(96, 165, 250, 0.15));
		border: 1px solid rgba(52, 211, 153, 0.25);
		color: rgba(52, 211, 153, 0.9);
		flex-shrink: 0;
		margin-top: 0.125rem;
	}

	.cases-title {
		font-size: 1.25rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.95);
		margin: 0;
		line-height: 1.3;
	}

	.cases-subtitle {
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.4);
		margin-top: 0.125rem;
	}

	.cases-new-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: rgba(52, 211, 153, 0.95);
		background: rgba(52, 211, 153, 0.12);
		border: 1px solid rgba(52, 211, 153, 0.3);
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.cases-new-btn:hover {
		background: rgba(52, 211, 153, 0.2);
		border-color: rgba(52, 211, 153, 0.45);
	}

	/* ── Shared Inputs ── */
	.cs-input {
		width: 100%;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		border: 1px solid rgba(212, 199, 163, 0.15);
		background: rgba(0, 0, 0, 0.3);
		color: rgba(212, 199, 163, 0.9);
		font-size: 0.875rem;
		outline: none;
		transition: border-color 0.15s;
	}
	.cs-input::placeholder { color: rgba(212, 199, 163, 0.3); }
	.cs-input:focus { border-color: rgba(52, 211, 153, 0.5); }

	.cs-select {
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		border: 1px solid rgba(212, 199, 163, 0.15);
		background: rgba(0, 0, 0, 0.3);
		color: rgba(212, 199, 163, 0.9);
		font-size: 0.875rem;
		outline: none;
		transition: border-color 0.15s;
	}
	.cs-select:focus { border-color: rgba(52, 211, 153, 0.5); }

	.cs-textarea {
		width: 100%;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		border: 1px solid rgba(212, 199, 163, 0.15);
		background: rgba(0, 0, 0, 0.3);
		color: rgba(212, 199, 163, 0.9);
		font-size: 0.875rem;
		outline: none;
		resize: none;
		transition: border-color 0.15s;
	}
	.cs-textarea:focus { border-color: rgba(52, 211, 153, 0.5); }

	/* ── Filter Bar ── */
	.cs-filter-bar {
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
		background: rgba(0, 0, 0, 0.25);
		padding: 1rem 1.5rem;
	}

	.cs-filter-row {
		max-width: 80rem;
		margin: 0 auto;
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: center;
	}

	.cs-search-wrap {
		flex: 1;
		min-width: 200px;
	}

	.cs-apply-btn {
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		background: rgba(52, 211, 153, 0.15);
		border: 1px solid rgba(52, 211, 153, 0.3);
		color: rgba(52, 211, 153, 0.95);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
	}
	.cs-apply-btn:hover { background: rgba(52, 211, 153, 0.25); }

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

	.cs-bulk-form {
		display: flex;
		gap: 0.5rem;
	}

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
		border: 1px solid rgba(212, 199, 163, 0.15);
		background: transparent;
		color: rgba(212, 199, 163, 0.6);
		font-size: 0.875rem;
		cursor: pointer;
		transition: background 0.15s;
	}
	.cs-bulk-clear:hover { background: rgba(212, 199, 163, 0.06); }

	/* ── Alerts ── */
	.cs-alert {
		margin-bottom: 1rem;
		border-radius: 0.5rem;
		padding: 0.75rem 1rem;
		font-size: 0.875rem;
	}
	.cs-alert-warning {
		border: 1px solid rgba(251, 191, 36, 0.25);
		background: rgba(251, 191, 36, 0.06);
		color: rgba(251, 191, 36, 0.9);
	}
	.cs-alert-success {
		border: 1px solid rgba(52, 211, 153, 0.3);
		background: rgba(52, 211, 153, 0.06);
		color: rgba(52, 211, 153, 0.9);
	}
	.cs-alert-error {
		border: 1px solid rgba(248, 113, 113, 0.3);
		background: rgba(248, 113, 113, 0.06);
		color: rgba(248, 113, 113, 0.9);
	}

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

	/* ── Card Grid ── */
	.cs-grid {
		display: grid;
		gap: 1rem;
	}
	@media (min-width: 768px) {
		.cs-grid { grid-template-columns: repeat(2, 1fr); }
	}
	@media (min-width: 1280px) {
		.cs-grid { grid-template-columns: repeat(3, 1fr); }
	}

	/* ── Case Card ── */
	.cs-card {
		position: relative;
		border-radius: 0.75rem;
		border: 1px solid rgba(212, 199, 163, 0.08);
		background: rgba(0, 0, 0, 0.25);
		padding: 1.25rem;
		transition: all 0.2s ease;
	}
	.cs-card:hover {
		border-color: rgba(52, 211, 153, 0.3);
		background: rgba(0, 0, 0, 0.35);
	}

	.cs-checkbox {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		width: 1rem;
		height: 1rem;
		border-radius: 0.25rem;
		border: 1px solid rgba(212, 199, 163, 0.2);
		background: rgba(0, 0, 0, 0.3);
		cursor: pointer;
		accent-color: rgba(52, 211, 153, 0.8);
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
		color: rgba(52, 211, 153, 0.9);
		margin-bottom: 0.5rem;
		padding-right: 2rem;
		transition: color 0.15s;
	}
	.cs-card:hover .cs-card-title {
		color: rgba(52, 211, 153, 1);
	}

	.cs-card-number {
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.35);
		margin-bottom: 0.75rem;
	}

	.cs-card-desc {
		font-size: 0.875rem;
		color: rgba(212, 199, 163, 0.55);
		margin-bottom: 1rem;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
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

	/* Status badges */
	.cs-badge-open {
		border-color: rgba(52, 211, 153, 0.4);
		background: rgba(52, 211, 153, 0.12);
		color: rgba(52, 211, 153, 0.9);
	}
	.cs-badge-inprogress {
		border-color: rgba(96, 165, 250, 0.4);
		background: rgba(96, 165, 250, 0.12);
		color: rgba(96, 165, 250, 0.9);
	}
	.cs-badge-pending {
		border-color: rgba(251, 191, 36, 0.4);
		background: rgba(251, 191, 36, 0.12);
		color: rgba(251, 191, 36, 0.9);
	}
	.cs-badge-closed {
		border-color: rgba(148, 163, 184, 0.3);
		background: rgba(148, 163, 184, 0.1);
		color: rgba(148, 163, 184, 0.8);
	}
	.cs-badge-archived {
		border-color: rgba(107, 114, 128, 0.3);
		background: rgba(107, 114, 128, 0.1);
		color: rgba(107, 114, 128, 0.7);
	}

	/* Priority badges */
	.cs-badge-critical {
		border-color: rgba(239, 68, 68, 0.4);
		background: rgba(239, 68, 68, 0.12);
		color: rgba(239, 68, 68, 0.9);
	}
	.cs-badge-urgent {
		border-color: rgba(249, 115, 22, 0.4);
		background: rgba(249, 115, 22, 0.12);
		color: rgba(249, 115, 22, 0.9);
	}
	.cs-badge-high {
		border-color: rgba(234, 179, 8, 0.4);
		background: rgba(234, 179, 8, 0.12);
		color: rgba(234, 179, 8, 0.9);
	}
	.cs-badge-medium {
		border-color: rgba(96, 165, 250, 0.4);
		background: rgba(96, 165, 250, 0.12);
		color: rgba(96, 165, 250, 0.9);
	}
	.cs-badge-low {
		border-color: rgba(52, 211, 153, 0.4);
		background: rgba(52, 211, 153, 0.12);
		color: rgba(52, 211, 153, 0.9);
	}
	.cs-badge-default {
		border-color: rgba(148, 163, 184, 0.3);
		background: rgba(148, 163, 184, 0.1);
		color: rgba(148, 163, 184, 0.7);
	}

	/* ── Card Metadata ── */
	.cs-card-meta {
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.35);
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
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
		font-size: 3.5rem;
		margin-bottom: 1rem;
	}
	.cs-empty-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.8);
		margin-bottom: 0.5rem;
	}
	.cs-empty-desc {
		color: rgba(212, 199, 163, 0.4);
		margin-bottom: 1.5rem;
		font-size: 0.875rem;
	}
	.cs-empty-cta {
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		background: rgba(52, 211, 153, 0.15);
		border: 1px solid rgba(52, 211, 153, 0.3);
		color: rgba(52, 211, 153, 0.95);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}
	.cs-empty-cta:hover { background: rgba(52, 211, 153, 0.25); }

	/* ── Pagination ── */
	.cs-pagination {
		margin-top: 2rem;
		text-align: center;
	}
	.cs-load-more {
		display: inline-block;
		padding: 0.5rem 1.5rem;
		border-radius: 0.375rem;
		border: 1px solid rgba(52, 211, 153, 0.3);
		background: rgba(52, 211, 153, 0.1);
		color: rgba(52, 211, 153, 0.9);
		font-size: 0.875rem;
		font-weight: 500;
		text-decoration: none;
		transition: background 0.15s;
	}
	.cs-load-more:hover { background: rgba(52, 211, 153, 0.2); }

	/* ── Modal ── */
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
		border: 1px solid rgba(212, 199, 163, 0.1);
		background: rgba(19, 21, 25, 0.98);
		box-shadow: 0 24px 80px -20px rgba(0, 0, 0, 0.6);
	}

	.cs-modal-header {
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
		padding: 1rem 1.5rem;
	}

	.cs-modal-title {
		font-size: 1.125rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.95);
		margin: 0;
	}

	.cs-modal-form {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.cs-field {
		display: flex;
		flex-direction: column;
	}

	.cs-field-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.cs-label {
		font-size: 0.875rem;
		font-weight: 500;
		margin-bottom: 0.5rem;
		color: rgba(212, 199, 163, 0.7);
	}

	.cs-required {
		color: rgba(248, 113, 113, 0.8);
	}

	.cs-modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding-top: 1rem;
	}

	.cs-cancel-btn {
		padding: 0.5rem 1.5rem;
		border-radius: 0.375rem;
		border: 1px solid rgba(212, 199, 163, 0.15);
		background: transparent;
		color: rgba(212, 199, 163, 0.6);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}
	.cs-cancel-btn:hover {
		background: rgba(212, 199, 163, 0.06);
		color: rgba(212, 199, 163, 0.8);
	}

	.cs-submit-btn {
		padding: 0.5rem 1.5rem;
		border-radius: 0.375rem;
		background: rgba(52, 211, 153, 0.15);
		border: 1px solid rgba(52, 211, 153, 0.3);
		color: rgba(52, 211, 153, 0.95);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}
	.cs-submit-btn:hover { background: rgba(52, 211, 153, 0.25); }
</style>
