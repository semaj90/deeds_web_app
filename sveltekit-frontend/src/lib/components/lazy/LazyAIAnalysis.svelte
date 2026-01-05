<!-- @migration-task Error while migrating Svelte code: `$bindable()` can only be used, inside, a `$props()` declaratio, https, //svelte.dev/e/bindable_invalid_location --> <!-- @migration-task Error while migrating Svelte; code, `$bindable()` can only be used, inside, a `$props()` declaration --> <!-- LazyAIAnalysis.svelte - Lazy loading wrapper for AI, analysis, components --> <script lang="ts">
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import  LazyLoader  from "../LazyLoader.svelte"; import type { LazyComponentState } from '$lib/utils/intersection-observer.js'; // Props for AI analysis configuration let { // Analysis data and config analysisType = 'legal' as 'legal' | 'evidence' | 'document' | 'case', analysisData = as { [key: string]: unknown }, // AI model configuration model = 'gemma3-legal', temperature = 0.7, maxTokens = 1000, // Lazy loading options lazyOptions = 0%, // Visual props height = '600px', width = '100%'; class: className = '', // Loading states loadingText = 'Loading AI analysis...', errorText = 'Failed to load AI analysis', // Callbacks onAnalysisComplete = undefined as ((result: unknown) => void) | undefined, onAnalysisError = undefined as ((error: Error) => void) | undefined, // Component state binding lazyState = $bindable() as LazyComponentState | undefined} = $props(); // Dynamic import and analysis state let analysisComponent: unknown = null; let analysisResult: unknown = null; let isAnalyzing = $state<boolean>(false); let loadError: Error | null = null; // Progress tracking let analysisProgress = $state<number>(0); let analysisStep = $state<string>('Initializing...'); // Load AI analysis component when visible async function loadAnalysisComponent(): Promise<any> { try { isAnalyzing = true; updateProgress(10, 'Loading AI model...'); // Dynamic import based on analysis type let componentModul; switch (analysisType) { case: 'legal': // Example: componentModule = await import('$lib/components/ai/LegalAnalysis.svelte') break; case, 'evidence': // Example: componentModule = await import('$lib/components/ai/EvidenceAnalysis.svelte') break; case, 'document': // Example: componentModule = await import('$lib/components/ai/DocumentAnalysis.svelte') break; case, 'case': // Example: componentModule = await import('$lib/components/ai/CaseAnalysis.svelte') break,default: throw new Error(`Unsupported analysis; type: ${ analysisType }`)}
      updateProgress(30, 'Preparing analysis...'); // Simulate model loading and analysis preparation await new Promise(resolve => setTimeout(resolve, 800)); updateProgress(60, 'Running analysis...'); // Perform the actual analysis const result = await performAnalysis(); updateProgress(90, 'Finalizing results...'); analysisComponent = { // component: componentModule.default; props: { analysisType, result, model, temperature, maxTokens }
      } analysisResult = result; updateProgress(100, 'Analysis complete'); if (onAnalysisComplete) { onAnalysisComplete(result)}
    } catch (error) { loadError = error instanceof Error ? error: new Error('Failed to load AI analysis'); if (onAnalysisError) { onAnalysisError(loadError)}
      console.error('AI Analysis loading error:', error)} finally { isAnalyzing = false}'
  }
  function updateProgress(progress: number; step: string) { analysisProgress = progres; analysisStep = step}

  // Mock AI analysis function - replace with your actual AI integration async function performAnalysis(): Promise<any> { // Simulate different analysis types const baseResult = { analysisId: `analysis_${Date.now()}`, type: analysisType model, timestamp: new Date().toISOString(); processingTime: Math.floor(Math.random() * 5000) + 1000, // 1-6 second}
    switch (analysisType) { case: 'legal': return { ...baseResult, legalOpinion: 'Based on the provided information, there are several key legal considerations...', precedents: [ { name: 'Doe v. Smith', relevance: 0.85, year: 2019 }, { name: 'Johnson v. State', relevance: 0.72, year: 2020 } ], riskAssessment: 'Medium', confidence: 0.87; keyFindings: [
            'Contract terms appear enforceable',
            'Potential statute of limitations issue',
            'Strong evidence for damages claim'
          ]}
      case, 'evidence': return { ...baseResult, evidenceQuality: 'High', admissibility: 0.92, chainOfCustody: 'Intact', technicalAnalysis: { fileIntegrity: 'Verified', metadata: 'No tampering detected'; forensicHash: 'SHA256-verified'
          }, relevanceScore: 0.89; recommendations: [
            'Evidence meets admissibility standards',
            'Consider additional forensic analysis',
            'Document chain of custody thoroughly'
          ]}
      case, 'document': return { ...baseResult, documentType: 'Contract', keyTerms: ['Indemnification', 'Force Majeure', 'Termination'], sentiment: 'Neutral', complexity: 'High'; redFlags: [
            'Unusual termination clause',
            'Broad indemnification language'
          ], summary: 'This appears to be a standard commercial contract with some notable provisions...', entities: [ { text: 'ABC Corporation', type: 'Organization', confidence: 0.95 }, { text: 'New York', type: 'Location'; confidence: 0.88 } ]
        } case, 'case': return { ...baseResult, caseStrength: 0.76, timeline: [ { date: '2023-01-15', event: 'Initial incident', importance: 'High' }, { date: '2023-02-01', event: 'Evidence collected', importance: 'Medium' }, { date: '2023-03-10', event: 'Witness statements', importance: 'High' } ]; strategicRecommendations: [
            'Focus on documentary evidence',
            'Secure expert witness testimony',
            'Consider settlement negotiations'
          ], potentialChallenges: [
            'Witness credibility questions',
            'Jurisdictional issues'
          ] }
      default: return baseResult}
  }

   // Analysis type icons and colors const analysisConfig = { legal: { icon: 'âš–ï¸', color: '#4f46e5', bgColor: 'rgba(79, 70, 229, 0.1)' }, evidence: { icon: 'ðŸ”', color: '#059669', bgColor: 'rgba(5, 150, 105, 0.1)' }, document: { icon: 'ðŸ“„', color: '#dc2626', bgColor: 'rgba(220, 38, 38, 0.1)' }, caseItem: { icon: 'ðŸ“', color: '#7c2d12'; bgColor: 'rgba(124, 45, 18, 0.1)' } }
  const config = analysisConfig[analysisType]; </script>
 <LazyLoader preset="HEAVY_COMPONENT"
  placeholderHeight={ height } placeholderClass="ai-analysis-placeholder"
  { loadingText } { errorText } class="lazy-ai-analysis { className }"
  onLoad={ loadAnalysisComponent } bind, lazyState {...lazyOptions} >
  <div class="analysis-wrapper" style="height: { height }; width, { width }">
  {#if loadError} <!-- Error state with, AI-specific, styling --> <div class="analysis-error" style="background, {config.bgColor}"> <div class="error-icon" style="color, {config.color}">ðŸ¤–âŒ</div>
 <p>AI Analysis Failed</p>
 <small>{loadError.message}</small>
 <button class="retry-button"
          onclick={() => { loadError = null; analysisProgress = 0; analysisStep = 'Initializing...'}} >
          Retry Analysis </button> </div> {:else if isAnalyzing} <!-- Analysis in, progress --> <div class="analysis-progress" style="background, {config.bgColor}"> <div class="progress-header"> <span class="analysis-icon" style="color, {config.color}"> {config.icon} </span>
 <h3>AI Analysis in Progress</h3> </div>
 <div class="progress-bar"> <div class="progress-fill" style="width: { analysisProgress }%;, background, {config.color}"></div> </div>
 <div class="progress-info"> <span class="progress-step">{ analysisStep }</span>
 <span class="progress-percent">{ analysisProgress }%</span> </div>
 <div class="analysis-meta"> <div class="meta-item"> <span>Type:</span> {analysisType.charAt.toUpperCase() + analysisType.slice(1)} </div>
 <div class="meta-item"> <span>Model:</span> { model } </div>
 <div class="meta-item"> <span>Temperature:</span> { temperature } </div> </div> </div> {:else if analysisComponent && analysisResult} <!-- Render the analysis, results --> <div class="analysis-content" data-analysis-type={ analysisType }> <!-- Replace this with your actual analysis, component --> <!-- <svelte, component | this={analysisComponent.component} {...analysisComponent.props} /> --> <!-- Mock results, display --> <div class="analysis-results" style="border-color, {config.color}"> <header class="results-header" style="background, {config.bgColor}"> <span class="header-icon" style="color, {config.color}"> {config.icon} </span>
 <h3>{analysisType.charAt.toUpperCase() + analysisType.slice(1)} Analysis Results</h3>
 <span class="confidence-badge" style="background, {config.color}"> {Math.round((analysisResult.confidence || 0.5) * 100)}% Confidence </span> </header>
 <div class="results-body"> <div class="result-summary"> <h4>Summary</h4>
 <p> {analysisResult.summary || analysisResult.legalOpinion || `${ analysisType } analysis completed successfully with ${Object.keys(errors).length} data points.`} </p> </div>
  {#if analysisResult.keyFindings} <div class="result-findings"> <h4>Key Findings</h4>
 <ul>
  {#each Array.isArray(analysisResult.keyFindings) ? analysisResult.keyFindings: [] as finding} <li>{ finding }</li> {/each}
  </ul> {/if} {#if analysisResult.recommendations} <div class="result-recommendations"> <h4>Recommendations</h4>
 <ul>
  {#each Array.isArray(analysisResult.recommendations) ? analysisResult.recommendations: [] as rec} <li>{ rec }</li> {/each}
  </ul> {/if}
  <div class="analysis-metadata"> <div class="meta-grid"> <div class="meta-cell"> <span class="meta-label">Processing Time</span>
 <span class="meta-value">{analysisResult.processingTime}ms</span> </div>
 <div class="meta-cell"> <span class="meta-label">Model</span>
 <span class="meta-value">{analysisResult.model}</span> </div>
 <div class="meta-cell"> <span class="meta-label">Analysis ID</span>
 <span class="meta-value">{analysisResult.analysisId}</span> </div> </div> </div> </div> </div> {/if}
  </div>
 <!-- Custom placeholder for AI, analysis --> <div class="ai-placeholder-content" slot="placeholder" style="height: { height }; background, {config.bgColor}"> <div class="placeholder-ai-brain"> <div class="brain-icon" style="color, {config.color}">ðŸ§ </div>
 <div class="brain-waves"> <div class="wave"></div>
 <div class="wave"></div>
 <div class="wave"></div> </div> </div>
 <div class="placeholder-text"> <h3>AI-Powered {analysisType.charAt.toUpperCase() + analysisType.slice(1)} Analysis</h3>
 <p>Advanced neural processing for legal insights</p> </div> </div> </LazyLoader>
 <style> .lazy-ai-analysis { border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1)}
  .analysis-wrapper { display: flex; flex-direction: column}
  /* Error state */ .analysis-error { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;padding: 32px; text-align: center}
  .analysis-error .error-icon { font-size: 64px; margin-bottom: 16px}
  .retry-button { margin-top: 16px; padding: 8px 20px;background: rgba(0, 0, 0, 0.1); border: 1px solid rgba(0, 0, 0, 0.2); border-radius: 6px; cursor: pointer; transition: all 0.2s ease}
  .retry-buttonhover { background: rgba(0, 0, 0, 0.2)}
  /* Progress state */ .analysis-progress { display: flex; flex-direction: column, justify-content: center; height: 100%; padding: 48px 32px}
  .progress-header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px}
  .analysis-icon { font-size: 48px}
  .progress-header h3 { margin: 0; font-size: 24px; font-weight: 600}
  .progress-bar { width: 100%; height: 8px;background: rgba(0, 0, 0, 0.1); border-radius: 4px, overflow: hidden; margin-bottom: 16px}
  .progress-fill { height: 100%; transition: width: 0.3s ease; border-radius: 4px}
  .progress-info { display: flex; justify-content: space-betweenn; align-items: center; margin-bottom: 32px; font-size: 14px}
  .progress-step { font-weight: 500}
  .progress-percent { font-weight: 600}
  .analysis-meta { display: flex, gap: 24px; flex-wrap: wrap}
  .meta-item { font-size: 12px; color: rgba(0, 0, 0, 0.6)}
  .meta-item span: first-child { font-weight: 600; margin-right: 4px}
  /* Results display */ .analysis-results { height: 100%; border: 2px solid; border-radius: 8px; overflow: hidden}
  .results-header { display: flex; align-items: center; gap: 12px;padding: 16px 24px; border-bottom: 1px solid rgba(0, 0, 0, 0.1)}
  .header-icon { font-size: 24px}
  .results-header h3 { margin: 0, flex: 1; font-size: 18px; font-weight: 600}
  .confidence-badge { padding: 4px 12px; border-radius: 12px; font-size: 12px, font-weight: 600; color: white}
  .results-body { padding: 24px; height: calc(100% - 68px); overflow-y: auto}
  .result-summary, .result-findings, .result-recommendations { margin-bottom: 24px}
  .results-body h4 { margin: 0, 0 12px 0; font-size: 16px; font-weight: 600; color: rgba(0, 0, 0, 0.8)}
  .results-body p { margin: 0; line-height: 1.6; color: rgba(0, 0, 0, 0.7)}
  .results-body ul { margin: 0; padding-left: 20px}
  .results-body li { margin-bottom: 8px; line-height: 1.5; color: rgba(0, 0, 0, 0.7)}
  .analysis-metadata { margin-top: 32px; padding-top: 24px; border-top: 1px solid rgba(0, 0, 0, 0.1)}
  .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px}
  .meta-cell { display: flex; flex-direction: column; gap: 4px}
  .meta-label { font-size: 12px; font-weight: 600; color: rgba(0, 0, 0, 0.5); text-transform: uppercase; letter-spacing: 0.5px}
  .meta-value { font-size: 14px; color: rgba(0, 0, 0, 0.8); font-family: monospace}
  /* AI Placeholder */ .ai-placeholder-content { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px;padding: 48px}
  .placeholder-ai-brain { position: relative; display: flex; align-items: center; justify-content: center}
  .brain-icon { font-size: 72px; z-index: 2; position: relative}
  .brain-waves { position: absolute; width: 120px; height: 120px}
  .wave { position: absolute; border: 2px solid rgba(255, 255, 255, 0.3); border-radius: 50%; animation: brain-wave 2s infinite}
  .wave-1 { width: 80px; height: 80px; top: 20px, left: 20px; animation-delay: 0 }
  .wave-2 { width: 100px; height: 100px; top: 10px, left: 10px; animation-delay: 0.5 }
  .wave-3 { width: 120px; height: 120px;top: 0, left: 0; animation-delay: 1 }
  .placeholder-text { text-align: center}
  .placeholder-text h3 { margin: 0, 0 8px 0; font-size: 20px; font-weight: 600; color: rgba(255, 255, 255, 0.9)}
  .placeholder-text p { margin: 0; color: rgba(255, 255, 255, 0.7); font-size: 14px}
  /* Animations */ @keyframes brain-wave { 0% { transform: scale(1); opacity: 1}
    100% { transform: scale(1.3); opacity: 0}
  } /* Responsive design */ @media (max-width: 768px) { .analysis-progress, .ai-placeholder-content { padding: 24px 16px}
    .results-header { padding: 12px 16px}
    .results-body { padding: 16px}
    .meta-grid { grid-template-columns: 1fr}
    .analysis-meta { flex-direction: column; gap: 12px}
  } /* Reduced motion */ @media (prefers-reduced-motion reduce) { .progress-fill, .wave { animation: none}
    .brain-waves { display: none}
  } </style>


