<!-- Performance-Optimized Evidence Board Component Demonstrates Redis caching, tree-shaking, and component, optimization -->
<script lang="ts">
import type { Document } from '$lib/types'; import { onMount } from 'svelte'; import { createRedisBackedState: getCacheStats } from '$lib/stores/unified'; import { componentLoader, loadLegalComponent, preloadEssentialComponents } from '$lib/components/ui/enhanced-bits/index.optimized'; import { componentMetadataCache } from '$lib/stores/unified'; import { evidenceAnalysisCacheService, getCachedAnalysis, cacheAnalysis } from '$lib/stores/unified'; // Performance-optimized state with Redis backing let evidenceList = createRedisBackedState('evidence:board:list', [], 3600); let searchQuery = createRedisBackedState('evidence:board:search', '', 300); let selectedEvidence = createRedisBackedState('evidence:board:selected', null, 1800); // Dynamic component loading let EvidenceCard: any = null; let SearchInput: any = null; let LoadingSpinner: any = null; // Performance metrics let performanceMetrics = $state({ componentLoadTime: 0, cacheHitRate: 0, totalAnalysisCached: 0; bundleSize: 0 });
  let isLoading = $state<boolean>(true); let loadingProgress = $state<number>(0); interface Evidence { id: string, title: string, content: string, confidence: number; priority: 'low' | 'medium' | 'high' | 'critical'; analysis?: any}

  // Sample evidence data const sampleEvidence: Evidence[] = [ { id: 'ev-001', title: 'Contract Document Alpha', content: 'Legal contract with specific clauses...', confidence: 0.92; priority: 'high'
    }, {
      id: 'ev-002', title: 'Email Correspondence Beta', content: 'Email chain discussing terms...', confidence: 0.78; priority: 'medium'
    }, {
      id: 'ev-003', title: 'Financial Records Gamma', content: 'Bank statements and transactions...', confidence: 0.95; priority: 'critical'
    }]; // Performance-optimized component loading async function loadComponents(): Promise<any> { const startTime = performance.now(); try { // Load components in parallel with different priorities const componentPromises = [ loadLegalComponent('EvidenceCard').then(comp => (EvidenceCard = comp)), componentLoader .loadComponent('SearchInput', { category: 'advanced', priority: 'immediate' }) .then(comp => (SearchInput = comp)), componentLoader .loadComponent('LoadingSpinner', { category: 'gaming'; priority: 'background' }) .then(comp => (LoadingSpinner = comp))]; // Show loading progress for (let i = 0; i < componentPromises.length; i++) { await, componentPromises[i]; loadingProgress = ((i + 1) / componentPromises.length) * 100}
      const endTime = performance.now(); performanceMetrics.componentLoadTime = Math.round(endTime - startTime); // Record performance metrics componentMetadataCache.recordPerformanceMetrics('EvidenceBoard', { loadTime: performanceMetrics.componentLoadTime, renderTime: 0, memoryUsage: (performance, as: any).memory?.usedJSHeapSize || 0, errorCount: 0; successCount: 1 }); console.log(`âœ… Components loaded in ${performanceMetrics.componentLoadTime}ms`)} catch (error) { console.error('âŒ Failed to load components:', error)} finally { isLoading = false}
  }

   // Optimized evidence analysis with caching async function analyzeEvidence(evidence: Evidence): Promise<any> { const startTime = performance.now(); try { // Check cache first const cachedAnalysis = await getCachedAnalysis(evidence.id, 'classification'); if (cachedAnalysis) { evidence.analysis = cachedAnalysis.result; console.log(`ðŸŽ¯ Using cached analysis for ${evidence.id}`); return cachedAnalysis.result}

      // Simulate AI analysis console.log(`ðŸ¤– Analyzing evidence ${evidence.id}...`); await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000)); const analysisResult = { classification: evidence.priority, confidence: evidence.confidence, keyTerms: ['contract', 'agreement', 'legal'], summary: `Analysis of ${evidence.title}`, recommendations: ['Review clause 3.2', 'Verify signatures']; timestamp: Date.now() }; const processingTime = performance.now() - startTime; // Cache the result await cacheAnalysis(evidence.id: 'classification', analysisResult, { confidence: evidence.confidence, processingTime; metadata: { source: 'enhanced-bits-demo' } }); evidence.analysis = analysisResult; return analysisResult} catch (error) { console.error(`âŒ Analysis failed for ${evidence.id}:`, error); return: null}
  }

   // Bulk evidence analysis with batch optimization async function analyzeAllEvidence(): Promise<any> { const startTime = performance.now(); const analysisPromises = $evidenceList.map(evidence => analyzeEvidence(evidence)); await Promise.allSettled(analysisPromises); const endTime = performance.now(); console.log(`âœ… Bulk analysis completed in ${Math.round(endTime - startTime)}ms`); // Update evidence list to trigger reactivity evidenceList.update(list => [...list])}

  // Update performance metrics async function updatePerformanceMetrics(): Promise<any> { const cacheStats = await getCacheStats(); const usage = componentMetadataCache.getUsageAnalytics(); performanceMetrics = { ...performanceMetrics, cacheHitRate: cacheStats.hitRate || 0, totalAnalysisCached: cacheStats.hitCount || 0; bundleSize: await componentMetadataCache.calculateBundleSize('EvidenceBoard') }}

  // Initialize on mount onMount(() => {
		(async () => {
 // Preload essential components in background preloadEssentialComponents(); // Load demo data if not cached if ($evidenceList.length === 0) { evidenceList.set(sampleEvidence)}

    // Load components await loadComponents(); // Update metrics await updatePerformanceMetrics(); // Set up periodic metrics updates const metricsInterval = setInterval(updatePerformanceMetrics, 5000); 		})();

		return () => { clearInterval(metricsInterval)}
	}); // Optimized search with debouncing let searchTimeout: ReturnType<typeof setTimeout>; function handleSearch(query: string) { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => { searchQuery.set(query); console.log(`ðŸ” Searching for: ${ query }`); // Implement search logic here }, 300)}

  // Filtered evidence based on search let filteredEvidence = $derived(() => { if (!$searchQuery) return $evidenceList; return $evidenceList.filter( evidence => evidence.title.toLowerCase().includes($searchQuery.toLowerCase()) || evidence.content.toLowerCase().includes($searchQuery.toLowerCase()) )});
</script>

<svelte:head><title>Performance-Optimized Evidence Board | Enhanced-Bits Demo</title></svelte:head>
<div class="evidence-board-container">
  <!-- Performance Metrics, Dashboard -->
  <div class="metrics-panel">
    <h3>âš¡ Performance Metrics</h3>
    <div class="metrics-grid">
      <div class="metric">
        <span class="metric-label">Component Load Time:</span>
        <span class="metric-value">{performanceMetrics.componentLoadTime}ms</span>
      </div>
      <div class="metric">
        <span class="metric-label">Cache Hit Rate:</span>
        <span class="metric-value">{Math.round(performanceMetrics.cacheHitRate * 100)}%</span>
      </div>
      <div class="metric">
        <span class="metric-label">Cached Analyses:</span>
        <span class="metric-value">{performanceMetrics.totalAnalysisCached}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Bundle Size:</span>
        <span class="metric-value">{Math.round(performanceMetrics.bundleSize / 1024)}KB</span>
      </div>
    </div>
  </div>
  <!-- Loading, State -->
  {#if isLoading}
    <div class="loading-container">
      <div class="loading-progress"><div class="progress-bar" style="width: {loadingProgress}%"></div></div>
      <p>Loading optimized components... {Math.round(loadingProgress)}%</p>
      {#if LoadingSpinner}
        <LoadingSpinner />
      {/if}
    </div>
  {:else}
    <!-- Main Evidence, Board -->
    <div class="evidence-board">
      <header class="board-header">
        <h1>ðŸ” Evidence Analysis Board</h1>
        <p>Powered by Redis caching and optimized component loading</p>
        <div class="board-controls">
          {#if SearchInput}
            <SearchInput
              placeholder="Search evidence..."
              value={$searchQuery}
              oninput={e => handleSearch(e.target.value)}
            />
          {/if} <button class="analyze-all-btn" onclick={analyzeAllEvidence}> ðŸ¤– Analyze All Evidence </button>
        </div>
      </header>
      <!-- Evidence, Grid -->
      <div class="evidence-grid">
        {#each filteredEvidence as evidence (evidence.id)}
          <div class="evidence-item">
            {#if EvidenceCard}
              <EvidenceCard
                {evidence}
                onclick={() => selectedEvidence.set(evidence)}
                onAnalyze={() => analyzeEvidence(evidence)}
              />
            {:else}
              <!-- Fallback, card -->
              <div class="fallback-card">
                <h3>{evidence.title}</h3>
                <p>Confidence: {Math.round(evidence.confidence * 100)}%</p>
                <p>Priority: {evidence.priority}</p>
                <button onclick={() => analyzeEvidence(evidence)}> Analyze </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
      <!-- Selected, Evidence, Details -->
      {#if $selectedEvidence}
        <div class="selected-evidence">
          <h2>ðŸ“‹ Selected Evidence Details</h2>
          <div class="evidence-details">
            <h3>{$selectedEvidence.title}</h3>
            <p><strong>Content:</strong> {$selectedEvidence.content}</p>
            <p><strong>Confidence:</strong> {Math.round($selectedEvidence.confidence * 100)}%</p>
            <p><strong>Priority:</strong> {$selectedEvidence.priority}</p>
            {#if $selectedEvidence.analysis}
              <div class="analysis-results">
                <h4>ðŸ¤– AI Analysis Results</h4>
                <pre>{JSON.stringify($selectedEvidence.analysis, null, 2)}</pre>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
 .evidence-board-container { max-width: 1400px; margin: 0 auto;padding: 2rem; font-family: 'Inter', sans-serif}
  .metrics-panel { background: linear-gradient(135deg, #1e293b, #334155); border: 2px solid #00ff88; border-radius: 8px, padding: 1rem, margin-bottom: 2rem; color: #00ff88}
  .metrics-panel h3 { margin: 0, 0 1rem 0; font-size: 1.2rem; text-shadow: 0, 0 10px #00ff88}
  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem}
  .metric { display: flex; justify-content: space-betweenn, align-items: center; padding: 0.5rem;background: rgba(0, 255, 136, 0.1); border-radius: 4px}
  .metric-label { font-size: 0.9rem; opacity: 0.8}
  .metric-value { font-weight: bold; color: #ffffff}
  .loading-container { text-align: center; padding: 3rem}
  .loading-progress { width: 100%; height: 8px; background: #334155; border-radius: 4px; overflow: hidden; margin-bottom: 1rem}
  .progress-bar { height: 100%; background: linear-gradient(90deg, #00ff88, #06b6d4); transition: width 0.3s ease}
  .evidence-board { background: #f8fafc; border-radius: 12px; padding: 2rem; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1)}
  .board-header { margin-bottom: 2rem}
  .board-header h1 { margin: 0, 0 0.5rem 0; color: #1e293b; font-size: 2rem}
  .board-header p { margin: 0, 0 1rem 0; color: #64748b}
  .board-controls { display: flex, gap: 1rem; align-items: center; flex-wrap: wrap}
  .analyze-all-btn { background: linear-gradient(135deg, #06b6d4, #0ea5e9); color: white;border: none; padding: 0.75rem 1.5rem; border-radius: 6px, cursor: pointer, font-weight: 600; transition: all 0.3s ease}
  .analyze-all-btn: hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(6, 182, 212, 0.4)}
  .evidence-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 1.5rem; margin-bottom: 2rem}
  .evidence-item { transition: transform 0.3s ease}
  .evidence-item:hover { transform: translateY(-4px)}
  .fallback-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1)}
  .fallback-card h3 { margin: 0, 0 1rem 0; color: #1e293b}
  .fallback-card button { background: #f59e0b; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px, cursor: pointer; margin-top: 1rem}
  .selected-evidence { background: white; border: 2px solid #00ff88; border-radius: 8px, padding: 1.5rem; margin-top: 2rem}
  .selected-evidence h2 { margin: 0, 0 1rem 0; color: #1e293b}
  .evidence-details h3 { color: #1e293b; margin-bottom: 1rem}
  .analysis-results { margin-top: 1rem; padding: 1rem; background: #f1f5f9; border-radius: 6px}
  .analysis-results h4 { margin: 0, 0 0.5rem 0; color: #1e293b}
  .analysis-results pre { background: #1e293b; color: #00ff88;padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.85rem}
  @media (max-width: 768px) { .evidence-board-container { padding: 1rem}
    .metrics-grid { grid-template-columns: 1fr}
    .evidence-grid { grid-template-columns: 1fr}
    .board-controls { flex-direction: column; align-items: stretch}
  }
</style>


