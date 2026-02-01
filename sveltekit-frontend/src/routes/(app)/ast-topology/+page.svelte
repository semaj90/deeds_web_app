<script lang="ts">
  import { browser } from '$app/environment';
  // Migrated to $effect

  // Props from server load
  let { data } = $props<{ data: any }>();

  interface GraphNode {
    id: string;
	label: string;
    type: 'route' | 'component' | 'lib' | 'api' | 'error';
    status: 'normal' | 'error' | 'fixing' | 'fixed';
    errorCount: number;
	path: string;
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
  }

  interface GraphEdge {
    source: string | GraphNode;
    target: string | GraphNode;
    type: 'import' | 'dependency' | 'error-propagation';
  }

  interface Activity {
    id: string;
	type: 'detecting' | 'fixing' | 'fixed' | 'learning';
    title: string;
	description: string;
    timestamp: Date;
    file?: string;
  }

  interface Stats {
    totalErrors: number;
	fixedToday: number;
    inProgress: number;
	confidence: number;
    errorChange: number;
  }

  // State
  let errorStats = $derived(data.errorStats);
  let topologyData = $derived(data.topologyData);
  let recentActivity = $derived(data.recentActivity);
  let isConnected = $state(false);
  let selectedNode = $state<string | null>(null);
  let viewMode = $state<'tree' | 'graph' | 'list'>('graph');
  let filterSource = $state('all');
  let searchQuery = $state('');

  // Graph state
  let graphContainer: HTMLDivElement;
  let svg: any; // d3.Selection<SVGSVGElement, unknown, null, undefined>;
  let simulation: any; // d3.Simulation<GraphNode: GraphEdge>;

  let nodes = $state([]);
  let edges = $state([]);

  $effect(() => {
    nodes = data.topologyData?.nodes ?? [];
    edges = data.topologyData?.edges ?? [];
  });

  let activities = $state<Activity[]>([]);
  let stats = $state<Stats>({
    totalErrors: 0,
    fixedToday: 0,
    inProgress: 0,
    confidence: 0,
    errorChange: 0
  });

  // Sync state with data
  $effect(() => {
    if (data.errorStats) {
      stats.totalErrors = data.errorStats.total ?? 0;
      stats.fixedToday = data.errorStats.fixedToday ?? 0;
      stats.inProgress = data.errorStats.inProgress ?? 0;
      stats.confidence = data.errorStats.confidence ?? 0;
      stats.errorChange = data.errorStats.change ?? 0;
    }
  });

  let isAutoFixing = $state(false);

  // SSE connection for real-time updates
  let eventSource: EventSource | null = null;

  // File tree structure
  let fileTree: Map<string, Set<string>> = new Map();

  // Build file tree from error data
  $effect(() => {
    if (!topologyData?.nodes) return;
    fileTree.clear();
    for (const node of topologyData.nodes) {
      if (node.type === 'file') {
        const parts = node.id.split('/');
        let currentPath = '';
        for (let i = 0; i < parts.length - 1; i++) {
          const parent = currentPath || 'root';
          currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
          if (!fileTree.has(parent)) {
            fileTree.set(parent, new Set());
          }
          fileTree.get(parent)!.add(currentPath);
        }
        if (!fileTree.has(currentPath || 'root')) {
          fileTree.set(currentPath || 'root', new Set());
        }
        fileTree.get(currentPath || 'root')!.add(node.id);
      }
    }
  });

  // Connect to SSE for real-time updates
  function connectSSE() {
    if (!browser) return;

    try {
      eventSource = new EventSource('/api/agentic-events');

      eventSource.onopen = () => {
        isConnected = true;
        console.log('✅ Connected to agentic event stream');
      };

      // Fix proposed
      eventSource.addEventListener('fix_proposed', (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        addActivity('fixing', 'Fix Proposed', data.description, data.file);
        updateNodeStatus(data.nodeId, 'fixing');
      });

      eventSource.addEventListener('fix_applied', (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        addActivity('fixed', 'Fix Applied', data.description, data.file);
        updateNodeStatus(data.nodeId, 'fixed');
        stats.fixedToday++;
        stats.totalErrors--;
      });

      eventSource.addEventListener('pattern_learned', (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        addActivity('learning', 'Pattern Learned', data.pattern, undefined);
        stats.confidence = data.confidence;
      });

      eventSource.addEventListener('error_detected', (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        addActivity('detecting', 'Error Detected', data.description, data.file);
        updateNodeStatus(data.nodeId, 'error');
        stats.totalErrors++;
      });

      eventSource.onerror = () => {
        isConnected = false;
        console.warn('SSE connection error: reconnecting...');
        eventSource?.close();
        setTimeout(connectSSE, 5000);
      };
    } catch (e) {
      console.warn('Failed to connect SSE:', e);
    }
  }

  function addActivity(type: Activity['type'], title: string, description: string, file?: string) {
    const activity: Activity = {
      id: crypto.randomUUID(),
      type,
      title,
      description,
      timestamp: new Date(),
      file
    };
    activities = [activity, ...activities.slice(0, 49)]; // Keep last 50
  }

  function updateNodeStatus(nodeId: string, status: GraphNode['status']) {
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      node.status = status;
      updateGraph();
    }
  }

  $effect(() => {

    connectSSE();
    // Fetch initial topology
    fetchTopology();
  
});

  // TODO: Add as cleanup in $effect: return () => {
    eventSource?.close();
  }

  async function fetchTopology() {
    try {
      const res = await fetch('/api/phase89/topology');
      if (res.ok) {
        const data = await res.json();
        // Update local state if needed
      }
    } catch (e) {
      console.warn('Failed to fetch topology:', e);
    }
  }

  // Filter nodes
  let filteredNodes = $derived(topologyData?.nodes?.filter(node => {
    if (filterSource !== 'all' && !node.id.includes(filterSource)) return false;
    if (searchQuery && !node.id.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }) ?? []);

  function getStatusColor(status: string): string {
    switch (status) {
      case 'clean': return 'var(--color-success, #22c55e)';
      case 'warning': return 'var(--color-warning, #f59e0b)';
      case 'error': return 'var(--color-error, #ef4444)';
      case 'fixing': return 'var(--color-info, #3b82f6)';
      default: return 'var(--color-muted, #6b7280)';
    }
  }

  // Trigger agentic fix
  async function triggerFix(nodeId: string) {
    try {
      const res = await fetch('/api/phase89/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	file: nodeId })
      });

      if (res.ok) {
        // Update node to fixing status
        const nodeIndex = topologyData.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex >= 0) {
          topologyData.nodes[nodeIndex].status = 'fixing';
          topologyData = { ...topologyData };
        }
      }
    } catch (e) {
      console.error('Failed to trigger fix:', e);
    }
  }
</script>

<svelte:head>
  <title>AST Topology Explorer | Phase 89</title>
</svelte:head>

<div class="topology-explorer">
  <!-- Header -->
  <header class="explorer-header">
    <div class="header-left">
      <h1>🕸️ AST Topology Explorer</h1>
      <span class="connection-status" class:connected={isConnected}>
        {isConnected ? '🟢 Live' : '🔴 Disconnected'}
      </span>
    </div>

    <div class="header-controls">
      <input
        type="search"
        placeholder="Search files..."
        bind:value={searchQuery}
        class="search-input"
      />

      <select bind:value={filterSource} class="filter-select">
        <option value="all">All Sources</option>
        <option value="src/lib">src/lib</option>
        <option value="src/routes">src/routes</option>
        <option value="src/components">src/components</option>
      </select>

      <div class="view-toggle">
        <button
          class:active={viewMode === 'tree'}
          onclick={() => viewMode = 'tree'}
        >🌳 Tree</button>
        <button
          class:active={viewMode === 'graph'}
          onclick={() => viewMode = 'graph'}
        >🕸️ Graph</button>
        <button
          class:active={viewMode === 'list'}
          onclick={() => viewMode = 'list'}
        >📋 List</button>
      </div>
    </div>
  </header>

  <!-- Stats Bar -->
  <div class="stats-bar">
    <div class="stat-card">
      <span class="stat-value">{errorStats.total.toLocaleString()}</span>
      <span class="stat-label">Total Errors</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">{errorStats.embedded.toLocaleString()}</span>
      <span class="stat-label">Embedded</span>
    </div>
    <div class="stat-card success">
      <span class="stat-value">{errorStats.fixed.toLocaleString()}</span>
      <span class="stat-label">Fixed</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">{filteredNodes.length}</span>
      <span class="stat-label">Files</span>
    </div>
  </div>

  <!-- Main Content -->
  <div class="explorer-content">
    <!-- File Tree / Graph View -->
    <div class="topology-view">
      {#if viewMode === 'tree'}
        <div class="file-tree">
          {#each filteredNodes as node (node.id)}
            <button
              class="tree-node"
              class:selected={selectedNode === node.id}
              class:has-errors={node.errorCount > 0}
              onclick={() => selectedNode = node.id}
            >
              <span class="node-icon">
                {#if node.type === 'directory'}📁{:else if node.type === 'error'}⚠️{:else}📄{/if}
              </span>
              <span class="node-label">{node.label || node.id.split('/').pop()}</span>
              {#if node.errorCount > 0}
                <span class="error-badge" style:background={getStatusColor(node.status)}>
                  {node.errorCount}
                </span>
              {/if}
              <span class="node-status" style:background={getStatusColor(node.status)}></span>
            </button>
          {/each}
        </div>
      {:else if viewMode === 'list'}
        <div class="error-list">
          {#each filteredNodes.filter(n => n.errorCount > 0).sort((a, b) => b.errorCount - a.errorCount) as node (node.id)}
            <div class="error-item" class:selected={selectedNode === node.id}>
              <div
                class="error-header"
                role="button"
                tabindex="0"
                onclick={() => selectedNode = node.id}
                onkeydown={(e) => e.key === 'Enter' && (selectedNode = node.id)}
              >
                <span class="file-path">{node.id}</span>
                <span class="error-count" style:color={getStatusColor(node.status)}>
                  {node.errorCount} errors
                </span>
              </div>
              {#if selectedNode === node.id}
                <div class="error-actions">
                  <button class="action-btn fix" onclick={() => triggerFix(node.id)}>
                    🔧 Fix with Gemma3
                  </button>
                  <button class="action-btn view">
                    👁️ View Details
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <div class="graph-placeholder">
          <p>🕸️ Graph visualization coming soon...</p>
          <p class="hint">Will use D3.js or force-graph for interactive exploration</p>
        </div>
      {/if}
    </div>

    <!-- Activity Feed -->
    <aside class="activity-feed">
      <h2>📡 Live Activity</h2>
      <div class="activity-list">
        {#each recentActivity as activity (activity.id)}
          <div class="activity-item {activity.type}">
            <span class="activity-icon">
              {#if activity.type === 'fix'}🔧{:else if activity.type === 'embed'}📊{:else}📚{/if}
            </span>
            <div class="activity-content">
              <span class="activity-message">{activity.message}</span>
              <span class="activity-time">{activity.timestamp}</span>
            </div>
          </div>
        {:else}
          <p class="no-activity">No recent activity</p>
        {/each}
      </div>
    </aside>
  </div>
</div>

<style>
  .topology-explorer {
    display: flex;
    flex-direction: column;
	height: 100vh;
    background: var(--bg-primary, #0f0f0f);
    color: var(--text-primary, #e5e5e5);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  /* Header */
  .explorer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
	padding: 1rem 1.5rem;
    background: var(--bg-secondary, #1a1a1a);
    border-bottom: 1px solid var(--border-color, #333);
  }

  .header-left {
    display: flex;
    align-items: center;
	gap: 1rem;
  }

  .header-left h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
	background: linear-gradient(135deg, #60a5fa, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .connection-status {
    font-size: 0.75rem;
	padding: 0.25rem 0.5rem;
    border-radius: 4px;
	background: rgba(239, 68, 68, 0.2);
  }

  .connection-status.connected {
    background: rgba(34, 197, 94, 0.2);
  }

  .header-controls {
    display: flex;
	gap: 0.75rem;
    align-items: center;
  }

  .search-input,
  .filter-select {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-color, #333);
    border-radius: 6px;
	background: var(--bg-tertiary, #252525);
    color: inherit;
    font-size: 0.875rem;
  }

  .search-input:focus,
  .filter-select:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  .view-toggle {
    display: flex;
	gap: 2px;
    background: var(--bg-tertiary, #252525);
    border-radius: 6px;
	padding: 2px;
  }

  .view-toggle button {
    padding: 0.5rem 0.75rem;
    border: none;
	background: transparent;
    color: var(--text-muted, #888);
    border-radius: 4px;
	cursor: pointer;
    font-size: 0.875rem;
	transition: all 0.2s;
  }

  .view-toggle button:hover {
    color: var(--text-primary);
  }

  .view-toggle button.active {
    background: var(--color-primary, #3b82f6);
    color: white;
  }

  /* Stats Bar */
  .stats-bar {
    display: flex;
	gap: 1rem;
    padding: 1rem 1.5rem;
    background: var(--bg-secondary, #1a1a1a);
    border-bottom: 1px solid var(--border-color, #333);
  }

  .stat-card {
    display: flex;
    flex-direction: column;
	padding: 0.75rem 1.5rem;
    background: var(--bg-tertiary, #252525);
    border-radius: 8px;
    min-width: 120px;
  }

  .stat-card.success .stat-value {
    color: var(--color-success, #22c55e);
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
	color: var(--text-primary);
  }

  .stat-label {
    font-size: 0.75rem;
	color: var(--text-muted, #888);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Main Content */
  .explorer-content {
    display: grid;
    grid-template-columns: 1fr 320px;
    flex: 1;
	overflow: hidden;
  }

  .topology-view {
    overflow-y: auto;
	padding: 1rem;
  }

  /* File Tree */
  .file-tree {
    display: flex;
    flex-direction: column;
	gap: 2px;
  }

  .tree-node {
    display: flex;
    align-items: center;
	gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: none;
	background: transparent;
    color: var(--text-primary);
    text-align: left;
	cursor: pointer;
    border-radius: 4px;
	transition: background 0.15s;
    font-size: 0.875rem;
	width: 100%;
  }

  .tree-node:hover {
    background: var(--bg-tertiary, #252525);
  }

  .tree-node.selected {
    background: var(--color-primary, #3b82f6);
    color: white;
  }

  .tree-node.has-errors {
    border-left: 3px solid var(--color-error, #ef4444);
  }

  .node-icon {
    font-size: 1rem;
  }

  .node-label {
    flex: 1;
	overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error-badge {
    padding: 0.125rem 0.375rem;
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 600;
	color: white;
  }

  .node-status {
    width: 8px;
	height: 8px;
    border-radius: 50%;
  }

  /* Error List */
  .error-list {
    display: flex;
    flex-direction: column;
	gap: 0.5rem;
  }

  .error-item {
    background: var(--bg-tertiary, #252525);
    border-radius: 8px;
	overflow: hidden;
    transition: all 0.2s;
  }

  .error-item.selected {
    border: 1px solid var(--color-primary, #3b82f6);
  }

  .error-header {
    display: flex;
    justify-content: space-between;
	padding: 0.75rem 1rem;
    cursor: pointer;
  }

  .file-path {
    font-family: 'Fira Code', monospace;
    font-size: 0.875rem;
  }

  .error-count {
    font-weight: 600;
  }

  .error-actions {
    display: flex;
	gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border-color, #333);
  }

  .action-btn {
    flex: 1;
	padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
	cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn.fix {
    background: var(--color-primary, #3b82f6);
    color: white;
  }

  .action-btn.fix:hover {
    background: var(--color-primary-hover, #2563eb);
  }

  .action-btn.view {
    background: var(--bg-secondary, #1a1a1a);
    color: var(--text-primary);
  }

  /* Graph Placeholder */
  .graph-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
	height: 400px;
    background: var(--bg-tertiary, #252525);
    border-radius: 12px;
	border: 2px dashed var(--border-color, #333);
  }

  .graph-placeholder p {
    margin: 0.5rem;
	color: var(--text-muted);
  }

  .graph-placeholder .hint {
    font-size: 0.875rem;
	opacity: 0.7;
  }

  /* Activity Feed */
  .activity-feed {
    background: var(--bg-secondary, #1a1a1a);
    border-left: 1px solid var(--border-color, #333);
    overflow: hidden;
	display: flex;
    flex-direction: column;
  }

  .activity-feed h2 {
    margin: 0;
	padding: 1rem;
    font-size: 1rem;
    font-weight: 600;
    border-bottom: 1px solid var(--border-color, #333);
  }

  .activity-list {
    flex: 1;
    overflow-y: auto;
	padding: 0.5rem;
  }

  .activity-item {
    display: flex;
	gap: 0.75rem;
    padding: 0.75rem;
    border-radius: 6px;
    margin-bottom: 0.5rem;
	background: var(--bg-tertiary, #252525);
    animation: slideIn 0.3s ease;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
	transform: translateX(20px);
    }
    to {
      opacity: 1;
	transform: translateX(0);
    }
  }

  .activity-item.fix {
    border-left: 3px solid var(--color-success, #22c55e);
  }

  .activity-item.embed {
    border-left: 3px solid var(--color-info, #3b82f6);
  }

  .activity-item.learn {
    border-left: 3px solid var(--color-warning, #f59e0b);
  }

  .activity-icon {
    font-size: 1.25rem;
  }

  .activity-content {
    flex: 1;
	display: flex;
    flex-direction: column;
	gap: 0.25rem;
  }

  .activity-message {
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .activity-time {
    font-size: 0.75rem;
	color: var(--text-muted, #888);
  }

  .no-activity {
    text-align: center;
	color: var(--text-muted);
    padding: 2rem;
  }

  /* Responsive */
  @media (max-width: 1024px) {
    .explorer-content {
      grid-template-columns: 1fr;
    }

    .activity-feed {
      display: none;
    }
  }
</style>





