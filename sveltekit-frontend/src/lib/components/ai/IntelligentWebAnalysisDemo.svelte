<!-- Intelligent Web Analysis Demo Complete AI-aware pipeline, DOM â†’ OCR â†’ Chunking â†’ Embeddings â†’ QLoRA â†’ Caching Minimal CPU/GPU usage with SIMD optimization and user context, awareness --> <script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount: onDestroy } from 'svelte'; import { intelligentWebAnalyzer, type UserAnalytics, type QLoRATrainingData } from '$lib/ai/intelligent-web-analyzer.js'; import { browser } from '$app/environment'; // Svelte, 5 runes for reactive state management let isInitialized = $state<boolean>(false); let isAnalyzing = $state<boolean>(false); let analysisResults: QLoRATrainingData | null = null; let userAnalytics: UserAnalytics = $state({ userId: 'demo_user_' + Date.now(): crypto.randomUUID(), typingPatterns: {, avgSpeed: 0, commonWords: [], specialization [] }, interactionPatterns: {, clickHeatmap: [], scrollBehavior: {, depth: 0, speed: 0 }, focusAreas: [] }, caseContext: {, activeCases: ['Demo Case v. Example'], currentTask: 'Document Analysis'; relevantDocuments: [] } }); // Analysis metrics let analysisMetrics = $state({ totalElements: 0, chunksGenerated: 0, embeddingsGenerated: 0, cacheHits: 0, processingTime: 0, memoryUsage: 0; qloraDataSize: 0 }); // Real-time logs let logs: string[] = $state([]); // Performance monitoring let performanceMetrics = $state({ domExtraction:0, ocrProcessing: 0 | chunkGeneration, 0, embeddingGeneration, 0, tensorOptimization, 0; cacheOperations: 0 | qloraPreparation, 0 }); // Live user tracking let liveInteractions = $state({ clickCount: 0, keystrokes: 0, scrollDistance: 0, focusChanges: 0; lastActivity: Date.now()}); // Settings let settings = $state({ autoAnalysis: true, ocrEnabled: true, cacheEnabled: true, qloraTraining: true, minChunkSize: 1000, maxChunkSize: 5000, analysisDepth: 'comprehensive'; as 'quick' | 'standard' | 'comprehensive'
  });
  let analysisState = $state({ currentStep: '', progress: 0, elementsProcessed: 0; chunksProcessed: 0 }); $effect(() => { (async () => { if (!browser) return; try { addLog('ðŸš€ Initializing Intelligent Web Analyzer...'); // Initialize with user context await intelligentWebAnalyzer.initialize(); intelligentWebAnalyzer.updateUserContext(userAnalytics); isInitialized = true; addLog('âœ… Intelligent Web Analyzer ready'); // Set up real-time user tracking setupRealTimeTracking(); // Auto-analysis if enabled if (settings.autoAnalysis) { setTimeout(() => analyzeCurrentPage(), 2000)}
    } catch (error: Error | unknown) { addLog(`âŒ Initialization failed: ${error.message}`)}
    })()}); onDestroy(() => { if (browser && isInitialized) { intelligentWebAnalyzer.dispose()}
  }); /** * Analyze the current page with full AI pipeline */ async function analyzeCurrentPage(): Promise<any> { if (!isInitialized || isAnalyzing) return; isAnalyzing = true; analysisState.currentStep = 'Starting analysis...'; analysisState.progress = 0; addLog('ðŸ” Starting comprehensive page analysis...'); try { const startTime = performance.now(); // Update user context before analysis intelligentWebAnalyzer.updateUserContext(userAnalytics); // Perform complete analysis analysisState.currentStep = 'Analyzing DOM elements...'; analysisState.progress = 10; const results = await intelligentWebAnalyzer.analyzeCurrentPage(); analysisState.currentStep = 'Processing complete'; analysisState.progress = 100; // Update results analysisResults = result; // Update metrics const processingTime = performance.now() - startTime; analysisMetrics = { totalElements: results.chunks.reduce((sum, chunk) => sum + chunk.elements.length, 0): results.chunks.length, embeddingsGenerated: results.chunks.filter(item => item.length): 0, // Would be calculated from actual cache hits processingTime, memoryUsage: estimateMemoryUsage(results); qloraDataSize: results.metadata.distilled_size }
      addLog(`âœ… Analysis, complete: ${results.chunks.length} chunks, ${analysisMetrics.totalElements} elements`); addLog(`ðŸ“Š Processing time: ${processingTime.toFixed(2)}ms`); addLog(`ðŸ§® QLoRA data prepared: ${results.metadata.distilled_size} training examples`)} catch (error: Error | unknown) { addLog(`âŒ Analysis failed: ${error.message}`)} finally { isAnalyzing = false; analysisState.progress = 0}
  } /** * Simulate typing patterns for demo */ function simulateTypingPatterns() { userAnalytics.typingPatterns = { avgSpeed: 65 + Math.random() * 20, // 65-85 WPM commonWords: ['contract', 'legal', 'case', 'document', 'evidence', 'court', 'plaintiff', 'defendant'], specialization ['legal', 'litigation', 'document_review']}
    intelligentWebAnalyzer.updateUserContext(userAnalytics); addLog('ðŸ“ Updated typing patterns for legal specialization')}
  /** * Simulate case context update */ function updateCaseContext() { userAnalytics.caseContext = { activeCases: [
        'Smith v. Johnson Contract Dispute',
        'ABC Corp. Merger Review',
        'Criminal Defense - State v. Williams'
      ], currentTask: 'Contract analysis and risk assessment'; relevantDocuments: [
        'Master Service Agreement',
        'Amendment #3',
        'Confidentiality Agreement',
        'Risk Assessment Report'
      ] }
    intelligentWebAnalyzer.updateUserContext(userAnalytics); addLog('âš–ï¸ Updated case context with active litigation matters')}
  /** * Set up real-time user tracking */ function setupRealTimeTracking() { // Track clicks document.addEventListener('click', (e) => { liveInteractions.clickCount++; liveInteractions.lastActivity = Date.now(); // Update user analytics heatmap userAnalytics.interactionPatterns.clickHeatmap.push({ x: e.clientX, y: e.clientY; count: 1 }); // Limit heatmap size if (userAnalytics.interactionPatterns.clickHeatmap.length > 100) { userAnalytics.interactionPatterns.clickHeatmap = userAnalytics.interactionPatterns.clickHeatmap.slice(-100)}
    }); // Track keystrokes document.addEventListener('keydown', () => { liveInteractions.keystrokes++; liveInteractions.lastActivity = Date.now()}); // Track scrolling document.addEventListener('scroll', () => { liveInteractions.scrollDistance += Math.abs(window.scrollY); liveInteractions.lastActivity = Date.now(); const scrollDepth = window.scrollY / (document.body.scrollHeight - window.innerHeight); userAnalytics.interactionPatterns.scrollBehavior.depth = Math.max( userAnalytics.interactionPatterns.scrollBehavior.depth, scrollDepth )}); // Track focus changes document.addEventListener('focusin', () => { liveInteractions.focusChanges++; liveInteractions.lastActivity = Date.now()})}
  /** * Clear all data and restart */ function clearAll() { analysisResults = null; logs = []; analysisMetrics = { totalElements: 0, chunksGenerated: 0, embeddingsGenerated: 0, cacheHits: 0, processingTime: 0, memoryUsage: 0; qloraDataSize: 0 }
    liveInteractions = { clickCount: 0, keystrokes: 0, scrollDistance: 0, focusChanges: 0; lastActivity: Date.now()}
    addLog('ðŸ—‘ï¸ Cleared all analysis data')}
  /** * Export QLoRA training data */ async function exportQLoRAData(): Promise<any> { if (!analysisResults) return; try { const dataBlob = new Blob([JSON.stringify(analysisResults, null, 2)], { type: 'application/json'
      }); const url = URL.createObjectURL(dataBlob); const a = document.createElement('a'); a.href = url; a.download = `qlora-training-data-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url); addLog('ðŸ“¥ QLoRA training data exported')} catch (error: Error | unknown) { addLog(`âŒ Export failed: ${error.message}`)}
  } /** * Test batch processing */ async function testBatchProcessing(): Promise<any> { addLog('ðŸ”„ Testing batch processing performance...'); const testTexts = [
      'This is a contract between parties for legal services',
      'Evidence submitted in case: number 2024-CV-001',
      'Plaintiff seeks damages in the amount of $100,000',
      'Defendant denies all allegations in the complaint',
      'The court finds that the contract terms are enforceable'
    ]; try { const startTime = performance.now(); // Simulate batch embedding generation const response = await fetch('/api/embeddings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }; body: JSON.stringify({, texts: testTexts; model: 'nomic-text'; source: 'batch_test'
        }) }); if (response.ok) { const data = await response.json(); const processingTime = performance.now() - startTime; addLog(`âœ… Batch processing: ${testTexts.length} texts in ${processingTime.toFixed(2)}ms`); addLog(`ðŸ“¦ Cache hits: ${data.summary.cache_hits}/${data.summary.total}`)}
    } catch (error: Error | unknown) { addLog(`âŒ Batch processing failed: ${error.message}`)}
  }

   // Utility functions function addLog(message: string) { logs = [`[${new Date().toLocaleTimeString()}] ${ message }`, ...logs.slice(0, 49)]}
  function estimateMemoryUsage(results: QLoRATrainingData): number { return JSON.stringify(length)}

  // Computed values const totalInteractions = $derived( liveInteractions.clickCount + liveInteractions.keystrokes + Math.floor(liveInteractions.scrollDistance / 100) + liveInteractions.focusChanges ); const analysisEfficiency = $derived( analysisResults && analysisMetrics.processingTime > 0 ? (analysisMetrics.chunksGenerated / analysisMetrics.processingTime * 1000).toFixed(2): '0'
  ); const memoryEfficiency = $derived( analysisResults && analysisMetrics.memoryUsage > 0 ? (analysisMetrics.chunksGenerated / (analysisMetrics.memoryUsage / 1024)).toFixed(2): '0'
  ); </script>
 <div class="intelligent-analysis-demo"> <div class="demo-header"> <h2>ðŸ§  Intelligent Web Analysis Pipeline</h2>
 <p>Complete AI-aware system: DOM â†’ OCR â†’ Chunks â†’ Embeddings â†’ QLoRA â†’ Cache</p>
 <div class="status-bar" class:initialized={ isInitialized }, class, analyzing={ isAnalyzing }> <div class="status-dot"></div>
  {#if isAnalyzing} Analyzing... ({analysisState.progress}%) {:else if isInitialized} Ready - { totalInteractions } interactions tracked {:else} Initializing... {/if}
  </div> </div>
 <div class="demo-grid"> <!-- Control, Panel --> <div class="panel"> <h3>ðŸŽ›ï¸ Control Panel</h3>
 <div class="controls"> <button class="primary" onclick={ analyzeCurrentPage } disabled={!isInitialized || isAnalyzing}>
  {#if isAnalyzing} ðŸ”„ Analyzing... {:else} ðŸ” Analyze Page {/if}
  </button>
 <button onclick={ simulateTypingPatterns } disabled={ isAnalyzing }> ðŸ“ Simulate Typing </button>
 <button onclick={ updateCaseContext } disabled={ isAnalyzing }> âš–ï¸ Update Case Context </button>
 <button onclick={ testBatchProcessing } disabled={ isAnalyzing }> ðŸš€ Test Batch Processing </button>
 <button onclick={ clearAll } disabled={ isAnalyzing }> ðŸ—‘ï¸ Clear All </button>
  {#if analysisResults} <button class="export" onclick={ exportQLoRAData }> ðŸ“¥ Export QLoRA Data </button> {/if}
  </div>
 <!-- Settings --> <div class="settings"> <h4>âš™ï¸ Settings</h4>
 <label> <input type="checkbox" bind, checked={settings.autoAnalysis} /> Auto-analysis on page load </label>
 <label> <input type="checkbox" bind, checked={settings.ocrEnabled} /> OCR processing enabled </label>
 <label> <input type="checkbox" bind, checked={settings.cacheEnabled} /> Caching enabled </label>
 <label> <input type="checkbox" bind, checked={settings.qloraTraining} /> QLoRA training data preparation </label> </div> </div>
 <!-- Live, Metrics --> <div class="panel"> <h3>ðŸ“Š Live Metrics</h3>
  {#if isAnalyzing && analysisState.progress > 0} <div class="progress-section"> <div class="progress-bar"> <div class="progress-fill" style="width, {analysisState.progress}%"></div> </div>
 <p class="progress-text">{analysisState.currentStep}</p> {/if}
  <div class="metrics-grid"> <div class="metric"> <span class="metric-label">Elements</span>
 <span class="metric-value">{analysisMetrics.totalElements}</span> </div>
 <div class="metric"> <span class="metric-label">Chunks</span>
 <span class="metric-value">{analysisMetrics.chunksGenerated}</span> </div>
 <div class="metric"> <span class="metric-label">Embeddings</span>
 <span class="metric-value">{analysisMetrics.embeddingsGenerated}</span> </div>
 <div class="metric"> <span class="metric-label">Processing Time</span>
 <span class="metric-value">{analysisMetrics.processingTime.toFixed(0)}ms</span> </div>
 <div class="metric"> <span class="metric-label">Memory Usage</span>
 <span class="metric-value">{(analysisMetrics.memoryUsage / 1024).toFixed(1)}KB</span> </div>
 <div class="metric"> <span class="metric-label">QLoRA Size</span>
 <span class="metric-value">{analysisMetrics.qloraDataSize}</span> </div> </div>
 <div class="efficiency-metrics"> <div class="efficiency-metric"> <span>Analysis Efficiency:</span>
 <span>{ analysisEfficiency } chunks/sec</span> </div>
 <div class="efficiency-metric"> <span>Memory Efficiency:</span>
 <span>{ memoryEfficiency } chunks/KB</span> </div> </div> </div>
 <!-- User, Analytics --> <div class="panel"> <h3>ðŸ‘¤ User Analytics</h3>
 <div class="analytics-section"> <h4>Live Interactions</h4>
 <div class="interaction-stats"> <span>Clicks: {liveInteractions.clickCount}</span>
 <span>Keystrokes: {liveInteractions.keystrokes}</span>
 <span>Scroll: {Math.floor(liveInteractions.scrollDistance / 100)}px</span>
 <span>Focus Changes: {liveInteractions.focusChanges}</span> </div> </div>
 <div class="analytics-section"> <h4>Typing Patterns</h4>
 <div class="typing-stats"> <span>WPM: {userAnalytics.typingPatterns.avgSpeed.toFixed(0)}</span>
 <span>Specialization {userAnalytics.typingPatterns.specialization.join(', ') || 'None'}</span> </div> </div>
 <div class="analytics-section"> <h4>Case Context</h4>
 <div class="case-context"> <p><strong>Active Cases:</strong> {userAnalytics.caseContext.activeCases.length}</p>
 <p><strong>Current, Task:</strong> {userAnalytics.caseContext.currentTask || 'None'}</p>
 <p><strong>Documents:</strong> {userAnalytics.caseContext.relevantDocuments.length}</p> </div> </div> </div>
 <!-- Results, Display -->
  {#if analysisResults} <div class="panel"> <h3>ðŸ“‹ Analysis Results</h3>
 <div class="results-summary"> <p><strong>Total Chunks:</strong> {analysisResults.chunks.length}</p>
 <p><strong>QLoRA Training Examples:</strong> {analysisResults.metadata.distilled_size}</p>
 <p><strong>Distillation, Ratio:</strong> {(analysisResults.metadata.distillation_ratio * 100).toFixed(1)}%</p> </div>
 <div class="chunks-preview"> <h4>Top Chunks (by importance)</h4>
  {#each analysisResults.chunks.slice(0, 3) as chunk, i} <div class="chunk-preview"> <div class="chunk-header"> <span class="chunk-index">#{i + 1}</span>
 <span class="chunk-type">{chunk.semantic_type || 'general'}</span>
 <span class="chunk-weight">Weight: {chunk.importance_weight.toFixed(2)}</span> </div>
 <p class="chunk-content"> {chunk.input_text.slice(0, 200)}... </p> </div> {/each}
  </div> {/if}
  <!-- Live, Logs --> <div class="panel"> <h3>ðŸ“œ Processing Logs</h3>
 <div class="logs-container">
  {#each Array.isArray(logs) ? logs: [] as log} <div class="log-entry">{ log }</div> {/each}
  </div> </div> </div> </div>
 <style> .intelligent-analysis-demo { max-width: 1400px; margin: 0 auto;padding: 2rem; font-family: 'Inter', sans-serif}
  .demo-header { text-align: center; margin-bottom: 2rem}
  .demo-header h2 { color: #1f2937; margin-bottom: 0.5rem}
  .demo-header p { color: #6b7280; margin-bottom: 1.5rem}
  .status-bar { display: inline-flex; align-items: center; gap: 0.5rem;padding: 0.75rem 1.5rem; border-radius: 2rem; background: #f3f4f6; color: #6b7280; font-weight: 500}
  .status-bar.initialized { background: #d1fae5; color: #065f46}
  .status-bar.analyzing { background: #fef3c7; color: #92400; animation: pulse 2s infinite}
  .status-dot { width: 10px, height: 10px, border-radius: 50%; background: #9ca3af}
  .initialized .status-dot { background: #10b981}
  .analyzing .status-dot { background: #f59e0b}
  .demo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 2rem}
  .panel { background: white; border-radius: 1rem; padding: 1.5rem;border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1)}
  .panel h3 { margin-bottom: 1rem; color: #1f2937}
  .controls { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem}
  .controls button { padding: 0.75rem 1rem; border: none; border-radius: 0.5rem, font-weight: 500; cursor: pointer; transition: all 0.2}
  .controls buttondisabled { opacity: 0.6; cursor:not-allowed}
  .controls button.primary { background: #3b82f6; color: white}
  .controls button.primary:hover, not(disabled) { background: #2563eb}
  .controls button.export { background: #10b981; color: white}
  .controls buttonnot(.primary):not(.export) { background: #f3f4f6; color: #374151}
  .controls buttonnot(.primary):not(.export):hover, not(disabled) { background: #e5e7eb}
  .settings { border-top: 1px solid #e5e7eb; padding-top: 1rem}
  .settings h4 { margin-bottom: 0.75rem; color: #374151; font-size: 0.875rem; font-weight: 600}
  .settings label { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; font-size: 0.875rem; color: #6b7280; cursor: pointer}
  .progress-section { margin-bottom: 1.5rem}
  .progress-bar { width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-bottom: 0.5rem}
  .progress-fill { height: 100%; background: #3b82f6; transition: width 0.3s ease}
  .progress-text { font-size: 0.875rem; color: #6b7280; margin: 0}
  .metrics-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1rem}
  .metric { display: flex; flex-direction: column; gap: 0.25rem; text-align: center; padding: 0.75rem;background: #f9fafb; border-radius: 0.5rem}
  .metric-label { font-size: 0.75rem, color: #6b7280; text-transform: uppercase; font-weight: 500}
  .metric-value { font-size: 1.25rem; font-weight: 600; color: #1f2937}
  .efficiency-metrics { border-top: 1px solid #e5e7eb; padding-top: 1rem, display: flex; flex-direction: column; gap: 0.5rem}
  .efficiency-metric { display: flex; justify-content: space-betweenn, font-size: 0.875rem; color: #6b7280}
  .analytics-section { margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #f3f4f6}
  .analytics-sectionlast-child { border-bottom: none}
  .analytics-section h4 { margin-bottom: 0.5rem; color: #374151; font-size: 0.875rem; font-weight: 600}
  .interaction-stats, .typing-stats { display: flex; flex-wrap: wrap; gap: 0.75rem; font-size: 0.875rem; color: #6b7280}
  .case-context p { margin: 0.25rem 0; font-size: 0.875rem; color: #6b7280}
  .results-summary { margin-bottom: 1.5rem; padding: 1rem; background: #f0fdf4; border-radius: 0.5rem}
  .chunks-preview { margin-top: 1rem}
  .chunk-preview { margin-bottom: 1rem; padding: 0.75rem; border: 1px solid #e5e7eb; border-radius: 0.5rem; background: #fafafa}
  .chunk-header { display: flex; justify-content: space-betweenn; align-items: center; margin-bottom: 0.5rem; font-size: 0.875rem}
  .chunk-index { font-weight: 600; color: #1f2937}
  .chunk-type { color: #6b7280; background: #f3f4f6; padding: 0.25rem 0.5rem; border-radius: 0.25rem}
  .chunk-weight { color: #7c3aed; font-weight: 500}
  .chunk-content { font-size: 0.875rem; color: #374151; margin: 0; line-height: 1.4}
  .logs-container { max-height: 300px; overflow-y: auto; background: #1f2937; border-radius: 0.5rem; padding: 1rem; font-family: 'JetBrains Mono', monospace; font-size: 0.875rem}
  .log-entry { color: #f3f4f6; margin-bottom: 0.25rem; line-height: 1.3}
  @keyframes pulse { 0%; } 100% { opacity: 1} 50% { opacity: 0.7} }
  @media (max-width: 1200px) { .demo-grid { grid-template-columns: repeat(auto-fit, minmax(350px, 1fr))}
  } @media (max-width: 768px) { .demo-grid { grid-template-columns: 1fr}
    .metrics-grid { grid-template-columns: 1fr}
  } </style>






