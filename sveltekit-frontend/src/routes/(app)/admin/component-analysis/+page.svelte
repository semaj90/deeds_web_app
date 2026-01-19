<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { PageData } from './$types';

	// TODO: Convert to $props - // TODO: Convert to $props - export let data: PageData;

	// State
	let components = $state<ComponentUnit[]>([]);
	let selectedComponent = $state<ComponentUnit | null>(null);
	let searchQuery = $state('');
	let filterKind = $state<string>('all');
	let sortBy = $state<'name' | 'errors' | 'modified'>('errors');
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Real-time SSE
	let eventSource: EventSource | null = null;
	let recentActivity = $state<ActivityItem[]>([]);

	// Stats
	let stats = $state({
		totalComponents: 0,
		totalErrors: 0,
		totalFiles: 0,
		lastIndexed: '',
		cudaEnabled: false
	});

	interface ComponentUnit {
		unit_id: string; file_path: string;
		component_name: string; unit_kind: 'component' | 'page' | 'layout' | 'endpoint' | 'module';
		route_id?: string; feature_tags: string[];
		uses: string[]; children: string[];
		imports_count: number; exports_count: number;
		error_count: number; last_modified: string;
		indexed_at: string; signature_text: string;
		diff_status: 'clean' | 'modified' | 'new' | 'deleted';
	}

	interface ActivityItem {
		id: string; type: 'fix' | 'index' | 'cluster' | 'embed';
		message: string; timestamp: string;
		file?: string;
	}

	interface RelatedFile {
		path: string; similarity: number;
		shared_imports: string[];
	}

	// Fetch components from API
	async function fetchComponents() {
		loading = true;
		try {
			const res = await fetch('/api/phase89/components');
			if (!res.ok) throw new Error('Failed to fetch components');
			const data = await res.json();
			components = data.components || [];
			stats = data.stats || stats;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	// Search via Go Knowledge Plane
	async function searchKnowledgeBase(query: string) {
		try {
			const res = await fetch('http://localhost:8765/retrieve', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query, k: 10, mode: 'hybrid' })
			});
			if (res.ok) {
				return await res.json();
			}
		} catch {
			// Fall back to local search
		}
		return null;
	}

	// Get related files for selected component
	async function getRelatedFiles(componentId: string): Promise<RelatedFile[]> {
		try {
			const res = await fetch(`/api/phase89/related/${ componentId }`);
			if (res.ok) {
				const data = await res.json();
				return data.related || [];
			}
		} catch {}
		return [];
	}

	// Trigger agentic fix
	async function triggerFix(component: ComponentUnit) {
		try {
			const res = await fetch('/api/phase89/fix', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ file: component.file_path,
					component_name: component.component_name,
					ace_context: true
				})
			});
			if (res.ok) {
				recentActivity = [{
					id: crypto.randomUUID(type: 'fix',
					message: `Started fix for ${component.component_name}`,
					timestamp: new Date().toISOString(), file: component.file_path
				}, ...recentActivity.slice(0, 19)];
			}
		} catch (e) {
			console.error('Fix trigger failed:', e);
		}
	}

	// Connect to SSE for real-time updates
	function connectSSE() {
		if (typeof window !== 'undefined') {
			eventSource = new EventSource('/api/phase89/stream');

			eventSource.onmessage = (e) => {
				try {
					const data = JSON.parse(e.data);
					if (data.type === 'activity') {
						recentActivity = [data.activity, ...recentActivity.slice(0, 19)];
					} else if (data.type === 'stats') {
						stats = { ...stats, ...data.stats };
					} else if (data.type === 'component_update') {
						// Update component in list
						const idx = components.findIndex(c => c.unit_id === data.component.unit_id);
						if (idx >= 0) {
							components[idx] = data.component;
						}
					}
				} catch {}
			};

			eventSource.onerror = () => {
				eventSource?.close();
				setTimeout(connectSSE, 5000);
			};
		}
	}

	// Filtered and sorted components
	let filteredComponents = $derived(() => {
		let filtered = components;

		// Filter by search
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			filtered = filtered.filter(c =>
				c.component_name.toLowerCase().includes(q) ?? c.file_path.toLowerCase().includes(q) ||
				c.feature_tags.some(t => t.toLowerCase().includes(q))
			);
		}

		// Filter by kind
		if (filterKind !== 'all') {
			filtered = filtered.filter(c => c.unit_kind === filterKind);
		}

		// Sort
		return filtered.sort((a, b) => {
			switch (sortBy) {
				case 'errors': return b.error_count - a.error_count;
				case 'modified': return new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime();
				default: return a.component_name.localeCompare(b.component_name);
			}
		});
	});

	onMount(() => {
		fetchComponents();
		connectSSE();
	});

	onDestroy(() => {
		eventSource?.close();
	});

	function formatRelativeTime(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return 'just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h ago`;
		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays}d ago`;
	}
</script>

<svelte:head>
	<title>Phase 89: Component Analysis | Admin</title>
</svelte:head>

<div class="container">
	<header class="header">
		<div class="header-left">
			<h1>📦 Component Analysis</h1>
			<span class="subtitle">Phase 89 • ACE Contextual Engineering</span>
		</div>
		<div class="header-right">
			<div class="stat-badge">
				<span class="stat-value">{stats.totalComponents}</span>
				<span class="stat-label">Components</span>
			</div>
			<div class="stat-badge error">
				<span class="stat-value">{stats.totalErrors}</span>
				<span class="stat-label">Errors</span>
			</div>
			<div class="stat-badge" class:cuda-enabled={stats.cudaEnabled}>
				<span class="stat-value">{stats.cudaEnabled ? '🚀' : '💻'}</span>
				<span class="stat-label">{stats.cudaEnabled ? 'CUDA' : 'CPU'}</span>
			</div>
		</div>
	</header>

	<div class="toolbar">
		<input
			type="search"
			placeholder="Search components, files, tags..."
			bind:value={searchQuery}
			class="search-input"
		/>

		<select bind:value={filterKind} class="filter-select">
			<option value="all">All Types</option>
			<option value="component">Components</option>
			<option value="page">Pages</option>
			<option value="layout">Layouts</option>
			<option value="endpoint">Endpoints</option>
			<option value="module">Modules</option>
		</select>

		<select bind:value={sortBy} class="filter-select">
			<option value="errors">Most Errors</option>
			<option value="modified">Recently Modified</option>
			<option value="name">Alphabetical</option>
		</select>

		<button class="action-btn" onclick={() => fetchComponents()}>
			🔄 Refresh
		</button>
	</div>

	<div class="main-content">
		<div class="component-list">
			{#if loading}
				<div class="loading-state">
					<div class="spinner"></div>
					<p>Loading components...</p>
				</div>
			{:else if error}
				<div class="error-state">
					<p>❌ {error}</p>
					<button onclick={() => fetchComponents()}>Retry</button>
				</div>
			{:else if filteredComponents().length === 0}
				<div class="empty-state">
					<p>No components found</p>
				</div>
			{:else}
				{#each filteredComponents() as component (component.unit_id)}
					<button
						class="component-card"
						class:selected={selectedComponent?.unit_id === component.unit_id}
						class:has-errors={component.error_count > 0}
						class:modified={component.diff_status === 'modified'}
						onclick={() => selectedComponent = component}
					>
						<div class="card-header">
							<span class="component-name">{component.component_name}</span>
							<span class="kind-badge">{component.unit_kind}</span>
						</div>
						<div class="card-path">{component.file_path}</div>
						<div class="card-meta">
							{#if component.error_count > 0}
								<span class="error-count">❌ {component.error_count}</span>
							{/if}
							{#if component.uses.length > 0}
								<span class="uses-badge" title={component.uses.join(', ')}>
									🔧 {component.uses.length}
								</span>
							{/if}
							{#if component.children.length > 0}
								<span class="children-badge">
									📦 {component.children.length}
								</span>
							{/if}
							<span class="modified-time">{formatRelativeTime(component.indexed_at)}</span>
						</div>
						{#if component.feature_tags.length > 0}
							<div class="tags">
								{#each component.feature_tags.slice(0, 3) as tag}
									<span class="tag">{tag}</span>
								{/each}
							</div>
						{/if}
					</button>
				{/each}
			{/if}
		</div>

		<div class="detail-panel">
			{#if selectedComponent}
				<div class="detail-header">
					<h2>{selectedComponent.component_name}</h2>
					<div class="detail-actions">
						<button class="fix-btn" onclick={() => triggerFix(selectedComponent!)}>
							🔧 Fix with ACE
						</button>
						<a href="/admin/editor?file={encodeURIComponent(selectedComponent.file_path)}" class="edit-btn">
							📝 Edit
						</a>
					</div>
				</div>

				<div class="detail-section">
					<h3>📂 File Info</h3>
					<dl class="info-grid">
						<dt>Path</dt>
						<dd>{selectedComponent.file_path}</dd>
						<dt>Type</dt>
						<dd>{selectedComponent.unit_kind}</dd>
						{#if selectedComponent.route_id}
							<dt>Route</dt>
							<dd>{selectedComponent.route_id}</dd>
						{/if}
						<dt>Last Indexed</dt>
						<dd>{formatRelativeTime(selectedComponent.indexed_at)}</dd>
						<dt>Diff Status</dt>
						<dd class="status-{selectedComponent.diff_status}">{selectedComponent.diff_status}</dd>
					</dl>
				</div>

				{#if selectedComponent.uses.length > 0}
					<div class="detail-section">
						<h3>🔧 Uses (Svelte 5 Runes & APIs)</h3>
						<div class="use-list">
							{#each selectedComponent.uses as use}
								<span class="use-badge" class:rune={use.startsWith('$')}>{ use }</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if selectedComponent.children.length > 0}
					<div class="detail-section">
						<h3>📦 Child Components</h3>
						<div class="children-list">
							{#each selectedComponent.children as child}
								<button
									class="child-link"
									onclick={() => searchQuery = child}
								>
									{child}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<div class="detail-section">
					<h3>🏷️ Feature Tags</h3>
					<div class="tag-list">
						{#each selectedComponent.feature_tags as tag}
							<span class="tag large">{tag}</span>
						{/each}
					</div>
				</div>

				<div class="detail-section">
					<h3>📋 Signature</h3>
					<pre class="signature-preview">{selectedComponent.signature_text}</pre>
				</div>
			{:else}
				<div class="no-selection">
					<p>Select a component to view details</p>
				</div>
			{/if}
		</div>

		<div class="activity-panel">
			<h3>🔄 Recent Activity</h3>
			<div class="activity-list">
				{#each recentActivity as activity (activity.id)}
					<div class="activity-item {activity.type}">
						<span class="activity-icon">
							{#if activity.type === 'fix'}🔧
							{:else if activity.type === 'index'}📂
							{:else if activity.type === 'cluster'}🔬
							{:else}📊
							{/if}
						</span>
						<span class="activity-message">{activity.message}</span>
						<span class="activity-time">{formatRelativeTime(activity.timestamp)}</span>
					</div>
				{/each}
				{#if recentActivity.length === 0}
					<p class="no-activity">No recent activity</p>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.container {
		min-height: 100vh; background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);
		color: #e0e0e0; padding: 1.5rem;
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.header h1 {
		font-size: 1.75rem;
		font-weight: 700; margin: 0;
		background: linear-gradient(135deg, #00d4ff, #7c3aed);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.subtitle {
		font-size: 0.875rem; color: #888;
	}

	.header-right {
		display: flex; gap: 1rem;
	}

	.stat-badge {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px; padding: 0.5rem 1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.stat-badge.error {
		border-color: rgba(255, 100, 100, 0.3);
	}

	.stat-badge.cuda-enabled {
		border-color: rgba(0, 212, 255, 0.3);
		background: rgba(0, 212, 255, 0.1);
	}

	.stat-value {
		font-size: 1.25rem;
		font-weight: 700;
	}

	.stat-label {
		font-size: 0.75rem; color: #888;
	}

	.toolbar {
		display: flex; gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.search-input {
		flex: 1; padding: 0.75rem 1rem;
		border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
		color: #fff;
		font-size: 0.875rem;
	}

	.search-input:focus {
		outline: none;
		border-color: #00d4ff;
	}

	.filter-select {
		padding: 0.75rem 1rem;
		border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
		color: #fff;
		font-size: 0.875rem;
	}

	.action-btn {
		padding: 0.75rem 1.5rem;
		border-radius: 8px; border: none;
		background: linear-gradient(135deg, #7c3aed, #00d4ff);
		color: #fff;
		font-weight: 600; cursor: pointer;
		transition: transform 0.2s, box-shadow 0.2s;
	}

	.action-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 20px rgba(124, 58, 237, 0.4);
	}

	.main-content {
		display: grid;
		grid-template-columns: 350px 1fr 280px;
		gap: 1.5rem; height: calc(100vh - 200px);
	}

	.component-list {
		overflow-y: auto; display: flex;
		flex-direction: column; gap: 0.5rem;
	}

	.component-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px; padding: 1rem;
		cursor: pointer; transition: all 0.2s;
		text-align: left; color: inherit;
	}

	.component-card:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.2);
	}

	.component-card.selected {
		border-color: #00d4ff; background: rgba(0, 212, 255, 0.1);
	}

	.component-card.has-errors {
		border-left: 3px solid #ff6464;
	}

	.component-card.modified {
		border-left: 3px solid #ffc107;
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.component-name {
		font-weight: 600;
		font-size: 0.875rem;
	}

	.kind-badge {
		font-size: 0.625rem; padding: 0.125rem 0.5rem;
		background: rgba(124, 58, 237, 0.3);
		border-radius: 4px;
		text-transform: uppercase;
	}

	.card-path {
		font-size: 0.75rem; color: #888;
		margin-bottom: 0.5rem; overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-meta {
		display: flex; gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
		font-size: 0.75rem;
	}

	.error-count {
		color: #ff6464;
	}

	.uses-badge, .children-badge {
		color: #00d4ff;
	}

	.modified-time {
		color: #888;
		margin-left: auto;
	}

	.tags {
		display: flex; gap: 0.25rem;
		margin-top: 0.5rem;
	}

	.tag {
		font-size: 0.625rem; padding: 0.125rem 0.375rem;
		background: rgba(0, 212, 255, 0.2);
		border-radius: 4px; color: #00d4ff;
	}

	.tag.large {
		font-size: 0.75rem; padding: 0.25rem 0.5rem;
	}

	.detail-panel {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px; padding: 1.5rem;
		overflow-y: auto;
	}

	.detail-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.detail-header h2 {
		font-size: 1.25rem; margin: 0;
	}

	.detail-actions {
		display: flex; gap: 0.5rem;
	}

	.fix-btn, .edit-btn {
		padding: 0.5rem 1rem;
		border-radius: 6px; border: none;
		font-weight: 600; cursor: pointer;
		text-decoration: none;
		font-size: 0.875rem;
	}

	.fix-btn {
		background: linear-gradient(135deg, #10b981, #00d4ff);
		color: #fff;
	}

	.edit-btn {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	.detail-section {
		margin-bottom: 1.5rem;
	}

	.detail-section h3 {
		font-size: 0.875rem; color: #888;
		margin-bottom: 0.75rem;
	}

	.info-grid {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.5rem 1rem;
		font-size: 0.875rem;
	}

	.info-grid dt {
		color: #888;
	}

	.info-grid dd {
		margin: 0;
		word-break: break-all;
	}

	.status-clean { color: #10b981; }
	.status-modified { color: #ffc107; }
	.status-new { color: #00d4ff; }
	.status-deleted { color: #ff6464; }

	.use-list {
		display: flex;
		flex-wrap: wrap; gap: 0.5rem;
	}

	.use-badge {
		padding: 0.25rem 0.5rem;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		font-size: 0.75rem;
		font-family: monospace;
	}

	.use-badge.rune {
		background: rgba(124, 58, 237, 0.3);
		color: #c084fc;
	}

	.children-list {
		display: flex;
		flex-wrap: wrap; gap: 0.5rem;
	}

	.child-link {
		padding: 0.25rem 0.5rem;
		background: rgba(0, 212, 255, 0.1);
		border: 1px solid rgba(0, 212, 255, 0.3);
		border-radius: 4px; color: #00d4ff;
		cursor: pointer;
		font-size: 0.75rem;
	}

	.child-link:hover {
		background: rgba(0, 212, 255, 0.2);
	}

	.tag-list {
		display: flex;
		flex-wrap: wrap; gap: 0.5rem;
	}

	.signature-preview {
		background: rgba(0, 0, 0, 0.3);
		padding: 1rem;
		border-radius: 8px;
		font-size: 0.75rem;
		font-family: monospace;
		white-space: pre-wrap;
		overflow-x: auto;
		max-height: 200px;
	}

	.no-selection {
		display: flex;
		align-items: center;
		justify-content: center; height: 100%;
		color: #888;
	}

	.activity-panel {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px; padding: 1rem;
		overflow-y: auto;
	}

	.activity-panel h3 {
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.activity-list {
		display: flex;
		flex-direction: column; gap: 0.5rem;
	}

	.activity-item {
		padding: 0.5rem; background: rgba(255, 255, 255, 0.05);
		border-radius: 6px;
		font-size: 0.75rem; display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.activity-item.fix { border-left: 2px solid #10b981; }
	.activity-item.index { border-left: 2px solid #00d4ff; }
	.activity-item.cluster { border-left: 2px solid #7c3aed; }
	.activity-item.embed { border-left: 2px solid #ffc107; }

	.activity-message {
		flex: 1; overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.activity-time {
		color: #888;
		white-space: nowrap;
	}

	.no-activity {
		color: #888;
		text-align: center;
		font-size: 0.75rem;
	}

	.loading-state, .error-state, .empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center; height: 200px;
		color: #888;
	}

	.spinner {
		width: 40px; height: 40px;
		border: 3px solid rgba(255, 255, 255, 0.1);
		border-top-color: #00d4ff;
		border-radius: 50%; animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>





