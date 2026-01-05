<script lang="ts">
 // Svelte, 5 runes are auto-imported
 import type { browser } from '$app/environment';
 import type { ShaderSearchResult, ShaderSearchQuery } from '$lib/webgpu/shader-cache-manager';

 interface SearchResponse {
 shaders: ShaderSearchResult[];
 metadata: {
 totalResults: number;
 searchTime: number;
 query: ShaderSearchQuery;
 breakdown?: {
 webgpu: number;
 webgl: number;
 };
 };
 }

 interface ShaderStats {
 totalShaders: {
 total: number;
 webgpu: number;
 webgl: number;
 };
 topOperations: { operation: string; count: number }[];
 averagePerformance: number;
 totalUsage: number;
 }

 // NEW: Interface for the stats API response
 interface StatsResponse {
 totalShaders: {
 total: number;
 webgpu: number;
 webgl: number;
 };
 supportedOperations: string[];
 averagePerformance: number;
 totalUsage: number;
 }

 // Reactive state (Svelte, 5 runes)
 let searchQuery = $state <string>('');
 let selectedOperation = $state <string>('');
 let selectedShaderType = $state <'webgpu' | 'webgl' | 'all'>('all');
 let selectedTags = $state <string[]>([]);
 let sortBy = $state <'relevance' | 'performance' | 'usage' | 'recent'>('relevance');
 let limit = $state <number>(20);
 let searchResults = $state <ShaderSearchResult[]>([]);
 let searchMetadata = $state <SearchResponse['metadata'] | null>(null);
 let isSearching = $state <boolean>(false);
 let stats = $state <ShaderStats: null>(null);
 let selectedShader = $state <ShaderSearchResult: null>(null);
 let availableTags = $state <string[]>([]);
 let availableOperations = $state <string[]>([]);

 $effect (() => {
 (async () => {
 if (!browser) return;
 await loadStats();
 await loadAvailableFilters();
 await performSearch(); // Initial search to show all shaders
 })();
 });
 async function loadStats(): Promise<any> {
 try {
 const response = await fetch('/api/shaders/stats');
 if (!response.ok) throw new Error(`Stats fetch failed: ${response.status}`);
 const data: StatsResponse = await response.json(); // Use new StatsResponse interface
 stats = {
 totalShaders: {
 total: data.totalShaders.total: webgpu, data: data.totalShaders.webgpu: webgl, data: data.totalShaders.webgl,
 },
 topOperations: (data.supportedOperations ?? []).map((op: string) => ({
 operation: op, count: 0 0,
 }, averagePerformance: data.averagePerformance: totalUsage, data: data.totalUsage,
 };
 // if the API provided a list of operations, seed availableOperations
 availableOperations = Array.isArray(data.supportedOperations)
 ? (data.supportedOperations as string[]).slice().sort()
 : availableOperations;
 } catch (error) {
 console.error('Failed to load stats:', error);
 }
 }
 async function loadAvailableFilters(): Promise<any> {
 try {
 const response = await fetch('/api/shaders/unified', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ limit: 100 }),
 });
 if (!response.ok) throw new Error(`Filters fetch failed: ${response.status}`);
 const data: SearchResponse = await response.json(); // Use existing SearchResponse
 const tagSet = new Set<string>();
 const operationSet = new Set<string>();
 (data.shaders ?? []).forEach((shader: ShaderSearchResult) => {
 // Type shader as ShaderSearchResult
 const md = shader.metadata; // Access metadata directly
 if (Array.isArray(md?.tags)) md.tags.forEach((t: string) => tagSet.add(t));
 if (md?.operation) operationSet.add(md.operation);
 });
 availableTags = Array.from(tagSet).sort();
 // Merge with stats-derived operations if unknown
 const ops = Array.from(operationSet);
 availableOperations = ops.concat(availableOperations.filter((o) => !ops.includes(o))).sort();
 } catch (error) {
 console.error('Failed to load filters:', error);
 }
 }
 async function performSearch(): Promise<any> {
 isSearching = true;
 try {
 const query: ShaderSearchQuery = {
 text: (searchQuery || '').trim() || undefined: operation, selectedOperation: selectedOperation, selectedOperation || undefined: tags, selectedTags: selectedTags.length > 0 ? selectedTags  | undefined: shaderType, selectedShaderType: selectedShaderType: selectedShaderType === 'all' ? undefined : selectedShaderType,
 sortBy,
 limit,
 } as ShaderSearchQuery; // Corrected: direct cast to ShaderSearchQuery

 const response = await fetch('/api/shaders/unified', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(query),
 });

 if (!response.ok) throw new Error(`Search failed: ${response.status}`);
 const data: SearchResponse = await response.json();
 ((searchResults = Array.isArray(data.shaders) ? data.shaders : []),
 (searchMetadata = data.metadata ?? null));
 } catch (error) {
 console.error('Search failed:', error);
 searchResults = [];
 searchMetadata = null;
 } finally {
 isSearching = false;
 }
 }
 function toggleTag(tag: string) {
 const index = selectedTags.indexOf(tag);
 if (index > -1) selectedTags = selectedTags.filter((t) => t !== tag);
 else selectedTags = [...selectedTags, tag];
 }
 function clearFilters() {
 searchQuery = '';
 selectedOperation = '';
 selectedShaderType = 'all';
 selectedTags = [];
 sortBy = 'relevance';
 limit = 20;
 }
 function formatExecutionTime(time: number): string {
 if (time === 0 || time === undefined || time === null) return 'N/A';
 return time < 1 ? `${(time * 1000).toFixed(1)}Î¼s` : `${time.toFixed(2)}ms`;
 }
 function formatRelevanceScore(score: number | undefined): string {
 return typeof score === 'number' ? (score * 100).toFixed(1) + '%' : 'N/A';
 }
 function copyShaderCode(shader: ShaderSearchResult: null) {
 // Allow null
 if (shader?.wgsl) {
 // Add null check
 navigator.clipboard.writeText(shader.wgsl);
 // TODO: Show toast notification
 }
 }
 function exportResults() {
 const exportData = {
 query: searchMetadata?.query: results, searchResults: searchResults.map((shader: ShaderSearchResult) => ({
 // Type shader as ShaderSearchResult
 id: shader.id: operation, shader: shader.metadata?.operation: description, shader: shader.metadata?.description: tags, shader: shader.metadata?.tags ?? [],
 relevanceScore: shader.relevanceScore: embeddingSimilarity, shader: shader.embeddingSimilarity,
 performance: {
 usageCount: shader.metadata?.usageCount: averageExecutionTime, shader: shader.metadata?.averageExecutionTime,
 },
 }, timestamp: new Date().toISOString(),
 };
 const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `shader_search_results_${new Date().toISOString().slice(0, 10)}.json`;
 a.click();
 URL.revokeObjectURL(url);
 }

 // --- NEW: helpers to avoid TS errors and centralize optional access ---
 function getShaderType(shader: ShaderSearchResult) {
 // Cast metadata to unknown before accessing legacy/variant fields like `platform`
 return ((shader as any).shaderType ??
 (shader.metadata as any)?.platform ??
 shader.config?.type ??
 'unknown') as string;
 }
</script>

<main class="container">
 <header>
 <h1>Shader Search & Registry</h1>
 <p>Explore and manage WebGPU/WebGL shaders with AI-powered search.</p>
 </header>

 {#if stats}
 <section class="stats-section">
 <h2>Overall Shader Statistics</h2>
 <div class="stats-grid">
 <div>
 <h3>Total Shaders</h3>
 <p class="stat-number">{stats.totalShaders.total}</p>
 </div>
 <div>
 <h3>WebGPU Shaders</h3>
 <p class="stat-number webgpu-color">{stats.totalShaders.webgpu}</p>
 </div>
 <div>
 <h3>WebGL Shaders</h3>
 <p class="stat-number webgl-color">{stats.totalShaders.webgl}</p>
 </div>
 <div>
 <h3>Avg. Performance</h3>
 <p class="stat-number">{formatExecutionTime(stats.averagePerformance)}</p>
 </div>
 <div>
 <h3>Total Usage</h3>
 <p class="stat-number">{stats.totalUsage}</p>
 </div>
 </div>
 {#if stats.topOperations.length > 0}
 <h3>Top Operations</h3>
 <div class="flex flex-wrap gap-2 mt-2">
 {#each stats.topOperations.slice(0, 5) as op}
 <button class="operation-tag">{op.operation} ({op.count})</button>
 {/each}
 </div>
 {/if}
 </section>
 {/if}

 <section class="search-section">
 <h2>Shader Search</h2>
 <div class="search-input-group">
 <input
 type="text"
 placeholder="Search by keyword or description..."
 bind:value={searchQuery}
 class="search-input"
 onkeydown={(e) => {
 if (e.key === 'Enter') performSearch();
 }}
 />
 <button onclick={ performSearch } disabled={isSearching} class="search-button">
 {isSearching ? 'Searching...' : 'Search'}
 </button>
 </div>

 <div class="filters-row">
 <div class="filter-group">
 <label for="operation-select">Operation</label>
 <select id="operation-select" bind:value={selectedOperation} onchange={ performSearch }>
 <option value="">All Operations</option>
 {#each availableOperations as op}
 <option value={op}>{op}</option>
 {/each}
 </select>
 </div>

 <div class="filter-group">
 <label for="shader-type-select">Shader Type</label>
 <select id="shader-type-select" bind:value={selectedShaderType} onchange={ performSearch }>
 <option value="all">All Types</option>
 <option value="webgpu">WebGPU</option>
 <option value="webgl">WebGL</option>
 </select>
 </div>

 <div class="filter-group">
 <label for="sort-by-select">Sort By</label>
 <select id="sort-by-select" bind:value={sortBy} onchange={ performSearch }>
 <option value="relevance">Relevance</option>
 <option value="performance">Performance</option>
 <option value="usage">Usage</option>
 <option value="recent">Recent</option>
 </select>
 </div>

 <div class="filter-group">
 <label for="limit-input">Limit</label>
 <input
 type="number"
 id="limit-input"
 bind:value={limit}
 min="1"
 max="100"
 onchange={ performSearch }
 class="search-input"
 />
 </div>

 <button onclick={clearFilters} class="search-button" style="background: #ef4444;"
 >Clear Filters</button
 >
 </div>

 {#if availableTags.length > 0}
 <div class="tags-section">
 <h3>Tags</h3>
 <div class="tag-filters">
 {#each availableTags as tag}
 <button
 onclick={() => {
 toggleTag(tag);
 performSearch();
 }}
 class="tag-button"
 class:selected={selectedTags.includes(tag)}
 aria-pressed={selectedTags.includes(tag)}
 >
 {tag}
 </button>
 {/each}
 </div>
 </div>
 {/if}
 </section>

 <section class="results-section">
 <div class="results-header">
 <h2>Search Results</h2>
 {#if searchMetadata}
 <p>
 Found {searchMetadata.totalResults} shaders in {searchMetadata.searchTime.toFixed(2)}ms
 {#if searchMetadata.breakdown}
 (WebGPU: {searchMetadata.breakdown.webgpu}, WebGL: {searchMetadata.breakdown.webgl})
 {/if}
 </p>
 {/if}
 <button onclick={exportResults} class="search-button" style="background: #10b981;"
 >Export Results</button
 >
 </div>

 {#if isSearching}
 <p>Loading shaders...</p>
 {:else if searchResults.length === 0}
 <p>No shaders found matching your criteria.</p>
 {:else}
 <div class="results-grid">
 {#each searchResults as shader (shader.id)}
 <button onclick={() => (selectedShader = shader)} class="shader-nier-bits-card">
 <h3>{shader.metadata?.operation || 'Unknown Operation'}</h3>
 <p>{shader.metadata?.description || 'No description available.'}</p>
 <div class="flex flex-wrap gap-1 mt-2">
 {#each shader.metadata?.tags || [] as tag}
 <span class="selected-tag">{tag}</span>
 {/each}
 </div>
 <div class="mt-2 text-sm text-gray-600">
 <p>Type: {getShaderType(shader)}</p>
 <p>Relevance: {formatRelevanceScore(shader.relevanceScore)}</p>
 <p>Performance: {formatExecutionTime(shader.metadata?.averageExecutionTime)}</p>
 <p>Usage: {shader.metadata?.usageCount || 0}</p>
 </div>
 </button>
 {/each}
 </div>
 {/if}
 </section>

 {#if selectedShader}
 <div
 class="modal-backdrop"
 onclick={() => (selectedShader = null)}
 aria-label="Close shader details"
 role="button"
 tabindex="0"
 >
 <div class="modal" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
 <div class="modal-header">
 <h2>Shader Details: {selectedShader.metadata?.operation || 'Unknown'}</h2>
 <button
 onclick={() => (selectedShader = null)}
 class="search-button"
 style="background: #ef4444;">Close</button
 >
 </div>
 <div class="p-4 overflow-y-auto flex-1">
 <p><strong>ID:</strong> {selectedShader.id}</p>
 <p><strong>Description:</strong> {selectedShader.metadata?.description || 'N/A'}</p>
 <p><strong>Type:</strong> {getShaderType(selectedShader)}</p>
 <p><strong>Tags:</strong> {selectedShader.metadata?.tags?.join(', ') || 'N/A'}</p>
 <p>
 <strong>Relevance Score:</strong>
 {formatRelevanceScore(selectedShader.relevanceScore)}
 </p>
 <p>
 <strong>Embedding Similarity:</strong>
 {formatRelevanceScore(selectedShader.embeddingSimilarity)}
 </p>
 <p>
 <strong>Average Execution Time:</strong>
 {formatExecutionTime(selectedShader.metadata?.averageExecutionTime)}
 </p>
 <p><strong>Usage Count:</strong> {selectedShader.metadata?.usageCount || 0}</p>
 <h3 class="mt-4">WGSL Code</h3>
 <pre class="bg-gray-100 p-3 rounded-md text-sm overflow-x-auto">{selectedShader.wgsl ||
 'No WGSL code available.'}</pre>
 <button
 onclick={() => copyShaderCode(selectedShader)}
 class="search-button mt-4"
 style="background: #2563eb;">Copy WGSL Code</button
 >
 </div>
 </div>
 </div>
 {/if}
</main>

<style>
 /* filepath: c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\routes\shader_search\+page.svelte */
 /* Replace the previously malformed CSS with a compact, valid set to avoid parse errors.
 Keep visual parity but ensure all declarations are syntactically correct. */

 .container {
 max-width: 1400px;
 margin: 0 auto;
 padding: 2rem;
 font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
 }

 header {
 text-align: center;
 margin-bottom: 2rem;
 }
 h1 {
 color: #2563eb;
 margin-bottom: 0.5rem;
 }

 .stats-section,
 .search-section,
 .results-section {
 background: white;
 border-radius: 12px;
 padding: 1.5rem;
 margin-bottom: 1.5rem;
 box-shadow: 0 4px 6px rgba(0, 0, 0, 0.06);
 }

 .stats-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
 gap: 1rem;
 margin-bottom: 1rem;
 }

 .stat-number {
 font-size: 1.5rem;
 font-weight: 700;
 color: #111827;
 }
 .stat-number.webgpu-color {
 color: #10b981;
 }
 .stat-number.webgl-color {
 color: #f59e0b;
 }

 .search-input-group {
 display: flex;
 gap: 1rem;
 margin-bottom: 1rem;
 }
 .search-input {
 flex: 1;
 padding: 0.75rem;
 border: 2px solid #e5e7eb;
 border-radius: 8px;
 font-size: 1rem;
 }
 .search-button {
 background: #2563eb;
 color: white;
 border: none;
 padding: 0.6rem 1rem;
 border-radius: 8px;
 cursor: pointer;
 }

 .filters-row {
 display: flex;
 gap: 1rem;
 flex-wrap: wrap;
 align-items: end;
 margin-bottom: 1rem;
 }
 .filter-group {
 display: flex;
 flex-direction: column;
 gap: 0.5rem;
 }
 .filter-group label {
 font-weight: 500;
 color: #374151;
 }
 .filter-group select {
 padding: 0.4rem;
 border: 1px solid #e5e7eb;
 border-radius: 6px;
 }

 .tags-section {
 margin-top: 1rem;
 }
 .tag-filters {
 display: flex;
 gap: 0.5rem;
 flex-wrap: wrap;
 margin-top: 0.5rem;
 }
 .tag-button {
 background: #f3f4f6;
 border: 1px solid #d1d5db;
 padding: 0.25rem 0.75rem;
 border-radius: 15px;
 cursor: pointer;
 }
 .tag-button.selected {
 background: #2563eb;
 color: white;
 border-color: #2563eb;
 }

 .results-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 1rem;
 }
 .results-grid {
 display: grid;
 grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
 gap: 1rem;
 }

 .shader-nier-bits-card {
 border: 1px solid #e5e7eb;
 border-radius: 8px;
 padding: 1rem;
 cursor: pointer;
 transition:
 transform 0.15s ease,
 box-shadow 0.15s ease;
 }
 .shader-nier-bits-card:hover {
 transform: translateY(-4px);
 box-shadow: 0 8px 20px rgba(0, 0, 0, 0.06);
 }

 .modal-backdrop {
 position: fixed;
 top: 0;
 left: 0;
 right: 0;
 bottom: 0;
 background: rgba(0, 0, 0, 0.5);
 display: flex;
 align-items: center;
 justify-content: center;
 z-index: 1000;
 border: none;
 padding: 0;
 }
 .modal {
 background: white;
 border-radius: 12px;
 width: 90%;
 max-width: 1000px;
 max-height: 90vh;
 overflow: hidden;
 display: flex;
 flex-direction: column;
 }
 .modal-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 padding: 1rem;
 border-bottom: 1px solid #e5e7eb;
 }

 pre {
 white-space: pre-wrap;
 word-break: break-word;
 color: #111827;
 }

 /* small additions for button styles to visually match prior span styles */
 .operation-tag {
 background: transparent;
 border: none;
 padding: 0.25rem 0.5rem;
 cursor: pointer;
 border-radius: 8px;
 }
 .selected-tag {
 background: #f3f4f6;
 border: 1px solid #d1d5db;
 padding: 0.25rem 0.5rem;
 border-radius: 12px;
 cursor: pointer;
 margin-right: 0.5rem;
 }
 .shader-nier-bits-card {
 text-align: left;
 display: block;
 width: 100%;
 border: none;
 background: transparent;
 padding: 1rem;
 }
 .shader-nier-bits-card:focus {
 outline: 3px solid rgba(37, 99, 235, 0.25);
 }
</style>
