<script lang="ts">
	import { browser } from '$app/environment';
	import { createWorkflowStore } from '$lib/client/workflow-event-stream';

	// Minimal local types to satisfy TypeScript / IDE without the generated $types
	type CaseItem = {
		id: string;
		title: string;
		case_number: string;
		status: string;
		progress: number;
		evidenceCount: number;
		lastUpdate: string;
	};

	type PageData = {
		cases?: CaseItem[];
		error?: string;
		session?: {
			id: string;
			userId: string;
		};
	};

	// Use SvelteKit-style incoming data
	export let data: PageData;

	// Use server-loaded cases instead of runic stores for predictable reactivity
	let cases: CaseItem[] = data.cases || [];
	let searchQuery = '';
	let showUploadModal = false;
	let selectedCaseForUpload: string | null = null;

	// Workflow store for real-time updates
	const sessionId = data.session?.id || 'guest';
	const workflowStore = createWorkflowStore(sessionId);

	// Connect/disconnect workflow store using standard lifecycle hooks
	$effect(() => {
		if (browser) {
			workflowStore.connect();
		}

		return () => {
			if (browser) {
				workflowStore.disconnect();
			}
		};
	});

	// Reactive filtered array computed from local variables
	let filteredCases = $derived(cases.filter(c =>
		(c.title || '').toLowerCase().includes((searchQuery || '').toLowerCase()) ||
		(c.case_number || '').toLowerCase().includes((searchQuery || '').toLowerCase())
	));

	// Handle new case creation
	async function createNewCase() {
		const caseNumber = `CASE-${Date.now()}`;
		const title = prompt('Enter case title:');

		if (!title) return;

		try {
			const response = await fetch('/api/cases', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					case_number: caseNumber,
					title,
					status: 'pending',
				}),
			});

			if (response.ok) {
				// Reload page to get updated data
				window.location.reload();
			} else {
				alert('Failed to create case');
			}
		} catch (error) {
			console.error('Error creating case:', error);
			alert('Failed to create case');
		}
	}
</script>

<svelte:head>
	<title>Cases Dashboard - YoRHa Legal AI</title>
</svelte:head>

<div class="cases-dashboard">
	<div class="header nes-container with-title">
		<p class="title">📁 CASES TERMINAL</p>
		<p class="subtitle">Active Investigations & Analysis</p>
	</div>

	<div class="controls">
		<!-- replaced unavailable InputBits with native input -->
		<input
			class="nes-input"
			bind:value={searchQuery}
			placeholder="Search cases..."
			aria-label="Search cases" />

		<!-- replaced unavailable ButtonBits with native button and correct Svelte event -->
		<button class="nes-btn is-primary" onclick={createNewCase}>➕ NEW CASE</button>
	</div>

	{#if data.error}
		<div class="error-banner nes-container is-rounded is-dark">
			<p>⚠️ Error loading cases: {data.error}</p>
		</div>
	{/if}

	{#if filteredCases.length === 0}
		<div class="empty-state nes-container is-rounded">
			<p>📁 No cases found{searchQuery ? ` matching "${searchQuery}"` : ''}</p>
			<button class="nes-btn is-primary" onclick={createNewCase}>Create Your First Case</button>
		</div>
	{:else}

	<div class="cases-grid">
		{#each filteredCases as case_ (case_.id)}
			<!-- replaced CardBits with semantic article/div using existing case-card styles -->
			<article class="case-card">
				<div class="case-header">
					<h3>{case_.title}</h3>
					<span class="status-badge nes-badge">
						<span class={case_.status === 'active' ? 'is-success' : 'is-warning'}>
							{case_.status.toUpperCase()}
						</span>
					</span>
				</div>

				<div class="case-stats">
					<div class="stat">
						<span class="label">Progress:</span>
						<div class="progress-bar">
							<div class="progress-fill" style="width: {case_.progress}%"></div>
						</div>
						<span>{case_.progress}%</span>
					</div>

					<div class="stat">
						<span class="label">Evidence:</span>
						<span class="value">{case_.evidenceCount} items</span>
					</div>

					<div class="stat">
						<span class="label">Updated:</span>
						<span class="value">{case_.lastUpdate}</span>
					</div>
				</div>

				<div class="case-actions">
					<!-- replaced ButtonBits with anchor/button that work without the custom component lib -->
					<a class="nes-btn is-primary is-small" href={`/evidenceboard?case=${case_.id}`}>🔍 Evidence Board</a>
					<button class="nes-btn is-small" disabled>📝 Details</button>
				</div>
			</article>
		{/each}
	</div>
	{/if}
</div>

<style>
	.cases-dashboard {
		max-width: 1200px;
		margin: 0 auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.header {
		background: linear-gradient(135deg, #4a90e2, #7ed321) !important;
		text-align: center;
	}

	.header .title {
		color: white !important;
		font-family: 'Press Start 2P', cursive !important;
		font-size: 1.25rem !important;
	}

	.header .subtitle {
		color: rgba(255, 255, 255, 0.9) !important;
		font-size: 0.75rem;
	}

	.controls {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.cases-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
		gap: 1rem;
	}

	.case-card {
		background: rgba(26, 26, 46, 0.6) !important;
		border: 2px solid var(--n64-primary) !important;
		padding: 1rem;
		transition: all 0.3s ease;
	}

	.case-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 25px rgba(74, 144, 226, 0.2);
		border-color: var(--n64-secondary) !important;
	}

	.case-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1rem;
	}

	.case-header h3 {
		color: var(--nier-text-primary);
		font-family: 'Press Start 2P', cursive;
		font-size: 0.875rem;
		margin: 0;
		line-height: 1.4;
		flex: 1;
	}

	.case-stats {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
		padding: 0.75rem;
		background: rgba(15, 15, 35, 0.5);
		border-radius: 4px;
	}

	.stat {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
	}

	.label {
		color: var(--nier-text-muted);
		min-width: 70px;
	}

	.value {
		color: var(--nier-text-secondary);
		font-family: 'JetBrains Mono', monospace;
	}

	.progress-bar {
		flex: 1;
		height: 8px;
		background: rgba(74, 144, 226, 0.2);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #4a90e2, #7ed321);
		transition: width 0.3s ease;
	}

	.case-actions {
		display: flex;
		gap: 0.5rem;
	}

	.error-banner {
		background: rgba(220, 53, 69, 0.2) !important;
		border: 2px solid #dc3545 !important;
		color: #fff !important;
		text-align: center;
		padding: 1rem;
	}

	.empty-state {
		background: rgba(26, 26, 46, 0.6) !important;
		border: 2px dashed var(--n64-primary) !important;
		text-align: center;
		padding: 3rem 1rem;
	}

	.empty-state p {
		color: var(--nier-text-muted);
		margin-bottom: 1rem;
		font-size: 1rem;
	}

	@media (max-width: 768px) {
		.cases-grid {
			grid-template-columns: 1fr;
		}
	}
</style>


