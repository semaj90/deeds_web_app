<script lang="ts">
	import { onMount } from 'svelte';

	// State using Svelte 5 $state runes
	let tools = $state<any[]>([]);
	let categories = $state<string[]>([]);
	let selectedCategory = $state<string>('all');
	let selectedTool = $state<string>('');
	let toolArgs = $state<string>('{}');
	let result = $state<any>(null);
	let loading = $state(false);
	let systemHealth = $state<any>(null);
	let error = $state<string>('');

	// Derived filtered tools
	let filteredTools = $derived(
		selectedCategory === 'all'
			? tools
			: tools.filter((t) => t.category === selectedCategory)
	);

	onMount(async () => {
		await loadTools();
		await checkHealth();
	});

	async function loadTools() {
		try {
			const res = await fetch('/api/acp/tools');
			const data = await res.json();
			tools = data.tools || [];
			categories = [...new Set(tools.map((t: any) => t.category))];
		} catch (e) {
			error = 'Failed to load tools';
		}
	}

	async function checkHealth() {
		try {
			const res = await fetch('/api/acp/execute', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tool: 'system:health', args: {} })
			});
			const data = await res.json();
			systemHealth = data.result?.services ?? {};
		} catch {
			systemHealth = null;
		}
	}

	async function executeTool() {
		if (!selectedTool) return;

		loading = true;
		error = '';
		result = null;

		try {
			const args = JSON.parse(toolArgs);
			const res = await fetch('/api/acp/execute', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tool: selectedTool, args })
			});
			const data = await res.json();
			result = data;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Execution failed';
		} finally {
			loading = false;
		}
	}

	function selectTool(toolName: string) {
		selectedTool = toolName;
		toolArgs = '{}';
		result = null;

		// Set default args based on tool
		const defaults: Record<string, any> = {
			'knowledge:search': { query: 'Svelte 5 runes', topK: 5 },
			'llm:generate': { prompt: 'Hello, explain Svelte 5', maxTokens: 256 },
			'llm:embed': { text: 'Svelte 5 runes for state management' },
			'vector:similarity': { text: 'Svelte reactivity', topK: 5 },
			'ast:analyze': { filePath: 'src/lib/components/Example.svelte' },
			'code:search': { pattern: 'export let', path: 'src' },
			'db:query': { query: 'SELECT table_name FROM information_schema.tables LIMIT 5' }
		};

		if (defaults[toolName]) {
			toolArgs = JSON.stringify(defaults[toolName], null, 2);
		}
	}

	function getStatusIcon(status: string) {
		switch (status) {
			case 'healthy':
				return '🟢';
			case 'unhealthy':
				return '🟡';
			default:
				return '🔴';
		}
	}

	function getCategoryIcon(category: string) {
		const icons: Record<string, string> = {
			knowledge: '📚',
			database: '🗄️',
			cache: '💾',
			storage: '📦',
			llm: '🧠',
			code: '💻',
			agent: '🤖',
			fix: '🔧',
			system: '⚙️',
			vector: '🔢',
			ast: '🌳',
			drizzle: '💧',
			testing: '🧪',
			search: '🔍',
			external: '🌐'
		};
		return icons[category] || '📋';
	}
</script>

<svelte:head>
	<title>ACP Tool Dashboard | Phase 76</title>
	<meta name="description" content="Agent Communication Protocol Tool Dashboard" />
</svelte:head>

<div class="dashboard">
	<!-- Header -->
	<header class="header">
		<div class="header-content">
			<h1>🛠️ ACP Tool Dashboard</h1>
			<p class="subtitle">Phase 76 Agent Communication Protocol</p>
		</div>
		<div class="header-stats">
			<span class="stat">{tools.length} Tools</span>
			<span class="stat">{categories.length} Categories</span>
		</div>
	</header>

	<!-- System Health -->
	{#if systemHealth}
		<section class="health-panel">
			<h2>System Health</h2>
			<div class="health-grid">
				{#each Object.entries(systemHealth) as [service, status]}
					<div class="health-item" class:healthy={status === 'healthy'} class:offline={status === 'offline'}>
						<span class="health-icon">{getStatusIcon(status as string)}</span>
						<span class="health-name">{service}</span>
						<span class="health-status">{status}</span>
					</div>
				{/each}
			</div>
			<button class="refresh-btn" onclick={checkHealth}>🔄 Refresh</button>
		</section>
	{/if}

	<div class="main-layout">
		<!-- Tool Browser -->
		<aside class="tool-browser">
			<div class="category-filter">
				<label for="category">Category:</label>
				<select id="category" bind:value={selectedCategory}>
					<option value="all">All Categories</option>
					{#each categories as cat}
						<option value={cat}>{getCategoryIcon(cat)} {cat.toUpperCase()}</option>
					{/each}
				</select>
			</div>

			<div class="tool-list">
				{#each filteredTools as tool}
					<button
						class="tool-item"
						class:selected={selectedTool === tool.name}
						onclick={() => selectTool(tool.name)}
					>
						<span class="tool-icon">{getCategoryIcon(tool.category)}</span>
						<div class="tool-info">
							<span class="tool-name">{tool.name}</span>
							<span class="tool-desc">{tool.description}</span>
						</div>
					</button>
				{/each}
			</div>
		</aside>

		<!-- Execution Panel -->
		<main class="execution-panel">
			{#if selectedTool}
				<div class="executor">
					<h2>{selectedTool}</h2>
					<p class="tool-description">
						{tools.find((t) => t.name === selectedTool)?.description}
					</p>

					<div class="args-section">
						<label for="args">Arguments (JSON):</label>
						<textarea
							id="args"
							bind:value={toolArgs}
							rows="6"
							placeholder={'{"query", "example"}'}
						></textarea>
					</div>

					<button class="execute-btn" onclick={ executeTool } disabled={loading}>
						{#if loading}
							⏳ Executing...
						{:else}
							▶️ Execute Tool
						{/if}
					</button>

					{#if error}
						<div class="error-box">
							❌ {error}
						</div>
					{/if}

					{#if result}
						<div class="result-box">
							<h3>Result</h3>
							<div class="result-meta">
								<span class:success={result.success} class:failure={!result.success}>
									{result.success ? '✅ Success' : '❌ Failed'}
								</span>
								{#if result.metadata?.duration}
									<span class="duration">⏱️ {result.metadata.duration}ms</span>
								{/if}
							</div>
							<pre class="result-json">{JSON.stringify(result.result ?? result.error, null, 2)}</pre>
						</div>
					{/if}
				</div>
			{:else}
				<div class="placeholder">
					<div class="placeholder-icon">🛠️</div>
					<h2>Select a Tool</h2>
					<p>Choose a tool from the sidebar to execute it</p>

					<div class="quick-actions">
						<h3>Quick Actions</h3>
						<button onclick={() => selectTool('system:health')}>🏥 System Health</button>
						<button onclick={() => selectTool('llm:models')}>🧠 List LLM Models</button>
						<button onclick={() => selectTool('knowledge:search')}>🔍 Knowledge Search</button>
						<button onclick={() => selectTool('agent:discover')}>🤖 Discover Agents</button>
					</div>
				</div>
			{/if}
		</main>
	</div>
</div>

<style>
	.dashboard {
		min-height: 100vh;
		background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #0f0f1a 100%);
		color: #e0e0e0;
		font-family: 'Inter', -apple-system: BlinkMacSystemFont, sans-serif;
	}

	.header {
		background: linear-gradient(90deg, #1a1a2e 0%, #2a2a4e 100%);
		padding: 1.5rem 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.header h1 {
		margin: 0;
		font-size: 1.8rem; background: linear-gradient(135deg, #00d4ff, #00ff88);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.subtitle {
		margin: 0.25rem 0 0;
		color: #888;
		font-size: 0.9rem;
	}

	.header-stats {
		display: flex; gap: 1rem;
	}

	.stat {
		background: rgba(0, 212, 255, 0.1);
		border: 1px solid rgba(0, 212, 255, 0.3);
		padding: 0.5rem 1rem;
		border-radius: 20px;
		font-size: 0.85rem; color: #00d4ff;
	}

	.health-panel {
		background: rgba(255, 255, 255, 0.03);
		padding: 1rem 2rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.health-panel h2 {
		margin: 0 0 1rem;
		font-size: 1rem; color: #888;
	}

	.health-grid {
		display: flex; gap: 1rem;
		flex-wrap: wrap;
	}

	.health-item {
		display: flex;
		align-items: center; gap: 0.5rem;
		background: rgba(255, 255, 255, 0.05);
		padding: 0.5rem 1rem;
		border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.health-item.healthy {
		border-color: rgba(0, 255, 136, 0.3);
	}

	.health-item.offline {
		border-color: rgba(255, 100, 100, 0.3);
	}

	.health-name {
		font-weight: 500;
		text-transform: capitalize;
	}

	.health-status {
		color: #666;
		font-size: 0.8rem;
	}

	.refresh-btn {
		margin-top: 1rem; background: transparent;
		border: 1px solid rgba(0, 212, 255, 0.3);
		color: #00d4ff; padding: 0.4rem 0.8rem;
		border-radius: 6px; cursor: pointer;
		font-size: 0.8rem;
	}

	.refresh-btn:hover {
		background: rgba(0, 212, 255, 0.1);
	}

	.main-layout {
		display: grid;
		grid-template-columns: 320px 1fr;
		min-height: calc(100vh - 180px);
	}

	.tool-browser {
		background: rgba(0, 0, 0, 0.3);
		border-right: 1px solid rgba(255, 255, 255, 0.05);
		overflow-y: auto;
	}

	.category-filter {
		padding: 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.category-filter label {
		display: block;
		font-size: 0.8rem; color: #888;
		margin-bottom: 0.5rem;
	}

	.category-filter select {
		width: 100%; padding: 0.6rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px; color: #e0e0e0;
		font-size: 0.9rem;
	}

	.tool-list {
		padding: 0.5rem;
	}

	.tool-item {
		width: 100%; display: flex;
		align-items: flex-start; gap: 0.75rem;
		padding: 0.75rem; background: transparent;
		border: 1px solid transparent;
		border-radius: 8px; cursor: pointer;
		text-align: left; color: #e0e0e0;
		transition: all 0.2s;
	}

	.tool-item:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.1);
	}

	.tool-item.selected {
		background: rgba(0, 212, 255, 0.1);
		border-color: rgba(0, 212, 255, 0.3);
	}

	.tool-icon {
		font-size: 1.2rem;
		flex-shrink: 0;
	}

	.tool-info {
		display: flex;
		flex-direction: column; gap: 0.25rem;
	}

	.tool-name {
		font-weight: 500;
		font-size: 0.9rem;
	}

	.tool-desc {
		font-size: 0.75rem; color: #888;
		line-height: 1.3;
	}

	.execution-panel {
		padding: 2rem;
	}

	.executor h2 {
		margin: 0 0 0.5rem;
		color: #00d4ff;
		font-size: 1.4rem;
	}

	.tool-description {
		color: #888;
		margin-bottom: 1.5rem;
	}

	.args-section {
		margin-bottom: 1.5rem;
	}

	.args-section label {
		display: block;
		font-size: 0.85rem; color: #888;
		margin-bottom: 0.5rem;
	}

	.args-section textarea {
		width: 100%; padding: 1rem;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px; color: #e0e0e0;
		font-family: 'Fira Code', monospace;
		font-size: 0.9rem; resize: vertical;
	}

	.args-section textarea:focus {
		outline: none;
		border-color: rgba(0, 212, 255, 0.5);
	}

	.execute-btn {
		background: linear-gradient(135deg, #00d4ff, #00ff88);
		color: #000; border: none;
		padding: 0.8rem 2rem;
		border-radius: 8px;
		font-weight: 600;
		font-size: 1rem; cursor: pointer;
		transition: all 0.2s;
	}

	.execute-btn:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 4px 20px rgba(0, 212, 255, 0.3);
	}

	.execute-btn:disabled {
		opacity: 0.6; cursor: not-allowed;
	}

	.error-box {
		margin-top: 1rem; padding: 1rem;
		background: rgba(255, 100, 100, 0.1);
		border: 1px solid rgba(255, 100, 100, 0.3);
		border-radius: 8px; color: #ff6b6b;
	}

	.result-box {
		margin-top: 1.5rem; background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px; overflow: hidden;
	}

	.result-box h3 {
		margin: 0; padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.05);
		font-size: 0.9rem; color: #888;
	}

	.result-meta {
		display: flex; gap: 1rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.result-meta .success {
		color: #00ff88;
	}

	.result-meta .failure {
		color: #ff6b6b;
	}

	.result-meta .duration {
		color: #888;
	}

	.result-json {
		margin: 0; padding: 1rem;
		font-family: 'Fira Code', monospace;
		font-size: 0.85rem;
		overflow-x: auto;
		max-height: 400px;
		overflow-y: auto;
	}

	.placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center; height: 100%;
		text-align: center; color: #666;
	}

	.placeholder-icon {
		font-size: 4rem;
		margin-bottom: 1rem; opacity: 0.5;
	}

	.placeholder h2 {
		margin: 0 0 0.5rem;
		color: #888;
	}

	.quick-actions {
		margin-top: 2rem;
		padding-top: 2rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.quick-actions h3 {
		font-size: 0.9rem; color: #888;
		margin-bottom: 1rem;
	}

	.quick-actions button {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: #e0e0e0; padding: 0.6rem 1rem;
		border-radius: 6px; margin: 0.25rem;
		cursor: pointer; transition: all 0.2s;
	}

	.quick-actions button:hover {
		background: rgba(0, 212, 255, 0.1);
		border-color: rgba(0, 212, 255, 0.3);
	}

	@media (max-width: 768px) {
		.main-layout {
			grid-template-columns: 1fr;
		}

		.tool-browser {
			max-height: 300px;
		}
	}
</style>





