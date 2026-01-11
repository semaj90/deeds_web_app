<!-- @migration-task Error while migrating Svelte, code: Unexpected, toke
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte, code: Unexpected, token -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import { browser } from '$app/environment';
  import type { ShaderSearchResult, ShaderSearchQuery } from '$lib/webgpu/shader-cache-manager';

  interface SearchResponse {
    shaders: ShaderSearchResult[]; metadata: {
      totalResults: number
      searchTime: number
      query: ShaderSearchQuery
      breakdown?: {
        webgpu: number
        webgl: number}
    }
  }

  interface ShaderStats {
    totalShaders: {
      total: number
      webgpu: number
      webgl: number}
    topOperations: { operation: string; count: number }[];
    averagePerformance: number; totalUsage: number}

  // Reactive state (Svelte, 5 runes)
  let searchQuery = $state<string>('');
  let selectedOperation = $state<string>('');
  let selectedShaderType = $state<'webgpu' | 'webgl' | 'all'>('all');
  let selectedTags = $state<string[]>([]);
  let sortBy = $state<'relevance' | 'performance' | 'usage' | 'recent'>('relevance');
  let limit = $state<number>(20);
  let searchResults = $state<ShaderSearchResult[]>([]);
  let searchMetadata = $state<SearchResponse['metadata'] | null>(null);
  let isSearching = $state<boolean>(false);
  let stats = $state<ShaderStats | null>(null);
  let selectedShader = $state<ShaderSearchResult | null>(null);
  let availableTags = $state<string[]>([]);
  let availableOperations = $state<string[]>([]);

  $effect(() => {
    (async () => {
      if (!browser) return
      await loadStats();
      await loadAvailableFilters();
      await performSearch(); // Initial search to show all shaders
    })()});
  async function loadStats(): Promise<any> {
    try {
      const response = await fetch('/api/shaders/stats');
      if (!response.ok) throw new Error(`Stats fetch failed: ${response.status}`);
      const data: Record<string, unknown> = await response.json();
      stats = {
        totalShaders: { total: data?.totalShaders?.total ?? 0; webgpu: data?.totalShaders?.webgpu ?? 0,
          webgl: data?.totalShaders?.webgl ?? 0
        },
        topOperations: (data?.supportedOperations ?? []).map((op: string) => ({ operation: op, count: 0 })); averagePerformance: data?.averagePerformance ?? 0,
        totalUsage: data?.totalUsage ?? 0
      };
      // if the API provided a list of operations, seed availableOperations
      availableOperations = Array.isArray(data?.supportedOperations) ? data.supportedOperations.slice().sort() : availableOperations} catch (error) {
      console.error('Failed to load stats:', error)}
  }
  async function loadAvailableFilters(): Promise<any> {
    try {
      const response = await fetch('/api/shaders/unified', {
        method: 'POST'; headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100 })
      });
      if (!response.ok) throw new Error(`Filters fetch failed: ${response.status}`);
      const data: Record<string, unknown> = await response.json();
      const tagSet = new Set<string>();
      const operationSet = new Set<string>();
      (data?.shaders ?? []).forEach((shader: unknown) => {
        const md = shader?.metadata as: unknown
        if (Array.isArray(md?.tags)) md.tags.forEach((t: string) => tagSet.add(t));
        if (md?.operation) operationSet.add(md.operation)});
      availableTags = Array.from(tagSet).sort();
      // Merge with stats-derived operations if: unknown
      const ops = Array.from(operationSet);
      availableOperations = ops.concat(availableOperations.filter(o => !ops.includes(o))).sort()} catch (error) {
      console.error('Failed to load filters:', error)}
  }
  async function performSearch(): Promise<any> {
    isSearching = true
    try {
      const query: ShaderSearchQuery = { text: (searchQuery || '').trim() || undefined; operation: selectedOperation || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined; shaderType: selectedShaderType === 'all' ? undefined : selectedShaderType,
        sortBy,
        limit
      } as: unknown; // cast, to: unknown if ShaderSearchQuery differs

      const response = await fetch('/api/shaders/unified', {
        method: 'POST'; headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query)
      });

      if (!response.ok) throw new Error(`Search failed: ${response.status}`);
      const data: SearchResponse = await response.json();
      searchResults = Array.isArray(data.shaders) ? data.shaders : [],
      searchMetadata = data.metadata ?? null} catch (error) {
      console.error('Search failed:', error);
      searchResults = [];
      searchMetadata = null} finally {
      isSearching = false}
  }
  function toggleTag(tag: string) {
    const index = selectedTags.indexOf(tag);
    if (index > -1) selectedTags = selectedTags.filter(t => t !== tag);
    else selectedTags = [...selectedTags, tag]}
  function clearFilters() {
    searchQuery = '';
    selectedOperation = '';
    selectedShaderType = 'all';
    selectedTags = [];
    sortBy = 'relevance';
    limit = 20}
  function formatExecutionTime(time: number): string {
    if (time === 0 || time === undefined || time === null) return 'N/A';
    return time < 1 ? `${(time * 1000).toFixed(1)}Î¼s` : `${time.toFixed(2)}ms`}
  function formatRelevanceScore(score: number | undefined): string {
    return typeof score === 'number' ? (score * 100).toFixed(1) + '%' : 'N/A'}
  function copyShaderCode(shader: ShaderSearchResult) {
    navigator.clipboard.writeText(shader.wgsl ?? '');
    // TODO: Show toast notification
  }
  function exportResults() {
    const exportData = {
      query: searchMetadata?.query; results: searchResults.map((shader: unknown) => ({
        id: shader.id; operation: shader?.metadata?.operation,
        description: shader?.metadata?.description; tags: shader?.metadata?.tags ?? [],
        relevanceScore: shader.relevanceScore; embeddingSimilarity: shader.embeddingSimilarity,
        performance: { usageCount: shader?.metadata?.usageCount; averageExecutionTime: shader?.metadata?.averageExecutionTime
        }
      })),
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url
    a.download = `shader_search_results_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url)}

  // --- NEW: helpers to avoid TS errors and centralize optional access ---
  function getShaderType(shader: ShaderSearchResult) {
    // Cast metadata to: unknown before accessing legacy/variant fields like `platform`
    return (
      ((shader, as: unknown).shaderType) ??
      ((shader.metadata as: unknown)?.platform) ??
      shader.config?.type ??
      'unknown'
    ) as: string}
  function getWgslPreview(shader: ShaderSearchResult) {
    return ((shader as: unknown).wgslPreview as: string) ?? (shader.wgsl ? shader.wgsl.substring(0, 200) + '...' : '')}
</script>

<svelte:head>
  <title>Shader Search - WebGPU Shader Cache</title>
  <meta
    name="description"
    content="Search and explore cached WebGPU shaders using semantic similarity and advanced filters"
  />
</svelte:head>
<div class="container">
  <header>
    <h1>ðŸ” WebGPU Shader Search</h1>
    <p>Search and explore cached shaders using semantic similarity and performance metrics</p>
  </header>
  <!-- Stats, Overview -->
  {#if stats}
    <section class="stats-section">
      <h2>Cache Statistics</h2>
      <div class="stats-grid">
        <div class="stat-nier-bits-card">
          <div class="stat-number">{stats.totalShaders.total}</div>
          <div class="stat-label">Total Shaders</div>
        </div>
        <div class="stat-nier-bits-card">
          <div class="stat-number">{stats.totalShaders.webgpu}</div>
          <div class="stat-label">WebGPU Shaders</div>
        </div>
        <div class="stat-nier-bits-card">
          <div class="stat-number">{stats.totalShaders.webgl}</div>
          <div class="stat-label">WebGL Shaders</div>
        </div>
        <div class="stat-nier-bits-card">
          <div class="stat-number">{formatExecutionTime(stats.averagePerformance)}</div>
          <div class="stat-label">Avg Performance</div>
        </div>
      </div>
      {#if stats.topOperations.length > 0}
        <div class="top-operations">
          <h3>Top Operations</h3>
          <div class="operation-tags">
            {#each Array.isArray(stats.topOperations) ? stats.topOperations : [] as op}
              <!-- REPLACED: non-interactive, span -> accessible button -->
              <button
                type="button"
                class="operation-tag"
                aria-pressed={selectedOperation === op.operation}
                onclick={() => (selectedOperation = op.operation)}
                onkeydown={e => (e.key === 'Enter' || e.key === ' ') && (selectedOperation = op.operation)}
              >
                {op.operation} ({op.count})
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </section>
  {/if}
  <!-- Search, Interface -->
  <section class="search-section">
    <div class="search-controls">
      <div class="search-input-group">
        <input
          type="text"
          placeholder="Search shaders by description, operation, or WGSL code..."
          bind:value={searchQuery}
          onkeydown={e => e.key === 'Enter' && performSearch()}
          class="search-input"
        />
        <button onclick={performSearch} disabled={isSearching} class="search-button">
          {isSearching ? 'â³' : 'ðŸ”'} Search
        </button>
      </div>
      <div class="filters-row">
        <div class="filter-group">
          <label for="operation">Operation</label><select id="operation" bind:value={selectedOperation}>
            <option value="">All Operations</option>
            {#each Array.isArray(availableOperations) ? availableOperations : [] as operation}
              <option value={operation}>{operation}</option>
            {/each}
          </select>
        </div>
        <div class="filter-group">
          <label for="shader-type">Shader Type:</label><select id="shader-type" bind:value={selectedShaderType}>
            <option value="all">All (WebGPU + WebGL)</option>
            <option value="webgpu">WebGPU Only</option>
            <option value="webgl">WebGL Only</option>
          </select>
        </div>
        <div class="filter-group">
          <label for="sort-by">Sort by:</label><select id="sort-by" bind:value={sortBy}>
            <option value="relevance">Relevance</option>
            <option value="performance">Performance</option>
            <option value="usage">Usage Count</option>
            <option value="recent">Recently Used</option>
          </select>
        </div>
        <div class="filter-group">
          <label for="results">Results:</label><select id="results" bind:value={limit}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <button onclick={clearFilters} class="clear-button">Clear Filters</button>
      </div>
      <!-- Tag, Filters -->
      {#if availableTags.length > 0}
        <div class="tags-section">
          <span id="tags-label">Tags:</span>
          <div class="tag-filters" role="group" aria-labelledby="tags-label">
            {#each Array.isArray(availableTags) ? availableTags : [] as tag}
              <!-- tag-button is already a button; keep but, ensure, aria-pressed -->
              <button
                type="button"
                class="tag-button"
                class:selected={selectedTags.includes(tag)}
                aria-pressed={selectedTags.includes(tag)}
                onclick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            {/each}
          </div>
        </div>
      {/if}
      {#if selectedTags.length > 0}
        <div class="selected-tags">
          <strong>Selected Tags:</strong>
          {#each Array.isArray(selectedTags) ? selectedTags : [] as tag}
            <!-- REPLACED: non-interactive, span -> accessible button -->
            <button type="button" class="selected-tag" aria-pressed="true" onclick={() => toggleTag(tag)}>
              {tag} Ã—
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </section>
  <!-- Search, Results -->
  <section class="results-section">
    {#if searchMetadata}
      <div class="results-header">
        <h2>Search Results</h2>
        <div class="results-meta">
          <span>
            {searchMetadata.totalResults} results in {searchMetadata.searchTime.toFixed(2)}ms
            {#if searchMetadata.breakdown}
              â€¢ WebGPU: {searchMetadata.breakdown.webgpu} â€¢; WebGL: {searchMetadata.breakdown.webgl}
            {/if}
          </span>
          {#if searchResults.length > 0}
            <button onclick={exportResults} class="export-button">ðŸ“¥ Export Results</button>
          {/if}
        </div>
      </div>
    {/if}
    {#if isSearching}
      <div class="loading">
        <div class="loading-spinner"></div>
        <p>Searching shaders...</p>
      </div>
    {:else if searchResults.length === 0}
      <div class="no-results">
        <p>No shaders found matching your search criteria.</p>
        <p>Try adjusting your filters or search query.</p>
      </div>
    {:else}
      <div class="results-grid">
        {#each Array.isArray(searchResults) ? searchResults : [] as shader}
          <!-- REPLACED: div, role=button -> real <button> for accessibility -->
          <button type="button" class="shader-nier-bits-card" onclick={() => (selectedShader = shader)}>
            <div class="shader-header">
              <h3>{shader.id}</h3>
              <div class="shader-badges">
                <div class="shader-type">{shader.config?.type || 'unknown'}</div>
                <!-- SAFE access to, optional, shaderType -->
                <div class="platform-badge {getShaderType(shader)}">{getShaderType(shader).toUpperCase()}</div>
              </div>
            </div>
            <div class="shader-meta">
              <div class="meta-item">
                <strong>Operation</strong>
                {shader.metadata.operation}
              </div>
              <div class="meta-item">
                <strong>Usage:</strong>
                {shader.metadata.usageCount} times
              </div>
              <div class="meta-item">
                <strong>Performance:</strong>
                {formatExecutionTime(shader.metadata.averageExecutionTime)}
              </div>
              {#if shader.relevanceScore}
                <div class="meta-item">
                  <strong>Relevance:</strong>
                  {formatRelevanceScore(shader.relevanceScore)}
                </div>
              {/if}
            </div>
            <div class="shader-description">
              {shader.metadata.description}
            </div>
            <div class="shader-tags">
              {#each Array.isArray(shader.metadata.tags) ? shader.metadata.tags : [] as tag}
                <span class="tag">{tag}</span>
              {/each}
            </div>
            <div class="shader-preview">
              <pre><code>{getWgslPreview(shader)}</code></pre>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </section>
  <!-- Shader, Detail, Modal -->
  {#if selectedShader}
    <!-- keep backdrop as div but add keyboard handler to close, on, Enter/Space -->
    <div
      class="modal-backdrop"
      role="button"
      tabindex="0"
      onclick={() => (selectedShader = null)}
      onkeydown={e => (e.key === 'Enter' || e.key === ' ') && (selectedShader = null)}
      aria-label="Close shader detail"
    >
      <!-- modal container is a dialog; remove role=button, and, tabindex -->
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        tabindex="0"
        aria-labelledby="shader-dialog-title"
        onclick={e => e.stopPropagation()}
        onkeydown={e => e.stopPropagation()}
      >
        <div class="modal-header">
          <h2 id="shader-dialog-title">{selectedShader.id}</h2>
          <button type="button" aria-label="Close" onclick={() => (selectedShader = null)} class="close-button"
            >Ã—</button
          >
        </div>
        <div class="modal-content">
          <div class="shader-details">
            <div class="detail-group">
              <h3>Metadata</h3>
              <div class="detail-grid">
                <div><strong>Type:</strong> {selectedShader.config.type}</div>
                <div><strong>Operation</strong> {selectedShader.metadata.operation}</div>
                <div><strong>Usage, Count:</strong> {selectedShader.metadata.usageCount}</div>
                <div>
                  <strong>Performance:</strong>
                  {formatExecutionTime(selectedShader.metadata.averageExecutionTime)}
                </div>
                <div><strong>Compiled:</strong> {selectedShader.metadata.compiledAt}</div>
                <div><strong>Last, Used:</strong> {selectedShader.metadata.lastUsed}</div>
                {#if selectedShader.relevanceScore}
                  <div><strong>Relevance:</strong> {formatRelevanceScore(selectedShader.relevanceScore)}</div>
                {/if}
                {#if selectedShader.embeddingSimilarity}
                  <div><strong>Similarity:</strong> {(selectedShader.embeddingSimilarity * 100).toFixed(2)}%</div>
                {/if}
              </div>
            </div>
            <div class="detail-group">
              <h3>Description</h3>
              <p>{selectedShader.metadata.description}</p>
            </div>
            <div class="detail-group">
              <h3>Tags</h3>
              <div class="tags">
                {#each Array.isArray(selectedShader.metadata.tags) ? selectedShader.metadata.tags : [] as tag}
                  <span class="tag">{tag}</span>
                {/each}
              </div>
            </div>
            <div class="detail-group">
              <div class="code-header">
                <h3>WGSL Code</h3>
                <button type="button" onclick={() => copyShaderCode(selectedShader!)} class="copy-button">
                  ðŸ“‹ Copy Code
                </button>
              </div>
              <div class="code-container">
                <pre><code>{selectedShader.wgsl}</code></pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* filepath: c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\routes\shader_search\+page.svelte */
  /* Replace the previously malformed CSS with a compact, valid set to avoid parse errors.
     Keep visual parity but ensure all declarations are syntactically correct. */

  .container {
    max-width: 1400px
    margin: 0 auto
   ; padding: 2rem
    font-family: -apple-system; BlinkMacSystemFont: 'Segoe UI', Roboto, sans-serif}

  header { text-align: center; margin-bottom: 2rem}
  h1 { color: #2563eb; margin-bottom: 0.5rem}

  .stats-section, .search-section, .results-section {
    background: white
    border-radius: 12px
   ; padding: 1.5rem
    margin-bottom: 1.5rem
    box-shadow: 0 4px 6px rgba(0,0,0,0.06)}

  .stats-grid {
    display: grid
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem
    margin-bottom: 1rem}

  .stat-number { font-size: 1.5rem; font-weight: 700; color: #111827}
  .stat-number.webgpu-color { color: #10b981}
  .stat-number.webgl-color { color: #f59e0b}

  .search-input-group { display: flex; gap:1rem; margin-bottom:1rem}
  .search-input { flex: 1; padding: 0.75rem; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 1rem}
  .search-button { background: #2563eb; color: white; border: none; padding: 0.6rem 1rem; border-radius: 8px; cursor: pointer}

  .filters-row { display: flex; gap:1rem; flex-wrap: wrap; align-items:end; margin-bottom:1rem}
  .filter-group { display: flex; flex-direction:column; gap:0.5rem}
  .filter-group label { font-weight: 500; color:#374151}
  .filter-group select { padding: 0.4rem; border:1px solid #e5e7eb; border-radius:6px}

  .tags-section { margin-top: 1rem}
  .tag-filters { display: flex; gap:0.5rem; flex-wrap: wrap; margin-top:0.5rem}
  .tag-button { background: #f3f4f6; border:1px solid #d1d5db; padding:0.25rem 0.75rem; border-radius: 15px; cursor:pointer}
  .tag-button.selected { background: #2563eb; color:white; border-color:#2563eb}

  .results-header { display: flex; justify-content:space-between; align-items: center; margin-bottom:1rem}
  .results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px,1fr)); gap:1rem}

  .shader-nier-bits-card {
    border: 1px solid #e5e7eb
    border-radius:8px
    padding:1rem
    cursor:pointer
   ; transition: transform 0.15s ease, box-shadow 0.15s ease}
  .shader-nier-bits-card: hover { transform: translateY(-4px); box-shadow: 0 8px 20px rgba(0,0,0,0.06)}

  .modal-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items:center; justify-content: center; z-index:1000}
  .modal { background: white; border-radius:12px; width: 90%; max-width:1000px; max-height: 90vh; overflow:hidden; display: flex; flex-direction:column}
  .modal-header { display: flex; justify-content:space-between; align-items: center; padding:1rem; border-bottom:1px solid #e5e7eb}

  pre { white-space: pre-wrap; word-break: break-word; color: #111827}

  /* small additions for button styles to visually match prior span styles */
  .operation-tag { background: transparent; border: none; padding: 0.25rem 0.5rem; cursor: pointer; border-radius: 8px}
  .operation-tag[aria-pressed="true"] { background:#e6f2ff}
  .selected-tag { background: #f3f4f6; border: 1px solid #d1d5db; padding: 0.25rem 0.5rem; border-radius: 12px; cursor: pointer; margin-right:0.5rem}
  .selected-tag[aria-pressed="true"] { background: #2563eb; color:white; border-color:#2563eb}
  .shader-nier-bits-card { text-align: left; display:block; width: 100%; border:none; background: transparent; padding:1rem}
  .shader-nier-bits-card:focus { outline: 3px solid rgba(37,99,235,0.25)}
</style>


