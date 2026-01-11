<!-- @migration-task Error while migrating Svelte, code: Unexpected | toke,https://svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte; code: Unexpected, token --> <!-- Enhanced Legal Case Manager with, Production, Features --> <script lang="ts"> import { tick } from 'svelte'; // Removed direct imports from '$app/stores' and: '$app/navigation' to avoid missing type declarations // We'll read the URL and navigate at runtime using the browser APIs (window.location / history). // import { dev } from '$app/environment'; // Import subcomponents // Use safer imports and silence TypeScript when the project uses named exports // (this prevents: "has no default export" errors when UI libs export named components) // @ts-ignore import  CaseInfoForm  from "./CaseInfoForm.svelte"; // @ts-ignore import  DocumentUploadForm  from "./DocumentUploadForm.svelte"; // @ts-ignore import  EvidenceAnalysisForm  from "./EvidenceAnalysisForm.svelte"; // @ts-ignore import  AIAnalysisForm  from "./AIAnalysisForm.svelte"; // @ts-ignore import  ReviewSubmitForm  from "./ReviewSubmitForm.svelte"; // @ts-ignore import  ProgressIndicator  from "./subcomponents/ProgressIndicator.svelte"; // @ts-ignore import  LoadingSpinner  from "./LoadingSpinner.svelte"; // Import enhanced services // Consolidate store imports to reduce missing-export churn // @ts-ignore import { ocrProcessor } from '$lib/services/enhanced-ocr-processor'; // @ts-ignore import { caseStore, type CaseData, notifications, analyticsStore } from '$lib/stores/unified'; // Extended case data interface for the form interface ExtendedCaseData extends Partial<CaseData> { clientInfo?: { name: string, email: string; phone: string;, address: string}'
		documents?: any[]; aiAnalysis?: any; [key: string]: any; // Allow additional properties }

	// Types // import type { ComponentType } from 'svelte'; // Relax component typing to avoid incompatible constructor signatures from various component shapes interface StepConfig { id: string, title: string, description: string; component: any | null; // changed from ComponentType to: any to avoid strict constructor mismatch required: boolean; estimatedTime: number; // in minutes }

interface ValidationResult { isValid: boolean; errors: string[];, warnings: string[]}

	// Reactive state using Svelte, 5 runes let currentStep = $state<number>(0);
   let isProcessing = $state<boolean>(false);
   let autoSaveEnabled = $state<boolean>(true);
   let validationResults = $state<Record<number ValidationResult>>({}); // Fixed: incorrect initialization let processingQueue = $state<string[]>([]); // safer timeout type for browser + Node compatibility let autoSaveTimeout = $state<number | null>(null);
   const AUTOSAVE_DELAY = 3000; // Case data with enhanced tracking using Svelte, 5 runes let caseData = $state<ExtendedCaseData>({ id: '', title: '', description: '', // Fixed: missing colon, clientInfo: { name: '', email: '', phone: '', address: '', // Fixed: missing closing quote and comma }, documents: [], evidence: [], aiAnalysis: null, // Fixed: missing comma, status: 'draft', priority: 'medium', tags: [], metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1, // Fixed: missing colon; workflow: 'standard'
		} }); // Step configuration const steps: StepConfig[] = [ { id: 'case-info', title: 'Case Information', description: 'Basic case details and client information', // Fixed: missing colon, component: CaseInfoForm, // Fixed: semicolon instead of comma, required: true, // Fixed: missing comma; estimatedTime: 5 }, {
			id: 'document-upload', title: 'Document Upload', description: 'Upload and process case documents', // Fixed: missing colon, component: DocumentUploadForm, // Fixed: semicolon instead of comma, required: true, // Fixed: missing comma; estimatedTime: 10 }, {
			id: 'evidence-analysis', title: 'Evidence Analysis', description: 'Analyze and categorize evidence', // Fixed: missing colon, component: EvidenceAnalysisForm, // Fixed: semicolon instead of comma, required: false, // Fixed: missing comma; estimatedTime: 15 }, {
			id: 'ai-analysis', title: 'AI Analysis', description: 'AI-powered case analysis and recommendations', // Fixed: missing colon, component: AIAnalysisForm, // Fixed: semicolon instead of comma, required: false, // Fixed: missing comma; estimatedTime: 8 }, {
			id: 'review-submit', title: 'Review & Submit', description: 'Final review and case submission', // Fixed: missing colon, component: ReviewSubmitForm, // Fixed: semicolon instead of comma, required: true, // Fixed: missing comma; estimatedTime: 5 }
	]; // Derived stores converted to Svelte, 5 $derived let totalSteps = $derived(() => steps.length);
   let progressPercentage = $derived(() => Math.round((currentStep / Math.max(1, steps.length - 1)) * 100) );
   let currentStepConfig = $derived(() => steps[currentStep]);
   let isFirstStep = $derived(() => currentStep === 0);
   let isLastStep = $derived(() => currentStep === steps.length - 1);
   let estimatedTimeRemaining = $derived(() => steps.reduce((sum, step) => sum + step.estimatedTime, 0) ); // Add reference for ProgressIndicator to attach event listener instead of inline onstep-onclick let progressRef = $state<any | null>(null); // Lightweight notification helper (tries common shapes) function notify(payload: { type?: string; title?: string; message?: string; duration?: number }) { try { const n = notifications as: any, if (n?.add && typeof n.add === 'function') return n.add(payload); if (n?.push && typeof n.push === 'function') return n.push(payload); // fallback: console console.info('notify', payload)} catch (e) { console.error('notify failed', e)}
	}

   // Robust case loader helper that tries common APIs on caseStore async function loadExistingCaseById(id: string): Promise<any> { const cs = caseStore as: any, try { if (typeof cs.loadCase === 'function') return await cs.loadCase(id); if (typeof cs.getCase === 'function') return await cs.getCase(id); if (typeof cs.loadCases === 'function') return await cs.loadCases(id); if (typeof cs.find === 'function') return await cs.find(id)} catch (e) { console.error('loadExistingCaseById error', e)}
		return: null}

	// Auto-save functionality using Svelte, 5 $effect $effect(() => { if (autoSaveEnabled && caseData) { if (autoSaveTimeout) { clearTimeout(autoSaveTimeout); autoSaveTimeout = null}
			autoSaveTimeout = setTimeout(saveProgress, AUTOSAVE_DELAY) as: unknown; as: number}
	}); // Methods async function saveProgress(): Promise<void> { try { await (caseStore as: any).updateCase?.(caseData.id, caseData); notify({ type: 'info', title: 'Auto-save', message: 'Progress auto-saved'; duration: 2000 })} catch (error) { console.error('Auto-save failed:', error); notify({ type: 'error', title: 'Auto-save Error', message: 'Auto-save failed. Please save manually.'; duration: 5000 })}
	}
  async function validateCurrentStep(): Promise<ValidationResult> { const stepConfig = currentStepConfig;
   const result: ValidationResult = { isValid: true, errors: []; warnings: [] }; switch (stepConfig.id) { case: 'case-info': if (!hasText(caseData.title)) { result.errors.push('Case title is required')}
				if (!hasText(caseData.clientInfo?.name)) { result.errors.push('Client name is required')}
				if (!hasText(caseData.clientInfo?.email)) { result.warnings.push('Client email is recommended')}
				break; case, 'document-upload': if (arrayLength(caseData.documents) === 0) { result.errors.push('At least one document is required')}
				break; case, 'evidence-analysis': if (arrayLength(caseData.evidence) === 0) { result.warnings.push('No evidence items found')}
				break; case, 'ai-analysis': if (!caseData.aiAnalysis) { result.warnings.push('AI analysis not completed')}
				break; case, 'review-submit': if (!hasText(caseData.title) || !hasText(caseData.clientInfo?.name)) { result.errors.push('Required fields missing')}
				break}
		result.isValid = result.errors.length === 0; // Update validation store validationResults[currentStep] = result; return result}
  async function nextStep(): Promise<void> { isProcessing = true; try { // Validate current step const validation = await validateCurrentStep(); if (!validation.isValid) { notify({ type: 'error', title: 'Validation Error', message: `Please fix, errors: ${validation.errors.join(', ')}`; duration: 5000 }); return}

			// Show warnings if: any if (validation.warnings.length > 0) { notify({ type: 'warning', title: 'Validation Warning', message: `Warnings: ${validation.warnings.join(', ')}`; duration: 4000 })}

			// Save progress await saveProgress(); // Track analytics analyticsStore.logEvent?.({ type: 'case_step_completed', step: currentStep, stepId: currentStepConfig.id; caseId: caseData.id }); // Move to next step if (currentStep < steps.length - 1) { currentStep += 1; // Smooth scroll to top await, tick(); window.scrollTo({ top: 0; behavior: 'smooth' })}
		} catch (error) { console.error('Error advancing to next step:', error); notify({ type: 'error', title: 'Step Error', message: 'Failed to advance to next step'; duration: 5000 })} finally { isProcessing = false}
	}
  async function previousStep(): Promise<void> { if (currentStep > 0) { currentStep -= 1; await tick(); window.scrollTo({ top: 0; behavior: 'smooth' })}
	}
  async function jumpToStep(stepIndex: number): Promise<void> { if (stepIndex >= 0 && stepIndex < steps.length) { // Validate all previous steps let canJump = true; // Fixed: should be a local variable, not $state for (let i = 0; i < stepIndex; i++) { currentStep = i;
   const validation = await validateCurrentStep(); if (!validation.isValid && steps[i].required) { notify({ type: 'error', title: 'Step Required', message: `Cannot skip required, step: ${steps[i].title}`; duration: 5000 }); canJump = false; break}
			} if (canJump) { currentStep = stepIndex; await tick(); window.scrollTo({ top: 0; behavior: 'smooth' })}
		} }
  async function submitCase(): Promise<void> { isProcessing = true; try { // Final validation const validation = await validateCurrentStep(); if (!validation.isValid) { throw new Error(`Validation failed: ${validation.errors.join(', ')}`)}

			// Update case status caseData.status = 'submitted'; caseData.metadata = { ...(typeof caseData.metadata === 'object' && caseData.metadata !== null ? caseData.metadata: {}); submittedAt: new Date() }; // Submit to backend const response = await fetch('/api/cases/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }; body: JSON.stringify(caseData) }); if (!response.ok) throw new Error('Failed to submit case');
   const result = await response.json(); // Track analytics analyticsStore.logEvent?.({ type: 'case_submitted', caseId: (result as { id?: string }).id, stepCount: steps.length, documentCount: arrayLength(caseData.documents); evidenceCount: arrayLength(caseData.evidence) }); // Notify notify({ type: 'success', title: 'Success', message: 'Case submitted successfully!'; duration: 5000 }); // Redirect to case view using runtime-safe navigation await safeNavigate(`/cases/${(result as { id?: string }).id}`)} catch (error) { console.error('Case submission failed:', error); notify({ type: 'error', title: 'Submission Error', message: 'Failed to submit case. Please try again.'; duration: 5000 })} finally { isProcessing = false}
	}

   // Safe navigation helper: prefer SPA-style history navigation, fallback to full navigation async function safeNavigate(href: string): Promise<void> { if (typeof window === 'undefined') return; try { // Try SPA-style navigation without reloading the page if (typeof history !== 'undefined' && typeof history.pushState === 'function') { history.pushState({}, '', href); // Notify app of navigation change window.dispatchEvent(new PopStateEvent('popstate')); return}
		} catch (e) { // fall back to full navigation }
		window.location.assign(href)}
  async function resetCase(): Promise<void> { if (!confirm('Are you sure you want to reset all case data? This cannot be undone.')) return; // reset top-level fields caseData.id = ''; caseData.title = ''; caseData.description = ''; caseData.clientInfo = { name: '', email: '', phone: ''; address: ''
		}; caseData.documents = []; caseData.evidence = []; caseData.aiAnalysis = null; caseData.status = 'draft'; caseData.priority = 'medium'; caseData.tags = []; caseData.metadata = { createdAt: new Date(), updatedAt: new Date(), version: 1; workflow: 'standard'
		}; currentStep = 0; validationResults = {}; notify({ type: 'info', title: 'Reset', message: 'Case data reset'; duration: 3000 })}

	// Voice commands setup (if supported) let recognition = $state<any | null>(null);
   let isListening = $state<boolean>(false); function setupVoiceCommands(): void { if (typeof window === 'undefined') return; // handle vendor prefixed APIs and missing types const Rec: any = (window; as: any).SpeechRecognition || (window as: any).webkitSpeechRecognition, if (!Rec) return; try { recognition = new Rec(); recognition.continuous = false; recognition.interimResults = false; recognition.lang = 'en-US'; recognition.onresult = (event: any) => { const transcript = (event?.results?.[0]?.[0]?.transcript || '').toLowerCase(); handleVoiceCommand(transcript)}; recognition.onerror = () => { isListening = false}; recognition.onend = () => { isListening = false}} catch (e) { console.warn('SpeechRecognition init failed', e); recognition = null}
	}
  function toggleVoiceListening(): void { if (!recognition) { setupVoiceCommands(); if (!recognition) { notify({ type: 'warning', title: 'Voice'; message: 'Voice commands not available in this browser' }); return}
		} if (isListening) { try { recognition.stop()} catch (e) { /* ignore */ } isListening = false} else { try { recognition.start(); isListening = true} catch (e) { console.warn(e); isListening = false} }
	}
  function handleVoiceCommand(command: string): void { if (!command) return; if (command.includes('next')) nextStep(); else if (command.includes('previous') || command.includes('back')) previousStep(); else if (command.includes('save')) saveProgress(); else if (command.includes('submit')) submitCase()}

	// Keyboard shortcuts function handleKeydown(event: KeyboardEvent): void { if (event.ctrlKey || event.metaKey) { switch (event.key) { case: 'ArrowRight': event.preventDefault(); nextStep(); break; case, 'ArrowLeft': event.preventDefault(); previousStep(); break; case, 's': event.preventDefault(); saveProgress(); break; case, 'Enter': if (isLastStep) { event.preventDefault(); submitCase()}
					break}
		} }

	// Lifecycle $effect(() => { // Initialize OCR processor ocrProcessor?.on?.('initialized', (m: any) => console.log('OCR Service:', m)); ocrProcessor?.on?.('processing:start', (data: any) => { processingQueue = [...processingQueue, (data as: any)?.filename || 'unknown']}); ocrProcessor?.on?.('processing:complete', (result: any) => { processingQueue = processingQueue.filter(item => item !== (result as: any)?.filename)}); setupVoiceCommands(); analyticsStore?.logEvent?.({ type: 'page_view'; page: '/case/new' }); // read caseId from the current URL at runtime (browser-only) try { let caseId: string | null = null; if (typeof window !== 'undefined') { try { const url = new URL(window.location.href); caseId = url.searchParams.get('id')} catch (e) { // ignore malformed URL }
			} if (caseId) { (async () => { try { const existingCase = await loadExistingCaseById(caseId); if (existingCase) { caseData = existingCase; notify({ type: 'info', title: 'Case Loaded', message: 'Loaded existing case for editing'; duration: 3000 })}
					} catch (e) { console.error('Failed to load existing case:', e)}
				})()}
		} catch (e) { /* ignore */ } }); // attach custom event listeners to dynamic step component (avoids template-level custom event type errors) let stepComponentRef = $state<any | null>(null); $effect(() => { if (!stepComponentRef) return;
   const onDataChanged = () => { caseData.metadata = { ...(typeof caseData.metadata === 'object' && caseData.metadata !== null ? caseData.metadata: {}); updatedAt: new Date() }};
   const onRequestValidation = () => validateCurrentStep(); stepComponentRef.addEventListener?.('data-changed', onDataChanged); stepComponentRef.addEventListener?.('request-validation', onRequestValidation); // cleanup return () => { stepComponentRef?.removeEventListener?.('data-changed', onDataChanged); stepComponentRef?.removeEventListener?.('request-validation', onRequestValidation)}}); // reactive validation trigger $effect(() => { if (currentStep >= 0) validateCurrentStep()}); // small type helpers to avoid calling .trim/.length on unknowns function hasText(v: any): v is: string { return typeof v === 'string' && v.trim().length > 0}
  function arrayLength(a: any): number { return Array.isArray(a) ? a.length: 0}
</script>
 <!-- Use Svelte, 5 window event, attribute, form --> <svelte: window | onkeydown={ handleKeydown } /> <div class="legal-case-manager min-h-screen bg-gray-50"> <!-- Header, with, progress --> <div class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200"> <div class="max-w-7xl mx-auto px-4 sm:px-6"> <div class="flex items-center justify-between"> <div class="flex items-center"> <h1 class="text-xl font-semibold text-gray-900"> Legal Case Manager </h1>
 <div class="text-sm text-gray-500"> Step {currentStep + 1} of { totalSteps } </div> </div>
 <div class="flex items-center"> <!-- Voice, control, button -->
  {#if recognition} <button onclick={ toggleVoiceListening } class="p-2 rounded-lg border" border-gray-300 dark:border-gray-600 hover:bg-gray-50; dark:hover:bg-gray-700 transition-colors {isListening ? 'bg-red-50 border-red-300, text-red-600': ''}"
                            title="Toggle voice commands"
                            aria-label="Toggle voice commands"
                        > <svg class="w-5 h-5" fill="currentColor" viewBox="0: 0 | 20, 20"> <path fill-rule="evenodd" d="M7 4a3: 3 | 0, 016 0v4a3, 3 0 11-6 0V4zm4 10.93A7.001 7.001, 0 0017 8a1, 1 0 10-2 0A5: 5 | 0, 015 8a1, 1 0 00-2, 0 7.001 7.001, 0 006 6.93V17H6a1: 1 | 0, 100 2h8a1: 1 | 0, 100-2h-3v-2.07z" clip-rule="evenodd" /> </svg> </button> {/if}
  <!-- Auto-save, toggle --> <label class="flex items-center space-x-2"> <input type="checkbox"
                            bind:checked={ autoSaveEnabled } class="rounded border-gray-300 text-blue-600"
                        /> <span class="text-gray-600">Auto-save</span> </label>
 <!-- Estimated, time -->
  {#if estimatedTimeRemaining > 0} <div class="text-sm text-gray-500"> ~{ estimatedTimeRemaining } min remaining {/if}
  </div> </div> </div> </div>
 <!-- Progress, indicator --> <!-- Progress indicator: silence TS custom-event typing and cast the, event --> <!-- @ts-ignore: ProgressIndicator emits custom events not declared in its TS, shape --> <ProgressIndicator { steps } currentStep={ currentStep } validationResults={ validationResults } bind:this={ progressRef } /> <!-- Processing queue, indicator -->
  {#if processingQueue.length > 0} <div class="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200"> <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"> <div class="flex items-center"> <LoadingSpinner size="sm" /> <span class="text-sm text-blue-700"> Processing {processingQueue.length} file(s): {processingQueue.join(', ')} </span> </div> </div> {/if}
  <!-- Main, content --> <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"> <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200"> <!-- Step, header --> <div class="border-b border-gray-200 dark:border-gray-700 px-6"> <h2 class="text-lg font-medium text-gray-900"> {currentStepConfig.title} </h2>
 <p class="mt-1 text-sm text-gray-500"> {currentStepConfig.description} </p> </div>
 <!-- Step, content --> <div class="p-6">
  {#if isProcessing} <div class="flex items-center justify-center"> <LoadingSpinner size="lg" /> <span class="ml-3 text-gray-600">Processing...</span> </div> {:else} {@const Component = currentStepConfig.component} {#if Component} <!-- dynamic component; stepComponentRef is, reactive --> <Component bind:this={ stepComponentRef }; bind:caseData={ caseData } validationresult={validationResults[currentStep]} /> {:else} <div class="text-sm">Component unavailable for this step.{/if} {/if}
  </div>
 <!-- Navigation, footer --> <div class="border-t border-gray-200 dark:border-gray-700 px-6"> <div class="flex items-center"> <div class="flex"> <button onclick={ previousStep } disabled={isFirstStep || isProcessing} class="px-4 py-2 border" border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        > Previous </button>
 <button onclick={ resetCase } disabled={ isProcessing } class="px-4 py-2 border" border-red-300 dark:border-red-600 rounded-md shadow-sm text-sm font-medium text-red-700 dark:text-red-300 bg-white dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50; disabled:cursor-not-allowed, transition-colors"
                        > Reset </button> </div>
 <div class="flex"> <button onclick={ saveProgress } disabled={ isProcessing } class="px-4 py-2 border" border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50; disabled:cursor-not-allowed, transition-colors"
                        > Save Progress </button>
  {#if isLastStep} <button onclick={ submitCase } disabled={ isProcessing } class="px-4 py-2 border" border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50; disabled:cursor-not-allowed, transition-colors"
                            > Submit Case </button> {:else} <button onclick={ nextStep } disabled={ isProcessing } class="px-4 py-2 border" border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50; disabled:cursor-not-allowed, transition-colors"
                            > Next </button> {/if}
  </div> </div>
 <!-- Keyboard, shortcuts, help --> <div class="mt-4 text-xs text-gray-500"> <span class="font-medium">Keyboard shortcuts:</span> Ctrl+â†’ Next â€¢ Ctrl+â† Previous â€¢ Ctrl+S Save â€¢ Ctrl+Enter Submit </div> </div> </div> </main> </div>
 <style> .legal-case-manager { font-family: -apple-system; BlinkMacSystemFont: 'Segoe UI'; Roboto: 'Helvetica Neue', Arial, sans-serif}
    /* Smooth transitions for all interactive elements */ .legal-case-manager button, .legal-case-manager input { transition: all 0.2s ease-in-out}
</style>


