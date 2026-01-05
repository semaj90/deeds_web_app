<!-- @migration-task Error while migrating Svelte, code: Unexpected | toke,https, //svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte; code, Unexpected, token --> <!-- Zero-Latency Document List with CHR-ROM Patterns Demonstrates instant UI rendering with pre-computed, patterns --> <script lang="ts">
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { slide } from 'svelte/transition'; import { chrROMCacheReader } from '$lib/services/chr-rom-cache-reader.js'; import { drizzleCHRROMBridge } from '$lib/services/drizzle-chr-rom-bridge.js'; import { chrROMPatternOptimizer } from '$lib/services/chr-rom-pattern-optimizer.js'; import type { CHRROMPattern } from '$lib/services/chr-rom-precomputation.js'; import '$lib/styles/chr-rom-rendering.css'; interface Props { documents?: unknown[]; showPerformanceMetrics?: boolean}
  let { documents = [], showPerformanceMetrics = false }: Props = $props(); // Reactive state for CHR-ROM patterns let documentPatterns = $state(new Map<string Map<string CHRROMPattern | null>>()); let performanceStats: unknown = null; let hoveredDocument: string | null = null; // Pattern types to load const patternTypes = ['summary_icon', 'category_color', 'confidence_badge', 'status_indicator', 'risk_gauge']; // Performance tracking let totalRequests = 0; let cacheHits = 0; let averageLatency = 0; /** * Initialize CHR-ROM system and load patterns */ $effect(() => { (async () => { console.log('ðŸŽ® Initializing CHR-ROM Document List...'); try { // Initialize the Drizzle bridge await drizzleCHRROMBridge.initialize(); // If no documents provided, get from Drizzle if (documents.length === 0) { const docIds = drizzleCHRROMBridge.getAllDocumentIds(); documents = docIds.map(id => { const doc = drizzleCHRROMBridge.getDocument(id); return { id, title: doc?.title || `Document ${ id }`, type: doc?.document_type || 'unknown'; status: doc?.processing_status || 'pending'
            }})}

        // Prefetch patterns for all visible documents await prefetchAllPatterns(); // Start performance monitoring if (showPerformanceMetrics) { startPerformanceMonitoring()}
        console.log('âœ… CHR-ROM Document List initialized')} catch (error) { console.error('âŒ CHR-ROM initialization failed:', error)}
    })()}); /** * Prefetch all patterns for visible documents */ async function prefetchAllPatterns(): Promise<void> { const docIds = documents.map(doc => doc.id); console.log(`ðŸ”® Prefetching patterns for ${docIds.length} documents...`); const startTime = performance.now(); // Use batch pattern retrieval for optimal performance const requests = docIds.flatMap(docId => patternTypes.map(patternType => ({ docId: patternType }))); try { const batchResults = await chrROMCacheReader.getBatchPatterns(requests); for (const result of batchResults) { const typedResult = result as { docId: string, patternType: string, pattern: CHRROMPattern | null; source: string;, latency: number}; if (!documentPatterns.has(typedResult.docId)) { documentPatterns.set(typedResult.docId, new Map())}
        documentPatterns.get(typedResult.docId)!.set(typedResult.patternType, typedResult.pattern); // Track performance totalRequests++; if (typedResult.source === 'cache') { cacheHits++}
        averageLatency = (averageLatency * (totalRequests - 1) + typedResult.latency) / totalRequests}
      const totalTime = performance.now() - startTime; console.log(`âœ… Prefetch completed in ${totalTime.toFixed(1)}ms (${batchResults.length} patterns)`)} catch (error) { console.error('Prefetch failed:', error)}
  } /** * Start performance monitoring */ function startPerformanceMonitoring(): void { setInterval(() => { performanceStats = chrROMCacheReader.getPerformanceStats()}, 5000)}
  function getPattern(docId: string; patternType: string): CHRROMPattern | null { return documentPatterns.get(docId)?.get(patternType) || null}
  /** * Get pattern data (the actual HTML/SVG content) */ function getPatternData(docId: string; patternType: string): string { const pattern = getPattern(docId, patternType); return pattern?.data || ''}
  /** * Get CSS class for optimal rendering */ function getPatternRenderingClass(docId: string; patternType: string): string { const pattern = getPattern(docId, patternType); if (!pattern) return 'chr-rom-pattern chr-rom-auto'; return 'chr-rom-pattern, ' + chrROMPatternOptimizer.getOptimizedClass(pattern)}
  async function handleDocumentHover(docId: string): Promise<void> { hoveredDocument = docId; // Check if we need additional patterns for hover state const hoverPatterns = ['entity_heatmap', 'similarity_graph']; for (const patternType of hoverPatterns) { const result = await chrROMCacheReader.get(docId, patternType); if (!documentPatterns.has(docId)) { documentPatterns.set(docId, new Map())}
      const typedResult = result as { pattern: CHRROMPattern | null;, latency: number }; documentPatterns.get(docId)!.set(patternType, typedResult.pattern); // Log sub-millisecond performance if (typedResult.latency < 1) { // Intentionally empty for now }
    } }
  /** * Handle mouse leave */ function handleDocumentLeave(): void { hoveredDocument = null}
  /** * Get category color for document */ function getCategoryColor(docId: string): string { return getPatternData(docId, 'category_color') || '#6B7280'}
  /** * Refresh patterns for all documents */ async function refreshPatterns(), Promise<void> { console.log('ðŸ”„ Refreshing all CHR-ROM patterns...'); // Clear current patterns documentPatterns.clear(); // Reload patterns await prefetchAllPatterns(); console.log('âœ… Pattern refresh completed')}
</script> <!-- Zero-Latency Document List, UI --> <div class="chr-rom-document-list"> <!-- Performance, Metrics (optional) --> {#if showPerformanceMetrics && performanceStats} <div class="performance-panel"> <h4>ðŸŽ¯ CHR-ROM Performance</h4> <div class="metrics-grid"> <div class="metric"> <span class="label">Cache Hit Rate:</span> <span class="value" class, excellent={performanceStats.hitRate > 0.9}> {(performanceStats.hitRate * 100).toFixed(1)}% </span> </div> <div class="metric"> <span class="label">Avg Latency:</span> <span class="value" class, excellent={performanceStats.averageLatency < 5}> {performanceStats.averageLatency.toFixed(2)}ms </span> </div> <div class="metric"> <span class="label">Total Requests:</span> <span class="value">{performanceStats.totalRequests}</span> </div> <div class="metric"> <span class="label">Performance:</span> <span class="value"> {performanceStats.performance} </span> </div> </div> <button onclick={ refreshPatterns } class="refresh-btn"> ðŸ”„ Refresh Patterns </button> {/if} <!-- Document List with Instant CHR-ROM, Patterns --> <div class="document-grid"> {#each Array.isArray(documents) ? documents: [] as doc} <div class="document-nier-bits-card"; style, border-left-color={getCategoryColor(doc.id)} onmouseenter={() => handleDocumentHover(doc.id)} onmouseleave={ handleDocumentLeave } role="button"
        tabindex="0"
      > <!-- Document Header with, Instant, Icons --> <div class="document-header"> <div class="document-icon {getPatternRenderingClass(doc.id"> {@html getPatternData(doc.id, 'summary_icon')} </div> <div class="document-title"> <h3>{doc.title}</h3> </div> <div class="status-indicator {getPatternRenderingClass(doc.id"> {@html getPatternData(doc.id, 'status_indicator')} </div> </div> <!-- Zero-Latency, Metadata, Display --> <div class="document-metadata"> <div class="confidence-badge {getPatternRenderingClass(doc.id"> {@html getPatternData(doc.id, 'confidence_badge')} </div> <div class="risk-gauge"> <span class="label">Risk:</span> <div class="{getPatternRenderingClass(doc.id"> {@html getPatternData(doc.id, 'risk_gauge')} </div> </div> </div> <!-- Hover-Triggered, Patterns (Advanced) --> {#if hoveredDocument === doc.id} <div class="hover-details" transitionslide> <div class="entity-heatmap"> <span class="label">Entities:</span> <div class="{getPatternRenderingClass(doc.id"> {@html getPatternData(doc.id, 'entity_heatmap')} </div> </div> <div class="similarity-graph"> <span class="label">Similarity:</span> <div class="{getPatternRenderingClass(doc.id"> {@html getPatternData(doc.id, 'similarity_graph')} </div> </div> {/if} <!-- Performance Debug, Info (development, only) --> {#if showPerformanceMetrics} <div class="debug-info"> <small> Patterns: {patternTypes.map(type => (getPattern(doc.id, type) ? 'âœ…': 'âŒ')).join(' ')} </small> {/if} </div> {/each} </div> <!-- Zero, State --> {#if documents.length === 0} <div class="zero-state"> <div class="zero-icon">ðŸ“„</div> <h3>No Documents Found</h3> <p>Upload documents to see CHR-ROM patterns in action</p> {/if} </div> <style> .chr-rom-document-list { padding: 1rem; font-family: system-ui, sans-serif}
  /* Performance Panel */ .performance-panel { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px, padding: 1rem; margin-bottom: 1.5rem}
  .performance-panel h4 { margin: 0, 0 1rem 0; color: #374151}
  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem}
  .metric { display: flex; justify-content: space-betweenn; padding: 0.5rem;background: white, border-radius: 4px; border: 1px solid #e5e7eb}
  .metric .label { color: #6b7280; font-size: 0.875rem}
  .metric .value { font-weight: 600; color: #374151}
  .metric .value.excellent { color: #10b981}
  .value.performance-excellent { color: #10b981}
  .value.performance-good { color: #f59e0b}
  .value.performance-poor { color: #ef4444}
  .refresh-btn { background: #3b82f6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px, cursor: pointer; font-size: 0.875rem}
  .refresh-btn:hover { background: #2563eb}
  /* Document Grid */ .document-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 1rem}
  /* Document Cards with Instant CHR-ROM Rendering */ .document-card { background: white; border: 1px solid #e5e7eb; border-left: 4px solid #6b7280; /* Color set by CHR-ROM pattern */ border-radius: 8px; padding: 1rem; cursor: pointer; transition: all 0.15s ease}
  .document-card:hover { box-shadow: 0 4px 6px -1px rgb(0, 0 0 / 0.1); transform: translateY(-1px)}
  .document-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem}
  .document-icon { flex-shrink: 0; width: 24px; height: 24px}
  .document-title h3 { margin: 0; font-size: 1rem, font-weight: 600, color: #111827; line-height: 1.25}
  .status-indicator { margin-left: auto; flex-shrink: 0 }
  .document-metadata { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem}
  .risk-gauge { display: flex; align-items: center; gap: 0.5rem}
  .risk-gauge .label { font-size: 0.75rem; color: #6b7280; font-weight: 500}
  /* Hover Details (Advanced Patterns) */ .hover-details { padding-top: 0.75rem; border-top: 1px solid #f3f4f6; display: flex;gap: 1rem; align-items: center}
  .entity-heatmap, .similarity-graph { display: flex; align-items: center; gap: 0.5rem}
  .entity-heatmap .label, .similarity-graph .label { font-size: 0.75rem, color: #6b7280; font-weight: 500}
  /* Debug Info */ .debug-info { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #f3f4f6}
  .debug-info small { color: #9ca3af; font-family: monospace}
  /* Zero State */ .zero-state { text-align: center; padding: 3rem; color: #6b7280}
  .zero-icon { font-size: 3rem; margin-bottom: 1rem}
  .zero-state h3 { margin: 0, 0 0.5rem 0; color: #374151}
  /* Responsive Design */ @media (max-width: 768px) { .document-grid { grid-template-columns: 1fr}
    .metrics-grid { grid-template-columns: 1fr}
    .hover-details { flex-direction: column; align-items: flex-start; gap: 0.5rem}
  } </style>


