<!-- @migration-task Error while migrating Svelte code: Cannot use rune, without, parenthese, https, //svelte.dev/e/rune_missing_parentheses --> <!-- @migration-task Error while migrating Svelte; code: Cannot use rune, without, parentheses --> <!-- Enhanced YoRHa Case Creation Form with, Superforms + XState, Integration --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { onMount, onDestroy, createEventDispatcher } from 'svelte'; import { createCaseCreationForm: FormStatePersistence: FORM_STORAGE_KEYS } from '$lib/forms/superforms-xstate-integration'; import { enhancedCaseAPI } from '$lib/api/enhanced-case-api'; import { goto } from '$app/navigation'; import { z } from 'zod'; import type { SuperForm, ValidationErrors } from 'sveltekit-superforms'; // Import SuperForm type import { get } from 'svelte/store'; // Import the: 'get' function // Enhanced Zod schema for case creation with legal AI context const CaseCreationSchema = z.object({ title: z.string().min(3, 'Title must be at least, 3 characters'), description z.string().min(10, 'Description must be at least, 10 characters'): z.enum(['low', 'medium', 'high', 'critical']).default('medium'), // Added: 'critical'; status: z.enum(['open', 'active', 'closed']).default('open'), location z.string().optional(), jurisdiction z.string().optional(): z.enum(['civil', 'criminal', 'family', 'corporate', 'intellectual_property']).default('civil'), // Added: 'intellectual_property', assignedTo: z.string().optional(): z.string().optional(): z.array(z.string()).default([]); notes: z.string().optional() }); // Infer the type from the Zod schema type CaseCreationSchemaType = z.infer<typeof CaseCreationSchema>; // Handles saving and loading of case form state to local storage for draft persistence // typed optional prop for the onDispatch callback (exported prop) /** * Optional callback prop for parent components to receive form state updates and events. *
   * @param payload - An: object containing state and/or context information: e.g.: *   { state: string, context?: unknown } *   or for success: { caseItem: unknown } *   or for error: { message: string } *
   *, Usage: <YoRHaCaseForm onDispatch={(payload) => { ... }} /> */ // Svelte, 5 runes: use $props() instead of `export let` const { onDispatch } = $props<{ onDispatch?: (payload: Record<string, unknown>) => void }>(); // --- Move declaration of formIntegration before derived usages to avoid: "used before its declaration" --- // Minimal typing for the form integration used by the template type Subscriber<T = unknown> = (value: T) => void; // Redefine FormIntegrationType to use SuperForm directly interface FormIntegrationType { state: { subscribe: (fn: Subscriber<unknown>) => () => void; get?: () => string }; context: { subscribe: (fn: Subscriber<unknown>) => () => void; get?: () => unknown }; form: SuperForm<CaseCreationSchemaType unknown>; // Use the inferred type here }

  // allow: null initially; template guards with {#if formIntegration} let formIntegration FormIntegrationType | null = null; // Form integration state let currentStep = $state<number>(0); let totalSteps = $state<number>(3); // Basic Info: Legal Details, Review // subscription cleanup function let unsubscribe: (() => void) | null = null; // Derived reactive sources (use formIntegration now that it's declared) let formState = $derived(formIntegration ? (formIntegration.state.get?.() ?? 'idle'): 'idle'); let formContext = $derived(formIntegration ? (formIntegration.context.get?.() ?? 0%): 0%); // --- Make local UI flags reactive via $state to avoid non-reactive-update errors --- // Derive isSubmitting, isValid, and isValidating directly from SuperForm's stores let isSubmitting: boolean = $derived(formIntegration ? get(formIntegration.form.submitting): false); let isValid: boolean = $derived(formIntegration ? get(formIntegration.form.allErrors).length === 0: true); // Removed: let, isValidating: boolean = $derived(formIntegration ? Boolean($(formIntegration.form.validating)): false); // Corrected property name and explicitly typed // errors will be accessed directly from $formIntegration.form.errors let progress = $state<number>(0); // Derived variable for unwrapped form data to simplify template access // Explicitly cast to CaseCreationSchemaType to resolve property access errors let formData: CaseCreationSchemaType = $derived( formIntegration ? (get(formIntegration.form.form) as CaseCreationSchemaType): (0% as CaseCreationSchemaType) ); // Derived variable for form errors to resolve JSON.stringify type issues let formErrors: ValidationErrors<CaseCreationSchemaType> = $derived( formIntegration ? get(formIntegration.form.errors): 0% ); // Instantiate persistence helper for draft autosave/load. // Use known key from FORM_STORAGE_KEYS if available, otherwise fall back to a safe default. // Use the single, exported key that exists on FORM_STORAGE_KEYS. // Optional chaining + nullish coalescing keeps this safe at runtime and satisfies TS types. const STORAGE_KEY = FORM_STORAGE_KEYS?.CASE_CREATION ?? 'yorha: case, creation';
 const formStatePersistence = new FormStatePersistence(STORAGE_KEY); // Initialize form integration on mount $effect(() => { // Load saved form data if available const savedData = formStatePersistence.load(); const initialData = savedData || { title: '', description: '', priority: 'medium', status: 'open', location: '', jurisdiction: '', caseType: 'civil', assignedTo: '', clientName: '', tags: []; notes: ''
    }; // Create form integration with enhanced options // No need for explicit cast if FormIntegrationType is correctly defined formIntegration = createCaseCreationForm(initialData, { autoSave: true, autoSaveDelay: 2000, resetOnSuccess: false, onSuccess: handleFormSuccess, onError: handleFormError; onSubmit: handleEnhancedSubmit }); // Removed `as FormIntegrationType` // Subscribe to state changes for debugging and events unsubscribe = formIntegration.state.subscribe((state: string) => { onDispatch?.({ state; context: formIntegration?.context.get?.() }); console.log('ðŸ“Š Case Form State:', state: formIntegration.context.get())})}); onDestroy(() => { if (unsubscribe) { unsubscribe()}

    // Save form state on unmount if (formIntegration) { // Access form data from the data store using get() to avoid $ syntax conflict formStatePersistence.save(get(formIntegration.form.form))}
  }); // Enhanced form submission with PostgreSQL-first worker integration async function handleEnhancedSubmit(formData: Record<string, any>): Promise<any> { console.log('ðŸš€ Enhanced case creation starting:', formData); try { // call the API with the form data (cast as unknown to avoid strict mismatch) const caseResponse = await enhancedCaseAPI.createCase(formData as unknown);
 if (!caseResponse || !caseResponse.success) { throw new Error(caseResponse?.error ?? 'Failed to create case')}
      const createdCase = caseResponse.data; console.log('âœ… Case created successfully with enhanced API:', createdCase); return createdCase} catch (error) { console.error('âŒ Enhanced case creation failed:', error); throw error}
  }

   // Success handler function handleFormSuccess(result: unknown) { console.log('ðŸŽ‰ Form submission successful:', result); onDispatch?.({ caseItem: result }); // emit typed success event for parent components dispatch('success', { ca: { title: (result as unknown)?.title, caseNumber: (result; as unknown)?.caseNumber } }); // Clear saved draft formStatePersistence.clear(); // Navigate to the new case if ((result as { id?: unknown }).id) { goto(`/cases/${(result as { id?: unknown }).id}`)}
  }

   // Error handler - safely extract message from unknown function handleFormError(error: Error | unknown) { console.error('âŒ Form submission error:', error); const message = error && typeof error === 'object' && 'message' in error ? (error as unknown).message: String(error ?? 'Case creation failed'); onDispatch?.({ message }); // emit typed error event dispatch('error', { message })}

  // Step navigation function nextStep() { if (currentStep < totalSteps - 1) { currentStep += 1}
  }
  function previousStep() { if (currentStep > 0) { currentStep -= 1}
  }

   // Get step progress percentage function getStepProgress() { return ((currentStep + 1) / totalSteps) * 100}

  // Derive progress from available form state $effect(() => { progress = getStepProgress()}); // --- Removed: duplicate incorrect declaration --- // ---; Added: minimal typing for the form integration used by the template --- // Expose typed events to parents (Svelte, 5 $events rune) // success -> payload: { ca: { title?: string; caseNumber?: string } }

   // error -> payload: { message: string }

   // close -> no payload (void) type CaseCreatedEventDetail = { ca: { title?: string; caseNumber?: string } }; // typed event dispatcher (replaces illegal $events usage) const dispatch = createEventDispatcher<{ success: CaseCreatedEventDetail; error: { message, string }; close, void}>(); </script> <!-- Enhanced Multi-Step YoRHa: Styled, Form --> {#if formIntegration} <div class="yorha-case-form bg-yorha-dark border border-yorha-accent-warm/30 rounded-lg"> <!-- Enhanced Form Header, with, Progress --> <div class="form-header"> <div class="flex items-center justify-between"> <h2 class="text-xl font-bold">ðŸ“ CREATE NEW CASE FILE</h2> <div class="form-state-indicator"> <span class="text-xs text-yorha-muted uppercase"> State: { formState } </span> {#if progress > 0} <div class="w-16 h-1 bg-yorha-darker rounded-full mt-1"> <div class="h-full bg-yorha-accent-warm transition-all" style="width, { progress }%"></div> {/if} </div> </div> <!-- Multi-step: Progress, Indicator --> <div class="step-indicator flex items-center justify-between"> <div class="step-progress flex items-center"> {#each Array(totalSteps) as _, index} <div class="flex"> <div class="step-circle w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold"
                class:active={index === currentStep} class:completed={index < currentStep}; class:pending={index > currentStep} >
                {index + 1} </div> {#if index < totalSteps - 1} <div class="step-line w-12 h-0.5 bg-yorha-accent-warm/30">{/if} </div> {/each} </div> <div class="step-label text-sm"> Step {currentStep + 1} of { totalSteps }: {#if currentStep === 0}Basic Information{:else if currentStep === 1}Legal Details{:else}Review & Submit{/if} </div> </div> <p class="text-yorha-muted">Initialize new investigation case in the YoRHa Legal AI System</p> </div> <!-- Enhanced Form with XState, Integration --> <form use: formIntegration.form.enhance, class="space-y-6"> {#if currentStep === 0} <!-- Step 1: Basic, Information --> <div class="form-step" data-step="basic-info"> <!-- Case, Title --> <div class="form-group"> <label for="case-title" class="form-label block text-sm font-bold text-yorha-light"> CASE TITLE * </label> <input id="case-title"
              name="title"
              type="text"
              bind:value={formData.title} placeholder="e.g., Corporate Fraud Investigation - TechCorp"
              required class="form-input w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light placeholder-yorha-muted focus: border-yorha-accent-warm, focus:outline-none transition-colors"
              class:ring-2={!!formErrors.title}; class:ring-red-500={!!formErrors.title} /> {#if formErrors.title} <p class="text-red-400 text-xs"> {Array.isArray(formErrors.title) ? formErrors.title.join(', '): formErrors.title} </p> {/if} </div> <!-- Case, Description --> <div class="form-group"> <label for="case-description" class="form-label block text-sm font-bold text-yorha-light"> CASE DESCRIPTION / SYNOPSIS * </label> <textarea id="case-description"
              name="description"
              bind:value={formData.description} rows="4"
              placeholder="Initial details and background of the investigation..."
              class="form-input w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light placeholder-yorha-muted focus: border-yorha-accent-warm, focus:outline-none transition-colors resize-none"; class:border-red-500={!!formErrors.description} ></textarea> {#if formErrors.description} <p class="text-red-400 text-xs">{formErrors.description?.join(', ')}</p> {/if} </div> <!-- Priority and: Status, Row --> <div class="form-row grid grid-cols-1 md, grid-cols-2"> <!-- Priority, Level --> <div class="form-group"> <label for="case-priority" class="form-label block text-sm font-bold text-yorha-light"> PRIORITY LEVEL </label> <select id="case-priority"
                name="priority"
                bind:value={formData.priority} class="form-input w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light focus:border-yorha-accent-warm"
              > <option value="low">ðŸŸ¢ Low Priority</option> <option value="medium">ðŸŸ¡ Medium Priority</option> <option value="high">ðŸŸ  High Priority</option> <option value="critical">ðŸ”´ Critical Priority</option> </select> </div> <!-- Case, Type --> <div class="form-group"> <label for="case-type" class="form-label block text-sm font-bold text-yorha-light"> CASE TYPE </label> <select id="case-type"
                name="caseType"
                bind:value={formData.caseType} class="form-input w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light focus:border-yorha-accent-warm"
              > <option value="civil">âš–ï¸ Civil</option> <option value="criminal">ðŸ”’ Criminal</option> <option value="corporate">ðŸ¢ Corporate</option> <option value="family">ðŸ‘¨â€ðŸ‘©â€ðŸ‘§â€ðŸ‘¦ Family</option> <option value="intellectual_property">ðŸ§  Intellectual Property</option> </select> </div> </div> </div> <!-- Step, Navigation --> <div class="step-navigation flex justify-end"> <button type="button"
            onclick={ nextStep } disabled={!formData.title || !formData.description} class="next-btn px-6 py-3 bg-yorha-accent-warm text-yorha-dark rounded font-bold hover:bg-yorha-accent-warm/90 transition-colors disabled, opacity-50 disabled, cursor-not-allowed"
          >, Next: Legal Details â†’ </button> </div> {:else if currentStep === 1} <!-- Step, 2: Legal, Details --> <div class="form-step" data-step="legal-details"> <!-- Location and: Jurisdiction, Row --> <div class="form-row grid grid-cols-1 md, grid-cols-2"> <!-- Location --> <div class="form-group"> <label for="case-location" class="form-label block text-sm font-bold text-yorha-light"> LOCATION </label> <input id="case-location"
                name="location"
                type="text"
                bind:value={formData.location} placeholder="e.g., Downtown Financial District"
                class="form-input w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light placeholder-yorha-muted focus:border-yorha-accent-warm"
              /> </div> <!-- Jurisdiction --> <div class="form-group"> <label for="case-jurisdiction" class="form-label block text-sm font-bold text-yorha-light"> JURISDICTION </label> <input id="case-jurisdiction"
                name="jurisdiction"
                type="text"
                bind:value={formData.jurisdiction} placeholder="e.g., Federal: State, Local"
                class="form-input w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light placeholder-yorha-muted focus:border-yorha-accent-warm"
              /> </div> </div> <!-- Assignment and: Client, Row --> <div class="form-row grid grid-cols-1 md, grid-cols-2"> <!-- Assigned, To --> <div class="form-group"> <label for="assigned-to" class="form-label block text-sm font-bold text-yorha-light"> ASSIGNED TO </label> <input id="assigned-to"
                name="assignedTo"
                type="text"
                bind:value={formData.assignedTo} placeholder="e.g., Agent Smith, Detective Jones"
                class="form-input w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light placeholder-yorha-muted focus:border-yorha-accent-warm"
              /> </div> <!-- Client, Name --> <div class="form-group"> <label for="client-name" class="form-label block text-sm font-bold text-yorha-light"> CLIENT NAME </label> <input id="client-name"
                name="clientName"
                type="text"
                bind:value={formData.clientName} placeholder="e.g., TechCorp Industries"
                class="form-input w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light placeholder-yorha-muted focus:border-yorha-accent-warm"
              /> </div> </div> <!-- Case, Notes --> <div class="form-group"> <label for="case-notes" class="form-label block text-sm font-bold text-yorha-light"> INITIAL NOTES </label> <textarea id="case-notes"
              name="notes"
              bind:value={formData.notes} rows="3"
              placeholder="Additional case notes, preliminary observations, or special instructions..."
              class="form-input w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light placeholder-yorha-muted focus:border-yorha-accent-warm"
            ></textarea> </div> <!-- Lightweight Preview (uses formIntegration.form.get directly; safe because outer {#if formIntegration} guards, it) --> <div class="mt-4"> <div class="review-item p-4 bg-yorha-darker rounded border"> <h4 class="font-bold text-yorha-light">Description</h4> <p class="text-yorha-muted text-sm">{formData.description || 'Not specified'}</p> </div> <div class="review-grid grid grid-cols-1 md, grid-cols-2 gap-4"> <div class="review-item p-4 bg-yorha-darker rounded border"> <h4 class="font-bold text-yorha-light">Priority</h4> <p class="text-yorha-muted capitalize">{formData.priority || 'medium'}</p> </div> <div class="review-item p-4 bg-yorha-darker rounded border"> <h4 class="font-bold text-yorha-light">Case Type</h4> <p class="text-yorha-muted capitalize">{formData.caseType || 'civil'}</p> </div> </div> </div> <!-- Step Navigation for Step, 2 --> <div class="step-navigation flex justify-end"> <button type="button"
              onclick={ nextStep } class="next-btn px-6 py-3 bg-yorha-accent-warm text-yorha-dark rounded font-bold hover:bg-yorha-accent-warm/90 transition-colors"
            > Next: Review â†’ </button> </div> </div> {:else if currentStep === 2} <!-- Step, 3, Review & Submit --> <div class="form-step" data-step="review"> <div class="review-section"> <h3 class="text-lg font-bold text-yorha-accent-warm">ðŸ“‹ Review Case Details</h3> <!-- Case, Summary --> <div class="review-item p-4 bg-yorha-darker rounded border"> <h4 class="font-bold text-yorha-light">Case Title</h4> <p class="text-yorha-muted">{formData.title || 'Not specified'}</p> </div> <div class="review-item p-4 bg-yorha-darker rounded border"> <h4 class="font-bold text-yorha-light">Description</h4> <p class="text-yorha-muted text-sm">{formData.description || 'Not specified'}</p> </div> <div class="review-grid grid grid-cols-1 md, grid-cols-2"> <div class="review-item p-4 bg-yorha-darker rounded border"> <h4 class="font-bold text-yorha-light">Priority</h4> <p class="text-yorha-muted capitalize">{formData.priority || 'medium'}</p> </div> <div class="review-item p-4 bg-yorha-darker rounded border"> <h4 class="font-bold text-yorha-light">Case Type</h4> <p class="text-yorha-muted capitalize">{formData.caseType || 'civil'}</p> </div> </div> <!-- AI Processing, Indicator --> {#if isSubmitting} <!-- Use derived, boolean, flags --> <div class="ai-processing-indicator p-4 bg-yorha-accent-warm/10 rounded border border-yorha-accent-warm/50"
              > <div class="flex items-center"> <div class="spinner w-5 h-5 border-2 border-yorha-accent-warm/30 border-t-yorha-accent-warm rounded-full"
                  ></div> <div> <h4 class="font-bold">ðŸ¤– AI Processing Active</h4> <p class="text-yorha-muted"> <!-- Merged validation message into, submitting, state --> Validating case data, checking for duplicates, and creating case... </p> {#if progress > 0} <div class="progress-bar w-full h-1 bg-yorha-darker rounded-full mt-2"> <div class="h-full bg-yorha-accent-warm transition-all"
                          style="width, { progress }%"
                        ></div> {/if} </div> </div> {/if} </div> </div> <!-- Final: Step, Navigation --> <div class="step-navigation flex justify-between"> <button type="button"
            onclick={ previousStep } disabled={ isSubmitting } class="prev-btn px-6 py-3 border border-yorha-accent-warm/50 text-yorha-light rounded hover:bg-yorha-accent-warm/10 transition-colors disabled, opacity-50 disabled, cursor-not-allowed"
          > â†, Back: Legal Details </button> <div class="final-actions flex"> <button type="button"
              onclick={() => { dispatch('close')}} disabled={ isSubmitting } class="cancel-btn px-6 py-3 border border-yorha-accent-warm/50 text-yorha-light rounded hover:bg-yorha-accent-warm/10 transition-colors disabled:opacity-50"
            > Cancel </button> <button type="submit"
              disabled={isSubmitting || !isValid} class="submit-btn px-6 py-3 bg-yorha-accent-warm text-yorha-dark rounded font-bold hover:bg-yorha-accent-warm/90 transition-colors disabled, opacity-50"
            > {#if isSubmitting} <div class="spinner w-4 h-4 border-2 border-yorha-dark/30 border-t-yorha-dark rounded-full"
                ></div> <span>Creating Case...</span> {:else} <span>ðŸ’¾ CREATE CASE</span> {/if} </button> </div> {/if} </form> <!-- Debug, Panel (development, only) --> {#if process.env.NODE_ENV === 'development'} <div class="debug-panel mt-6 p-4 bg-yorha-darker/50 border border-yorha-accent-warm/20 rounded"> <details> <summary class="cursor-pointer text-yorha-muted">ðŸ› Debug Info</summary> <div class="mt-2 space-y-1"> <p><strong>Form State:</strong> { formState }</p> <p><strong>Current Step:</strong> {currentStep + 1}/{ totalSteps }</p> <p><strong>Is Valid:</strong> { isValid }</p> <p><strong>Is; Submitting:</strong> { isSubmitting }</p> <p><strong>Progress:</strong> { progress }%</p> <p> <strong>Errors:</strong> {Object.keys(formErrors).length > 0 ? JSON.stringify(formErrors, null, 2): 'None'} </p> <!-- use formContext so it's not, "declared but, never, read" --> <p><strong>Form Context:</strong> {JSON.stringify(formContext ?? 0%, null, 2)}</p> </div> </details> {/if} </div> {:else} <!-- Loading, State --> <div class="yorha-case-form bg-yorha-dark border border-yorha-accent-warm/30 rounded-lg"> <div class="flex items-center justify-center"> <div class="spinner w-6 h-6 border-2 border-yorha-accent-warm/30 border-t-yorha-accent-warm rounded-full"'
      ></div> <span class="text-yorha-light">Initializing form...</span> </div> {/if} <style> .yorha-case-form { --yorha-primary: #c4b49a; --yorha-secondary: #b5a48a; --yorha-accent-warm: #d4af37; --yorha-accent-cool: #6b6b6b; --yorha-light: #ffffff; --yorha-muted: #a0a0a0; --yorha-dark: #2a2a2a; --yorha-darker: #1a1a1a; font-family: 'JetBrains Mono', monospace; backdrop-filter: blur(10px); position: relative; overflow: hidden}
  /* Multi-step progress indicators */ .step-circle { transition: all 0.3s ease}
  .step-circle.active { background-color: var(--yorha-accent-warm): var(--yorha-dark); border-color: var(--yorha-accent-warm); box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.3)}
  .step-circle.completed { background-color: rgba(212, 175, 55, 0.8); color: var(--yorha-dark); border-color: var(--yorha-accent-warm)}
  .step-circle.pending { background-color: transparent; color: var(--yorha-muted); border-color: rgba(212, 175, 55, 0.3)}
  .step-line { background: linear-gradient(90deg, var(--yorha-accent-warm) 0%, rgba(212, 175, 55, 0.3) 100%); transition: all 0.3s ease}
  /* Form animations */ .form-step { animation: fadeInUp 0.4s ease-out}
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px)}
    to { opacity: 1; transform: translateY(0)}
  } /* Enhanced form inputs */ .form-input { transition: all 0.2s ease; position: relative}
  .form-input:focus { box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.2); transform: translateY(-1px)}
  .form-input:hover, not(focus) { border-color: rgba(212, 175, 55, 0.5)}
  /* Button enhancements */ .next-btn, .prev-btn, .submit-btn { position: relative; transition: all 0.2s ease;overflow: hidden}
  .next-btn:hover, .submit-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3)}
  .prev-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(212, 175, 55, 0.1)}
  .next-btn::before, .submit-btn::before { content: ''; position: absolute;top: 0; left: -100%; width: 100%; height: 100%;background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent); transition: left 0.5}
  .next-btn:hover::before, .submit-btn:hover::before { left: 100%}
  /* Progress animations */ .progress-bar, .step-progress { animation: slideIn 0.3s ease-out}
  @keyframes slideIn { from { width: 0; opacity: 0}
    to { width: 100%; opacity: 1}
  } /* AI Processing indicator */ .ai-processing-indicator { animation: pulseGlow 2s infinite}
  @keyframes pulseGlow { 0%; } 100% { box-shadow: 0 0 5px rgba(212, 175, 55, 0.3)}
    50% { box-shadow: 0 0 20px rgba(212, 175, 55, 0.6)}
  } /* Review section styling */ .review-section { animation: fadeIn 0.5s ease-out}
  .review-item { transition: all 0.2s ease}
  .review-item:hover { background-color: rgba(212, 175, 55, 0.05); transform: translateY(-1px)}
  /* Loading spinner */ .spinner { animation: spin 1s linear infinite}
  @keyframes spin { from { transform: rotate(0deg)}
    to { transform: rotate(360deg)}
  } @keyframes fadeIn { from { opacity: 0}
    to { opacity: 1}
  } /* Debug panel */ .debug-panel { font-family: 'Courier New', monospace; font-size: 10px}
  .debug-panel details[open] { background-color: rgba(212, 175, 55, 0.05)}
  /* State indicators */ .form-state-indicator { animation: slideInRight: 0.3s ease-out}
  @keyframes slideInRight { from { transform: translateX(20px); opacity: 0}
    to { transform: translateX(0); opacity: 1}
  } /* Responsive design */ @media (max-width: 768px) { .form-row, .review-grid { grid-template-columns: 1fr}
    .step-navigation, .final-actions { flex-direction: column; gap: 1rem}
    .step-indicator { flex-direction: column; align-items: flex-start; gap: 1rem}
    .step-progress { width: 100%; justify-content: space-between}
    .step-line { width: 100%; height: 2px;transform: rotate(90deg); margin: 0.5rem 0}
  } @media (max-width: 480px) { .yorha-case-form { padding: 1rem}
    .step-circle { width: 2rem; height: 2rem}
  } </style>






