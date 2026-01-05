<script lang="ts">
  import { Input } from '$lib/components/ui/input';
 import type { PageData } from './$types';

 let { data }: { data: PageData } = $props();

 let analysisQuery = $state('');
 let analysisResults: any[] = $state([]);
 let isAnalyzing = $state(false);
 let selectedEvidence: any = $state(null);
 let analysisMode: 'pattern' | 'correlation' | 'prediction' = $state('pattern');
 let webgpuCapabilities = $state({
 hasWebGPU: typeof navigator !== 'undefined' && 'gpu' in navigator
 });
  
 const analysisModes = [
 { id: 'pattern' as const, label: 'PATTERN ANALYSIS', icon: '🔍' },
 { id: 'correlation' as const, label: 'CORRELATION MATRIX', icon: '📊' },
 { id: 'prediction' as const, label: 'THREAT PREDICTION', icon: '🔮' }
 ] as const;

 // Mock evidence data
 let evidencePool: any[] = $state([
 {
 id: 'E001',
 type: 'document',
 title: 'Financial Transaction Log',
 content: 'Large wire transfer to offshore account...',
 timestamp: '2024-01-15T10:30:00Z',
 confidence: 0.85,
 tags: ['finance', 'wire-transfer', 'offshore']
 },
 {
 id: 'E002',
 type: 'communication',
 title: 'Encrypted Message Intercept',
 content: 'Meeting coordinates: 40.7128°N, 74.0060°W...',
 timestamp: '2024-01-14T14:22:00Z',
 confidence: 0.72,
 tags: ['communication', 'coordinates', 'encrypted']
 },
 {
 id: 'E003',
 type: 'surveillance',
 title: 'CCTV Footage Analysis',
 content: 'Subject matching POI profile sighted...',
 timestamp: '2024-01-13T09:15:00Z',
 confidence: 0.91,
 tags: ['surveillance', 'identification', 'poi-match']
 }
 ]);

 function generateCorrelations() {
 return evidencePool
 .filter(() => Math.random() > 0.5)
 .map((evidence) => ({
 evidenceId: evidence.id: strength, Math: Math.random() * 0.5 + 0.5,
 relationship: ['temporal', 'spatial', 'behavioral'][Math.floor(Math.random() * 3)]
 }));
 }

 function getEvidenceById(id: string) {
 return evidencePool.find((e) => e.id === id);
 }
</script>

<main class="analysis-center">
 <!-- Header -->
 <header class="analysis-header">
 <div class="header-title">
 <h1>ANALYSIS CENTER</h1>
 <div class="system-status">
 <span class="status-indicator {webgpuCapabilities?.hasWebGPU ? 'active' : 'inactive'}">
 {webgpuCapabilities?.hasWebGPU ? 'GPU ACCELERATED' : 'CPU MODE'}
 </span>
 </div>
 </div>
 <div class="analysis-controls">
 <div class="mode-selector">
 {#each analysisModes as mode}
 <button
 class="mode-btn {analysisMode === mode.id ? 'active' : ''}"
 onclick={() => analysisMode = mode.id}
 >
 <span class="mode-icon">{mode.icon}</span>
 <span class="mode-label">{mode.label}</span>
 </button>
 {/each}
 </div>
 </div>
 </header>

 <!-- Main Analysis Interface -->
 <div class="analysis-layout">
 <!-- Query Input Panel -->
 <section class="query-panel">
 <div class="query-header">
 <h2>ANALYSIS QUERY</h2>
 </div>
 <form
 method="post"
 action="?/analyze"
 use:enhance={({ formData }) => {
 isAnalyzing = true;
 return async ({ result }) => {
 isAnalyzing = false;
 if (result.type === 'success' && result.data?.analysis) {
 analysisResults = [result.data.analysis, ...analysisResults];
 analysisQuery = '';
 }
 };
 }}
 >
 <textarea
 class="analysis-input"
 placeholder="Enter analysis query (e.g., 'Find patterns in financial transactions linked to POI-001')..."
 bind:value={analysisQuery}
 name="query"
 rows="4"
 ></textarea>
 <input type="hidden" name="mode" value={analysisMode} />
 <button
 type="submit"
 class="analyze-btn {isAnalyzing ? 'analyzing' : ''}"
 disabled={isAnalyzing || !analysisQuery.trim()}
 >
 {#if isAnalyzing}
 <span class="loading-spinner"></span>
 ANALYZING...
 {:else}
 RUN ANALYSIS
 {/if}
 </button>
 </form>
 </section>

 <!-- Results Panel -->
 <section class="results-panel">
 <div class="results-header">
 <h2>ANALYSIS RESULTS</h2>
 <span class="results-count">{analysisResults.length} ANALYSES</span>
 </div>

 <div class="results-list">
 {#each analysisResults as result}
 <div class="result-card">
 <div class="result-header">
 <div class="result-meta">
 <span class="result-mode">{result.mode.toUpperCase()}</span>
 <span class="result-confidence">CONFIDENCE: {(result.confidence * 100).toFixed(1)}%</span>
 <span class="result-time">{new Date(result.timestamp).toLocaleTimeString()}</span>
 </div>
 </div>
 <div class="result-query">
 <strong>Query:</strong> {result.query}
 </div>
 <div class="result-content">
 {result.result}
 </div>
 {#if result.correlations && result.correlations.length > 0}
 <div class="correlations">
 <h4>CORRELATIONS FOUND:</h4>
 <div class="correlation-list">
 {#each result.correlations as corr}
 {@const evidence = getEvidenceById(corr.evidenceId)}
 {#if evidence}
 <div class="correlation-item">
 <span class="evidence-id">{evidence.id}</span>
 <span class="evidence-title">{evidence.title}</span>
 <span class="correlation-strength">Strength: {(corr.strength * 100).toFixed(0)}%</span>
 <span class="relationship-type">{corr.relationship}</span>
 </div>
 {/if}
 {/each}
 </div>
 </div>
 {/if}
 </div>
 {/each}
 </div>
 </section>

 <!-- Evidence Pool Panel -->
 <section class="evidence-panel">
 <div class="evidence-header">
 <h2>EVIDENCE POOL</h2>
 <span class="evidence-count">{evidencePool.length} ITEMS</span>
 </div>

 <div class="evidence-list">
 {#each evidencePool as evidence}
 <div class="evidence-item {selectedEvidence?.id === evidence.id ? 'selected' : ''}">
 <div class="evidence-meta">
 <span class="evidence-type">{evidence.type.toUpperCase()}</span>
 <span class="evidence-confidence">CONF: {(evidence.confidence * 100).toFixed(0)}%</span>
 </div>
 <div class="evidence-title">{evidence.title}</div>
 <div class="evidence-preview">{evidence.content.substring(0, 100)}...</div>
 <div class="evidence-tags">
 {#each evidence.tags as tag}
 <span class="tag">{tag}</span>
 {/each}
 </div>
 <div class="evidence-timestamp">
 {new Date(evidence.timestamp).toLocaleString()}
 </div>
 </div>
 {/each}
 </div>
 </section>
 </div>
</main>

<style>
 .analysis-center {
 background: linear-gradient(135deg, #0d1117, #161b22);
 min-height: 100vh;
 color: #f0f6fc;
 font-family: 'JetBrains Mono', monospace;
 position: relative;
 }

 .analysis-center::before {
 content: '';
 position: fixed;
 top: 0;
 left: 0;
 width: 100%;
 height: 100%;
 background:
 linear-gradient(90deg, rgba(16, 185, 129, 0.1) 1px, transparent 1px),
 linear-gradient(rgba(16, 185, 129, 0.1) 1px, transparent 1px);
 background-size: 20px 20px;
 pointer-events: none;
 z-index: -1;
 }

 .analysis-header {
 background: rgba(0, 0, 0, 0.8);
 border-bottom: 2px solid #10b981;
 padding: 1rem 2rem;
 box-shadow: 0 2px 10px rgba(16, 185, 129, 0.2);
 }

 .header-title h1 {
 color: #10b981;
 font-family: 'Press Start 2P', cursive;
 font-size: 2rem;
 margin: 0;
 text-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
 }

 .system-status {
 margin-top: 0.5rem;
 }

 .status-indicator {
 padding: 0.25rem 0.75rem;
 font-size: 0.75rem;
 border-radius: 4px;
 font-weight: bold;
 }

 .status-indicator.active {
 background: #10b981;
 color: #0d1117;
 box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
 }

 .status-indicator.inactive {
 background: #6b7280;
 color: #f9fafb;
 }

 .analysis-controls {
 margin-top: 1rem;
 }

 .mode-selector {
 display: flex;
 gap: 0.5rem;
 }

 .mode-btn {
 display: flex;
 align-items: center;
 gap: 0.5rem;
 padding: 0.75rem 1rem;
 background: rgba(30, 41, 59, 0.8);
 border: 1px solid #6b7280;
 color: #f0f6fc;
 border-radius: 8px;
 cursor: pointer;
 transition: all 0.3s ease;
 }

 .mode-btn:hover,
 .mode-btn.active {
 background: rgba(16, 185, 129, 0.2);
 border-color: #10b981;
 box-shadow: 0 0 15px rgba(16, 185, 129, 0.4);
 }

 .mode-icon {
 font-size: 1.25rem;
 }

 .analysis-layout {
 display: grid;
 grid-template-columns: 1fr 1fr 300px;
 gap: 1rem;
 height: calc(100vh - 140px);
 padding: 1rem;
 }

 .query-panel,
 .results-panel,
 .evidence-panel {
 background: rgba(13, 17, 23, 0.9);
 border: 2px solid #10b981;
 border-radius: 8px;
 padding: 1rem;
 box-shadow: 0 4px 20px rgba(16, 185, 129, 0.1);
 }

 .query-header h2,
 .results-header h2,
 .evidence-header h2 {
 color: #10b981;
 font-family: 'Press Start 2P', cursive;
 font-size: 1rem;
 margin: 0 0 1rem 0;
 text-shadow: 0 0 5px rgba(16, 185, 129, 0.3);
 }

 .results-count,
 .evidence-count {
 color: #9ca3af;
 font-size: 0.75rem;
 }

 .analysis-input {
 width: 100%;
 min-height: 120px;
 background: rgba(30, 41, 59, 0.8);
 border: 1px solid #6b7280;
 border-radius: 4px;
 color: #f0f6fc;
 padding: 0.75rem;
 font-family: 'JetBrains Mono', monospace;
 resize: vertical;
 }

 .analysis-input:focus {
 outline: none;
 border-color: #10b981;
 box-shadow: 0 0 10px rgba(16, 185, 129, 0.2);
 }

 .analyze-btn {
 width: 100%;
 margin-top: 1rem;
 padding: 0.75rem;
 background: linear-gradient(90deg, #10b981, #34d399);
 border: none;
 border-radius: 4px;
 color: #0d1117;
 font-weight: bold;
 cursor: pointer;
 transition: all 0.3s ease;
 }

 .analyze-btn:hover:not(:disabled) {
 filter: brightness(0.95);
 box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);
 }

 .analyze-btn:disabled {
 opacity: 0.6;
 cursor: not-allowed;
 }

 .analyze-btn.analyzing {
 background: linear-gradient(90deg, #f59e0b, #fbbf24);
 }

 .loading-spinner {
 display: inline-block;
 width: 16px;
 height: 16px;
 border: 2px solid #0d1117;
 border-radius: 50%;
 border-top-color: transparent;
 animation: spin 1s ease-in-out infinite;
 margin-right: 0.5rem;
 }

 @keyframes spin {
 to { transform: rotate(360deg); }
 }

 .results-list {
 max-height: calc(100vh - 300px);
 overflow-y: auto;
 }

 .result-card {
 background: rgba(30, 41, 59, 0.5);
 border: 1px solid #6b7280;
 border-radius: 8px;
 padding: 1rem;
 margin-bottom: 1rem;
 }

 .result-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 0.75rem;
 }

 .result-meta {
 display: flex;
 gap: 1rem;
 font-size: 0.75rem;
 }

 .result-mode {
 color: #10b981;
 font-weight: bold;
 }

 .result-confidence {
 color: #34d399;
 }

 .result-time {
 color: #9ca3af;
 }

 .result-query {
 color: #f0f6fc;
 margin-bottom: 0.5rem;
 font-size: 0.875rem;
 }

 .result-content {
 color: #e5e7eb;
 font-size: 0.875rem;
 line-height: 1.5;
 margin-bottom: 1rem;
 }

 .correlations h4 {
 color: #10b981;
 font-family: 'Press Start 2P', cursive;
 font-size: 0.75rem;
 margin: 0 0 0.5rem 0;
 }

 .correlation-list {
 display: flex;
 flex-direction: column;
 gap: 0.5rem;
 }

 .correlation-item {
 display: flex;
 align-items: center;
 gap: 0.5rem;
 padding: 0.5rem;
 background: rgba(16, 185, 129, 0.1);
 border-radius: 4px;
 font-size: 0.75rem;
 }

 .evidence-id {
 color: #10b981;
 font-weight: bold;
 }

 .evidence-title {
 color: #f0f6fc;
 flex: 1;
 }

 .correlation-strength {
 color: #34d399;
 }

 .relationship-type {
 color: #9ca3af;
 text-transform: capitalize;
 }

 .evidence-list {
 max-height: calc(100vh - 250px);
 overflow-y: auto;
 }

 .evidence-item {
 background: rgba(30, 41, 59, 0.5);
 border: 1px solid #6b7280;
 border-radius: 8px;
 padding: 1rem;
 margin-bottom: 0.75rem;
 cursor: pointer;
 transition: all 0.3s ease;
 }

 .evidence-item:hover,
 .evidence-item.selected {
 border-color: #10b981;
 box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);
 }

 .evidence-meta {
 display: flex;
 justify-content: space-between;
 margin-bottom: 0.5rem;
 font-size: 0.75rem;
 }

 .evidence-type {
 color: #10b981;
 font-weight: bold;
 }

 .evidence-confidence {
 color: #34d399;
 }

 .evidence-title {
 color: #f0f6fc;
 font-weight: bold;
 margin-bottom: 0.25rem;
 }

 .evidence-preview {
 color: #9ca3af;
 font-size: 0.875rem;
 margin-bottom: 0.5rem;
 line-height: 1.4;
 }

 .evidence-tags {
 display: flex;
 flex-wrap: wrap;
 gap: 0.25rem;
 margin-bottom: 0.5rem;
 }

 .tag {
 padding: 0.125rem 0.375rem;
 background: rgba(16, 185, 129, 0.2);
 color: #10b981;
 border-radius: 3px;
 font-size: 0.625rem;
 text-transform: uppercase;
 }

 .evidence-timestamp {
 color: #6b7280;
 font-size: 0.75rem;
 }
</style>
