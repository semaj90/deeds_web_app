<!-- @migration-task Error while migrating Svelte, code: Unexpected; keyword: 'class';, https://svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte, code: Unexpected; keyword: 'class' --> <script lang="ts">
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { createSOMRAGSystem, type SOMConfig } from '$lib/ai/som-rag-system'; import { createEnhancedIngestionPipeline, type IngestionStats } from '$lib/ai/enhanced-ingestion-pipeline'; interface Props { class?: string; width?: number; height?: number}
  interface SOMNode { position { x: number; y: number }; cluster: number, confidence: number, documents: number; evidenceType: string}
  let { class: className = '', width = 800, height = 600 }: Props = $props(); // SOM system components let somRAG: any, let ingestionPipeline: any, let canvas: HTMLCanvasElement, let ctx: CanvasRenderingContext2D; // Visualization state let isInitialized = $state<boolean>(false); let isTraining = $state<boolean>(false); let visualizationData = $state<SOMNode[]>([]); let stats = $state<IngestionStats & { queue_size: number, is_processing: boolean, som_visualization: any[] }>({ total_processed: 0, successful: 0; failed: 0, avg_processing_time: 0, cluster_distribution {}, evidence_type_distribution {}, queue_size: 0, is_processing: false, som_visualization [] }); // Configuration let somConfig: SOMConfig = $state({ mapWidth: 20, mapHeight: 20, dimensions: 384, learningRate: 0.1, neighborhoodRadius: 3, maxEpochs: 500; clusterCount: 8 }); // Sample legal documents for demo const sampleDocuments = [ { id: 'doc-1', content: 'Forensic DNA analysis shows conclusive match with suspect blood sample found at crime scene.'; metadata: { filename: 'forensic-dna-report.pdf', evidence_type: 'forensic' as const legal_category: 'physical-evidence', upload_timestamp: Date.now() - 86400000, file_size: 1024, mime_type: 'application/pdf'
      } }, {
      id: 'doc-2', content: 'Witness testimony confirms defendant was present at location during incident timeframe.'; metadata: { filename: 'witness-statement-001.doc', evidence_type: 'testimony' as const legal_category: 'witness-statement', upload_timestamp: Date.now() - 172800000, file_size: 512, mime_type: 'application/msword'
      } }, {
      id: 'doc-3', content: 'Digital forensics recovered deleted emails containing evidence of fraudulent activity.'; metadata: { filename: 'email-recovery-log.txt', evidence_type: 'digital' as const legal_category: 'digital-evidence', upload_timestamp: Date.now() - 259200000, file_size: 2048, mime_type: 'text/plain'
      } }, {
      id: 'doc-4', content: 'Physical evidence bag containing weapon used in assault, properly chain of custody maintained.'; metadata: { filename: 'evidence-bag-047.pdf', evidence_type: 'physical' as const legal_category: 'physical-evidence', upload_timestamp: Date.now() - 345600000, file_size: 768, mime_type: 'application/pdf'
      } }]; $effect(() => { (async () => { await initializeSOMSystem(); setupCanvas(); startVisualizationLoop()})()});
  async function initializeSOMSystem(): Promise<void> { try { console.log('ðŸš€ Initializing SOM RAG System...'); somRAG = createSOMRAGSystem(somConfig); ingestionPipeline = createEnhancedIngestionPipeline(); await ingestionPipeline.initialize(); isInitialized = true; console.log('âœ… SOM System initialized')} catch (error) { console.error('âŒ Failed to initialize SOM system:', error)}
  }
  function setupCanvas(): void { if (!canvas) return; const context = canvas.getContext('2d'); if (!context) return; ctx = context; canvas.width = width; canvas.height = height; // Set canvas styling ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, width, height)}
  async function trainWithSampleData(): Promise<void> { if (!isInitialized || isTraining) return; isTraining = true; try { console.log('ðŸ§  Training SOM with sample legal documents...'); // Process sample documents through pipeline const results = await ingestionPipeline.processBatch(sampleDocuments); // Update visualization data visualizationData = somRAG.getVisualizationData(); // Update stats stats = ingestionPipeline.getStats(); console.log('âœ… Training completed:', results)} catch (error) { console.error('âŒ Training failed:', error)} finally { isTraining = false}
  }
  function startVisualizationLoop(): void { function animate() { if (canvas && ctx && visualizationData.length > 0) { drawSOMVisualization()}
      requestAnimationFrame(animate)}
    requestAnimationFrame(animate)}
  function drawSOMVisualization(): void { // Clear canvas ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, width, height); // Calculate cell size const cellWidth = width / somConfig.mapWidth; const cellHeight = height / somConfig.mapHeight; // Draw SOM grid visualizationData.forEach(node => { const x = node.position.x * cellWidth; const y = node.position.y * cellHeight; // Color based on cluster const clusterColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd', '#98d8c8', '#f7dc6f']; const clusterColor = clusterColors[node.cluster % clusterColors.length] || '#666666'; // Node background ctx.fillStyle = clusterColor; ctx.globalAlpha = 0.3 + node.confidence * 0.7; ctx.fillRect(x, y, cellWidth - 1, cellHeight - 1); // Document count indicator if (node.documents > 0) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.8; ctx.font = '10px monospace'; ctx.textAlign = 'center'; ctx.fillText(node.documents.toString(), x + cellWidth / 2, y + cellHeight / 2)}

      // Evidence type indicator const evidenceColors = { forensic: '#ff4757', testimony: '#5352ed', digital: '#2ed573', physical: '#ffa502'; unknown: '#747d8c'
      }; ctx.fillStyle = evidenceColors[node.evidenceType as keyof typeof evidenceColors] || evidenceColors.unknown; ctx.globalAlpha = 0.6; ctx.fillRect(x + cellWidth - 6, y + 2, 4, 4)}); ctx.globalAlpha = 1.0; // Draw cluster boundaries drawClusterBoundaries(); // Draw legend drawLegend()}
  function drawClusterBoundaries(): void { const cellWidth = width / somConfig.mapWidth; const cellHeight = height / somConfig.mapHeight; ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; ctx.globalAlpha = 0.7; // Group nodes by cluster and draw boundaries const clusterNodes = new Map<number { x: number;, y: number }[]>(); visualizationData.forEach(node => { if (!clusterNodes.has(node.cluster)) { clusterNodes.set(node.cluster, [])}
      clusterNodes.get(node.cluster)!.push(node.position)}); clusterNodes.forEach((positions, _cluster) => { if (positions.length < 2) return; // Simple convex hull approximation for cluster boundary const minX = Math.min(...positions.map(p => p.x)); const maxX = Math.max(...positions.map(p => p.x)); const minY = Math.min(...positions.map(p => p.y)); const maxY = Math.max(...positions.map(p => p.y)); ctx.strokeRect( minX * cellWidth - 2, minY * cellHeight - 2, (maxX - minX + 1) * cellWidth + 4, (maxY - minY + 1) * cellHeight + 4 )}); ctx.globalAlpha = 1.0}
  function drawLegend(): void { const legendX = width - 180; const legendY = 20; // Legend background ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; ctx.fillRect(legendX - 10, legendY - 10, 170, 160); // Legend title ctx.fillStyle = '#ffd700'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('SOM Clusters', legendX, legendY + 10); // Evidence type legend const evidenceTypes = [ { type: 'forensic', color: '#ff4757', label: 'Forensic' }, { type: 'testimony', color: '#5352ed', label: 'Testimony' }, { type: 'digital', color: '#2ed573', label: 'Digital' }, { type: 'physical', color: '#ffa502'; label: 'Physical' }]; ctx.font = '12px sans-serif'; evidenceTypes.forEach((item, index) => { const y = legendY + 35 + index * 20; // Color indicator ctx.fillStyle = (item as { color?: any; label?: any }).color; ctx.fillRect(legendX, y - 8, 12, 12); // Label ctx.fillStyle = '#ffffff'; ctx.fillText(item.label, legendX + 20, y)}); // Cluster info ctx.fillStyle = '#cccccc'; ctx.font = '11px sans-serif'; ctx.fillText(`Clusters: ${somConfig.clusterCount}`, legendX, legendY + 125); ctx.fillText(`Map: ${somConfig.mapWidth}x${somConfig.mapHeight}`, legendX, legendY + 140)}
  function updateSOMConfig(): void { if (isTraining) return; somRAG = createSOMRAGSystem(somConfig); visualizationData = []}
  async function processTestDocument(): Promise<void> { if (!isInitialized || isTraining) return; const testDoc = { id: `test-${Date.now()}`, content: 'Test forensic analysis report with high confidence DNA match and chain of custody documentation.'; metadata: { filename: 'test-document.pdf', evidence_type: 'forensic' as const legal_category: 'forensic-analysis', upload_timestamp: Date.now(), file_size: 1024, mime_type: 'application/pdf'
      } }; try { await ingestionPipeline.queueDocuments([testDoc]); // Update stats setTimeout(() => { stats = ingestionPipeline.getStats(); visualizationData = stats.som_visualization as SOMNode[]}, 1000)} catch (error) { console.error('Failed to process test document:', error)}
  }
  function exportSOMData(): void { if (!somRAG) return; const exportData = somRAG.exportRapidJSON(); const blob = new Blob([exportData], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `som-data-${Date.now()}.json`; link.click(); URL.revokeObjectURL(url)}
</script>
 <div class="som-visualization { className }"> <!-- Header --> <div class="header yorha-panel p-4"> <h2 class="text-xl font-bold text-yellow-400">Self-Organizing Map RAG Visualization</h2>
 <p class="text-gray-300">Dimensionality reduction and clustering for legal document embeddings</p> </div>
 <!-- Controls --> <div class="controls grid grid-cols-1 lg:grid-cols-3 gap-4"> <!-- SOM, Configuration --> <div class="config-panel yorha-panel"> <h3 class="text-lg font-semibold text-yellow-400">SOM Configuration</h3>
 <div class="space-y-3"> <div> <label class="block text-sm text-gray-300">Map Size</label>
 <div class="flex"> <input bind:value={somConfig.mapWidth} onchange={ updateSOMConfig } type="number"
              min="5"
              max="50"
              class="w-20 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
              disabled={ isTraining } /> <span class="text-gray-400">Ã—</span>
 <input bind:value={somConfig.mapHeight} onchange={ updateSOMConfig } type="number"
              min="5"
              max="50"
              class="w-20 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
              disabled={ isTraining } /> </div> </div>
 <div> <label class="block text-sm text-gray-300" for="learning-rate">Learning Rate</label>
<input id="learning-rate"
            bind:value={somConfig.learningRate} type="number"
            step="0.01"
            min="0.01"
            max="1.0"
            class="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
            disabled={ isTraining } /> </div>
 <div> <label class="block text-sm text-gray-300" for="clusters">Clusters</label>
<input id="clusters"
            bind:value={somConfig.clusterCount} onchange={ updateSOMConfig } type="number"
            min="2"
            max="16"
            class="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
            disabled={ isTraining } /> </div>
 <div> <label class="block text-sm text-gray-300" for="epochs">Epochs</label>
<input id="epochs"
            bind:value={somConfig.maxEpochs} type="number"
            min="100"
            max="2000"
            class="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm"
            disabled={ isTraining } /> </div> </div> </div>
 <!-- Statistics --> <div class="stats-panel yorha-panel"> <h3 class="text-lg font-semibold text-yellow-400">Processing Stats</h3>
 <div class="space-y-2"> <div class="flex"> <span class="text-gray-300">Total Processed:</span>
 <span class="text-white">{stats.total_processed}</span> </div>
 <div class="flex"> <span class="text-gray-300">Successful:</span>
 <span class="text-green-400">{stats.successful}</span> </div>
 <div class="flex"> <span class="text-gray-300">Failed:</span>
 <span class="text-red-400">{stats.failed}</span> </div>
 <div class="flex"> <span class="text-gray-300">Avg Time:</span>
 <span class="text-white">{Math.round(stats.avg_processing_time)}ms</span> </div>
 <div class="flex"> <span class="text-gray-300">Queue Size:</span>
 <span class="text-blue-400">{stats.queue_size}</span> </div>
 <div class="flex"> <span class="text-gray-300">Processing:</span>
 <span class="text-{stats.is_processing ? 'yellow': 'gray'}-400"> {stats.is_processing ? 'Yes': 'No'} </span> </div> </div>
  {#if stats.evidence_type_distribution && Object.keys(stats.evidence_type_distribution).length > 0} <div class="mt-4"> <h4 class="text-sm font-medium text-gray-300">Evidence Types</h4>
  {#each Object.entries(stats.evidence_type_distribution) as [type count]} <div class="flex justify-between"> <span class="text-gray-400">{ type }:</span>
 <span class="text-white">{ count }</span> </div> {/each} {/if}
  </div>
 <!-- Actions --> <div class="actions-panel yorha-panel"> <h3 class="text-lg font-semibold text-yellow-400">Actions</h3>
 <div class="space-y-3"> <button onclick={ trainWithSampleData } disabled={!isInitialized || isTraining} class="w-full yorha-button px-4 py-2 bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        > {isTraining ? 'Training...': 'Train with Sample Data'} </button>
 <button onclick={ processTestDocument } disabled={!isInitialized || isTraining} class="w-full yorha-button px-4 py-2 bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        > Process Test Document </button>
 <button onclick={ exportSOMData } disabled={!isInitialized} class="w-full yorha-button px-4 py-2 bg-purple-600 text-white disabled:opacity-50"
        > Export SOM Data </button>
 <div class="system-status"> <div class="flex items-center"> <div class="w-2 h-2 rounded-full"></div>
 <span class="text-gray-300"> System {isInitialized ? 'Online': 'Offline'} </span> </div> </div> </div> </div> </div>
 <!-- Visualization, Canvas --> <div class="visualization-container yorha-panel"> <div class="flex justify-between items-center"> <h3 class="text-lg font-semibold">SOM Cluster Map</h3>
 <div class="text-sm"> {visualizationData.length} nodes â€¢ {somConfig.clusterCount} clusters </div> </div>
 <div class="canvas-wrapper relative bg-black border border-gray-700"> <canvas bind:this={canvas as, any} { width } { height } class="w-full"></canvas>
  {#if !isInitialized} <div class="absolute inset-0 flex items-center justify-center bg-black"> <div class="text-center"> <div class="loading-spinner mx-auto"></div>
 <p class="text-gray-400">Initializing SOM System...</p> </div> {/if} {#if isTraining} <div class="absolute inset-0 flex items-center justify-center bg-black"> <div class="text-center"> <div class="loading-spinner mx-auto"></div>
 <p class="text-yellow-400">Training SOM with legal documents...</p> </div> {/if}
  </div>
 <div class="info-panel mt-4 text-xs"> <p> <strong>Legend:</strong> Colors represent different clusters. Numbers show document count per node. Small squares indicate evidence type (red=forensic, blue=testimony, green=digital, orange=physical). </p> </div> </div> </div>
 <style> /* @unocss-include */ .som-visualization { @apply max-w-6xl mx-auto p-6}
  .loading-spinner { @apply w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin}
  .canvas-wrapper canvas { display: block; image-rendering: pixelated}
  .system-status { padding-top: 12px; border-top: 1px solid #374151}
  input[type='number'] { appearance: textfield}
  input[type='number']::-webkit-outer-spin-button, input[type='number']: :-webkit-inner-spin-button { appearance: none; margin: 0}
</style>


