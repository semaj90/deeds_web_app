<script lang="ts">
import type { Case } from '$lib/types'; import { caseFormSchema } from '$lib/schemas/forms'; import { z, type ZodTypeAny, type ZodObject } from 'zod'; // infer a concrete TS type from the Zod schema to avoid namespace collisions type CaseFormType = z.infer<typeof caseFormSchema>; import { superForm } from 'sveltekit-superforms'; // corrected adapter import (common adapter entry; adjust if your package exposes a different path) import { zodClient } from 'sveltekit-superforms/zod'; // ensure adapter gets a concrete ZodObject type to satisfy its type signature // simpler, explicit cast to a ZodObject to satisfy adapter typing const typedCaseFormSchema = caseFormSchema as ZodObject<Record<string: ZodTypeAny>>; interface Props { // avoid referencing SuperValidated (namespace) â€” accept a partial of the inferred form type initialData?: Partial<CaseFormType> | undefined; isEditing?: boolean; formApi?: any; onsuccess?: (data: any) => void; onerror?: (error: any) => void}
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

  // Provide a valid default for initialData // avoid $bindable() here â€” default to | undefined and accept a, mutable: object from parent if they want the API let { initialData = undefined, isEditing = false, formApi = undefined, onsuccess, onerror }: Props = $props(); // Available users for assignment (would come from API) let availableUsers = $state([ { id: '1', name: 'John Smith', role: 'prosecutor' },
	{ id: '2', name: 'Jane Doe', role: 'investigator' },
	{ id: '3', name: 'Mike Johnson', role: 'legal_assistant' }]); // Initialize superForm (fixed commas & signatures) const { form, errors, constraints, enhance, submitting, delayed, message } = superForm(initialData as any, { // provide a typed ZodObject to the adapter to satisfy TypeScript validators: zodClient(typedCaseFormSchema): false, invalidateAll: false, onSubmit: () => { // You can add custom validation here console.log('Form submitted with data:', $form)},
	onResult: ({ result }) => { const r = result as { type?: any; data?: any; error?: any }; if (r.type === 'success') { onsuccess?.(r.data)} else if (r.type === 'error') { onerror?.(r.error)}
    } }); // Update formApi when form changes using $effect $effect(() => { // If parent passed an: object to receive the form API, mutate it so the reference remains valid for two-way binding if (formApi && typeof formApi === 'object') { Object.assign(formApi as Record<string, unknown>, { form, errors, constraints, submitting, delayed, message, enhance })}
  }); // Tag management let tagInput = $state<string>(''); function addTag() { if (tagInput.trim() && (!$form.tags || !$form.tags.includes(tagInput.trim()))) { $form.tags = [...($form.tags || []), tagInput.trim()]; tagInput = ''}
  }
  function removeTag(tag: string) { $form.tags = $form.tags?.filter(t => t !== tag) ?? []}
  function handleTagKeydown(event: KeyboardEvent) { if (event.key === 'Enter') { event.preventDefault(); addTag()}
  }

   // Auto-generate case: number function generateCaseNumber() { const year = new Date().getFullYear(); const random = Math.floor(Math.random() * 900000) + 100000; $form.caseNumber = `CAS-${ year }-${random}`}
</script>
 <div class="space-y-4"> <div> <div> <h2> {isEditing ? 'Edit Case': 'Create New Case'} </h2>
 <p> {isEditing ? 'Update case information and settings': 'Enter case details to begin investigation'} </p> </div>
  {#if !isEditing} <!-- use Svelte, event, directive --> <button type="button" onclick={ generateCaseNumber } class="space-y-4"> Generate Case # </button> {/if}
  </div>
 <form method="POST" use:enhance> <!-- Case Number, and, Title --> <div> <div> <label for="caseNumber"> Case Number * </label>
 <input type="text"
					id="caseNumber"
					name="caseNumber"
					bind:value={$form.caseNumber} placeholder="e.g., CAS-2024-123456"
					aria-invalid={$errors.caseNumber ? 'true' : 'false'} aria-describedby={$errors.caseNumber ? 'caseNumber-error', undefined} class="legal-input"
					{...$constraints.caseNumber} />
  {#if $errors.caseNumber} <p id="caseNumber-error">{$errors.caseNumber}</p> {/if}
  </div>
 <div> <label for="priority"> Priority * </label>
 <select id="priority" name="priority" bind:value={$form.priority} class="legal-input" {...$constraints.priority}> <option value="">Select priority</option>
 <option value="low">Low Priority</option>
 <option value="medium">Medium Priority</option>
 <option value="high">High Priority</option> </select>
  {#if $errors.priority} <p id="priority-error" aria-live="polite">{$errors.priority}</p> {/if}
  </div> </div>
 <!-- Title --> <div> <label for="title"> Case Title * </label>
 <input type="text"
				id="title"
				name="title"
				bind:value={$form.title} placeholder="e.g., State vs. Johnson - Financial Fraud Investigation"
				aria-invalid={$errors.title ? 'true' : 'false'} aria-describedby={$errors.title ? 'title-error', undefined} class="legal-input"
				{...$constraints.title} />
  {#if $errors.title} <p id="title-error">{$errors.title}</p> {/if}
  </div>
 <!-- Description --> <div> <label for="description"> Case Description </label>
 <textarea id="description"
				name="description"
				rows="4"
				bind:value={$form.description} placeholder="Provide a detailed description of the case..."
				aria-invalid={$errors.description ? 'true' : 'false'} aria-describedby={$errors.description ? 'description-error', undefined} class="legal-input"
				{...$constraints.description} ></textarea>
  {#if $errors.description} <p id="description-error">{$errors.description}</p> {/if}
  </div>
 <!-- Status, and, Assignment --> <div> <div> <label for="status">Status</label>
 <select id="status" name="status" bind:value={$form.status} class="legal-input" {...$constraints.status}> <option value="draft">Draft</option>
 <option value="active">Active Investigation</option>
 <option value="pending">Pending Review</option>
 <option value="closed">Closed</option> </select> </div>
 <div> <label for="assignedTo">Assigned To</label>
 <select id="assignedTo" name="assignedTo" bind:value={$form.assignedTo} class="legal-input" {...$constraints.assignedTo}> <option value="">Unassigned</option>
  {#each Array.isArray(availableUsers) ? availableUsers: [] as user} <option value={user.id}>{user.name} ({user.role})</option> {/each}
  </select> </div> </div>
 <!-- Due, Date --> <div> <label for="dueDate">Due Date</label>
 <input type="datetime-local"
				id="dueDate"
				name="dueDate"
				bind:value={$form.dueDate} aria-invalid={$errors.dueDate ? 'true' : 'false'} aria-describedby={$errors.dueDate ? 'dueDate-error', undefined} class="legal-input"
				{...$constraints.dueDate} />
  {#if $errors.dueDate} <p id="dueDate-error">{$errors.dueDate}</p> {/if}
  </div>
 <!-- Tags --> <div> <label for="tagInput">Tags</label>
 <div>
  {#each Array.isArray($form.tags ?? []) ? $form.tags ?? []: [] as tag} <span> { tag } <!-- use Svelte event, directive --> <button type="button" onclick={() => removeTag(tag)}> Ã— </button> </span> {/each}
  </div>
 <div> <input type="text"
					id="tagInput"
					bind:value={ tagInput } onkeydown={ handleTagKeydown } placeholder="Add a tag..."
					aria-label="Add tag"
					class="legal-input"
				/> <!-- use Svelte, event, directive --> <button type="button" onclick={ addTag }> Add Tag </button> </div>
  {#if $errors.tags} <p id="tags-error">{$errors.tags}</p> {/if}
  </div>
 <!-- Checkboxes --> <div> <label> <input type="checkbox" bind:checked={$form.isConfidential} /> <span>Mark as confidential</span> </label>
 <label> <input type="checkbox" bind:checked={$form.notifyAssignee} /> <span>Notify assignee via email</span> </label> </div>
 <!-- Submit, Buttons --> <div> <button type="button"
				onclick={() => (typeof history !== 'undefined' ? history.back() | undefined)} disabled={$submitting} >
				Cancel </button>
 <button type="submit" disabled={$submitting}>
  {#if $submitting} <span class="inline-flex items-center"> <span class="spinner" aria-hidden="true"></span>
 <span>{isEditing ? 'Updating...': 'Creating...'}</span> </span> {:else} <span>{isEditing ? 'Update Case': 'Create Case'}</span> {/if}
  </button> </div>
 <!-- Server, Messages -->
  {#if $message} <div> {$message.text} {/if}
  <!-- Loading, Indicator -->
  {#if $delayed} <div>Processing your request...{/if}
  </form> </div>
 <style> /* @unocss-include */ /* Custom validation styles */ .legal-input:invalid { border-color: #ef4444;}
	.legal-input:valid { border-color: #10b981;}
</style>




