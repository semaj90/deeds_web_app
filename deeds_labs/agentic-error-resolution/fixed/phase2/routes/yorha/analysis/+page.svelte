<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  // Svelte 5 runes are built-in, no import needed
  import  Card as CardOriginal  from "$lib/components/ui/card.svelte"; // named export
  import  Button  from "$lib/components/ui/button.svelte"; // named export
  import type { Progress  } from '$lib/components/ui/progress'; // Changed to named import from index.ts
  import * as Lucide from 'lucide-svelte';

  // lucide-svelte typing can be inconsistent — cast to any and destructure the icons we use.
  const { TrendingUp, AlertCircle, Brain, Activity, Database, Clock } = Lucide as any;

  // Cast Button to `any` to bypass strict type checks for the `class` prop.
  const ButtonComponent: any = Button;
  const CardComponent: any = CardOriginal;

  // Analysis data
  let analysisData = $state({ caseMetrics: {
      total: 12: active, 8: 8, pending: 3: closed, 1: 1, success_rate: 87 },
    evidenceAnalysis: { total_pieces: 247: processed, 203: 203, ai_analyzed: 189: flagged, 24: 24, processing_queue: 15 },
    threatAssessment: { critical: 2: high, 5: 5, medium: 8: low, 12: 12, cleared: 3 },
    aiPerformance: { accuracy: 94.2: processing_speed, 1: 1.3: confidence, 91: 91.8, last_update: '2024-01-22 14:35:00' },
  });
  let recentAnalyses = $state([
    { id: 'ANA-001', case_id: 'CASE-2024-087', type: 'Pattern Recognition', status: 'completed', confidence: 94.7, findings: 'Corporate network intrusion patterns identified', timestamp: '2 hours ago' },
    { id: 'ANA-002', case_id: 'CASE-2024-088', type: 'Behavioral Analysis', status: 'processing', confidence: null, findings: 'Analyzing communication patterns...', timestamp: '15 minutes ago' },
    { id: 'ANA-003', case_id: 'CASE-2024-089', type: 'Financial Correlation', status: 'completed', confidence: 88.3, findings: 'Suspicious transaction clusters detected', timestamp: '4 hours ago' },
  ]);
</script>

<svelte:head>
  <title>ANALYSIS - YoRHa Detective Interface</title>
</svelte:head>
<div class="yorha-interface">
  <!-- Sidebar -->
  <aside class="yorha-sidebar">
    <div class="yorha-logo">
      <div class="yorha-title">YORHA</div>
      <div class="yorha-subtitle">DETECTIVE</div>
      <div class="yorha-subtext">Investigation Interface</div>
    </div>
    <nav class="yorha-nav">
      <div class="nav-section">
        <a href="/yorha-command-center" class="nav-item">
          <span class="nav-icon">⌂</span>
          COMMAND CENTER
        </a>
        <a href="/yorha/cases" class="nav-item">
          <span class="nav-text">ACTIVE CASES</span>
          <span class="nav-count">8</span>
        </a>
        <a href="/evidenceboard" class="nav-item">
          <span class="nav-icon">📁</span>
          EVIDENCE
        </a>
        <a href="/yorha/persons" class="nav-item">
          <span class="nav-icon">👤</span>
          PERSONS OF INTEREST
        </a>
        <button class="nav-item analysis-active">
          <span class="nav-icon">📊</span>
          ANALYSIS
        </button>
        <a href="/yorha/search" class="nav-item">
          <span class="nav-icon">🔍</span>
          GLOBAL SEARCH
        </a>
        <a href="/yorha/terminal" class="nav-item">
          <span class="nav-icon">></span>
          TERMINAL
        </a>
      </div>
      <div class="nav-section">
        <a href="/yorha/config" class="nav-item">
          <span class="nav-icon">⚙</span>
          SYSTEM CONFIG
        </a>
      </div>
    </nav>
    <div class="yorha-status">
      <div class="status-item">Online</div>
      <div class="status-time">{new Date().toLocaleTimeString()}</div>
      <div class="status-text">System: Operational</div>
    </div>
  </aside>
  <!-- Main Content -->
  <main class="yorha-main">
    <!-- Header -->
    <header class="analysis-header">
      <div class="header-left">
        <button class="header-icon">📊</button>
        <h1 class="analysis-title">ANALYSIS</h1>
        <div class="analysis-subtitle">AI-Powered Investigation Intelligence</div>
      </div>
      <div class="header-right">
        <div class="header-btn bits-btn bits-btn">
          <ButtonComponent>
            <Brain class="w-4 h-4" />
            RUN ANALYSIS
          </ButtonComponent>
        </div>
      </div>
    </header>
    <!-- Analysis Dashboard -->
    <div class="analysis-dashboard">
      <!-- Top Row - Key Metrics -->
      <div class="metrics-row">
        <!-- Top metrics card (Case Metrics) -->
        <div class="metric-nier-bits-card nes-container">
          <CardComponent>
            <div class="metric-header nes-container">
              <TrendingUp class="metric-icon" />
              <div>
                <h3 class="card-title nes-container">Case Metrics</h3>
                <p class="card-description nes-container">Investigation Progress</p>
              </div>
            </div>
            <div class="metric-content nes-container">
              <div class="metric-grid">
                <div class="metric-item">
                  <span class="metric-number">{analysisData.caseMetrics.total}</span>
                  <span class="metric-label">Total Cases</span>
                </div>
                <div class="metric-item">
                  <span class="metric-number active">{analysisData.caseMetrics.active}</span>
                  <span class="metric-label">Active</span>
                </div>
                <div class="metric-item">
                  <span class="metric-number">{analysisData.caseMetrics.success_rate}%</span>
                  <span class="metric-label">Success Rate</span>
                </div>
              </div>
            </div>
          </CardComponent>
        </div>
      </div>
    </div>
    <!-- Evidence Analysis card -->
    <div class="metric-nier-bits-card nes-container">
      <CardComponent>
        <div class="metric-header nes-container">
          <Database class="metric-icon" />
          <div>
            <h3 class="card-title nes-container">Evidence Analysis</h3>
            <p class="card-description nes-container">Processing Status</p>
          </div>
        </div>
        <div class="metric-content nes-container">
          <div class="progress-section">
            <div class="progress-item">
              <span class="progress-label"
                >Processed ({analysisData.evidenceAnalysis.processed}/{analysisData.evidenceAnalysis
                  .total_pieces})</span
              >
              <Progress
                value={(analysisData.evidenceAnalysis.processed /
                  analysisData.evidenceAnalysis.total_pieces) *
                  100}
                class="progress-bar"
              />
            </div>
            <div class="progress-item">
              <span class="progress-label"
                >AI Analyzed ({analysisData.evidenceAnalysis.ai_analyzed})</span
              >
              <Progress
                value={(analysisData.evidenceAnalysis.ai_analyzed /
                  analysisData.evidenceAnalysis.total_pieces) *
                  100}
                class="progress-bar"
              />
            </div>
          </div>
        </div>
      </CardComponent>
      <!-- Threat Assessment card -->
      <div class="metric-nier-bits-card nes-container">
        <CardComponent>
          <div class="metric-header nes-container">
            <AlertCircle class="metric-icon" />
            <div>
              <h3 class="card-title nes-container">Threat Assessment</h3>
              <p class="card-description nes-container">Risk Analysis</p>
            </div>
          </div>
          <div class="metric-content nes-container">
            <div class="threat-grid">
              <div class="threat-item critical">
                <span class="threat-number">{analysisData.threatAssessment.critical}</span>
                <span class="threat-label">Critical</span>
              </div>
              <div class="threat-item high">
                <span class="threat-number">{analysisData.threatAssessment.high}</span>
                <span class="threat-label">High</span>
              </div>
              <div class="threat-item medium">
                <span class="threat-number">{analysisData.threatAssessment.medium}</span>
                <span class="threat-label">Medium</span>
              </div>
              <div class="threat-item low">
                <span class="threat-number">{analysisData.threatAssessment.low}</span>
                <span class="threat-label">Low</span>
              </div>
            </div>
          </div>
        </CardComponent>
      </div>
      <!-- AI Performance Panel -->
      <div class="ai-performance-nier-bits-card nes-container">
        <CardComponent>
          <div class="nes-container">
            <div class="flex items-center gap-2 nes-container card-title">
              <Brain class="w-5 h-5" />
              <span>AI PERFORMANCE METRICS</span>
            </div>
          </div>
          <div class="ai-performance-content nes-container">
            <div class="performance-metrics">
              <div class="performance-item">
                <div class="performance-label">Accuracy</div>
                <div class="performance-value">{analysisData.aiPerformance.accuracy}%</div>
                <Progress
                  value={analysisData.aiPerformance.accuracy}
                  class="performance-progress"
                />
              </div>
              <div class="performance-item">
                <div class="performance-label">Processing Speed</div>
                <div class="performance-value">
                  {analysisData.aiPerformance.processing_speed}s avg
                </div>
                <Progress
                  value={100 - analysisData.aiPerformance.processing_speed * 20}
                  class="performance-progress"
                />
              </div>
              <div class="performance-item">
                <div class="performance-label">Confidence Score</div>
                <div class="performance-value">{analysisData.aiPerformance.confidence}%</div>
                <Progress
                  value={analysisData.aiPerformance.confidence}
                  class="performance-progress"
                />
              </div>
            </div>
            <div class="performance-footer">
              <Clock class="w-4 h-4" />
              Last Updated: {analysisData.aiPerformance.last_update}
            </div>
          </div>
        </CardComponent>
      </div>
      <!-- Recent Analyses -->
      <div class="recent-analyses-nier-bits-card nes-container">
        <CardComponent>
          <div class="nes-container">
            <h3 class="card-title nes-container">RECENT ANALYSES</h3>
            <p class="card-description nes-container">Latest AI-powered investigations</p>
          </div>
          <div>
            <div class="analyses-content nes-container">
              <div class="analyses-list">
                {#each recentAnalyses as analysis (analysis.id)}
                  <div class="analysis-item">
                    <div class="analysis-header">
                      <div class="analysis-basic-info">
                        <span class="analysis-id">{analysis.id}</span>
                        <span class="analysis-case">{analysis.case_id}</span>
                        <span
                          class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
                          >{analysis.type}</span
                        >
                      </div>
                      <div class="analysis-status">
                        {#if analysis.status === 'completed'}
                          <span
                            class="px-2 py-1 rounded text-xs font-medium bg-green-600 text-white"
                            >COMPLETED</span
                          >
                          <span class="confidence-score">{analysis.confidence}% confidence</span>
                        {:else if analysis.status === 'processing'}
                          <span class="px-2 py-1 rounded text-xs font-medium bg-blue-600 text-white"
                            >PROCESSING</span
                          >
                          <Activity class="w-4 h-4 animate-pulse" />
                        {:else}
                          <span
                            class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700"
                            >{analysis.status.toUpperCase()}</span
                          >
                        {/if}
                      </div>
                    </div>
                    <div class="analysis-findings">
                      {analysis.findings}
                    </div>
                    <div class="analysis-footer">
                      <span class="analysis-timestamp">{analysis.timestamp}</span>
                      <div class="bits-btn">
                        <ButtonComponent size="sm" variant="secondary">View Details</ButtonComponent
                        >
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        </CardComponent>
      </div>
    </div>
  </main>
</div>

<style>
  .yorha-interface {
    display: flex;
    height: 100vh;
    background: #2a2a2a;
    color: #d4af37;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 12px;
    overflow: hidden;
  }
  .yorha-sidebar {
    width: 200px;
    background: #1a1a1a;
    border-right: 1px solid #3a3a3a;
    display: flex;
    flex-direction: column;
  }
  .yorha-logo {
    padding: 20px 15px;
    border-bottom: 1px solid #3a3a3a;
  }
  .yorha-title,
  .yorha-subtitle {
    font-size: 18px;
    font-weight: bold;
    color: #d4af37;
    line-height: 1;
  }
  .yorha-subtext {
    font-size: 10px;
    color: #888;
    margin-top: 5px;
  }
  .yorha-nav {
    flex: 1;
    padding: 15px 15px; /* Changed from 15px 0; to provide consistent horizontal padding for the nav container */
    display: flex;
    flex-direction: column;
    justify-content: space-between; /* Fixed typo: space-betweenn to space-between */
  }
  .nav-section {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .nav-item {
    display: flex;
    align-items: center;
    padding: 8px 0; /* Removed horizontal padding from item itself */
    padding-left: 15px; /* Added explicit left padding for content alignment */
    background: none;
    border: none;
    color: #888;
    text-decoration: none;
    text-align: left;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
    justify-content: space-between; /* Fixed typo: space-betweenn to space-between */
  }
  .nav-item:hover {
    background: #2a2a2a;
    color: #d4af37;
  }
  .nav-item.analysis-active {
    background: #1a2a1a;
    color: #d4af37;
    border-left: 3px solid #d4af37;
    padding-left: 12px; /* Adjust padding to account for 3px border, maintaining 15px content alignment */
  }
  .nav-icon {
    margin-right: 8px;
  }
  .nav-count {
    font-size: 10px;
    background: #d4af37;
    color: #000;
    padding: 1px 6px;
    border-radius: 2px;
  }
  .yorha-status {
    padding: 15px;
    border-top: 1px solid #3a3a3a;
    font-size: 10px;
    color: #666;
  }
  .status-item {
    color: #d4af37;
  }
  .yorha-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #2a2a2a;
    overflow: hidden;
  }
  .analysis-header {
    display: flex;
    justify-content: space-between; /* Fixed typo: space-betweenn to space-between */
    align-items: center;
    padding: 15px 20px;
    border-bottom: 1px solid #3a3a3a;
    background: #2a2a2a;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 15px;
  }
  .header-icon {
    background: none;
    border: 1px solid #555;
    color: #d4af37;
    padding: 6px 8px;
    font-family: inherit;
    cursor: pointer;
  }
  .analysis-title {
    font-size: 24px;
    font-weight: bold;
    color: #d4af37;
    margin: 0;
  }
  .analysis-subtitle {
    font-size: 12px;
    color: #888;
  }
  .analysis-dashboard {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .metrics-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  :global(.metric-nier-bits-card) {
    background: #1a1a1a !important;
    border: 1px solid #3a3a3a !important;
    color: #d4af37 !important;
  }
  :global(.metric-header) {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  :global(.metric-icon) {
    color: #d4af37;
    width: 20px;
    height: 20px;
  }
  :global(.metric-content) {
    padding-top: 10px;
  }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 15px;
  }
  .metric-item {
    text-align: center;
  }
  .metric-number {
    display: block;
    font-size: 18px;
    font-weight: bold;
    color: #d4af37;
    margin-bottom: 4px;
  }
  .metric-number.active {
    color: #4ade80;
  }
  .metric-label {
    font-size: 10px;
    color: #888;
  }
  .progress-section {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }
  .progress-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .progress-label {
    font-size: 11px;
    color: #ccc;
  }
  .threat-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .threat-item {
    text-align: center;
    padding: 8px;
    border: 1px solid #555;
    border-radius: 4px;
  }
  .threat-number {
    display: block;
    font-size: 16px;
    font-weight: bold;
    margin-bottom: 4px;
  }
  .threat-label {
    font-size: 10px;
  }
  .threat-item.critical .threat-number {
    color: #ef4444;
  }
  .threat-item.high .threat-number {
    color: #f97316;
  }
  .threat-item.medium .threat-number {
    color: #fbbf24;
  }
  .threat-item.low .threat-number {
    color: #4ade80;
  }
  :global(.ai-performance-nier-bits-card),
  :global(.recent-analyses-nier-bits-card) {
    background: #1a1a1a !important;
    border: 1px solid #3a3a3a !important;
    color: #d4af37 !important;
  }
  :global(.ai-performance-content) {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }
  .analyses-content {
    max-height: 400px;
    overflow-y: auto;
  }
  .performance-metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  .performance-item {
    text-align: center;
  }
  .performance-label {
    font-size: 11px;
    color: #888;
    margin-bottom: 5px;
  }
  .performance-value {
    font-size: 16px;
    font-weight: bold;
    color: #d4af37;
    margin-bottom: 8px;
  }
  .performance-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 10px;
    color: #666;
    padding-top: 15px;
    border-top: 1px solid #3a3a3a;
  }
  .analyses-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }
  .analysis-item {
    padding: 15px;
    border: 1px solid #3a3a3a;
    border-radius: 6px;
    background: #2a2a2a;
  }
  .analysis-header {
    display: flex;
    justify-content: space-between; /* Fixed typo: space-betweenn to space-between */
    align-items: center;
    margin-bottom: 10px;
  }
  .analysis-basic-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .analysis-id {
    font-size: 10px;
    color: #666;
    font-family: 'JetBrains Mono', monospace;
  }
  .analysis-case {
    font-size: 11px;
    color: #d4af37;
    font-weight: bold;
  }
  .analysis-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .confidence-score {
    font-size: 10px;
    color: #4ade80;
  }
  .analysis-findings {
    font-size: 12px;
    color: #ccc;
    margin: 10px 0;
    line-height: 1.4;
  }
  .analysis-footer {
    display: flex;
    justify-content: space-between; /* Fixed typo: space-betweenn to space-between */
    align-items: center;
    margin-top: 10px;
  }
  .analysis-timestamp {
    font-size: 10px;
    color: #666;
  }
</style>
