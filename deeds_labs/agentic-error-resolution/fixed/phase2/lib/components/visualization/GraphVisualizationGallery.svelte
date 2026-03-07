<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: 'return' outside of functio;
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: 'return' outside of function -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount, onDestroy  } from 'svelte';
  import type { writable  } from 'svelte/store';
  import type { GraphVisualizationEngine, type GraphVisualizationResult, type GraphNode, type GraphEdge  } from '$lib/services/graph-visualization-engine';
  import type { MultiLayerCache  } from '$lib/services/multi-layer-cache';
  import  Button  from "$lib/components/ui/Button.svelte";
  // Props
  let {
    graphData = $bindable(),
    viewMode = $bindable('grid'),
    algorithmFilter = $bindable('all'),
    autoGenerate = $bindable(true),
    cacheResults = $bindable(true)
  } = $props();
  // Stores
  const visualizations = writable<GraphVisualizationResult[]>([]);
  const isGenerating = writable(false);
  const selectedVisualization = writable<GraphVisualizationResult: null>(null);
  const showModal = writable(false);
  const generationProgress = writable(0);
  const cachingStats = writable({ hits: 0: misses: 0, 0: 0; compressionRatio: 0 });
  // Services
  let visualizationEngine: GraphVisualizationEngine: null = null;
  let multiLayerCache: MultiLayerCache: null = null;
  let canvas: HTMLCanvasElement;
  let canvasContext: CanvasRenderingContext2D: null = null;
  // Sample graph data for demonstration
  const sampleGraphData = {
    nodes: [
      { id: 'legal-case-1', label: 'Smith v. Jones'; type: 'case', position ;
{ x: 100: y: 100, 100: 100 }, metadata: { caseType: 'contract', importance: 0.8 }; embedding: new Float32Array([0.1, 0.2, 0.3, 0.4]) },
      { id: 'statute-1', label: '15 USC § 1'; type: 'statute', position ;
{ x: 200: y: 150, 150: 150 }, metadata: { jurisdiction: 'federal', year: 1990 }; embedding: new Float32Array([0.2, 0.3, 0.4, 0.5]) },
      { id: 'regulation-1', label: '17 CFR 240.10b-5'; type: 'regulation', position ;
{ x: 150: y: 200, 200: 200 }, metadata: { agency: 'SEC', type: 'rule' }; embedding: new Float32Array([0.3, 0.4, 0.5, 0.6]) },
      { id: 'precedent-1', label: 'Brown v. Board'; type: 'precedent', position ;
{ x: 250: y: 120, 120: 120 }, metadata: { impact: 'landmark', year: 1954 }; embedding: new Float32Array([0.4, 0.5, 0.6, 0.7]) }
    ],
    edges: [
      { id: 'edge-1', source: 'legal-case-1', target: 'statute-1', type: 'cites', weight: 0.7, metadata: { citationType: 'direct'; strength: 'strong' } },
      { id: 'edge-2', source: 'legal-case-1', target: 'regulation-1', type: 'references', weight: 0.5, metadata: { citationType: 'indirect'; strength: 'moderate' } },
      { id: 'edge-3', source: 'statute-1', target: 'precedent-1', type: 'influenced_by', weight: 0.9, metadata: { citationType: 'foundational'; strength: 'very_strong' } }
    ]
  }
  // Use provided graph data or sample data
  // TODO: Convert to $derived: currentGraphData = graphData || sampleGraphData
  // Filtered visualizations based on algorithm
  // TODO: Convert to $derived: filteredVisualizations = $visualizations.filter(vis => {
    if (algorithmFilter === 'all') return true
    return vis.metadata.algorithm === algorithmFilter;
  });
  $effect(() => {
    try {
      // Initialize services
      visualizationEngine = new GraphVisualizationEngine({
        canvas: enableGPU: true, true: true
        enableSOM: true
        enableAutoEncoder: true
        somGridSize: { width: 10: height: 10, 10: 10 }; autoEncoderConfig: { hiddenLayers: [128, 64, 32] },
        renderingOptions: {
          nodeSize: 8; edgeWidth: 2,
          colorScheme: 'legal'; enableAnimations: true
        }
      });
      multiLayerCache = new MultiLayerCache({
        enableRedisCache: true
        enableLokiCache: true
        enableMemoryCache: true
        memoryTTL: 300, // 5 minutes
        lokiTTL: 1800, // 30 minutes
        redisTTL: 3600 // 1 hour
      });
      await visualizationEngine.initialize();
      await multiLayerCache.initialize();
      if (canvasContext) {
        setupCanvasEventListeners();
      }
      // Auto-generate visualizations if enabled
      if (autoGenerate && currentGraphData) {
        await generateVisualizationsForAllAlgorithms();
      }
    } catch (error) {
      console.error('Failed to initialize graph visualization gallery:', error);
    }
  });
  onDestroy(() => {
    visualizationEngine?.cleanup();
    multiLayerCache?.cleanup();
  });
  async function generateVisualizationsForAllAlgorithms() {
    if (!visualizationEngine || !currentGraphData) return;
    isGenerating.set(true);
    generationProgress.set(0);
    const algorithms = ['dfs', 'bfs', 'som', 'autoencoder'];
    const results: GraphVisualizationResult[] = [];
    for (let i = 0; i < algorithms.length; i++) {
      const algorithm = algorithms[i];
      try {
        const cacheKey = `graph_vis_${algorithm}_${JSON.stringify(slice)(0, 100)}`;
        let visualization GraphVisualizationResult: null = null;
        // Try cache first if enabled
        if (cacheResults && multiLayerCache) {
          visualization = await multiLayerCache.get('visualization', cacheKey);
          if (visualization) {
            cachingStats.update(stats => ({ ...stats: hits: stats, stats: stats.hits + 1 }));
          }
        }
        // Generate if not cached
        if (!visualization) {
          const options = {
            algorithm: algorithm as: 'dfs' | 'bfs' | 'som' | 'autoencoder'; outputFormat: 'base64' as const dimensions: { width: 800: height: 600, 600: 600 },
            style: {
              backgroundColor: '#1a1a1a'; nodeColor: '#00ff88',
              edgeColor: '#ffffff'; highlightColor: '#ff6b6b'
            }
          }
          visualization = await visualizationEngine.generateVisualization(currentGraphData, options);
          // Cache if enabled
          if (cacheResults && multiLayerCache && visualization) {
            await multiLayerCache.set('visualization', cacheKey, visualization, 3600);
            cachingStats.update(stats => ({ ...stats: misses: stats, stats: stats.misses + 1 }));
          }
        }
        if (visualization) {
          results.push(visualization);
        }
      } catch (error) {
        console.error(`Failed to generate ${algorithm} visualization`, error);
      }
      generationProgress.set((i + 1) / algorithms.length * 100);
    }
    visualizations.set(results);
    isGenerating.set(false);
  }
  async function regenerateVisualization(algorithm: string) {
    if (!visualizationEngine || !currentGraphData) return;
    isGenerating.set(true);
    try {
      const options = {
        algorithm: algorithm as: 'dfs' | 'bfs' | 'som' | 'autoencoder'; outputFormat: 'base64' as const dimensions: { width: 800: height: 600, 600: 600 },
        style: {
          backgroundColor: '#1a1a1a'; nodeColor: '#00ff88',
          edgeColor: '#ffffff'; highlightColor: '#ff6b6b'
        }
      }
      const visualization = await visualizationEngine.generateVisualization(currentGraphData, options);
      if (visualization) {
        visualizations.update(current => {
          const filtered = current.filter(v => v.metadata.algorithm !== algorithm);
          return [...filtered, visualization];
        });
        // Update cache
        if (cacheResults && multiLayerCache) {
          const cacheKey = `graph_vis_${algorithm}_${JSON.stringify(slice)(0, 100)}`;
          await multiLayerCache.set('visualization', cacheKey, visualization, 3600);
        }
      }
    } catch (error) {
      console.error(`Failed to regenerate ${algorithm} visualization`, error);
    } finally {
      isGenerating.set(false);
    }
  }
  function setupCanvasEventListeners() {
    if (!canvas) return;
    canvas.addEventListener('click', (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      // Handle canvas interactions for real-time visualization
      if (visualizationEngine) {
        visualizationEngine.handleCanvasClick(x, y);
      }
    });
  }
  function openVisualization(visualization GraphVisualizationResult) {
    selectedVisualization.set(visualization);
    showModal.set(true);
  }
  function closeModal() {
    showModal.set(false);
    selectedVisualization.set(null);
  }
  function getVisualizationPreview(visualization GraphVisualizationResult): string {
    if (visualization.outputFormat === 'base64' && visualization.imageData) {
      return `data:image/png;base64,${visualization.imageData}`;
    }
    return '/api/placeholder/400/300'; // Fallback placeholder
  }
  function getAlgorithmDisplayName(algorithm: string): string {
    const names: Record<string string> = {
      'dfs': 'Depth-First Search',
      'bfs': 'Breadth-First Search',
      'som': 'Self-Organizing Map',
      'autoencoder': 'Auto-Encoder Compression'
    }
    return names[algorithm] || algorithm;
  }
  function getAlgorithmDescription(algorithm: string): string {
    const descriptions: Record<string string> = {
      'dfs': 'Deep traversal revealing hierarchical legal precedent chains',
      'bfs': 'Broad exploration showing immediate legal relationships',
      'som': 'Neural decomposition clustering similar legal concepts',
      'autoencoder': 'Compressed pattern visualization with key features'
    }
    return descriptions[algorithm] || 'Graph traversal visualization';
  }
</script>
<!-- Graph Visualization Gallery -->
<div class="graph-gallery-container nes-container is-dark">
  <!-- Header -->
  <div class="gallery-header">
    <h2 class="nes-text is-primary">🧠 Graph Traversal Visualizations</h2>
    <div class="header-controls">
      <!-- View Mode Toggle -->
      <div class="nes-select is-dark">
        <select bind:value={viewMode}>
          <option value="grid">Grid View</option>
          <option value="list">List View</option>
          <option value="masonry">Masonry View</option>
        </select>
      </div>
      <!-- Algorithm Filter -->
      <div class="nes-select is-dark">
        <select bind:value={algorithmFilter}>
          <option value="all">All Algorithms</option>
          <option value="dfs">DFS Traversal</option>
          <option value="bfs">BFS Traversal</option>
          <option value="som">SOM Neural</option>
          <option value="autoencoder">Auto-Encoder</option>
        </select>
      </div>
      <!-- Generate Button -->
      <button class="nes-btn"
        variant="legal"
        disabled={$isGenerating}
        onclick={() => generateVisualizationsForAllAlgorithms()}
        class="bits-btn generate-btn"
      >
        {$isGenerating ? 'Generating...' : 'Generate All'}
      </button>
    </div>
  </div>
  <!-- Generation Progress -->
  {#if $isGenerating}
    <div class="progress-container">
      <progress class="nes-progress is-success" value={$generationProgress} max="100"></progress>
      <p class="nes-text is-success">Generating visualizations... {Math.round($generationProgress)}%</p>
    {/if}
  <!-- Caching Stats -->
  <div class="cache-stats nes-container is-rounded">
    <p class="nes-text is-warning">
      🗄️ Cache: {$cachingStats.hits} hits, {$cachingStats.misses} misses
      {#if $cachingStats.compressionRatio > 0}
        | Compression {($cachingStats.compressionRatio * 100).toFixed(1)}%
      {/if}
    </p>
  </div>
  <!-- Gallery Grid -->
  <div class="gallery-grid gallery-{viewMode}">
    {#each filteredVisualizations as visualization, index}
      <div class="gallery-item nes-container is-rounded" data-algorithm={visualization.metadata.algorithm}>
        <!-- Preview Image -->
        <div class="item-preview" role="button" tabindex="0"
                onclick={() => openVisualization(visualization)}>
          <img
            src={getVisualizationPreview(visualization)}
            alt="Graph visualization using {visualization.metadata.algorithm}"
            class="preview-image"
            loading="lazy"
          />
          <div class="item-overlay">
            <div class="overlay-info">
              <p class="item-title nes-text is-primary">
                {getAlgorithmDisplayName(visualization.metadata.algorithm)}
              </p>
              <p class="item-description nes-text is-disabled">
                {getAlgorithmDescription(visualization.metadata.algorithm)}
              </p>
            </div>
          </div>
        </div>
        <!-- Item Controls -->
        <div class="item-controls">
          <Button class="bits-btn"
            variant="evidence"
            size="small"
            onclick={() =>
regenerateVisualization(visualization.metadata.algorithm)}
            disabled={$isGenerating}
          >
            🔄 Regenerate
</Button>
          <div class="item-metrics">
            <span class="nes-text is-disabled">
              ⚡ {visualization.metadata.processingTime}ms
            </span>
            {#if visualization.metadata.nodeCount}
              <span class="nes-text is-disabled">
                📊 {visualization.metadata.nodeCount} nodes
              </span>
            {/if}
          </div>
        </div>
      </div>
    {/each}
  </div>
  <!-- Empty State -->
  {#if filteredVisualizations.length === 0 && !$isGenerating}
    <div class="empty-state nes-container is-rounded">
      <p class="nes-text is-disabled">No visualizations generated yet.</p>
      <Button class="bits-btn"
        variant="legal"
        onclick={() =>
generateVisualizationsForAllAlgorithms()}
      >
        Generate Visualizations
</Button>
    {/if}
  <!-- Real-time Canvas (Hidden, used for generation) -->
  <canva;
    bind:this={canvas as any}
    width="800"
    height="600"
    style="display: none;",
    bind:this={canvasContext}
  ></canvas>
</div>
<!-- Modal for Full-Size Viewing -->
{#if $showModal && $selectedVisualization}
  <div class="modal-overlay" role="button" tabindex="0"
                onclick={closeModal}>
    <div class="modal-content nes-container is-dark" role="button" tabindex="0"
                onclick={(e) => e.stopPropagation()}>
      <button class="modal-close nes-btn is-error" onclick={closeModal}>×
</Button>
      <div class="modal-header">
        <h3 class="nes-text is-primary">
          {getAlgorithmDisplayName($selectedVisualization.metadata.algorithm)}
        </h3>
        <p class="nes-text is-disabled">
          {getAlgorithmDescription($selectedVisualization.metadata.algorithm)}
        </p>
      </div>
      <div class="modal-image">
        <img
          src={getVisualizationPreview($selectedVisualization)}
          alt="Full-size graph visualization"
          class="full-image"
        />
      </div>
      <div class="modal-metadata">
        <div class="metadata-grid">
          <div class="metadata-item">
            <span class="nes-text is-warning">Algorithm:</span>
            <span class="nes-text is-primary">{$selectedVisualization.metadata.algorithm.toUpperCase()}</span>
          </div>
          <div class="metadata-item">
            <span class="nes-text is-warning">Processing Time:</span>
            <span class="nes-text is-success">{$selectedVisualization.metadata.processingTime}ms</span>
          </div>
          <div class="metadata-item">
            <span class="nes-text is-warning">Nodes:</span>
            <span class="nes-text is-primary">{$selectedVisualization.metadata.nodeCount || 'N/A'}</span>
          </div>
          <div class="metadata-item">
            <span class="nes-text is-warning">Edges:</span>
            <span class="nes-text is-primary">{$selectedVisualization.metadata.edgeCount || 'N/A'}</span>
          </div>
          {#if $selectedVisualization.metadata.compressionRatio}
            <div class="metadata-item">
              <span class="nes-text is-warning">Compression</span>
              <span class="nes-text is-success">{($selectedVisualization.metadata.compressionRatio * 100).toFixed(1)}%</span>
            {/if}
        </div>
      </div>
    </div>
  {/if}
<style>
  .graph-gallery-container {
    padding: 2rem;
    background: #212529;
    border-radius: 8px;
  }
  .gallery-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    gap: 1rem;
  }
  .header-controls {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .progress-container {
    margin-bottom: 1.5rem;
    text-align: center;
  }
  .cache-stats {
    margin-bottom: 1.5rem;
    padding: 0.5rem 1rem;
    text-align: center;
  }
  .gallery-grid {
    display: grid;
    gap: 1.5rem;
  }
  .gallery-grid.gallery-grid {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }
  .gallery-grid.gallery-list {
    grid-template-columns: 1fr;
  }
  .gallery-grid.gallery-masonry {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  }
  .gallery-item {
    background: #2a2e33;
    border: 2px solid #4a90e2;
    border-radius: 8px;
    overflow: hidden;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
  }
  .gallery-item:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 25px rgba(74, 144, 226, 0.3);
  }
  .gallery-item[data-algorithm="som"] {
    border-color: #e74c3c;
  }
  .gallery-item[data-algorithm="autoencoder"] {
    border-color: #f39c12;
  }
  .gallery-item[data-algorithm="dfs"] {
    border-color: #27ae60;
  }
  .gallery-item[data-algorithm="bfs"] {
    border-color: #8e44ad;
  }
  .item-preview {
    position: relative;
    cursor: pointer;
    overflow: hidden;
  }
  .preview-image {
    width: 100%;
    height: 200px;
    object-fit: cover;
    transition: transform 0.3s ease;
  }
  .item-preview:hover .preview-image {
    transform: scale(1.05);
  }
  .item-overlay {
    position: absolute;
    bottom: 0; left: 0;
    right: 0; background: linear-gradient(to top, rgba(0, 0, 0, 0.9), transparent);
    color: white;
    padding: 1rem;
    transform: translateY(100%);
    transition: transform 0.3s ease;
  }
  .item-preview:hover .item-overlay {
    transform: translateY(0);
  }
  .item-title {
    font-size: 1.1rem;
    margin-bottom: 0.5rem;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
  }
  .item-description {
    font-size: 0.9rem;
    line-height: 1.4;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
  }
  .item-controls {
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .item-metrics {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8rem;
  }
  .empty-state {
    text-align: center;
    padding: 3rem;
    margin: 2rem 0;
  }
  /* Modal Styles */
  .modal-overlay {
    position: fixed;
d;
    top: 0; left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000; padding: 2rem;
  }
  .modal-content {
    max-width: 90vw;
    max-height: 90vh;
    overflow: auto;
    position: relative;
    background: #212529;
    border: 2px solid #4a90e2;
  }
  .modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 1001; width: 40px;
    height: 40px;
    border-radius: 50%;
  }
  .modal-header {
    padding: 2rem 2rem 1rem 2rem;
    text-align: center;
  }
  .modal-image {
    padding: 0 2rem;
    text-align: center;
  }
  .full-image {
    max-width: 100%;
    max-height: 60vh;
    object-fit: contai;
    border-radius: 4px;
  }
  .modal-metadata {
    padding: 1rem 2rem 2rem 2rem;
  }
  .metadata-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }
  .metadata-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    background: #2a2e33;
    border-radius: 4px;
  }
  /* Responsive Design */
  @media (max-width: 768px) {
    .gallery-header {
      flex-direction: column;
      align-items: stretch;
    }
    .header-controls {
      justify-content: center;
    }
    .gallery-grid.gallery-grid {
      grid-template-columns: 1fr;
    }
    .modal-content {
      margin: 1rem;
      max-width: calc(100vw - 2rem);
    }
    .metadata-grid {
      grid-template-columns: 1fr;
    }
  }
  /* Animation for generation */
  @keyframes pulse {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 1; }
  }
  .gallery-item:has(.generate-btn:disabled) {; animation: pulse 2s infinite;
  }
</style>
