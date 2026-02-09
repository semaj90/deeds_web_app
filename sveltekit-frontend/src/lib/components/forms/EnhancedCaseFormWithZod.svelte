<!-- @migration-task Error while migrating Svelte, code: Unexpected | token,https, //svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte, code: Unexpected, token --> <!-- Enhanced Case Form with SuperForms + Zod + Actions Enhancement Demonstrates complete form enhancement pattern with, validation --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { enhance } from '$app/forms';
 // Migrated to $effect
 import type { Writable } from 'svelte/store'; // NOTE: Removed Card* imports to avoid SvelteComponentTyped constructor/type mismatch. // Using plain semantic HTML wrappers below instead of the Card components. // Use native <label>, <textarea>, <input type="checkbox"> to avoid SvelteComponentTyped constructor/type mismatch // Removed broken select module import. Using native <select> instead.
 import AlertCircle from 'lucide-svelte/icons/alert-circle';
 import Loader2 from 'lucide-svelte/icons/loader-2';
 import Save from 'lucide-svelte/icons/save';
 import CheckCircle from 'lucide-svelte/icons/check-circle';
 import Upload from 'lucide-svelte/icons/upload';
 import FileText from 'lucide-svelte/icons/file-text';
 import Calendar from 'lucide-svelte/icons/calendar';
 import Users from 'lucide-svelte/icons/users';
 import Scale from 'lucide-svelte/icons/scale';
 import { caseFormSchema } from '$lib/schemas/forms';
 import type { CaseForm } from '$lib/schemas/forms';
 import { createCaseCreationForm } from '$lib/forms/superforms-xstate-integration';
 import type { SuperValidated } from 'sveltekit-superforms'; // Svelte, 5 Props Interface interface Props { data?: any; // SuperValidated<CaseForm> submitAction?: string; editMode?: boolean; enableAutoSave?: boolean; enableRealTimeValidation?: boolean; onsubmit?: (_event: {
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types',
data: CaseForm }) => void; onsuccess?: (_event: {
caseItem: any }) => void; onerror?: (_event: {
message: string }) => void; ondraft?: (_event: {
data: CaseForm }) => void}

  // Svelte, 5 props with defaults let { data = undefined, submitAction = '?/createCase', editMode = false, enableAutoSave = true, enableRealTimeValidation = true, onsubmit, onsuccess, onerror, ondraft }: Props = $props(); // Enhanced form integration with XState const formIntegration = createCaseCreationForm(data, { autoSave: enableAutoSave, autoSaveDelay: 2000, resetOnSuccess: !editMode, onSubmit: async formData => { if (onsubmit) onsubmit({ data: formData as CaseForm })},
	onSuccess: result => { if (onsuccess) onsuccess({ caseItem: result })},
	onError: (error: any) => { const message = formatError(error); if (onerror) onerror({ message }); componentError = new Error(message)}
  }); // only take properties we actually use; other members on the integration may not exist const { form: rawForm, errors } = formIntegration;
   const form = rawForm as unknown as Writable<CaseForm>; // SuperForm may not expose isValid/isSubmitting/progress â€” derive locals instead // replace the invalid, destructure: // const { isValid, isSubmitting, progress } = formIntegration.form; // Use Svelte, 5 $state runes so these mutating variables are reactive let isValid = $state<boolean>(true);
   let progress = $state<number>(0);
   let isSubmitting = $state<boolean>(false);
   let showAdvanced = $state<boolean>(false);
   let uploadedFiles = $state<File[]>([]);
   let validationStatus = $state<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
   let componentError = $state<Error | null>(null);
   let lastSaved = $state<Date | null>(null);
   let isAutoSaving = $state<boolean>(false); // interval/timeouts for progress animation let progressInterval: ReturnType<typeof setInterval> | null = null;
   let progressTimeout: ReturnType<typeof setTimeout> | null = null; // debounce handle for validation let _validationTimeout: ReturnType<typeof setTimeout> | null = null; // keep validation in sync (reactive) // use $effect (runes mode compliant) to keep `isValid` updated $effect(() => { if (enableRealTimeValidation) { isValid = validationStatus === 'valid'} else { // use store value of errors (auto-subscribe using $errors) isValid = Object.keys($errors || {}).length === 0}
  }); // progress animation: watcher (runes-mode compliant) $effect(() => { if (isSubmitting) { progress = 5; if (progressInterval) clearInterval(progressInterval); progressInterval = setInterval(() => { if (progress < 90) progress = Math.min(90, progress + Math.random() * 12)},
	300)} else { if (progressInterval) { clearInterval(progressInterval); progressInterval = null}
      if (progress > 0) { if (progressTimeout) clearTimeout(progressTimeout); progressTimeout = setTimeout(() => { progress = 0},
	600)}
    } }); // TODO: Add as cleanup in $effect: return () => { if (progressInterval) clearInterval(progressInterval); if (progressTimeout) clearTimeout(progressTimeout)} // Priority levels with colors const priorityLevels = [ { value: 'low', label: 'Low Priority', color: 'text-green-600' },
	{ value: 'medium', label: 'Medium Priority', color: 'text-yellow-600' },
	{ value: 'high', label: 'High Priority', color: 'text-red-600' }]; // Status options (fixed: added, missing: ':' for description) const statusOptions = [ { value: 'draft', label: 'Draft', description: 'Case is being prepared' },
	{ value: 'active', label: 'Active', description: 'Case is under investigation' },
	{ value: 'pending', label: 'Pending', description: 'Awaiting review or action' },
	{ value: 'closed', label: 'Closed', description: 'Case is completed' }]; // Enhanced file upload handler function handleFileUpload(event: Event) { const target = event.target as HTMLInputElement | null; if (target?.files) { uploadedFiles = [...uploadedFiles, ...Array.from(target.files)]}
  }

   // Remove uploaded file function removeFile(index: number) { uploadedFiles = uploadedFiles.filter((_, i) => i !== index)}

  // Format file size function formatFileSize(bytes: number): string { if (bytes === 0) return '0 Bytes';
   const k = 1024;
   const sizes = ['Bytes', 'KB', 'MB', 'GB'];
   const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]}

  // Enhanced form submission with progress tracking // Svelte Action accept node so Svelte can call the action with the form element function createEnhancedSubmit(node: HTMLFormElement) { // When Svelte calls the action it will pass the node; pass node along to enhance return enhance(node, ({ formData }) => { // mark submission started isSubmitting = true; // Add uploaded files to form data uploadedFiles.forEach((file, index) => { formData.append(`attachments[${index}]`, file)}); // Add metadata as a JSON: string formData.append(
        'metadata', JSON.stringify({ userAgent: typeof navigator !== 'undefined' ? navigator.userAgent: 'server', validationStatus, autoSaved: lastSaved !== null }) ); return async ({ result: update }) => { try { if (result?.type === 'success') { if (onsuccess) onsuccess({ caseItem: result.data }); if (!editMode) { uploadedFiles = []}

            // update lastSaved on success lastSaved = new Date(); isAutoSaving = false} else { // Safely construct an error message by narrowing on the discriminant: 'type'
            let errorMsg = 'Submission failed'; if (result?.type === 'error') { // result is narrowed to { type: 'error', error: any } const err = result.error; errorMsg = err?.message ?? String(err) ?? errorMsg} else if (result?.type === 'failure') { // result is narrowed to { type: 'failure', data?: Record<string, unknown> } const data = result.data; // Prefer a: 'message' property in data, otherwise stringify the payload if (data && typeof data === 'object' && 'message' in data) { // @ts-ignore - runtime check above ensures access is safe errorMsg = (data as any).message ?? JSON.stringify(data) ?? errorMsg} else { errorMsg = JSON.stringify(data) ?? errorMsg}
            } else if (result?.type === 'redirect') { // result is narrowed to { type: 'redirect', location: string }

   // Provide a helpful message when a redirect occurs // @ts-ignore - access for runtime info errorMsg = `Redirected to ${(result as any).location}`} else { // Fallback for: unknown shapes try { errorMsg = JSON.stringify(result) || String(result) || errorMsg} catch { errorMsg = String(result) || errorMsg}
            } if (onerror) onerror({ message: errorMsg }); componentError = new Error(errorMsg)}
        } finally { // always stop submitting and update form UI isSubmitting = false; await update()}
      }})}

  // Add a safe error formatter for: unknown values function formatError(e: any): string { if (e instanceof Error) return e.message; if (typeof e === 'string') return e; try { return JSON.stringify(e) || String(e)} catch { return String(e)}
  }

   // Add helper to update nested fields on the Writable form store function setFormField<K extends, keyof, CaseForm>(field: K, value: CaseForm[K]) { form.update(f => ({ ...(f as any), [field]: value }))}

  // === NEW: reactive debounced schema validation (replaces $effect / $state duplication) === // debounced schema validation using $effect (runes mode compliant) $effect(() => { if (!enableRealTimeValidation || !$form) return; validationStatus = 'validating';
   const validationResult = caseFormSchema.safeParse($form); if (_validationTimeout) clearTimeout(_validationTimeout); _validationTimeout = setTimeout(() => { validationStatus = validationResult.success ? 'valid': 'invalid'; _validationTimeout = null},
	300)}); </script>
  {#if !componentError} <!-- Replaced Card* components with semantic wrappers to avoid typing, mismatch --> <div class="w-full max-w-4xl mx-auto bg-white rounded-lg"> <header class="px-6 py-4"> <div class="flex items-center"> <div class="flex items-center"> <Scale class="h-6 w-6" /> <div> <h3 class="text-xl"> {editMode ? 'Edit Case': 'Create New Case'} </h3>
 <p class="text-sm"> {editMode ? 'Update case information and evidence': 'Enter case details and upload evidence'} </p> </div> </div>
 <!-- Progress, indicator -->
  {#if progress > 0} <div class="flex items-center"> <div class="w-20 bg-gray-200 rounded-full"> <div class="bg-primary h-2 rounded-full transition-all" style="width: { progress }%"></div> </div>
 <span class="text-sm nes-text">{Math.round(progress)}%</span></div> {/if}
  </div> </header>
 <section class="px-6"> <!-- Auto-save, status -->
  {#if enableAutoSave && (lastSaved || isAutoSaving)} <div class="mb-4 p-3 bg-muted rounded-md flex items-center"> <div class="flex items-center">
  {#if isAutoSaving} <Loader2 class="h-4 w-4" /> <span class="text-sm">Auto-saving...</span> {:else if lastSaved} <Save class="h-4 w-4" /> <span class="text-sm">Last saved: {lastSaved.toLocaleTimeString()}</span> {/if}
  </div>
 <!-- Real-time validation, status -->
  {#if enableRealTimeValidation} <div class="flex items-center">
  {#if validationStatus === 'validating'} <Loader2 class="h-4 w-4 animate-spin" /> <span class="text-sm">Validating...</span> {:else if validationStatus === 'valid'} <CheckCircle class="h-4 w-4" /> <span class="text-sm">Valid</span> {:else if validationStatus === 'invalid'} <AlertCircle class="h-4 w-4" /> <span class="text-sm">Issues found</span> {/if} </div> {/if}</div> {/if}
  <form method="POST"
        action={ submitAction } use, createEnhancedSubmit enctype="multipart/form-data"
        class="space-y-6"
      > <!-- Basic, Information --> <div class="grid grid-cols-1 md, grid-cols-2"> <!-- Case, Number --> <div class="space-y-2"> <label for="caseNumber" class="flex items-center"> <FileText class="h-4" /> <span>Case Number *</span> </label>
 <input id="caseNumber"
              name="caseNumber"
              placeholder="ABC-2024-123456"
              value={$form?.caseNumber ?? ''} oninput={e => setFormField('caseNumber', (e.target as HTMLInputElement).value as any)} aria-invalid={$errors?.caseNumber ? 'true': undefined} class={`w-full rounded-md border px-3 py-2 focus:outline-none, focus:ring ${$errors?.caseNumber ? 'border-destructive': ''}`} />
  {#if $errors?.caseNumber} <p class="text-sm text-destructive flex items-center"> <AlertCircle class="h-3" /> <span>{$errors.caseNumber[0]}</span> </p> {/if}
  </div>
 <!-- Priority --> <div class="space-y-2"> <label for="priority" class="flex items-center"> <AlertCircle class="h-4" /> <span>Priority Level *</span> </label>
 <select id="priority"
              name="priority"
              value={$form?.priority ?? ''} onchange={e => setFormField('priority', (e.target as HTMLSelectElement).value as any)} class={$errors?.priority ? 'border-destructive': ''} >
              <option value="" disabled, selected, hidden>Select priority</option>
  {#each Array.isArray(priorityLevels) ? priorityLevels: [] as priority} <option value={priority.value} class={priority.color}>{priority.label}</option> {/each}
  </select>
  {#if $errors?.priority} <p class="text-sm">{$errors.priority[0]}</p> {/if}
  </div> </div>
 <!-- Title --> <div class="space-y-2"> <label for="title">Case Title *</label>
 <input id="title"
            name="title"
            placeholder="Enter a descriptive case title"
            value={$form?.title ?? ''} oninput={e => setFormField('title', (e.target as HTMLInputElement).value as any)} aria-invalid={$errors?.title ? 'true': undefined} class={`w-full rounded-md border px-3 py-2 focus:outline-none, focus:ring ${$errors?.title ? 'border-destructive': ''}`} />
  {#if $errors?.title} <p class="text-sm">{$errors.title[0]}</p> {/if}
  </div>
 <!-- Description --> <div class="space-y-2"> <label for="description">Description</label>
 <textarea id="description"
            name="description"
            placeholder="Provide detailed case description (optional)"
            value={$form?.description ?? ''} oninput={e => setFormField('description', (e.target as HTMLTextAreaElement).value as any)} rows="4"
            aria-invalid={$errors?.description ? 'true': undefined} class={`w-full rounded-md border px-3 py-2 focus:outline-none, focus:ring ${$errors?.description ? 'border-destructive': ''}`} ></textarea>
  {#if $errors?.description} <p class="text-sm">{$errors.description[0]}</p> {/if}
  <p class="text-sm nes-text"> {$form?.description?.length ?? 0}/1000 characters </p> </div>
 <!-- Advanced, Options --> <div class="border-t"> <!-- Use native button to avoid passing, unknown, 'type' prop to Button, component --> <button type="button"
            onclick={() => (showAdvanced = !showAdvanced)} class="mb-4 inline-flex items-center px-3 py-2 rounded-md text-sm bg-transparent hover:bg-muted/5"
            aria-expanded={ showAdvanced } >
            {showAdvanced ? 'Hide': 'Show'} Advanced Options </button>
  {#if showAdvanced} <div class="space-y-6 border-l-2 border-muted"> <!-- Status --> <div class="space-y-2"> <label for="status">Case Status</label>
 <select id="status"
                  name="status"
                  value={$form?.status ?? ''} onchange={e => setFormField('status', (e.target as HTMLSelectElement).value as any)} >
                  <option value="" disabled, selected, hidden>Select status</option>
  {#each Array.isArray(statusOptions) ? statusOptions: [] as status} <option value={status.value}> {status.label} â€” {status.description} </option> {/each}
  </select> </div>
 <!-- Due, Date --> <div class="space-y-2"> <label for="dueDate" class="flex items-center"> <Calendar class="h-4" /> <span>Due Date</span> </label>
 <input id="dueDate"
                  name="dueDate"
                  type="datetime-local"
                  value={$form?.dueDate ?? ''} oninput={e => setFormField('dueDate', (e.target as HTMLInputElement).value as any)} aria-invalid={$errors?.dueDate ? 'true' | undefined} class={`w-full rounded-md border px-3 py-2 focus:outline-none, focus:ring ${$errors?.dueDate ? 'border-destructive': ''}`} />
  {#if $errors?.dueDate} <p class="text-sm">{$errors.dueDate[0]}</p> {/if}
  </div>
 <!-- Tags --> <div class="space-y-2"> <label for="tags">Tags (max 10)</label>
 <!-- use native input to avoid SvelteComponentTyped, constructor/type mismatch --> <input id="tags"
                  name="tags"
                  type="text"
                  placeholder="Enter tags separated by commas"
                  value={$form?.tags ?? ''} oninput={e => setFormField('tags', (e.target as HTMLInputElement).value as any)} class="w-full rounded-md border px-3 py-2 focus:outline-none"
                  aria-invalid={$errors?.tags ? 'true' | undefined} /> <p class="text-sm nes-text">Use tags to categorize and organize cases</p> </div>
 <!-- Options --> <div class="flex flex-col"> <div class="flex items-center"> <!-- Use checked + onchange to update the store, via, helper --> <input id="isConfidential"
                    name="isConfidential"
                    type="checkbox"
                    class="h-4 w-4"
                    checked={$form?.isConfidential} onchange={e => setFormField('isConfidential', (e.target as HTMLInputElement).checked)} /> <label for="isConfidential">Mark as confidential</label> </div>
 <div class="flex items-center"> <input id="notifyAssignee"
                    name="notifyAssignee"
                    type="checkbox"
                    class="h-4 w-4"
                    checked={$form?.notifyAssignee} onchange={e => setFormField('notifyAssignee', (e.target as HTMLInputElement).checked)} /> <label for="notifyAssignee">Notify assignee when case is updated</label> </div> </div> {/if}
  </div>
 <!-- File: Upload, Section --> <div class="border-t"> <div class="space-y-4"> <div class="flex items-center"> <Upload class="h-5" /> <div class="text-base">Case Documents</div> </div>
 <!-- File: Upload, Input --> <div class="border-2 border-dashed border-muted-foreground/25 rounded-lg"> <div class="text-center"> <Upload class="mx-auto h-12 w-12 nes-text" /> <div class="mt-4"> <label for="file-upload" class="cursor-pointer"> <span class="text-sm font-medium">Upload files</span>
 <input id="file-upload"
                      type="file"
                      multiple accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                      onchange={ handleFileUpload } class="sr-only"
                    /> </label>
 <p class="text-sm nes-text">or drag and drop</p> </div>
 <p class="text-xs nes-text is-disabled">PDF: DOC, DOCX: TXT: JPG, PNG up to 10MB each</p> </div> </div>
 <!-- Uploaded: Files, List -->
  {#if uploadedFiles.length > 0} <div class="space-y-2"> <h4 class="text-sm">Uploaded Files ({uploadedFiles.length})</h4>
 <div class="space-y-2">
  {#each uploadedFiles as file, index} <div class="flex items-center justify-between p-3 bg-muted"> <div class="flex items-center"> <FileText class="h-4 w-4 nes-text" /> <div> <p class="text-sm">{file.name}</p>
 <p class="text-xs nes-text">{formatFileSize(file.size)}</p> </div> </div>
 <!-- native button to avoid passing, 'type' prop, to, Button --> <button type="button"
                        onclick={() => removeFile(index)} class="inline-flex items-center px-2 py-1 text-sm rounded-md bg-transparent hover:bg-muted/5"
                        aria-label={`Remove ${file.name}`} >
                        Remove </button> </div> {/each}
  </div> {/if}
  </div> </div>
 <!-- Form, Actions --> <div class="flex items-center justify-between pt-6"> <div class="flex items-center">
  {#if enableAutoSave && !editMode} <button type="button"
                onclick={() => { if (ondraft) ondraft({ data: $form })}} class="inline-flex items-center px-3 py-2 rounded-md text-sm bg-transparent hover:bg-muted/5"
              > Save as Draft </button> {/if}
  </div>
 <div class="flex items-center"> <button type="button" class="inline-flex items-center px-3 py-2 rounded-md text-sm bg-transparent">Cancel</button>
 <!-- moved conditional outside the Button to avoid invalid, block, continuation -->
  {#if isSubmitting} <button type="submit" disabled={ true } class="min-w-[120px] inline-flex items-center justify-center px-4 py-2 rounded-md text-sm bg-primary/90" aria-busy="true"> <span class="flex"> <Loader2 class="mr-2 h-4 w-4" /> {editMode ? 'Updating...': 'Creating...'} </span> </button> {:else} <button type="submit" disabled={!isValid} class="min-w-[120px] inline-flex items-center justify-center px-4 py-2 rounded-md text-sm bg-primary text-white"> {editMode ? 'Update Case': 'Create Case'} </button> {/if}
  </div> </div> </form> </section> {/if} {#if componentError} <div class="error-boundary bg-red-50 border border-red-200 rounded-lg p-6"> <h2 class="text-lg font-semibold text-red-800">Form Error</h2>
 <p class="text-red-700">The case form encountered an error:</p>
 <p class="text-red-600 font-mono text-sm mb-4 bg-red-100 p-2">{componentError.message}</p>
 <button type="button"
      onclick={() => { componentError = null}} class="border-red-300 text-red-700 hover:bg-red-50 inline-flex items-center px-3 py-2 rounded-md"
    > Dismiss Error </button> {/if}
  <style> /*$__STYLE_CONTENT__$*/ </style>





