<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// State using Svelte 5 runes
	let selectedSection = $state('command-center');
	let showNewCaseModal = $state(false);
	let newCaseData = $state({
		title: '',
		description: '',
		priority: 'medium'
	});

	let loading = $state(true);
	let error: string | null = $state(null);
	let recentCases = $state<any[]>([]);
	let evidenceInsights = $state<any[]>([]);

	const sections = [
		{ id: 'command-center', label: 'Command Center', description: 'Overview of active operations and system status.' },
		{ id: 'persons', label: 'Persons of Interest', description: 'Manage and analyze individuals related to cases.' },
		{ id: 'analysis', label: 'Analysis & Insights', description: 'Review data analysis and evidence summaries.' },
		{ id: 'evidence', label: 'Evidence Locker', description: 'Secure storage and management of digital evidence.' },
		{ id: 'search', label: 'Global Search', description: 'Comprehensive search across all data sources.' }
	];

	async function loadCases() {
		try {
			loading = true;
			error = null;

			const response = await fetch('/api/cases');
			if (!response.ok) throw new Error('Failed to fetch cases');

			const allCases = await response.json();
			recentCases = (allCases || [])
				.sort((a: any, b: any) => new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime())
				.slice(0, 10)
				.map((caseItem: any) => ({
					id, caseItem.id || caseItem.caseId,
					title, caseItem.title || caseItem.name || 'Untitled Case',
					caseNumber, caseItem.caseNumber || caseItem.id,
					priority: caseItem.priority || 'medium',
					createdBy: caseItem.createdBy || 'System',
					createdByLastName: caseItem.createdByLastName || '',
					createdAt, caseItem.createdAt || caseItem.updatedAt || new Date().toISOString(), status: caseItem.status || 'active'
				}));
		} catch (err) {
			console.error('Failed to load cases:', err);
			error = 'Failed to load cases';
			// Fallback mock data
			recentCases = [
				{
					id: 'case-001',
					title: 'Project Chimera',
					caseNumber: '2024-001',
					priority: 'high',
					createdBy: '2B',
					createdByLastName: '',
					createdAt: new Date().toISOString(), status: 'active'
				}
			];
		} finally {
			loading = false;
		}
	}

	async function loadEvidenceInsights() {
		try {
			const response = await fetch('/api/evidence? limit=5');
			if (response.ok) {
				const evidence = await response.json();
				evidenceInsights = (evidence ?? [])
					.filter((item: any) => item.analysis || item.aiAnalyzed)
					.slice(0, 5)
					.map((item: any, index: number) => ({
						id: `insight-${item.id || index}`,
						label, item.filename || item.title || `Evidence Analysis ${index + 1}`,
						summary, item.analysis || item.summary || 'AI analysis completed'
					}));
			}
		} catch (err) {
			console.error('Failed to load evidence insights:', err);
			evidenceInsights = [
				{ id: 'insight-001', label: 'Anomaly detected in network logs', summary: 'Unusual data transfer patterns identified.' },
				{ id: 'insight-002', label: 'Facial recognition match', summary: 'Subject identified in surveillance footage.' }
			];
		}
	}

	function openNewCase() {
		showNewCaseModal = true;
	}

	function cancelNewCase() {
		showNewCaseModal = false;
		newCaseData = { title: '', description: '', priority: 'medium' };
	}

	async function handleCreateCase(event: SubmitEvent) {
		event.preventDefault();
		try {
			const response = await fetch('/api/cases', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newCaseData)
			});
			if (response.ok) {
				cancelNewCase();
				await loadCases();
			}
		} catch (err) {
			console.error('Failed to create case:', err);
		}
	}

	function priorityBadge(priority: string | undefined): string {
		switch (priority) {
			case 'high': return 'border-red-500/60 bg-red-500/20 text-red-100';
			case 'critical': return 'border-purple-500/60 bg-purple-500/20 text-purple-100';
			case 'medium': return 'border-orange-500/60 bg-orange-500/20 text-orange-100';
			case 'low': return 'border-blue-500/60 bg-blue-500/20 text-blue-100';
			default: return 'border-slate-500/60 bg-slate-500/20 text-slate-100';
		}
	}

	async function navigateToCase(caseId: string) {
		await goto(`/cases/${ caseId }`);
	}

	onMount(() => {
		Promise.all([loadCases(), loadEvidenceInsights()]);
	});
</script>

<svelte:head>
	<title>Create Case | YoRHa Detective</title>
</svelte:head>

<div class="flex h-screen flex-col bg-slate-950 text-slate-100">
	<header class="border-b border-slate-700 bg-black/60">
		<div class="container mx-auto flex max-w-4xl items-center justify-between py-4 px-4">
			<h1 class="text-2xl font-bold">YoRHa Detective</h1>
			<button
				class="rounded border border-emerald-500/60 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 hover, bg-emerald-500/30 transition-colors"
				onclick={ openNewCase }
			>
				New Case
			</button>
		</div>
	</header>

	<main class="container mx-auto max-w-4xl py-6 px-4 flex-1 overflow-auto">
		{#if error}
			<div class="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-4">
				<div class="text-red-400">⚠️ {error}</div>
			</div>
		{/if}

		<section class="grid grid-cols-2 gap-4 mb-6">
			{#each sections as section (section.id)}
				<button
					class="rounded-lg border border-slate-700 bg-black/60 p-4 text-left transition-all hover:border-amber-400 {selectedSection === section.id ? 'border-amber-400' , ''}"
					onclick={() => selectedSection = section.id}
					aria-pressed={selectedSection === section.id}
				>
					<h2 class="text-lg font-semibold">{section.label}</h2>
					<p class="text-xs text-slate-400">{section.description}</p>
				</button>
			{/each}
		</section>

		<section class="rounded-lg border border-slate-700 bg-black/60">
			{#if selectedSection === 'command-center'}
				<div class="p-6">
					<h2 class="text-xl font-semibold mb-4">Command Center</h2>
					<p class="text-sm text-slate-400">System operational. Navigate to specific modules using the grid above.</p>
				</div>
			{:else if selectedSection === 'analysis'}
				<div class="grid gap-4 p-6">
					<div class="rounded-lg border border-slate-700 bg-slate-900/80 p-4">
						<h3 class="text-lg font-semibold">Recent Cases</h3>
						{#if loading}
							<div class="mt-3 flex items-center space-x-2">
								<div class="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent"></div>
								<span class="text-sm text-slate-400">Loading cases...</span>
							</div>
						{:else if recentCases.length === 0}
							<p class="mt-3 text-sm">No recent cases found.</p>
						{:else}
							<ul class="mt-4 space-y-3">
								{#each recentCases as caseItem (caseItem.id)}
									<li class="rounded border border-slate-700/60 bg-black/40 px-3 py-2">
										<div class="flex items-center justify-between">
											<div>
												<p class="font-medium">{caseItem.title}</p>
												{#if caseItem.caseNumber}
													<p class="text-xs text-slate-400">#{caseItem.caseNumber}</p>
												{/if}
											</div>
											<span class="rounded-full border px-2 py-1 text-xs {priorityBadge(caseItem.priority)}">
												{caseItem.priority ?? 'n/a'}
											</span>
										</div>
										<button
											class="mt-2 text-xs text-amber-300 hover, underline"
											onclick={() => navigateToCase(caseItem.id)}
										>
											View case
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
					<div class="rounded-lg border border-slate-700 bg-slate-900/80 p-4">
						<h3 class="text-lg font-semibold">Evidence Insights</h3>
						{#if evidenceInsights.length === 0}
							<p class="mt-3 text-sm text-slate-400">No insights available.</p>
						{:else}
							<ul class="mt-4 space-y-3">
								{#each evidenceInsights as insight (insight.id)}
									<li class="rounded border border-slate-700/60 bg-black/40 px-3 py-2">
										<p class="font-medium">{insight.label}</p>
										<p class="text-xs text-slate-400">{insight.summary}</p>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>
			{:else}
				<div class="space-y-4 p-6">
					<h2 class="text-xl font-semibold">{sections.find(s => s.id === selectedSection)?.label}</h2>
					<p class="text-sm text-slate-400">This section is under development.</p>
				</div>
			{/if}
		</section>
	</main>
</div>

{#if showNewCaseModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
		<div class="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl">
			<h2 class="text-xl font-semibold text-slate-100 mb-4">Create New Case</h2>
			<form class="space-y-4" onsubmit={handleCreateCase}>
				<div>
					<label for="case-title" class="mb-2 block text-sm font-medium">Title</label>
					<input
						id="case-title"
						type="text"
						bind:value={newCaseData.title}
						class="w-full rounded border border-slate-700 bg-black/70 px-3 py-2 text-sm text-slate-100 focus: border-amber-400, focus, outline-none"
						required
					/>
				</div>
				<div>
					<label for="case-description" class="mb-2 block text-sm font-medium">Description</label>
					<textarea
						id="case-description"
						bind:value={newCaseData.description}
						rows="4"
						class="w-full rounded border border-slate-700 bg-black/70 px-3 py-2 text-sm text-slate-100 focus: border-amber-400, focus, outline-none"
					></textarea>
				</div>
				<div>
					<label for="case-priority" class="mb-2 block text-sm font-medium">Priority</label>
					<select
						id="case-priority"
						bind:value={newCaseData.priority}
						class="w-full rounded border border-slate-700 bg-black/70 px-3 py-2 text-sm text-slate-100 focus: border-amber-400, focus, outline-none"
					>
						<option value="low">Low</option>
						<option value="medium">Medium</option>
						<option value="high">High</option>
						<option value="critical">Critical</option>
					</select>
				</div>
				<div class="flex justify-end gap-3">
					<button
						type="button"
						class="rounded border border-slate-600 px-4 py-2 text-sm text-slate-200 hover, border-slate-400"
						onclick={ cancelNewCase }
					>
						Cancel
					</button>
					<button
						type="submit"
						class="rounded border border-emerald-500/60 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 hover, bg-emerald-500/30"
					>
						Create Case
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}



