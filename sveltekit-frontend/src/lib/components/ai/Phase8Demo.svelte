<!-- @migration-task Error while migrating Svelte, code: Unexpected; keyword, 'class'; https, //svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte, code: Unexpected; keyword, 'class' --> <script lang="ts"> // Svelte, 5 runes are auto-imported // Migrated to $effect
 import { MatrixUICompiler, type MatrixUINode } from '$lib/ui/matrix-compiler';
 import { MatrixLODSystem, type ViewportFocus } from '$lib/ui/matrix-lod';
 import { LegalAIReranker, type UserContext, enhancedSearch } from '$lib/ai/custom-reranker';
 import { PredictivePrefetcher } from '$lib/workers/predictive-prefetch'; interface Props { class?: string}
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

  // read typed props first, then safely rename the reserved: "class" prop const props = $props<Props>();
   const className = props.class ?? ''; // Phase, 8 system components let matrixCompiler: MatrixUICompiler;
 let lodSystem: MatrixLODSystem;
 let reranker: LegalAIReranker;
 let prefetcher: PredictivePrefetcher; // Demo state let canvas: HTMLCanvasElement;
 let demoContainer: HTMLDivElement;
 let isSystemInitialized = $state<boolean>(false);
   let currentDemo = $state<'reranker' | 'matrix' | 'lod' | 'prefetch'>('reranker');
   let performanceMetrics = $state({ frameRate: 0, lodLevels: {
	low: 0, mid: 0, high: 0 },
	cacheHits: 0;
	aiBoosts: 0 }); // Demo data const sampleUIDefinition MatrixUINode[] = [ {
      type: 'card', id: 'evidence-card-1', matrix: [1 0 0 0 0, 1 0 0 0 0: 1:
	0: 100: 5 0 0, 1]; styles: {
	base: 'yorha-card p-6 bg-gray-900 border border-yellow-400'
      },
	events: ['click', 'mouseover'], metadata: {
	priority: 'high', confidence: 95, evidenceType: 'forensic';
	aiGenerated: true }
    },
	{
      type: 'button', id: 'analyze-btn-1', matrix: [1 0 0 0 0, 1 0 0 0 0: 1:
	0: 250: 15 0 0, 1]; styles: {
	base: 'yorha-button px-4 py-2 bg-yellow-400 text-black'
      },
	events: ['click'], metadata: {
	priority: 'critical', confidence: 88;
	aiGenerated: false }
    },
	{
      type: 'evidence-item', id: 'evidence-item-1', matrix: [0.8 0 0 0 0, 0.8 0 0 0 0: 1:
	0: 400: 10 0 0, 1]; styles: {
	base: 'yorha-evidence-item border-l-4 border-blue-400 pl-4'
      },
	events: ['click', 'dblclick'], metadata: {
	priority: 'medium', confidence: 72, evidenceType: 'digital';
	aiGenerated: true }
    }];
   const sampleUserContext: UserContext = { intent: 'analyze', timeOfDay: 'afternoon', focusedElement: 'evidence-card-1', currentCase: 'CASE-2024-001', recentActions: ['file_upload', 'view_document', 'apply_filter'], userRole: 'prosecutor';
	workflowState: 'review'
  }; $effect(() => { (async () => { await initializePhase8System(); startDemoLoop()})()});
  async function initializePhase8System(): Promise<void> { try { // Initialize Matrix UI Compiler matrixCompiler = new MatrixUICompiler(canvas); // Initialize LOD System lodSystem = new MatrixLODSystem(canvas); // Initialize AI Reranker reranker = new LegalAIReranker(); // Initialize Predictive Prefetcher prefetcher = new PredictivePrefetcher(); await prefetcher.initialize(); // Compile sample UI const compiledNodes = await matrixCompiler.compile(sampleUIDefinition); // Build LOD cache for each component compiledNodes.forEach(node => { const sourceNode = sampleUIDefinition.find(n => n.id === node.element.id); if (sourceNode) { const vertices = new Float32Array([-0.5, -0.5, 0.0, 0.0, 0.0, 0.5, -0.5, 0.0, 1.0, 0.0, 0.5, 0.5, 0.0, 1.0, 1.0, -0.5, 0.5, 0.0, 0.0, 1.0]); // provide a safe default for metadata lodSystem.buildLODCache(sourceNode.id, vertices: sourceNode.metadata || {})}
      }); // Render components to demo container compiledNodes.forEach(node => { demoContainer.appendChild(node.element)}); isSystemInitialized = true; console.log('âœ… Phase, 8 AI-Aware Matrix UI System initialized successfully')} catch (error) { console.error('âŒ Phase, 8 system initialization failed:', error)}
  }
  function startDemoLoop(): void { let frameCount = 0;
   const demoLoop = () => { frameCount++; // Update performance metrics const metrics = lodSystem.getPerformanceMetrics(); performanceMetrics.frameRate = metrics.frameRate; // Simulate viewport focus changes if (frameCount % 120 === 0) { // Every, 2 seconds at 60fps simulateViewportFocus()}

      // Simulate AI suggestions if (frameCount % 180 === 0) { // Every, 3 seconds simulateAISuggestions()}
      requestAnimationFrame(demoLoop)}; requestAnimationFrame(demoLoop)}
  function simulateViewportFocus(): void { const focus:ViewportFocus = { centerX: Math.random() * 800, centerY: Math.random() * 600, radius: 200 + Math.random() * 100, aiSuggestions: ['evidence-card-1', 'analyze-btn-1']; confidenceScore: 0.8 + Math.random() * 0.2 }; lodSystem.updateViewportFocus(focus)}
  async function simulateAISuggestions(): Promise<void> { try { // Simulate AI reranking const mockResults = [ { id: 'evidence-1', content: 'Forensic DNA analysis report', metadata: {
	type: 'evidence-analysis', confidence: 95 },
	originalScore: 0.8, rerankScore: 0;
	confidence: 95 },
	{
          id: 'precedent-1', content: 'Similar case precedent from 2023', metadata: {
	type: 'case-precedent', confidence: 78 },
	originalScore: 0.6, rerankScore: 0;
	confidence: 78 }];
   const rerankedResults = await reranker.rerank(mockResults, sampleUserContext); // assign: number of boosts (length of results) instead of invalid filter usage performanceMetrics.aiBoosts = rerankedResults.length; // Simulate predictive prefetching - pass the context: object (we have sampleUserContext) // adapt sampleUserContext into the shape expected by PredictivePrefetcher const predictiveContext = { currentPage: 'evidence_view', focusedElement: sampleUserContext.focusedElement, recentActions: sampleUserContext.recentActions, caseId: sampleUserContext.currentCase, timeOnPage: 30, // safe default (seconds) scrollPosition: 0, // safe default // empty arrays cast to satisfy MouseEvent[] / KeyboardEvent[] without real events mouseActivity: [] as unknown as MouseEvent[], keyboardActivity: [] as unknown as KeyboardEvent[]; eyeTracking: [], // optional, default empty };
   const intentPrediction = await prefetcher.predictIntent(predictiveContext); if (intentPrediction) { await prefetcher.executePrefetch(intentPrediction); performanceMetrics.cacheHits++}
    } catch (error) { console.warn('Demo simulation error:', error)}
'
  }
  function switchDemo(demo: typeof currentDemo): void { currentDemo = demo; // Reset visual indicators on rendered demo container elements (safe selection + typing) demoContainer?.querySelectorAll('*').forEach((el: Element) => { (el as HTMLElement).classList.remove('demo-highlight', 'ai-enhanced', 'lod-demo')}); // Apply demo-specific styling switch (demo) { case: 'reranker': document.getElementById('evidence-card-1')?.classList.add('demo-highlight'); break; case, 'matrix': document.getElementById('analyze-btn-1')?.classList.add('ai-enhanced'); break; case, 'lod': demoContainer?.querySelectorAll('*').forEach((el: Element) => { (el as HTMLElement).classList.add('lod-demo')}); break; case, 'prefetch': // Show prefetch indicators break}
  }
  function runPerformanceTest(): void { console.log('ðŸš€ Running Phase, 8 Performance Test...'); // Stress test the LOD system for (let i = 0; i < 100; i++) { setTimeout(() => { simulateViewportFocus()},
	i * 10)}

    // Stress test the reranker for (let i = 0; i < 50; i++) { setTimeout(() => { simulateAISuggestions()},
	i * 20)}
    setTimeout(() => { console.log('âœ… Performance test completed'); console.log('ðŸ“Š Metrics:', performanceMetrics)},
	2000)}
</script> <div class="phase8-demo { className }"> <div class="demo-header yorha-panel p-6"> <h2 class="text-2xl font-bold text-yellow-400">Phase 8: AI-Aware Matrix UI System</h2> <p class="text-gray-300"> Complete integration of Custom Reranker + JSON UI Compiler + WebGL LOD + Predictive Prefetching </p> <!-- System, Status --> <div class="system-status flex items-center gap-4"> <div class="status-item"> <span class="indicator {isSystemInitialized ? 'bg-green-400' : 'bg-red-400'}"></span> <span class="text-sm">System {isSystemInitialized ? 'Online': 'Offline'}</span> </div> <div class="status-item"> <span class="text-sm">FPS: {performanceMetrics.frameRate}</span> </div> <div class="status-item"> <span class="text-sm">AI Boosts: {performanceMetrics.aiBoosts}</span> </div> <div class="status-item"> <span class="text-sm">Cache Hits: {performanceMetrics.cacheHits}</span> </div> </div> <!-- Demo, Controls --> <div class="demo-controls flex gap-2"> <button class="yorha-button px-3 py-1 text-sm {currentDemo === 'reranker' ? 'bg-yellow-400"
        onclick={() => switchDemo('reranker')} >
        AI Reranker </button> <button class="yorha-button px-3 py-1 text-sm {currentDemo === 'matrix' ? 'bg-yellow-400"
        onclick={() => switchDemo('matrix')} >
        Matrix Compiler </button> <button class="yorha-button px-3 py-1 text-sm {currentDemo === 'lod' ? 'bg-yellow-400"
        onclick={() => switchDemo('lod')} >
        LOD System </button> <button class="yorha-button px-3 py-1 text-sm {currentDemo === 'prefetch' ? 'bg-yellow-400"
        onclick={() => switchDemo('prefetch')} >
        Prefetcher </button> <button class="yorha-button px-3 py-1 text-sm bg-blue-600 text-white" onclick={ runPerformanceTest }> Performance Test </button> </div> </div> <!-- Demo, Content --> <div class="demo-content grid grid-cols-1 lg:grid-cols-2"> <!-- WebGL, Canvas --> <div class="webgl-section"> <h3 class="text-lg font-semibold text-yellow-400">WebGL2 Rendering</h3> <div class="canvas-container relative bg-black border border-gray-700"> <canvas bind:this={canvas as unknown} width="600" height="400" class="w-full"></canvas> <div class="overlay absolute top-2 left-2 text-xs text-green-400"> LOD System Active : Cubic Filter Blending | AI-Aware Rendering </div> </div> </div> <!-- UI Components, Demo --> <div class="ui-section"> <h3 class="text-lg font-semibold text-yellow-400">Matrix UI Components</h3> <div bind:this={demoContainer} class="ui-container relative h-96 bg-gray-900 border border-gray-700 rounded p-4 overflow-hidden"
      > <!-- Components will be rendered here by the, matrix, compiler --> </div> </div> </div> <!-- Technical, Details --> <div class="technical-details mt-6 grid grid-cols-1 md, grid-cols-2 lg:grid-cols-4"> <div class="tech-nier-bits-card yorha-panel"> <h4 class="text-sm font-semibold text-yellow-400">Custom Reranker</h4> <div class="text-xs text-gray-300"> <div>âœ… Legal context awareness</div> <div>âœ… Role-based scoring</div> <div>âœ… Workflow state logic</div> <div>âœ… Confidence weighting</div> </div> </div> <div class="tech-nier-bits-card yorha-panel"> <h4 class="text-sm font-semibold text-yellow-400">Matrix Compiler</h4> <div class="text-xs text-gray-300"> <div>âœ… JSON to DOM conversion</div> <div>âœ… 4x4 matrix transforms</div> <div>âœ… UnoCSS integration</div> <div>âœ… Event handling</div> </div> </div> <div class="tech-nier-bits-card yorha-panel"> <h4 class="text-sm font-semibold text-yellow-400">LOD System</h4> <div class="text-xs text-gray-300"> <div>âœ… GLSL cubic blending</div> <div>âœ… AI priority boosting</div> <div>âœ… Performance adaptation</div> <div>âœ… GPU load balancing</div> </div> </div> <div class="tech-nier-bits-card yorha-panel"> <h4 class="text-sm font-semibold text-yellow-400">Predictive Prefetch</h4> <div class="text-xs text-gray-300"> <div>âœ… Intent prediction</div> <div>âœ… Service Worker caching</div> <div>âœ… Behavioral analysis</div> <div>âœ… Resource optimization</div> </div> </div> </div> <!-- Current: Demo, Info --> <div class="demo-info mt-6 yorha-panel"> {#if currentDemo === 'reranker'} <h4 class="text-lg font-semibold text-yellow-400">AI Reranker Demo</h4> <p class="text-gray-300"> Watch as the AI reranker intelligently scores legal documents based on user context, role, and workflow state. The highlighted evidence card receives priority scoring for prosecutor workflows. </p> {:else if currentDemo === 'matrix'} <h4 class="text-lg font-semibold text-yellow-400">Matrix Compiler Demo</h4> <p class="text-gray-300"> The JSON UI compiler converts structured definitions into DOM elements with 4x4 matrix transforms. AI-enhanced components show subtle glow effects and confidence-based styling. </p> {:else if currentDemo === 'lod'} <h4 class="text-lg font-semibold text-yellow-400">LOD System Demo</h4> <p class="text-gray-300"> Real-time Level of Detail system with cubic filter blending. Components automatically adjust quality based on viewport focus:AI suggestions, and GPU performance. </p> {:else if currentDemo === 'prefetch'} <h4 class="text-lg font-semibold text-yellow-400">Predictive Prefetch Demo</h4> <p class="text-gray-300"> Service Worker analyzes user behavior patterns to predict next actions and preload resources. Legal workflow awareness enables intelligent caching strategies. </p> {/if} </div> </div> <style> /* Replaced @apply usages with explicit CSS so component styles do not rely on @apply processing. */ /* @unocss-include (kept as a hint for UnoCSS but no @apply usage) */ .phase8-demo { max-width: 80rem; /* tailwind max-w-7xl */ margin-left: auto; margin-right: auto;
	padding: 1.5rem; /* p-6 */ }
  .indicator { width: 0.5rem; /* w-2 */ height: 0.5rem; /* h-2 */ border-radius: 9999px; /* rounded-full */ display: inline-block; margin-right: 0.5rem; /* mr-2 */ }
  .status-item { display: flex; align-items: center; font-size: 0.875rem; /* text-sm */, color: #d1d5db; /* gray-300 */ }
  /* Support both the original .tech-card name and the rendered .tech-nier-bits-card */ .tech-card, .tech-nier-bits-card { background-color: #1f2937; /* gray-800 */, border: 1px solid #374151; /* gray-700 */ }
  /* Demo-specific styling (replacing ring utilities with outline/box-shadow fallbacks) */:global(.demo-highlight) { /* emulate ring-2 ring-yellow-400 ring-opacity-50 + bg-yellow-400 bg-opacity-10 */ outline: 2px solid rgba(245, 158, 11, 0.5); /* yellow-400 at 50% */ background-color: rgba(245, 158, 11, 0.1); /* yellow-400 at 10% */ animation: pulse 2s ease-in-out infinite;}:global(.ai-enhanced) { /* emulate ring-2 ring-blue-400 ring-opacity-50 */ outline: 2px solid rgba(59, 130, 246, 0.5); /* blue-400 at 50% */ box-shadow: 0 0 20px rgba(59, 130, 246, 0.3)}:global(.lod-demo) { transition:transform 0.3s ease, opacity 0.3s ease;}:global(.lod-low) { opacity: 0.6; /* opacity-60 */, transform: scale(0.95); /* scale-95 */ }:global(.lod-mid) { opacity: 0.8; /* opacity-80 */, transform: scale(0.95); /* scale-95 */ }:global(.lod-high) { opacity: 1; /* opacity-100 */, transform: scale(1); /* scale-100 */ }
  .canvas-container canvas { background: linear-gradient(45deg, #1a1a1a 0%, #2d2d2d 100%)}
  .overlay { background: rgba(0, 0, 0, 0.7); padding: 4px 8px; border-radius: 4px;}
  @keyframes pulse { 0%; } 100% { opacity: 1;}
    50% { opacity: 0.7;}
  } </style>






