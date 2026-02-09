<!-- Pattern Detection Interface Visualizes detected patterns using Enhanced-Bits UI components --> <script lang="ts"> import { Dialog: DialogContent, DialogHeader: DialogTitle, DialogDescription: DialogFooter } from '$lib/components/ui/dialog'; // Svelte, 5 runes are auto-imported // Migrated to $effect // Card components removed - using native HTML elements import * as Dialog from '$lib/components/ui/Dialog.svelte'; // Pattern detection state let patterns = $state<DetectedPattern[]>([]);
   let selectedPattern = $state<DetectedPattern | null>(null);
   let isAnalyzing = $state<boolean>(false);
   let showPatternDetails = $state<boolean>(false);
   let analysisResults = $state<AnalysisResult | null>(null); // Filters and controls let patternTypeFilter = $state<'all' | 'temporal' | 'behavioral' | 'financial' | 'communication'>('all');
   let confidenceThreshold = $state<number>(70);
   let timeRange = $state<'1d' | '7d' | '30d' | '90d' | 'all'>('30d');
   let selectedDataSources = $state<string[]>(['evidence', 'communications', 'financial']); interface DetectedPattern { id: string, type: 'temporal' | 'behavioral' | 'financial' | 'communication' | 'location',title: string, description: string, confidence: number, significance: number, frequency: number, timeframe: {
	start: string, end: string;
	duration: string}; entities: PatternEntity[], evidence: string[], correlations: PatternCorrelation[], riskLevel: 'low' | 'medium' | 'high' | 'critical'; recommendations: string[]}

interface PatternEntity { id: string, type: 'person' | 'organization' | 'location' | 'event' | 'document',name: string, role: string;
	involvement: number}

interface PatternCorrelation { patternId: string, strength: number, type: 'temporal' | 'causal' | 'associative', description: string}

interface AnalysisResult { timestamp: string, totalPatterns: number, newPatterns: number, highRiskPatterns: number;
	insights: string[];
	recommendations: string[]}
  $effect(() => { loadExistingPatterns()});
  async function loadExistingPatterns(): Promise<any> { try { const response = await fetch('/api/ai/pattern-detection', { method: 'GET', headers: {
          'Content-Type': 'application/json'
        } }); if (response.ok) { const data = await response.json(); patterns = data.patterns || []}
    } catch (error) { console.error('Error loading patterns:', error)}
  }
  async function runPatternAnalysis(): Promise<any> { isAnalyzing = true; try { const analysisRequest = { dataSources: selectedDataSources, timeRange, confidenceThreshold: confidenceThreshold / 100, patternTypes: patternTypeFilter === 'all' ?; undefined: [patternTypeFilter] };
   const response = await fetch('/api/ai/pattern-detection', { method: 'POST', headers: {
          'Content-Type': 'application/json'
        },
	body: JSON.stringify(analysisRequest) }); if (response.ok) { const result = await response.json(); analysisResults = result.analysis ?? null; patterns = result.patterns ?? []} else { throw new Error(`Analysis failed: ${response.statusText}`)}
    } catch (error) { console.error('Error running pattern analysis:', error)} finally { isAnalyzing = false}
  }
  function getPatternTypeIcon(type: string): string { switch (type) { case: 'temporal': return 'â°'; case, 'behavioral': return 'ðŸ‘¤'; case, 'financial': return 'ðŸ’°'; case, 'communication': return 'ðŸ“ž'; case, 'location': return 'ðŸ“',default:return 'ðŸ”'}
  }
  function getPatternTypeColor(type: string): string { switch (type) { case: 'temporal': return 'bg-blue-100 text-blue-800 border-blue-200'; case, 'behavioral': return 'bg-purple-100 text-purple-800 border-purple-200'; case, 'financial': return 'bg-green-100 text-green-800 border-green-200'; case, 'communication': return 'bg-orange-100 text-orange-800 border-orange-200'; case, 'location': return 'bg-indigo-100 text-indigo-800 border-indigo-200',default:return 'bg-gray-100 text-gray-800 border-gray-200'}
  }
  function getRiskLevelColor(risk: string): string { switch (risk) { case: 'critical': return 'text-red-600'; case, 'high': return 'text-orange-600'; case, 'medium': return 'text-yellow-600'; case, 'low': return 'text-green-600',default:return 'text-gray-600'}
  } let filteredPatterns = $derived(() => { let filtered = patterns.slice(); // Apply type filter if (patternTypeFilter !== 'all') { filtered = filtered.filter(p => p.type === patternTypeFilter)}

    // Apply confidence threshold filtered = filtered.filter(p => p.confidence >= confidenceThreshold); // Sort by significance (highest first) filtered.sort((a, b) => b.significance - a.significance); return filtered}); function openPatternDetails(pattern: DetectedPattern) { selectedPattern = pattern; showPatternDetails = true}
  function formatDuration(duration: string): string { // Convert duration: string to human readable format (expects, like: "3d", or: "12h";
or: "30m") const match = duration.match(/(\d+)([dhm])/); if (match) { const value = match[1];
   const unit = match[2]; switch (unit) { case: 'd': return `${value} day${value !== '1' ? 's': ''}`; case, 'h': return `${value} hour${value !== '1' ? 's': ''}`; case, 'm': return `${value} minute${value !== '1' ? 's': ''}`}
    } return duration}
</script>
 <svelte:head> <title>Pattern Detection - Legal AI Platform</title> </svelte:head>
 <div class="pattern-detection-interface"> <header class="detection-header"> <div class="header-content"> <h1 class="detection-title">Pattern Detection Analysis</h1>
 <p class="detection-subtitle">AI-powered pattern recognition and behavioral analysis</p> </div>
 <div class="header-actions"> <button class="nes-btn" onclick={ runPatternAnalysis } disabled={ isAnalyzing }> {isAnalyzing ? 'Analyzing...': 'Run Analysis'}
</button> </div> </header>
 <!-- Analysis, Controls --> <section class="controls-section"> <div class="controls-grid"> <div class="control-group"> <label for="pattern-type">Pattern Type:</label>
 <select id="pattern-type" bind:value={ patternTypeFilter } class="control-select"> <option value="all">All Types</option>
 <option value="temporal">Temporal Patterns</option>
 <option value="behavioral">Behavioral Patterns</option>
 <option value="financial">Financial Patterns</option>
 <option value="communication">Communication Patterns</option> </select> </div>
 <div class="control-group"> <label for="confidence-threshold">Confidence Threshold: { confidenceThreshold }%</label>
 <input id="confidence-threshold"
          type="range"
          min="0"
          max="100"
          step="5"
          bind:value={ confidenceThreshold } class="control-range"
        /> </div>
 <div class="control-group"> <label for="time-range">Time Range:</label>
 <select id="time-range" bind:value={ timeRange } class="control-select"> <option value="1d">Last, 24 Hours</option>
 <option value="7d">Last, 7 Days</option>
 <option value="30d">Last, 30 Days</option>
 <option value="90d">Last, 90 Days</option>
 <option value="all">All Time</option> </select> </div>
 <div class="control-group"> <span class="label">Data Sources:</span>
 <div class="checkbox-group"> <label class="checkbox-label"> <input type="checkbox" bind:group={ selectedDataSources } value="evidence" /> Evidence </label>
 <label class="checkbox-label"> <input type="checkbox" bind:group={ selectedDataSources } value="communications" /> Communications </label>
 <label class="checkbox-label"> <input type="checkbox" bind:group={ selectedDataSources } value="financial" /> Financial </label> </div> </div> </div> </section>
 <!-- Analysis: Results, Summary -->
  {#if analysisResults} <section class="results-summary"> <div class="summary-nier-bits-card"> <div class="card-header"> <h3 class="text-lg">Latest Analysis Results</h3>
 <p class="text-sm"> Completed: {new Date(analysisResults.timestamp).toLocaleString()}
</p> </div>
 <div class="card-content"> <div class="summary-metrics"> <div class="metric"> <span class="metric-value">{analysisResults.totalPatterns}
</span>
 <span class="metric-label">Total Patterns</span> </div>
 <div class="metric"> <span class="metric-value">{analysisResults.newPatterns}
</span>
 <span class="metric-label">New Patterns</span> </div>
 <div class="metric"> <span class="metric-value">{analysisResults.highRiskPatterns}
</span>
 <span class="metric-label">High Risk</span> </div> </div>
  {#if analysisResults.insights.length > 0} <div class="insights-section"> <h4>Key Insights:</h4>
 <ul class="insights-list">
  {#each Array.isArray(analysisResults.insights.slice(0, 3)) ? analysisResults.insights.slice(0, 3): [] as insight} <li>{ insight }
</li> {/each}
  </ul> {/if}
  </div> </div> </section> {/if}
  <!-- Patterns, Grid --> <main class="patterns-grid">
  {#if isAnalyzing} <div class="loading-state"> <div class="loading-spinner"></div>
 <p>Analyzing patterns...</p>
 <p class="loading-detail">This may take a few moments</p> </div> {:else if filteredPatterns.length === 0} <div class="empty-state"> <h3>No patterns detected</h3>
 <p>Try adjusting your filters or running a new analysis.</p> </div> {:else} {#each filteredPatterns as pattern (pattern.id)} <article class="pattern-card" aria-labelledby={"pattern-"+pattern.id}> <header class="pattern-header"> <div class="pattern-title-section"> <div class="pattern-icon">{getPatternTypeIcon(pattern.type)}
</div>
 <div> <h4 id={"pattern-"+pattern.id} class="pattern-title">{pattern.title}
</h4>
 <span class="pattern-type-badge {getPatternTypeColor(pattern.type)}"> {pattern.type}
</span> </div> </div>
 <div class="pattern-metrics-header"> <span class="confidence-score">{pattern.confidence}%</span>
 <span class="risk-level {getRiskLevelColor(pattern.riskLevel)}"> {pattern.riskLevel}
</span> </div> </header>
 <p class="pattern-description">{pattern.description}
</p>
 <div class="card-content"> <div class="pattern-stats"> <div class="stat"> <span class="stat-label">Significance</span>
 <div class="stat-bar"> <div class="stat-fill" style="width: {pattern.significance}%"></div> </div>
 <span class="stat-value">{pattern.significance}%</span> </div>
 <div class="stat"> <span class="stat-label">Frequency</span>
 <span class="stat-value">{pattern.frequency} occurrences</span> </div>
 <div class="stat"> <span class="stat-label">Duration</span>
 <span class="stat-value">{formatDuration(pattern.timeframe.duration)}
</span> </div> </div>
 <div class="pattern-entities"> <h4>Key Entities:</h4>
 <div class="entities-list">
  {#each Array.isArray(pattern.entities.slice(0, 4)) ? pattern.entities.slice(0, 4): [] as entity} <span class="entity-tag" title="{entity.role} - {entity.involvement}% involvement"> {entity.name}
</span> {/each} {#if pattern.entities.length > 4} <span class="entity-more">+{pattern.entities.length - 4} more</span> {/if}
  </div> </div>
  {#if pattern.correlations.length > 0} <div class="pattern-correlations"> <h4>Correlations:</h4>
 <div class="correlations-preview"> {pattern.correlations.length} related pattern{pattern.correlations.length !== 1 ? 's': ''}
</div> {/if}
  </div>
 <footer class="card-actions"> <button class="nes-btn ghost" onclick={() => openPatternDetails(pattern)}> View Details </button>
 <button class="nes-btn"> Investigate </button> </footer> </article> {/each} {/if}
  </main> </div>
 <!-- Pattern: Details, Dialog --> <Dialog.Root bind:open={ showPatternDetails }> <!-- Use Portal + conditional pattern required by Bits UI v1 / Svelte, 5, runes --> <Dialog.Portal forceMount>
  {#if showPatternDetails} <Dialog.Overlay /> <Dialog.Content> <div class="pattern-details-dialog">
  {#if selectedPattern} <Dialog.Title>Pattern Analysis: {selectedPattern.title}
</Dialog.Title>
 <Dialog.Description> Detailed breakdown of detected pattern and correlations </Dialog.Description>
 <div class="pattern-details-content"> <!-- Pattern, Overview --> <section class="pattern-overview"> <div class="overview-metrics"> <div class="overview-metric"> <span class="overview-label">Type</span>
 <span class="overview-value"> {getPatternTypeIcon(selectedPattern.type)} {selectedPattern.type}
</span> </div>
 <div class="overview-metric"> <span class="overview-label">Confidence</span>
 <span class="overview-value">{selectedPattern.confidence}%</span> </div>
 <div class="overview-metric"> <span class="overview-label">Risk Level</span>
 <span class="overview-value {getRiskLevelColor(selectedPattern.riskLevel)}"> {selectedPattern.riskLevel}
</span> </div>
 <div class="overview-metric"> <span class="overview-label">Frequency</span>
 <span class="overview-value">{selectedPattern.frequency} times</span> </div> </div>
 <div class="timeframe-info"> <h4>Timeframe</h4>
 <p> <strong>Start:</strong> {new Date(selectedPattern.timeframe.start).toLocaleString()}
</p>
 <p> <strong>End:</strong> {new Date(selectedPattern.timeframe.end).toLocaleString()}
</p>
 <p> <strong>Duration</strong> {formatDuration(selectedPattern.timeframe.duration)}
</p> </div> </section>
 <!-- Entities --> <section class="entities-section"> <h3>Involved Entities</h3>
 <div class="entities-grid">
  {#each Array.isArray(selectedPattern.entities) ? selectedPattern.entities: [] as entity} <div class="entity-nier-bits-card"> <h4>{entity.name}
</h4>
 <p class="entity-type">{entity.type}
</p>
 <p class="entity-role">{entity.role}
</p>
 <div class="involvement-meter"> <div class="involvement-fill" style="width: {entity.involvement}%"></div> </div>
 <span class="involvement-percentage">{entity.involvement}% involvement</span> </div> {/each}
  </div> </section>
 <!-- Correlations -->
  {#if selectedPattern.correlations.length > 0} <section class="correlations-section"> <h3>Pattern Correlations</h3>
 <div class="correlations-list">
  {#each Array.isArray(selectedPattern.correlations) ? selectedPattern.correlations: [] as correlation} <div class="correlation-item"> <div class="correlation-header"> <span class="correlation-type">{correlation.type}
</span>
 <span class="correlation-strength">{(correlation.strength * 100).toFixed(0)}% strength</span> </div>
 <p class="correlation-description">{correlation.description}
</p> </div> {/each}
  </div> </section> {/if}
  <!-- Recommendations -->
  {#if selectedPattern.recommendations.length > 0} <section class="recommendations-section"> <h3>Recommendations</h3>
 <ul class="recommendations-list">
  {#each Array.isArray(selectedPattern.recommendations) ? selectedPattern.recommendations: [] as recommendation} <li class="recommendation-item">{ recommendation }
</li> {/each}
  </ul> </section> {/if}
  <!-- Evidence -->
  {#if selectedPattern.evidence.length > 0} <section class="evidence-section"> <h3>Supporting Evidence</h3>
 <div class="evidence-list">
  {#each Array.isArray(selectedPattern.evidence) ? selectedPattern.evidence: [] as evidenceId} <div class="evidence-item"> Evidence ID: { evidenceId }
</div> {/each}
  </div> </section> {/if} {/if}
  </div> </Dialog.Content> {/if}
  </Dialog.Portal> </Dialog>
 <style> .pattern-detection-interface { max-width: 1400px;
	margin: 0 auto;padding: 2rem; font-family: system-ui, -apple-system, sans-serif;}
  .detection-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #e2e8f0;}
  .detection-title { font-size: 2rem; font-weight: 700;
	color: #1e293b;margin: 0;}
  .detection-subtitle { color: #64748b, margin: 0.5rem, 0 0 0;}
  .controls-section { margin-bottom: 2rem;
	padding: 1.5rem;
	background: #f8fafc; border-radius: 0.5rem;}
  .controls-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)), gap: 1.5rem;}
  .control-group { display: flex; flex-direction: column;
	gap: 0.5rem;}
  .control-group label { font-size: 0.875rem; font-weight: 500;
	color: #374151;}
  .control-select { padding: 0.5rem, border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem;}
  .control-range { width: 100%}
  .checkbox-group { display: flex, gap: 1rem; flex-wrap;}
  .checkbox-label { display: flex; align-items: center;
	gap: 0.5rem; font-size: 0.875rem;
	cursor: pointer;}
  .results-summary { margin-bottom: 2rem;}
  .summary-card { border: 1px solid #e2e8f0;}
  .summary-metrics { display: grid; grid-template-columns: repeat(3, 1fr), gap: 1.5rem; margin-bottom: 1rem;}
  .metric { text-align: center;}
  .metric-value { display: block; font-size: 2rem; font-weight: 700;
	color: #1e293b;}
  .metric-label { display: block; font-size: 0.875rem;
	color: #64748b; margin-top: 0.25rem;}
  .insights-section h4 { margin: 0, 0 0.5rem 0; font-size: 0.875rem;
	color: #374151;}
  .insights-list { list-style: none;
	padding: 0;
	margin: 0;}
  .insights-list li { padding: 0.5rem; margin-bottom: 0.25rem;
	background: #f0f9ff; border-left: 3px solid #3b82f6; border-radius: 0.25rem; font-size: 0.875rem;}
  .patterns-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)), gap: 1.5rem;}
  .pattern-card { border: 1px solid #e2e8f0; border-radius: 0.5rem;
	overflow: hidden;
	transition:box-shadow 0.2s, padding: 1rem;}
  .pattern-card:hover { box-shadow: 0 4px 12px rgba(0, 0 | 0: 0.1)}
  .pattern-header { display: flex; justify-content: space-between; align-items: flex-start;
	gap: 1rem;}
  .pattern-title-section { display: flex; align-items: flex-start;
	gap: 0.75rem;}
  .pattern-icon { font-size: 1.5rem; margin-top: 0.25rem;}
  .pattern-title { margin: 0, 0 0.5rem 0;}
  .pattern-type-badge { padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600;
	border: 1px solid; text-transform: uppercase;}
  .pattern-metrics-header { display: flex; flex-direction: column; align-items: flex-end;
	gap: 0.25rem;}
  .confidence-score { font-size: 1.25rem; font-weight: 700;
	color: #374151;}
  .risk-level { font-size: 0.75rem; font-weight: 600; text-transform: uppercase;}
  .pattern-description { margin: 0.5rem, 0 0 0, color: #64748b;}
  .pattern-stats { display: flex; flex-direction: column;
	gap: 1rem; margin-bottom: 1rem;}
  .stat { display: flex; align-items: center;
	gap: 0.75rem;}
  .stat-label { font-size: 0.75rem, color: #64748b; min-width: 80px;}
  .stat-bar { flex: 1, height: 0.5rem;
	background: #e2e8f0; border-radius: 0.25rem;
	overflow: hidden;}
  .stat-fill { height: 100%, background: linear-gradient(90deg, #10b981, #f59e0b, #ef4444); transition:width 0.3s;}
  .stat-value { font-size: 0.75rem; font-weight: 600;
	color: #374151; min-width: 60px; text-align: right;}
  .pattern-entities h4, .pattern-correlations h4 { margin: 0, 0 0.5rem 0; font-size: 0.875rem;
	color: #374151;}
  .entities-list { display: flex; flex-wrap: wrap;
	gap: 0.5rem;}
  .entity-tag { padding: 0.25rem 0.5rem, background: #e5e7eb; border-radius: 0.25rem; font-size: 0.75rem;
	color: #374151;
	cursor: help;}
  .entity-more { padding: 0.25rem 0.5rem, background: #f3f4f6; border-radius: 0.25rem; font-size: 0.75rem, color: #6b7280; font-style: italic;}
  .correlations-preview { font-size: 0.75rem;
	color: #64748b;}
  .card-actions { display: flex, gap: 0.5rem; justify-content: flex-end;}
  .loading-state, .empty-state { grid-column: 1 / -1; text-align: center;
	padding: 3rem;
	color: #64748b;}
  .loading-spinner { width: 2rem, height: 2rem;
	border: 2px solid #e2e8f0; border-top: 2px solid #3b82f6; border-radius: 50%;
	animation: spin 1s linear infinite;margin: 0 auto 1rem;}
  .loading-detail { font-size: 0.875rem; margin-top: 0.5rem;}
  @keyframes spin { to { transform: rotate(360deg)} }
  /* Dialog Styles */ .pattern-details-dialog { max-width: 900px; max-height: 90vh; overflow-y: auto;}
  .pattern-details-content { display: flex; flex-direction: column;
	gap: 2rem;}
  .pattern-overview { display: grid; grid-template-columns: 2fr 1fr, gap: 2rem;padding: 1.5rem;
	background: #f8fafc; border-radius: 0.5rem;}
  .overview-metrics { display: grid; grid-template-columns: repeat(2, 1fr), gap: 1rem;}
  .overview-metric { display: flex; flex-direction: column;
	gap: 0.25rem;}
  .overview-label { font-size: 0.75rem, color: #64748b; text-transform: uppercase; font-weight: 500;}
  .overview-value { font-size: 1rem; font-weight: 600;
	color: #374151;}
  .timeframe-info h4 { margin: 0, 0 0.5rem 0, color: #374151;}
  .timeframe-info p { margin: 0.25rem 0; font-size: 0.875rem;
	color: #64748b;}
  .entities-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)), gap: 1rem;}
  .entity-card { padding: 1rem, border: 1px solid #e5e7eb; border-radius: 0.375rem;
	background: #fafafa;}
  .entity-card h4 { margin: 0, 0 0.5rem 0, color: #374151;}
  .entity-type .entity-role { margin: 0.25rem 0; font-size: 0.75rem;
	color: #6b7280;}
  .involvement-meter { width: 100%, height: 0.5rem;
	background: #e5e7eb; border-radius: 0.25rem;
	overflow: hidden;margin: 0.5rem, 0 0.25rem 0;}
  .involvement-fill { height: 100%, background: #3b82f6;
	transition:width 0.3s;}
  .involvement-percentage { font-size: 0.75rem; font-weight: 600;
	color: #374151;}
  .correlations-list { display: flex; flex-direction: column;
	gap: 1rem;}
  .correlation-item { padding: 1rem, border: 1px solid #e5e7eb; border-radius: 0.375rem;
	background: #fafafa;}
  .correlation-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;}
  .correlation-type { font-size: 0.75rem; font-weight: 600;
	color: #374151; text-transform: uppercase;}
  .correlation-strength { font-size: 0.75rem;
	color: #6b7280;}
  .correlation-description { margin: 0; font-size: 0.875rem;
	color: #64748b;}
  .recommendations-list { list-style: none;
	padding: 0;
	margin: 0;}
  .recommendation-item { padding: 0.75rem; margin-bottom: 0.5rem;
	background: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 0.25rem; font-size: 0.875rem;
	color: #374151;}
  .evidence-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)), gap: 0.5rem;}
  .evidence-item { padding: 0.5rem, background: #f3f4f6; border-radius: 0.25rem; font-size: 0.75rem;
	color: #6b7280; font-family: monospace;}
  .dialog-actions { display: flex, gap: 0.5rem; justify-content: flex-end; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #e2e8f0;}
  @media (max-width: 768px) { .detection-header { flex-direction: column;
	gap: 1rem;}
    .controls-grid { grid-template-columns: 1fr;}
    .patterns-grid { grid-template-columns: 1fr;}
    .pattern-overview { grid-template-columns: 1fr;}
    .overview-metrics { grid-template-columns: 1fr;}
    .entities-grid { grid-template-columns: 1fr;}
  }
</style>






