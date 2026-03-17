<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
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

	function priorityBadge(priority: string): string {
		switch (priority) {
			case 'critical': return 'border-red-600 bg-red-500/20 text-red-100';
			case 'urgent': return 'border-orange-600 bg-orange-500/20 text-orange-100';
			case 'high': return 'border-yellow-600 bg-yellow-500/20 text-yellow-100';
			case 'medium': return 'border-blue-600 bg-blue-500/20 text-blue-100';
			case 'low': return 'border-green-600 bg-green-500/20 text-green-100';
			default:return 'border-slate-600 bg-slate-500/20 text-black';
		}
	}

	function statusBadge(status: string): string {
		switch (status) {
			case 'open': return 'border-green-500 bg-green-500/20 text-green-100';
			case 'in_progress': return 'border-blue-500 bg-blue-500/20 text-blue-100';
			case 'pending_review': return 'border-yellow-500 bg-yellow-500/20 text-yellow-100';
			case 'closed': return 'border-slate-500 bg-slate-500/20 text-black';
			case 'archived': return 'border-black/20 bg-slate-700/20 text-slate-300';
			default:return 'border-slate-500 bg-slate-500/20 text-black';
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

<div class="flex h-screen flex-col  text-black">
	<!-- Header -->
	<header class="border-b border-black/20 bg-black/60 backdrop-blur-sm">
		<div class="container mx-auto flex max-w-7xl items-center justify-between py-4 px-6">
			<div>
				<h1 class="text-2xl font-bold">Cases</h1>
				<p class="text-sm text-black/60">Manage your legal cases and investigations</p>
			</div>
			<button
				class="rounded border border-emerald-500/60 bg-emerald-500/20 px-6 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/30 transition-colors"
				onclick={openNewCase}
			>
				+ New Case
			</button>
		</div>
	</header>

	<!-- Filters Bar -->
	<div class="border-b border-black/20 bg-panel/50 py-4 px-6">
		<div class="container mx-auto max-w-7xl flex flex-wrap gap-4 items-center">
			<div class="flex-1 min-w-[200px]">
				<input
					type="text"
					placeholder="Search cases..."
					bind:value={searchQuery}
					onkeydown={(e) => e.key === 'Enter' && applyFilters()}
					class="w-full rounded border border-slate-600 bg-sand/10 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none"
				/>
			</div>
			<select
				bind:value={statusFilter}
				onchange={applyFilters}
				class="rounded border border-slate-600 bg-sand/10 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none"
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
				class="rounded border border-slate-600 bg-sand/10 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none"
			>
				<option value="">All Priorities</option>
				<option value="critical">Critical</option>
				<option value="urgent">Urgent</option>
				<option value="high">High</option>
				<option value="medium">Medium</option>
				<option value="low">Low</option>
			</select>
			<button
				onclick={applyFilters}
				class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-700 transition-colors"
			>
				Apply Filters
			</button>
		</div>
	</div>

	<!-- Bulk Actions Bar -->
	{#if showBulkActions}
		<div class="border-b border-amber-700 bg-amber-900/30 py-3 px-6">
			<div class="container mx-auto max-w-7xl flex items-center justify-between">
				<span class="text-sm font-medium text-amber-100">
					{selectedCases.size} case(s) selected
				</span>
				<form method="POST" action="?/updateStatus" use:enhance class="flex gap-2">
					{#each Array.from(selectedCases) as caseId}
						<input type="hidden" name="caseIds" value={caseId} />
					{/each}
					<select
						name="status"
						bind:value={bulkStatus}
						class="rounded border border-amber-600 bg-amber-800 px-3 py-1 text-sm"
					>
						<option value="">Update Status...</option>
						<option value="open">Open</option>
						<option value="in_progress">In Progress</option>
						<option value="pending_review">Pending Review</option>
						<option value="closed">Closed</option>
					</select>
					<button
						type="submit"
						disabled={!bulkStatus}
						class="rounded bg-amber-600 px-4 py-1 text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						Update
					</button>
					<button
						type="button"
						onclick={clearSelection}
						class="rounded border border-slate-600 px-4 py-1 text-sm hover:bg-sand/10"
					>
						Clear
					</button>
				</form>
			</div>
		</div>
	{/if}

	<!-- Cases List -->
	<div class="flex-1 overflow-y-auto p-6">
		<div class="container mx-auto max-w-7xl">
			{#if data.databaseStatus && !data.databaseStatus.available}
				<div class="mb-4 rounded border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200 text-sm">
					Database unavailable — showing cached or empty results. {data.databaseStatus.error ?? ''}
				</div>
			{/if}

			{#if form?.success}
				<div class="mb-4 rounded border border-green-500 bg-green-500/10 p-4 text-green-100">
					✅ {form.message}
				</div>
			{/if}

			{#if !data.cases}
				<!-- Loading skeleton -->
				<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{#each Array(6) as _}
						<div class="rounded-lg border border-black/20 bg-panel/50 p-5">
							<Skeleton variant="text" width="70%" height="1.25em" />
							<div class="mt-2"><Skeleton variant="text" width="40%" height="0.75em" /></div>
							<div class="mt-3"><Skeleton variant="text" width="100%" height="2em" /></div>
							<div class="mt-3 flex gap-2">
								<Skeleton variant="rect" width="80px" height="24px" />
								<Skeleton variant="rect" width="60px" height="24px" />
							</div>
							<div class="mt-3"><Skeleton variant="text" width="50%" height="0.75em" /></div>
						</div>
					{/each}
				</div>
			{:else if data.cases.length === 0}
				<div class="flex flex-col items-center justify-center py-20 text-center">
					<div class="text-6xl mb-4">📂</div>
					<h2 class="text-xl font-semibold mb-2">No Cases Found</h2>
					<p class="text-black/60 mb-6">
						{#if searchQuery || statusFilter !== 'all' || priorityFilter}
							No cases match your current filters. Try adjusting your search criteria.
						{:else}
							Create your first case to get started.
						{/if}
					</p>
					{#if !searchQuery && statusFilter === 'all' && !priorityFilter}
						<button
							onclick={openNewCase}
							class="rounded bg-emerald-600 px-6 py-3 font-semibold hover:bg-emerald-700 transition-colors"
						>
							+ Create First Case
						</button>
					{/if}
				</div>
			{:else}
				<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{#each data.cases as caseItem (caseItem.id)}
						<div
							class="group relative rounded-lg border border-black/20 bg-panel/50 p-5 transition-all hover:border-emerald-500/50 hover:bg-panel"
						>
							<!-- Selection Checkbox -->
							<input
								type="checkbox"
								checked={selectedCases.has(caseItem.id)}
								onchange={() => toggleCaseSelection(caseItem.id)}
								class="absolute top-3 right-3 h-4 w-4 rounded border-slate-600 bg-sand/10 cursor-pointer"
							/>

							<!-- Case Header -->
							<button
								onclick={() => openCaseDetail(caseItem.id)}
								class="block w-full text-left"
							>
								<h3 class="text-lg font-semibold text-emerald-100 group-hover:text-emerald-300 mb-2 pr-8">
									{caseItem.title}
								</h3>
								{#if caseItem.caseNumber}
									<p class="text-xs text-black/60 mb-3">Case #{caseItem.caseNumber}</p>
								{/if}
								{#if caseItem.description}
									<p class="text-sm text-slate-300 line-clamp-2 mb-4">
										{caseItem.description}
									</p>
								{/if}

								<!-- Badges -->
								<div class="flex flex-wrap gap-2 mb-4">
									<span class="rounded border px-2 py-1 text-xs font-medium {statusBadge(caseItem.status)}">
										{caseItem.status ? caseItem.status.replace('_', ' ') : 'unknown'}
									</span>
									<span class="rounded border px-2 py-1 text-xs font-medium {priorityBadge(caseItem.priority)}">
										{caseItem.priority || 'normal'}
									</span>
								</div>

								<!-- Metadata -->
								<div class="text-xs text-black/60 space-y-1">
									{#if caseItem.practiceArea}
										<div>📋 {caseItem.practiceArea}</div>
									{/if}
									{#if caseItem.jurisdiction}
										<div>⚖️ {caseItem.jurisdiction}</div>
									{/if}
									{#if caseItem.updatedAt}
										<div class="text-black0">
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
					<div class="mt-8 text-center">
						<a
							href="/cases?offset={data.pagination.offset + data.pagination.limit}&status={statusFilter}&priority={priorityFilter}&search={searchQuery}"
							class="inline-block rounded border border-emerald-500 bg-emerald-500/20 px-6 py-2 text-sm font-medium hover:bg-emerald-500/30"
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
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
		<div class="w-full max-w-2xl rounded-lg border border-black/20 bg-panel shadow-2xl">
			<div class="border-b border-black/20 px-6 py-4">
				<h2 class="text-xl font-bold">Create New Case</h2>
			</div>

		<!-- Progressive Enhancement, Form with SSR fallback -->
		<form method="POST" action="?/create" use:enhance class="p-6 space-y-4">
				{#if form?.error}
					<div class="rounded border border-red-500 bg-red-500/10 p-4 text-red-100">
						❌ {form.error}
					</div>
				{/if}

				<div>
					<label for="title" class="block text-sm font-medium mb-2">
						Case Title <span class="text-red-500">*</span>
					</label>
					<input
						type="text"
						id="title"
						name="title"
						required
						class="w-full rounded border border-slate-600 bg-sand/10 px-4 py-2 focus:border-emerald-500 focus:outline-none"
						placeholder="e.g., State v. Smith"
					/>
				</div>

				<div>
					<label for="description" class="block text-sm font-medium mb-2">
						Description <span class="text-red-500">*</span>
					</label>
				<textarea
					id="description"
					name="description"
					required
					rows="4"
					class="w-full rounded border border-slate-600 bg-sand/10 px-4 py-2 focus:border-emerald-500 focus:outline-none resize-none"
					placeholder="Brief overview of the case..."
				></textarea>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="priority" class="block text-sm font-medium mb-2">Priority</label>
					<select
						id="priority"
						name="priority"
						class="w-full rounded border border-slate-600 bg-sand/10 px-4 py-2 focus:border-emerald-500 focus:outline-none"
					>
							<option value="low">Low</option>
							<option value="medium">Medium</option>
							<option value="high">High</option>
							<option value="urgent">Urgent</option>
							<option value="critical">Critical</option>
						</select>
					</div>

					<div>
						<label for="caseNumber" class="block text-sm font-medium mb-2">Case Number</label>
					<input
						type="text"
						id="caseNumber"
						name="caseNumber"
						class="w-full rounded border border-slate-600 bg-sand/10 px-4 py-2 focus:border-emerald-500 focus:outline-none"
						placeholder="e.g., 2026-CR-0042"
					/>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="practiceArea" class="block text-sm font-medium mb-2">Practice Area</label>
					<input
						type="text"
						id="practiceArea"
						name="practiceArea"
						class="w-full rounded border border-slate-600 bg-sand/10 px-4 py-2 focus:border-emerald-500 focus:outline-none"
						placeholder="e.g., Criminal Law"
					/>
					</div>

					<div>
						<label for="jurisdiction" class="block text-sm font-medium mb-2">Jurisdiction</label>
					<input
						type="text"
						id="jurisdiction"
						name="jurisdiction"
						class="w-full rounded border border-slate-600 bg-sand/10 px-4 py-2 focus:border-emerald-500 focus:outline-none"
						placeholder="e.g., Federal District Court"
					/>
					</div>
				</div>

				<div class="flex justify-end gap-3 pt-4">
					<button
						type="button"
						onclick={closeModal}
						class="rounded border border-slate-600 px-6 py-2 text-sm font-medium hover:bg-sand/10 transition-colors"
					>
						Cancel
					</button>
					<button
						type="submit"
						class="rounded bg-emerald-600 px-6 py-2 text-sm font-semibold hover:bg-emerald-700 transition-colors"
					>
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
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	overflow: hidden;
	}
</style>




