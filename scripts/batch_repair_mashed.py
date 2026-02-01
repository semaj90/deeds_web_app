import os

# Define the file paths and their corrected content
files_to_fix = {
    "sveltekit-frontend/src/routes/couchdb-analytics/SummaryCard.svelte": r"""<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		apiBase: string;
	}

	let { apiBase }: Props = $props();

	interface Summary {
		file_path: string;
		summary: string;
		key_entities: string[];
		llm_provider: string;
		generated_at: string;
		metadata?: {
			error_count: number;
			classes: string[];
			functions: string[];
			language: string;
			lines_of_code: number;
		};
	}

	let summaries = $state<Summary[]>([]);
	let loading = $state(true);
	let selectedSummary = $state<Summary | null>(null);
	let filterProvider = $state<string>('all');
	let searchQuery = $state('');

	async function loadSummaries() {
		loading = true;
		try {
			const params = new URLSearchParams({ limit: '50' });
			if (filterProvider !== 'all') {
				params.append('provider', filterProvider);
			}

			const response = await fetch(`${apiBase}/summaries?${params}`);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			summaries = await response.json();
		} catch (err) {
			console.error('Failed to load summaries:', err);
		} finally {
			loading = false;
		}
	}

	const filteredSummaries = $derived(
		summaries.filter(s =>
			s.file_path.toLowerCase().includes(searchQuery.toLowerCase()) ||
			s.summary.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	onMount(() => {
		loadSummaries();
	});

	function getProviderBadgeClass(provider: string) {
		if (provider.includes('gemini')) return 'is-success';
		if (provider.includes('gpt')) return 'is-primary';
		if (provider.includes('claude')) return 'is-warning';
		return 'is-dark';
	}
</script>

<div class="summary-list">
	<div class="controls">
		<input
			type="text"
			class="nes-input"
			placeholder="Search files..."
			bind:value={searchQuery}
		/>

		<div class="nes-select">
			<select bind:value={filterProvider} onchange={loadSummaries}>
				<option value="all">All Providers</option>
				<option value="gemini">Gemini</option>
				<option value="gpt">GPT-4</option>
				<option value="claude">Claude</option>
			</select>
		</div>
	</div>

	{#if loading}
		<div class="loading">Loading summaries...</div>
	{:else}
		<div class="grid">
			{#each filteredSummaries as summary}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="nes-container is-rounded with-title summary-card" onclick={() => selectedSummary = summary}>
					<p class="title">{summary.llm_provider}</p>
					<div class="card-content">
						<h4>{summary.file_path.split('/').pop()}</h4>
						<p class="preview">{summary.summary.substring(0, 100)}...</p>
						<div class="tags">
							{#each summary.key_entities.slice(0, 3) as entity}
								<span class="nes-badge is-splited">
									<span class="is-dark">#</span>
									<span class="is-primary">{entity}</span>
								</span>
							{/each}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if selectedSummary}
	<div class="modal-overlay" onclick={() => selectedSummary = null} role="presentation">
		<div class="modal-content nes-container is-rounded" onclick={(e) => e.stopPropagation()} role="presentation">
			<div class="modal-header">
				<h3>{selectedSummary.file_path}</h3>
				<button class="close-btn" onclick={() => selectedSummary = null}>✕</button>
			</div>

			<div class="modal-body">
				<div class="section">
					<h4>Summary ({selectedSummary.llm_provider})</h4>
					<p class="summary-full">{selectedSummary.summary}</p>
				</div>

				<div class="section">
					<h4>Key Entities</h4>
					<div class="entities-full">
						{#each selectedSummary.key_entities as entity}
							<span class="nes-badge">
								<span class="is-primary">{entity}</span>
							</span>
						{/each}
					</div>
				</div>

				{#if selectedSummary.metadata}
					<div class="section">
						<h4>Metadata</h4>
						<table>
							<tbody>
								<tr>
									<td>Language</td>
									<td>{selectedSummary.metadata.language}</td>
								</tr>
								<tr>
									<td>Lines</td>
									<td>{selectedSummary.metadata.lines_of_code}</td>
								</tr>
								<tr>
									<td>Complexity</td>
									<td>{selectedSummary.metadata.classes.length} classes, {selectedSummary.metadata.functions.length} functions</td>
								</tr>
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.summary-list {
		margin-top: 2rem;
	}

	.controls {
		display: flex;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.summary-card {
		cursor: pointer;
		transition: transform 0.2s;
	}

	.summary-card:hover {
		transform: translateY(-4px);
	}

	.card-content h4 {
		margin-bottom: 0.5rem;
		word-break: break-all;
	}

	.preview {
		font-size: 0.875rem;
		color: #6b7280;
		margin-bottom: 1rem;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
		padding: 2rem;
	}

	.modal-content {
		background: white;
		width: 100%;
		max-width: 800px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		padding: 0;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		border-bottom: 2px solid #e5e7eb;
	}

	.modal-header h3 {
		margin: 0;
		color: #1f2937;
		font-size: 1.25rem;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: #6b7280;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
	}

	.close-btn:hover {
		background: #f3f4f6;
	}

	.modal-body {
		padding: 1.5rem;
		overflow-y: auto;
	}

	.summary-full {
		line-height: 1.6;
		color: #374151;
		margin-bottom: 1.5rem;
		white-space: pre-wrap;
	}

	.section {
		margin-bottom: 1.5rem;
	}

	.section h4 {
		margin: 0 0 0.75rem 0;
		color: #1f2937;
		font-size: 1rem;
	}

	.entities-full {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	table {
		width: 100%;
		font-size: 0.875rem;
	}

	table td {
		padding: 0.5rem 0;
		border-bottom: 1px solid #e5e7eb;
	}

	table td:first-child {
		font-weight: 600;
		color: #6b7280;
		width: 40%;
	}
</style>""",

    "sveltekit-frontend/src/routes/couchdb-analytics/+page.svelte": r"""<script lang="ts">
	import { onMount } from 'svelte';
	import ClusterInspector from './ClusterInspector.svelte';
	import DependencyChart from './DependencyChart.svelte';
	import ErrorPropagationGraph from './ErrorPropagationGraph.svelte';
	import SummaryCard from './SummaryCard.svelte';

	interface Stats {
		total_files: number;
		total_summaries: number;
		total_clusters: number;
		files_with_errors: number;
		avg_complexity: number;
	}

	let stats: Stats | null = $state(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let activeTab = $state<'summaries' | 'dependencies' | 'errors' | 'clusters'>('summaries');

	const API_BASE = 'http://localhost:8001/api/analytics';

	async function loadStats() {
		try {
			const response = await fetch(`${API_BASE}/stats`);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			stats = await response.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load stats';
			console.error('Stats error:', err);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadStats();
	});
</script>

<svelte:head>
	<title>CouchDB Analytics Dashboard</title>
</svelte:head>

<div class="analytics-dashboard">
	<header class="dashboard-header">
		<h1>📊 CouchDB Analytics Dashboard</h1>
		<p class="subtitle">Week 2 Task 5: LLM Summaries • Dependencies • Error Propagation • GPU Clusters</p>
	</header>

	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>Loading analytics data...</p>
		</div>
	{:else if error}
		<div class="error-state">
			<h2>Unable to connect to Analytics Service</h2>
			<p>{error}</p>
			<p class="hint">Make sure the Python backend (Phase 66) is running on port 8001.</p>
			<button onclick={loadStats}>Retry Connection</button>
		</div>
	{:else if stats}
		<div class="stats-grid">
			<div class="stat-card">
				<div class="stat-icon">📂</div>
				<div class="stat-value">{stats.total_files}</div>
				<div class="stat-label">Files Analyzed</div>
			</div>
			<div class="stat-card">
				<div class="stat-icon">📝</div>
				<div class="stat-value">{stats.total_summaries}</div>
				<div class="stat-label">LLM Summaries</div>
			</div>
			<div class="stat-card">
				<div class="stat-icon">🧬</div>
				<div class="stat-value">{stats.total_clusters}</div>
				<div class="stat-label">GPU Clusters</div>
			</div>
			<div class="stat-card">
				<div class="stat-icon">⚠️</div>
				<div class="stat-value">{stats.files_with_errors}</div>
				<div class="stat-label">Files w/ Errors</div>
			</div>
		</div>

		<div class="dashboard-content">
			<div class="tabs">
				<button
					class:active={activeTab === 'summaries'}
					onclick={() => activeTab = 'summaries'}
				>
					LLM Summaries
				</button>
				<button
					class:active={activeTab === 'dependencies'}
					onclick={() => activeTab = 'dependencies'}
				>
					Dependencies
				</button>
				<button
					class:active={activeTab === 'errors'}
					onclick={() => activeTab = 'errors'}
				>
					Error Propagation
				</button>
				<button
					class:active={activeTab === 'clusters'}
					onclick={() => activeTab = 'clusters'}
				>
					GPU Clusters
				</button>
			</div>

			<div class="tab-content">
				{#if activeTab === 'summaries'}
					<SummaryCard apiBase={API_BASE} />
				{:else if activeTab === 'dependencies'}
					<DependencyChart apiBase={API_BASE} />
				{:else if activeTab === 'errors'}
					<ErrorPropagationGraph apiBase={API_BASE} />
				{:else if activeTab === 'clusters'}
					<ClusterInspector apiBase={API_BASE} />
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: 'Press Start 2P', system-ui, sans-serif;
	}

	.analytics-dashboard {
		padding: 2rem;
		max-width: 1400px;
		margin: 0 auto;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		min-height: 100vh;
	}

	.dashboard-header {
		text-align: center;
		margin-bottom: 2rem;
		color: white;
	}

	.dashboard-header h1 {
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
		text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
	}

	.subtitle {
		font-size: 1rem;
		opacity: 0.9;
	}

	.loading-state, .error-state {
		text-align: center;
		padding: 4rem;
		background: white;
		border-radius: 12px;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}

	.spinner {
		width: 50px;
		height: 50px;
		border: 4px solid #f3f3f3;
		border-top: 4px solid #667eea;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 1rem;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.error-state h2 {
		color: #dc2626;
		margin-bottom: 1rem;
	}

	.error-state .hint {
		font-size: 0.875rem;
		color: #6b7280;
		margin-top: 1rem;
	}

	.error-state button {
		margin-top: 1rem;
		padding: 0.5rem 1.5rem;
		background: #667eea;
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-weight: 500;
	}

	.error-state button:hover {
		background: #5568d3;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1.5rem;
		margin-bottom: 2rem;
	}

	.stat-card {
		background: white;
		padding: 1.5rem;
		border-radius: 12px;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		text-align: center;
		transition: transform 0.2s;
	}

	.stat-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
	}

	.stat-icon {
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
	}

	.stat-value {
		font-size: 2rem;
		font-weight: bold;
		color: #667eea;
		margin-bottom: 0.25rem;
	}

	.stat-label {
		font-size: 0.875rem;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.tabs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}

	.tabs button {
		padding: 0.75rem 1.5rem;
		background: rgba(255, 255, 255, 0.2);
		color: white;
		border: 2px solid transparent;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 500;
		transition: all 0.2s;
		backdrop-filter: blur(10px);
	}

	.tabs button:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	.tabs button.active {
		background: white;
		color: #667eea;
		border-color: white;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}

	.tab-content {
		background: white;
		border-radius: 12px;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		padding: 2rem;
		min-height: 500px;
	}
</style>""",

    "sveltekit-frontend/src/routes/login/+page.svelte": r"""<script lang="ts">
    import { enhance } from '$app/forms';

    let { form }: { form: { error?: string } | null } = $props();
</script>

<div class="login-container min-h-screen flex items-center justify-center bg-gray-900 text-white">
    <div class="w-full max-w-md p-8 space-y-8 bg-gray-800 rounded-lg shadow-lg">
        <div class="text-center">
            <h1 class="text-3xl font-bold">YoRHa Legal AI</h1>
            <p class="mt-2 text-gray-400">Sign in to your account</p>
        </div>

        {#if form?.error}
            <div class="p-4 text-sm text-red-400 bg-red-900/50 rounded-lg" role="alert">
                {form.error}
            </div>
        {/if}

        <form method="POST" action="?/login" use:enhance class="mt-8 space-y-6">
            <div class="rounded-md shadow-sm -space-y-px">
                <div>
                    <label for="username" class="sr-only">Username</label>
                    <input id="username" name="username" type="text" required class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-700 placeholder-gray-500 text-white bg-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm rounded-t-md" placeholder="Username">
                </div>
                <div>
                    <label for="password" class="sr-only">Password</label>
                    <input id="password" name="password" type="password" required class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-700 placeholder-gray-500 text-white bg-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm rounded-b-md" placeholder="Password">
                </div>
            </div>

            <div>
                <button type="submit" class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    Sign in
                </button>
            </div>
        </form>
    </div>
</div>""",

    "sveltekit-frontend/src/lib/server/auth/lucia.ts": r"""// PHASE 72 TESTING STUB - Auth completely disabled
// DEV_BYPASS_AUTH=true in .env means no actual auth is needed

export const auth = {
    sessionCookieName: 'yorha_session',
    validateSession: async () => ({ session: null, user: null }),
    createSession: async (userId: string) => ({
        id: 'demo-session-' + userId,
        userId,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24)
    }),
    createSessionCookie: (sessionId: string) => ({
        name: 'yorha_session',
        value: sessionId,
        attributes: { path: '/', httpOnly: true }
    }),
    createBlankSessionCookie: () => ({
        name: 'yorha_session',
        value: '',
        attributes: {}
    }),
};

export type Auth = typeof auth;
export type User = Record<string, unknown>;

interface DatabaseUserAttributes {
    email: string;
    role?: string;
}

// Placeholder type for when Lucia is disabled
type LuciaUser<T> = {
    id: string;
    email: string;
    role?: string;
};
""",

    "sveltekit-frontend/src/workers/ingestion-worker.ts": r"""export interface UploadResult {
    success: boolean;
    fileId: string;
    fileName: string;
    url: string;
    metadata?: Record<string, unknown>;
}

export interface WorkerResponse {
    taskId: string;
    success: boolean;
    data?: unknown;
    error?: string;
}

export class EmbeddingService {
    async generate(texts: string[], dimension = 384) {
        return texts.map((text) => ({
            text,
            embedding: this.generateVector(text, dimension)
        }));
    }

    private generateVector(text: string, dimension: number): number[] {
        return new Array(dimension).fill(0).map((_, index) => Math.sin((text.length + index) * 0.01));
    }
}
"""
}

def repair_files():
    base_dir = r"c:\Users\james\Videos\deeds-web-app"

    print(f"Starting repair of {len(files_to_fix)} files...")

    for relative_path, clean_content in files_to_fix.items():
        # Clean relative path to match OS
        full_path = os.path.join(base_dir, relative_path.replace("/", os.sep))

        try:
            # Create directory if it doesn't exist (just in case)
            os.makedirs(os.path.dirname(full_path), exist_ok=True)

            with open(full_path, "w", encoding="utf-8") as f:
                f.write(clean_content)

            print(f"✅ Repaired: {relative_path}")

        except Exception as e:
            print(f"❌ Failed to repair {relative_path}: {e}")

if __name__ == "__main__":
    repair_files()
