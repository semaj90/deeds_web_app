<!-- Enhanced YoRHa Case Creation Form with Superforms + XState Integration -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { enhancedCaseAPI, type CaseCreationRequest } from '$lib/api/enhanced-case-api';
  import { createCaseCreationForm, FORM_STORAGE_KEYS } from '$lib/forms/superforms-xstate-integration';
  import { onDestroy, onMount } from 'svelte';
  import type { Readable } from 'svelte/store';
  import { get } from 'svelte/store';
  import { z } from 'zod';

  // Temporary polyfill for FormStatePersistence if missing
  class FormStatePersistence {
    private key: string;
    constructor(key: string) { this.key = key; }
    save(data: any) { if (typeof localStorage !== 'undefined') localStorage.setItem(this.key, JSON.stringify(data)); }
    load() { if (typeof localStorage !== 'undefined') { const s = localStorage.getItem(this.key); return s ? JSON.parse(s) : null; } return null; }
    clear() { if (typeof localStorage !== 'undefined') localStorage.removeItem(this.key); }
  }

  // Enhanced Zod schema for case creation with legal AI context
  const CaseCreationSchema = z.object({
    title: z.string().min(3, 'Title must be at least 3 characters'),
    description: z.string().min(10, 'Description must be at least 10 characters'),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    status: z.enum(['open', 'active', 'closed']).default('open'),
    location: z.string().optional(),
    jurisdiction: z.string().optional(),
    caseType: z.enum(['civil', 'criminal', 'family', 'corporate', 'intellectual_property']).default('civil'),
    assignedTo: z.string().optional(),
    clientName: z.string().optional(),
    tags: z.array(z.string()).default([]),
    notes: z.string().optional()
  });

  type CaseCreationSchemaType = z.infer<typeof CaseCreationSchema>;

  // Optional callback prop
  const { onDispatch, onsuccess, onerror, onclose } = $props<{
    onDispatch?: (payload: Record<string, unknown>) => void;
    onsuccess?: (result: unknown) => void;
    onerror?: (error: {, message: string }) => void;
    onclose?: () => void;
  }>();

  // Minimal typing for the form integration
  type Subscriber<T = unknown> = (value: T) => void;
  interface FormIntegrationType {
    state: {, subscribe: (fn: Subscriber<unknown>) => () => void; get?: () => string };
    context: {, subscribe: (fn: Subscriber<unknown>) => () => void; get?: () => unknown };
    form: {, form: Readable<CaseCreationSchemaType>;
      submitting: Readable<boolean>;, allErrors: Readable<string[]>;
      errors: Readable<Record<string, string[]>>;
      enhance: (el: HTMLFormElement) => { destroy: () => void };
    };
  }

  let formIntegration = $state<FormIntegrationType | null>(null);
  let currentStep = $state<number>(0);
  let totalSteps = $state<number>(3);
  let unsubscribe: (() => void) | null = null;

  // Reactive derived values
  let formState = $derived(formIntegration?.state.get?.() ?? 'idle');
  let formContext = $derived(formIntegration?.context.get?.() ?? {});
  let isSubmitting = $derived(formIntegration ? get(formIntegration.form.submitting) : false);
  let isValid = $derived(formIntegration ? (get(formIntegration.form.allErrors) as string[]).length === 0 : true);

  // Progress calculation
  let progress = $derived(((currentStep + 1) / totalSteps) * 100);

  // Form Data Access
  let formData = $derived(
    formIntegration ? (get(formIntegration.form.form) as CaseCreationSchemaType) : ({} as CaseCreationSchemaType)
  );

  let formErrors = $derived(
    formIntegration ? (get(formIntegration.form.errors) as Record<string, string[]>) : {}
  );

  const STORAGE_KEY = FORM_STORAGE_KEYS?.CASE_CREATION ?? 'yorha:case_creation';
  const formStatePersistence = new FormStatePersistence(STORAGE_KEY);



  onMount(() => {
    const savedData = formStatePersistence.load();
    const initialData = savedData || {
      title: '',
      description: '',
      priority: 'medium',
      status: 'open',
      location: '',
      jurisdiction: '',
      caseType: 'civil',
      assignedTo: '',
      clientName: '',
      tags: [],
      notes: ''
    };

    formIntegration = createCaseCreationForm(initialData, {
      autoSave: true,
      autoSaveDelay: 2000,
      resetOnSuccess: false,
      onSuccess: handleFormSuccess,
      onError: handleFormError,
      onSubmit: handleEnhancedSubmit
    }) as unknown as FormIntegrationType;

    unsubscribe = formIntegration.state.subscribe((state: unknown) => {
       const s = String(state);
       onDispatch?.({ state: s, context: formIntegration?.context.get?.() });
    });
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
    if (formIntegration) {
      formStatePersistence.save(get(formIntegration.form.form));
    }
  });

  async function handleEnhancedSubmit(data: Record<string, any>): Promise<any> {
    try {
      const caseResponse = await enhancedCaseAPI.createCase(data as CaseCreationRequest);
      if (!caseResponse || !caseResponse.success) {
        throw new Error(caseResponse?.error ?? 'Failed to create case');
      }
      return caseResponse.data;
    } catch (error) {
      console.error('Enhanced case creation failed:', error);
      throw error;
    }
  }

  function handleFormSuccess(result: unknown) {
    onDispatch?.({ caseItem: result });
    onsuccess?.(result);
    formStatePersistence.clear();
    const r = result as { id?: string };
    if (r.id) {
        goto(`/cases/${r.id}`);
    }
  }

  function handleFormError(error: unknown) {
    const msg = error && typeof error === 'object' && 'message' in error ? String((error as any).message) : 'Case creation failed';
    onDispatch?.({ message: msg });
    onerror?.({ message: msg });
  }

  function nextStep() {
    if (currentStep < totalSteps - 1) currentStep++;
  }

  function previousStep() {
    if (currentStep > 0) currentStep--;
  }

  function handleClose() {
    onclose?.();
  }
</script>

{#if formIntegration}
<div class="yorha-case-form bg-yorha-dark border border-yorha-accent-warm/30 rounded-lg p-6">
  <!-- Header -->
  <div class="form-header mb-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold text-yorha-light">📂 CREATE NEW CASE FILE</h2>
      <div class="flex flex-col items-end">
        <span class="text-xs text-yorha-muted uppercase">State: {formState}</span>
        <div class="w-24 h-1 bg-yorha-darker rounded-full mt-1 overflow-hidden">
             <div class="h-full bg-yorha-accent-warm transition-all duration-300" style="width: {progress}%"></div>
        </div>
      </div>
    </div>

    <!-- Steps -->
    <div class="step-indicator flex items-center justify-between mb-8 relative">
        {#each Array(totalSteps) as _, index}
            <div class="flex flex-col items-center z-10">
                <div class="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-300 bg-yorha-dark"
                     class:border-yorha-accent-warm={index <= currentStep}
                     class:border-yorha-muted={index > currentStep}
                     class:text-yorha-accent-warm={index <= currentStep}
                     class:text-yorha-muted={index > currentStep}>
                    {index + 1}
                </div>
                <span class="text-xs mt-1" class:text-yorha-accent-warm={index===currentStep} class:text-yorha-muted={index!==currentStep}>
                    {#if index === 0}Basics{/if}
                    {#if index === 1}Details{/if}
                    {#if index === 2}Review{/if}
                </span>
            </div>
        {/each}
        <div class="absolute top-4 left-0 w-full h-0.5 bg-yorha-darker -z-0">
             <div class="h-full bg-yorha-accent-warm transition-all duration-300" style="width: {(currentStep / (totalSteps - 1)) * 100}%"></div>
        </div>
    </div>
  </div>

  <form use:formIntegration.form.enhance class="space-y-6">
    {#if currentStep === 0}
      <div class="space-y-4">
        <div>
          <label for="title" class="block text-sm font-bold text-yorha-light mb-1">CASE TITLE *</label>
          <input id="title" name="title" type="text" bind:value={formData.title} required
                 class="w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light focus: border-yorha-accent-warm, focus:outline-none transition-colors" />
          {#if formErrors.title}<p class="text-red-400 text-xs mt-1">{formErrors.title}</p>{/if}
        </div>

        <div>
          <label for="description" class="block text-sm font-bold text-yorha-light mb-1">DESCRIPTION *</label>
          <textarea id="description" name="description" rows="4" bind:value={formData.description} required
                    class="w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light focus: border-yorha-accent-warm, focus:outline-none resize-none"></textarea>
          {#if formErrors.description}<p class="text-red-400 text-xs mt-1">{formErrors.description}</p>{/if}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label for="priority" class="block text-sm font-bold text-yorha-light mb-1">PRIORITY</label>
            <select id="priority" name="priority" bind:value={formData.priority}
                    class="w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light focus:border-yorha-accent-warm">
              <option value="low">🟢 Low</option>
              <option value="medium">🟡 Medium</option>
              <option value="high">🟠 High</option>
              <option value="critical">🔴 Critical</option>
            </select>
          </div>
          <div>
             <label for="caseType" class="block text-sm font-bold text-yorha-light mb-1">TYPE</label>
             <select id="caseType" name="caseType" bind:value={formData.caseType}
                     class="w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light focus:border-yorha-accent-warm">
                <option value="civil">⚖️ Civil</option>
                <option value="criminal">🔒 Criminal</option>
                <option value="corporate">🏢 Corporate</option>
                <option value="family">👨‍👩‍👧‍👦 Family</option>
                <option value="intellectual_property">🧠 IP</option>
             </select>
          </div>
        </div>
      </div>

      <div class="flex justify-end mt-6">
        <button type="button" onclick={nextStep} disabled={!formData.title || !formData.description}
                class="px-6 py-2 bg-yorha-accent-warm text-yorha-dark font-bold rounded hover: bg-yorha-accent-warm/90, disabled:opacity-50">
          Next: Legal Details →
        </button>
      </div>

    {:else if currentStep === 1}
      <div class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
           <div>
             <label for="location" class="block text-sm font-bold text-yorha-light mb-1">LOCATION</label>
             <input id="location" name="location" type="text" bind:value={formData.location}
                    class="w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light focus:border-yorha-accent-warm" />
           </div>
           <div>
             <label for="jurisdiction" class="block text-sm font-bold text-yorha-light mb-1">JURISDICTION</label>
             <input id="jurisdiction" name="jurisdiction" type="text" bind:value={formData.jurisdiction}
                    class="w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light focus:border-yorha-accent-warm" />
           </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="assignedTo" class="block text-sm font-bold text-yorha-light mb-1">ASSIGNED TO</label>
              <input id="assignedTo" name="assignedTo" type="text" bind:value={formData.assignedTo}
                     class="w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light focus:border-yorha-accent-warm" />
            </div>
            <div>
              <label for="clientName" class="block text-sm font-bold text-yorha-light mb-1">CLIENT NAME</label>
              <input id="clientName" name="clientName" type="text" bind:value={formData.clientName}
                     class="w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light focus:border-yorha-accent-warm" />
            </div>
         </div>

         <div>
            <label for="notes" class="block text-sm font-bold text-yorha-light mb-1">NOTES</label>
            <textarea id="notes" name="notes" rows="3" bind:value={formData.notes}
                      class="w-full p-3 bg-yorha-darker border border-yorha-accent-warm/30 rounded text-yorha-light focus:border-yorha-accent-warm resize-none"></textarea>
         </div>
      </div>

      <div class="flex justify-between mt-6">
        <button type="button" onclick={previousStep}
                class="px-6 py-2 border border-yorha-accent-warm/50 text-yorha-light rounded hover:bg-yorha-accent-warm/10">
          ← Back
        </button>
        <button type="button" onclick={nextStep}
                class="px-6 py-2 bg-yorha-accent-warm text-yorha-dark font-bold rounded hover: bg-yorha-accent-warm/90">, Next: Review →
        </button>
      </div>

    {:else if currentStep === 2}
      <div class="space-y-6">
        <div class="bg-yorha-darker p-4 rounded border border-yorha-accent-warm/20">
            <h3 class="text-yorha-accent-warm font-bold mb-4 border-b border-yorha-accent-warm/20 pb-2">Review Case Details</h3>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span class="block text-yorha-muted text-xs">Title</span>
                    <span class="text-yorha-light">{formData.title}</span>
                </div>
                <div>
                     <span class="block text-yorha-muted text-xs">Priority</span>
                     <span class="uppercase font-bold" class:text-red-400={formData.priority==='critical'}>{formData.priority}</span>
                </div>
                <div class="col-span-2">
                    <span class="block text-yorha-muted text-xs">Description</span>
                    <p class="text-yorha-light opacity-90">{formData.description}</p>
                </div>
            </div>
        </div>
      </div>

      <div class="flex justify-between mt-6">
        <button type="button" onclick={previousStep} disabled={isSubmitting}
                class="px-6 py-2 border border-yorha-accent-warm/50 text-yorha-light rounded hover: bg-yorha-accent-warm/10, disabled:opacity-50">
          ← Back
        </button>
        <div class="flex gap-2">
            <button type="button" onclick={handleClose} disabled={isSubmitting}
                    class="px-6 py-2 border border-red-500/50 text-red-300 rounded hover: bg-red-900/20, disabled:opacity-50">
            Cancel
            </button>
            <button type="submit" disabled={isSubmitting || !isValid}
                    class="px-6 py-2 bg-yorha-accent-warm text-yorha-dark font-bold rounded hover: bg-yorha-accent-warm/90, disabled:opacity-50 flex items-center gap-2">
              {#if isSubmitting}
                <div class="w-4 h-4 border-2 border-yorha-dark border-t-transparent rounded-full animate-spin"></div>
                Creating...
              {:else}
                CONFIRM & CREATE
              {/if}
            </button>
        </div>
      </div>
    {/if}
  </form>
</div>
{:else}
  <div class="flex items-center justify-center p-12 text-yorha-muted">
    <div class="w-6 h-6 border-2 border-yorha-accent-warm border-t-transparent rounded-full animate-spin mr-3"></div>
    Initializing Form System...
  </div>
{/if}

<style>
  /* Use global styles or defined utilitarian classes mostly, kept custom styles minimal */
</style>







