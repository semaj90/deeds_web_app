<!-- Case Form Component - Svelte 5 + Superforms v2 -->
<script lang="ts">
  import type { Case } from '$lib/types';
  import { caseFormSchema } from '$lib/schemas/forms';
  import { z } from 'zod';
  import superForm from 'sveltekit-superforms';
  import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';

  // Infer form type from schema
  type CaseFormType = z.infer<typeof caseFormSchema>;

  interface Props {
    initialData?: Partial<CaseFormType>;
    isEditing?: boolean;
    formApi?: any;
    onsuccess?: (data: any) => void;
    onerror?: (error: any) => void;
  }

  let {
    initialData = undefined,
    isEditing = false,
    formApi = undefined,
    onsuccess,
    onerror
  }: Props = $props();

  // Available users for assignment
  let availableUsers = $state([
    { id: '1', name: 'John Smith', role: 'prosecutor' },
    { id: '2', name: 'Jane Doe', role: 'investigator' },
    { id: '3', name: 'Mike Johnson', role: 'legal_assistant' }
  ]);

  // Initialize superForm with Zod validation
  const { form, errors, constraints, enhance, submitting, delayed, message } = superForm(
    initialData as any,
    {
      validators: zodClient(caseFormSchema),
      resetForm: false,
      invalidateAll: false,
      onSubmit: () => {
        console.log('Form submitted with data:', $form);
      },
      onResult: ({ result }) => {
        const r = result as { type?: string; data?: any; error?: any };
        if (r.type === 'success') {
          onsuccess?.(r.data);
        } else if (r.type === 'error') {
          onerror?.(r.error);
        }
      }
    }
  );

  // Update formApi when form changes
  $effect(() => {
    if (formApi && typeof formApi === 'object') {
      Object.assign(formApi as Record<string, unknown>, {
        form,
        errors,
        constraints,
        submitting,
        delayed,
        message,
        enhance
      });
    }
  });

  // Tag management
  let tagInput = $state('');

  function addTag() {
    if (tagInput.trim() && (!$form.tags || !$form.tags.includes(tagInput.trim()))) {
      $form.tags = [...($form.tags || []), tagInput.trim()];
      tagInput = '';
    }
  }

  function removeTag(tag: string) {
    $form.tags = $form.tags?.filter((t: string) => t !== tag) ?? [];
  }

  function handleTagKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addTag();
    }
  }

  // Auto-generate case number
  function generateCaseNumber() {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 900000) + 100000;
    $form.caseNumber = `CAS-${year}-${random}`;
  }

  function handleCancel() {
    if (typeof history !== 'undefined') {
      history.back();
    }
  }
</script>

<div class="case-form-container">
  <div class="form-header">
    <div>
      <h2 class="form-title">
        {isEditing ? 'Edit Case' : 'Create New Case'}
      </h2>
      <p class="form-subtitle">
        {isEditing ? 'Update case information and settings' : 'Enter case details to begin investigation'}
      </p>
    </div>

    {#if !isEditing}
      <button type="button" onclick={generateCaseNumber} class="generate-btn">
        Generate Case #
      </button>
    {/if}
  </div>

  <form method="POST" use:enhance class="form-grid">
    <!-- Case Number and Priority -->
    <div class="form-row two-cols">
      <div class="form-group">
        <label for="caseNumber">Case Number *</label>
        <input
          type="text"
          id="caseNumber"
          name="caseNumber"
          bind:value={$form.caseNumber}
          placeholder="e.g., CAS-2024-123456"
          aria-invalid={$errors.caseNumber ? 'true' : 'false'}
          aria-describedby={$errors.caseNumber ? 'caseNumber-error' : undefined}
          class="legal-input"
          {...$constraints.caseNumber}
        />
        {#if $errors.caseNumber}
          <p id="caseNumber-error" class="error-message">{$errors.caseNumber}</p>
        {/if}
      </div>

      <div class="form-group">
        <label for="priority">Priority *</label>
        <select
          id="priority"
          name="priority"
          bind:value={$form.priority}
          class="legal-input"
          {...$constraints.priority}
        >
          <option value="">Select priority</option>
          <option value="low">Low Priority</option>
          <option value="medium">Medium Priority</option>
          <option value="high">High Priority</option>
        </select>
        {#if $errors.priority}
          <p id="priority-error" class="error-message" aria-live="polite">{$errors.priority}</p>
        {/if}
      </div>
    </div>

    <!-- Title -->
    <div class="form-group">
      <label for="title">Case Title *</label>
      <input
        type="text"
        id="title"
        name="title"
        bind:value={$form.title}
        placeholder="e.g., State vs. Johnson - Financial Fraud Investigation"
        aria-invalid={$errors.title ? 'true' : 'false'}
        aria-describedby={$errors.title ? 'title-error' : undefined}
        class="legal-input"
        {...$constraints.title}
      />
      {#if $errors.title}
        <p id="title-error" class="error-message">{$errors.title}</p>
      {/if}
    </div>

    <!-- Description -->
    <div class="form-group">
      <label for="description">Case Description</label>
      <textarea
        id="description"
        name="description"
        rows="4"
        bind:value={$form.description}
        placeholder="Provide a detailed description of the case..."
        aria-invalid={$errors.description ? 'true' : 'false'}
        aria-describedby={$errors.description ? 'description-error' : undefined}
        class="legal-input"
        {...$constraints.description}
      ></textarea>
      {#if $errors.description}
        <p id="description-error" class="error-message">{$errors.description}</p>
      {/if}
    </div>

    <!-- Status and Assignment -->
    <div class="form-row two-cols">
      <div class="form-group">
        <label for="status">Status</label>
        <select
          id="status"
          name="status"
          bind:value={$form.status}
          class="legal-input"
          {...$constraints.status}
        >
          <option value="draft">Draft</option>
          <option value="active">Active Investigation</option>
          <option value="pending">Pending Review</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div class="form-group">
        <label for="assignedTo">Assigned To</label>
        <select
          id="assignedTo"
          name="assignedTo"
          bind:value={$form.assignedTo}
          class="legal-input"
          {...$constraints.assignedTo}
        >
          <option value="">Unassigned</option>
          {#each availableUsers as user}
            <option value={user.id}>{user.name} ({user.role})</option>
          {/each}
        </select>
      </div>
    </div>

    <!-- Due Date -->
    <div class="form-group">
      <label for="dueDate">Due Date</label>
      <input
        type="datetime-local"
        id="dueDate"
        name="dueDate"
        bind:value={$form.dueDate}
        aria-invalid={$errors.dueDate ? 'true' : 'false'}
        aria-describedby={$errors.dueDate ? 'dueDate-error' : undefined}
        class="legal-input"
        {...$constraints.dueDate}
      />
      {#if $errors.dueDate}
        <p id="dueDate-error" class="error-message">{$errors.dueDate}</p>
      {/if}
    </div>

    <!-- Tags -->
    <div class="form-group">
      <label for="tagInput">Tags</label>
      <div class="tags-container">
        {#each $form.tags ?? [] as tag}
          <span class="tag">
            {tag}
            <button type="button" onclick={() => removeTag(tag)} class="tag-remove">
              ×
            </button>
          </span>
        {/each}
      </div>
      <div class="tag-input-row">
        <input
          type="text"
          id="tagInput"
          bind:value={tagInput}
          onkeydown={handleTagKeydown}
          placeholder="Add a tag..."
          aria-label="Add tag"
          class="legal-input"
        />
        <button type="button" onclick={addTag} class="add-tag-btn">
          Add Tag
        </button>
      </div>
      {#if $errors.tags}
        <p id="tags-error" class="error-message">{$errors.tags}</p>
      {/if}
    </div>

    <!-- Checkboxes -->
    <div class="checkbox-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={$form.isConfidential} />
        <span>Mark as confidential</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={$form.notifyAssignee} />
        <span>Notify assignee via email</span>
      </label>
    </div>

    <!-- Submit Buttons -->
    <div class="form-actions">
      <button type="button" onclick={handleCancel} disabled={$submitting} class="btn-secondary">
        Cancel
      </button>
      <button type="submit" disabled={$submitting} class="btn-primary">
        {#if $submitting}
          <span class="spinner"></span>
          <span>{isEditing ? 'Updating...' : 'Creating...'}</span>
        {:else}
          <span>{isEditing ? 'Update Case' : 'Create Case'}</span>
        {/if}
      </button>
    </div>

    <!-- Server Messages -->
    {#if $message}
      <div class="server-message">
        {$message.text || $message}
      </div>
    {/if}

    <!-- Loading Indicator -->
    {#if $delayed}
      <div class="loading-indicator">Processing your request...</div>
    {/if}
  </form>
</div>

<style>
  /* @unocss-include */
  .case-form-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem;
    background: var(--bg-secondary, #1a1a2e);
    border: 1px solid var(--border-color, #333);
    border-radius: 0.5rem;
  }

  .form-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border-color, #333);
  }

  .form-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary, #fff);
    margin: 0 0 0.25rem;
  }

  .form-subtitle {
    color: var(--text-muted, #888);
    font-size: 0.875rem;
    margin: 0;
  }

  .generate-btn {
    padding: 0.5rem 1rem;
    background: var(--accent-primary, #00d4ff);
    color: #000;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    font-weight: 500;
  }

  .form-grid {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-row {
    display: grid;
    gap: 1rem;
  }

  .form-row.two-cols {
    grid-template-columns: repeat(2, 1fr);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .form-group label {
    font-weight: 500;
    color: var(--text-primary, #fff);
    font-size: 0.875rem;
  }

  .legal-input {
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: var(--bg-primary, #0f0f1a);
    border: 1px solid var(--border-color, #333);
    border-radius: 0.375rem;
    color: var(--text-primary, #fff);
    font-size: 0.875rem;
    transition: border-color 0.2s;
  }

  .legal-input:focus {
    outline: none;
    border-color: var(--accent-primary, #00d4ff);
  }

  .legal-input:invalid {
    border-color: #ef4444;
  }

  .legal-input:valid {
    border-color: #10b981;
  }

  .error-message {
    color: #ef4444;
    font-size: 0.75rem;
    margin: 0;
  }

  .tags-container {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: var(--accent-primary, #00d4ff);
    color: #000;
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }

  .tag-remove {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0;
    font-size: 1rem;
    line-height: 1;
  }

  .tag-input-row {
    display: flex;
    gap: 0.5rem;
  }

  .add-tag-btn {
    padding: 0.5rem 1rem;
    background: var(--bg-tertiary, #2a2a3e);
    color: var(--text-primary, #fff);
    border: 1px solid var(--border-color, #333);
    border-radius: 0.375rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    color: var(--text-primary, #fff);
    font-size: 0.875rem;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color, #333);
  }

  .btn-secondary {
    padding: 0.625rem 1.25rem;
    background: var(--bg-tertiary, #2a2a3e);
    color: var(--text-primary, #fff);
    border: 1px solid var(--border-color, #333);
    border-radius: 0.375rem;
    cursor: pointer;
    font-weight: 500;
  }

  .btn-primary {
    padding: 0.625rem 1.25rem;
    background: var(--accent-primary, #00d4ff);
    color: #000;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-primary:disabled,
  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid transparent;
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .server-message {
    padding: 0.75rem;
    background: var(--bg-tertiary, #2a2a3e);
    border: 1px solid var(--border-color, #333);
    border-radius: 0.375rem;
    color: var(--text-primary, #fff);
    text-align: center;
  }

  .loading-indicator {
    text-align: center;
    color: var(--text-muted, #888);
    font-size: 0.875rem;
  }

  @media (max-width: 640px) {
    .form-row.two-cols {
      grid-template-columns: 1fr;
    }
  }
</style>
