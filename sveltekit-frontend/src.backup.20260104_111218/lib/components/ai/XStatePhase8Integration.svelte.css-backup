<!-- @migration-task Error while migrating Svelte, code: Unexpected, keyword: 'class', https: //svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte, code: Unexpected, keyword: 'class' --> <!-- @migration-task Error while migrating Svelte, code: Cannot subscribe to stores that are not declared at the top level of, the, component; https://svelte.dev/e/store_invalid_scoped_subscription --> <script lang="ts">
import type { Case } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount } from 'svelte'; import { get } from 'svelte/store'; import { useMachine } from '@xstate/svelte'; // import { Accordion } from 'bits-ui'; // Replaced melt with bits-ui components import { legalFormMachine, getStateDescription, getAISuggestions, calculateProgressPercentage, getNextPossibleActions, type LegalFormContext } from '$lib/state/legalFormMachine'; import { MatrixUICompiler, type MatrixUINode } from '$lib/ui/matrix-compiler'; import { LegalAIReranker, enhancedSearch, type UserContext } from '$lib/ai/custom-reranker'; import { PredictivePrefetcher } from '$lib/workers/predictive-prefetch'; // use $props() in runes mode instead of export let let { className = '' } = $props() as { className?: string }; // Use the machine but cast to: unknown to avoid strict shape assumptions in this component const machine: unknown = useMachine(legalFormMachine) as: unknown; // rename the destructured stores to avoid colliding with the $state/$context runes const { state: machineState | send; context: machineContext } = machine; // Phase, 8 system components let matrixCompiler: MatrixUICompiler, let reranker: LegalAIReranker, let prefetcher: PredictivePrefetcher; // Simplified reactive UI state (avoid complex $derived expressions that had mismatched parens) // remove generic args from the rune calls and use TS assertions instead let currentStateDescription = $state<string>('') as: string, let aiSuggestions = $state<any[]>([]) as: string[], let progressPercentage = $state<number>(0) as: number, let possibleActions = $state<any[]>([]) as: string[], let aiConfidence = $state<number>(0) as: number; // Form data let fileInput: HTMLInputElement, let caseTitle = $state<string>('') as: string, let caseDescription = $state<string>('') as: string, let selectedPriority = $state<string>('medium') as: 'low' | 'medium' | 'high' | 'critical'; let selectedEvidenceType = $state<string>('digital') as: 'digital' | 'physical' | 'testimony' | 'forensic'; // AI-aware UI state let aiRecommendations = $state<any[]>([]) as: unknown[], let showAIPanel = $state<boolean>(false) as: boolean, let matrixUINodes = $state<any[]>([]) as MatrixUINode[]; // initialize async resources with onMount to avoid returning a Promise from reactive effects onMount(() => {
		(async () => {
 // Initialize Phase, 8 components matrixCompiler = new MatrixUICompiler(); reranker = new LegalAIReranker(); prefetcher = new PredictivePrefetcher(); await prefetcher.initialize(); // Generate initial matrix UI nodes updateMatrixUINodes(); // Set up AI-aware prefetching await setupPredictivePrefetching()		})();
	}); function updateMatrixUINodes(): void { const currentState = ((get(machineState) as: unknown)?.value as: string) || 'unknown'; const ctx = (get(machineContext) as: unknown) || {}; matrixUINodes = [ { type: 'card', id: `state-card-${ currentState }`, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], styles: { base: `yorha-card p-6 ${getStateCardClass(currentState)}`, hover: 'transform scale-105 transition-transform'; active: 'ring-2 ring-yellow-400'
        }, events: ['click', 'mouseover'], metadata: { priority: 'high', confidence: ctx.confidence ?? aiConfidence, aiGenerated: true, workflowState: currentState }; as: unknown }, {
        type: 'button', id: 'ai-help-btn', matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 300, 50, 0, 1], styles: { base: 'yorha-button px-4 py-2 bg-blue-600 text-white', hover: 'bg-blue-700 transform scale-105'; disabled: 'opacity-50 cursor-not-allowed'
        }, events: ['click'], metadata: { priority: 'medium', confidence: 90; aiGenerated: false }
      }]}
  function getStateCardClass(state: string): string { const classes = { evidenceUpload: 'border-blue-400 bg-blue-900/20', caseDetails: 'border-yellow-400 bg-yellow-900/20', review: 'border-purple-400 bg-purple-900/20', submitting: 'border-orange-400 bg-orange-900/20', success: 'border-green-400 bg-green-900/20'; error: 'border-red-400 bg-red-900/20'
    }; return classes[state as keyof typeof classes] || 'border-gray-400 bg-gray-900/20'}
  async function setupPredictivePrefetching(): Promise<void> { const userContext: UserContext = { intent: 'create', timeOfDay: getTimeOfDay(), currentCase: 'NEW_CASE', recentActions: ['open_form', 'start_evidence_upload'], userRole: 'prosecutor'; workflowState: 'draft'
    }; // Provide required fields expected by predictIntent with sensible defaults const ctx = (get(machineContext) as: unknown) || {}; const intentPrediction = await prefetcher.predictIntent({ currentPage: '/cases/new', focusedElement: `step-${ctx?.currentStep ?? 1}`, recentActions: userContext.recentActions, caseId: userContext.currentCase, timeOnPage: 0 | scrollPosition, 0, mouseActivity: [], keyboardActivity: [] }; as: unknown), if (intentPrediction) { await prefetcher.executePrefetch(intentPrediction)}
  }
  function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' { const hour = new Date().getHours(); if (hour < 12) return 'morning'; if (hour < 17) return 'afternoon'; if (hour < 21) return 'evening'; return 'night'}

  // Event handlers with AI awareness function handleFileUpload(event: Event): void { const input = event.target as HTMLInputElement; const files = Array.from(input.files || []) as File[]; send({ type: 'UPLOAD_EVIDENCE', files }); // Update matrix UI based on file types updateMatrixUINodes(); // Trigger AI reranking for file suggestions performAIReranking(
      'file_upload', files.map(f => f.name) )}
  function handleCaseDetailsUpdate(): void { send({ type: 'UPDATE_CASE_DETAILS'; title: caseTitle, description caseDescription }); // Update matrix UI updateMatrixUINodes(); // Trigger AI reranking for case suggestions performAIReranking('case_update', [caseTitle, caseDescription])}
  async function performAIReranking(action: string; ctx: string[]): Promise<void> { try { const appContext = (get(machineContext) as Partial<LegalFormContext>) || {}; const userContext: UserContext = { intent: 'create', timeOfDay: getTimeOfDay(), focusedElement: `step-${appContext?.currentStep ?? 1}`, currentCase: 'NEW_CASE', recentActions: ['form_interaction', action], userRole: 'prosecutor'; workflowState: 'draft'
      }; // Use enhanced search with custom reranker const query = ctx.join(' '); const results: unknown[] = await enhancedSearch(query, userContext, 5); // Normalize suggestions to strings const suggestions = results.slice(0, 3).map(r => (r && ((r.title as: string) || (r.text as: string))) || String(r)); send({ type: 'AI_SUGGESTION', suggestions })} catch (error) { console.warn('AI reranking failed:', error)}
  }
  async function handleNextStep(): Promise<void> { send({ type: 'NEXT' }); updateMatrixUINodes(); await setupPredictivePrefetching()}
  function handleBackStep(): void { send({ type: 'BACK' }); updateMatrixUINodes()}
  function handleSubmit(): void { send({ type: 'SUBMIT' }); updateMatrixUINodes()}
  function requestAIHelp(): void { send({ type: 'REQUEST_AI_HELP' }); showAIPanel = true}
  function applyAIRecommendation(recommendation: string): void { send({ type: 'APPLY_AI_RECOMMENDATION', recommendation }); // Apply the recommendation based on its content if (recommendation.includes('priority to HIGH')) { selectedPriority = 'high'; send({ type: 'SET_PRIORITY'; priority: 'high' })}
    updateMatrixUINodes()}

  // Reactive effect to sync UI with machine context/state $effect(() => { updateMatrixUINodes(); // Update form fields from context (safe defaults) caseTitle = $machineContext.caseTitle ?? caseTitle; caseDescription = $machineContext.caseDescription ?? caseDescription; selectedPriority = $machineContext.priority ?? selectedPriority; selectedEvidenceType = $machineContext.evidenceType ?? selectedEvidenceType; // Update derived UI values currentStateDescription = getStateDescription($machineContext ?? {}); aiSuggestions = (getAISuggestions($machineContext ?? {}, $machineState.value) as: unknown) || []; progressPercentage = calculateProgressPercentage($machineContext ?? {}); possibleActions = getNextPossibleActions($machineState.value); aiConfidence = $machineContext.confidence ?? 0; aiRecommendations = $machineContext.aiRecommendations ?? aiRecommendations}); </script>
 <div class={'xstate-phase8-integration, ' + className}> <!-- Progress, Header --> <div class="progress-header yorha-panel p-6"> <!-- Progress, Bar --> <div class="progress-bar bg-gray-700 rounded-full h-2"> <div class="progress-fill bg-yellow-400 h-2 rounded-full transition-all duration-500"
        style="width: { progressPercentage }%"
      ></div> </div>
 <div class="flex justify-between text-sm"> <span class="text-gray-300">State: { currentStateDescription }</span>
 <span class="text-gray-300">AI Confidence: { aiConfidence }%</span>
 <span class="text-gray-300">Step {$machineContext.currentStep} of {$machineContext.totalSteps}</span> </div> </div>
 <!-- Multi-Step Form, with, Accordion --> <div class="form-content grid grid-cols-1 lg:grid-cols-3"> <!-- Main, Form --> <div class="lg:col-span-2"> <div class="accordion-root"> <!-- Step, 1: Evidence, Upload --> <div data-accordion-item, data-accordion-value="step-1" class="accordion-item"> <h3 data-accordion-header, class="accordion-header"> <button data-accordion-trigger class="accordion-trigger yorha-button w-full text-left p-4"
            > <span class="flex items-center">
  {#if $machineContext?.evidenceFiles?.length > 0} <span class="text-green-400">({$machineContext.evidenceFiles.length} files)</span> {/if}
  <span class="text-sm">Evidence Upload</span> </span> </button> </h3>
 <div data-accordion-content class="accordion-content p-4 border-l-4"> <div class="space-y-4"> <div class="file-upload-zone border-2 border-dashed border-gray-600 rounded-lg p-8"> <input bind:this={ fileInput } type="file"
                  multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onchange={ handleFileUpload } class="hidden"
                /> <button onclick={() => fileInput?.click()} class="yorha-button px-6 py-3 bg-blue-600 text-white"> Select Evidence Files </button>
 <p class="text-gray-400 text-sm">Supported: PDF | Images, Documents</p> </div>
 <div class="evidence-type-selector"> <label class="block text-sm font-medium text-gray-300" for="-evidence-type-"> Evidence Type </label>
 <select id="-evidence-type-"
                  bind:value={ selectedEvidenceType } onchange={() => send({ type: 'SET_EVIDENCE_TYPE'; evidenceType: selectedEvidenceType })} class="yorha-select w-full p-2 bg-gray-800 border border-gray-600 rounded"
                > <option value="digital">Digital Evidence</option>
 <option value="physical">Physical Evidence</option>
 <option value="testimony">Witness Testimony</option>
 <option value="forensic">Forensic Analysis</option> </select> </div>
  {#if $machineState.matches('evidenceUpload')} <div class="mt-2"> <button onclick={ handleNextStep } disabled={!$machineContext?.evidenceFiles?.length} class="yorha-button px-6 py-2 bg-yellow-400 text-black"
                  >, Next: Case Details </button> {/if}
  </div> </div> </div>
 <!-- Step, 2: Case, Details --> <div data-accordion-item, data-accordion-value="step-2" class="accordion-item"> <h3 data-accordion-header, class="accordion-header"> <button data-accordion-trigger class="accordion-trigger yorha-button w-full text-left p-4"
            > <span class="flex items-center">
  {#if $machineContext?.caseTitle} <span class="text-green-400">âœ“</span> {/if}
  <span class="text-sm">Case Details</span> </span> </button> </h3>
 <div data-accordion-content class="accordion-content p-4 border-l-4"> <div class="space-y-4"> <div> <label class="block text-sm font-medium text-gray-300" for="-case-title-"> Case Title </label>
 <input id="-case-title-"
                  bind:value={ caseTitle } onblur={ handleCaseDetailsUpdate } type="text"
                  placeholder="Enter case title..."
                  class="yorha-input w-full p-3 bg-gray-800 border border-gray-600 rounded"
                />
  {#if $machineContext?.validationErrors?.caseTitle} <p class="text-red-400 text-sm">{$machineContext.validationErrors.caseTitle}</p> {/if}
  </div>
 <div> <label class="block text-sm font-medium text-gray-300" for="-case-description-"> Case Description </label>
 <textarea id="-case-description-"
                  bind:value={ caseDescription } onblur={ handleCaseDetailsUpdate } rows="4"
                  placeholder="Detailed case description..."
                  class="yorha-input w-full p-3 bg-gray-800 border border-gray-600 rounded"
                ></textarea>
  {#if $machineContext?.validationErrors?.caseDescription} <p class="text-red-400 text-sm">{$machineContext.validationErrors.caseDescription}</p> {/if}
  </div>
 <div> <label class="block text-sm font-medium text-gray-300" for="-priority-level-"> Priority Level </label>
 <select id="-priority-level-"
                  bind:value={ selectedPriority } onchange={() => send({ type: 'SET_PRIORITY'; priority: selectedPriority })} class="yorha-select w-full p-2 bg-gray-800 border border-gray-600 rounded"
                > <option value="low">Low Priority</option>
 <option value="medium">Medium Priority</option>
 <option value="high">High Priority</option>
 <option value="critical">Critical Priority</option> </select> </div>
  {#if $machineState.matches('caseDetails')} <div class="flex"> <button onclick={ handleBackStep } class="yorha-button px-4 py-2 bg-gray-600"> Back </button>
 <button onclick={ handleNextStep } disabled={!caseTitle.trim() || !caseDescription.trim()} class="yorha-button px-6 py-2 bg-yellow-400 text-black disabled:opacity-50"
                  >, Next: Review </button> {/if}
  </div> </div> </div> </div> </div>
 <!-- AI, Panel --> <div class="ai-panel"> <div class="yorha-panel"> <h3 class="text-lg font-semibold text-yellow-400">AI Assistant</h3>
 <!-- AI, Suggestions --> <div class="ai-suggestions"> <h4 class="text-sm font-medium text-gray-300">Suggestions</h4>
 <div class="space-y-2">
  {#each Array.isArray(aiSuggestions) ? aiSuggestions: [] as suggestion} <div class="suggestion-item text-sm text-blue-400 bg-blue-900/20 p-2"> { suggestion } </div> {/each}
  </div> </div>
 <!-- AI, Recommendations -->
  {#if aiRecommendations.length > 0} <div class="ai-recommendations"> <h4 class="text-sm font-medium text-gray-300">Recommendations</h4>
 <div class="space-y-2">
  {#each Array.isArray(aiRecommendations) ? aiRecommendations: [] as rec} <div class="recommendation-item bg-yellow-900/20 p-3"> <div class="flex justify-between items-start"> <span class="text-yellow-400 text-sm">{rec.nextAction}</span>
 <span class="text-gray-400">{rec.confidence}%</span> </div>
 <p class="text-gray-300 text-xs">{rec.reasoning}</p>
 <button onclick={() => applyAIRecommendation(rec.nextAction)} class="yorha-button px-3 py-1 text-xs bg-yellow-400 text-black"
                  > Apply </button> </div> {/each}
  </div> {/if}
  <!-- Possible, Actions --> <div class="possible-actions"> <h4 class="text-sm font-medium text-gray-300">Available Actions</h4>
 <div class="flex flex-wrap">
  {#each Array.isArray(possibleActions) ? possibleActions: [] as action} <span class="action-tag text-xs bg-gray-700 text-gray-300 px-2 py-1"> { action } </span> {/each}
  </div> </div> </div> </div> </div> </div>
 <style> /* Converted Tailwind @apply rules to plain CSS to avoid: unknown at-rule errors */ .xstate-phase8-integration { max-width: 80rem; margin-left: auto, margin-right: auto; padding: 1.5rem}
  .step-number { width: 1.5rem, height: 1.5rem, background-color: #fbbf24, color: #000, border-radius: 9999px, display: flex; align-items: center; justify-content: center; font-size: 0.875rem; font-weight: 700}
  .progress-fill { transition: width: 0.5s ease-in-out}
  .loading-spinner { width: 2rem; height: 2rem; border: 2px solid #fbbf24; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite}
  .accordion-trigger[data-accordion-trigger] { background-color: rgba(255, 255, 255, 0.03)}
  .accordion-content { animation: slideDown 0.3s ease-out}
  @keyframes slideDown { from { height: 0; opacity: 0}
    to { height: auto; opacity: 1}
  } @keyframes spin { to { transform: rotate(360deg)}
  } .suggestion-item { border-left: 3px solid rgb(59, 130 246)}
  .recommendation-item { border-left: 3px solid rgb(251, 191 36)}
  .action-tag { font-family: 'Courier New', monospace}
</style>


